import * as THREE from 'three';

const MAX_BODIES=22;
const MAX_MAJOR_BODIES=28;
const MIN_MAJOR_BODIES=12;
const MAX_HANDOFF_BODIES=5;
const MAX_THAW_BODIES=12;
const LIFE=.55;
const {clamp,smoothstep}=THREE.MathUtils;
const inscriptionKinds=new Set(['stone','frost']);
const intactHold=.24;
const releaseLife=.43;
const thawHold=.20;
const thawFade=.41;
const sporeHold=.18;
const sporeFade=.39;
const sporeWingHold=.12;
const sporeWingFade=.42;
const majorHold=.145;
const majorFade=.40;
export const deathImpression={
  hold:intactHold,
  routes:new Set(['frost-thunder-fork','stone-quarry','stone-march','stone-contour','abyss-transfer','abyss-undertow',
    'abyss-steamwake','beam-conduit','beam-quench','rift-seam','rift-clash','rift-crosscut','rift-recoil','rift-wind-seam',
    'frost-sheet-shatter','frost-temper-rush']),
};
const inks={stone:['#241911','#d39b5b','#f2e5c5'],frost:['#101e2d','#56a1ab','#f3f9ef'],
  abyss:['#101f16','#718550','#f1eee0'],steam:['#301c19','#d8a06e','#fff4df'],rain:['#192d38','#6d9a9f','#f0f5e9'],
  quenched:['#142d34','#527c80','#e9f3ee'],
  rift:['#251520','#a36385','#eee5dc'],beam:['#302016','#d39442','#f7efda'],
  thawThunder:['#101f32','#6e9fc6','#f3f9fb'],spore:['#20291b','#829064','#f0edcf']};
const handoffInk={wind:'rain',water:'frost',fire:'beam',poison:'abyss',thunder:'rift'};
const doctrineInk={'fan-crest':'rain','lane-crest':'frost','rise-bolt':'rift','fork-bolt':'rift',
  'cinder-path':'beam','crown-ring':'beam','host-knot':'abyss','basin-flow':'abyss','gyre-burst':'abyss','gale-run':'rain','gale-spore-hit':'spore'};
const vertexShader=/* glsl */ `
  uniform vec3 uAxis,uAcross;
  uniform vec3 uWorldBias;
  uniform vec2 uResolution;
  uniform float uSplit,uHalf,uHalo,uScale,uGrow,uSink,uLift,uOutline,uDrop,uBuckle;
  varying vec3 vBody,vShade;
  varying float vFault,vGrazing;
  vec3 turnBody(vec3 p, vec3 axis, float sway, float grip) {
    return p*grip+cross(axis,p)*sway+axis*dot(p,axis)*(1.-grip);
  }
  void main() {
    vBody=position;
    vec3 p=position*uGrow;
    vec4 world=modelMatrix*vec4(p,1.);
    vec3 normalWorld=mat3(modelMatrix)*normal;
    vec3 normalView=normalMatrix*normal;
    if(uBuckle>0.) {
      vec3 axis=vec3(uAcross.z,0.,-uAcross.x);
      vec3 offset=world.xyz-modelMatrix[3].xyz;
      // Wings pull in as the original body pitches across the poison stroke.
      offset-=axis*dot(offset,axis)*min(.34,uBuckle*.40);
      float sway=sin(uBuckle),grip=cos(uBuckle);
      world.xyz=modelMatrix[3].xyz+turnBody(offset,axis,sway,grip);
      normalWorld=turnBody(normalWorld,axis,sway,grip);
      normalView=mat3(viewMatrix)*normalWorld;
    }
    vFault=dot(position,uAxis)+.14*position.y+.045*sin(position.y*8. + position.z*3.4);
    world.xyz+=uAcross*(uHalf*uSplit*1.19+uSink*.74)*uScale;
    world.y+=(sin(uSplit*1.9)*.32+uHalf*uSplit*.43-uSplit*uSplit*.71-uSink*.48+uLift)*uScale;
    world.y-=uDrop*(.87+uHalf*.21)*uScale;
    world.xyz+=uWorldBias;
    vShade=normalize(normalWorld);
    vGrazing=1.-abs(normalize(normalView).z);
    gl_Position=projectionMatrix*viewMatrix*world;
    if(uHalo>.5) {
      vec2 viewNormal=normalView.xy;
      gl_Position.xy+=viewNormal/(length(viewNormal)+.001)*gl_Position.w*(uOutline/uResolution);
    }
  }
`;
const fragmentShader=/* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform vec3 uInk,uRim,uPaper;
  uniform float uHalo,uHalf,uAlpha,uCrack,uSink,uRimFlash;
  varying vec3 vBody,vShade;
  varying float vFault,vGrazing;
  float grain(vec2 p) { return fract(sin(dot(p,vec2(128.1,313.7)))*43678.43); }
  void main() {
    float depth=texture2D(tDepth,gl_FragCoord.xy/uResolution).r;
    if(gl_FragCoord.z>depth+.000022)discard;
    if(uHalf!=0. && vFault*uHalf<-.021)discard;
    float light=.28+.72*max(0.,dot(normalize(vShade),normalize(vec3(-.5,.63,.51))));
    float tooth=grain(floor(gl_FragCoord.xy));
    float brush=grain(floor(vec2(vBody.x*26.+vBody.z*13.,vBody.y*43.)));
    float seam=1.-smoothstep(.017,.063,abs(vFault));
    float vein=abs(sin(dot(vBody,vec3(9.4,17.,9.1))+.5*sin(vBody.z*22.)));
    float facet=(1.-smoothstep(.035,.20,vein))*(1.-smoothstep(.12,.36,abs(vFault)));
    vec3 pigment=mix(uInk,uRim,.012+light*light*(.09+.087*brush)+.034*tooth);
    pigment=mix(pigment,uPaper,max(seam*.99,facet*.65)*uCrack);
    pigment=mix(pigment,uRim,uRimFlash*.86*smoothstep(.35,1.,vGrazing));
    float alpha=uAlpha*(1.-uSink*.49*smoothstep(.27,.83,brush));
    if(uHalo>.5) {
      pigment=uPaper;
      alpha*=.80+.20*tooth;
    }
    if(alpha<.02)discard;
    gl_FragColor=vec4(pigment,alpha);
    #include <colorspace_fragment>
  }
`;

class DeathPlates {
  constructor() {
    this.root=new THREE.Group();
    this.root.name='Dragon arts · actual death figures';
    this.active=[];
    this.ids=new Set();
    this.inscriptions=new Map();
    this.handoffCounts=new Map();
    this.thawBeats=new Map();
    this.sporeBeats=new Map();
    this.groupPose=new THREE.Object3D();
    this.position=new THREE.Vector3();
    this.pivot=new THREE.Vector3();
    this.heading=new THREE.Vector3();
    this.view=new THREE.Vector3();
    this.cameraPoint=new THREE.Vector3();
    this.sourceMatrix=new THREE.Matrix4();
    this.rotation=new THREE.Quaternion();
    this.depth={value:null};
    this.resolution={value:new THREE.Vector2()};
  }

  reset() {
    for(const entry of this.active)this.remove(entry);
    this.active.length=0;
    this.ids.clear();
    this.inscriptions.clear();
    this.handoffCounts.clear();
    this.thawBeats.clear();
    this.sporeBeats.clear();
  }

  remove(entry) {
    this.root.remove(entry.object);
    for(const mesh of entry.object.children)mesh.material.dispose();
    if(entry.owned)entry.geometry.dispose();
    this.ids.delete(entry.id);
  }

  captureMajor(event,time,world) {
    if(!world?.fauna||!inscriptionKinds.has(event.kind)||event.burstKills<MIN_MAJOR_BODIES)return;
    const targets=new Map();
    for(const target of event.targets??[]) {
      if(target.killed===true&&Number.isFinite(target.id)&&Number.isFinite(target.x+target.y+target.z)) {
        targets.set(target.id,target);
      }
      if(targets.size===MAX_MAJOR_BODIES)break;
    }
    if(targets.size<MIN_MAJOR_BODIES)return;
    const beat={id:event.id,releaseAt:time+majorHold};
    const reduced=Boolean(world.reducedMotion?.matches);
    // Promote what is already drawn before assigning the remaining budget.
    for(const item of this.active) {
      if(item.castId!==event.id||!targets.has(item.id))continue;
      item.majorBeat=beat;
      item.priority=4;
      item.reduced=reduced;
    }
    for(const target of targets.values()) {
      if(this.ids.has(target.id))continue;
      this.capture({...target,type:event.type,id:event.id,kind:event.kind,targetId:target.id,
        targetRadius:target.radius,targetAngle:target.angle},time,world,beat);
    }
  }

  capture(event,time,world,majorBeat=null) {
    if(event.type==='dragonArtMajorClear'&&!majorBeat) {
      this.captureMajor(event,time,world);
      return;
    }
    if(event.type==='cascadeEnd') {
      this.handoffCounts.delete(event.id);
      this.thawBeats.delete(event.id);
      return;
    }
    if(event.type==='dragonArtBreak' && inscriptionKinds.has(event.kind) && event.targets?.length) {
      // A break names the actual casualties. Finish their intact silhouettes as one group.
      for(const [i,target] of event.targets.entries()) {
        this.inscriptions.set(target.id,time+.154+i*.009);
      }
      return;
    }
    const downpour=event.type==='techniqueArtImpact'&&event.secondary==='kite-downpour';
    const cascade=event.type==='cascadeHit';
    const thawThunder=cascade&&event.detail==='thaw-thunder-hit';
    const spore=cascade&&event.detail==='gale-spore-hit';
    const splitSpore=spore&&event.sporeSplit&&(event.leg===3||event.leg===4);
    const handoff=cascade&&event.handoff?.receiverIds?.includes(event.targetId);
    const shaped=cascade&&Object.hasOwn(doctrineInk,event.detail);
    const kind=thawThunder?'thawThunder':shaped?doctrineInk[event.detail]:handoff?handoffInk[event.kind]:downpour?'rain':event.impact==='beam-quench'?'quenched':
      event.impact==='abyss-steamwake'||event.impact==='frost-temper-rush'?'steam':event.kind;
    const relay=Boolean(majorBeat)||thawThunder||handoff||shaped||deathImpression.routes.has(event.impact);
    if(!(event.type==='dragonArtImpact'||downpour||handoff||shaped||thawThunder||majorBeat)||!event.killed||event.absorbed&&!relay||!inks[kind]||
      !world?.fauna||this.ids.has(event.targetId))return;
    if((thawThunder||splitSpore)&&(!Number.isFinite(event.targetId)||!Number.isFinite(event.x+event.y+event.z)))return;
    let inkBeat;
    if(thawThunder) {
      inkBeat=this.thawBeats.get(event.id);
      if(!inkBeat) {
        inkBeat={releaseAt:time+thawHold,count:0};
        this.thawBeats.set(event.id,inkBeat);
      }
      if(inkBeat.count>=MAX_THAW_BODIES)return;
    }
    let quotas;
    const distinct=event.detail==='fan-crest'||event.detail==='cinder-path'||event.detail==='crown-ring'||event.detail==='host-knot'||event.detail==='gale-run'||spore;
    const group=distinct ? event.leg : 0;
    if(handoff||shaped) {
      quotas=this.handoffCounts.get(event.id);
      if(!quotas) {
        quotas=new Map();
        this.handoffCounts.set(event.id,quotas);
      }
      if((quotas.get(group)??0)>=(spore?8:group?4:MAX_HANDOFF_BODIES))return;
    }
    const priority=majorBeat?4:thawThunder||splitSpore?3:event.boss||relay?2:downpour||this.inscriptions.has(event.targetId)?1:0;
    const important=priority>0;
    const source=world.enemyMeshes?.get(event.targetId)?.userData.creature;
    let geometry,owned=false;
    const target=this.position.set(event.x,event.y,event.z);
    const matrix=this.sourceMatrix;
    let targetRadius=event.targetRadius;
    if(source?.parent&&source.geometry?.attributes.position&&source.geometry.attributes.normal) {
      source.updateWorldMatrix(true,false);
      matrix.copy(source.matrixWorld);
      this.pivot.setFromMatrixPosition(matrix);
      const parent=this.heading.setFromMatrixPosition(source.parent.matrixWorld);
      this.pivot.sub(parent).add(target);
      matrix.setPosition(this.pivot);
      geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',source.geometry.attributes.position.clone());
      geometry.setAttribute('normal',source.geometry.attributes.normal.clone());
      geometry.setIndex(source.geometry.index);
      owned=true;
    } else {
      for(const batch of world.fauna.crowd?.batches?.values()??[]) {
        const index=batch.entries.findIndex(enemy=>enemy.id===event.targetId);
        if(index<0||index>=batch.mesh.count)continue;
        geometry=batch.mesh.geometry;
        targetRadius??=batch.entries[index].radius;
        batch.mesh.getMatrixAt(index,matrix);
        matrix.setPosition(this.pivot.set(target.x,target.y-.025,target.z));
        break;
      }
    }
    if(!geometry?.attributes.position||!geometry.attributes.normal||
        (majorBeat||thawThunder||splitSpore)&&matrix.elements.some(value=>!Number.isFinite(value))) {
      if(owned)geometry.dispose();
      return;
    }
    if(this.active.length>=(majorBeat?MAX_MAJOR_BODIES:MAX_BODIES)) {
      const index=majorBeat
        ? this.active.findIndex(entry=>entry.majorBeat!==majorBeat)
        : this.active.findIndex(entry=>!entry.majorBeat&&(time-entry.at>.40||entry.priority<priority&&
          !this.inscriptions.has(entry.id)&&time-entry.at>.09));
      if(index<0) {
        if(owned)geometry.dispose();
        return;
      }
      this.remove(this.active[index]);
      this.active.splice(index,1);
    }
    const radius=clamp(targetRadius??.7,.50,2.9);
    const dir=this.heading.set(event.x-(event.from?.x??event.x),0,event.z-(event.from?.z??event.z));
    if(dir.lengthSq()<.04)dir.set(Math.cos(event.targetAngle??0),0,-Math.sin(event.targetAngle??0));
    dir.normalize();
    this.rotation.setFromRotationMatrix(this.groupPose.matrix.extractRotation(matrix)).invert();
    const axis=dir.clone().applyQuaternion(this.rotation);
    const object=new THREE.Group();
    const [ink,rim,paper]=(splitSpore?['#121d12','#7c8a4f','#faf1ca']:inks[kind]).map(color=>new THREE.Color(color));
    let sporeBeat;
    if(splitSpore) {
      const key=`${event.id}:${event.leg}`;
      sporeBeat=this.sporeBeats.get(key);
      if(!sporeBeat) {
        sporeBeat={releaseAt:time+sporeWingHold};
        this.sporeBeats.set(key,sporeBeat);
      }
    }
    const uniforms={tDepth:this.depth,uResolution:this.resolution,uAxis:{value:axis},uAcross:{value:dir.clone()},
      uInk:{value:ink},uRim:{value:rim},uPaper:{value:paper},uScale:{value:radius},uAlpha:{value:1},uSplit:{value:0},
      uGrow:{value:1},uCrack:{value:0},uSink:{value:0},uLift:{value:0},uOutline:{value:important?5.6:4.4},
      uDrop:{value:0},uRimFlash:{value:0},uBuckle:{value:0},
      uWorldBias:{value:new THREE.Vector3()}};
    for(const [half,halo,order] of [[0,1,108],[0,0,109],[-1,0,110],[1,0,110]]) {
      const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,
        uniforms:{...uniforms,uHalf:{value:half},uHalo:{value:halo}},side:halo?THREE.BackSide:THREE.FrontSide,
        transparent:true,depthTest:false,depthWrite:false});
      const mesh=new THREE.Mesh(geometry,material);
      mesh.matrixAutoUpdate=false;
      mesh.matrix.copy(matrix);
      mesh.frustumCulled=false;
      mesh.renderOrder=order;
      object.add(mesh);
    }
    this.root.add(object);
    this.active.push({id:event.targetId,castId:event.id,kind,at:time,radius,geometry,owned,object,uniforms,priority,relay,inkBeat,sporeBeat,majorBeat,
      reduced:(majorBeat||thawThunder||spore)&&Boolean(world.reducedMotion?.matches),
      intake:event.absorbed&&event.from?.x!==undefined?{mouth:event.from,target:target.clone()}:null});
    this.ids.add(event.targetId);
    if(quotas)quotas.set(group,(quotas.get(group)??0)+1);
    if(inkBeat)inkBeat.count++;
  }

  update(time,camera,depth,resolution,contacts=[]) {
    this.depth.value=depth;
    this.resolution.value.copy(resolution);
    const cameraFacing=this.view.setFromMatrixColumn(camera.matrixWorld,2);
    for(const [id,release] of this.inscriptions) {
      if(time-release>.48)this.inscriptions.delete(id);
    }
    for(const [key,beat] of this.sporeBeats) {
      if(time>beat.releaseAt+sporeWingFade)this.sporeBeats.delete(key);
    }
    for(let i=this.active.length-1;i>=0;i--) {
      const item=this.active[i];
      const age=time-item.at;
      const {object,uniforms,radius,kind,priority,relay,intake,inkBeat,sporeBeat,majorBeat,reduced}=item;
      const spore=kind==='spore';
      const inscription=majorBeat||relay||inscriptionKinds.has(kind);
      const groupRelease=this.inscriptions.get(item.id);
      const exposed=contacts.some(group=>group.ids.has(item.id));
      const holdAt=majorBeat?.releaseAt??inkBeat?.releaseAt??sporeBeat?.releaseAt??(spore?item.at+sporeHold:
        inscription?Math.max(item.at+intactHold+(exposed?.065:0),groupRelease??-Infinity):item.at+.128);
      const releaseAge=time-holdAt;
      const finished=inscription?releaseAge>(majorBeat?majorFade:inkBeat?thawFade:sporeBeat?sporeWingFade:spore?sporeFade:releaseLife):age>=LIFE;
      if(finished) {
        this.remove(item);
        this.active.splice(i,1);
        continue;
      }
      const vapor=kind==='steam'||kind==='quenched', falling=kind==='rain';
      const cut=!intake&&kind!=='abyss'&&!spore&&!vapor&&!falling;
      const split=inscription?smoothstep(releaseAge,0,inkBeat?.13:kind==='frost'?.20:.26):smoothstep(age,.105,.39);
      const part=cut&&releaseAge>=0;
      const reveal=inscription?1-smoothstep(releaseAge,inkBeat?.13:.083,inkBeat?thawFade:releaseLife):1-smoothstep(age,cut?.28:.25,LIFE);
      const depthToBody=-this.cameraPoint.setFromMatrixPosition(object.children[1].matrix).applyMatrix4(camera.matrixWorldInverse).z;
      const pixels=radius*camera.projectionMatrix.elements[5]*resolution.y/Math.max(1,depthToBody);
      const focal=priority>0||groupRelease!==undefined;
      const screenScale=clamp((relay?26:focal?22:17)/Math.max(pixels,1),1,relay?1.61:focal?1.46:1.32);
      uniforms.uAlpha.value=reveal;
      uniforms.uSplit.value=part?split*(reduced?.45:1):0;
      uniforms.uGrow.value=screenScale*(cut?1+.04*(1-split):1-(intake?.77:.24)*split);
      uniforms.uOutline.value=focal?(exposed?6.8:5.8):4.4;
      uniforms.uCrack.value=inscription&&cut?(1-smoothstep(releaseAge,.16,.31))*smoothstep(releaseAge,-.055,-.008):
        cut?smoothstep(age,.075,.13)*(1-smoothstep(age,.30,.45)):0;
      if(inkBeat) {
        uniforms.uOutline.value=5+2*(1-smoothstep(age,0,.10));
        uniforms.uCrack.value=smoothstep(releaseAge,-.075,-.015)*(1-smoothstep(releaseAge,.09,.19));
        uniforms.uDrop.value=(reduced?.45:1.40)*smoothstep(releaseAge,.06,.37);
        uniforms.uRimFlash.value=((1-smoothstep(age,.045,.15))+.56*uniforms.uCrack.value)*(reduced?.63:1);
      }
      uniforms.uSink.value=cut||intake?0:split;
      uniforms.uLift.value=vapor ? smoothstep(relay?releaseAge:age,0,.25)*1.8 :
        falling ? -smoothstep(age,.09,.44)*.86 : 0;
      if(sporeBeat) {
        const snap=smoothstep(releaseAge,0,.075);
        const fall=smoothstep(releaseAge,.055,.32);
        const motion=reduced?.38:1;
        const rim=(1-smoothstep(age,.045,.112))+.58*snap*(1-smoothstep(releaseAge,.10,.18));
        uniforms.uBuckle.value=1.24*snap*motion;
        uniforms.uOutline.value=5.5*(1-.86*fall)+3.1*rim*(reduced?.64:1);
        uniforms.uRimFlash.value=rim*(reduced?.49:.8);
        uniforms.uGrow.value=Math.max(screenScale,1.12)*(1-.48*fall*motion);
        uniforms.uDrop.value=2.65*fall*motion;
        uniforms.uSink.value=.52*fall*motion;
        uniforms.uAlpha.value=1-smoothstep(releaseAge,.16,sporeWingFade);
      } else if(spore) {
        const fall=smoothstep(releaseAge,0,.26);
        const motion=item.reduced ? .34 : 1;
        uniforms.uOutline.value=5.6*(1-.75*fall);
        uniforms.uRimFlash.value=.48*(1-smoothstep(age,.06,.14));
        uniforms.uGrow.value=screenScale*(1-.47*fall*motion);
        uniforms.uDrop.value=1.6*fall*motion;
        uniforms.uSink.value=.65*fall*motion;
      }
      if(majorBeat) {
        const motion=reduced?.38:1;
        const crack=smoothstep(releaseAge,-.088,-.021)*(1-smoothstep(releaseAge,.067,.24));
        const fall=smoothstep(releaseAge,.047,.31);
        const snap=smoothstep(releaseAge,0,kind==='frost'?.115:.095);
        uniforms.uSplit.value=part?snap*motion:0;
        uniforms.uCrack.value=crack;
        uniforms.uRimFlash.value=crack*(reduced?.38:.74);
        uniforms.uOutline.value=4.8+2.8*crack-2.5*fall;
        uniforms.uGrow.value=Math.max(1.12,screenScale)*(1-.26*fall*motion);
        uniforms.uDrop.value=(kind==='frost'?1.42:1.90)*fall*motion;
        uniforms.uAlpha.value=1-smoothstep(releaseAge,.096,majorFade);
      }
      uniforms.uWorldBias.value.copy(cameraFacing).multiplyScalar(.060+radius*.077);
      if(intake) {
        this.heading.set(intake.mouth.x,intake.mouth.y,intake.mouth.z).sub(intake.target);
        this.heading.clampLength(0,radius*1.7).multiplyScalar(split*.85);
        uniforms.uWorldBias.value.add(this.heading);
      }
      object.children[0].visible=!part;
      object.children[1].visible=!part;
      object.children[2].visible=part;
      object.children[3].visible=part;
    }
  }
}

export function createDragonArtDeathPlates(){return new DeathPlates();}
