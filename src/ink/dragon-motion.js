import { MathUtils } from 'three';
import { flightArrival, flightStroke } from './growth/flight-stroke.js';
import { clawHoldSeconds } from './claw-surface.js';

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
    this.morph = 1;
    this.contactLead = 0;
    this.impact = null;
    this.poseSide = 1;
    this.clawSide = null;
    this.clawSurface = null;
    this.flowDrive = 0;
    this.bodyBeats = [];
    this.flinch = 0;
    this.flinchSide = 1;
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
    const { stage, heading, position, length, time, seaPose } = frame;
    this.stage = stage;
    const style = profiles[stage];
    const target = Math.max(.7, length * .65 * (1 + stage * .08));
    const last = this.last;
    const fresh = !last || time < last.time;
    const changed = last && !fresh && last.stage !== stage;
    const dx = last ? position.x - last.x : 0;
    const dy = last ? position.y - last.y : 0;
    const dz = last ? position.z - last.z : 0;
    const planar = Math.hypot(dx, dz);
    const relocated = Math.hypot(planar, dy) > Math.max(2, dt * 24);
    const airborne = stage >= 3 ? 1 : stage === 2 ? smoothstep(position.y, .9, 2.2) : 0;
    if (fresh || relocated) {
      this.heading = heading;
      this.speed = this.drive = this.surge = this.turn = this.bank = this.lift = this.pitch = 0;
      this.flowDrive = 0;
      this.air = airborne;
      this.recoil = this.swallow = 0;
    }
    if (fresh || (relocated && !changed)) {
      this.length = target;
      this.lengthVelocity = 0;
      this.phase = 0;
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
      this.turn = approach(this.turn, clamp(rate * .17 + lateral * (stage === 4 ? .26 : .09), -1, 1), 8, dt);
      const pitch = Math.atan2(this.lift, Math.max(3.6, this.speed));
      if (stage === 2 && seaPose) {
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

    if (stage === 4) {
      this.arrival = frame.intent?.arrived ? Math.min(1,this.arrival+dt/1.4) : 0;
      flightArrival(this.arrival,this.arrivalStroke);
      const climb = smoothstep(this.lift, .05, 2.3);
      const descent = smoothstep(-this.lift, .02, 1.6);
      const power = clamp(.20 + .18 * this.drive + .60 * climb + .32 * this.change
        + .14 * Math.abs(this.turn) - .24 * descent - .16 * this.surge, 0, 1);
      this.wingPower = approach(this.wingPower, power, 3.6, dt);
      this.wingPhase += dt * (.37 + .19 * this.wingPower);
      flightStroke(this.wingPhase, this.wingStroke);
    }
    this.poseGesture(frame, dt);
    if (stage < 2) {
      // Stroke follows travelled distance. A stopped animal settles into a
      // slow water drift rather than running through a swimming cycle.
      const travelled = fresh || relocated || changed ? 0 : planar;
      const stroke = Math.min(travelled * (2 * Math.PI / surfaceStride[stage]), dt * style.swimRate * 1.35);
      this.phase += stroke + dt * (stage === 0 ? .58 : .40) * (1 - this.drive);
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
    this.last = { stage, time, target, x: position.x, y: position.y, z: position.z };
  }
}
