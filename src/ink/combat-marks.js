import * as THREE from 'three';
import { ENEMY_TYPES } from '../encounters.js';

const TAU = Math.PI * 2;
const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const particleColors = new Map([
  [0xb0f0e8, 'water'], [0x9acfff, 'water'], [0xbff9ee, 'water'], [0x9ee5ff, 'water'],
  [0xa9f5eb, 'water'], [0x79cfff, 'water'], [0xc7dbeb, 'water'], [0xe4efd9, 'water'],
  [0xb9e87e, 'poison'], [0xc7ee8b, 'poison'], [0xb0e97d, 'poison'], [0xa9efbc, 'poison'],
  [0xffbd69, 'fire'], [0xffa54e, 'fire'], [0xb9e9a3, 'danger'],
  [0xc7b3ff, 'thunder'], [0xbce9ff, 'thunder'], [0xdbb5ff, 'thunder'], [0xe4b5ff, 'thunder'],
  [0xffdf85, 'ochre'], [0xffe4a3, 'ochre'], [0xffe5a2, 'ochre'], [0xf3d9b8, 'ochre'],
]);
const particleTints = {
  water: '#507d83', poison: '#758644', fire: '#946c40', danger: '#ab4230',
  thunder: '#776991', ochre: '#a88648', ink: '#586663',
};
const organTints = {
  rain: '#466e83', storm: '#4d8275', lightning: '#716388', fire: '#a95032', poison: '#77873e',
};

const vertexShader = /* glsl */ `
  varying vec3 vMark;
  varying vec3 vNormal;
  void main() {
    vMark=position;
    vec4 p=instanceMatrix*vec4(position,1.);
    vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);
    gl_Position=projectionMatrix*modelViewMatrix*p;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vMark;
  varying vec3 vNormal;
  uniform float uMode,uLoad,uOpacity;
  float hash(vec3 p) {
    p=fract(p*.1031);
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float wash(vec3 p) {
    vec3 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  void main() {
    vec3 n=normalize(vNormal);
    float paint=wash(vMark*vec3(7.0,8.0,4.0)+vec3(2.9,5.4,1.7));
    float grain=wash(vMark*vec3(23.,27.,13.)+2.9);
    float reflectance=uLoad*(.72+.27*paint+.12*abs(n.z));
    float alpha=uOpacity;
    float reserve=0.;
    if (uMode<.5) {
      // Ink gathers on the lower edge of the open water loop.
      float stroke=smoothstep(-.35,.28,.6*vMark.x-vMark.y+(paint-.5)*.29);
      reflectance*=.46+.54*stroke;
      reserve=.16*(1.-stroke)*smoothstep(.49,.8,grain);
    } else if (uMode<1.5) {
      float tip=smoothstep(-.64,-.19,vMark.z+(paint-.5)*.09);
      reflectance*=.31+.69*tip;
      alpha*=.28+.72*tip;
      reserve=.15*(1.-tip);
    } else if (uMode<2.5) {
      // A dry slit on the dark red projectile keeps its tip directional.
      float seam=1.-smoothstep(.026,.060,abs(vMark.x+vMark.y*.36-.035));
      reserve=seam*.20*smoothstep(-.30,.30,vMark.z)*smoothstep(.26,.68,paint);
    } else if (uMode<3.5) {
      float core=.70+.30*abs(n.z);
      reflectance*=core;
      alpha*=.68+.32*smoothstep(.31,.71,paint+grain*.13);
    } else if (uMode<4.5) {
      reserve=.12*smoothstep(.53,.79,grain);
    } else if (uMode<5.5) {
      // The skimmer's pressed head is solid. Only the receding bristles break.
      float head=smoothstep(-.76,-.18,vMark.z);
      float fiber=wash(vMark*vec3(47.,18.,5.)+1.6);
      if (head<.59 && fiber+head<.43) discard;
      reflectance*=mix(.35,1.,head);
      reserve=.25*(1.-head)*smoothstep(.36,.68,fiber);
    } else if (uMode<6.5) {
      // Wet pigment collects along the outside of the lantern's curl.
      float rim=smoothstep(-.14,.16,-vMark.x+(paint-.5)*.15);
      reflectance*=.66+.34*rim;
      reserve=.28*(1.-rim)*smoothstep(.29,.63,paint);
    } else if (uMode<7.5) {
      float cut=1.-smoothstep(.018,.062,abs(vMark.x+.12*vMark.z-.045));
      reflectance*=.84+.16*smoothstep(-.29,.16,vMark.z);
      reserve=.29*cut*smoothstep(.23,.51,grain);
    } else if (uMode<8.5) {
      float shaft=1.-smoothstep(.025,.072,abs(vMark.x+.09*vMark.z));
      float quill=smoothstep(-.53,.18,vMark.z);
      reflectance*=.68+.32*quill;
      reserve=.27*shaft*smoothstep(.25,.57,paint);
    } else if (uMode<9.5) {
      // Wet pigment dries inward from the broad, uneven shoulders.
      float rim=smoothstep(.09,.27,abs(vMark.x-.08*vMark.z)+.05*(paint-.5));
      float tail=smoothstep(-.49,-.16,vMark.z);
      reflectance*=mix(.56,1.,rim)*mix(.63,1.,tail);
      alpha*=.52+.48*smoothstep(.29,.61,paint+rim*.28);
      reserve=.18*(1.-rim)*smoothstep(.27,.65,grain);
    } else {
      // A pressed dry stroke has a dark edge and an exposed fiber bed.
      float along=smoothstep(-1.14,.34,vMark.z);
      float fibers=wash(vMark*vec3(58.,22.,2.9)+3.2);
      float slit=(1.-smoothstep(.042,.15,abs(vMark.x-.10-.11*vMark.z)));
      float split=slit*(1.-smoothstep(.59,.89,along))*smoothstep(.22,.52,fibers);
      reflectance*=mix(.95,.31,split);
      alpha*=smoothstep(-1.22,-.66,vMark.z+.16*fibers)*mix(.77,1.,along);
      reserve=.47*split;
    }
    gl_FragColor=vec4(1.-clamp(reflectance,0.,.99),reserve,grain,alpha);
  }
`;

function brushLoop(radius, thickness, arc = TAU * .9, segments = 28) {
  const geometry = new THREE.TorusGeometry(radius, thickness, 5, segments, arc);
  const { position } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const angle = Math.atan2(y, x);
    const relief = .94 + .06 * Math.cos(angle * 3 - .7);
    position.setXYZ(i, x * relief, y * (1.03 + .06 * Math.sin(angle * 2)), position.getZ(i) * .48);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function brushDrop(profile, sides, crossRatio = 1) {
  // The lathe gives the wet stroke a real silhouette at oblique views.
  const geometry = new THREE.LatheGeometry(profile.map(([z, r]) => new THREE.Vector2(r, z)), sides);
  geometry.rotateX(Math.PI * .5);
  geometry.scale(1, crossRatio, 1);
  return geometry;
}

function sweptBrush(profile, sides = 8) {
  // Each section is [along travel, half width, half thickness, lateral bend].
  const positions = [], indices = [];
  for (const [z, width, thickness, bend = 0] of profile) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU;
      positions.push(bend + width * Math.cos(angle), thickness * Math.sin(angle), z);
    }
  }
  for (let row = 0; row < profile.length - 1; row++) {
    for (let side = 0; side < sides; side++) {
      const here = row * sides + side;
      const next = row * sides + (side + 1) % sides;
      indices.push(here, next, here + sides, next, next + sides, here + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function featherMark() {
  const geometry = sealMark([[0,.36],[-.19,.08],[-.28,-.34],[-.21,-.67],[-.02,-.43],
    [.15,-.58],[.25,-.26],[.17,.08]]);
  geometry.rotateX(Math.PI * .5);
  const { position } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    position.setY(i, .17 * Math.abs(x) - .10 * z * z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function hazardBrush(hazard) {
  switch (hazard.attack) {
    case 'surface-spit': return hazard.sourceType === ENEMY_TYPES.seaRay ? 'skim' : 'danger';
    case 'lantern-fan': return 'lanternFan';
    case 'shell-fan': return 'shellFan';
    case 'cloud-fan':
    case 'sky-salvo': return 'airFeather';
    default: return 'danger';
  }
}

function sealMark(points) {
  const outline = new THREE.Shape();
  outline.moveTo(...points[0]);
  for (const point of points.slice(1)) outline.lineTo(...point);
  outline.closePath();
  return new THREE.ShapeGeometry(outline);
}

function organGeometry(kind) {
  if (kind === 'storm') return brushLoop(.68, .24, TAU * .74, 14);
  if (kind === 'lightning') return sealMark([[-.20, 1], [-.75, -.10], [-.12, -.05], [-.35, -1], [.77, .27], [.16, .15], [.49, .98]]);
  const points = kind === 'rain' ?
    [[0, 1], [-.72, -.09], [-.75, -.55], [-.38, -.94], [.20, -.97], [.68, -.57], [.69, -.08]] :
    kind === 'fire' ?
      [[.1, 1], [-.73, .12], [-.61, -.65], [0, -1], [.63, -.67], [.73, -.11], [.52, .53], [.20, .02]] :
      [[-.20, .86], [-.89, .40], [-.76, -.35], [-.26, -.88], [.53, -.64], [.82, .10], [.49, .65]];
  return sealMark(points);
}

function batch(name, geometry, capacity, mode, tint, strength, hold, load, opacity = 1) {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    depthWrite: opacity === 1,
    uniforms: { uMode: { value: mode }, uLoad: { value: load }, uOpacity: { value: opacity } },
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Object.assign(mesh.userData, { inkTint: tint, inkTintAmount: strength, inkMineralHold: hold });
  return mesh;
}

/** Visual batches consume the live projectile and particle arrays without spawning effects. */
export class InkCombatMarks {
  constructor(combat) {
    this.root = new THREE.Group();
    this.root.name = 'InkCombatMarks';
    combat.root.add(this.root);
    this.projectiles = {
      bubble: batch('水息 · 青墨环', brushLoop(.32, .047), 160, 0, '#416d79', .82, .61, .78),
      poison: batch('碧雾 · 湿墨团', sweptBrush([[-.53,.006,.004,-.12],[-.37,.21,.13,-.13],[-.22,.29,.17,-.08],
        [-.04,.22,.20,.035],[.15,.28,.15,.06],[.33,.19,.11,.07],[.46,.006,.004,.02]],10),
        160, 9, '#657c35', .92, .69, .84, .96),
      needle: batch('穿波针 · 飞白', brushDrop([[-1.22,.004],[-.82,.045],[-.14,.076],[.28,.065],[.67,.003]],8,.98),
        160, 1, '#31546b', .93, .63, .82, .92),
      breach: batch('赤锋长息 · 劈笔', sweptBrush([[-1.24,.008,.004,.19],[-.92,.16,.029,.12],[-.54,.30,.074,.045],
        [-.16,.36,.12,-.035],[.15,.25,.086,-.11],[.51,.11,.04,-.20],[.68,.008,.004,-.25]]),
        160, 10, '#a16536', .95, .59, .89, .96),
      danger: batch('吐弹 · 积朱', brushDrop([[-.32,.005],[-.24,.17],[-.09,.268],[.11,.255],[.25,.15],[.31,.004]],10,.96),
        160, 2, '#aa3526', .98, .68, .85),
      skim: batch('海鳐 · 掠锋', sweptBrush([[-.92,.006,.003,.04],[-.61,.067,.019,.085],[-.26,.14,.053,.046],
        [-.04,.274,.092],[.17,.20,.071,-.029],[.36,.006,.004,-.02]]), 160, 5, '#aa3526', .98, .68, .87),
      lanternFan: batch('水母 · 卷锋', sweptBrush([[-.58,.005,.005,.25],[-.41,.074,.063,.18],[-.19,.137,.126,.075],
        [.03,.257,.189,-.006],[.20,.185,.131,-.071],[.34,.006,.004,-.106]]), 160, 6, '#a7372a', .98, .68, .86),
      shellFan: batch('龙龟 · 压锋', sweptBrush([[-.43,.174,.013],[-.35,.26,.087],[-.05,.286,.112],
        [.20,.208,.089],[.35,.023,.021]]), 160, 7, '#a93726', .98, .71, .91),
      airFeather: batch('空翎 · 开叉', featherMark(), 160, 8, '#aa3526', .98, .69, .91),
    };
    const spatter = brushDrop([[-.87, .005], [-.29, .52], [.13, .69], [.52, .40], [.74, .005]], 6, .83);
    this.particles = Object.fromEntries(Object.entries(particleTints).map(([kind, tint]) => {
      const mesh=batch('墨点 ' + kind, spatter, 1500, 3, tint, .89, .65, .68, .74);
      if(kind!=='danger')mesh.material.side=THREE.FrontSide;
      return [kind,mesh];
    }));
    this.organs = Object.fromEntries(Object.entries(organTints).map(([kind, tint]) => [
      kind, batch('器官 ' + kind, organGeometry(kind), 10, 4, tint, .96, .73, .74),
    ]));
    this.batches = [...Object.values(this.projectiles), ...Object.values(this.particles), ...Object.values(this.organs)];
    this.root.add(...this.batches);
    this.dummy = new THREE.Object3D();
    this.velocity = new THREE.Vector3();
    this.viewNormal = new THREE.Vector3();
    this.viewUp = new THREE.Vector3();
    this.markRight = new THREE.Vector3();
    this.markUp = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.scale = new THREE.Vector3();
    this.muzzle = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.headRay = new THREE.Vector3();
    this.particleRay = new THREE.Vector3();
  }

  instance(mesh) {
    this.dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count++, this.dummy.matrix);
  }

  aimBrush(entity, maxDepth = 1) {
    this.velocity.set(entity.vx, entity.vy, entity.vz);
    if (this.velocity.lengthSq() < 1e-6) this.velocity.copy(FORWARD);
    this.velocity.normalize();
    // Keep the brush readable when the camera looks down the path. Its center
    // stays on the simulated projectile. Surface marks keep their actual angle.
    const depth = this.velocity.dot(this.viewNormal);
    if (Math.abs(depth) <= maxDepth) return;
    this.velocity.addScaledVector(this.viewNormal, -depth);
    if (this.velocity.lengthSq() < 1e-6) this.velocity.copy(this.viewUp);
    this.velocity.normalize().multiplyScalar(Math.sqrt(1 - maxDepth ** 2));
    this.velocity.addScaledVector(this.viewNormal, Math.sign(depth) * maxDepth);
  }

  projectile(kind, entity, camera, time, launch) {
    this.dummy.position.set(entity.x, entity.y, entity.z);
    if(launch){
      const age=entity.startLife-entity.life;
      this.dummy.position.addScaledVector(launch.offset,1-THREE.MathUtils.smoothstep(age,launch.age,launch.end));
    }
    this.dummy.scale.setScalar(1);
    if (kind === 'bubble') {
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.rotateZ(entity.id * .63 + time * .46);
    } else {
      this.aimBrush(entity, .68);
      if (kind === 'breach') {
        this.markUp.copy(this.viewNormal).addScaledVector(this.velocity, -this.viewNormal.dot(this.velocity)).normalize();
        this.markRight.crossVectors(this.markUp, this.velocity);
        this.dummy.quaternion.setFromRotationMatrix(this.matrix.makeBasis(this.markRight, this.markUp, this.velocity));
        this.dummy.rotateZ(-.19);
      } else {
        this.dummy.quaternion.setFromUnitVectors(FORWARD, this.velocity);
        this.dummy.rotateZ(entity.id * 1.25 + time * (kind === 'poison' ? 1.1 : 2.2));
      }
    }
    this.instance(this.projectiles[kind]);
  }

  enemyProjectile(hazard) {
    const kind = hazardBrush(hazard);
    const air = kind === 'airFeather';
    this.aimBrush(hazard, air ? .78 : 1);
    this.markRight.crossVectors(air ? this.viewNormal : UP, this.velocity);
    if (this.markRight.lengthSq() < 1e-6) this.markRight.crossVectors(FORWARD, this.velocity);
    this.markRight.normalize();
    this.markUp.crossVectors(this.velocity, this.markRight);
    this.dummy.position.set(hazard.x, hazard.y, hazard.z);
    this.dummy.quaternion.setFromRotationMatrix(this.matrix.makeBasis(this.markRight, this.markUp, this.velocity));
    const width = (hazard.radius ?? .30) / .30;
    this.dummy.scale.set(width, width, 1);
    if (kind === 'lanternFan') this.dummy.rotateZ(.59);
    if (air) {
      if (hazard.layer === 'low') {
        this.dummy.rotateZ(.70);
        this.dummy.scale.set(width * .83, width, 1.11);
      } else if (hazard.layer === 'high') {
        this.dummy.rotateZ(-.12);
        this.dummy.scale.set(width * 1.10, width, .87);
      } else {
        this.dummy.scale.set(width * .88, width, .82);
      }
    }
    this.instance(this.projectiles[kind]);
  }

  mouthLaunch(world,source,shot){
    if(source.userData.mouthLaunch!==undefined)return source.userData.mouthLaunch;
    const age=shot.startLife-shot.life;
    const point=age<.10?world.inkDragon.muzzle(this.muzzle):null;
    // The initial brush mark starts at the sculpted mouth. The simulated
    // projectile and hit path stay authoritative beyond the muzzle blend.
    source.userData.mouthLaunch=point?{
      offset:point.clone().sub(new THREE.Vector3(
        shot.x-shot.vx*age,shot.y-shot.vy*age,shot.z-shot.vz*age,
      )).clampLength(0,1.85),
      age,end:Math.max(age+.028,shot.muzzleBlend),
    }:null;
    return source.userData.mouthLaunch;
  }

  update(world, game, camera, time, mute) {
    this.root.visible = Boolean(game && world.combat.root.visible);
    if (!this.root.visible) return;
    for (const mesh of this.batches) mesh.count = 0;
    this.viewNormal.set(0, 0, 1).applyQuaternion(camera.quaternion);
    this.viewUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const shot of game.shots) {
      const source = world.shotMeshes.get(shot.id);
      if (!source?.visible) continue;
      const kind=shot.kind==='mist'?'poison':this.projectiles[shot.kind]?shot.kind:'bubble';
      this.projectile(kind, shot, camera, time, this.mouthLaunch(world,source,shot));
      mute(source);
    }
    for (const hazard of game.hazards) {
      const source = world.hazardMeshes.get(hazard.id);
      if (hazard.warning || !source?.visible) continue;
      this.enemyProjectile(hazard);
      mute(source);
    }

    const { combat } = world;
    if (combat.pool.visible) {
      mute(combat.pool);
      if(world.inkDragon.stage!==game.stage||!world.inkDragon.muzzle(this.head)){
        this.head.set(game.p.x,game.p.y+.55,game.p.z);
      }
      this.headRay.subVectors(this.head,camera.position);
      const headDepth=Math.max(.001,this.headRay.lengthSq());
      const headWidth=[.76,.96,1.42,1.51][game.stage]??1.51;
      for (const particle of combat.particles) {
        const kind = particleColors.get(particle.color) ?? 'ink';
        let size = particle.size * Math.min(1, particle.life * 4);
        this.dummy.position.set(particle.x, particle.y, particle.z);
        if(kind!=='danger'){
          this.particleRay.subVectors(this.dummy.position,camera.position);
          const along=this.particleRay.dot(this.headRay)/headDepth;
          if(along>.08&&along<.995){
            const lateral=this.particleRay.addScaledVector(this.headRay,-along).length()/Math.max(.22,along);
            const reserve=(1-THREE.MathUtils.smoothstep(lateral,headWidth*.53,headWidth*1.43))
              *THREE.MathUtils.smoothstep(along,.08,.22);
            if(reserve>.94)continue;
            size*=1-.76*reserve;
          }
        }
        this.velocity.set(particle.vx, particle.vy, particle.vz);
        const speed = this.velocity.length();
        this.dummy.quaternion.setFromUnitVectors(FORWARD, speed > .01 ? this.velocity.multiplyScalar(1 / speed) : FORWARD);
        this.dummy.scale.set(size * 1.30, size * 1.30, size * (1.45 + Math.min(1.2, speed * .22)));
        this.instance(this.particles[kind]);
      }
    }
    if (combat.nodes.visible) {
      mute(combat.nodes);
      const organs = game.organs();
      organs.forEach((organ, index) => {
        const mesh = this.organs[organ.type];
        if (!mesh || index >= combat.nodes.count) return;
        combat.nodes.getMatrixAt(index, this.matrix);
        this.dummy.position.setFromMatrixPosition(this.matrix);
        this.dummy.quaternion.copy(camera.quaternion);
        if (organ.type === 'storm') this.dummy.rotateZ(time * .72 + index);
        const size = this.scale.setFromMatrixScale(this.matrix).x;
        this.dummy.scale.setScalar(size * 1.22);
        this.instance(mesh);
      });
    }
    for (const mesh of this.batches) {
      mesh.visible = mesh.count > 0;
      if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  inspect() {
    const counts = batches => Object.fromEntries(Object.entries(batches).map(([kind, mesh]) => [
      kind, this.root.visible ? mesh.count : 0,
    ]));
    return { projectiles: counts(this.projectiles), particles: counts(this.particles), organs: counts(this.organs) };
  }
}
