import {
  airThreatCue, attackCue, bankPincerCue, bossCue, dartRushCue, endingCue, evolutionCue, fieldCue, reactionCue, reactionMaterial,
  sceneTexture, surfaceCue, waterStroke,
} from './audio-cues.js';
import { BLESSING_RAIN_AT } from './heaven-finale.js';
import { AudioRecordings } from './audio-recordings.js';

const CHAPTERS = [
  { water: .17, waterTone: 910, air: .076, airTone: 1430, windRate: 1.17,
    texture: [.64,3.4,.54], fieldLevel: .87, scoreLevel: .79 },
  { water: .15, waterTone: 410, air: .046, airTone: 820, windRate: .38,
    texture: [.81,4.4,.43], fieldLevel: 1.03, scoreLevel: .67 },
  { water: .31, waterTone: 520, air: .11, airTone: 630, windRate: .74,
    texture: [.57,4.2,.20], fieldLevel: .60, scoreLevel: .68 },
  { water: .10, waterTone: 280, air: .17, airTone: 540, windRate: .87,
    texture: [.69,5.1,.34], fieldLevel: 1.04, scoreLevel: .67 },
  { water: 0, waterTone: 260, air: .12, airTone: 890, windRate: .30,
    texture: [.89,6.4,.22], fieldLevel: 1, scoreLevel: .84 },
];
const SCORE_ROOT = 146.832;

const CUE_INTERVALS = {
  eat: .19, recover: .24, bite: .17, claw: .18, tail: .22, kill: .32,
  shoot: .35, hit: .22, hurt: .31, arc: .23, reaction: .84,
  storm: .56, fire: .49, ring: .48, thunder: .47, warning: .31, lightning: .27,
  bossPhase: .09, bossImpact: .21, bossWave: .20, bossCharge: .24,
  airDive: .27, airPass: .31, bankPincer: .47, dartRush: .35, armorBreak: .35,
  entry: .25, launch: .19, dash: .25, dashReady: .45,
  cascadeStart: .5, cascadeReserve: .46, cascadeHandoffAim: .48, cascadePulse: .11, cascadeBreak: .35, cascadeEnd: .38, dragonArtStart: .55, dragonArtPhase: .12, dragonArtDetail: .12,
  dragonArtReaction: .22, dragonArtBreak: .39, dragonArtMajorClear:.22, seedSet: .27, seedBloom: .32, weirSet: .35, weirRelease: .29,
  kiteSet: .28, kiteRelease: .28,
  kiteDownpour: .23, kiteRainFall: .21,
  prismSet: .32, prismRelease: .24, prismContact: .20, thawThunderImpact:.19,
};

const DETAIL_DUCK = {
  dash: [.46,.24], entry: [.43,.25], launch: [.54,.19], dashReady: [.65,.14],
  hurt: [.34,.35], recover: [.70,.15], warning: [.41,.34], bossImpact: [.40,.24],
  windup: [.41,.34], active: [.43,.24], recovery: [.53,.26],
  strike: [.64,.11], reaction: [.48,.18],
  airWarning: [.58,.18], bankPincer: [.75,.15], dartRush: [.79,.13],
  nearLightning: [.68,.12], lanternGap: [.65,.24], cascadeStart: [.55,.42], cascadeBreak: [.42,.26],
  dragonArtStart: [.36,.58], dragonArtPhase: [.25,.40], dragonArtReaction: [.51,.28], dragonArtBreak: [.32,.31], dragonArtMajorClear:[.21,.40],
  kiteDownpour: [.65,.30], kiteRainFall: [.52,.28], steamCondense: [.35,.34],
  riftOpen: [.51,.22], riftClose: [.32,.34], abyssTransfer: [.49,.38],
  beamQuench: [.40,.31], beamSteamStore: [.79,.22],
  stoneMarch: [.55,.26], stoneMarchBreak: [.43,.27], prismRelease: [.56,.28], prismContact: [.45,.23],
  frostTemperCarry: [.27,.48], frostTemperContact: [.23,.34],
};

const DETAIL_LEVELS = {
  shoot: .57, hit: .52, arc: .78, fire: .83, storm: .80, kill: .60,
  claw: .75, tail: .79, lightning: .8, cascadePulse: .75,
};
const ENDING_FOCUS = {
  finaleWarning: [.45,.35], finaleStrike: [.37,.37], finaleBind: [.27,.83],
  finaleInscription: [.51,.84], finaleStomp: [.41,.56], finalePawsLand: [.28,.39], finaleBreak: [.25,1.05],
};
const ENDING_MUSIC_PAUSE = {finaleBind:20.50,finaleInscription:1.85,finaleBreak:2};
const VOLUME = .68;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function noiseBuffer(ctx, seconds, channels, kind, seed) {
  const samples = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(channels, samples, ctx.sampleRate);
  let random = seed >>> 0;
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    let slow = 0, drift = 0;
    for (let i = 0; i < samples; i++) {
      random = (Math.imul(random,1664525)+1013904223) >>> 0;
      const white = random/2147483648-1;
      slow = slow*.943+white*.057;
      drift = drift*.989+white*.011;
      if (kind === 'white') data[i]=white;
      else if (kind === 'water') data[i]=white*.21+slow*1.11+drift*1.44;
      else if (kind === 'air') data[i]=white*.11+slow*.88+drift*1.82;
      else {
        const phase=2*Math.PI*i/samples;
        const sweep=.57+.27*Math.sin(phase*4+channel*1.2)+.14*Math.sin(phase*7+.45+channel*.91);
        data[i]=(white*.13+slow*1.31+drift*1.58)*sweep;
      }
    }
    if (kind !== 'white') {
      const seam=Math.floor(ctx.sampleRate*.11);
      for(let i=0;i<seam;i++) {
        const rise=Math.sin((i+.5)/seam*Math.PI*.5);
        data[i]*=rise;
        data[samples-1-i]*=rise;
      }
    }
  }
  return buffer;
}

// A lossy, two-point string reflection produces the pluck and its decaying
// overtones from a short excitation instead of a transposed oscillator stack.
function stringBuffer(ctx, frequency) {
  const duration=1.72;
  const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate);
  const data=buffer.getChannelData(0);
  const wave=new Float32Array(Math.max(2,Math.round(ctx.sampleRate/frequency)));
  let state=(frequency*1009)>>>0,position=0,tail=0,bridge=0;
  for(let i=0;i<wave.length;i++) {
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const excite=state/2147483648-1;
    bridge=.68*bridge+.32*excite;
    wave[i]=bridge*.64+(excite-bridge)*.31;
  }
  for(let i=0;i<data.length;i++) {
    const next=(position+1)%wave.length;
    const sample=wave[position];
    wave[position]=.4982*sample+.4990*wave[next];
    position=next;
    tail=.83*tail+.17*sample;
    const attack=Math.min(1,i/(ctx.sampleRate*.005));
    data[i]=attack*Math.exp(-2.27*i/data.length)*(sample*.80+tail*.37);
  }
  return buffer;
}

function chapterIndex(stage) {
  return clamp(Number.isFinite(stage)?Math.trunc(stage):0,0,CHAPTERS.length-1);
}

export class AudioGarden {
  constructor(enabled = true, mix = {}) {
    this.enabled=enabled;
    this.mix={music:1, ambience:1, effects:1, ...mix};
    this.ctx=null;
    this.scene=-1;
    this.strokePhase=0;
    this.strokeSide=1;
    this.textureTime=0;
    this.textureSide=1;
    this.lastCue=new Map();
    this.stringCache=new Map();
    this.foodVariation=0;
    this.foleyUntil=new Map();
    this.breathWeapon=null;
    this.breathAccent=false;
    this.detailUntil=0;
    this.detailFloor=1;
    this.evolutionUntil=0;
    this.warningAccent=Infinity;
    this.endingMusicUntil=0;
  }

  async init() {
    if(!this.enabled&&!this.ctx)return false;
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return false;
    if(!this.ctx) {
      const ctx=this.ctx=new AudioContext();
      this.master=ctx.createGain();
      this.master.gain.value=this.enabled?VOLUME:0;
      this.limiter=ctx.createDynamicsCompressor();
      this.limiter.threshold.value=-14;
      this.limiter.knee.value=9;
      this.limiter.ratio.value=5;
      this.limiter.attack.value=.004;
      this.limiter.release.value=.23;
      this.master.connect(this.limiter).connect(ctx.destination);

      this.room=ctx.createGain();
      this.room.gain.value=0;
      this.ambient=ctx.createGain();
      this.combat=ctx.createGain();
      this.finaleRoom=ctx.createGain();
      this.music=ctx.createGain();
      this.effects=ctx.createGain();
      this.feedback=ctx.createGain();
      this.score=ctx.createGain();
      this.field=ctx.createGain();
      this.pressure=ctx.createGain();
      this.music.gain.value=this.mix.music**2;
      this.ambient.gain.value=.92*this.mix.ambience**2;
      this.effects.gain.value=this.mix.effects**2;
      this.score.gain.value=0;
      this.field.gain.value=0;
      this.pressure.gain.value=0;
      this.score.connect(this.music);
      this.pressure.connect(this.music);
      this.field.connect(this.ambient);
      this.music.connect(this.master);
      this.ambient.connect(this.master);
      this.effects.connect(this.master);
      this.feedback.connect(this.effects);
      this.room.connect(this.effects);
      this.combat.connect(this.room);
      this.finaleRoom.connect(this.room);
      this.detail=ctx.createGain();
      this.detail.gain.value=.82;
      this.detail.connect(this.combat);
      this.recordings=new AudioRecordings(ctx,{
        musicBus:this.score,ambienceBus:this.field,pressureBus:this.pressure,
      });
      this.white=noiseBuffer(ctx,2.6,1,'white',521);
      const water=noiseBuffer(ctx,10.4,2,'water',7919);
      const air=noiseBuffer(ctx,11.8,2,'air',8171);
      const swirl=noiseBuffer(ctx,7.8,2,'vortex',1811);
      const rain=noiseBuffer(ctx,5.8,2,'air',31519);
      this.water=this.makeBed(water,'lowpass',680,0);
      this.air=this.makeBed(air,'bandpass',1250,2.1);
      this.wake=this.makeBed(water,'bandpass',940,6.4);
      this.whirl=this.makeBed(swirl,'bandpass',520,2.8);
      this.finaleRain=this.makeBed(rain,'bandpass',1750,.41);
    }
    if(this.ctx.state!=='running')await this.ctx.resume().catch(()=>{});
    return this.ctx.state==='running';
  }

  makeBed(buffer,type,frequency,offset) {
    const source=this.ctx.createBufferSource();
    const filter=this.ctx.createBiquadFilter();
    const gain=this.ctx.createGain();
    source.buffer=buffer;
    source.loop=true;
    filter.type=type;
    filter.frequency.value=frequency;
    filter.Q.value=type==='bandpass'?.58:.70;
    gain.gain.value=0;
    source.connect(filter).connect(gain).connect(this.ambient);
    source.start(0,offset);
    return {source,filter,gain};
  }

  toggle() {
    this.enabled=!this.enabled;
    if(this.master)this.master.gain.setTargetAtTime(this.enabled?VOLUME:0,this.ctx.currentTime,.055);
    return this.enabled;
  }

  setMix(channel,value) {
    this.mix[channel]=value;
    if(this.ctx)this.applyMix();
  }

  resetRun() {
    this.lastCue.clear();
    this.foleyUntil.clear();
    this.foodVariation=0;
    this.breathWeapon=null;
    this.breathAccent=false;
    this.warningAccent=Infinity;
    this.endingMusicUntil=0;
    this.evolutionUntil=0;
    if(this.ctx&&this.detailUntil>this.ctx.currentTime) {
      const now=this.ctx.currentTime;
      this.detail.gain.cancelScheduledValues(now);
      this.detail.gain.setTargetAtTime(.82,now,.065);
    }
    this.detailUntil=0;
    this.detailFloor=1;
  }

  applyMix() {
    const now=this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.mix.music**2,now,.065);
    this.ambient.gain.setTargetAtTime(.92*this.mix.ambience**2,now,.065);
    this.effects.gain.setTargetAtTime(this.mix.effects**2,now,.065);
  }

  voice(duration, level, options) {
    const {attack=.008,delay=0,bus=this.combat,pan=0,shape}=options;
    const ctx=this.ctx,time=ctx.currentTime+delay;
    const envelope=ctx.createGain();
    const levelParam=envelope.gain;
    levelParam.setValueAtTime(.0001,time);
    if(shape) {
      const rise=Math.min(attack,duration*.55);
      for(let i=1;i<shape.length;i++){
        const offset=rise+(duration-rise)*(i-1)/Math.max(1,shape.length-2);
        levelParam.linearRampToValueAtTime(Math.max(.0001,level*shape[i]),time+offset);
      }
    } else {
      levelParam.linearRampToValueAtTime(level,time+Math.min(attack,duration*.55));
      levelParam.exponentialRampToValueAtTime(.0001,time+duration);
    }
    const stereo=pan&&ctx.createStereoPanner?ctx.createStereoPanner():null;
    if(stereo){
      stereo.pan.value=pan;
      envelope.connect(stereo).connect(bus);
    }else envelope.connect(bus);
    return {
      time,envelope,
      end:(source,filter)=>{
        source.onended=()=>{
          source.disconnect();
          filter?.disconnect();
          envelope.disconnect();
          stereo?.disconnect();
        };
        source.stop(time+duration+.012);
      },
    };
  }

  tone(frequency, finish, duration, level, options={}) {
    const {time,envelope,end}=this.voice(duration,level,options);
    const oscillator=this.ctx.createOscillator();
    oscillator.type=options.type||'sine';
    oscillator.frequency.setValueAtTime(frequency,time);
    oscillator.frequency.exponentialRampToValueAtTime(finish,time+duration);
    oscillator.connect(envelope);
    oscillator.start(time);
    end(oscillator);
  }

  noise(start,finish,duration,level,options={}) {
    const {time,envelope,end}=this.voice(duration,level,options);
    const source=this.ctx.createBufferSource();
    const filter=this.ctx.createBiquadFilter();
    source.buffer=this.white;
    source.loop=duration>this.white.duration;
    filter.type=options.type||'bandpass';
    filter.Q.value=options.q??.7;
    filter.frequency.setValueAtTime(start,time);
    filter.frequency.exponentialRampToValueAtTime(finish,time+duration);
    source.connect(filter).connect(envelope);
    const variation=Math.max(0,this.white.duration-duration-.04);
    source.start(time,Math.random()*variation);
    end(source,filter);
  }

  pluck(frequency,level,delay=0,bus=this.feedback,pan=0) {
    const key=Math.round(frequency*2)/2;
    let buffer=this.stringCache.get(key);
    if(!buffer) {
      if(this.stringCache.size>=28)this.stringCache.delete(this.stringCache.keys().next().value);
      buffer=stringBuffer(this.ctx,key);
      this.stringCache.set(key,buffer);
    }
    const source=this.ctx.createBufferSource();
    source.buffer=buffer;
    const {time,envelope,end}=this.voice(buffer.duration,level,{delay,bus,pan,attack:.007});
    source.connect(envelope);
    source.start(time);
    end(source);
  }

  spatialVoice(kind,event,listener,cameraMatrix,focusKind,weight=1) {
    const positional=listener&&Number.isFinite(event?.x)&&Number.isFinite(event?.z);
    const dx=positional?event.x-listener.x:0;
    const dz=positional?event.z-listener.z:0;
    const across=cameraMatrix?dx*cameraMatrix[0]+dz*cameraMatrix[2]:0;
    const contact=kind==='hit'||kind==='bossImpact'||kind==='hurt'||kind==='strikeContact';
    const closeThreat=kind==='bankPincer'||kind==='dartRush';
    const pan=clamp(across/(closeThreat?4.3:contact||focusKind==='lanternGap'?7.2:11),-.83,.83);
    const distance=positional?Math.hypot(dx,dz,(event.y??listener.y??0)-(listener.y??0)):0;
    const focus=DETAIL_DUCK[focusKind];
    const largeImpact=kind==='dragonArtBreak'||kind==='dragonArtMajorClear'||kind==='cascadeBreak'||kind==='kiteRainFall'||
      ['steamCondense','riftClose','beamQuench','stoneMarchBreak','frostTemperCarry','frostTemperContact'].includes(focusKind);
    if(focus&&(kind==='hurt'||distance<(largeImpact?42:25))){
      const now=this.ctx.currentTime;
      this.makeSpace(now,...focus);
      if(focusKind==='windup'||focusKind==='warning'){
        const lead=clamp(event?.duration||.96,.28,1.9);
        this.warningAccent=lead>.55?now+lead*.69:Infinity;
      }
    }
    const detail=Object.hasOwn(DETAIL_LEVELS,kind);
    // Large clear accents remain audible when the actual target group is in
    // another flight band. Their pan and high-frequency rolloff remain local.
    let gain=Math.max(kind==='hurt'?.63:largeImpact?.53:0,1/(1+distance*(detail?.078:.053)));
    if(kind==='bossImpact'&&event?.attack==='sky-cross'&&!event.hit){
      gain*=1-.54*clamp((Math.hypot(dx,dz)-2)/5.5,0,1);
    }
    const absorption=1-(detail?.46:.35)*clamp(distance/31,0,1);
    return this.recipeVoice({pan,gain:gain*weight*(DETAIL_LEVELS[kind]??1),
      absorption,bus:detail?this.detail:this.combat});
  }

  makeSpace(now,floor,duration) {
    const overlap=now<this.detailUntil;
    const until=Math.max(this.detailUntil,now+duration);
    const level=overlap?Math.min(this.detailFloor,floor):floor;
    if(until===this.detailUntil&&level===this.detailFloor)return;
    const volume=this.detail.gain;
    volume.cancelScheduledValues(now);
    volume.setTargetAtTime(level,now,.009);
    volume.setTargetAtTime(.82,until,.095);
    this.detailUntil=until;
    this.detailFloor=level;
  }

  recipeVoice({pan=0,gain=1,absorption=1,bus=this.combat}={}) {
    return {
      noise:(start,finish,duration,level,options={})=>this.noise(
        start*absorption,finish*absorption,duration,level*gain,{pan,bus,...options},
      ),
      resonate:(modes,duration,level,options={})=>{
        const {bend=.92,attack=.008,delay=0}=options;
        modes.forEach((frequency,index)=>{
          const weight=[.63,.32,.155,.08][index]??.053;
          this.tone(frequency,frequency*bend,duration*(1-index*.12),level*gain*weight,{
            attack,delay,pan,bus,
          });
        });
      },
      pluck:(frequency,level,delay=0)=>this.pluck(frequency,level*gain,delay,bus,pan),
      sample:(name,level,options={})=>this.sample(name,level*gain,{pan,bus,absorption,...options}),
    };
  }

  playFoley(kind,voice,{stage,event,rank}) {
    const water=stage<2||stage===2&&((event?.y??1.2)<1.8||Number.isFinite(event?.vertical));
    const weight=clamp(event?.strength??1,.25,1.3);
    switch(kind) {
      case 'eat':
        if(event?.battleLoot&&rank<2&&stage>=2)return false;
        return voice.sample(this.foodVariation%2?'swallow1':'swallow2',.24+rank*.018,
          {rate:1.06-stage*.05+rank*.019});
      case 'bite':
        return event?.hit!==false&&voice.sample('bite',.31,{rate:1.04-stage*.057});
      case 'dash':
        return voice.sample(water?'waterDash':'wing',(water?.45:.37)*weight,
          {rate:water?1.10-stage*.085:1.19,cooldown:.24});
      case 'launch':
      case 'entry':
        return voice.sample(water?'waterHit':'wing',(water?.51:.50)*weight,
          {rate:water?1.04-stage*.075:.96,cooldown:.26});
      case 'tail':
        return event?.hit&&voice.sample('impact',.33,{rate:1.21,delay:.035,cooldown:.26});
      case 'hurt':
        return voice.sample('injury',event?.lost>1?.48:.40,{rate:1.08-stage*.06});
      case 'bossImpact':
        if(event?.attack==='sky-cross')return voice.sample('thunder',event.hit?.48:.33,{cooldown:.75});
        return voice.sample('impact',event?.hit===false?.35:.56,{rate:1.08-stage*.09,cooldown:.29});
      case 'thunder':
        return voice.sample('thunder',.48,{cooldown:.76});
      case 'bossWave':
        return stage<3&&voice.sample('waterHit',.38,{rate:.78,cooldown:.36});
      case 'armorBreak':
      case 'dragonArtBreak':
        return voice.sample('armorBreak',.43,{rate:1.08-stage*.07,cooldown:.29});
      default:
        return false;
    }
  }

  sample(name,level,{pan,bus,absorption,rate=1,variation=.055,delay=0,cooldown=0}) {
    const buffer=this.recordings.sample(name);
    const now=this.ctx.currentTime;
    if(!buffer||now<(this.foleyUntil.get(name)??0))return false;
    if(cooldown)this.foleyUntil.set(name,now+cooldown);
    const pitch=rate*(1+(Math.random()*2-1)*variation);
    const source=this.ctx.createBufferSource();
    const length=buffer.duration/pitch;
    const {time,envelope,end}=this.voice(length,level,{delay,bus,pan,shape:[0,1,1],attack:.003});
    envelope.gain.linearRampToValueAtTime(.0001,time+length+.004);
    source.buffer=buffer;
    source.playbackRate.value=pitch;
    let filter;
    if(absorption<.97) {
      filter=this.ctx.createBiquadFilter();
      filter.type='lowpass';
      filter.frequency.value=900+13600*absorption**4;
      source.connect(filter).connect(envelope);
    }else source.connect(envelope);
    source.start(time);
    end(source,filter);
    return true;
  }

  play(kind,{stage=0,rank=0,event,listener,cameraMatrix}={}) {
    if(!this.enabled||this.ctx?.state!=='running'||event?.cancelled)return;
    if(kind==='eat'&&event?.shed)kind='recover';
    if(kind==='claw'&&event?.strike==='tail')kind='tail';
    const reaction=kind==='reaction'?reactionMaterial(event):null;
    if(kind==='reaction'&&!reaction)return;
    stage=chapterIndex(stage);
    if(kind==='bankPincer'&&(stage>1||event?.phase!=='windup'))return;
    const dartPhase=kind==='dartRush'?event?.phase:null;
    if(kind==='dartRush'&&(stage!==0||dartPhase!=='windup'&&dartPhase!=='active'))return;
    const phase=kind==='bossPhase'?event?.phase:'';
    const airThreat=kind==='airDive'||kind==='airPass';
    const form=event?.form??event?.stage;
    const evolutionStage=kind==='evolve'&&event?.type==='evolve'&&Number.isInteger(form)
      &&form>=1&&form<=4 ? form : 0;
    const frostBranch=event?.reaction==='frost-thunder-fork'?`:${event.lane??event.branch??'surface'}`:'';
    const group=phase?`${kind}:${event?.bossId??stage}:${event?.attack??'attack'}:${phase}`
      : reaction?`${kind}:${reaction}`:dartPhase?`${kind}:${dartPhase}`
      : kind==='dragonArtDetail'?`${kind}:${event.kind}:${event.phase}:${event.impact}`
      : kind==='dragonArtReaction'?`${kind}:${event.reaction}${frostBranch}`:kind;
    const now=this.ctx.currentTime;
    const breath=kind==='shoot'?event?.kind??event?.weapon:null;
    const recent=now-(this.lastCue.get(group)??-Infinity)<(CUE_INTERVALS[kind]||0);
    if(recent){
      if(!breath||breath===this.breathWeapon||this.breathAccent)return;
      this.breathAccent=true;
    }else{
      this.lastCue.set(group,now);
      if(kind==='shoot'){
        this.breathWeapon=breath;
        this.breathAccent=false;
      }
    }
    if(evolutionStage){
      this.evolutionUntil=now+1.65;
      this.makeSpace(now,.56,.42);
      const voice=this.recipeVoice({bus:this.feedback});
      voice.sample('ritual',evolutionStage===4?.49:.38,{variation:0});
      evolutionCue(evolutionStage,SCORE_ROOT,
        pan=>this.recipeVoice({pan,bus:this.feedback,gain:.77}));
      return;
    }
    if(kind==='endingRoute'||kind.startsWith('finale')){
      const focus=ENDING_FOCUS[kind];
      if(focus)this.makeSpace(now,...focus);
      const musicPause=ENDING_MUSIC_PAUSE[kind];
      if(musicPause)this.endingMusicUntil=now+musicPause;
      const local=kind==='endingRoute'&&!['gate-open','relay-strike'].includes(event?.kind);
      const voice=local
        ? this.spatialVoice(kind,event,listener,cameraMatrix)
        : this.recipeVoice({bus:kind.startsWith('finale')?this.finaleRoom:this.combat});
      if(kind==='finaleStrike')voice.sample('thunder',event?.hit?.56:.41,{cooldown:.66});
      if(kind==='finalePawsLand')voice.sample('impact',.56,{rate:.82,cooldown:.32});
      if(kind==='finaleGate'||kind==='finaleSeal'||kind==='finaleBreak')
        voice.sample('ritual',.45,{variation:0,cooldown:1.2});
      endingCue(kind,voice,event);
      return;
    }
    if(phase==='active'||phase==='recovery')this.warningAccent=Infinity;
    const backwash=event?.attack==='shell-backwash';
    const skyCross=event?.attack==='sky-cross';
    const lanternPulse=event?.attack==='lantern-pulse';
    // Actual wave and strike events supply their own release positions.
    if((backwash||skyCross)&&phase==='active')return;
    if(lanternPulse&&((phase&&phase!=='windup')||kind==='bossWave'||kind==='bossImpact'&&!event.hit))return;
    let origin=event;
    if(airThreat||kind==='bossCharge'||kind==='bankPincer'||dartPhase)origin=event?.from??event;
    if(dartPhase==='active'&&event.from&&event.to){
      const {from,to}=event;
      origin={
        x:from.x+(to.x-from.x)*.28,y:from.y+(to.y-from.y)*.28,z:from.z+(to.z-from.z)*.28,
      };
    }
    if(kind==='dashReady')origin=event?.to??event;
    if(kind==='dragonArtReaction'&&['stone-quarry','abyss-undertow','abyss-steamwake','frost-thunder-fork','frost-temper-rush'].includes(event?.reaction))origin=event.from??event;
    if(kind==='hurt')origin=event?.contact??listener??event;
    const strike=(kind==='claw'||kind==='tail')&&event?.hit===true;
    let focus=phase||(backwash&&kind==='bossWave'?'active':airThreat?'airWarning':strike?'strike':kind);
    if(kind==='dragonArtReaction'&&event.reaction==='abyss-transfer'){
      focus='abyssTransfer';
      origin=event.from??event;
    }
    if(kind==='dragonArtReaction'&&event.reaction==='stone-march'){
      focus='stoneMarch';
      origin=event.from??event;
    }
    if(kind==='dragonArtReaction'&&event.reaction==='stone-contour')origin=event.from??event;
    if(kind==='dragonArtDetail'&&event.impact==='stone-march'&&event.killed)focus='stoneMarchBreak';
    if(kind==='dragonArtReaction'&&event.reaction==='abyss-condense')focus='steamCondense';
    if(kind==='dragonArtReaction'&&event.reaction==='frost-temper-rush')focus='frostTemperCarry';
    if(kind==='dragonArtReaction'&&event.reaction==='thaw-thunder-release') {
      focus='frostTemperCarry';
      origin=event.from;
    }
    if(kind==='thawThunderImpact')focus='frostTemperContact';
    if(kind==='dragonArtDetail'&&event.impact==='frost-temper-rush')focus='frostTemperContact';
    if(kind==='dragonArtReaction'&&(event.reaction==='beam-quench'||event.reaction==='beam-quench-store')){
      focus=event.reaction==='beam-quench'?'beamQuench':'beamSteamStore';
      origin=event.from??event;
    }
    if(kind==='dragonArtReaction'&&(event.reaction==='rift-seam'||event.reaction==='rift-wind-seam')){
      focus='riftOpen';
      origin=event.from??event;
    }
    if(kind==='dragonArtReaction'&&(event.reaction==='rift-seam-close'||event.reaction==='rift-wind-seam-close')||
      kind==='dragonArtDetail'&&event.impact==='rift-clash')focus='riftClose';
    if(kind==='kiteDownpour')origin=event.via??event;
    if(lanternPulse&&(phase==='windup'||kind==='warning')){
      if(listener&&Number.isFinite(event.gap)){
        const radius=clamp(Math.hypot(listener.x-event.x,listener.z-event.z),1.2,10.6);
        origin={
          x:event.x+Math.sin(event.gap)*radius,y:event.y,z:event.z+Math.cos(event.gap)*radius,
        };
      }
      focus='lanternGap';
    }
    if(skyCross&&kind==='bossImpact'&&!event.hit){
      focus=listener&&Math.hypot(event.x-listener.x,event.z-listener.z)<3?'nearLightning':null;
    }
    const weight=recent?.44:1;
    let voice=this.spatialVoice(kind,origin,listener,cameraMatrix,focus,weight);
    if(this.playFoley(kind,voice,{stage,event,rank})) {
      voice=this.spatialVoice(kind,origin,listener,cameraMatrix,null,weight*(kind==='hurt'?.79:.62));
    }
    switch(kind) {
      case 'start':
      case 'chosen':
      case 'upgrade':
      case 'evolve':
      case 'arrival':
      case 'ascend':
      case 'loss': {
        const reward=this.recipeVoice({bus:this.feedback});
        if(kind==='loss') {
          reward.pluck(SCORE_ROOT*1.5,.15);
          reward.pluck(SCORE_ROOT,.12,.28);
          break;
        }
        const featured=kind==='arrival'||kind==='evolve'||kind==='ascend';
        if(featured) {
          this.evolutionUntil=now+1.9;
          reward.sample('ritual',.42,{variation:0,cooldown:.7});
        }
        const strength=kind==='chosen'?.15:.20;
        reward.pluck(SCORE_ROOT*2,strength);
        if(kind!=='chosen')reward.pluck(SCORE_ROOT*2**(14/12),strength*.75,.23);
        if(featured)reward.pluck(SCORE_ROOT*3,strength*.66,.61);
        break;
      }
      case 'dash':
      case 'dashReady':
      case 'launch':
      case 'entry':
        surfaceCue(kind,voice,{stage,event,weight:clamp(event?.strength??(kind==='entry'?.86:1),.18,1.4)});
        break;
      case 'bite':
      case 'eat':
      case 'recover':
      case 'claw':
      case 'tail':
      case 'shoot':
      case 'hit':
      case 'hurt':
      case 'kill': {
        const tailVoice=kind==='hurt'&&event?.lost>0
          ? this.spatialVoice(kind,event,listener,cameraMatrix)
          : voice;
        const headContact=kind==='hurt'&&stage===2&&listener&&origin&&
          Math.hypot(origin.x-listener.x,origin.y-listener.y,origin.z-listener.z)<1.8;
        const headSize=headContact?listener.body??21:0;
        const contactVoice=strike&&event.to
          ? this.spatialVoice('strikeContact',event.to,listener,cameraMatrix)
          : voice;
        const variation=kind==='eat'?this.foodVariation++%3:1;
        attackCue(kind,voice,{stage,rank,event,tailVoice,headSize,contactVoice,variation,accent:recent});
        break;
      }
      case 'boss':
      case 'bossPhase':
      case 'bossImpact':
      case 'bossWave':
      case 'bossCharge':
      case 'warning':
      case 'thunder':
        bossCue(kind,voice,{stage,event});
        break;
      case 'airDive':
      case 'airPass': {
        const rear=cameraMatrix&&listener&&origin&&
          (origin.x-listener.x)*cameraMatrix[8]+(origin.z-listener.z)*cameraMatrix[10]>1;
        airThreatCue(kind,voice,{rear});
        break;
      }
      case 'armorBreak':
        voice.noise(2630,520,.16,.21,{attack:.01,q:2.1});
        voice.resonate([119,227,406],.22,.14,{delay:.018,bend:.61});
        break;
      case 'bankPincer': {
        const dx=listener&&origin?origin.x-listener.x:0;
        const dz=listener&&origin?origin.z-listener.z:0;
        const across=cameraMatrix?dx*cameraMatrix[0]+dz*cameraMatrix[2]:0;
        const rear=cameraMatrix&&dx*cameraMatrix[8]+dz*cameraMatrix[10]>0;
        bankPincerCue(voice,rear||Math.abs(across)>Math.hypot(dx,dz)*.48);
        break;
      }
      case 'dartRush':
        dartRushCue(dartPhase,voice);
        break;
      case 'storm':
      case 'fire':
      case 'ring':
      case 'lightning':
      case 'arc':
        fieldCue(kind,voice);
        break;
      case 'reaction':
        reactionCue(reaction,voice);
        break;
      case 'cascadeReserve':
        voice.resonate([79,118,172],.19,.13,{attack:.022,bend:1.16});
        break;
      case 'cascadeHandoffAim':
        voice.resonate([141,218,311],.21,.12,{attack:.031,bend:.85});
        break;
      case 'cascadeStart': {
        const palette = {
          wind: [1230,3900,[76,123,189]], fire: [1530,900,[83,141,251]],
          thunder: [2500,380,[66,156,409]], water: [570,2850,[60,112,164]],
          poison: [460,730,[65,95,137]],
        };
        const [tone, width, pitches] = palette[event.kind] ?? palette.water;
        const attack = event.kind === 'thunder' ? .014 : .10;
        voice.noise(tone,width,.47,.19,{attack});
        voice.resonate(pitches,.31,.16,{delay:attack,bend:.64});
        if(event.handoff)voice.resonate(pitches.map(value=>value*1.26),.28,.19,
          {delay:event.handoff.travel??.08,attack:.039,bend:1.13});
        break;
      }
      case 'cascadePulse': {
        if(event.detail==='gale-spore-front'){
          if(event.preparing){
            voice.noise(1620,570,.42,.27,{attack:.025});
            voice.resonate([66,114,186],.49,.26,{delay:.04,attack:.066,bend:.76});
          }else{
            voice.noise(870,310,.32,.33,{attack:.011});
            voice.resonate([47,82,136],.44,.35,{attack:.017,bend:.57});
          }
          break;
        }
        if(event.detail==='gyre-core'||event.detail==='gyre-burst'||event.detail==='gale-run') {
          if(event.detail==='gyre-core') {
            voice.noise(580,380,event.preparing?.47:.18,.14,{attack:event.preparing?.10:.012});
            voice.resonate([48,72,111],.32,.16,{attack:.032,bend:event.preparing?1.74:.69});
          } else if(event.preparing)voice.noise(1170,590,.42,.16,{attack:.045});
          else {
            voice.noise(event.detail==='gyre-burst'?940:1560,1410,.27,.25,{attack:.010});
            voice.resonate([56,92,172],.31,.21,{attack:.021,bend:.71});
          }
          break;
        }
        if(event.detail==='cinder-path'||event.detail==='crown-ring') {
          if(event.preparing) voice.noise(870,1020,.29,.13,{attack:.06});
          else {
            voice.noise(1430,1310,.24,.22,{attack:.011});
            voice.resonate([57,104,173].map(tone=>tone*(1+(event.leg??1)*.10)),.25,.21,{attack:.012,bend:.69});
          }
          break;
        }
        if(event.detail==='host-knot'||event.detail==='basin-flow') {
          if(event.preparing)voice.resonate([101,151,217],.27,.10,{attack:.09,bend:.72});
          else {
            voice.noise(470,485,.34,.21,{attack:.031});
            voice.resonate([49,76,126],.37,.16,{attack:.018,bend:.78});
          }
          break;
        }
        if (event.detail==='rise-bolt'||event.detail==='fork-bolt') {
          const rising=event.detail==='rise-bolt';
          voice.noise(rising?1620:2650,1480,.13,.13,{attack:.008});
          voice.resonate(rising?[87,193,377]:[102,247,352],.16,.10,{attack:.01,bend:rising?1.30:.81});
          break;
        }
        if(event.preparing&&event.detail==='fan-crest') {
          voice.noise(730,420,.23,.09,{attack:.054});
          break;
        }
        const accent = {
          wind: ['storm',.7], fire: ['fire',.9], thunder: ['arc',1],
          water: ['entry',.9], poison: ['fire',.48],
        }[event.kind];
        if(event.kind==='water')surfaceCue(accent[0],voice,{stage,event,weight:accent[1]});
        else if(accent)fieldCue(accent[0],voice);
        break;
      }
      case 'cascadeBreak': {
        const [edge,body,tail]={
          wind:[1290,65,194], fire:[1830,74,251], thunder:[3430,102,377], water:[940,61,183], poison:[675,52,143],
        }[event.kind];
        voice.noise(edge,edge*.56,.21,.23,{attack:.008});
        voice.resonate([body,body*1.6,tail],.32,.29,{attack:.012,bend:.61});
        break;
      }
      case 'cascadeEnd':
        if(event.killCount>=3){
          const volume=clamp(.055+event.killCount*.006,.075,.23);
          voice.resonate([56,83,124],.28,volume,{attack:.014,bend:.59});
        }
        break;
      case 'dragonArtStart': {
        const colors={
          stone:[380,650,[48,72,105]], rift:[1250,760,[69,112,165]],
          abyss:[460,490,[39,52,73]], frost:[2680,1030,[156,280,396]],
          beam:[1460,830,[93,137,209]],
        };
        const [tone,width,pitches]=colors[event.kind];
        voice.noise(tone,width,.59,.26,{attack:.14});
        voice.resonate(pitches,.64,.24,{attack:.09,bend:event.kind==='abyss'?.49:1.3});
        break;
      }
      case 'dragonArtPhase': {
        if(!['suction','shatter','collapse','sweep','echo'].includes(event.phase))break;
        const colors={
          stone:[720,930,[43,68,101]],rift:[1820,1150,[53,111,237]],
          abyss:[530,730,[35,63,94]],frost:[3520,1610,[219,391,543,718]],
          beam:[1930,1110,[88,175,279]],
        };
        const [tone,width,pitches]=colors[event.kind];
        const weight=event.phase==='echo'?(event.kind==='beam'?.31:.51):
          event.phase==='suction'?.68:event.kind==='abyss'&&event.phase==='collapse'?.32:.67;
        voice.noise(tone,width,.47,.30*weight,{attack:.015});
        voice.resonate(pitches,.53,.28*weight,{attack:.016,bend:event.kind==='frost'?1.13:.67});
        break;
      }
      case 'dragonArtDetail': {
        const {kind: art, absorbed, impact, killed}=event;
        if(impact==='frost-temper-rush'){
          voice.noise(2630,430,.34,killed?.43:.28,{attack:.008});
          voice.resonate([48,98,184],.46,killed?.50:.32,{attack:.014,bend:.57});
          break;
        }
        if(impact==='stone-march'){
          voice.noise(5310,1110,.17,killed?.40:.17,{attack:.004});
          voice.resonate([57,103,219],.30,killed?.36:.15,{attack:.014,bend:.61});
          break;
        }
        if(impact==='frost-thunder-fork'){
          const shelf=event.formation==='shelf';
          voice.noise(shelf?3970:4820,1560,.145,killed?.39:.21,{attack:.004});
          voice.resonate(shelf?[69,133,269,512]:[101,217,397],shelf?.35:.25,killed?.37:.19,{attack:.009,bend:.68});
          break;
        }
        if(impact==='stone-quarry'||impact==='abyss-undertow'||impact==='abyss-steamwake'){
          const [edge, tail, tones, bend] = impact==='stone-quarry'?[2620,590,[53,91,161],.59]
            : impact==='abyss-undertow'?[1480,410,[56,86,143],.50]:[3300,1730,[133,254,437],.79];
          const strength=killed?1:.62;
          voice.noise(edge,tail,.21,.31*strength,{attack:.005});
          voice.resonate(tones,.31,.35*strength,{attack:.010,bend});
          break;
        }
        if(impact==='beam-crosscut'){
          voice.noise(2850,1850,.23,killed?.34:.21,{attack:.008});
          voice.resonate([117,188,296],.27,killed?.29:.15,{attack:.011,bend:.51});
          break;
        }
        if(impact==='beam-quench'){
          voice.noise(1520,3930,.24,killed?.33:.24,{attack:.011});
          voice.resonate([72,146,244],.32,killed?.32:.19,{attack:.027,bend:.76});
          break;
        }
        if(impact==='beam-scorch'){
          voice.noise(2220,815,.14,killed?.25:.16,{attack:.009});
          voice.resonate([87,181],.24,killed?.19:.11,{attack:.023,bend:.69});
          break;
        }
        if(impact==='rift-seam'){
          voice.noise(2950,1030,.19,killed?.26:.15,{attack:.005});
          voice.resonate([73,109,192],.32,killed?.31:.15,{attack:.014,bend:.51});
          break;
        }
        if(impact==='rift-recoil'){
          voice.noise(3410,690,.17,killed?.33:.20,{attack:.006});
          voice.resonate([68,121,201],.27,killed?.27:.16,{attack:.011,bend:.58});
          break;
        }
        if(impact==='rift-clash'){
          voice.noise(2130,480,.24,killed?.34:.26,{attack:.004});
          voice.resonate([49,83,131,218],.42,killed?.39:.26,{attack:.013,bend:.56});
          break;
        }
        if(absorbed){
          const weight=impact==='abyss-transfer'?1.24:1;
          voice.noise(art==='abyss'?500:1310,art==='abyss'?730:1100,.24,.23*weight,{attack:.008});
          voice.resonate(art==='abyss'?[47,83,143]:[101,172],.25,.22*weight,{attack:.01,bend:.49});
        }else if(art==='frost'){
          voice.noise(3800,1500,.18,.16,{attack:.006});
          voice.resonate([412,619,922],.21,.12,{attack:.01,bend:1.15});
        }else{
          voice.noise(art==='stone'?840:1710,930,.19,.12,{attack:.009});
          voice.resonate(art==='stone'?[79,131]:[129,210],.18,.10,{attack:.011,bend:.74});
        }
        break;
      }
      case 'dragonArtReaction': {
        if(event.reaction==='thaw-thunder-store'){
          voice.noise(1890,700,.27,.15,{attack:.058});
          voice.resonate([99,177],.31,.17,{delay:.034,attack:.061,bend:.91});
        }else if(event.reaction==='thaw-thunder-release'){
          voice.resonate([99,177],.23,.22,{attack:.018,bend:1.61});
          voice.noise(940,4200,.31,.39,{delay:.093,attack:.042});
          voice.resonate([104,184,349],.37,.31,{delay:.103,attack:.039,bend:1.49});
        }else if(event.reaction==='frost-prism-hold'){
          voice.resonate([129,258,487],.27,.16,{attack:.020,bend:1.22});
        }else if(event.reaction==='frost-prism-fork'){
          voice.noise(2290,4530,.14,.22,{attack:.032});
          voice.resonate([187,304,591],.22,.28,{attack:.016,bend:1.23});
        }else if(event.reaction==='abyss-mouth-gather'){
          voice.noise(760,490,.38,.17,{attack:.075,bend:1.4});
          voice.resonate([50,86,133],.37,.20,{attack:.044,bend:1.46});
        }else if(event.reaction==='abyss-mouth-fold'){
          const weight=Math.min(1,(event.burstKills??0)/12);
          voice.noise(880,240,.27,.19+.10*weight,{attack:.011});
          voice.resonate([34,59,97],.43,.23+.08*weight,{attack:.009,bend:.54});
        }else if(event.reaction==='abyss-transfer'){
          voice.noise(1150,370,.24,.20,{attack:.032});
          voice.resonate([48,79,121],.34,.22,{delay:.064,attack:.039,bend:1.36});
        }else if(event.reaction==='stone-contour-hold'){
          voice.resonate([51,89,124],.36,.15,{attack:.072,bend:.67});
        }else if(event.reaction==='stone-contour'){
          const width=Math.min(1,(event.width??3)/6);
          voice.noise(920,470,.58,.25,{attack:.048,delay:event.windup??.14});
          voice.resonate([46,73,121],.46,.31+.09*width,{attack:.025,bend:.56});
        }else if(event.reaction==='stone-march'){
          voice.resonate([72,133,207],.24,.21,{attack:.012,bend:.79});
          voice.noise(1070,340,.37,.27,{delay:event.windup??.23,attack:.042});
        }else if(event.reaction==='stone-quarry'){
          voice.noise(1170,530,.38,.26,{attack:.025});
          voice.resonate([49,82,148],.38,.28,{delay:.09,attack:.018,bend:.64});
        }else if(event.reaction==='abyss-undertow'){
          voice.noise(840,490,.45,.25,{attack:.036});
          voice.resonate([39,57,104],.42,.30,{delay:.08,attack:.019,bend:.56});
        }else if(event.reaction==='abyss-steamwake'){
          voice.noise(830,1740,.36,.23,{attack:.029});
          voice.resonate([65,116,204],.34,.24,{delay:.061,attack:.020,bend:1.22});
        }else if(event.reaction==='abyss-condense'){
          voice.noise(1160,4570,.44,.35,{attack:.023});
          voice.resonate([91,152,263,421],.48,.32,{attack:.013,bend:1.39});
          voice.noise(4110,1940,.29,.16,{delay:.095,attack:.051});
        }else if(event.reaction==='beam-intercept'){
          voice.noise(1890,5180,.24,.28,{attack:.026});
          voice.resonate([113,191,301],.36,.27,{delay:.074,attack:.028,bend:1.34});
        }else if(event.reaction==='beam-quench-runoff'){
          voice.noise(2620,1410,.30,.13,{attack:.051});
          voice.resonate([133,211,343],.25,.14,{attack:.038,bend:.71});
        }else if(event.reaction==='beam-quench'){
          const held=Boolean(event.stored??event.reservedAt);
          voice.noise(3160,1130,.30,held?.38:.31,{attack:.014});
          const rise=event.climbing?1.56:1.33;
          voice.resonate([58,103,197],.43,held?.42:.35,{delay:.034,attack:.017,bend:rise});
          voice.noise(1790,event.climbing?4810:3840,.41,.18,{delay:.08,attack:.075});
        }else if(event.reaction==='beam-quench-store'){
          voice.noise(2180,970,.32,.19,{attack:.025});
          voice.resonate([101,176,272],.39,.15,{delay:.055,attack:.062,bend:.71});
        }else if(event.reaction==='frost-sheet'){
          voice.resonate([149,235,389],.41,.22,{attack:.065,bend:1.33});
          voice.noise(3090,1710,.31,.16,{attack:.073});
        }else if(event.reaction==='frost-sheet-shatter'){
          const scale=Math.min(1,(event.burstKills??0)/12);
          voice.noise(4010,2100,.28,.21+.10*scale,{attack:.007});
          voice.resonate([51,138,327],.38,.18+.10*scale,{attack:.009,bend:.53});
        }else if(event.reaction==='frost-temper-rush'){
          const windup=event.windup??.12;
          voice.noise(4170,2110,.080,.28,{attack:.004});
          voice.noise(3440,1720,.09,.24,{delay:windup*.48,attack:.004});
          voice.noise(1170,4390,Math.min(.40,(event.travel??.44)*.85),.39,{delay:windup,attack:.047});
          voice.resonate([66,111],.37,.26,{delay:windup+.018,attack:.044,bend:1.61});
        }else if(event.reaction==='frost-temper-rush-hit'){
          const scale=Math.min(1,(event.burstKills??0)/6);
          voice.noise(1290,520,.36,.14+.09*scale,{attack:.044});
        }else if(event.reaction==='rift-wind-seam'){
          voice.noise(1640,1870,.38,.22,{attack:.054});
          voice.resonate([69,109,177],.41,.24,{attack:.046,bend:1.49});
        }else if(event.reaction==='rift-wind-seam-close'){
          voice.noise(2060,780,.22,.31,{attack:.009});
          voice.resonate([44,73,140],.42,.37,{attack:.017,bend:.49});
        }else if(event.reaction==='rift-seam'){
          voice.noise(3890,1400,.21,.25,{attack:.014});
          voice.noise(830,300,.55,.23,{attack:.070});
          voice.resonate([71,127,211],.51,.26,{delay:.025,attack:.034,bend:1.19});
        }else if(event.reaction==='rift-seam-close'){
          voice.noise(1240,230,.22,.31,{attack:.007});
          voice.resonate([43,69,112],.43,.44,{attack:.016,bend:.44});
          voice.noise(3520,1410,.10,.16,{delay:.058,attack:.009});
        }else if(event.reaction==='rift-recoil'){
          voice.noise(3450,1020,.32,.25,{attack:.055});
          voice.resonate([82,139,217],.32,.22,{delay:.034,attack:.054,bend:.75});
        }else if(event.reaction==='rift-clash'){
          voice.noise(1080,2910,.23,.24,{attack:.032});
          voice.resonate([78,150,229],.31,.22,{delay:.04,attack:.045,bend:1.22});
        }else if(event.reaction==='frost-thunder-fork'){
          const tuning=event.branch==='upper'?1.24:event.branch==='lower'?.85:1;
          const shelf=event.formation==='shelf';
          const strength=event.redirected?.58:.88;
          voice.noise(3100*tuning,4900*tuning,.14,.17*strength,{attack:.018});
          voice.resonate([179*tuning,349*tuning],shelf?.29:.21,.16*strength,{attack:.037,bend:shelf?.84:1.24});
        }else if(event.reaction==='conductive-front'){
          const pitch=1+.12*Math.min(event.depth??0,3);
          voice.noise(2450*pitch,1660,.23,.19,{attack:.011});
          voice.resonate([106*pitch,194*pitch,332*pitch],.34,.21,{attack:.025,bend:.72});
        }else if(event.reaction==='fire-bloom'){
          voice.noise(850,1030,.44,.25,{attack:.025});
          voice.resonate([65,113,183],.39,.24,{attack:.022,bend:.59});
        }else{
          voice.noise(2350,1780,.56,.25,{attack:.037});
          voice.resonate([124,207,347],.34,.14,{attack:.057,bend:.77});
        }
        break;
      }
      case 'thawThunderImpact':
        voice.noise(4870,670,.16,.40,{attack:.004});
        voice.resonate([44,94,168],.43,.47,{attack:.009,bend:.56});
        voice.noise(2600,310,.26,.22,{delay:.184,attack:.008});
        break;
      case 'dragonArtBreak': {
        if(event.kind==='stone'){
          voice.noise(2320,1050,.095,.35,{attack:.004});
          voice.resonate([43,70,112],.46,.48,{delay:.044,attack:.013,bend:.64});
          voice.noise(600,265,.39,.22,{delay:.091,attack:.024});
          break;
        }
        if(event.kind==='abyss'){
          voice.noise(1180,285,.25,.37,{attack:.013});
          voice.resonate([43,66,99],.43,.48,{delay:.03,attack:.017,bend:.50});
          voice.noise(640,1600,.39,.19,{delay:.115,attack:.063});
          break;
        }
        const [edge,width,pitches,bend]={
          frost:[3720,1890,[107,253,487],.82], rift:[1550,1410,[53,102,179],.47],
          beam:[2160,1710,[68,127,211],.54],
        }[event.kind];
        voice.noise(edge,width,.17,.38,{attack:.004});
        voice.resonate(pitches,.34,.41,{attack:.012,bend});
        voice.resonate([pitches[1]*1.27,pitches[2]*1.53],.23,event.kind==='frost'?.19:.11,
          {delay:.075,attack:.015,bend:.84});
        break;
      }
      case 'dragonArtMajorClear': {
        const frost=event.kind==='frost';
        const gain=Math.min(1,(event.burstKills??12)/24);
        voice.noise(frost?4840:2170,frost?1560:400,.20,.34+gain*.11,{delay:.075,attack:.005});
        voice.resonate(frost?[48,104,295]:[39,71,138],.37,.35+gain*.11,{delay:.081,attack:.013,bend:.62});
        break;
      }
      case 'weirSet':
        voice.resonate([157,269],.15,.12,{attack:.018,bend:.87});
        break;
      case 'prismSet':
        voice.resonate([379,541,911],.23,.17,{attack:.028,bend:1.10});
        break;
      case 'prismRelease':
        if(event.carrier==='frost-fork'){
          voice.noise(4780,2460,.19,.34,{attack:.004});
          voice.resonate([165,307,650],.31,.31,{attack:.010,bend:1.15});
        }else{
          voice.noise(3430,1580,.22,.23,{attack:.004});
          voice.resonate([142,277,574],.24,.21,{attack:.009,bend:.74});
        }
        break;
      case 'prismContact':
        voice.noise(4180,720,.22,event.killed?.41:.26,{attack:.005});
        voice.resonate([92,169,348],.30,event.killed?.35:.28,{attack:.017,bend:.58});
        break;
      case 'weirRelease':
        surfaceCue('entry',voice,{stage,event,weight:.58});
        break;
      case 'kiteSet':
        voice.noise(2960,1530,.23,.13,{attack:.025});
        voice.resonate([191,353],.17,.12,{attack:.017,bend:1.12});
        break;
      case 'kiteDownpour':
        voice.noise(2410,4480,.43,.22,{attack:.052});
        voice.resonate([183,321,549],.36,.21,{attack:.027,bend:.62});
        break;
      case 'kiteRainFall':
        voice.noise(2770,1320,.43,.32,{attack:.010});
        voice.resonate([57,96,172],.29,.36,{attack:.013,bend:.54});
        voice.noise(4110,2900,.24,.18,{delay:.12,attack:.025});
        break;
      case 'kiteRelease':
        if(event.converted){
          voice.noise(2650,1220,.39,.25,{attack:.021});
          voice.resonate([145,217,387],.30,.16,{attack:.028,bend:.76});
        }else if(event.result==='fire'){
          voice.noise(1150,550,.26,.21,{attack:.010});
          voice.resonate([79,151,247],.27,.18,{attack:.012,bend:.70});
        }else{
          voice.noise(event.carrier==='poison'?710:1190,850,.29,.19,{attack:.02});
          voice.resonate([104,186,305],.25,.14,{attack:.019,bend:.73});
        }
        break;
      case 'seedSet':
        voice.resonate([210,372,611],.19,.17,{attack:.009,bend:.81});
        break;
      case 'seedBloom':
        voice.noise(740,955,.38,.22,{attack:.022});
        voice.resonate([73,128,221],.35,.25,{attack:.013,bend:.66});
        break;
    }
  }

  update(dt,{stage=0,active=false,mode=active?'play':'menu',time=0,movement=0,height=.7,
    threatened=false,pressure=0,vortex=0,turning=0,finale}={}) {
    if(this.ctx?.state!=='running')return;
    stage=chapterIndex(stage);
    movement=clamp(movement,0,1);
    turning=clamp(turning,0,1);
    vortex=clamp(vortex,0,1);
    const now=this.ctx.currentTime;
    const profile=CHAPTERS[stage];
    if(this.scene!==stage) {
      this.scene=stage;
      this.strokePhase=0;
      this.textureTime=profile.texture[0];
      this.warningAccent=Infinity;
      this.water.filter.frequency.setTargetAtTime(profile.waterTone,now,.64);
    }
    if(this.enabled) {
      this.recordings.select(stage);
      if(pressure>.05)this.recordings.startPressure();
    }
    const hasField=this.recordings.ambience.url!==null;
    const quietEnding=now<this.endingMusicUntil;
    const ceremonial=now<this.evolutionUntil;
    const inPause=mode==='pause';
    const inMenu=mode==='menu';
    const inResult=mode==='result';
    const sceneGain=active?1:inMenu?.62:inPause?.30:inResult?.40:0;
    const scoreGain=quietEnding?.045:ceremonial?.21:inPause?.27:inMenu?.61:inResult?.48:
      active?1-.27*pressure-(threatened?.15:0):0;
    this.room.gain.setTargetAtTime(active?1:.18,now,active?.15:.15);
    this.score.gain.setTargetAtTime(profile.scoreLevel*scoreGain,now,ceremonial?.066:.53);
    const pulse=active&&!quietEnding&&!ceremonial?pressure*(threatened?.53:.79):0;
    this.pressure.gain.setTargetAtTime(pulse,now,pulse>.14?.56:.27);
    const highAir=stage>=2?clamp((height-1.24)*.093,0,1):0;
    const fieldReach=1+highAir*(stage===2?-.64:stage===3?.27:0);
    this.field.gain.setTargetAtTime(profile.fieldLevel*sceneGain*fieldReach*(ceremonial?.61:1),now,.35);
    const rainAge=finale?.phase==='blessing'?finale.age-BLESSING_RAIN_AT
      : finale?.phase==='epilogue'&&finale.ending==='ordained' ? 2+finale.age : -1;
    const finalRoom=finale?.phase==='lock'||finale?.phase==='audience'||finale?.phase==='blessing'||
      finale?.phase==='stomp'||finale?.phase==='epilogue';
    this.finaleRoom.gain.setTargetAtTime(finalRoom?1.23:1,now,.16);
    const rainStrength=rainAge<0?0:clamp(rainAge/.75,0,1)*
      (stage===4?.084:stage===3?.09:.115);
    this.finaleRain.filter.frequency.setTargetAtTime(stage===4?1600:stage===3?1150:1850,now,.65);
    this.finaleRain.gain.gain.setTargetAtTime(active?rainStrength:0,now,.38);
    const onWater=stage<2?1:stage===2?1-clamp((height-1.13)*.71,0,1):0;
    const swell=(.5+.5*Math.sin(time*.87))**2;
    const waterMotion=stage===2?.50+swell*.62:.79+Math.sin(time*.47)*.09;
    const waterReach=stage===3?1/(1+Math.max(0,height-5)*.13):1-highAir*.46;
    const gust=Math.sin(time*profile.windRate+.53*Math.sin(time*.41));
    const bedBlend=sceneGain*(hasField?.17:1)*(ceremonial?.57:1);
    this.water.gain.gain.setTargetAtTime(profile.water*waterMotion*waterReach*bedBlend,now,.16);
    this.air.filter.frequency.setTargetAtTime(profile.airTone*(1+gust*.12+highAir*.13),now,.55);
    this.air.gain.gain.setTargetAtTime(profile.air*(.75+gust*.18+highAir*.31)*bedBlend,now,.29);
    this.wake.filter.frequency.setTargetAtTime(585+movement*(onWater>.3?490:614)+turning*190,now,.14);
    this.wake.gain.gain.setTargetAtTime((active?movement:0)*(.032+onWater*.079),now,.15);
    this.whirl.filter.frequency.setTargetAtTime(405+vortex*465,now,.17);
    this.whirl.gain.gain.setTargetAtTime(active?vortex*(.12+.051*onWater):0,now,.21);
    this.whirl.source.playbackRate.setTargetAtTime(.82+.39*vortex,now,.27);
    if(!active||!this.enabled)return;
    if(now>=this.warningAccent){
      if(now-this.warningAccent<.22)this.makeSpace(now,.39,.23);
      this.warningAccent=Infinity;
    }
    this.textureTime-=dt;
    if(this.textureTime<=0&&!threatened&&now>=Math.max(this.detailUntil,this.evolutionUntil,this.endingMusicUntil)) {
      const [,gap,width]=profile.texture;
      this.textureSide=-this.textureSide;
      this.textureTime=gap*(.84+Math.random()*.46);
      const pan=width*this.textureSide*(.62+Math.random()*.38);
      sceneTexture(this.recipeVoice({pan,bus:this.ambient,gain:hasField?.27:.82}),stage,movement);
    }
    if(onWater>.1&&movement>.16){
      this.strokePhase+=dt*((stage===1?.64:.91)+movement*1.61+turning*.28)*onWater;
      if(this.strokePhase>=1){
        this.strokePhase%=1;
        this.strokeSide=-this.strokeSide;
        waterStroke(this.recipeVoice({pan:this.strokeSide*.18,bus:this.ambient,gain:.67}),movement*onWater,stage);
      }
    }else{
      this.strokePhase=Math.max(0,this.strokePhase-dt*.65);
    }
  }
}
