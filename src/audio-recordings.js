import reedMusic from './audio-assets/music/reed.mp3';
import lakeMusic from './audio-assets/music/lake.mp3';
import seaMusic from './audio-assets/music/sea.mp3';
import mountainMusic from './audio-assets/music/mountain.mp3';
import heavenMusic from './audio-assets/music/heaven.mp3';
import danger from './audio-assets/music/danger.mp3';
import reedAmbience from './audio-assets/ambience/reed.mp3';
import lakeAmbience from './audio-assets/ambience/lake.mp3';
import seaAmbience from './audio-assets/ambience/sea.mp3';
import mountainAmbience from './audio-assets/ambience/mountain.mp3';
import heavenAmbience from './audio-assets/ambience/heaven.mp3';
import swallow1 from './audio-assets/foley/swallow-1.mp3';
import swallow2 from './audio-assets/foley/swallow-2.mp3';
import bite from './audio-assets/foley/bite.mp3';
import waterDash from './audio-assets/foley/water-dash.mp3';
import waterHit from './audio-assets/foley/water-hit.mp3';
import wing from './audio-assets/foley/wing.mp3';
import injury from './audio-assets/foley/injury.mp3';
import impact from './audio-assets/foley/impact.mp3';
import armorBreak from './audio-assets/foley/armor-break.mp3';
import thunder from './audio-assets/foley/thunder.mp3';
import ritual from './audio-assets/foley/ritual.mp3';

const music = [reedMusic, lakeMusic, seaMusic, mountainMusic, heavenMusic];
const ambience = [reedAmbience, lakeAmbience, seaAmbience, mountainAmbience, heavenAmbience];
const foley = {swallow1, swallow2, bite, waterDash, waterHit, wing, injury, impact, armorBreak, thunder, ritual};

class ChapterLoop {
  constructor(context, destination) {
    this.context = context;
    this.destination = destination;
    this.url = null;
  }

  fadeOut(now, fade) {
    if (!this.source) return;
    const current = Math.min(1, (now - this.startedAt) / this.fade);
    this.level.gain.cancelScheduledValues(now);
    this.level.gain.setValueAtTime(current, now);
    this.level.gain.linearRampToValueAtTime(0, now + fade);
    this.source.stop(now + fade + .03);
    this.source = this.level = this.url = null;
  }

  change(url, buffer, fade) {
    if (this.url === url) return;
    const now = this.context.currentTime;
    this.fadeOut(now, fade);
    if (!buffer) return;
    this.url = url;
    const source = this.source = this.context.createBufferSource();
    const level = this.level = this.context.createGain();
    this.startedAt = now;
    this.fade = fade;
    source.buffer = buffer;
    source.loop = true;
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(1, now + fade);
    source.connect(level).connect(this.destination);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
    };
    source.start(now);
  }
}

export class AudioRecordings {
  constructor(context, {musicBus, ambienceBus, pressureBus}) {
    this.context = context;
    this.music = new ChapterLoop(context, musicBus);
    this.ambience = new ChapterLoop(context, ambienceBus);
    this.pressure = new ChapterLoop(context, pressureBus);
    this.buffers = new Map();
    this.pending = new Map();
    this.keep = new Set([...Object.values(foley), danger]);
    this.needed = new Set(this.keep);
    this.stage = null;
    this.retryAt = Infinity;
    for (const url of this.keep) this.load(url);
  }

  load(url) {
    if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url));
    if (this.pending.has(url)) return this.pending.get(url);
    const request = fetch(url).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(bytes => this.context.decodeAudioData(bytes)).then(buffer => {
      if (this.needed.has(url)) this.buffers.set(url, buffer);
      return buffer;
    }).catch(error => {
      console.warn('音频素材加载失败', url.startsWith('data:') ? '内嵌音频' : url, error);
      return null;
    }).finally(() => this.pending.delete(url));
    this.pending.set(url, request);
    return request;
  }

  select(stage) {
    if (stage === this.stage && this.context.currentTime < this.retryAt) return;
    this.stage = stage;
    this.retryAt = Infinity;
    const nextStage = Math.min(stage + 1, music.length - 1);
    const nearby = [music[stage], ambience[stage], music[nextStage], ambience[nextStage]];
    this.needed = new Set([...this.keep, ...nearby]);
    for (const url of this.buffers.keys()) {
      if (!this.needed.has(url)) this.buffers.delete(url);
    }
    const loadLoop = (track, url, duration) => {
      const buffer = this.buffers.get(url);
      if (buffer) {
        track.change(url, buffer, duration);
        return;
      }
      return this.load(url).then(decoded => {
        if (this.stage !== stage) return;
        track.change(url, decoded, duration);
        if (!decoded) this.retryAt = this.context.currentTime + 5;
      });
    };
    Promise.all([
      loadLoop(this.music, music[stage], this.music.source ? 1.85 : .7),
      loadLoop(this.ambience, ambience[stage], this.ambience.source ? 1.4 : .56),
    ]).then(() => {
      if (this.stage === stage && nextStage !== stage) {
        this.load(music[nextStage]);
        this.load(ambience[nextStage]);
      }
    });
  }

  async preload(stages) {
    const urls = stages.flatMap(stage => [music[stage], ambience[stage]]);
    for (const url of urls) this.keep.add(url);
    for (const url of this.keep) this.needed.add(url);
    await Promise.all([...this.keep].map(url => this.load(url)));
  }

  startPressure() {
    this.pressure.change(danger, this.buffers.get(danger), .35);
  }

  sample(name) {
    return this.buffers.get(foley[name]);
  }
}
