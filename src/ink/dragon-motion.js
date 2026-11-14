import { MathUtils } from 'three';
import { flightArrival, flightStroke } from './growth/flight-stroke.js';
import { clawHoldSeconds } from './claw-surface.js';
import {
  BLESSING_RAIN_AT, COURT_PAW_STEPS, COURT_SEAL_AT, GATE_BIND, LOCK_DOOR, LOCK_LANDING, LOCK_SETTLE, LOCK_SNAG, LOCK_STAIR,
  STOMP_LOAD, STOMP_PAW_GAP,
} from '../heaven-finale.js';

const { clamp, lerp, smoothstep } = MathUtils;
const surfaceStride = [3.55, 7.25];
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (value, target, rate, dt) => lerp(value, target, 1 - Math.exp(-rate * dt));
const pulse = (age, start, peak, release, end) =>
  smoothstep(age, start, peak) * (1 - smoothstep(age, release, end));
const profiles = [
  { yaw: 16, bank: .08, pitch: .05, swimRate: 6.8 },
  { yaw: 13, bank: .10, pitch: .055, swimRate: 5.0 },
  { yaw: 14, bank: .25, pitch: .39, swimRate: 4.1 },
  { yaw: 11, bank: .43, pitch: .51, swimRate: 3.2 },
  { yaw: 10, bank: .40, pitch: .52, swimRate: 2.8 },
];
const actions = [
  { reach: [-.025,.040,.068,.225], jaw: [-.045,.032,.065,.16], grip: [-.014,.043,.09,.23] },
  { reach: [-.035,.081,.135,.38], jaw: [-.050,.053,.101,.235], grip: [-.014,.065,.13,.30] },
  { reach: [-.033,.105,.152,.38], jaw: [-.050,.061,.106,.21], grip: [-.014,.065,.145,.33] },
  { reach: [-.028,.066,.117,.34], jaw: [-.052,.044,.079,.183], grip: [-.015,.048,.145,.34] },
];
const feeding = [
  { open: .049, take: .105, close: .172, reach: .83, settle: .33, throat: 1.28 },
  { open: .087, take: .163, close: .254, reach: .64, settle: .49, throat: 2.08 },
  { open: .066, take: .133, close: .205, reach: .76, settle: .42, throat: 1.67 },
  { open: .075, take: .148, close: .220, reach: .71, settle: .44, throat: 1.82 },
  { open: .081, take: .155, close: .235, reach: .68, settle: .46, throat: 1.94 },
];
const ordinaryFeeding = [
  { open: .035, take: .129, close: .222, reach: .85, settle: .38, throat: 1.28 },
  { open: .075, take: .190, close: .314, reach: .74, settle: .57, throat: 2.08 },
  { open: .063, take: .180, close: .304, reach: .80, settle: .54, throat: 2.25 },
];
const breath = {
  bubble: { duration: .24, kick: .093 }, mist: { duration: .29, kick: .118 },
  needle: { duration: .16, kick: .075 }, breach: { duration: .39, kick: .181 },
};

const feedingPose = (stage, rank) => (rank < 2 && ordinaryFeeding[stage]) || feeding[stage] || feeding[0];

/** The renderer reads the game head and trail. The response lives entirely in presentation. */
export class DragonMotion {
  constructor() {
    this.last = null;
    this.phase = 0;
    this.heading = 0;
    this.speed = 0;
    this.drive = 0;
    this.surge = 0;
    this.bank = 0;
    this.pitch = 0;
    this.turn = 0;
    this.lift = 0;
    this.air = 0;
    this.recoil = 0;
    this.swallow = 0;
    this.swallowStation = 0;
    this.change = 0;
    this.length = 0;
    this.lengthVelocity = 0;
    this.wingPhase = 0;
    this.wingPower = 0;
    this.flightPhase = 0;
    this.wingStroke = { load: 0, rise: 0, recover: 0 };
    this.action = null;
    this.anticipate = 0;
    this.strike = 0;
    this.grip = 0;
    this.jaw = 0;
    this.biteProgress = 1;
    this.biteClosure = 1;
    this.attackPitch = 0;
    this.feedLoad = 0;
    this.feedTransfer = 0;
    this.feedSide = 1;
    this.feedReady = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.sincePounce = 1;
    this.settle = 0;
    this.contactTarget = null;
    this.contactAge = -1;
    this.targetDistance = Infinity;
    this.chestLoad = 0;
    this.hipPush = 0;
    this.attackKind = null;
    this.attackAge = 1;
    this.castAge = Infinity;
    this.castStrength = 0;
    this.arrival = 0;
    this.arrivalStroke = {};
    this.gatePose = { tuck: 0, front: 0, rear: 0, load: 0, brace: 0, bind: 0, bow: 0,
      ankle: 0, wing: 0, wingGuard: 0, ankleReach: 0, ankleFlinch: 0, exhaustion: 0, anklePresentation: 0,
      kick: 0, strain: 0, tetherJerk: 0, lockReach: 0, lockHang: 0, lockBreath: 0, lockSilhouette: 0, stoneReach: 0, stoneLean: 0, stoneHold: 0, stoneCompression: 0, stairElapsed: null, stairKneel: 0, stairRest: 0, doorGrip: 0,
      lockShockTime: null, lockShock: 0, wingLatchExpose: 0, wingWeight: 0, freeWingSlack: 0,
      contact: 0, push: 0, fallSide: 0, courtWeight: 0, targets: null,
      pawWeight: [0, 0] };
    this.morph = 1;
    this.contactLead = 0;
    this.impact = null;
    this.poseSide = 1;
    this.clawSide = null;
    this.clawSurface = null;
    this.flowDrive = 0;
    this.glideRelax = 0;
    this.bodyBeats = [];
    this.flinch = 0;
    this.flinchSide = 1;
  }

  updateGlidePose(dt) {
    if (this.stage !== 3) {
      this.glideRelax = 0;
      return;
    }
    const level = 1 - smoothstep(Math.abs(this.lift), .35, 1.65);
    const straight = 1 - smoothstep(Math.abs(this.turn), .28, .85);
    const effort = Math.max(this.surge, this.anticipate, this.strike, this.grip,
      this.recoil, this.change, this.castStrength, Math.abs(this.flinch));
    const busy = this.action || this.tailAttack || this.attackKind;
    const target = busy ? 0 : this.air * level * straight
      * smoothstep(this.length, 16, 25)
      * smoothstep(this.speed, 1.9, 5.4)
      * (1 - smoothstep(effort, .06, .42));
    this.glideRelax = approach(this.glideRelax, target, target > this.glideRelax ? 5 : 17, dt);
  }

  bodyBeat(kind, power, side) {
    if (this.bodyBeats.length === 2) this.bodyBeats.shift();
    this.bodyBeats.push({ kind, power, side, age: 0 });
  }

  event(event) {
    const claw = this.action?.kind === 'claw' ? this.action : null;
    const melee = claw ?? (this.action?.kind === 'bite' ? this.action : null);
    const meleePending = melee && melee.releasedAt === undefined;
    if (event.type === 'evolve') {
      this.action = null;
      return;
    }
    if (event.type === 'eat') {
      if (melee && (melee.releasedAt === undefined || melee.age - melee.releasedAt < (melee.hooked ? clawHoldSeconds : .14))) return;
      const strength = .69 + event.rank * .07;
      const pose = feedingPose(this.stage, this.action?.kind === 'eat' ? this.action.target.rank : event.rank);
      if (this.action?.kind === 'eat' && this.action.age < pose.settle) {
        // Several pickups can arrive during a single visible mouthful.
        // Complete its close and swallow before starting another.
        if (this.action.age < pose.take) this.action.strength = Math.max(this.action.strength, strength);
        if (this.action.age < .02 && event.rank > this.action.target.rank) this.action.target = event;
      } else {
        const carried = this.feedCandidate === event.phase ? this.feedReady : 0;
        this.action = { kind: 'eat', age: 0, strength, target: event, carried };
      }
    }
    if (event.type === 'hurt') {
      this.recoil = Math.max(this.recoil, clamp(.32 + event.lost * .19, 0, 1));
      this.impact = { point: event.contact ?? event, strength: this.recoil, age: 0, station: null, side: null };
      for (const beat of this.bodyBeats) beat.power *= .48;
      if (!meleePending) this.action = null;
    }
    if (event.type === 'dash') {
      if (!meleePending) this.action = { kind: 'dash', age: 0, strength: 1 };
      this.bodyBeat('dash', .62, Math.abs(this.turn) > .07 ? Math.sign(this.turn) : this.poseSide);
    }
    if (event.type === 'clawStart') {
      this.action = { id: event.strikeId, kind: event.strike === 'bite' ? 'bite' : 'claw', age: 0,
        windup: event.windup, target: event.to,
        targetId: event.targetId, side: event.side, lead: this.contactLead, readyReach: this.strike };
    }
    if (event.type === 'clawRelease') {
      if (!melee || melee.id !== event.strikeId) return;
      if (event.cancelled) { this.action = null; return; }
      melee.target = event.to ?? melee.target;
      melee.targetId = event.targetId;
      melee.release = { hit: event.hit };
      if (claw) this.bodyBeat('claw', event.hit ? 1 : .64, event.side);
    }
    if (event.type === 'shoot' && event.to && !melee &&
      !(this.action?.kind === 'eat' && this.action.age < feedingPose(this.stage, this.action.target.rank).close)) {
      const profile = breath[event.weapon];
      const kick = profile ? profile.kick + .008 * Math.min(4, Math.max(0, (event.count || 1) - 1)) : 0;
      if (profile && this.action?.kind === 'shoot' && this.action.age < .065) {
        this.action.kick = Math.max(this.action.kick, kick);
        this.action.breathDuration = Math.max(this.action.breathDuration, profile.duration);
        return;
      }
      const distance = Math.hypot(event.to.x - event.x, event.to.y - (event.y ?? this.last?.y ?? event.to.y), event.to.z - event.z);
      const yaw = wrap(Math.atan2(event.to.x - event.x, event.to.z - event.z) - this.heading);
      const close = (1 - smoothstep(distance, 2.1, 5.4)) * (1 - smoothstep(Math.abs(yaw), .48, 1.18));
      const pounce = this.sincePounce > .52 && close > .25 ? close : 0;
      if (pounce > 0) {
        this.sincePounce = 0;
        this.bodyBeat('shoot', pounce, yaw < -.035 ? -1 : 1);
      }
      this.action = { kind: 'shoot', age: 0, strength: .45 + .55 * close, pounce,
        target: event.to, lead: this.contactLead, readyReach: this.strike,
        kick, breathDuration: profile?.duration ?? .39 };
    }
    const attack=this.action;
    if (event.type === 'hit' && attack?.kind === 'shoot' && attack.pounce > 0 &&
      attack.age < .21 && ['poison','bubble','mist','needle','breach'].includes(event.source)) {
      const target=attack.target;
      const separation=Math.hypot(event.x-target.x,event.y-target.y,event.z-target.z);
      if(separation<1.75&&attack.contactAge===undefined){
        attack.contactAge=attack.age;
        attack.target={x:event.x,y:event.y,z:event.z,radius:target.radius};
      }
    }
  }

  locateImpact(spine, spacing) {
    const impact=this.impact;
    if(!impact||impact.station!==null)return;
    const {x,y,z}=impact.point;
    let best=Infinity;
    for(let i=0;i<spine.length;i++){
      const p=spine[i];
      const distance=(p.x-x)**2+(p.y-y)**2+(p.z-z)**2;
      if(distance<best){best=distance;impact.station=i*spacing;}
    }
  }

  poseGesture(frame, dt) {
    const { intent, position, stage } = frame;
    const action = this.action;
    this.sincePounce += dt;
    if (action) action.age += dt;
    const age = action?.age ?? 1;
    const claw = action?.kind === 'claw';
    const biteStrike = action?.kind === 'bite';
    const melee = claw || biteStrike;
    if (melee && action.release && action.releasedAt === undefined) {
      action.releasedAt = age;
      if (action.release.hit) action.contactAge = age;
    }
    const followingClaw = melee && action.releasedAt === undefined && Number.isFinite(intent?.clawIn);
    const actionTime = followingClaw ? -intent.clawIn
      : melee ? age - (action.releasedAt ?? action.windup) : age;
    this.attackKind = action?.kind ?? null;
    this.attackAge = actionTime;
    const breathPhase = action?.kind === 'shoot' ? clamp(age / action.breathDuration, 0, 1) : 1;
    this.attackPitch = action?.kind === 'shoot'
      ? action.kick * (-(1 - smoothstep(breathPhase, 0, 1)) + .38 * Math.sin(Math.PI * breathPhase))
      : 0;
    this.clawSide = claw ? action.side : null;
    this.clawSurface = claw && action.release?.hit ? frame.clawSurface ?? null : null;
    if (this.clawSurface) action.hooked = true;
    const release = (action?.kind === 'shoot' && age < action.breathDuration) || (melee && actionTime < .44);
    const arc = actions[Math.min(stage,actions.length-1)];
    const bitePose = action?.kind === 'eat' ? feedingPose(stage, action.target.rank) : null;
    const takingFood = bitePose && age < bitePose.close;
    const target = !followingClaw && (release || takingFood) ? action.target : intent?.target;
    this.biteProgress = bitePose ? smoothstep(age, .006, bitePose.take) : 1;
    this.biteClosure = bitePose ? smoothstep(age, bitePose.take, bitePose.close) : 1;
    if (bitePose) {
      // The same clock brings the prey to the lips, closes the jaw and
      // sends a travelling contraction back from the throat.
      const throatAge = age - bitePose.close;
      const duration = bitePose.settle - bitePose.close;
      this.swallow = action.strength * pulse(throatAge, .012, .062, duration * .58, duration);
      this.swallowStation = .86 + bitePose.throat * smoothstep(throatAge, .012, duration);
    } else {
      this.swallow = approach(this.swallow, 0, 26, dt);
    }
    const prey = stage <= 2 && intent?.bite && intent.target.rank < 2 ? intent.target : null;
    const interruptIntake = stage === 2 && action && !bitePose;
    let readiness = 0;
    if (prey && !bitePose && !release && !interruptIntake && this.speed > .16) {
      const dx = prey.x - position.x, dz = prey.z - position.z;
      const along = Math.sin(this.heading) * dx + Math.cos(this.heading) * dz;
      const side = Math.cos(this.heading) * dx - Math.sin(this.heading) * dz;
      readiness = (intent.prepare ?? 0) * smoothstep(along, .12, .48)
        * (1 - smoothstep(Math.abs(side), .43, 1.02));
      this.feedCandidate = prey.phase;
      if (Math.abs(side) > .075) this.feedSide = Math.sign(side);
    } else this.feedCandidate = null;
    const carried = action?.carried ?? 0;
    this.feedReady = interruptIntake ? 0 : approach(this.feedReady, readiness, readiness > this.feedReady ? 31 : 18, dt);
    let feedLoad = this.feedReady * .96, feedTransfer = 0;
    if (bitePose && stage <= 2) {
      if (action.feedSide === undefined) {
        const lateral = Math.cos(this.heading) * (action.target.x - position.x)
          - Math.sin(this.heading) * (action.target.z - position.z);
        action.feedSide = Math.abs(lateral) > .10 ? Math.sign(lateral) : Math.sign(this.poseSide) || 1;
      }
      this.feedSide = action.feedSide;
      feedLoad = Math.max(carried * (1 - smoothstep(age, .016, .12)),
        action.strength * pulse(age, -.017, bitePose.open, bitePose.take - .031, bitePose.take + .05));
      feedTransfer = action.strength * pulse(age, bitePose.take - .053, bitePose.take + .021,
        bitePose.close, bitePose.settle);
    }
    this.feedLoad = interruptIntake ? 0 : approach(this.feedLoad, feedLoad, 25, dt);
    this.feedTransfer = interruptIntake ? 0 : approach(this.feedTransfer, feedTransfer, 27, dt);
    const clawGather = melee ? pulse(actionTime, -.15, -.085, -.060, .02) * .82 : 0;
    const prepare = release ? clawGather : (action?.kind !== 'eat' || age > .34) ? intent?.prepare ?? 0 : 0;
    this.contactTarget = release && (claw || action.pounce > .25) ? target : null;
    this.contactAge = action?.contactAge === undefined ? -1 : age-action.contactAge;
    this.targetDistance = target ? Math.hypot(target.x-position.x,target.y-position.y,target.z-position.z) : Infinity;
    const heavy = release ? (melee ? 1 : action.pounce) : 0;
    const near = 1-smoothstep(this.targetDistance,2.2,5.5);
    const direct = target ? 1-smoothstep(Math.abs(wrap(Math.atan2(target.x-position.x,target.z-position.z)-this.heading)),.35,.95) : 0;
    this.castAge = Infinity;
    this.castStrength = 0;
    if (action?.kind === 'shoot') {
      // Time the shoulder and wrist to the release that the player sees.
      action.castStart ??= age;
      this.castAge = age - action.castStart;
      this.castStrength = action.strength;
    } else if (!action && target && !intent?.claw && Number.isFinite(intent?.shootIn)) {
      this.castAge = -intent.shootIn;
      this.castStrength = .45 + .55 * near * direct;
    }
    if (target && !release && prepare > .05) {
      const direction = wrap(Math.atan2(target.x-position.x,target.z-position.z)-this.heading);
      this.poseSide = approach(this.poseSide, direction < -.035 ? -1 : 1, 10, dt);
    }
    const anticipateReach=stage>=2&&!release&&(!action||age>.38)&&Number.isFinite(intent?.shootIn)&&this.sincePounce>.52
      ? (1-smoothstep(intent.shootIn,.018,.118))*direct*(1-smoothstep(this.targetDistance,1.85,3.5)):0;
    this.contactLead=release?action.lead:anticipateReach;
    if(anticipateReach>.001){
      this.contactTarget=target;
      this.attackKind=intent.claw?'claw':'shoot';
      this.attackAge=-intent.shootIn;
    }
    const preload = prepare * (.34+.66*near);
    const follow = heavy*pulse(actionTime,.036,.113,.175,.35);
    this.chestLoad = approach(this.chestLoad, preload, 12, dt);
    this.hipPush = approach(this.hipPush, follow, 14, dt);
    const bite = !action && intent?.bite ? prepare : 0;
    let reach = .76*anticipateReach, grip = 0, jaw = Math.max(prepare * .31 + bite * .15, .59 * this.feedReady);
    if (claw) {
      const carried = action.readyReach * (1 - smoothstep(actionTime, -.045, .10));
      reach = Math.max(carried, pulse(actionTime, -.122, -.011, .055, .34));
      grip = this.contactAge >= 0
        ? pulse(this.contactAge, -.018, .062, .117, .31)
        : .32 * pulse(actionTime, .025, .09, .10, .23);
      jaw = .37 * pulse(actionTime, -.104, -.022, .046, .19);
    } else if (biteStrike) {
      reach = pulse(actionTime, -.09, -.012, .045, .23) * (action.release?.hit === false ? .62 : .85);
      jaw = .77 * pulse(actionTime, -.14, -.060, -.020, .056);
    } else if (action?.kind === 'shoot') {
      const carry=action.readyReach*(1-smoothstep(age,.012,.16))*action.lead;
      reach = Math.max(carry,(.32 + .68 * action.pounce) * pulse(age, ...arc.reach));
      const closeAt = action.contactAge ?? .09;
      const pressure = action.contactAge === undefined ? .38 : 1;
      const grasp = action.contactAge!==undefined && action.lead>.25
        ? pulse(age-closeAt,-.021,.025,.11,.29):pulse(age-closeAt,...arc.grip);
      grip = action.pounce * pressure * grasp;
      jaw = Math.max(jaw, action.strength * pulse(age, ...arc.jaw));
    } else if (bitePose) {
      const { open, take, close, reach: extension, settle } = bitePose;
      const opening = Math.max(smoothstep(age, -.022, open), carried * .86);
      jaw = action.strength * opening * (1 - this.biteClosure);
      reach = extension * action.strength * pulse(age, -.022, take, take + .025, close + .085);
      grip = .47 * action.strength * pulse(age, take - .024, take + .063, close, settle);
    } else if (action?.kind === 'dash') {
      reach = .69 * pulse(age, -.032, .07, .16, .38);
    }
    if (actionTime > (bitePose?.settle ?? .46)) this.action = null;
    let yaw = 0, pitch = 0;
    if (target) {
      const x = target.x - position.x, z = target.z - position.z;
      const horizontal = Math.max(.8, Math.hypot(x, z));
      const rawYaw = wrap(Math.atan2(x, z) - this.heading);
      const look = 1 - smoothstep(Math.abs(rawYaw), 1.25, 2.6);
      yaw = clamp(rawYaw, -.47, .47) * look;
      pitch = clamp(Math.atan2(target.y - position.y, horizontal), -.34, .36) * look;
    }
    if (takingFood) {
      if (age < bitePose.take || action.foodYaw === undefined) {
        action.foodYaw = yaw;
        action.foodPitch = pitch;
      } else {
        const settleAim = 1 - .54 * this.biteClosure;
        yaw = action.foodYaw * settleAim;
        pitch = action.foodPitch * settleAim;
      }
    }
    const loss = 1 - this.recoil * .62;
    this.aimYaw = approach(this.aimYaw, yaw, 12, dt);
    this.aimPitch = approach(this.aimPitch, pitch, 12, dt);
    this.settle = approach(this.settle, intent?.settle ?? 0, 3.2, dt);
    this.anticipate = approach(this.anticipate, prepare * loss, release ? 21 : 15, dt);
    this.strike = approach(this.strike, reach * loss, 23, dt);
    this.grip = approach(this.grip, (stage >= 2 ? grip : 0) * loss, 19, dt);
    this.jaw = approach(this.jaw, jaw * loss, bitePose ? 38 : 26, dt);
  }

  update(frame, dt) {
    const { stage, chapter=stage, heading, position, length, time, seaPose } = frame;
    this.stage = stage;
    const style = profiles[stage];
    const target = Math.max(.7, length * .65 * (1 + stage * .08));
    const last = this.last;
    const fresh = !last || time < last.time;
    const changed = last && !fresh && last.stage !== stage;
    // Yinglong can already be on screen over the sea. Carry its scale
    // through the later map cut and let the new display length ease in.
    const chapterCut = !fresh && stage===4 && chapter===3 && last.chapter===2 && Boolean(frame.chapterWing);
    const dx = last ? position.x - last.x : 0;
    const dy = last ? position.y - last.y : 0;
    const dz = last ? position.z - last.z : 0;
    const planar = Math.hypot(dx, dz);
    const relocated = Math.hypot(planar, dy) > Math.max(2, dt * 24);
    const airborne = stage < 2 ? 0 : chapter >= 3 ? 1 : smoothstep(position.y, .9, 2.2);
    if (chapterCut) {
      this.heading += wrap(heading - last.heading);
    } else if (fresh || relocated) {
      this.heading = heading;
      this.speed = this.drive = this.surge = this.turn = this.bank = this.lift = this.pitch = 0;
      this.flowDrive = 0;
      this.air = airborne;
      this.recoil = this.swallow = 0;
    }
    if (fresh || (relocated && !changed && !chapterCut)) {
      this.length = target;
      this.lengthVelocity = 0;
      this.phase = 0;
      this.flightPhase = 0;
      this.change = 0;
    }
    if (changed) this.change = 1;
    if (changed || fresh || relocated) {
      this.bodyBeats.length = 0;
      if (changed) { this.action = null; this.impact = null; }
    }
    for (const beat of this.bodyBeats) beat.age += dt;
    if (this.bodyBeats[0]?.age > 1.19) this.bodyBeats.shift();
    if(this.impact){
      this.impact.age+=dt;
      if(this.impact.age>1.03)this.impact=null;
    }
    this.flinch=0;
    if(this.impact){
      const hit=this.impact;
      if(hit.side===null){
        const offset=Math.cos(heading)*(hit.point.x-position.x)-Math.sin(heading)*(hit.point.z-position.z);
        hit.side=Math.abs(offset)>.18?-Math.sign(offset):this.poseSide;
      }
      const peak=[.048,.076,.060,.061,.056][stage];
      const snap=pulse(hit.age,-.012,peak,peak+.034,stage===1||stage===3 ? .285 : .244);
      const settle=stage===3 ? .20*pulse(hit.age,.224,.335,.369,.514)
        : .26*pulse(hit.age,.192,.302,.338,.478);
      this.flinch=hit.strength*(snap-settle);
      this.flinchSide=hit.side;
    }
    this.change = approach(this.change, 0, 3.5, dt);

    if (!fresh && !relocated && dt > 0) {
      const velocity = Math.min(planar / dt, 22);
      const vy = clamp(dy / dt, -9, 9);
      this.speed = approach(this.speed, velocity, velocity > this.speed ? 9 : 5, dt);
      this.drive = smoothstep(this.speed, .15, 5.9);
      this.flowDrive = approach(this.flowDrive, this.drive, this.drive > this.flowDrive ? 6.7 : 3.1, dt);
      this.surge = approach(this.surge, Math.max(smoothstep(this.speed, 7.0, 15), position.dash > 0 ? .8 : 0), 8, dt);
      this.air = approach(this.air, airborne, 5, dt);
      this.lift = approach(this.lift, vy, 8, dt);

      const yawDelta = wrap(heading - this.heading);
      const rate = clamp(yawDelta * 17, -style.yaw, style.yaw);
      this.heading += rate * dt;
      // Body roll carries momentum into the turn and settles as the heading catches up.
      const lateral = (Math.cos(heading) * dx - Math.sin(heading) * dz) / dt;
      this.turn = approach(this.turn, clamp(rate * .17 + lateral * (stage >= 3 ? .26 : .09), -1, 1), 8, dt);
      const pitch = Math.atan2(this.lift, Math.max(3.6, this.speed));
      if (seaPose) {
        const descent = smoothstep(-seaPose.vertical, .23, 2.04) * smoothstep(seaPose.height, .73, 1.49);
        const rise = smoothstep(seaPose.vertical, .38, 2.7);
        const wet = 1 - smoothstep(seaPose.height, 1.02, 1.85);
        const impact = seaPose.impactAge;
        const dip = (1 - smoothstep(impact, .08, .23)) * .12;
        const rebound = smoothstep(impact, .085, .24) * (1 - smoothstep(impact, .25, .51)) * .23;
        const crosscut = wet * this.surge * Math.abs(this.turn);
        const bank = this.turn * style.bank * lerp(.60, 1, this.air) * lerp(1, .43, descent);
        this.bank = approach(this.bank, bank + .13 * crosscut * Math.sign(this.turn), 10, dt);
        this.pitch = approach(this.pitch, clamp(pitch + .13 * rise - .25 * descent - dip + rebound, -.64, .47), 11, dt);
      } else {
        this.bank = approach(this.bank, this.turn * style.bank * lerp(.54, 1, this.air), 7, dt);
        this.pitch = approach(this.pitch, clamp(pitch, -style.pitch, style.pitch), 9, dt);
      }

      const jump = changed ? 0 : target - last.target;
      this.recoil = Math.min(1, approach(this.recoil, 0, 6.6, dt) + Math.max(0, -jump - .08) * .62);
    }

    let lockLook=0, lockRelease=0, lockExhale=0, lookDown=0, gateDrive=0, courtBow=0;
    if (stage === 4) {
      const gate = frame.finale, pose = this.gatePose;
      pose.stairLandmark=frame.lockLandingLandmark;
      const stomp = gate?.phase === 'stomp';
      const blessing = gate?.phase === 'blessing';
      const audience = gate?.phase === 'audience';
      const locked = gate?.phase === 'lock' || gate?.phase === 'complete' && gate.ending === 'locked';
      const age = gate?.age ?? 0, impact = gate?.impactAt ?? 1.05;
      const fracture = impact + STOMP_LOAD;
      pose.tuck = stomp ? pulse(age, 0, .34, impact + .25, fracture + .24) : 0;
      pose.front = stomp ? pulse(age, .52, impact - .04, fracture + .02, fracture + .45) : 0;
      pose.rear = stomp ? pulse(age, .78, impact + .24, fracture + .10, fracture + .66) : 0;
      pose.load = stomp ? pulse(age, impact - .035, impact + .21, fracture, fracture + .33) : 0;
      pose.brace = stomp ? pulse(age, .15, .90, fracture + .34, 2.84) : 0;
      pose.targets = frame.gatePawTargets;
      pose.courtLandmark = frame.courtLandmark;
      pose.courtAge = audience ? age : 0;
      pose.pawWeight[0] = stomp ? pulse(age, .76, impact, fracture - .025, fracture + .14) : 0;
      pose.pawWeight[1] = stomp ? pulse(age, .83, impact + STOMP_PAW_GAP, fracture + .03, fracture + .21) : 0;
      pose.contact = Math.max(pose.pawWeight[0],pose.pawWeight[1]);
      pose.doorGrip=0;
      pose.landingFold = stomp ? pulse(age, impact - .39, impact + .018, fracture + .08, fracture + .38) : 0;
      pose.push = stomp ? pulse(age, fracture + .015, fracture + .32, fracture + .52, fracture + .90) : 0;
      pose.courtWeight = audience ? pulse(age, 1.40, 2.20, COURT_SEAL_AT+.19, 4.27) : 0;
      pose.fallSide = Math.tanh((gate?.start?.x ?? 0) * .46);
      if (audience) {
        const brake = pulse(age, 1.13, 1.60, 1.76, 2.18);
        const accept = pulse(age, 2.14, 2.66, COURT_SEAL_AT + .13, 4.25);
        pose.front = pulse(age, 1.31, 1.63, 2.30, 2.58);
        pose.tuck = pulse(age, 1.43, 2.18, 3.76, 4.30);
        pose.pawWeight[0] = pulse(age, 1.39, COURT_PAW_STEPS[0], 3.69, 3.98);
        pose.pawWeight[1] = pulse(age, 1.87, COURT_PAW_STEPS[1]+.035, 3.80, 4.12);
        pose.contact = Math.max(...pose.pawWeight);
        courtBow = .87 * accept;
        pose.bow = accept;
        this.pitch = lerp(this.pitch, .21, brake * .68);
        this.pitch = lerp(this.pitch, -.33, .95 * accept);
        this.bank -= .14 * (pose.pawWeight[0] - pose.pawWeight[1]);
      } else pose.bow = 0;
      pose.ankle = locked ? smoothstep(age, GATE_BIND.ankle-.04, GATE_BIND.ankle+.15) : 0;
      pose.ankleReach = locked ? pulse(age,GATE_BIND.ankle-.30,GATE_BIND.ankle-.05,GATE_BIND.ankle+.035,GATE_BIND.ankle+.27) : 0;
      pose.anklePresentation = locked ? pulse(age,GATE_BIND.ankle-.30,GATE_BIND.ankle-.025,GATE_BIND.ankle+.11,GATE_BIND.ankle+.40) : 0;
      pose.ankleFlinch = locked ? pulse(age,GATE_BIND.ankle-.15,GATE_BIND.ankle+.055,GATE_BIND.ankle+.18,GATE_BIND.ankle+.45) : 0;
      pose.exhaustion = locked ? smoothstep(age,GATE_BIND.latch+1.05,GATE_BIND.latch+1.94) : 0;
      pose.wingGuard = locked ? pulse(age,GATE_BIND.wing-.08,GATE_BIND.wing+.04,GATE_BIND.wing+.16,GATE_BIND.wing+.38) : 0;
      pose.wing = locked ? smoothstep(age, GATE_BIND.wing-.02, GATE_BIND.wing+.19) : 0;
      pose.kick = locked ? pulse(age,GATE_BIND.ankle+.05,GATE_BIND.ankle+.26,GATE_BIND.ankle+.38,GATE_BIND.ankle+.56) : 0;
      pose.bind = locked ? smoothstep(age, GATE_BIND.latch-.035, GATE_BIND.latch+.22) : 0;
      pose.tetherJerk = locked ? pulse(age,GATE_BIND.wing+.01,GATE_BIND.wing+.13,GATE_BIND.wing+.22,GATE_BIND.wing+.40) : 0;
      pose.strain = locked ? .58*pulse(age,GATE_BIND.wing+.32,GATE_BIND.wing+.55,GATE_BIND.latch-.25,GATE_BIND.latch+.07) : 0;
      if (stomp) {
        const dive = pulse(age, .08, .48, .70, impact + .12);
        this.pitch = lerp(this.pitch, -.63, dive * .72);
        this.pitch = lerp(this.pitch, -.13, pose.load * .82);
        this.pitch = lerp(this.pitch, .29, pose.push * .86);
      }
      if (locked) {
        const {ankle,wing,latch}=GATE_BIND;
        const elapsed=gate.elapsed??age;
        pose.lockShockTime=elapsed<.91?elapsed:null;
        pose.lockShock=pulse(elapsed,0,.15,.23,.67);
        const firstReach=pulse(age,.24,.54,ankle-.06,ankle+.18);
        const secondReach=pulse(age,ankle+.48,wing-.24,wing-.04,wing+.18);
        gateDrive=Math.max(firstReach,secondReach);
        const {skid,catch:catchPaw,compression,rebound,release,rest}=LOCK_LANDING;
        const reachAfterFall=pulse(elapsed,14.57,LOCK_STAIR.touch,LOCK_STAIR.lip,rest-.53);
        const recoilOnStone=pulse(elapsed,skid,catchPaw,16.46,17.22);
        const compress=pulse(elapsed,catchPaw-.13,compression,compression,rebound);
        const kick=pulse(elapsed,compression,rebound,rebound,release);
        const lastPull=pulse(elapsed,9.41,10.13,10.24,11.34);
        const snag=pulse(elapsed,LOCK_SNAG.start,LOCK_SNAG.peak,LOCK_SNAG.release,LOCK_SNAG.end);
        const drop=pulse(elapsed,13.85,14.49,15.06,15.80);
        const doorReach=pulse(elapsed,LOCK_DOOR.reach,LOCK_DOOR.grip-.13,LOCK_DOOR.release,LOCK_DOOR.release+.24);
        pose.lockReach=Math.max(firstReach*.69,secondReach,.41*reachAfterFall,.58*doorReach);
        pose.pawWeight[0]=pose.targets?pulse(elapsed,LOCK_DOOR.grip-.25,LOCK_DOOR.grip,LOCK_DOOR.release-.022,LOCK_DOOR.release+.20):0;
        pose.contact=pose.pawWeight[0];
        pose.doorGrip=pulse(elapsed,LOCK_DOOR.grip-.09,LOCK_DOOR.pull,LOCK_DOOR.release-.04,LOCK_DOOR.release+.15);
        pose.stoneReach=smoothstep(elapsed,14.77,LOCK_STAIR.touch+.14);
        pose.stairElapsed=elapsed>=14.77?elapsed:null;
        pose.stoneLean=smoothstep(elapsed,LOCK_SETTLE.load,LOCK_SETTLE.rest);
        const chainStop=pulse(elapsed,LOCK_SETTLE.load,LOCK_SETTLE.arrest,LOCK_SETTLE.arrest,LOCK_SETTLE.rest);
        pose.stoneHold=smoothstep(elapsed,LOCK_STAIR.touch,LOCK_STAIR.touch+.44);
        pose.stoneCompression=compress;
        pose.lockSilhouette=pulse(elapsed,7.57,8.24,8.77,9.54);
        pose.wingLatchExpose=pulse(elapsed,8.33,8.61,8.95,9.38);
        pose.lockHang=smoothstep(age,wing+.13,latch+.64);
        pose.wingWeight=smoothstep(elapsed,13.92,15.08);
        pose.freeWingSlack=smoothstep(elapsed,14.96,17.34);
        pose.lockBreath=.62*pulse(elapsed,14.15,14.73,14.98,15.77)
          + .28*pulse(elapsed,16.05,16.83,17.06,17.54)
          + .12*pulse(elapsed,18.05,18.38,18.63,19.09);
        this.bank = clamp(this.bank + .27 * pose.tetherJerk - .18 * pose.strain
          + .15*secondReach + .13*pose.lockHang + .048*pose.lockBreath -.20*pose.lockSilhouette
          - .27*lastPull - .19*pose.stoneReach - .16*recoilOnStone + .35*pose.stoneLean - .13*chainStop + .34*snag - .18*drop
          - .36*pose.lockShock, -.62,.62);
        lookDown=pulse(elapsed,14.76,skid,16.53,17.31);
        const lastLook=.31*pulse(elapsed,17.15,17.47,17.52,18.15);
        lockLook=Math.max(.86*gateDrive,lastLook,.78*doorReach);
        lockRelease=smoothstep(elapsed,17.35,LOCK_SETTLE.exhale);
        lockExhale=.62*pulse(elapsed,15.03,15.39,15.67,16.35)+.53*pulse(elapsed,18.08,18.36,18.64,19.04);
        this.pitch = lerp(this.pitch, -.11, firstReach*.66);
        this.pitch = lerp(this.pitch, .29, secondReach*.85);
        this.pitch = lerp(this.pitch, .41, pose.strain * .66);
        this.pitch = lerp(this.pitch, .18, .62*lockLook);
        this.pitch = lerp(this.pitch,-.21,doorReach*.70);
        this.pitch += .22*lastLook - .23*lookDown - .05*pose.lockBreath + .24*lastPull
          - .14*pose.stoneReach + .12*recoilOnStone - .11*compress + .21*kick - .19*chainStop + .51*snag - .31*drop - .41*pose.lockShock;
        const kneel=smoothstep(elapsed,LOCK_STAIR.lower,LOCK_STAIR.rest);
        pose.stairKneel=kneel;
        const lying=smoothstep(elapsed,17.24,18.22);
        this.pitch = lerp(this.pitch, .24, kneel*.97);
        pose.stairRest=lying;
        this.pitch=lerp(this.pitch,-.04,lying);
        this.bank=lerp(this.bank,.55,lying*.86);
      } else {
        pose.lockReach=0;
        pose.lockHang=0;
        pose.wingWeight=0;
        pose.freeWingSlack=0;
        pose.lockBreath=0;
        pose.lockSilhouette=0;
        pose.wingLatchExpose=0;
        pose.stoneReach=0;
        pose.stairElapsed=null;
        pose.stairKneel=0;
        pose.stairRest=0;
        pose.stoneLean=0;
        pose.stoneHold=0;
        pose.stoneCompression=0;
        pose.lockShockTime=null;
        pose.lockShock=0;
      }
      this.arrival = frame.intent?.arrived ? Math.min(1,this.arrival+dt/1.4) : 0;
      flightArrival(this.arrival,this.arrivalStroke);
      const climb = smoothstep(this.lift, .05, 2.3);
      const descent = smoothstep(-this.lift, .02, 1.6);
      const power = clamp(.44 + .23 * this.drive + .41 * climb + .25 * this.change
        + .14 * Math.abs(this.turn) - .24 * descent - .16 * this.surge, 0, 1);
      const chapterWing = frame.chapterWing;
      const rainStroke = blessing ? pulse(age, .50, 1.05, 1.60, 2.16) : 0;
      pose.rainBend = blessing ? pulse(age, .46, 1.06, 2.16, 3.17) : 0;
      pose.rainPress = blessing ? pulse(age, 1.13, 1.46, 1.65, 2.03) : 0;
      const effort = lerp(Math.max(power * (1 - .78 * pose.tuck) * (1 - .83 * pose.bind), pose.strain, rainStroke, gateDrive),
        .98, chapterWing?.force ?? 0);
      this.wingPower = approach(this.wingPower, effort, 3.6, dt);
      const liveWing = this.wingPhase + dt * (.36 + .20 * this.wingPower + .16 * pose.strain)
        * (1 - .86 * pose.bind * (1 - pose.strain)) * (1 - pose.lockHang);
      // Open and hold briefly, then press once. The fastest part of the
      // stroke coincides with the first rain leaving the outer feathers.
      const rainWing = .85 + .253 * smoothstep(age, .25, .86)
        + .352 * smoothstep(age, BLESSING_RAIN_AT - .13, BLESSING_RAIN_AT + .28)
        + .055 * smoothstep(age, 1.52, 1.85)
        + .23 * smoothstep(age, 1.88, 2.53);
      const strokeTurn = rainWing - liveWing;
      const strokeCorrection = strokeTurn - Math.round(strokeTurn);
      const pushStroke = .03 + .56*smoothstep(age,GATE_BIND.ankle+.42,GATE_BIND.wing-.04);
      const pushDelta = pushStroke-liveWing;
      const pressWing = locked ? gateDrive*pose.lockReach*smoothstep(age,GATE_BIND.ankle+.43,GATE_BIND.ankle+.70) : 0;
      this.wingPhase = chapterWing?.phase ?? liveWing + (pushDelta - Math.round(pushDelta)) * pressWing
        + strokeCorrection * smoothstep(age, .09, .38) * (blessing ? 1 - smoothstep(age, 2.20, 2.70) : 0);
      if (audience) {
        const rest = .35 + .25 * smoothstep(age, 1.36, 2.02);
        const difference = rest - this.wingPhase;
        this.wingPhase += (difference - Math.round(difference)) * pose.tuck;
      }
      this.flightPhase = this.wingPhase;
      flightStroke(this.wingPhase, this.wingStroke);
    } else if (stage === 3) {
      this.flightPhase += dt * (.20 + .20 * this.drive + .035 * Math.abs(this.lift));
    }
    this.poseGesture(frame, dt);
    if (stage === 4 && this.gatePose.rainPress > 0) {
      this.aimPitch=lerp(this.aimPitch,-.27,.78*this.gatePose.rainPress);
    }
    if (courtBow > 0) {
      this.aimYaw *= 1 - courtBow;
      this.aimPitch = lerp(this.aimPitch, -.39, courtBow);
    }
    if(lockLook||lockRelease||lockExhale||lookDown){
      const gate=frame.finale.threshold;
      const dx=gate.x-position.x,dz=gate.z-position.z;
      const atGate=wrap(Math.atan2(dx,dz)-this.heading);
      const elevation=clamp(Math.atan2(gate.y-position.y,Math.hypot(dx,dz)),-.21,.41);
      this.aimYaw=lerp(this.aimYaw,clamp(atGate,-.38,.38),.92*lockLook);
      this.aimPitch=lerp(this.aimPitch,elevation,lockLook);
      this.aimPitch=lerp(this.aimPitch,-.39,lookDown);
      this.aimPitch=lerp(this.aimPitch,.04,lockRelease*.88);
      this.jaw=Math.max(this.jaw,lockExhale);
    }
    if (stage < 2) {
      // Stroke follows travelled distance. A stopped animal settles into a
      // slow water drift rather than running through a swimming cycle.
      const travelled = fresh || relocated || changed ? 0 : planar;
      const stroke = Math.min(travelled * (2 * Math.PI / surfaceStride[stage]), dt * style.swimRate * 1.35);
      this.phase += stroke + dt * (stage === 0 ? .58 : .40) * (1 - this.drive);
    } else if (stage === 3) {
      const swimRate = style.swimRate * (.25 + this.drive * .75 + this.surge * .36);
      const flightRate = (.20 + .20 * this.drive + .035 * Math.abs(this.lift)) * 2 * Math.PI;
      this.phase += dt * lerp(swimRate, flightRate, this.air);
    } else {
      this.phase += dt * style.swimRate * (.25 + this.drive * .75 + this.surge * .36);
    }
    const difference = this.length - target;
    if (difference * this.lengthVelocity > 0) this.lengthVelocity = 0;
    const rate = this.change > .05 ? 13.6 : difference > 0 ? 13.2 : 9.2;
    const slope = this.lengthVelocity + rate * difference;
    const decay = Math.exp(-rate * dt);
    this.length = target + (difference + slope * dt) * decay;
    this.lengthVelocity = (this.lengthVelocity - slope * rate * dt) * decay;
    if (Math.abs(this.length - target) < .001 && Math.abs(this.lengthVelocity) < .01) {
      this.length = target;
      this.lengthVelocity = 0;
    }
    this.last = { stage, chapter, time, target, heading, x: position.x, y: position.y, z: position.z };
  }
}
