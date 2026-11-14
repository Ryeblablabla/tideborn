import * as THREE from 'three';
import { BLESSING_RAIN_AT, COURT_SEAL_AT, GATE_BIND, LOCK_DOOR, LOCK_STAIR, STOMP_DURATION, STOMP_LOAD, STOMP_PAD } from '../heaven-finale.js';
import { GATE_RELEASE_INSERT } from './heaven-finale.js';

function stompContactShot(finale) {
  return finale?.phase==='stomp'&&finale.age>=finale.impactAt-.19
    &&finale.age<finale.impactAt+STOMP_LOAD+.50;
}

const UP = new THREE.Vector3(0, 1, 0);
const courtWingSection = [0, 1, .255];
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const rainSpillCutAt = 2.60;
const blessingCutAt = .68;
const courtPageAt = 2.69;
const courtContactAt = 1.43;
const lockSeatFrom = LOCK_DOOR.reach+.79;
const lockSeatUntil = LOCK_DOOR.release+.18;
const lockFallFrom = 12.83;
const lockRestFrom = 17.48;
const lockStoneFrom = 5.60;
const lockStoneThrough = 7.33;
const surfaceCamera = [
  { height: 14, distance: 22, azimuth: .32, zoom: 1.28 },
  { height: 24, distance: 28, azimuth: .37, zoom: .97 },
  { height: 13, distance: 27, azimuth: .23, zoom: 1.07 },
];
const surfaceFollow = [
  { height: 12.2, distance: 22.5, ahead: 3.1, shoulder: 2.6, fov: 52 },
  { height: 14.2, distance: 31.5, ahead: 5.4, shoulder: 3.1, fov: 49 },
  { height: 9.5, distance: 28.5, ahead: 4.1, shoulder: 3.3, fov: 49 },
];

/** Independent of the legacy world's camera update. */
export class InkCamera {
  constructor(flatCamera) {
    this.flat = flatCamera;
    this.flight = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, .12, 290);
    this.focus = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.smoothedTarget = new THREE.Vector3();
    this.finalEye = new THREE.Vector3();
    this.finalAim = new THREE.Vector3();
    this.lightningTarget = new THREE.Vector3();
    this.gateLocal = new THREE.Vector3();
    this.finalPaw = new THREE.Vector3();
    this.finalShoulder = new THREE.Vector3();
    this.stompLeadEye = new THREE.Vector3();
    this.stompLeadAim = new THREE.Vector3();
    this.stompLeadFov = 49;
    this.roofBody = new THREE.Vector3();
    this.roofImpact = new THREE.Vector3();
    this.stompLead = null;
    this.stompArc = new THREE.Vector3();
    this.lockAnkle = new THREE.Vector3();
    this.lockBolt = new THREE.Vector3();
    this.lockWingAim = new THREE.Vector3();
    this.lockCuffSight = new THREE.Vector3();
    this.lockHand = new THREE.Vector3();
    this.lockPaw = new THREE.Vector3();
    this.lockMuzzle = new THREE.Vector3();
    this.lockAnchor = new THREE.Vector3();
    this.lockStrain = new THREE.Vector3();
    this.rainSpine = new THREE.Vector3();
    this.rainFlightTarget = new THREE.Vector3();
    this.courtFramePoints = [];
    this.courtFrameProbe = new THREE.PerspectiveCamera();
    this.courtFrameProjected = new THREE.Vector3();
    this.courtFrameCenter = new THREE.Vector3();
    this.rainCutProjection = { finale: null, head: new THREE.Vector3(), tail: new THREE.Vector3() };
    this.finalPhase = null;
    this.followPivot = new THREE.Vector3();
    this.followYaw = 0;
    this.turnRoom = 0;
    this.bodyLift = 0;
    this.terrainBoom = 1;
    this.terrainLift = 0;
    this.terrainEye = new THREE.Vector3();
    this.terrainHead = new THREE.Vector3();
    this.terrainTorso = new THREE.Vector3();
    this.terrainTest = new THREE.Vector3();
    this.receiverView = new THREE.Vector3();
    this.terrainSideShift = 0;
    this.shoulder = -2.2;
    this.shoulderSide = -1;
    this.openShoulder = false;
    this.impactAim = new THREE.Vector3();
    this.impactMagnitude = 0;
    this.handoffShoulder = 0;
    this.handoffRise = 0;
    this.handoffTravel = 0;
    this.riftYaw = 0;
    this.riftAmount = 0;
    this.riftFov = 0;
    this.riftRotation = new THREE.Quaternion();
    this.riftOrbit = false;
    this.riftDolly = 0;
    this.riftPan = new THREE.Vector3();
    this.riftAim = new THREE.Vector3();
    this.riftHead = new THREE.Vector3();
    this.riftEnd = new THREE.Vector3();
    this.riftBasis = new THREE.Vector3();
    this.riftAcross = new THREE.Vector3();
    this.riftUp = new THREE.Vector3();
    this.riftProbe = new THREE.Vector3();
    this.combatCenter = new THREE.Vector3();
    this.combatEye = new THREE.Vector3();
    this.combatAim = new THREE.Vector3();
    this.combatAxis = new THREE.Vector3();
    this.combatAcross = new THREE.Vector3();
    this.combatUp = new THREE.Vector3();
    this.combatProbe = new THREE.Vector3();
    this.combatEyeOffset = new THREE.Vector3();
    this.combatAimOffset = new THREE.Vector3();
    this.combatRotation = new THREE.Quaternion();
    this.combatStrength = 0;
    this.combatFov = 0;
    this.combatMoveId = null;
    this.combatMoveFraming = false;
    this.combatOrbit = false;
    this.camera = this.flat;
  }
  resize() {
    this.flight.aspect = innerWidth / innerHeight;
    this.flight.updateProjectionMatrix();
  }
  set(frame, dt, { menu, study, chapter=frame.stage, forceFollow, landmark, ascending, ascentOrigin, terrainHeight, mountainRiver, finale, finaleContacts, chapterExit=0, impact, riftView, combatView, clearCombatView, steadyCombat=false, shoreLook }) {
    const stage = chapter;
    this.focus.set(frame.position.x, frame.position.y, frame.position.z);
    this.forward.set(Math.sin(frame.heading), 0, Math.cos(frame.heading));
    this.right.crossVectors(this.forward, UP);
    const follow = !menu && (!study || forceFollow || stage >= 3);
    const surface = !study && stage < 3 ? surfaceFollow[stage] : null;
    const gateView = stage === 4 && Boolean(landmark) && (study || ascending || Boolean(ascentOrigin));
    const view = `${stage}:${follow}:${menu}:${study}`;
    const mode = `${view}:${gateView}`;
    const switched = this.mode !== mode;
    const leavingCruise = gateView && this.mode === `${view}:false`;
    const leavingMountain = !gateView && stage === 4 && this.mode === `3:${follow}:${menu}:${study}:false`;
    this.mode = mode;

    if (follow) {
      this.camera = this.flight;
      if (gateView) {
        if (switched) this.smoothedTarget.copy(this.target);
        landmark.getWorldPosition(this.aim);
        this.aim.y += 11;
        if (ascentOrigin) this.forward.set(Math.sin(ascentOrigin.angle), 0, Math.cos(ascentOrigin.angle));
        this.right.crossVectors(this.forward, UP);
        const bodyLength = frame.length * .65 * (1 + stage * .08);
        const portrait = this.flight.aspect < 1;
        const distance = Math.max(portrait ? 26 : 23, bodyLength + 11);
        const gateDistance=this.aim.distanceTo(this.focus);
        const shoulder=portrait?1.4:3.9+3.7*THREE.MathUtils.smoothstep(gateDistance,14,42);
        this.eye.copy(this.focus).addScaledVector(this.forward,-distance).addScaledVector(this.right,-shoulder);
        this.eye.y -= 1.1;
        this.target.copy(this.focus).lerp(this.aim, .58);
        this.target.y += 1.1;
        this.flight.fov = this.flight.aspect < 1 ? 66 : 53;
        if(finale){
          this.composeHeaven(frame,landmark,finale,finaleContacts??frame.finalPaws);
        }else if(!study&&ascentOrigin){
          this.composeGateApproach(frame,landmark);
        }
      } else {
        // Filter heading along the arc of the orbit. Blending two eye positions
        // on opposite sides of the dragon can send the camera through its body.
        const headingEase = 1 - Math.exp(-Math.max(dt, 0) * (surface ? 8.5 : 4.2));
        const positionEase = 1 - Math.exp(-Math.max(dt, 0) * 11);
        if (switched) {
          this.followYaw = frame.heading;
          this.followPivot.copy(this.focus);
          this.turnRoom = 0;
          this.shoulderSide = -1;
          this.openShoulder = false;
          this.shoulder = this.flight.aspect<1 ? -.85 : -2.2;
        } else {
          this.followYaw += angleDelta(this.followYaw, frame.heading) * headingEase;
          this.followPivot.lerp(this.focus, positionEase);
          if (this.followPivot.distanceToSquared(this.focus) > 1.9 * 1.9) {
            this.followPivot.sub(this.focus).setLength(1.9).add(this.focus);
          }
        }
        const viewYaw = this.frameRiftYaw(riftView,dt,switched);
        this.forward.set(Math.sin(viewYaw), 0, Math.cos(viewYaw));
        this.right.crossVectors(this.forward, UP);
        this.followImpact(impact, dt, switched || steadyCombat);

        const portrait = this.flight.aspect < 1;
        if (surface) {
          // Keep the high water view, with its forward space measured from
          // the movement heading so attack poses cannot pull the camera.
          this.eye.copy(this.followPivot).addScaledVector(this.forward, -surface.distance)
            .addScaledVector(this.right, -surface.shoulder * (portrait ? .48 : 1));
          this.eye.y += surface.height;
          this.target.copy(this.focus).addScaledVector(this.forward, surface.ahead);
          this.target.y += .1;
          this.flight.fov = portrait ? 63 : surface.fov;
          this.applyImpactView(portrait ? .58 : 1);
          if(stage<2&&shoreLook)this.frameShoreClue(shoreLook,portrait,dt,switched,frame.heading);
        } else {
          const isMountain = stage === 3;
          const isWinged = frame.stage === 4;
          const bend = isMountain || isWinged ? this.bodyTurn(frame) : 0;
          // Open up on a bend and settle back over several frames. Changes in
          // the body corridor feed the lens, shoulder and follow distance together.
          const turnEase = 1 - Math.exp(-Math.max(0, dt) * (bend > this.turnRoom ? 5.2 : 3.8));
          this.turnRoom = THREE.MathUtils.lerp(this.turnRoom, bend, turnEase);
          const turnRoom = this.turnRoom;
          const wingBoom = Math.min(24, (isMountain ? 12.5 : 13.6) + frame.length * .19);
          const offset = (isWinged ? wingBoom : isMountain ? 9.4 : 12.8) + (portrait ? 1.55 : 0) + turnRoom*4.2;
          const homeShoulder = portrait ? -.85 : isWinged ? -3.2 : -2.2;
          this.eye.copy(this.followPivot).addScaledVector(this.forward,-offset);
          this.eye.y += (isWinged ? (isMountain ? 6.6 : 5.8) : isMountain ? 5.2 : 4.6) + turnRoom*1.55;
          this.target.copy(this.focus).addScaledVector(this.forward, isMountain ? 12.4 : 7);
          this.target.y -= isMountain ? 2.5-this.turnRoom*1.64 : .6;
          if(isMountain&&mountainRiver)this.gazeAlongRiver(mountainRiver);
          this.applyImpactView(portrait ? .59 : 1);
          if (isMountain || isWinged) {
            const width=Math.abs(homeShoulder)+(portrait?2.5:3.9)*turnRoom;
            if(turnRoom>.35&&!this.openShoulder){
              this.openShoulder=true;
              this.shoulderSide=this.pickShoulder(frame,width,terrainHeight);
            }else if(turnRoom<.19){
              this.openShoulder=false;
            }
            const shoulder=this.openShoulder?this.shoulderSide*width:homeShoulder;
            this.shoulder=THREE.MathUtils.lerp(this.shoulder,shoulder,1-Math.exp(-Math.max(0,dt)*6.7));
            this.eye.addScaledVector(this.right,this.shoulder);
            if (isMountain && mountainRiver && chapterExit > 0) this.frameValleyExit(mountainRiver,chapterExit);
            this.clearNearBody(frame,dt,switched);
            if(terrainHeight){
              this.clearTerrain(frame,terrainHeight,dt,switched);
              this.clearReceiverView(impact,terrainHeight);
              this.openViewAhead(terrainHeight);
            }
          }else{
            this.eye.addScaledVector(this.right,homeShoulder);
          }
          this.flight.fov = (portrait ? 72 : 57)+(isMountain?turnRoom*3.1:0)+this.handoffTravel*(portrait?2.2:1.7);
        }
        if (riftView || this.riftAmount > .01 || this.riftFov > .10 || this.riftDolly>.05)
          this.frameRiftGroup(riftView,frame,dt,Boolean(surface),portrait,terrainHeight);
        if (switched || clearCombatView) this.resetCombatView();
        if (!clearCombatView && !riftView && (combatView || this.combatStrength > .002))
          this.frameCombatGroups(combatView, dt, terrainHeight);
      }
      if (gateView) {
        const phase=finale?.phase;
        // Cut inside the court on entry, then let the descent play as
        // one shot until the dragon looks to the decree.
        const courtShot=phase==='audience'
          ? finale.age>=courtPageAt?'court-page'
            : this.flight.aspect<1&&finale.age>=courtContactAt?'court-contact':'court-floor'
          : null;
        const courtCut=courtShot&&this.finalPhase!==courtShot;
        const rainShot=phase==='blessing'&&finale.age>=blessingCutAt
          ? frame.rainTarget?.x<0?'rain-west':'rain-east' : null;
        const rainCut=rainShot&&this.finalPhase!==rainShot;
        const locked=finale?.ending==='locked';
        const lockSeat=locked&&finale.elapsed>=lockSeatFrom&&finale.elapsed<lockSeatUntil;
        const lockFall=locked&&!lockSeat&&finale.elapsed>=lockFallFrom
          ? finale.elapsed>=lockRestFrom?'lock-rest':'lock-fall' : null;
        const lockWing=locked&&finale.elapsed>=8.25&&finale.elapsed<9.28
          ? finale.elapsed<8.93?'lock-wing-clasp':'lock-wing' : null;
        const lockAnkle=locked&&finale.elapsed>=3.91&&finale.elapsed<4.68;
        const lockStone=locked&&finale.elapsed>=lockStoneFrom&&finale.elapsed<lockStoneThrough;
        const lockCut=(locked&&lockSeat!==(this.finalPhase==='lock-seat'))
          ||(lockFall&&this.finalPhase!==lockFall)||(lockWing&&this.finalPhase!==lockWing)
          ||(lockAnkle&&this.finalPhase!=='lock-ankle')||(lockStone&&this.finalPhase!=='lock-stone');
        const releaseInsert=phase==='stomp'&&finale.age>=GATE_RELEASE_INSERT;
        const contact=stompContactShot(finale);
        const contactCut=phase==='stomp'&&contact&&this.finalPhase!=='stomp-contact';
        const cuffTracking=locked&&finale.age<GATE_BIND.latch-.37;
        const rate=cuffTracking?17:phase==='choice'&&finale.cracked?4.3:phase==='trial'||phase==='choice'?8:phase==='stomp'?8.8:phase==='blessing'?7.5:locked?7:5;
        const ease = courtCut || rainCut || releaseInsert || contactCut || lockCut || switched && !leavingCruise && !leavingMountain
          ? 1 : 1 - Math.exp(-Math.max(dt, 0) * rate);
        this.camera.position.lerp(this.eye, ease);
        this.smoothedTarget.lerp(this.target, ease);
        this.camera.lookAt(this.smoothedTarget);
        this.finalPhase=courtShot??rainShot??(
          contact?'stomp-contact':lockSeat?'lock-seat':lockFall??lockWing??(lockAnkle?'lock-ankle':lockStone?'lock-stone':phase));
      } else {
        this.finalPhase=null;
        if(leavingMountain){
          this.cruiseHandoff = 0;
          this.smoothedTarget.copy(this.camera.getWorldDirection(this.aim)).multiplyScalar(this.eye.distanceTo(this.target)).add(this.camera.position);
        }
        if(stage===4&&this.cruiseHandoff!==undefined&&this.cruiseHandoff<1){
          this.cruiseHandoff+=dt;
          const blend=1-Math.exp(-Math.max(0,dt)*7);
          this.camera.position.lerp(this.eye,blend);
          this.smoothedTarget.lerp(this.target,blend);
          this.camera.lookAt(this.smoothedTarget);
        }else{
          this.cruiseHandoff=undefined;
          this.camera.position.copy(this.eye);
          this.camera.lookAt(this.target);
          if (stage < 4) {
            this.easeRiftRotation(riftView,dt,switched);
            this.easeCombatRotation(combatView,dt,switched||clearCombatView||Boolean(riftView));
          }
        }
      }
    } else if (stage === 1 || stage === 2) {
      this.camera = this.flight;
      this.target.copy(this.focus).addScaledVector(this.forward,-Math.min(9,frame.length*.22));
      this.eye.copy(this.target).add(new THREE.Vector3(5.2,14.2,-29));
      this.camera.position.copy(this.eye);
      this.camera.lookAt(this.target);
      this.flight.fov = this.flight.aspect < 1 ? 62 : 49;
    } else {
      this.camera = this.flat;
      const layout = surfaceCamera[Math.min(stage, 2)];
      this.target.copy(this.focus);
      if (menu) {
        this.target.x -= innerWidth > 650 ? 6.7 : 2;
        this.target.z -= 3.8;
      } else {
        this.target.z -= Math.min(9, frame.length * .22);
      }
      this.eye.copy(this.target);
      this.eye.x += Math.sin(layout.azimuth) * layout.distance;
      this.eye.z -= Math.cos(layout.azimuth) * layout.distance;
      this.eye.y += layout.height;
      this.camera.position.copy(this.eye);
      this.camera.lookAt(this.target);
      this.camera.zoom = menu ? 1.08 : layout.zoom;
    }

    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    if(this.flight.aspect<1&&finale?.phase==='blessing'&&finale.age>=rainSpillCutAt&&frame.blessingActor){
      this.rainCutProjection.finale=finale;
      projectRainDragon(frame.blessingActor,this.camera,this.rainCutProjection.head,this.rainCutProjection.tail);
    }
    return this.camera;
  }

  followImpact(impact, dt, switched) {
    if (switched) {
      this.impactMagnitude = 0;
      this.handoffShoulder = 0;
      this.handoffRise = 0;
      this.handoffTravel = 0;
    }
    let weight = 0;
    let shoulder = 0;
    let rise = 0;
    let travel = 0;
    if (impact) {
      const x = impact.x - this.focus.x;
      const z = impact.z - this.focus.z;
      const ahead = x*this.forward.x + z*this.forward.z;
      const side = x*this.right.x + z*this.right.z;
      const {clamp,smoothstep} = THREE.MathUtils;
      const handoff = impact.handoff;
      const rift = impact.route === 'rift-seam';
      const cover = handoff && (rift || impact.route === 'stone-quarry' || impact.route === 'abyss-undertow' ||
        impact.route === 'abyss-steamwake' || impact.route === 'kite-downpour' || impact.route === 'beam-quench');
      weight = impact.gain * smoothstep(ahead,handoff?-5:-1,6) * (1-smoothstep(Math.hypot(x,z),handoff?32:25,handoff?47:41));
      if (weight > 0) {
        const focus = this.aim.copy(this.right).multiplyScalar(clamp(side*.38,handoff?-5.2:-3.0,handoff?5.2:3.0));
        focus.y = clamp((impact.y-this.focus.y)*.43,-1.6,handoff?3.10:1.9);
        if(handoff){
          const cross=(impact.to.x-impact.from.x)*this.right.x+(impact.to.z-impact.from.z)*this.right.z;
          shoulder=weight*clamp(side*.14+cross*.047,-2.5,2.5);
          rise=weight*(.85 + .61*Number(impact.y < this.focus.y) + impact.receiver*.61);
          if (cover) {
            const span = Math.hypot(impact.to.x-impact.from.x, impact.to.z-impact.from.z);
            const upper = Math.min(2.3, Math.max(0,impact.to.y-impact.from.y)*.37 + (impact.lift ?? 0)*.25);
            const progress = smoothstep(impact.progress,.29,.92);
            focus.addScaledVector(this.forward,clamp(ahead-10,0,16.5)*(.11+.14*progress));
            focus.y += upper*progress;
            const alternate = Math.sign(cross || side) * smoothstep(Math.abs(cross),3,14);
            shoulder += weight * alternate * (.35+(rift?1.18:.78)*progress);
            rise += weight*(.42 + (rift?1.12:.54)*progress + upper*.42);
            travel = weight * smoothstep(span,rift?5:8,22) * (.65+.35*progress);
          }
        }
        this.impactAim.lerp(focus,1-Math.exp(-Math.max(dt,0)*9));
      }
    }
    this.impactMagnitude += (weight-this.impactMagnitude) * (1-Math.exp(-Math.max(dt,0)*11));
    this.handoffShoulder += (shoulder-this.handoffShoulder)*(1-Math.exp(-Math.max(dt,0)*7));
    this.handoffRise += (rise-this.handoffRise)*(1-Math.exp(-Math.max(dt,0)*7));
    this.handoffTravel += (travel-this.handoffTravel)*(1-Math.exp(-Math.max(dt,0)*7));
  }

  frameRiftYaw(view, dt, reset) {
    if (reset || (!view && this.riftAmount < .012 && this.riftFov < .10 && this.riftDolly<.05)) {
      this.riftYaw = this.followYaw;
      this.riftAmount = 0;
      this.riftFov = 0;
      this.riftDolly = 0;
      this.riftPan.set(0,0,0);
    }
    const {clamp,smoothstep} = THREE.MathUtils;
    let influence=0, desired=this.followYaw;
    if (view) {
      const dx=view.to.x-this.focus.x, dz=view.to.z-this.focus.z;
      const distance=Math.hypot(dx,dz);
      const offset=angleDelta(this.followYaw,Math.atan2(dx,dz));
      const need=smoothstep(Math.abs(offset),.24,1.88);
      influence=view.weight*smoothstep(distance,2.6,9)*(1-smoothstep(distance,34,57));
      const budget=this.flight.aspect<1 ? .79 : .92;
      desired+=clamp(offset*need,-budget,budget)*influence;
    }
    const ease=1-Math.exp(-Math.max(dt,0)*(view?7.2:4.2));
    this.riftAmount += (influence-this.riftAmount)*ease;
    const error=angleDelta(this.riftYaw,desired)*ease;
    this.riftYaw+=clamp(error,-3.9*dt,3.9*dt);
    return this.riftYaw;
  }

  easeRiftRotation(view,dt,reset) {
    const desired=this.camera.quaternion;
    const active=Boolean(view||this.riftAmount>.014||this.riftFov>.10||this.riftDolly>.05);
    if (reset || (!active && !this.riftOrbit)) {
      this.riftRotation.copy(desired);
      this.riftOrbit=false;
      return;
    }
    // Clamp the complete look rotation. The orbit and the aim can otherwise
    // each stay within their rates while their combined turn still snaps.
    const speed=this.camera.aspect<1 ? 3.0 : 3.9;
    this.riftRotation.rotateTowards(desired,Math.max(0,dt)*speed);
    this.riftOrbit=active||this.riftRotation.angleTo(desired)>.004;
    if(this.riftOrbit)desired.copy(this.riftRotation);
  }

  frameRiftGroup(view,frame,dt,surface,portrait,terrain) {
    const {clamp,lerp,smoothstep,degToRad,radToDeg}=THREE.MathUtils;
    const {riftAim,riftHead,riftEnd,riftBasis,riftAcross,riftUp,riftProbe,riftPan,eye,target}=this;
    riftAim.set(0,0,0);
    const ease=1-Math.exp(-Math.max(0,dt)*8.5);
    let dolly=0;
    if (view) {
      // A receiver on the far side of a turn needs more room. Keep the
      // rear boom in the player's heading band and back out to frame it.
      riftHead.copy(this.focus).y += .65;
      const lead=smoothstep(view.progress,0,.60);
      const receiver=view.head;
      riftEnd.set(lerp(receiver.x,view.to.x,.70+.30*lead),lerp(receiver.y,view.to.y,.70+.30*lead)+.60,
        lerp(receiver.z,view.to.z,.70+.30*lead));
      const range=riftHead.distanceTo(riftEnd);
      if (range>1) {
        riftProbe.subVectors(riftEnd,eye);
        const forward=riftProbe.dot(this.forward);
        const side=Math.abs(riftProbe.dot(this.right));
        dolly=clamp(7 + side*(portrait?.85:.38)-forward,0,surface?23:14)*this.riftAmount;
        riftAim.copy(riftHead).lerp(riftEnd,surface?.42:.45);
        riftAim.y=lerp(riftAim.y,target.y,surface?.26:.16);
        riftAim.sub(target);
        if (riftAim.lengthSq()>23*23)riftAim.setLength(23);
        riftAim.multiplyScalar(this.riftAmount*(.60+.40*lead));
      }
    }
    riftPan.lerp(riftAim,ease);
    target.add(riftPan);
    this.riftDolly=lerp(this.riftDolly,dolly,ease);
    if (this.riftDolly > .01) {
      riftProbe.copy(eye).addScaledVector(this.forward,-this.riftDolly);
      const rise=this.riftDolly*(surface?.37:.51);
      riftProbe.y+=rise;
      if (terrain) {
        for (const sample of [.25,.5,.75,1]) {
          riftBasis.copy(eye).lerp(riftProbe,sample);
          if (terrain(riftBasis.x,riftBasis.z)+1.6 > riftBasis.y) {
            riftProbe.copy(eye).lerp(riftProbe,Math.max(0,sample-.25));
            break;
          }
        }
      }
      eye.copy(riftProbe);
    }
    if (!view || this.riftAmount < .015) {
      this.riftFov=lerp(this.riftFov,0,ease);
      this.flight.fov+=this.riftFov;
      return;
    }
    // Only open the lens enough to cover the pair. Keep dragon, steering
    // space and terrain readable throughout the return to normal follow.
    riftBasis.subVectors(target,eye);
    const aimOffset=angleDelta(this.followYaw,Math.atan2(riftBasis.x,riftBasis.z));
    const aimBudget=portrait?1.05:1.12;
    if (Math.abs(aimOffset)>aimBudget) {
      const length=Math.hypot(riftBasis.x,riftBasis.z);
      const aim=this.followYaw+Math.sign(aimOffset)*aimBudget;
      target.x=eye.x+Math.sin(aim)*length;
      target.z=eye.z+Math.cos(aim)*length;
    }
    riftBasis.subVectors(target,eye).normalize();
    riftAcross.crossVectors(riftBasis,UP).normalize();
    riftUp.crossVectors(riftAcross,riftBasis).normalize();
    const aspect=this.flight.aspect;
    let field=0;
    for (const subject of [riftHead,riftEnd]) {
      riftProbe.subVectors(subject,eye);
      const depth=Math.max(3,riftProbe.dot(riftBasis));
      const radius=subject===riftHead ? Math.min(4.1,1+frame.length*.13) : 2.0;
      const x=(Math.abs(riftProbe.dot(riftAcross))+radius)/(depth*aspect*.80);
      const y=(Math.abs(riftProbe.dot(riftUp))+radius)/(depth*.77);
      field=Math.max(field,x,y);
    }
    const base=this.flight.fov;
    const required=radToDeg(2*Math.atan(Math.max(Math.tan(degToRad(base*.5)),field)));
    this.riftFov=lerp(this.riftFov,clamp(required-base,0,portrait?17:17.5)*this.riftAmount,ease);
    this.flight.fov=base+this.riftFov;
  }

  applyImpactView(width) {
    const gain = this.impactMagnitude;
    this.target.addScaledVector(this.impactAim,gain * width);
    this.eye.addScaledVector(this.right,this.handoffShoulder*width);
    this.eye.addScaledVector(this.forward,-this.handoffTravel*1.4*width);
    this.eye.y += gain * .62 + (this.handoffRise+Math.abs(this.handoffShoulder)*.33)*width;
  }

  resetCombatView() {
    this.combatStrength = 0;
    this.combatFov = 0;
    this.combatEyeOffset.set(0,0,0);
    this.combatAimOffset.set(0,0,0);
    this.combatMoveId = null;
    this.combatMoveFraming = false;
  }

  easeCombatRotation(view,dt,reset) {
    const rotation=this.camera.quaternion;
    const groupView = view?.route==='cascade-aim'||view?.route==='cascade-handoff'||view?.route==='rift-recoil'||
      view?.route==='beam-quench-runoff'||view?.climbing||view?.receiverFocus;
    const active=(groupView||this.combatMoveFraming) && this.combatStrength>.015;
    if (reset || !active && !this.combatOrbit) {
      this.combatRotation.copy(rotation);
      this.combatOrbit=false;
      return;
    }
    this.combatRotation.rotateTowards(rotation,Math.max(0,dt)*(view?.fanBounds?3.2:4.4));
    this.combatOrbit=active||this.combatRotation.angleTo(rotation)>.003;
    rotation.copy(this.combatRotation);
  }

  frameCombatGroups(view, dt, terrain) {
    const {clamp, smoothstep, degToRad, lerp} = THREE.MathUtils;
    const {eye,target,focus,combatCenter,combatEye,combatAim,combatAxis,combatAcross,combatUp,combatProbe}=this;
    const aspect = this.flight.aspect;
    const base = this.flight.fov;
    const half = Math.tan(degToRad(base * .5));
    let opening = 0;
    let extraFov = 0;
    combatEye.set(0,0,0);
    combatAim.set(0,0,0);
    if (view) {
      combatAxis.subVectors(target,eye).normalize();
      combatAcross.crossVectors(combatAxis,UP).normalize();
      combatUp.crossVectors(combatAcross,combatAxis);
      const migration = view.route === 'abyss-transfer';
      const runoff = view.route==='beam-quench-runoff';
      const steam = view.route==='frost-temper-rush'||view.route==='thaw-thunder-release'||view.splitSpore;
      const receiver = view.receiverFocus;
      const fan = view.fanBounds;
      const gyre = view.gyreBounds;
      const receiving = Boolean(receiver) || view.route==='cascade-aim'||view.route==='cascade-handoff'||view.route==='rift-recoil'||runoff||view.climbing;
      const aimOnly = view.route==='cascade-aim'||runoff;
      if (migration && !receiver && this.combatMoveId !== view.id) {
        this.combatMoveId=view.id;
        combatProbe.subVectors(view.destination,eye);
        const depth=combatProbe.dot(combatAxis);
        const limit=Math.max(Math.abs(combatProbe.dot(combatAcross))/aspect,Math.abs(combatProbe.dot(combatUp)));
        this.combatMoveFraming=limit/Math.max(.1,depth*half)>1.34;
      }
      let outside = 0;
      const points = receiver && !steam ? view.receiverPoints : view.points;
      combatCenter.set(0,0,0);
      for (const point of points) {
        combatCenter.add(point);
        combatProbe.set(point.x-eye.x,point.y-eye.y,point.z-eye.z);
        const depth = combatProbe.dot(combatAxis);
        const bound = Math.max((Math.abs(combatProbe.dot(combatAcross))+1.2)/aspect,
          Math.abs(combatProbe.dot(combatUp))+1.0);
        outside = Math.max(outside,bound/(Math.max(.5,depth)*half));
      }
      if(receiver) combatCenter.copy(receiver);
      else combatCenter.divideScalar(points.length);
      const spread = Math.hypot(combatCenter.x-focus.x,combatCenter.z-focus.z);
      const prism = view.route==='frost-prism';
      const obstruction = terrain && (receiver || view.climbing) ? this.combatObstruction(eye,points,terrain) : 0;
      const ahead = combatProbe.subVectors(combatCenter,focus).dot(this.forward);
      const crop=smoothstep(outside,prism?1.03:receiver?.68:receiving?.86:.72,prism?1.62:receiving?1.38:1.52);
      opening = (migration && !receiver && !this.combatMoveFraming ? 0 : view.strength) *
        Math.max(crop,.92*smoothstep(obstruction,1,receiver?6:9)) *
        (1-smoothstep(spread,32,52))*(prism?.57:aimOnly?(view.afterClear?.80:.48):receiving?.88:1);
      if(view.contactOnly) opening *= .67*smoothstep(ahead,-17,-7);
      if(view.mouthFold)opening=Math.max(opening,view.strength*.62*(1-smoothstep(spread,28,49)));
      if(steam)opening=Math.max(opening,view.strength*(.42+.38*crop)*(1-smoothstep(spread,27,47)));
      if(view.splitSpore)opening=Math.max(opening,view.strength*(.69+.17*crop)*(1-smoothstep(spread,30,49)));
      if(view.route==='major-clear')opening=Math.max(opening,view.strength*(.39+.34*crop)*(1-smoothstep(spread,25,45)));
      if (fan || gyre) {
        // A low shoulder view can see the group center while the near wing
        // still crosses one of the two projected flanks. Hold both groups.
        opening = view.strength * (gyre ? .64+.17*crop : .86+.14*crop) * (1-smoothstep(spread,28,42));
        combatAim.copy(focus).lerp(combatCenter,.50).addScaledVector(this.forward,1.5);
        const bounds=fan??gyre;
        const width = bounds.reduce((max,point)=>Math.max(max,
          Math.abs(combatProbe.subVectors(point,combatCenter).dot(this.right))),0);
        const backing = clamp((width-6)*.44+3.5,3.5,7.5);
        combatEye.copy(eye).addScaledVector(this.forward,-backing);
        combatEye.y = gyre ? Math.max(eye.y+6.2,focus.y+15.8,combatCenter.y+12) :
          Math.max(eye.y+7.3,focus.y+17.5,combatCenter.y+14);
        if (terrain) {
          const lift = Math.max(0,terrain(combatEye.x,combatEye.z)+2-combatEye.y,
            this.combatObstruction(combatEye,[focus,...bounds],terrain));
          combatEye.y+=Math.min(5,lift);
        }
        combatEye.sub(eye).multiplyScalar(opening);
        combatAim.sub(target).multiplyScalar(opening);
        extraFov = opening * clamp(2.2+width*.23,2.2,7);
      } else if (opening > 0) {
        // Ease up around the same heading. The higher view can cover a flank
        // that crosses the shoulder during a turn while keeping the nose in view.
        const rear = migration || receiving
          ? 1-smoothstep(ahead,-12,1) : 0;
        combatAim.copy(focus).lerp(combatCenter,steam?.65:receiver?.60:receiving?.57:.49).addScaledVector(this.forward,2.0 * (1-rear));
        combatEye.copy(combatAim).addScaledVector(this.forward,-lerp(clamp(11+spread*.33,13,23),10,rear));
        combatEye.y += clamp(10+spread*.60,13,25) + rear*(receiving?6:9.5);
        if(view.splitSpore){
          // Maintain the fork's overview through contact, with a slight
          // closer hold once both endpoints have become actual receipts.
          combatEye.y+=3.7-1.2*(view.settleFocus??0);
          combatEye.addScaledVector(this.forward,-2.1+1.25*(view.settleFocus??0));
        }
        // Keep both the dragon and a planned rear contact in front of the lens.
        // Raising the old view alone leaves the destination behind the near plane.
        if(receiver&&!view.contactOnly&&rear>0){
          let depth = 0;
          for (const point of points) depth=Math.min(depth,combatProbe.subVectors(point,focus).dot(this.forward));
          combatEye.addScaledVector(this.forward,Math.min(0,depth-9-combatProbe.subVectors(combatEye,focus).dot(this.forward))*rear);
        }
        if (terrain) {
          const lift = Math.max(0,terrain(combatEye.x,combatEye.z)+2-combatEye.y,
            this.combatObstruction(combatEye,[focus,combatCenter],terrain));
          combatEye.y+=Math.min(8,lift);
        }
        combatEye.sub(eye).multiplyScalar(opening);
        combatAim.sub(target).multiplyScalar(opening);
        extraFov = opening * ((aspect < 1 ? 13 : 9) + rear*6-(view.splitSpore?3*(view.settleFocus??0):0));
      }
    }
    const rate = view?.splitSpore ? 14 : view?.fanBounds || view?.route==='frost-temper-rush' || view?.route==='thaw-thunder-release' ? 13 : view?.contact || view?.afterClear ? 12 : view?.route === 'cascade-aim' ? 6.4 :
      view?.route === 'abyss-transfer' ? 11 : view ? 8.8 : 4.7;
    const ease = 1-Math.exp(-Math.max(0,dt)*rate);
    this.combatEyeOffset.lerp(combatEye,ease);
    this.combatAimOffset.lerp(combatAim,ease);
    this.combatStrength = lerp(this.combatStrength,opening,ease);
    this.combatFov = lerp(this.combatFov,extraFov,ease);
    eye.add(this.combatEyeOffset);
    target.add(this.combatAimOffset);
    if (terrain) eye.y=Math.max(eye.y,terrain(eye.x,eye.z)+1.65);
    this.flight.fov = base + this.combatFov;
  }

  combatObstruction(eye, points, terrain) {
    const {lerp} = THREE.MathUtils;
    let obstruction = 0;
    for (const point of points) {
      for (const t of [.27,.45,.62,.80]) {
        const x=lerp(eye.x,point.x,t), z=lerp(eye.z,point.z,t);
        const gap=terrain(x,z)+.67-lerp(eye.y,point.y+.50,t);
        obstruction=Math.max(obstruction,gap/(1-t));
      }
    }
    return obstruction;
  }
  composeGateApproach(frame,landmark){
    const {clamp,lerp,smootherstep:flow}=THREE.MathUtils;
    const portrait=this.flight.aspect<1;
    const p=landmark.worldToLocal(this.gateLocal.copy(this.focus));
    const court=flow(p.z,-52,-31);
    const distance=clamp(23+frame.length*.64,32,44)+(portrait?5.2:1.0);
    const x=p.x*.54+(portrait?1.25:5.0)*(1-.36*court);
    const y=lerp(Math.max(-10.4,p.y-3.25),Math.max(-4.5,p.y-2.6),court);
    this.eye.copy(landmark.localToWorld(this.finalEye.set(x,y,p.z-distance)));
    this.target.copy(landmark.localToWorld(this.finalAim.set(p.x*.23,lerp(5.3,7.2,court),-5.4)));
    this.flight.fov=lerp(portrait?68:52,portrait?70:54,court);
  }

  frameShoreClue(clue, portrait, dt, switched, heading){
    const { smoothstep:smooth, lerp }=THREE.MathUtils;
    const dx=clue.point.x-this.focus.x,dz=clue.point.z-this.focus.z;
    const span=Math.hypot(dx,dz);
    const ahead=dx*this.forward.x+dz*this.forward.z;
    const turning=Math.abs(angleDelta(this.followYaw,heading));
    const {lake,marsh}=clue;
    const request=clue.strength*(1-smooth(span,lake?8.9:7.4,lake?14:12.1))*smooth(ahead,lake?-5.7:marsh?-3.8:-4.2,marsh?1.2:-.72)
      *(1-smooth(turning,.21,lake?.92:marsh?.80:.63));
    if(switched)this.shoreBlend=0;
    this.shoreBlend=lerp(this.shoreBlend??0,request,1-Math.exp(-Math.max(0,dt)*(request>.52?9.0:7.1)));
    if(this.shoreBlend<.009)return;
    this.aim.copy(this.focus).lerp(clue.point,marsh?(portrait?.62:.54):(portrait?.58:.67));
    const weight=this.shoreBlend;
    // No yaw substitution: keep normal fore/aft reference controls.
    // The short look biases the framing and only modestly reduces the boom.
    this.target.lerp(this.aim,weight*(portrait?.74:.83));
    this.eye.addScaledVector(this.forward,weight*(marsh?(portrait?5.10:5.90):portrait?(lake?2.45:4.10):4.65));
    this.eye.y+=weight*(lake?(portrait?.62:1.16):marsh?(portrait?-1.64:-1.94):(portrait?-1.25:-1.62));
    this.flight.fov-=weight*(lake?0:marsh?(portrait?2.2:2.8):(portrait?3.0:4.2));
  }
  composeHeaven(frame,landmark,finale,contacts){
    const {clamp,lerp,smoothstep:smooth,smootherstep:flow}=THREE.MathUtils;
    const portrait=this.flight.aspect<1;
    const p=landmark.worldToLocal(this.gateLocal.copy(this.focus));
    const phase=finale.phase==='complete'?(finale.completedPhase??'epilogue'):finale.phase;
    const t=finale.age;
    const trailing=clamp(frame.length*.62+10,21,31);
    const eye=this.finalEye,aim=this.finalAim;
    let turnRoom=0;
    const set=(ex,ey,ez,tx,ty,tz,fov)=>{
      eye.set(ex,ey,ez);aim.set(tx,ty,tz);
      this.flight.fov=fov+(portrait?11:0);
    };
    if(phase==='trial'||phase==='approach'){
      if(phase==='approach'){
        this.composeGateApproach(frame,landmark);
        eye.copy(landmark.worldToLocal(this.eye));
        aim.copy(landmark.worldToLocal(this.target));
      }
      const warning=finale.warning;
      const seeker=warning?.kind==='lock'?warning:finale.strike?.kind==='lock'?finale.strike:null;
      const target=seeker?landmark.worldToLocal(this.lightningTarget.set(seeker.center.x,seeker.center.y,seeker.center.z)):p;
      const tracking=seeker?(warning===seeker?smooth(seeker.age,.05,.37):1-smooth(seeker.age,.42,1.0)):0;
      const separation=Math.abs(p.x-target.x);
      const spread=flow(separation,1.6,13.8)*tracking;
      const lookX=lerp(p.x,target.x,.47*tracking);
      const clear=Math.min(1,Math.max(0,(p.y-5.4)/4.8));
      const layered=warning?.kind==='layers'?smooth(warning.age,0,.32)
        : finale.strike?.kind==='layers'?1-smooth(finale.strike.age,.25,.79):0;
      turnRoom=(portrait?.25:.36)*(1-.94*tracking)*(1-.87*layered);
      const hazard=phase==='trial'?1:flow(p.z,-36,-27.2);
      const field=warning?.kind==='layers'?warning:finale.strike?.kind==='layers'?finale.strike:null;
      const safeElevation=field?(field.layers[0].y+field.layers[0].halfHeight+field.layers[1].y-field.layers[1].halfHeight)*.5-17:5.375;
      const approachX=lerp(p.x*.71+(portrait?1.6:5.0),lookX+(portrait?1.4:5.1),tracking);
      const x=lerp(approachX,p.x*.47+(portrait?4.5:11.8),layered);
      const eyeY=lerp(p.y+.40+(p.y<2.8?1.3:0),lerp(p.y,target.y,.46)+6.5+spread*2.0,tracking);
      const boom=trailing+tracking*(portrait?6.7:2.4)+spread*(portrait?12.7:4.2);
      const aimZ=lerp(p.z+11,lerp(p.z,target.z,.46)+6.8,tracking);
      const yAim=lerp(p.y+2.15-clear*.57,lerp(p.y,target.y,.48)+2.55+spread*1.4,tracking);
      set(lerp(eye.x,x,hazard),lerp(eye.y,lerp(eyeY,safeElevation+1.86+(p.y-safeElevation)*.20,layered),hazard),
        lerp(eye.z,lerp(p.z-boom,Math.min(-54.2,p.z-25),layered),hazard),
        lerp(aim.x,lerp(lerp(p.x*.57,lookX*.91,tracking),p.x*.31-1.1,layered),hazard),
        lerp(aim.y,lerp(yAim,safeElevation+.58,layered),hazard),
        lerp(aim.z,lerp(aimZ,-10.4,layered),hazard),
        lerp(this.flight.fov-(portrait?11:0),lerp(49+tracking*3+spread*(portrait?9:4),portrait?46:43,layered),hazard));
    }else if(phase==='choice'){
      const high=smooth(p.y,12,20);
      const open=finale.gateOpen>.74?(1-smooth(Math.hypot(p.x*.70,p.z+7.2),5,14))*(1-high):0;
      const face=lerp(p.x*.80+(portrait?2.4:5.4),p.x*.61+1.55,open*.80);
      const glance=lerp(lerp(p.y+3.5,14.8,high*.88),6.5,open*.72);
      set(face,p.y+lerp(2.1,4.9,high),p.z-trailing*.82,
        p.x*(.59-.21*open),glance,lerp(p.z+11,-7.7,.41+high*.37+open*.15),50+high*4);
      turnRoom=portrait?.24:.34;
      if(finale.cracked){
        const beam=landmark.worldToLocal(this.roofImpact.copy(finale.impact));
        const approach=flow(p.z,beam.z-11.4,beam.z-5.3);
        const climb=flow(p.y,beam.y+.70,beam.y+4.60);
        const roof=approach*climb;
        if(roof>0){
          // Orbit progressively during the climb. The eye clears the near
          // eave and still looks up the lane, so lateral input keeps its sign.
          const edge=flow(Math.abs(p.x-beam.x),STOMP_PAD.x-2.2,STOMP_PAD.x+4.0);
          const body=this.roofBody.copy(p);
          const shoulder=frame.spine?.[Math.min(Math.round(frame.length*.33),frame.spine.length-1)];
          if(shoulder)landmark.worldToLocal(body.copy(shoulder)).lerp(p,.46);
          const width=p.x-beam.x;
          const x=beam.x+25.9+width*.24+1.7*(1-edge);
          const y=Math.max(beam.y+3.35,p.y-2.72+.48*edge);
          const z=Math.min(p.z-5.35,beam.z-(portrait?4.25:3.15));
          eye.set(lerp(eye.x,x,roof),lerp(eye.y,y,roof),lerp(eye.z,z,roof));
          const markX=lerp(beam.x,body.x,portrait?.60:.55);
          const markY=lerp(beam.y,p.y,lerp(.57,.64,edge))+.60;
          const markZ=lerp(beam.z,body.z,portrait?.63:.38);
          aim.set(lerp(aim.x,markX,roof),lerp(aim.y,markY,roof),lerp(aim.z,markZ,roof));
          this.flight.fov=lerp(this.flight.fov,portrait?66:44,roof);
          turnRoom*=1-roof*.97;
        }
      }
    }else if(phase==='lock'){
      this.composeLock(contacts,landmark,p,t,finale.elapsed??t,trailing,portrait,set);
    }else if(phase==='stomp'||phase==='epilogue'&&finale.ending==='dragon-king'){
      this.composeStomp(frame,contacts,landmark,finale,p,portrait,set);
    }else if(phase==='audience'||phase==='blessing'){
      this.composeCourt(frame,landmark,finale,p,portrait,set);
      if(portrait&&(phase==='audience'&&t<courtContactAt||phase==='blessing'&&t>=blessingCutAt)){
        this.frameCourtSilhouette(frame,landmark,eye,aim,phase);
      }
    }else return;
    if(turnRoom){
      // The gate is a lane with lateral steering. Follow the dragon's turn
      // within that lane so the warning and the entrance stay readable.
      const matrix=landmark.matrixWorld.elements;
      const heading=angleDelta(Math.atan2(matrix[8],matrix[10]),frame.heading);
      const edge=smooth(Math.abs(p.x),portrait?3.5:5,portrait?12:17);
      const yaw=Math.sin(heading)*turnRoom*lerp(1,.28,edge);
      eye.sub(p).applyAxisAngle(UP,yaw).add(p);
      aim.sub(p).applyAxisAngle(UP,yaw).add(p);
    }
    if(phase==='choice'){
      // The stomp takes over the actual playable view. Keep the local
      // pre-dive eye and sight line as the beginning of the same move.
      this.stompLead=finale;
      landmark.worldToLocal(this.stompLeadEye.copy(this.camera.position));
      landmark.worldToLocal(this.stompLeadAim.copy(this.smoothedTarget));
      this.stompLeadFov=this.flight.fov-(portrait?11:0);
    }
    this.eye.copy(landmark.localToWorld(eye));
    this.target.copy(landmark.localToWorld(aim));
  }
  frameCourtSilhouette(frame,landmark,eye,aim,phase){
    const actor=frame.courtActor??frame.blessingActor;
    const wings=actor?.flightLimbs?.wings;
    const spine=actor?.pathPoints;
    if(!wings?.length||!spine?.length)return;
    const points=this.courtFramePoints;
    let count=0;
    const next=()=>points[count]??(points[count]=new THREE.Vector3());
    actor.muzzle(next());count++;
    for(const wing of wings){
      for(let i=3;i<=5;i++){
        const point=next();
        actor.contactWorld(wing.joints[i].bone.getWorldPosition(point),courtWingSection,point);
        if(i===5)point.addScaledVector(this.courtFrameProjected.copy(point).sub(points[count-1]),.28);
        count++;
      }
    }
    for(const fraction of [.44,.76,1]){
      actor.root.localToWorld(next().copy(spine[Math.round((spine.length-1)*fraction)]));count++;
    }
    if(phase==='blessing'&&frame.rainTarget){
      landmark.localToWorld(next().copy(frame.rainTarget));count++;
    }

    const probe=this.courtFrameProbe;
    probe.aspect=this.flight.aspect;
    probe.fov=this.flight.fov;
    landmark.localToWorld(probe.position.copy(eye));
    const center=landmark.localToWorld(this.courtFrameCenter.copy(aim));
    probe.lookAt(center);
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);
    const projected=this.courtFrameProjected;
    let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;
    for(let i=0;i<count;i++){
      projected.copy(points[i]).project(probe);
      left=Math.min(left,projected.x);right=Math.max(right,projected.x);
      bottom=Math.min(bottom,projected.y);top=Math.max(top,projected.y);
    }
    const margin=.80;
    // Shift only as far as the visible silhouette needs. Avoid moving the
    // eye through columns and leave the roof contact in the same frame.
    const dx=Math.max(0,right-margin)+Math.min(0,left+margin);
    const dy=Math.max(0,top-margin)+Math.min(0,bottom+margin);
    if(Math.abs(dx)+Math.abs(dy)>.01){
      projected.copy(center).project(probe);
      center.copy(projected.set(projected.x+dx*.75,projected.y+dy*.70,projected.z).unproject(probe));
      landmark.worldToLocal(aim.copy(center));
      probe.lookAt(center);
      probe.updateMatrixWorld(true);
    }
    let reach=margin;
    for(let i=0;i<count;i++){
      projected.copy(points[i]).project(probe);
      reach=Math.max(reach,Math.abs(projected.x),Math.abs(projected.y));
    }
    const verticalAngle=THREE.MathUtils.degToRad(this.flight.fov*.5);
    this.flight.fov=Math.min(93,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(verticalAngle)*reach/margin)));
  }
  composeCourt(frame,landmark,finale,p,portrait,set){
    const {clamp,lerp,smootherstep:flow}=THREE.MathUtils;
    const t=finale.age;
    const eyeX=portrait?4.55:4.35,eyeY=portrait?7.75:6.65,eyeZ=portrait?6.65:7.95;
    const pageX=portrait?-.30:.08,pageY=portrait?4.48:4.18,pageZ=portrait?13.75:14.25;
    const pageFov=portrait?67:39;
    if(finale.phase==='audience'){
      if(t<courtPageAt){
        if(portrait){
          if(t<courtContactAt){
            // The open leaves frame the complete wingspan against paper.
            // Descend from the rear eave as the dragon crosses the sill.
            const enter=flow(t,.17,1.35);
            set(lerp(-2.80,-3.31,enter),lerp(8.80,7.88,enter),lerp(19.35,19.76,enter),
              -.12,Math.max(3.11,p.y+.48),p.z-2.28,lerp(45.0,48.2,enter));
            return;
          }
          // Cross to the outer aisle: keep the feet and their cast shadows
          // separate against a column bay as the shoulders take weight.
          const lower=flow(t,courtContactAt,1.94);
          const settle=flow(t,2.13,2.58);
          set(lerp(-9.8,-9.6,lower)-.10*settle,lerp(5.16,4.72,lower)-.12*settle,18.56+.18*lower,
            lerp(-.21,-.43,lower),lerp(3.47,2.56,lower)+.18*settle,lerp(7.75,8.62,lower),
            lerp(49,48,lower)+1.6*settle);
          return;
        }
        // Stay in the same bay from the doorway through the first support.
        // Lower beside the flagstone joint as the foreclaws reach the slab.
        const entry=flow(t,.08,1.80);
        const lower=flow(t,1.28,2.16);
        const hold=flow(t,2.12,2.48);
        set(lerp(portrait?6.39:8.7,portrait?5.26:7.55,lower)+.37*hold,
          lerp(4.64,2.40,lower)+.24*hold,15.72+.44*lower-.10*hold,
          lerp(.13,.21,entry)+.31*hold,lerp(5.10,2.01,lower)+.28*hold,
          lerp(-3.45,9.93,entry)-.52*hold,portrait?48-3*lower+3.2*hold:41);
      }else{
        if(portrait&&t<3.53){
          // Turn along the opposite end of the aisle for the decree, using
          // its upper frame as lead room above the shoulders and claws.
          const page=flow(t,3.08,3.53);
          const settle=flow(t,courtPageAt,2.91);
          set(lerp(.66,eyeX,page),lerp(6.92,eyeY,page),lerp(6.28,eyeZ,page),
            lerp(.20,pageX+.36,page),lerp(2.94+.24*settle,pageY-.68,page),
            lerp(13.47,pageZ,page),lerp(65.5,pageFov+2.2,page));
          return;
        }
        const page=flow(t,courtPageAt,2.89);
        const stamp=flow(t,COURT_SEAL_AT-.46,COURT_SEAL_AT+.02);
        const finish=flow(t,COURT_SEAL_AT+.26,4.38);
        // A small side drift makes room for both the bowed muzzle and stamp.
        const witness=stamp*(1-finish);
        const grounded=1-flow(t,3.69,4.27);
        set(lerp(portrait?3.20:4.25,eyeX,page)-.93*witness,
          lerp(8.02,eyeY,page)-.24*witness,lerp(9.0,eyeZ,page)+.53*witness,
          lerp(-.62,pageX+.22*witness,page)+(portrait?.36:.21)*grounded,
          lerp(5.01,pageY+.12*witness,page)-(portrait?.68:.46)*grounded,
          lerp(12.6,pageZ-.55*witness,page),lerp(portrait?61:46,pageFov,page)+(portrait?2.2:1.3)*grounded);
      }
      return;
    }
    if(t<blessingCutAt){
      const look=flow(t,0,blessingCutAt);
      set(eyeX,eyeY,eyeZ,lerp(pageX+.18,p.x,look),lerp(pageY-.17,p.y+.23,look),
        lerp(pageZ,p.z,look),pageFov);
      return;
    }

    const torso=frame.spine?.[Math.min(Math.round(frame.length*.31),frame.spine.length-1)];
    const subject=torso?landmark.worldToLocal(this.rainSpine.copy(torso)).lerp(p,.57):p;
    const sign=Math.sign(frame.rainTarget?.x??(p.x<-1.9?-1:1));
    const roof=frame.rainTarget??this.rainFlightTarget.set(sign*11.55,7.52,18.6);
    const release=flow(t,1.24,1.95);
    const departure=flow(t,2.24,3.25);
    // Hold the gap beyond the nearest eave as the wing releases the rain.
    // Follow the same tile surface until the first wash reaches the slope.
    const takeoffRoom=portrait?(1-flow(t,1.2,2.02))*3.15:0;
    const clearEave=1-flow(t,1.21,1.68);
    const x=-sign*(lerp(portrait?13.7:11.1,portrait?19.6:16.2,departure)+takeoffRoom
      +clearEave*(portrait?.65:3.0));
    const y=Math.max(11.85,subject.y-1.50)+clearEave*(portrait?2.08:1.18);
    const openZ=lerp(portrait?17.35:16.26,11.8,flow(t,1.03,1.68));
    const z=lerp(openZ,clamp(roof.z-3.45,15.5,20.6),departure);
    const aimX=lerp(subject.x,roof.x,lerp(.20,.43,release)-departure*.18);
    const aimY=lerp(subject.y,roof.y,lerp(.26,.58,release)-departure*.18)+.18-(portrait?0:.62*clearEave);
    const aimZ=lerp(subject.z-.64,roof.z,lerp(.27,.50,release)-departure*.15)
      -(portrait?1.38*clearEave:0);
    set(x,y,z,aimX,aimY,aimZ,portrait?53:42);
  }
  composeLock(contacts,landmark,player,age,elapsed,trailing,portrait,set){
    const {clamp,lerp,smootherstep:flow}=THREE.MathUtils;
    const {ankle,wing,latch}=GATE_BIND;
    if(elapsed>=lockStoneFrom&&elapsed<lockStoneThrough){
      const load=flow(elapsed,5.86,6.43);
      const drop=flow(elapsed,6.38,7.13);
      // See the chain under load at the pillar foot, then follow the
      // loosened stone as it slips over the ledge.
      set(-14.15+drop*.29,(portrait?4.38:4.26)-drop*.32,-20.4-drop*.82,
        -6.15-1.14*drop,1.26+.18*load-1.44*drop,-11.90-2.26*drop,portrait?46:33.5);
      return;
    }
    if(elapsed>=lockSeatFrom&&elapsed<lockSeatUntil){
      // The paw and pulling ring stay to one side of the white slit.
      // Hold from the outside of the opposing leaf, away from the wings.
      const {doors}=landmark.userData.finaleParts;
      const handle=doors[1].ring;
      const ring=landmark.worldToLocal(handle.localToWorld(this.lockBolt.set(.04,-.40,-.08)));
      const close=flow(elapsed,LOCK_DOOR.pull,LOCK_DOOR.close);
      const pull=flow(elapsed,LOCK_DOOR.grip+.35,LOCK_DOOR.release);
      const paw=contacts?.front?.[0];
      const knuckle=paw?landmark.worldToLocal(this.lockPaw.copy(paw)):ring;
      const aimX=lerp(ring.x,knuckle.x,.30)-.33;
      const aimY=lerp(ring.y,knuckle.y,.35)+.30;
      const aimZ=lerp(ring.z,knuckle.z,.24)-.18;
      set(ring.x+lerp(portrait?-5.89:-6.22,portrait?-5.9:-6.5,close),
        ring.y+lerp(2.01,1.75,pull),ring.z-(portrait?9.7:8.35),
        aimX,aimY,aimZ,portrait?41:32.5);
      return;
    }
    const loaded=landmark.userData.finale?.cuffs?.[1];
    if(elapsed>=lockFallFrom&&loaded?.root.visible){
      const anchor=loaded.staple.position;
      const wrist=loaded.root.position;
      const fall=flow(elapsed,13.23,LOCK_STAIR.touch);
      const slide=flow(elapsed,LOCK_STAIR.touch,LOCK_STAIR.lower);
      const rest=flow(elapsed,LOCK_STAIR.lower,LOCK_STAIR.rest);
      const pawWorld=contacts?.stairClaw??contacts?.front?.[1];
      const paw=pawWorld?landmark.worldToLocal(this.lockPaw.copy(pawWorld)):player;
      const muzzle=contacts?.muzzle
        ? landmark.worldToLocal(this.lockMuzzle.copy(contacts.muzzle)):player;
      if(elapsed>=lockRestFrom){
        // The low stair gives the claw and throat a new screen plane.
        // Hold long enough for the resting wing to stop beside the paw.
        const press=flow(elapsed,lockRestFrom,19.03);
        const aim=this.lockStrain.copy(muzzle).lerp(paw,.43);
        aim.x-=.18;
        const floor=landmark.userData.lockStairHeight;
        const eyeX=aim.x-(portrait?3.08:3.76)+.28*press;
        const eyeZ=aim.z-(portrait?7.02:5.86)+.18*press;
        const eyeY=Math.max(-3.23,(floor?.(eyeX,eyeZ)??-4)+2.1);
        set(eyeX,eyeY,eyeZ,aim.x,aim.y+.32,aim.z+.19,portrait?48:37);
        return;
      }
      const overview=this.lockStrain.copy(wrist).lerp(anchor,portrait?.35:.43);
      // Follow the near rail on one side of its axis. The descending stone
      // seam remains a fixed reference while the paw slips onto the next tread.
      const aimX=lerp(overview.x-.12,lerp(paw.x,muzzle.x,.45)+.15,fall);
      const aimY=lerp(overview.y-.22,lerp(paw.y,muzzle.y,.64)+.66,fall);
      const aimZ=lerp(overview.z-.4,lerp(paw.z,muzzle.z,.53)+.26,fall);
      set(lerp(portrait?7.2:8.8,portrait?4.72:5.18,fall)-.70*rest,
        lerp(4.08,.51,fall)-1.41*slide,
        lerp(portrait?-32.9:-28.6,portrait?-31.62:-27.1,fall)-1.75*slide,
        aimX,aimY,aimZ,lerp(portrait?61:45,portrait?59:43.5,fall));
      return;
    }
    const heel=this.lockAnkle.copy(player);
    const heelPoint=contacts?.ankle?.[0]??contacts?.rear?.[0];
    if(heelPoint)landmark.worldToLocal(heel.copy(heelPoint));
    heel.y=clamp(heel.y,2.0,player.y+3.6);
    heel.z=clamp(heel.z,player.z-9,player.z+2);

    // Stay in front of the gate with the seam on the far side of
    // the dragon. The ankle, its anchor and the second wrist enter
    // the same view so each arrest can be read against the threshold.
    const approach=flow(age,.05,ankle-.29);
    const forewing=flow(age,ankle+.39,wing-.25);
    const after=flow(age,wing+.19,wing+.55);
    const first=landmark.userData.finale?.cuffs?.[0];
    const second=landmark.userData.finale?.cuffs?.[1];
    const audience=player.x*.54+(portrait?.18:1.05);
    const x=lerp(player.x*.66+3.0,audience+(portrait?-6.5:-9.0)+1.65*forewing,approach);
    const y=lerp(player.y+2.4,player.y+lerp(2.75,1.41,forewing)-.25*after,approach);
    const z=lerp(player.z-trailing,Math.min(-18.2,player.z-(portrait?13.9:11.65))-1.55*after,approach);
    const clasp=second?.root.visible?second.target:first?.root.visible?first.target:heel;
    const cuffWeight=.23+.14*(flow(age,ankle-.14,ankle+.07)-flow(age,ankle+.19,ankle+.50));
    const ankleShot=flow(elapsed,3.30,3.88)*(1-flow(elapsed,4.77,5.42));
    const wingShot=flow(elapsed,7.55,8.05)*(1-flow(elapsed,9.08,9.88));
    if(elapsed>9.86&&elapsed<11.89&&second?.root.visible){
      // Follow the taut chain from its pillar to the dragon as the
      // last upward pull turns into a drop. Keep the door in the view.
      const anchor=this.lockAnchor.copy(second.staple.position);
      const wrist=second.root.position;
      const slide=flow(elapsed,10.00,11.29);
      const detail=flow(elapsed,9.86,10.16)*(1-flow(elapsed,11.20,11.89));
      const aim=this.lockStrain.copy(anchor).lerp(wrist,lerp(portrait?.43:.32,portrait?.81:.77,slide));
      set(lerp(x,aim.x+(portrait?3.7:5.18),detail),
        lerp(y,aim.y+lerp(1.24,2.06,slide),detail),
        lerp(z,Math.min(-16.1,aim.z-(portrait?15.7:10.8)),detail),
        lerp(lerp(player.x*.61,clasp.x,cuffWeight*approach),aim.x-.17,detail),
        lerp(lerp(player.y+.20,5.97,.44*approach)+.73*forewing,aim.y+.25,detail),
        lerp(lerp(player.z+7.6,lerp(clasp.z,-8.23,.31+.17*forewing),approach),aim.z+.43,detail),
        lerp(lerp(51,(portrait?53:45)+.8*after,approach),portrait?52:39,detail));
      return;
    }
    if(elapsed>=8.25&&elapsed<9.68&&second?.root.visible){
      if(elapsed<8.93){
        // Track the real hinge from the outer side of the forecourt, with
        // the pale paved gallery behind the ring. Cut on the loaded links.
        const cuff=second.root.position;
        const seat=flow(elapsed,8.38,8.78);
        const aim=this.lockWingAim.copy(cuff).lerp(second.target,.17);
        const eyeX=aim.x+lerp(9.68,10.2,seat);
        const eyeY=aim.y-lerp(1.87,2.38,seat);
        const eyeZ=aim.z-lerp(4.73,5.38,seat);
        set(eyeX,eyeY,eyeZ,aim.x+.08,aim.y+.07,aim.z+.49,portrait?43:29.5);
        return;
      }
      // Choose one exterior sightline through the fixed staple and the
      // cuff. Hold it through the close, then follow the recoil out.
      const combine=1-flow(elapsed,9.28,9.68);
      const catchWing=flow(elapsed,8.41,8.98);
      const staple=second.staple.position;
      const cuff=second.root.position;
      const aim=this.lockWingAim.copy(cuff).lerp(staple,portrait?.30:.34);
      const eyeX=lerp(10.5,12.08,catchWing);
      const eyeY=lerp(4.22,3.34,catchWing);
      const eyeZ=portrait?-32.55:-25.9;
      set(lerp(x,eyeX,combine),lerp(y,eyeY,combine),lerp(z,eyeZ,combine),
        lerp(lerp(player.x*.61,clasp.x,cuffWeight*approach),aim.x,combine),
        lerp(lerp(player.y+.20,5.97,.44*approach)+.73*forewing,aim.y+.29,combine),
        lerp(lerp(player.z+7.6,lerp(clasp.z,-8.23,.31+.17*forewing),approach),aim.z+.24,combine),
        lerp(lerp(51,(portrait?53:45)+.8*after,approach),portrait?52:38,combine));
      return;
    }
    if(elapsed>=3.91&&elapsed<4.99&&first?.root.visible){
      // The pale apron sits behind the jaw while it closes. Keep the lens
      // above the ankle axis long enough to see both sides of the iron.
      const cuff=first.root.position;
      const cut=flow(elapsed,4.13,4.59);
      const leave=flow(elapsed,4.68,4.99);
      const aim=this.lockWingAim.copy(cuff).lerp(heel,.32);
      const eyeZ=aim.z-lerp(portrait?7.19:6.16,portrait?8.24:7.18,cut);
      const eyeX=aim.x-lerp(4.14,3.45,cut);
      const eyeY=aim.y+lerp(6.75,5.38,cut);
      set(lerp(eyeX,x,leave),lerp(eyeY,y,leave),lerp(eyeZ,z,leave),
        lerp(aim.x+.04,lerp(player.x*.61,clasp.x,cuffWeight*approach),leave),
        lerp(aim.y-.09,lerp(player.y+.20,5.97,.44*approach)+.73*forewing,leave),
        lerp(aim.z+.12,lerp(player.z+7.6,lerp(clasp.z,-8.23,.31+.17*forewing),approach),leave),
        lerp(portrait?34.5:25,lerp(51,(portrait?53:45)+.8*after,approach),leave));
      return;
    }
    if((ankleShot>0&&first?.root.visible)||(wingShot>0&&second?.root.visible)){
      const ankleView=ankleShot>0&&first?.root.visible;
      const detail=ankleView?ankleShot:wingShot;
      const cuff=ankleView?first:second;
      const target=this.lockWingAim.copy(cuff.root.position).lerp(cuff.target,ankleView?.43:.24);
      const hand=contacts?.front?.[0];
      if(hand)target.lerp(landmark.worldToLocal(this.lockHand.copy(hand)),ankleView?.09:.19);
      const side=ankleView?-1:1;
      const close=ankleView?flow(elapsed,4.18,4.64):flow(elapsed,8.39,8.94);
      const offset=ankleView?lerp(7.4,10.2,close):lerp(8.6,10.23,close);
      const dz=ankleView?lerp(7.2,5.67,close):lerp(8.65,7.45,close);
      const sight=this.lockCuffSight.set(side*(portrait?offset-.25:offset),
        ankleView?lerp(-.74,-2.46,close):lerp(-.69,-2.64,close),-dz);
      // Give the jaw plane a small frontal bias while keeping the eye on
      // the outside of the gate, away from the moving feathers.
      const axis=cuff.axial;
      if(axis.z>.23){
        const distance=sight.length();
        sight.lerp(axis,-distance*.21*close);
        sight.setLength(distance);
      }
      const eyeZ=Math.min(target.z+sight.z,-15.4);
      set(lerp(x,target.x+sight.x,detail),lerp(y,target.y+sight.y,detail),lerp(z,eyeZ,detail),
        lerp(lerp(player.x*.61,clasp.x,cuffWeight*approach),target.x+side*.28,detail),
        lerp(lerp(player.y+.20,5.97,.44*approach)+.73*forewing,target.y+.23,detail),
        lerp(lerp(player.z+7.6,lerp(clasp.z,-8.23,.31+.17*forewing),approach),target.z+.62,detail),
        lerp(lerp(51,(portrait?53:45)+.8*after,approach),portrait?(ankleView?53:54):ankleView?34:37,detail));
      return;
    }
    const settle=flow(age,latch-.30,latch+1.64);
    const latchAge=Math.max(0,age-latch);
    const hit=.15*Math.sin(latchAge*27)*Math.exp(-latchAge*9);
    // After the last pull, drift down the same stair axis. The door stays
    // over the dragon's shoulder as the loose feather settles below it.
    const step=flow(elapsed,14.65,17.47);
    const finalX=lerp(portrait?-4.1:-5.7,portrait?-4.85:-7.15,step);
    const finalY=lerp(3.25,.49,step);
    const finalZ=lerp(portrait?-30.7:-31.2,portrait?-32.20:-31.35,step);
    set(lerp(x,finalX,settle),lerp(y,finalY,settle)+hit,lerp(z,finalZ,settle),
      lerp(lerp(player.x*.61,clasp.x,cuffWeight*approach),-.2,settle),
      lerp(lerp(player.y+.20,5.97,.44*approach)+.73*forewing,3.5-1.75*step,settle),
      lerp(lerp(player.z+7.6,lerp(clasp.z,-8.23,.31+.17*forewing),approach),-12.4-2.62*step,settle),
      lerp(lerp(51,(portrait?53:45)+.8*after,approach),(portrait?53:47)+2.3*step,settle));
  }
  composeStomp(frame,contacts,landmark,finale,player,portrait,set){
    const {clamp,lerp,smoothstep:smooth,smootherstep:flow}=THREE.MathUtils;
    const age=finale.phase==='stomp'?finale.age:STOMP_DURATION;
    const latch=landmark.userData.finaleParts?.latch;
    if(latch&&age>=GATE_RELEASE_INSERT){
      const drop=flow(age,GATE_RELEASE_INSERT+.026,STOMP_DURATION);
      const tag=latch.getObjectByName('门闩朱印');
      const plate=landmark.worldToLocal(tag.getWorldPosition(this.finalPaw));
      set(plate.x+(portrait?1.90:2.42),plate.y+1.55+.32*drop,plate.z-5.20,
        plate.x+.24,plate.y+.20,plate.z+.12,portrait?35:40);
      return;
    }
    const impact=finale.impactAt;
    if(stompContactShot(finale)){
      // Read both claw seats along the front of the beam as the wing folds.
      const release=flow(age,impact+STOMP_LOAD,impact+STOMP_LOAD+.50);
      const press=flow(age,impact+.025,impact+.30)*(1-release);
      const before=1-flow(age,impact-.19,impact-.02);
      const seat=this.finalPaw.set(0,14.5,-10.57);
      if(contacts?.front?.[0]&&contacts.front[1]){
        seat.copy(contacts.front[0]).lerp(contacts.front[1],.46);
        landmark.worldToLocal(seat);
        seat.x=clamp(seat.x,-1.1,1.1);
        seat.y=clamp(seat.y,13.95,16.4);
        seat.z=clamp(seat.z,-11.5,-9.6);
      }
      const over=flow(age,impact-.16,impact+.055)*(1-release);
      const back=2.05*release;
      set(lerp(portrait?5.42:6.50,portrait?4.42:6.41,over)-.50*release,
        lerp(17.32+.42*before,18.41,over)-.63*release,
        (portrait?-25.10:-23.06)-back,
        seat.x*.48-.04,14.99+.34*before-.28*release-.19*press,
        seat.z-.08,(portrait?43:36)+1.3*press);
      return;
    }
    const sinceImpact=Math.max(0,age-impact);
    const meet=flow(age,.035,impact-.13);
    const followThrough=flow(age,impact+STOMP_LOAD,impact+1.13);
    const open=flow(age,impact+.97,impact+2.32);
    const finish=flow(age,impact+2.14,impact+3.20);
    const hit=Math.sin(sinceImpact*25)*.17*Math.exp(-sinceImpact*9);
    const paw=this.finalPaw.set(0,14.5,-10.6);
    const actual=contacts?.front;
    const attachment=smooth(age,.39,.80)*(1-smooth(age,impact+.36,impact+.67));
    if(actual?.length&&attachment>0){
      const fixedX=paw.x,fixedY=paw.y,fixedZ=paw.z;
      paw.copy(actual[0]);
      if(actual[1])paw.lerp(actual[1],.50);
      landmark.worldToLocal(paw);
      paw.set(lerp(fixedX,clamp(paw.x,-2.2,2.2),attachment),
        lerp(fixedY,clamp(paw.y,14.02,17.9),attachment),
        lerp(fixedZ,clamp(paw.z,-12.1,-8.8),attachment));
    }
    const shoulder=this.finalShoulder.copy(player);
    const wings=contacts?.wing;
    if(wings?.length){
      shoulder.copy(wings[0]);
      if(wings[1])shoulder.lerp(wings[1],.5);
      landmark.worldToLocal(shoulder);
    }
    // Stay just above the near eave. The front posts and both claws
    // share the same perspective as the beam bends, then the camera
    // recedes down the entrance axis while the central bay opens.
    const lead=this.stompLeadEye,leadAim=this.stompLeadAim;
    if(this.stompLead!==finale){
      this.stompLead=finale;
      lead.set(player.x*.30+(portrait?11.5:16.4),Math.max(29,player.y+9.2),player.z-(portrait?17.2:16.3));
      leadAim.set(player.x*.18,16.7+(player.y-18.8)*.36,-10.5+(player.z+10.5)*.28);
      this.stompLeadFov=portrait?62:49;
    }
    const closeShoulder=age>=impact-.19?(portrait?-9.15:-12.3):(portrait?10.25:12.3);
    const nearX=lerp(lead.x,closeShoulder,meet)-.96*followThrough;
    const nearY=lerp(lead.y,16.02+.18*clamp(shoulder.y-paw.y,0,3.2),meet)-.80*followThrough;
    const nearZ=lerp(lead.z,portrait?-25.15:-24.3,meet)-4.65*followThrough;
    const nearAimX=lerp(leadAim.x,paw.x+.14*(shoulder.x-paw.x),meet);
    const nearAimY=lerp(leadAim.y,paw.y+.18+.15*(shoulder.y-paw.y),meet)-1.65*followThrough;
    const nearAimZ=lerp(leadAim.z,paw.z+.19*(shoulder.z-paw.z),meet)+1.75*followThrough;
    const nearFov=lerp(this.stompLeadFov,portrait?55:42,meet)+3.0*followThrough;
    const wideX=lerp(3.65,1.55,finish);
    const wideY=lerp(10.6,12.9,finish);
    const wideZ=lerp(portrait?-50:-43.4,portrait?-56:-49.2,finish);
    let eyeY=lerp(nearY,wideY,open)+hit*(1-open);
    let eyeZ=lerp(nearZ,wideZ,open);
    let aimY=lerp(nearAimY,9.05-1.45*finish,open);
    let fov=lerp(nearFov,portrait?67:55,open);
    const reveal=smooth(age,impact+STOMP_LOAD+.10,impact+1.02)
      *(1-smooth(age,impact+1.30,impact+1.95))*smooth(frame.length,18,28);
    if(reveal>.001&&frame.spine?.length>8){
      // A grown dragon's near-body arc follows it up as the gate opens.
      // Keep the intact bearing shot fixed and add depth only on release.
      const count=Math.min(frame.spine.length,Math.ceil(frame.length*.58));
      let rise=player.y;
      let nearest=player.z;
      for(let i=3;i<count;i+=3){
        const station=landmark.worldToLocal(this.stompArc.copy(frame.spine[i]));
        rise=Math.max(rise,station.y);
        nearest=Math.min(nearest,station.z);
      }
      const curl=clamp((rise-paw.y-3.4)*.34,0,3.1);
      const sweep=clamp((-11.8-nearest)*.32,0,4.5);
      const expansion=2.2+sweep;
      eyeY+=reveal*(.45+curl*.25);
      eyeZ-=reveal*expansion;
      aimY+=reveal*(1.10+curl*.41);
      fov+=reveal*(portrait?3.6:3.1);
    }
    let eyeX=lerp(nearX,wideX,open);
    let aimX=lerp(nearAimX,-.31,open);
    let aimZ=lerp(nearAimZ,-4.75,open);
    const tether=landmark.userData.finale?.taggedTether;
    if(tether&&age>=3.57){
      // Let the same wide open with the escaping dragon. Tilt back down as
      // the last physical chain pays out, then match on its red seal.
      const escape=flow(age,3.57,4.14);
      const move=flow(age,4.18,GATE_RELEASE_INSERT);
      const witness=tether.witness;
      const body=this.stompArc.copy(player);
      const span=frame.spine?.[Math.min(Math.round(frame.length*.42),frame.spine.length-1)];
      if(span)landmark.worldToLocal(body.copy(span)).lerp(player,.48);
      const gaze=escape*(1-move);
      eyeX=lerp(eyeX,portrait?10.8:12.4,gaze);
      eyeY=lerp(eyeY,portrait?19:18.0,gaze);
      eyeZ=lerp(eyeZ,portrait?-45.5:-40.1,gaze);
      aimX=lerp(aimX,clamp(body.x*.68,0,6.8),gaze);
      aimY=lerp(aimY,lerp(10.5,Math.min(body.y,26.8),portrait?.67:.58),gaze);
      aimZ=lerp(aimZ,clamp(body.z*.50,-2.55,2.85),gaze);
      fov=lerp(fov,portrait?63:49,gaze);

      eyeX=lerp(eyeX,witness.x+(portrait?5.7:6.2),move);
      eyeY=lerp(eyeY,witness.y+5.90,move);
      eyeZ=lerp(eyeZ,witness.z-(portrait?12.9:13.7),move);
      aimX=lerp(aimX,witness.x+.39,move);
      aimY=lerp(aimY,witness.y+.64,move);
      aimZ=lerp(aimZ,witness.z+.36,move);
      fov=lerp(fov,portrait?47:42,move);
    }

    // Ease around the porch as the near roof loses its last support. Keep
    // the actual stone contact low on the right and the departing dragon
    // in the open center, then give the axial view back to the chain.
    const stone=landmark.userData.finaleParts?.halves[0][1].userData.roofStoneContact;
    const strike=impact+STOMP_LOAD+(stone?.at??1.44);
    const swing=flow(age,strike-.34,strike-.056)*(1-flow(age,strike+.30,strike+.79));
    if(swing>0){
      eyeX=lerp(eyeX,portrait?-10.2:-13.85,swing);
      eyeY=lerp(eyeY,portrait?8.70:6.48,swing);
      eyeZ=lerp(eyeZ,portrait?-50.75:-41.8,swing);
      aimX=lerp(aimX,portrait?-8.9:-9.12,swing);
      aimY=lerp(aimY,7.15,swing);
      aimZ=lerp(aimZ,-10.5,swing);
      fov+=swing*(portrait?4.6:2.75);
    }
    set(eyeX,eyeY,eyeZ,aimX,aimY,aimZ,fov);
  }
  gazeAlongRiver(river) {
    // This lens composes the next bend only when already following the
    // valley. It does not pull the view toward a route during free turns.
    const forward=THREE.MathUtils.smoothstep(this.forward.z,.50,.96);
    if(forward<=0)return;
    const here=river(this.focus.z);
    const beside=Math.abs(this.focus.x-here.x)/Math.max(1,here.halfWidth);
    const inValley=1-THREE.MathUtils.smoothstep(beside,.6,1.17);
    const ahead=river(this.target.z+6.0);
    this.target.x+=THREE.MathUtils.clamp(ahead.x-this.target.x,-4.5,4.5)*forward*inValley*.64;
  }

  frameValleyExit(river, weight) {
    const { clamp, lerp, smoothstep } = THREE.MathUtils;
    const slope = (river(this.focus.z+6).x-river(this.focus.z-6).x)/12;
    const alignment = (this.forward.x*slope+this.forward.z)/Math.hypot(slope,1);
    const amount = clamp(weight,0,1)*smoothstep(alignment,.62,.96);
    const shift = clamp(river(this.eye.z).x-this.eye.x,-11,11);
    // Ease the off-center boom toward the river and look through its next bend.
    // The ordinary body and terrain clearance still act on this framing.
    this.eye.x += shift*.58*amount;
    this.eye.y -= 1.61*amount;
    this.eye.addScaledVector(this.forward,-2.3*amount);
    const ahead = this.focus.z+14.8;
    this.target.set(lerp(this.target.x,river(ahead).x,amount),
      lerp(this.target.y,this.focus.y-2.93,amount),lerp(this.target.z,ahead,amount));
  }

  bodyTurn(frame) {
    // Long bodies swing across the view during a turn. Leave room for the
    // near coil and the space in front of the head at the same time.
    const bendPoint = frame.spine?.[Math.min(frame.spine.length-1,9)];
    const yawLag = Math.abs(angleDelta(this.followYaw,frame.heading));
    if (!bendPoint) return THREE.MathUtils.smoothstep(yawLag,.32,1.5);
    const x=bendPoint.x-this.focus.x,z=bendPoint.z-this.focus.z;
    const cosine=(x*this.forward.x+z*this.forward.z)/Math.max(.1,Math.hypot(x,z));
    return Math.max(THREE.MathUtils.smoothstep(cosine,-.9,-.20),THREE.MathUtils.smoothstep(yawLag,.32,1.5));
  }

  pickShoulder(frame,width,terrain) {
    const score=side=>{
      const x=this.eye.x+this.right.x*width*side;
      const z=this.eye.z+this.right.z*width*side;
      const dx=x-this.focus.x,dz=z-this.focus.z;
      const lengthSquared=dx*dx+dz*dz;
      let penalty=0;
      for(let i=3;i<frame.spine.length;i+=2){
        const point=frame.spine[i],px=point.x-this.focus.x,pz=point.z-this.focus.z;
        const fraction=(px*dx+pz*dz)/lengthSquared;
        if(fraction<.18||fraction>1)continue;
        const sideDistance=Math.hypot(px-dx*fraction,pz-dz*fraction);
        const rayY=this.focus.y+(this.eye.y-this.focus.y)*fraction;
        const cover=1-THREE.MathUtils.smoothstep(sideDistance,.58,2.25);
        penalty+=cover*(.55+.75*THREE.MathUtils.smoothstep(point.y-rayY,-2.2,0));
      }
      if(terrain)for(const t of [.33,.62,.91]){
        const y=this.focus.y+(this.eye.y-this.focus.y)*t;
        penalty+=Math.max(0,terrain(this.focus.x+dx*t,this.focus.z+dz*t)+.85-y)*.6;
      }
      return penalty;
    };
    return score(1)+.24<score(-1) ? 1 : -1;
  }

  openViewAhead(terrain) {
    let obstruction=0;
    for(const t of [.35,.55,.75,.96]){
      const x=THREE.MathUtils.lerp(this.focus.x,this.target.x,t);
      const z=THREE.MathUtils.lerp(this.focus.z,this.target.z,t);
      const y=THREE.MathUtils.lerp(this.focus.y+.5,this.target.y,t);
      obstruction=Math.max(obstruction,terrain(x,z)+1.05-y);
    }
    this.target.y+=Math.min(3.1,Math.max(0,obstruction)*.63);
  }

  clearReceiverView(impact, terrain) {
    if (this.handoffTravel < .045 || !impact?.handoff || impact.progress < .35) return;
    const target = this.receiverView.set(impact.x,impact.y+.65,impact.z);
    if (this.eye.distanceToSquared(target) > 64*64) return;
    let deficit = 0;
    for (const t of [.30,.46,.61,.77]) {
      const x=THREE.MathUtils.lerp(this.eye.x,target.x,t);
      const z=THREE.MathUtils.lerp(this.eye.z,target.z,t);
      const y=THREE.MathUtils.lerp(this.eye.y,target.y,t);
      deficit=Math.max(deficit,(terrain(x,z)+.70-y)/(1-t));
    }
    const lift=Math.min(2.3,deficit)*this.handoffTravel;
    this.eye.y += lift;
    this.target.y += lift*.25;
  }

  clearNearBody(frame,dt,switched) {
    // Use the body's projected corridor, not just yaw or total length. A
    // returning coil can cross the sight line even after the neck straightens.
    const x=this.eye.x-this.focus.x, z=this.eye.z-this.focus.z;
    const boomSquared=x*x+z*z;
    const headY=this.focus.y+.45;
    let lift=0;
    for(let i=3;i<frame.spine.length;i+=2){
      const point=frame.spine[i];
      const dx=point.x-this.focus.x,dz=point.z-this.focus.z;
      const along=(dx*x+dz*z)/boomSquared;
      if(along<.26||along>1.04)continue;
      const lateral=Math.hypot(dx-x*along,dz-z*along);
      const weight=1-THREE.MathUtils.smoothstep(lateral,.78,2.55);
      const lineY=headY+(this.eye.y-headY)*along;
      lift=Math.max(lift,weight*Math.max(0,(point.y+1.25-lineY)/along));
    }
    const request=Math.min(4.1,lift);
    const previous=this.bodyLift;
    this.bodyLift=switched?request:Math.max(request,previous*Math.exp(-Math.max(0,dt)*5.5));
    this.eye.y+=this.bodyLift;
  }

  terrainRay(from,to,height,spread=0){
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
    const span=Math.hypot(dx,dz),samples=Math.max(1,Math.ceil(span/.50));
    let first=1,lift=0;
    for(let i=1;i<=samples;i++){
      const t=i/samples,x=from.x+dx*t,z=from.z+dz*t,y=from.y+dy*t;
      let ground=height(x,z);
      if(spread&&t>.45){
        const width=spread*(t-.45)/.55;
        ground=Math.max(ground,height(x+this.right.x*width,z+this.right.z*width),
          height(x-this.right.x*width,z-this.right.z*width));
      }
      const gap=ground+.50-y;
      if(gap<=0)continue;
      first=Math.min(first,t);
      lift=Math.max(lift,gap/t);
    }
    return {first,lift};
  }

  clearTerrain(frame,height,dt,switched){
    const {clamp,lerp}=THREE.MathUtils;
    const head=this.terrainHead.copy(this.focus);
    head.y+=.35;
    const preferred=this.terrainEye.copy(this.eye);
    const test=this.terrainTest;
    let bestShift=0;
    let best=this.terrainRay(head,preferred,height,1.1);
    if(best.first<.84){
      // A narrow ridge often covers one shoulder and leaves the other
      // side navigable. Keep the closest alternative with an open view.
      for(const x of [3.6,-3.6,6.4,-6.4]){
        test.copy(preferred).addScaledVector(this.right,x);
        const candidate=this.terrainRay(head,test,height,1.1);
        const score=candidate.first-.017*Math.abs(x)-.018*Math.min(8,candidate.lift);
        const old=best.first-.017*Math.abs(bestShift)-.018*Math.min(8,best.lift);
        if(score>old){best=candidate;bestShift=x;}
      }
    }
    const span=Math.max(.01,Math.hypot(preferred.x-head.x,preferred.z-head.z));
    const release=1-Math.exp(-Math.max(0,dt)*4.5);
    this.terrainSideShift=switched?bestShift:lerp(this.terrainSideShift,bestShift,release);
    preferred.addScaledVector(this.right,this.terrainSideShift);
    const obstruction=this.terrainRay(head,preferred,height,1.1);
    // If the ridge is already beside the dragon, a very short boom
    // magnifies the protruding rock and hides the wings. Keep a usable
    // distance and climb over the near crest when there is no side gap.
    const overCrest=obstruction.first<.40;
    const retreat=obstruction.lift>0?clamp(obstruction.first-1.0/span,Math.min(.82,8.2/span),1):1;
    // Pull forward on the obstructed frame. Only the return to the
    // authored distance is eased, so the camera never eases through rock.
    this.terrainBoom=switched?retreat:Math.min(retreat,lerp(this.terrainBoom,1,release));
    this.eye.x=lerp(head.x,preferred.x,this.terrainBoom);
    this.eye.z=lerp(head.z,preferred.z,this.terrainBoom);
    this.eye.y=lerp(head.y+3.2,preferred.y,this.terrainBoom);
    this.eye.y=Math.max(this.eye.y,height(this.eye.x,this.eye.z)+(overCrest?2.8:1.65));
    let lift=this.terrainRay(head,this.eye,height,1.0).lift;
    for(const station of [2,4,7]){
      const point=frame.spine?.[Math.min(station,frame.spine.length-1)];
      if(!point)continue;
      const shoulder=this.terrainTorso.copy(point);
      shoulder.y+=.52;
      if(shoulder.y>height(shoulder.x,shoulder.z)+.23){
        const bodyLift=this.terrainRay(shoulder,this.eye,height,.6).lift;
        lift=Math.max(lift,Math.min(11,bodyLift));
      }
    }
    this.terrainLift=switched?lift:Math.max(lift,lerp(this.terrainLift,0,release));
    this.eye.y+=this.terrainLift;
    if(this.terrainBoom<.87||obstruction.lift>0){
      // Center the dragon before a far look-ahead can push its head
      // under the frame when the boom suddenly telescopes.
      const center=clamp((1-this.terrainBoom)*1.47+this.terrainLift*.039,0,.97);
      this.target.lerp(head,center);
    }
  }
}

export function projectRainDragon(actor,camera,head,tail){
  actor.muzzle(head).project(camera);
  const end=actor.pathPoints.at(-1);
  actor.root.localToWorld(tail.copy(end)).project(camera);
}
