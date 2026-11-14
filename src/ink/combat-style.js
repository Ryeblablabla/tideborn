import * as THREE from 'three';
import { InkCombatMarks } from './combat-marks.js';

const pigments = {
  storm: ['#4d6969', .41], rain: ['#537481', .33], cloud: ['#647683', .34],
  steam: ['#7a8177', .21], thunder: ['#5f627b', .52],
  poison: ['#647849', .65], fire: ['#866344', .68], ring: ['#967647', .53],
  'wet-arc': ['#406e82', .69], 'dry-arc': ['#54566d', .47], 'relay-arc': ['#355969', .76],
};
const vertexShader = /* glsl */ `
  varying vec3 vSurface;
  varying vec3 vNormal;
  varying vec3 vCombatWorld;
  void main() {
    vSurface=position;
    vec4 p=vec4(position,1.);
    vec3 n=normal;
    #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      n=mat3(instanceMatrix)*n;
    #endif
    vNormal=normalize(normalMatrix*n);
    vCombatWorld=(modelMatrix*p).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*p;
  }`;
const fragmentShader = /* glsl */ `
  varying vec3 vSurface;
  varying vec3 vNormal;
  varying vec3 vCombatWorld;
  uniform float uLoad,uOpacity,uTime,uDanger;
  uniform vec4 uCombatWash;
  float noiseAt(vec3 p) {
    p=fract(p*.1031); p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float washAt(vec3 p) {
    vec3 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(mix(noiseAt(i),noiseAt(i+vec3(1,0,0)),f.x),mix(noiseAt(i+vec3(0,1,0)),noiseAt(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(noiseAt(i+vec3(0,0,1)),noiseAt(i+vec3(1,0,1)),f.x),mix(noiseAt(i+vec3(0,1,1)),noiseAt(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  void main(){
    vec3 p=vSurface*vec3(7.0,13.0,5.3);
    float wash=washAt(p-vec3(0.,uTime*.5,0.));
    float grain=washAt(p*7.8);
    float depth=.67+.33*abs(normalize(vNormal).z);
    float breaks=smoothstep(.31,.67,wash+grain*.2);
    float coverage=mix(.44+.56*breaks,.74+.26*breaks,uDanger);
    float ink=uLoad*mix(.76,1.15,wash)*depth;
    if(uCombatWash.w>.001&&uDanger<.5){
      vec3 offset=(vCombatWorld-uCombatWash.xyz)*vec3(1.,1.64,1.);
      float support=(1.-smoothstep(3.,12.,length(offset)))*uCombatWash.w;
      ink*=1.-.58*support;
      coverage*=1.-.25*support;
    }
    gl_FragColor=vec4(1.-clamp(ink,0.,.98),0.,grain,uOpacity*coverage);
  }`;

/** Paint combat geometry into the same pigment pass as the scene. */
export class InkCombatStyle {
  constructor(combat) {
    this.materials = new Map();
    this.swaps = [];
    this.lines = new WeakMap();
    this.clock = { value: 0 };
    this.handoff = { value: new THREE.Vector4() };
    this.marks = new InkCombatMarks(combat);
    this.muted = [];
    this.mute = object => {
      this.muted.push(object);
      object.visible = false;
    };
  }
  material(source, ink, opacity, danger) {
    const key = `${ink}:${opacity}:${danger}:${source.wireframe || false}:${source.side}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.ShaderMaterial({
        vertexShader,fragmentShader,
        transparent:opacity<1,depthWrite:opacity>=1,side:source.side,wireframe:source.wireframe,
        uniforms:{uLoad:{value:ink},uOpacity:{value:opacity},uTime:this.clock,uDanger:{value:Number(danger)},uCombatWash:this.handoff},
      });
      this.materials.set(key,material);
    }
    return material;
  }
  paint(root, role) {
    if (!root) return;
    root.traverseVisible(object => {
      const source = object.material;
      if (!source?.color) return;
      const danger = role === 'hazard' || object.userData.hostileWarning === true ||
        object.parent?.userData.hostileWarning === true;
      const kind = object.parent?.userData.kind;
      const [tint, amount] = kind && pigments[kind] ? pigments[kind] : danger ?
        ['#a44c37', .79] : role === 'guide' ? ['#8c754c', .74] : ['#4d6a66', .39];
      const opacity = Math.min(1, (source.opacity ?? 1) * (danger ? 1.15 : 1.06));
      object.userData.inkTint = tint;
      object.userData.inkTintAmount = amount * (.4 + opacity * .6);
      // Use the ordinary line shader for polylines without surface normals.
      if (object.isLine) {
        this.swaps.push([object, source]);
        let line=this.lines.get(object);
        if(!line){
          line=source.clone();
          line.color.setRGB(.54, 0, 0);
          this.lines.set(object,line);
          object.addEventListener('removed',()=>line.dispose());
        }
        object.material = line;
        return;
      }
      this.swaps.push([object, source]);
      object.material = this.material(source, kind==='relay-arc' ? .69 : danger ? .62 : .55, opacity, danger);
    });
  }
  render(world, scene, camera, time, game, handoff) {
    this.clock.value = time;
    if (handoff) this.handoff.value.set(handoff.x,handoff.y,handoff.z,handoff.strength);
    else this.handoff.value.w = 0;
    this.marks.handoff = handoff;
    try {
      this.marks.update(world, game, camera, time, this.mute);
      this.paint(world.combat.root, 'attack');
      this.paint(world.practiceGuide, 'guide');
      // The older renderer may call without a live simulation.
      if (!game) {
        for (const mesh of world.shotMeshes.values()) this.paint(mesh, 'attack');
        for (const mesh of world.hazardMeshes.values()) this.paint(mesh, 'hazard');
      }
      this.paint(world.bossShield, 'shield');
      world.inkDragon.render(scene, camera);
    } finally {
      for (const [object, material] of this.swaps) object.material = material;
      for (const object of this.muted) object.visible = true;
      this.swaps.length = 0;
      this.muted.length = 0;
    }
  }

  inspect() {
    return this.marks.inspect();
  }
}
