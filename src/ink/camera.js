import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const surfaceCamera = [
  { height: 14, distance: 22, azimuth: .32, zoom: 1.28 },
  { height: 24, distance: 28, azimuth: .37, zoom: .97 },
  { height: 13, distance: 27, azimuth: .23, zoom: 1.07 },
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
    this.followPivot = new THREE.Vector3();
    this.followYaw = 0;
    this.turnRoom = 0;
    this.bodyLift = 0;
    this.shoulder = -2.2;
    this.shoulderSide = -1;
    this.openShoulder = false;
    this.controlYaw = null;
    this.heldYaw = null;
    this.heldInput = new THREE.Vector2();
    this.clawBlend = 0;
    this.clawEye = new THREE.Vector3();
    this.clawFocus = new THREE.Vector3();
    this.clawSide = 1;
    this.ray = new THREE.Raycaster();
    this.screen = new THREE.Vector2();
    this.plane = new THREE.Plane(UP, 0);
    this.hit = new THREE.Vector3();
    this.camera = this.flat;
  }
  resize() {
    this.flight.aspect = innerWidth / innerHeight;
    this.flight.updateProjectionMatrix();
  }
  set(frame, dt, { menu, study, forceFollow, center, landmark, ascentOrigin, terrainHeight, mountainRiver, contact, motion }) {
    const stage = frame.stage;
    this.focus.set(frame.position.x, frame.position.y, frame.position.z);
    this.forward.set(Math.sin(frame.heading), 0, Math.cos(frame.heading));
    this.right.crossVectors(this.forward, UP);
    const follow = forceFollow || (!menu && stage >= 3);
    const mode = `${stage}:${follow}:${menu}:${study}`;
    const switched = this.mode !== mode;
    this.mode = mode;
    this.controlYaw = null;
    if(switched)this.heldYaw=null;

    if (follow) {
      this.camera = this.flight;
      if (stage === 4 && landmark) {
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
      } else {
        // Filter heading along the arc of the orbit. Blending two eye positions
        // on opposite sides of the dragon can send the camera through its body.
        const headingEase = 1 - Math.exp(-Math.max(dt, 0) * 4.2);
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
        this.forward.set(Math.sin(this.followYaw), 0, Math.cos(this.followYaw));
        this.right.crossVectors(this.forward, UP);

        const portrait = this.flight.aspect < 1;
        const isMountain = stage === 3;
        const bend = isMountain ? this.bodyTurn(frame) : 0;
        this.turnRoom = Math.max(bend, this.turnRoom * Math.exp(-Math.max(0,dt)*3.8));
        const contactRoom=isMountain&&!study&&contact?.to ? .60 : 0;
        const turnRoom=Math.max(this.turnRoom,contactRoom);
        const offset = (isMountain ? 9.4 : 12.8) + (portrait ? 1.55 : 0) + turnRoom*4.2;
        const homeShoulder=portrait ? -.85 : -2.2;
        this.eye.copy(this.followPivot).addScaledVector(this.forward,-offset);
        this.eye.y += (isMountain?5.2:4.6) + this.turnRoom*1.55;
        this.target.copy(this.focus).addScaledVector(this.forward, isMountain ? 12.4 : 7);
        this.target.y -= isMountain ? 2.5-this.turnRoom*1.64 : .6;
        if(isMountain&&mountainRiver)this.gazeAlongRiver(mountainRiver);
        if (isMountain) {
          if(!study){
            // A cinematic shoulder shift must not rotate a held move input.
            this.controlYaw=Math.atan2(this.target.x-this.eye.x-this.right.x*homeShoulder,
              this.target.z-this.eye.z-this.right.z*homeShoulder);
          }
          const width=Math.abs(homeShoulder)+(portrait?2.5:3.9)*turnRoom;
          if(turnRoom>.35&&!this.openShoulder){
            this.openShoulder=true;
            this.shoulderSide=this.pickShoulder(frame,width,terrainHeight,contact?.to);
          }else if(turnRoom<.19){
            this.openShoulder=false;
          }
          const shoulder=this.openShoulder?this.shoulderSide*width:homeShoulder;
          this.shoulder=THREE.MathUtils.lerp(this.shoulder,shoulder,1-Math.exp(-Math.max(0,dt)*6.7));
          this.eye.addScaledVector(this.right,this.shoulder);
          this.clearNearBody(frame,dt,switched);
          if (terrainHeight) this.clearTerrain(terrainHeight);
          if(contactRoom){
            this.aim.set(contact.to.x,contact.to.y+.32,contact.to.z);
            if(this.aim.distanceToSquared(this.focus)<49)this.target.lerp(this.aim,.23);
          }
          if(terrainHeight)this.openViewAhead(terrainHeight);
        }else{
          this.eye.addScaledVector(this.right,homeShoulder);
        }
        this.flight.fov = (portrait ? 72 : 57)+(isMountain?turnRoom*3.1:0);
      }
      if (stage === 4 && landmark) {
        const ease = switched ? 1 : 1 - Math.exp(-Math.max(dt, 0) * 5);
        this.camera.position.lerp(this.eye, ease);
        if (switched) this.smoothedTarget = this.target.clone();
        else this.smoothedTarget.lerp(this.target, ease);
        this.camera.lookAt(this.smoothedTarget);
      } else {
        this.camera.position.copy(this.eye);
        this.camera.lookAt(this.target);
      }
    } else if (!menu && !study && stage < 3) {
      this.camera = this.flight;
      const height=[12.2,14.2,9.5][stage];
      const distance=[21.0,30,27][stage];
      const lookAhead=[2.8,6.4,3.1][stage];
      this.target.set(center.x,frame.position.y+.1,center.z+lookAhead);
      this.eye.set(center.x+(stage===0?5.8:5.2),frame.position.y+height,center.z-distance);
      this.camera.position.copy(this.eye);
      this.camera.lookAt(this.target);
      this.flight.fov = this.flight.aspect < 1 ? 63 : stage===0 ? 52 : 49;
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
      } else if (study) {
        this.target.z -= Math.min(9, frame.length * .22);
      } else {
        this.target.x = center.x;
        this.target.z = center.z - 1;
      }
      this.eye.copy(this.target);
      this.eye.x += Math.sin(layout.azimuth) * layout.distance;
      this.eye.z -= Math.cos(layout.azimuth) * layout.distance;
      this.eye.y += layout.height;
      this.camera.position.copy(this.eye);
      this.camera.lookAt(this.target);
      this.camera.zoom = menu ? 1.08 : layout.zoom;
    }

    this.composeClaw(frame,dt,switched,!menu&&!study?contact:null,motion,terrainHeight);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    return this.camera;
  }
  composeClaw(frame,dt,switched,contact,motion,terrainHeight) {
    if(switched)this.clawBlend=0;
    if(this.camera!==this.flight||frame.stage<2||frame.stage>3)return;
    const prey=motion?.clawSurface?.point??contact?.to;
    const close=prey&&contact?.to&&Math.hypot(prey.x-frame.position.x,prey.y-frame.position.y,
      prey.z-frame.position.z)<6;
    if(close){
      if(this.clawBlend<.035)this.clawSide=contact.side<0?-1:1;
      this.clawFocus.set(prey.x,prey.y,prey.z).lerp(this.focus,.57);
    }
    const ease=1-Math.exp(-Math.max(0,dt)*(close?7.4:4.6));
    this.clawBlend=THREE.MathUtils.lerp(this.clawBlend,Number(Boolean(close)),ease);
    if(this.clawBlend<.004)return;
    const mountain=frame.stage===3;
    const portrait=this.flight.aspect<1;
    // A momentary closer angle leaves the base camera's steering yaw intact.
    if(this.controlYaw===null)this.controlYaw=Math.atan2(this.target.x-this.eye.x,this.target.z-this.eye.z);
    this.clawEye.copy(this.clawFocus)
      .addScaledVector(this.forward,-(mountain?10.9:14.0))
      .addScaledVector(this.right,-this.clawSide*(portrait?5.9:mountain?9.3:12.4));
    this.clawEye.y+=(mountain?5.5:5.1)+(portrait?1.05:0);
    this.eye.lerp(this.clawEye,this.clawBlend*.79);
    this.target.lerp(this.aim.copy(this.clawFocus).addScaledVector(this.forward,mountain?3.3:2.6),
      this.clawBlend*.78);
    if(terrainHeight)this.clearTerrain(terrainHeight);
    this.flight.position.copy(this.eye);
    this.flight.lookAt(this.target);
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

  pickShoulder(frame,width,terrain,target) {
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
      if(target){
        const across=(target.x-this.focus.x)*this.right.x+(target.z-this.focus.z)*this.right.z;
        penalty+=side*across<0 ? .68 : 0;
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

  clearTerrain(terrainHeight) {
    // Keep the sight line to the shoulder out of ridges, including when the
    // dragon is just rounding a corner and the orbit is on the rock side.
    const headHeight = this.focus.y + .65;
    let minHeight = this.eye.y;
    for (const fraction of [.22, .40, .62, .80, 1]) {
      const x = THREE.MathUtils.lerp(this.focus.x, this.eye.x, fraction);
      const z = THREE.MathUtils.lerp(this.focus.z, this.eye.z, fraction);
      const height = terrainHeight(x, z);
      minHeight = Math.max(minHeight, headHeight + (height + 1.15 - headHeight) / fraction);
    }
    const lift = minHeight - this.eye.y;
    if (lift < 7) {
      this.eye.y = minHeight;
    } else {
      // Steep walls are handled by shortening the boom, so the view does not
      // jump above a summit while the dragon stays in the valley.
      const preferred = this.eye.clone();
      for (const fraction of [.8, .62, .46, .34]) {
        this.eye.lerpVectors(this.focus, preferred, fraction);
        this.eye.y = Math.max(this.eye.y, this.focus.y + 2.8);
        const wall = terrainHeight(this.eye.x, this.eye.z);
        if (wall + 1.2 <= this.eye.y) return;
      }
      this.eye.y = Math.max(this.eye.y, terrainHeight(this.eye.x, this.eye.z) + 1.2);
    }
  }
  input(x, z) {
    if(this.controlYaw!==null){
      const strength=Math.hypot(x,z);
      if(strength<.05){this.heldYaw=null;return {x:0,z:0};}
      const nx=x/strength,nz=z/strength;
      if(this.heldYaw===null||this.heldInput.x*nx+this.heldInput.y*nz<.69){
        this.heldYaw=this.controlYaw;
        this.heldInput.set(nx,nz);
      }
      const sin=Math.sin(this.heldYaw),cos=Math.cos(this.heldYaw);
      return {x:-cos*x-sin*z,z:sin*x-cos*z};
    }
    this.heldYaw=null;
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, UP);
    return {
      x: this.right.x * x - this.forward.x * z,
      z: this.right.z * x - this.forward.z * z,
    };
  }
  pointer(x, y, height, camera=this.camera) {
    this.screen.set(2 * x / innerWidth - 1, 1 - 2 * y / innerHeight);
    this.ray.setFromCamera(this.screen, camera);
    this.plane.constant = -height;
    const hit = this.ray.ray.intersectPlane(this.plane, this.hit);
    return hit ? { x: hit.x, z: hit.z } : null;
  }
}
