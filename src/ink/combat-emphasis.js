import * as THREE from 'three';

const {clamp, lerp, smoothstep} = THREE.MathUtils;
const palette = {
  'stone-quarry': ['#ab907d', .91],
  'stone-march': ['#a98d75', .97],
  'stone-contour': ['#a38a74', .98],
  'abyss-transfer': ['#6f9080', .99],
  'abyss-undertow': ['#83958a', .96],
  'abyss-steamwake': ['#d1a17b', .98],
  'frost-thunder-fork': ['#748e9d', 1],
  'frost-temper-rush': ['#b39d87', 1.02],
  'thaw-thunder-release': ['#87aad0', 1.10],
  'conductive-front': ['#8995ac', .78],
  'beam-quench': ['#819c9d', 1.05],
  'beam-intercept': ['#a08671', .91],
  icekeel: ['#8f91a7', .66],
  'kite-downpour': ['#7a9ca3', .9],
  'rift-seam': ['#8c7e96', 1.06],
  'rift-wind-seam': ['#777a85', 1.04],
};
const tracks = 4;
const cutSlots = 2;

const paperFocus = /* glsl */ `
  uniform vec4 uCombatFocus[${tracks}], uCombatPigment[${tracks}];
  uniform vec4 uCombatRoll;
  uniform float uCombatRollDepth;
  uniform vec4 uCombatReach[${tracks}];
  uniform float uCombatMotion;

  vec3 combatPaper(vec3 color, vec3 paper, vec2 uv, float sceneDepth) {
    if (uCombatFocus[0].w <= .001) return color;
    float quiet = 0., carrier = 0., contact = 0., warmth = 0.;
    vec3 pigment = vec3(0.);
    for (int i = 0; i < ${tracks}; i++) {
      vec4 focus = uCombatFocus[i];
      if (focus.w <= .001) break;
      vec4 reach = uCombatReach[i];
      vec2 axis = focus.xy - reach.xy;
      vec2 offset = uv - reach.xy;
      axis.x *= uResolution.x / uResolution.y;
      offset.x *= uResolution.x / uResolution.y;
      float along = clamp(dot(offset, axis) / max(dot(axis, axis), .0001), 0., 1.);
      float dist = length(offset - axis * along);
      float endDist = length(offset - axis);
      float feather = max(0., sceneDepth - reach.z);
      vec4 tone = uCombatPigment[i];
      float past = smoothstep(-.65, 2.4, sceneDepth - mix(reach.w, reach.z, along));
      float flow = (1. - smoothstep(focus.z * .45, focus.z * 1.48, dist)) * past;
      float press = (1. - smoothstep(focus.z * .27, focus.z, endDist)) * past;
      carrier = max(carrier, focus.w * flow * (1. - smoothstep(10., 86., feather) * .42));
      contact = max(contact, focus.w * press * tone.w);
      warmth = max(warmth, focus.w * press * max(0., (tone.r - tone.b) * .85));
      float surround = focus.w * (.27 + .73 * (1. - smoothstep(.26, .76, dist)));
      if (surround > quiet) {
        quiet = surround;
        pigment = tone.rgb;
      }
    }
    // Keep vermilion threats readable. Existing dark ink holds the form of
    // the dragon, while paper and fine background washes take the pigment.
    float danger = smoothstep(.025, .10, color.r - max(color.g, color.b));
    float load = dot(max(vec3(0.), paper - color), vec3(.299,.587,.114));
    float diffuse = (1. - smoothstep(.42,.71,load)) * (1. - danger * .96);
    float leave = max(carrier*.91, contact);
    vec3 graded = mix(color, mix(color * pigment, pigment, .28),
      quiet * (.53 - .48 * leave) * diffuse * uCombatMotion);
    vec3 reserved = mix(graded, paper, carrier * (.23 + .29 * contact) * diffuse);
    reserved = mix(reserved, mix(paper,vec3(.98,.79,.56),.19),warmth * diffuse * uCombatMotion * .64);
    if (uCombatRoll.w > .001) {
      vec2 position=(uv-uCombatRoll.xy)*vec2(uResolution.x/uResolution.y,1.);
      float rim=(1.-smoothstep(.52,1.17,length(position)/uCombatRoll.z))
        *smoothstep(-.65,3.2,sceneDepth-uCombatRollDepth);
      vec3 cool=vec3(.60,.70,.71);
      reserved=mix(reserved,reserved*cool,rim*uCombatRoll.w*diffuse);
    }
    return max(vec3(0.), mix(reserved, color * .77, contact * (1. - diffuse) * (1. - danger) * .36));
  }
`;

const impactRoute = {
  'stone-quarry':'stone-quarry', 'stone-march':'stone-march', 'stone-contour':'stone-contour',
  'abyss-transfer':'abyss-transfer',
  'abyss-undertow':'abyss-undertow', 'abyss-steamwake':'abyss-steamwake',
  'frost-thunder-fork':'frost-thunder-fork', 'beam-conduit':'conductive-front', 'rift-seam':'rift-seam',
  'beam-quench':'beam-quench', 'rift-wind-seam':'rift-wind-seam', 'frost-temper-rush':'frost-temper-rush',
};

const tornPaper = /* glsl */ `
  uniform vec4 uCutEnds[${cutSlots}], uCutShape[${cutSlots}];
  uniform float uCutClock;

  vec2 tearPaper(vec2 uv) {
    if (uCutShape[0].w <= .001) return uv;
    float depth = linearDepth(uv);
    vec2 aspect = vec2(uResolution.x/uResolution.y,1.);
    for (int i = 0; i < ${cutSlots}; i++) {
      vec4 ends=uCutEnds[i], shape=uCutShape[i];
      if (shape.w <= .001) break;
      vec2 axis=(ends.zw-ends.xy)*aspect;
      float span=length(axis);
      if (span<.009) continue;
      vec2 tangent=axis/span, across=vec2(-tangent.y,tangent.x);
      vec2 p=(uv-ends.xy)*aspect;
      float t=dot(p,tangent)/span;
      if (t <= 0. || t >= 1.) continue;
      float source=mix(shape.x,shape.y,t);
      if(depth<source+.25)continue;
      float taper=sin(t*3.14159265);
      float ridge=(sin(t*19.+uCutClock*1.5)*.26+sin(t*47.)*.12)*shape.z;
      float side=dot(p,across)-ridge*taper;
      float curl=(1.-smoothstep(.05,1.,abs(side)/shape.z))*taper;
      vec2 shift=across*(sign(side)*.63)+tangent*(.17*sin(t*13.+uCutClock*4.));
      vec2 bent=clamp(uv+shift/aspect*curl*shape.w*.032,vec2(.001),vec2(.999));
      if(linearDepth(bent)>source+.2)return bent;
    }
    return uv;
  }
`;

function worldPoint(p) {
  return p && Number.isFinite(p.x + p.y + p.z);
}

function measurePath(points) {
  if (!(points?.length > 1)) return null;
  let length = 0;
  return points.map((point,i) => {
    const last=points[i-1];
    if (Number.isFinite(point.along)) length=point.along;
    else if (last) length+=Math.hypot(point.x-last.x,point.y-last.y,point.z-last.z);
    return {...point,length};
  });
}

/** An active handoff gives the receiving group the strongest scene contrast. */
export class CombatEmphasis {
  constructor(ink) {
    this.fronts = [];
    this.visible = [];
    this.riftView = null;
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.grade = {value:1};
    this.cutClock = {value:0};
    this.cutEnds = {value:Array.from({length:cutSlots}, () => new THREE.Vector4())};
    this.cutShape = {value:Array.from({length:cutSlots}, () => new THREE.Vector4())};
    this.focus = {value:Array.from({length:tracks}, () => new THREE.Vector4())};
    this.reach = {value:Array.from({length:tracks}, () => new THREE.Vector4())};
    this.pigment = {value:Array.from({length:tracks}, () => new THREE.Vector4())};
    this.roll = {value:new THREE.Vector4()};
    this.rollDepth = {value:0};
    this.colors = Object.fromEntries(Object.entries(palette).map(([name,[color,gain]]) =>
      [name, {color:new THREE.Color(color),gain}]));
    const material = ink.postMaterial;
    Object.assign(material.uniforms, {uCombatFocus:this.focus, uCombatReach:this.reach,
      uCombatPigment:this.pigment, uCombatMotion:this.grade, uCombatRoll:this.roll, uCombatRollDepth:this.rollDepth,
      uCutEnds:this.cutEnds,
      uCutShape:this.cutShape, uCutClock:this.cutClock});
    material.fragmentShader = material.fragmentShader
      .replace('void main() {', `${paperFocus}\n${tornPaper}\nvoid main() {`)
      .replace('  vec4 c = texture2D(tColor,paintUV);',
        '  if(uRaw < .5 && uCompare < .5) paintUV = tearPaper(paintUV);\n  vec4 c = texture2D(tColor,paintUV);')
      .replace('  if(uRaw > .5)', '  if(uRaw < .5) color = combatPaper(color, paper, vUv, linearDepth(vUv));\n  if(uRaw > .5)');
    material.needsUpdate = true;
  }

  reset() {
    this.fronts.length = 0;
    this.visible.length = 0;
    this.riftView = null;
    this.roll.value.w=0;
    for (const focus of this.focus.value) focus.w = 0;
    for (const cut of this.cutShape.value) cut.w = 0;
  }

  event(event, at, stage) {
    const technique = event.kind === 'icekeel' ? 'icekeel' : event.secondary === 'kite-downpour' ? 'kite-downpour' : null;
    const closing = event.type === 'dragonArtReaction' && event.reaction === 'rift-seam-close';
    if(event.type==='dragonArtReaction'&&event.reaction==='thaw-thunder-cancel') {
      const front=this.fronts.find(item=>item.id===event.id&&item.route==='thaw-thunder-release');
      if(front)front.cancelledAt=at;
      return;
    }
    if (event.type === 'dragonArtReaction' && event.reaction === 'abyss-condense') {
      const front = this.fronts.find(item => item.id === event.id && item.route === 'abyss-steamwake');
      if (front && worldPoint(event.transition ?? event)) {
        front.transition = event.transition ?? event;
        front.condenseAt = Math.max(0,at - front.at);
        front.lift = event.steamRise ?? event.lift ?? front.lift;
        if (worldPoint(event.to)) front.to=event.to;
        if (event.points?.length) front.path=measurePath(event.points);
        if (event.receiverIds?.length) front.receivers=event.receiverIds;
      }
      return;
    }
    if ((event.type === 'dragonArtReaction' && !closing) || (technique && event.type === 'techniqueArtRelease')) {
      const route = technique ?? event.reaction;
      const from = technique === 'icekeel' ? event.via : event.from;
      if (!this.colors[route] || !worldPoint(from) || !worldPoint(event.to)) return;
      const {id, leg, sourceId, targetId, branch, depth, to, points, receiverIds, transition, condenseAt, lift, via, settle} = event;
      const sameLeg = this.fronts.find(front => front.id === id && front.route === route &&
        (leg !== undefined ? front.leg === leg : front.sourceId === sourceId && front.branch === branch && front.depth === depth));
      if (sameLeg && event.redirected) {
        sameLeg.targetId = targetId;
        sameLeg.redirect = {from:sameLeg.to, at, duration:Math.max(.065,event.duration ?? .095)};
        sameLeg.to = to;
        sameLeg.receivers = event.receivers?.map(receiver => receiver.id);
        return;
      }
      const windup = Number.isFinite(event.travel) ? event.windup ?? 0 : 0;
      const travel = Math.max(.06, event.travel ?? event.duration ?? .28);
      if (this.fronts.length === 8) this.fronts.pop();
      this.fronts.unshift({id, leg, route, sourceId, targetId, branch, depth, stage:event.stage ?? stage, at, from, to,
        path:measurePath(points), windup, travel, settle, transition, condenseAt, lift:event.steamRise ?? lift,
        fold:technique === 'kite-downpour' && worldPoint(via) ? {point:via, at:event.windup ?? .22} : null,
        radius:clamp(event.radius ?? 1.6,1.05,7.2),
        receivers:receiverIds ?? event.receivers?.map(receiver => receiver.id), contact:null});
      return;
    }
    const landing = event.type === 'techniqueArtBloom' && technique === 'kite-downpour';
    const techniqueHit = event.type === 'techniqueArtImpact' && (event.refraction || technique === 'kite-downpour');
    const chargedMist = event.type==='cascadeHit' && event.detail==='thaw-thunder-hit';
    const route = chargedMist ? 'thaw-thunder-release' : closing ? 'rift-seam' : landing || techniqueHit ? technique :
      event.type === 'dragonArtImpact' ? event.interception?'beam-intercept':impactRoute[event.impact] : null;
    const impact=chargedMist && worldPoint(event.to) ? event.to : event;
    const id=chargedMist ? event.artId : event.id;
    if (!route || !worldPoint(impact)) return;
    const front = this.fronts.find(item => item.id === id && item.route === route &&
      (event.leg !== undefined ? item.leg === event.leg : item.targetId === event.targetId ||
        item.receivers?.includes(event.targetId))) ?? this.fronts.find(item => item.route === route && item.id === id && !item.targetId);
    if (!front) return;
    if (closing) {
      front.closedAt = at;
      front.captured = (event.capturedIds ?? event.receiverIds)?.length ?? 0;
      if (!front.captured) return;
    }
    const prev = front.contact;
    if (prev && at - prev.at < .085 && Math.hypot(prev.x-impact.x,prev.y-impact.y,prev.z-impact.z) < 4.4) {
      const count = prev.count + 1;
      prev.x += (impact.x - prev.x) / count;
      prev.y += (impact.y - prev.y) / count;
      prev.z += (impact.z - prev.z) / count;
      prev.count = count;
      prev.killed += Number(Boolean(event.killed));
    } else {
      front.contact = {x:impact.x,y:impact.y,z:impact.z,at,count:1,killed:Number(Boolean(event.killed))};
    }
  }

  update(time, stage, active, player) {
    this.cutClock.value = time;
    this.visible.length = 0;
    this.riftView = null;
    if (!active) return null;
    this.fronts = this.fronts.filter(front => front.stage === stage &&
      time < (front.cancelledAt===undefined ? Math.max(front.at + front.windup + front.travel + (front.settle??0) + .47,
        (front.contact?.at ?? -Infinity) + .50) : front.cancelledAt+.15));
    for (const front of this.fronts) {
      const {id, at, from, to, path, fold, windup, travel, contact, route, redirect, transition, condenseAt, lift} = front;
      const age = time - at;
      const landing = time - (contact?.at ?? -Infinity);
      const migration = route === 'abyss-transfer';
      const reach = Math.max(windup + travel + (migration||route==='frost-temper-rush' ? front.settle ?? 0 : 0),
        redirect ? redirect.at + redirect.duration - at : 0);
      const gain = smoothstep(age,0,.14) * (1 - smoothstep(age,reach+.055,reach+.44)) *
        (1-smoothstep(time-(front.cancelledAt??Infinity),0,.15));
      const strike = 1 - smoothstep(landing,.07,contact?.killed ? .47 : .32);
      const advance = route === 'stone-march' || route === 'stone-contour' || route === 'thaw-thunder-release' || migration ? 0 : route === 'kite-downpour' ? .055 : .18;
      const progress = clamp((age - windup) / travel + advance, 0, 1);
      let a = from, b = to, fraction = progress;
      if (redirect) {
        a = redirect.from;
        fraction = clamp((time - redirect.at) / redirect.duration, 0, 1);
      } else if (fold) {
        if (age < fold.at) {
          b = fold.point;
          fraction = clamp(age / fold.at, 0, 1);
        } else {
          a = fold.point;
          fraction = clamp((age - fold.at) / Math.max(.06, travel - fold.at), 0, 1);
        }
      } else if (path) {
        const distance = progress * path.at(-1).length;
        const end = Math.max(1,path.findIndex(point=>point.length>=distance));
        a = path[end-1];
        b = path[end];
        fraction = clamp((distance-a.length)/Math.max(.001,b.length-a.length),0,1);
      }
      const head = contact && landing < .24 ? contact :
        {x:lerp(a.x,b.x,fraction),y:lerp(a.y,b.y,fraction),z:lerp(a.z,b.z,fraction)};
      const transfer = transition && (condenseAt ?? Infinity) <= age;
      const trail = transfer ? transition : from;
      const strength = Math.max(gain, strike * (contact?.killed ? 1 : .76)) * this.colors[route].gain;
      if (!this.riftView && route === 'rift-seam') {
        const closes = front.closedAt ?? at + windup + travel + (front.settle ?? .22);
        const weight = smoothstep(age,.04,.48) * (1-smoothstep(time,closes+(front.captured?.18:.04),closes+.52));
        if (weight > .004) this.riftView = {id, to, weight, head, progress};
      }
      const distance = Math.hypot(head.x-player.x, head.y-player.y, head.z-player.z);
      const ownSide = (head.x-player.x)*Math.sin(player.angle)+(head.z-player.z)*Math.cos(player.angle);
      const score = strength * (1 - .45*smoothstep(distance,24,43)) * (.64+.36*smoothstep(ownSide,-5,8)) + .21*strike;
      if (strength > .025) this.visible.push({...head, id, from, to, trail, lift, progress, strength, score, strike, route,
        radius:front.radius, receiver:strike, handoff:true, ensemble:true, gain:strength});
    }
    this.visible.sort((a,b) => b.score-a.score);
    return this.visible.find(front => front.route !== 'stone-march' && front.route !== 'abyss-transfer' &&
      front.route !== 'beam-intercept') ?? null;
  }

  compose(camera, reducedMotion, art) {
    this.grade.value = reducedMotion ? .56 : 1;
    const {center, start, end} = this;
    const height = camera.projectionMatrix.elements[5];
    this.roll.value.w=0;
    let count = 0;
    for (const focus of this.visible) {
      if (count === tracks) break;
      center.set(focus.x,focus.y+.32,focus.z);
      const depth = -end.copy(center).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth < camera.near) continue;
      end.copy(center).project(camera);
      if (Math.max(Math.abs(end.x),Math.abs(end.y)) > 1.25) continue;
      start.set(focus.trail.x,focus.trail.y+.24,focus.trail.z);
      const startDepth=-center.copy(start).applyMatrix4(camera.matrixWorldInverse).z;
      if (startDepth > camera.near) start.project(camera);
      else start.copy(end);
      const radius = clamp((focus.radius+2.4)*.5*height/(camera.isPerspectiveCamera?depth:1),.082,.215);
      if (focus.route==='beam-quench' && this.roll.value.w===0) {
        this.roll.value.set(end.x*.5+.5,end.y*.5+.5,radius*1.40,
          focus.strength* (.18+.25*focus.strike)*this.grade.value);
        this.rollDepth.value=depth;
      }
      this.focus.value[count].set(end.x*.5+.5,end.y*.5+.5,radius,focus.strength);
      this.reach.value[count].set(clamp(start.x*.5+.5,-.3,1.3),clamp(start.y*.5+.5,-.3,1.3),depth,
        startDepth > camera.near ? startDepth : depth);
      const {r,g,b} = this.colors[focus.route].color;
      this.pigment.value[count++].set(r,g,b,focus.strike);
    }
    for (let i=count; i<tracks; i++) this.focus.value[i].w = 0;
    this.composeTear(camera,reducedMotion,art);
  }

  composeTear(camera,reducedMotion,art) {
    const cuts=this.cutShape.value;
    for (const cut of cuts) cut.w=0;
    if (reducedMotion) return;
    const front = this.visible.find(focus => focus.route === 'rift-seam');
    if (front && front.progress > .04) {
      const dx=front.to.x-front.trail.x, dz=front.to.z-front.trail.z;
      const span=Math.hypot(dx,dz);
      if (span>.2) {
        const half=Math.min(2.9,span*.4);
        this.storeTear(camera,0,front,dx/span,dz/span,.32,half,.76,front.gain*(.50+front.strike*.48));
        return;
      }
    }
    if (art?.kind!=='rift'||art.age>1.76) return;
    const opening = smoothstep(art.age,.25,.52)*(1-smoothstep(art.age,1.48,1.76));
    if (opening < .004) return;
    const direction = art.direction;
    const portals = art.portals?.length ? art.portals : [art];
    const single=portals.length===1;
    const half = single ? clamp(art.radius*.30,4.6,8.7) : clamp(art.radius*.18,2.65,4.25);
    let index=0;
    for (const portal of portals) {
      const tilt=single?.44:(index===0?.55:-.55);
      const at={x:portal.x,y:portal.y+(single?1.1:.68),z:portal.z};
      if (this.storeTear(camera,index,at,direction.z,-direction.x,tilt,half,1.35,opening*.92)) index++;
      if (index===cutSlots) break;
    }
  }

  storeTear(camera,index,at,dx,dz,tilt,half,width,strength) {
    const {start,end}=this;
    start.set(at.x-dx*half,at.y-tilt*half,at.z-dz*half);
    end.set(at.x+dx*half,at.y+tilt*half,at.z+dz*half);
    const a=-this.center.copy(start).applyMatrix4(camera.matrixWorldInverse).z;
    const b=-this.center.copy(end).applyMatrix4(camera.matrixWorldInverse).z;
    if (Math.min(a,b)<=camera.near) return false;
    start.project(camera);
    end.project(camera);
    this.cutEnds.value[index].set(start.x*.5+.5,start.y*.5+.5,end.x*.5+.5,end.y*.5+.5);
    const span = camera.projectionMatrix.elements[5]*.5*width/(camera.isPerspectiveCamera?(a+b)*.5:1);
    this.cutShape.value[index].set(a,b,clamp(span,.018,.108),strength);
    return true;
  }
}
