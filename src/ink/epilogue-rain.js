import {
  DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry,
  MathUtils, Mesh, Plane, PlaneGeometry, Raycaster, ShaderMaterial, Vector2, Vector3,
} from 'three';
import { random } from '../rules.js';
import { ENDING_ROUTE_SITES } from '../ending-route.js';

const STATIONS = 152;
const BRIDGE_STREAKS = 3;
const LEAF_HIT = .58;
const LEAF_RUNOFF = 1.14;

const eventClock = /* glsl */ `
  attribute vec4 aLanding;
  attribute vec4 aVariation;
  attribute vec4 aShore;
  attribute vec2 aFirstDrop;
  attribute vec4 aBridge;
  uniform float uAge, uWide, uOnset, uPortrait, uLake;
  uniform vec3 uDragon;
  varying vec2 vBrush;
  varying vec2 vShore;
  varying float vLife, vStrength, vSeed, vDensity, vAccent, vBridge;

  float sinceImpact() {
    if (aFirstDrop.y > .0) return uAge - aFirstDrop.x;
    return mod(uAge + aVariation.x, aVariation.y) - .47 * aVariation.y;
  }

  float rainFront() {
    // A first line reaches the chain, then the bank and foreground join.
    float enters = .80 - .51 * smoothstep(8.,20.,aLanding.z) + aVariation.w * .21;
    return mix(1.,smoothstep(enters,enters+.45,uAge),uLake*(1.-step(.001,aFirstDrop.y)));
  }

  void place(vec3 point) {
    gl_Position = projectionMatrix * viewMatrix * vec4(point, 1.);
    vBrush = uv * 2. - 1.;
    vSeed = aVariation.w;
    vAccent=step(.001,aFirstDrop.y);
    vBridge=step(.001,aBridge.w);
  }
`;

const rainVertex = /* glsl */ `
  ${eventClock}
  vec3 fallingBridge(float p){
    float travel=p*(.70+.30*p);
    vec3 point=mix(aBridge.xyz,aLanding.xyz,travel);
    vec2 across=vec2(aBridge.z-aLanding.z,aLanding.x-aBridge.x);
    point.xz+=across*.16*sin(travel*3.14159);
    return point;
  }

  void main() {
    float time = sinceImpact();
    float speed = mix(14., 39., uWide) * mix(.8, 1.2, aVariation.z);
    float distanceToLens=distance(aLanding.xyz,cameraPosition);
    float nearLens=1.-smoothstep(5.,mix(14.,27.,uWide),distanceToLens);
    float accent=smoothstep(.33,.85,aVariation.z);
    float streakLength = mix(.84, 3.85, uWide) * mix(.48, 1.40, aVariation.z);
    float width = mix(.038, .123, uWide) * mix(.61, 1.58, accent);
    streakLength*=1.-uPortrait*(.11+.29*nearLens);
    width*=1.-uPortrait*(.14+.35*nearLens);
    float focused=step(.001,aFirstDrop.y);
    float fallTime=mix(.47*aVariation.y,.37,focused);
    speed=mix(speed,aFirstDrop.y/.37,focused);
    streakLength=mix(streakLength,min(aFirstDrop.y*.44,4.8),focused);
    width*=1.+focused*.69;
    float height = max(-time * speed, 0.) + uv.y * streakLength;
    float breeze = sin(uAge * 1.8 + aLanding.z * .09) * .16;
    float curvature = mix(.012, .023, aVariation.z) * min(9., height);
    vec3 point = aLanding.xyz + vec3(-.34 - curvature + breeze, 1., .12 + curvature) * height;
    float joining=step(.001,aBridge.w);
    float fall=1.+time/max(.001,aBridge.w);
    float stroke=mix(.24,.43,aVariation.z)*mix(1.16,1.,uWide)*(1.+.32*uLake);
    vec3 moving=fallingBridge(fall-uv.y*stroke);
    point=mix(point,moving,joining);
    width=mix(width,(.126+.062*aVariation.z)*(1.+.22*clamp(fall,0.,1.))*mix(1.22,1.,uWide)*(1.-.54*uLake),joining);
    point += width * position.x * vec3(viewMatrix[0].x, 0., viewMatrix[2].x);
    vLife = 0.;
    vShore = vec2(0.);
    vDensity = mix(.67,1.,accent) * (1.-.29*nearLens);
    float nearWing=1.-smoothstep(5.3,12.0,length(point-uDragon));
    float firstBeat=1.-smoothstep(.44,1.36,uAge);
    float separation=1.-uWide*nearWing*(.37+.56*firstBeat);
    float timing=mix(smoothstep(0.,.075,time+fallTime),smoothstep(-.27,-.055,fall),joining);
    vStrength = uOnset * rainFront() * (1. - step(0., time)) * timing
      * (1.-uPortrait*.38*nearLens) * separation * (1.+focused*.38+joining*mix(.48,.25,uWide));
    place(point);
  }
`;

const rainFragment = /* glsl */ `
  varying vec2 vBrush;
  varying float vStrength, vSeed, vDensity, vAccent, vBridge;
  void main() {
    float along = .5 + .5 * vBrush.y;
    float taper = sin(3.14159 * pow(clamp(along, 0., 1.), .62));
    float grain = .5 + .5 * sin(along * 54. + vSeed * 27. + sin(along * 19.) * 2.);
    float rim = abs(vBrush.x + .05 * sin(along * 14. + vSeed * 30.));
    float edge = max(fwidth(rim), .065);
    float brush = 1. - smoothstep(taper * .25, taper * .84 + edge, rim);
    float alpha = vStrength * brush * taper * mix(.32, .83, grain);
    if (alpha < .012) discard;
    float value=clamp(.63-.36*vDensity+.16*grain+(vSeed-.5)*.23-.09*vAccent-.105*vBridge,.10,.87);
    float flash=vBridge*smoothstep(.28,.79,grain)*smoothstep(.43,1.,vBrush.x)*.34;
    gl_FragColor = vec4(value, .10 + .08 * grain + flash, .53, alpha);
  }
`;

const impactVertex = /* glsl */ `
  ${eventClock}
  void main() {
    float time = sinceImpact();
    float focused=step(.001,aFirstDrop.y);
    float joining=step(.001,aBridge.w);
    float life = clamp(time / mix(mix(.27,.70,aVariation.z),1.01+.28*joining,focused), 0., 1.);
    float size = mix(1.02, 2.33, uWide) * mix(.41, 1.61, aVariation.z*aVariation.z);
    float close=1.-smoothstep(3.8,10.5,distance(aLanding.xyz,cameraPosition));
    size*=1.+.25*focused+(.38+uLake*.29)*joining-(1.-focused)*(1.-uWide)*close*.48;
    size *= .13 + .87 * pow(life, .69);
    vec2 outToWater=aShore.xy;
    vec2 along=vec2(-outToWater.y,outToWater.x);
    float shore=aShore.w;
    vec2 delta=outToWater*(position.y*size*mix(.84,.64,shore)+shore*life*size*.17);
    delta+=along*position.x*size*mix(1.,1.28,shore);
    vec3 point = aLanding.xyz + vec3(delta.x, .026, delta.y);
    vLife = life;
    vShore = vec2(aShore.z/max(.01,size),shore);
    vDensity = aVariation.z;
    vStrength = aLanding.w * uOnset * rainFront() * step(0., time) * (1. - smoothstep(.25, .99, life))
      * (1.-(1.-focused)*(1.-uWide)*close*.24);
    place(point);
  }
`;

const impactFragment = /* glsl */ `
  varying vec2 vBrush;
  varying vec2 vShore;
  varying float vLife, vStrength, vSeed, vDensity, vAccent, vBridge;
  float stroke(float radius, float center, float width) {
    float edge = abs(radius - center);
    return 1. - smoothstep(width * .31, width + min(.058, fwidth(radius) * .81), edge);
  }
  void main() {
    float angle = atan(vBrush.y, vBrush.x);
    float salt = vSeed * 31.;
    float radial = length(vBrush);
    float radius = radial + sin(5. * angle + salt) * .035 + sin(9. * angle - salt) * .020;
    float dry = .52 + .48 * sin(3. * angle + salt + sin(6. * angle - salt) * .75);
    float broken = mix(.03, 1., smoothstep(.22, .76, dry));
    float shoreCut=mix(1.,smoothstep(-vShore.x-.14,-vShore.x+.11,vBrush.y),vShore.y);
    float pooled=mix(.84+.16*sin(angle+salt),.52+.48*smoothstep(-.15,.71,vBrush.y),vShore.y);
    float soft = stroke(radius, .76, .19) * broken * (.26+.20*vAccent);
    float rim = stroke(radius, .82, .071) * broken * .99;
    float returnRim = mix(.56,.65,smoothstep(.28,.85,vLife)) + .045*vSeed;
    float echo = stroke(radius, returnRim, .033+.011*vAccent) * (1. - .73 * broken)
      * smoothstep(.14, .41, vLife) * mix(smoothstep(.30,.77,vSeed), .98, vAccent) * .62;
    float dip=(1.-smoothstep(.12,.63,radial))*vBridge*(1.-smoothstep(.07,.56,vLife));
    float soaked = (1.-smoothstep(.16,.71,radial)) * (.52+.48*dry) * vAccent
      * smoothstep(.07,.22,vLife) * (1.-smoothstep(.30,.79,vLife));
    float arrival=stroke(radius,mix(.41,.82,smoothstep(.09,.51,vLife)),.095)*vBridge;
    float water = max(max(dip*.56+arrival*.40,soaked*.18),max(soft, max(rim, echo))) * shoreCut * pooled;
    float touch = (1. - smoothstep(.035, .17, radial)) * (1. - smoothstep(.08, .28, vLife));
    float alpha = vStrength * max(water, touch * .95);
    if (alpha < .014) discard;
    float value=clamp(.50+(vSeed-.5)*.24+.16*dry-.25*vDensity-touch*.16-.12*vAccent-.15*vBridge,.075,.85);
    gl_FragColor = vec4(value, .09 + echo * .36, .54, alpha);
  }
`;

export class EpilogueRain {
  constructor(scene) {
    const quad = new PlaneGeometry(2, 2);
    this.geometry = new InstancedBufferGeometry().copy(quad);
    quad.dispose();
    const makeAttribute = () => new InstancedBufferAttribute(new Float32Array(STATIONS * 4), 4).setUsage(DynamicDrawUsage);
    this.landing = makeAttribute();
    this.variation = makeAttribute();
    this.shore = makeAttribute();
    this.firstDrop = new InstancedBufferAttribute(new Float32Array(STATIONS * 2), 2).setUsage(DynamicDrawUsage);
    this.bridge = makeAttribute();
    this.geometry.setAttribute('aLanding', this.landing);
    this.geometry.setAttribute('aVariation', this.variation);
    this.geometry.setAttribute('aShore', this.shore);
    this.geometry.setAttribute('aFirstDrop', this.firstDrop);
    this.geometry.setAttribute('aBridge', this.bridge);
    this.uniforms = {
      uAge: { value: 0 }, uWide: { value: 0 }, uOnset: { value: 0 }, uPortrait: { value: 0 }, uLake: { value: 0 },
      uDragon: { value: new Vector3(0, -100, 0) },
    };
    const paint = (name, order, vertexShader, fragmentShader) => {
      const material = new ShaderMaterial({
        uniforms: this.uniforms, vertexShader, fragmentShader, side: DoubleSide,
        transparent: true, depthWrite: false, forceSinglePass: true,
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.name = name;
      mesh.visible = false;
      mesh.userData.inkIdSuppressed = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      scene.add(mesh);
      return mesh;
    };
    this.rings = paint('雨落水面 · 晕墨', 4, impactVertex, impactFragment);
    this.streaks = paint('山雨 · 笔丝', 5, rainVertex, rainFragment);
    this.surface = new Plane(new Vector3(0, 1, 0));
    this.entryPlane = new Plane(new Vector3(0, 1, 0));
    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.sample = new Vector3();
    this.entry = new Vector3();
    this.leafPoint = new Vector3();
    this.leafDrop = new Vector3();
    this.leafScreen = new Vector3();
  }

  hide() {
    this.stage = null;
    this.marshLeaf = null;
    this.rings.visible = this.streaks.visible = false;
  }

  update(stage, age, camera, environment, waterY, dragon = null, handoff = null) {
    if (stage !== this.stage || camera.aspect !== this.aspect) {
      this.placeStations(stage, camera, environment, waterY, handoff);
      this.stage = stage;
      this.aspect = camera.aspect;
    }
    if (stage === 3 && age >= 1.77 && this.departureStation !== null) {
      const added = this.placeBridge(stage, camera, waterY, (x, z) => {
        const river = environment.mountainRiver(z);
        return Math.abs(x - river.x) < river.halfWidth * .97
          && environment.heightAt(x, z) < waterY + .025;
      }, this.departureStation, true);
      this.geometry.instanceCount += added;
      this.departureStation = null;
      this.updateStations();
    }
    this.uniforms.uAge.value = age;
    this.uniforms.uWide.value = Number(stage === 3);
    this.uniforms.uLake.value = Number(stage === 1);
    this.uniforms.uPortrait.value = Number(camera.aspect < 1);
    this.uniforms.uOnset.value = stage === 3
      ? MathUtils.lerp(.76, 1, MathUtils.smoothstep(age, 0, .74))
      : MathUtils.lerp(.71, .94, MathUtils.smoothstep(age, 0, .60));
    if (dragon) this.uniforms.uDragon.value.set(dragon.x, dragon.y, dragon.z);
    else this.uniforms.uDragon.value.set(0, -100, 0);
    if (this.marshLeaf && age >= LEAF_HIT) {
      const elapsed = age - LEAF_HIT;
      const press = Math.sin(Math.min(Math.PI, elapsed * 8.4));
      const rebound = Math.sin(elapsed * 13.8) * Math.exp(-elapsed * 4.1);
      this.marshLeaf.rotation.z += .33 * press + .14 * rebound;
    }
    this.rings.visible = this.streaks.visible = true;
  }

  placeStations(stage, camera, environment, waterY, handoff) {
    const wide = stage === 3;
    const portrait = camera.aspect < 1;
    const rng = random(14218 + stage * 2141);
    this.surface.constant = -waterY;
    const isWet = (x, z) => {
      const river = wide ? environment.mountainRiver(z) : null;
      if (stage === 1) {
        const sluice = ENDING_ROUTE_SITES.lake;
        const pierX = Math.abs(x - sluice.x) - 2.40;
        if ((pierX / .65) ** 2 + ((z - sluice.z - .14) / .53) ** 2 < 1) return false;
      }
      return environment.heightAt(x, z) < waterY + .025
        && (!river || Math.abs(x - river.x) < river.halfWidth * .97);
    };
    const fixed = stage === 3 ? [[12.1,35.5,1.82,12.1],[15.6,32.0,2.14,10.5]]
      : stage === 1 ? [[-9.15,15.0,.30,5.4],[-8.35,15.89,.57,4.6],[-7.1,16.7,.82,4.4],
        [-10.0,16.3,1.36,4.1],[-8.27,14.70,1.72,5.0],[-7.18,15.0,2.03,4.9]]
      : [[5.68,-4.35,.40,3.7],[6.15,-3.94,.67,3.45],[5.86,-3.02,.88,2.4],
        [5.21,-3.71,1.13,3.2],[6.59,-4.63,1.43,3.8],[5.58,-3.12,1.61,2.7]];
    this.bridge.array.fill(0);
    this.marshLeaf = null;
    let count = stage === 0 ? this.placeLotus(camera,environment,waterY,isWet)
      : this.placeBridge(stage,camera,waterY,isWet,0,false,handoff);
    for (const [x, z, time, plunge] of fixed) {
      if (!isWet(x, z)) continue;
      this.landing.setXYZW(count, x, waterY, z, wide ? .93 : .97);
      this.variation.setXYZW(count, 0, 1.3, .82 + rng() * .16, rng());
      this.firstDrop.setXY(count, time, plunge);
      this.shore.setXYZW(count, 0, 1, 0, 0);
      count++;
    }
    const stationLimit = (portrait ? 119 : STATIONS) - (wide ? BRIDGE_STREAKS : 0);
    const nearShoreLimit = wide ? 0 : 14;
    const surfaceLimit = portrait ? (wide ? 31 : 41) : (wide ? 38 : 47);
    let shoreCount = 0;
    for (let attempt = 0; attempt < STATIONS * 5 && count < stationLimit; attempt++) {
      const seekingShore = shoreCount < nearShoreLimit && attempt < 185;
      const surfaceBiased = count < surfaceLimit;
      const xScreen = (rng() * 2 - 1) * (surfaceBiased ? 1.16 : 1.42);
      const yScreen = surfaceBiased ? MathUtils.lerp(portrait ? -.92 : -1.17, wide ? .27 : .26, rng())
        : MathUtils.lerp(-1.02, .77, rng());
      this.raycaster.setFromCamera(this.ndc.set(xScreen, yScreen), camera);
      const { ray } = this.raycaster;
      const hit = ray.intersectPlane(this.surface, this.sample);
      const far = wide ? 117 : 43;
      if (!hit || hit.distanceTo(ray.origin) > far) {
        if (surfaceBiased || seekingShore) continue;
        ray.at(far * MathUtils.lerp(.69, 1, rng()), this.sample);
      }
      const { x, z } = this.sample;
      const ground = environment.heightAt(x, z);
      const wet = isWet(x, z);
      if (surfaceBiased && !wet) continue;
      let shoreX = 0, shoreZ = 0, shoreDistance = 0, nearby = 0;
      if (!wide && wet && (surfaceBiased || seekingShore)) {
        for (let sample = 0; sample < 8; sample++) {
          const angle = sample * Math.PI / 4;
          const dx = Math.cos(angle), dz = Math.sin(angle);
          if (isWet(x + dx * 1.17, z + dz * 1.17)) continue;
          shoreX -= dx;
          shoreZ -= dz;
          nearby++;
          if (isWet(x + dx * .55, z + dz * .55)) shoreDistance += .83;
          else shoreDistance += .31;
        }
      }
      if (seekingShore && nearby === 0) continue;
      const shoreLength = Math.hypot(shoreX, shoreZ);
      const meetsShore = nearby > 0 && shoreLength > .01;
      const seed = rng();
      const period = MathUtils.lerp(.98, 1.63, rng());
      const intensity = wet ? (surfaceBiased ? MathUtils.lerp(.56, .92, rng()) : .24) : 0;
      this.landing.setXYZW(count, x, Math.max(ground, waterY), z, intensity);
      this.variation.setXYZW(count, rng() * period, period, rng(), seed);
      this.firstDrop.setXY(count, 0, 0);
      this.shore.setXYZW(count, meetsShore ? shoreX / shoreLength : 0,
        meetsShore ? shoreZ / shoreLength : 1, meetsShore ? shoreDistance / nearby : 0, Number(meetsShore));
      if (meetsShore) shoreCount++;
      count++;
    }
    this.departureStation = wide ? count : null;
    this.geometry.instanceCount = count;
    this.updateStations();
  }

  updateStations() {
    this.landing.needsUpdate = this.variation.needsUpdate = this.shore.needsUpdate = this.firstDrop.needsUpdate = this.bridge.needsUpdate = true;
  }

  placeLotus(camera,environment,waterY,isWet) {
    const marsh=environment.cache.get(0);
    marsh?.updateWorldMatrix(true,true);
    let best=Infinity;
    marsh?.traverse(leaf=>{
      if(!leaf.userData.lotusRadius)return;
      leaf.getWorldPosition(this.sample);
      this.leafScreen.copy(this.sample).project(camera);
      const {x,y,z}=this.leafScreen;
      if(Math.abs(x)>.79||Math.abs(y)>.77||z<0||z>1) return;
      const score=(x+.29)**2+(y+.04)**2;
      if(score>=best)return;
      best=score;
      this.marshLeaf=leaf;
      this.leafPoint.copy(this.sample);
    });
    const leaf=this.marshLeaf;
    if(!leaf)return 0;
    const point=this.leafPoint;
    const radius=leaf.userData.lotusRadius;
    const hit=leaf.localToWorld(this.leafScreen.set(-radius*.64,.06,-radius*.12));
    const edge=leaf.localToWorld(this.leafDrop.set(-radius*.87,.10,-radius*.20));
    const hasWater=isWet(edge.x-.30,edge.z-.12);
    this.landing.setXYZW(0,hit.x,hit.y,hit.z,0);
    this.variation.setXYZW(0,0,1.3,.95,.18);
    this.firstDrop.setXY(0,LEAF_HIT,3.6);
    this.shore.setXYZW(0,0,1,0,0);
    this.bridge.setXYZW(0,hit.x+.49,point.y+3.64,hit.z-.14,.63);
    if(!hasWater)return 1;
    this.landing.setXYZW(1,edge.x-.30,waterY,edge.z-.12,1);
    this.variation.setXYZW(1,0,1.3,.90,.32);
    this.firstDrop.setXY(1,LEAF_RUNOFF,Math.max(.1,edge.y-waterY));
    this.shore.setXYZW(1,0,1,0,0);
    this.bridge.setXYZW(1,edge.x,edge.y+.032,edge.z,.24);
    return 2;
  }

  placeBridge(stage, camera, waterY, isWet, first = 0, departure = false, handoff = null) {
    // The large strokes enter at the same place in both shots. Cast the
    // destination into actual water, where the brushstroke becomes a ring.
    const wide = stage === 3;
    const height = departure ? 9.7 : wide ? 8.7 : 3.92;
    const destinations = wide
      ? [[-.28,-.65],[-.22,-.70],[-.28,-.73],[-.15,-.67],[-.34,-.71],[-.20,-.58]]
      : [[-.36,-.29],[-.40,-.35],[-.33,-.39],[-.44,-.43],[-.28,-.45],[-.29,-.59]];
    const bridgeFromCourt=wide&&!departure&&handoff&&Math.abs(handoff.drip.x)<.88
      &&Math.abs(handoff.drip.y)<.91;
    if(bridgeFromCourt){
      const x=MathUtils.clamp(handoff.drip.x,-.60,.62);
      destinations.unshift([x,-.52],[x-.15,-.65],[x+.14,-.64],[x,-.72]);
    }
    for (const [x,y] of destinations) {
      this.raycaster.setFromCamera(this.ndc.set(x,y),camera);
      const contact=this.raycaster.ray.intersectPlane(this.surface,this.sample);
      if (!contact || !isWet(contact.x,contact.z)) continue;
      const {x:waterX,z:waterZ}=contact;
      const sourceX=bridgeFromCourt?MathUtils.clamp(handoff.lip.x*.70+x*.30,-.68,.68):wide?-.04:x+.13;
      const sourceY=bridgeFromCourt?MathUtils.clamp(Math.max(y+.23,handoff.lip.y),-.30,.68):wide?-.32:y+.53;
      this.raycaster.setFromCamera(this.ndc.set(departure?.11:sourceX,departure?-.20:sourceY),camera);
      const ray=this.raycaster.ray;
      if (wide) {
        this.entryPlane.constant=-(waterY+height);
        if(!ray.intersectPlane(this.entryPlane,this.entry))continue;
      }else{
        // A nearby lake shot lies below the start of the brush. Use the
        // positive source ray at the wet hit depth, even if the camera
        // itself looks slightly down across the water.
        const depth=this.sample.distanceTo(ray.origin)*.93;
        ray.at(depth,this.entry);
      }
      const source=this.entry;
      const fragments = departure ? [[0,0,0,2.55,.96],[-.43,.14,.45,2.68,.53],[.36,-.49,.60,2.74,.39]]
        : wide ? [[0,0,0,.84,.97],[-.38,.21,.49,.91,.45],[.42,-.55,.82,.99,.39]]
        : [[0,0,0,.34,1],[-.25,.12,.34,.47,.61],[.27,-.32,.54,.61,.43]];
      for (const [index, [dx,dz,dy,time,strength]] of fragments.entries()) {
        const i = first + index;
        const wet=isWet(waterX+dx,waterZ+dz);
        this.landing.setXYZW(i,waterX+(wet?dx:0),waterY,waterZ+(wet?dz:0),strength);
        this.variation.setXYZW(i,0,1.3,index===0?.93:.46,.22+index*.26);
        this.firstDrop.setXY(i,time,(wide?height:Math.max(.55,source.y-waterY))+dy);
        this.shore.setXYZW(i,0,1,0,0);
        this.bridge.setXYZW(i,source.x+dx*1.2,source.y+dy,source.z+dz,departure ? .70 : wide ? time+.13 : .40);
      }
      return fragments.length;
    }
    return 0;
  }
}
