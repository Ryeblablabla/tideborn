import * as THREE from 'three';
import {sampleSpine} from '../motion.js';

const SEGMENTS=14;
const ROW=SEGMENTS+1;
const MAX_STROKES=12;
const HURT=0, RECOVER=1, READY=2, STRAIN=3;
const {clamp,lerp,smoothstep}=THREE.MathUtils;

const dryShoulder=/* glsl */ `
  uniform vec2 uBodyDanger;
  float bodyInkLoss(vec3 p){
    if(uBodyDanger.x<.003)return 0.;
    // Rest-space grain rides the shoulder as it bends. The rest of the
    // silhouette keeps the normal ink and the normal depth buffer.
    float neck=smoothstep(.045,.13,p.z)*(1.-smoothstep(.33,.43,p.z));
    if(neck<.001)return 0.;
    float blot=fbm(p*vec3(34.,38.,10.)+vec3(7.1,2.7,5.4));
    float fibers=fbm(p*vec3(172.,103.,17.)+vec3(3.1,8.1,2.9));
    float rim=p.z+.29*p.x-.21-uBodyDanger.y*.08+(blot-.5)*.13;
    float passing=1.-smoothstep(.022,.145,abs(rim));
    float broken=smoothstep(.27,.69,blot+fibers*.17);
    return uBodyDanger.x*neck*(.42+.58*passing)*(.38+.62*broken);
  }
`;

function installBodyInkLoss(material,uniform,point,replacement){
  if(!material?.fragmentShader.includes(point))return;
  material.uniforms.uBodyDanger=uniform;
  material.fragmentShader=material.fragmentShader
    .replace('void main()',`${dryShoulder}\nvoid main()`)
    .replace(point,replacement);
  material.needsUpdate=true;
}

const vertexShader=/* glsl */ `
  attribute vec4 aBrush;
  varying vec4 vBrush;
  varying vec3 vPoint;
  void main(){
    vBrush=aBrush;
    vPoint=position;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;
const fragmentShader=/* glsl */ `
  varying vec4 vBrush;
  varying vec3 vPoint;
  float hash(vec3 p){
    p=fract(p*vec3(.1031,.11369,.13787));
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  void main(){
    float s=abs(vBrush.x),u=vBrush.y,kind=vBrush.w;
    float grain=hash(floor(vPoint*72.));
    float edge=1.-smoothstep(.70,1.02,s+.21*(grain-.5));
    float dry=smoothstep(.46,.79,grain)*smoothstep(.25,.83,s)*(.55+.45*smoothstep(.22,.93,u));
    float injury=1.-step(.5,kind);
    float wake=step(1.5,kind)*(1.-step(2.5,kind));
    float strain=step(2.5,kind);
    float dense=(.84+.09*grain)*injury;
    float reserveCore=(1.-smoothstep(.17,.52,s))*wake;
    float pigment=mix(.42,.43,1.-injury)+dense*.57;
    pigment=mix(pigment,.80-.72*reserveCore,wake);
    float tear=injury*smoothstep(.31,.65,s)*(1.-smoothstep(.68,.94,s))*smoothstep(.35,.62,grain);
    float split=(1.-smoothstep(.030,.105,abs(u-.47+vBrush.x*.092+(grain-.5)*.05)))*strain;
    pigment=mix(pigment,.91-.78*split,strain);
    float reserve=dry*(.22+.46*(1.-injury))+.70*reserveCore+.26*tear+.71*split;
    float coverage=vBrush.z*edge*mix(.70,1.,grain)*(1.-dry*.35);
    if(coverage<.015)discard;
    gl_FragColor=vec4(1.-clamp(pigment,0.,.96),reserve,grain,coverage);
  }
`;

const makePoints=()=>Array.from({length:ROW},()=>new THREE.Vector3());

/** Small scene-space traces at real body cuts, regrowth, and the ready stroke. */
export class BodySignals {
  constructor(scene){
    const geometry=new THREE.BufferGeometry();
    const capacity=MAX_STROKES*ROW*2;
    this.position=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    this.normal=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    this.brush=new THREE.BufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage);
    const indices=new Uint16Array(MAX_STROKES*SEGMENTS*6);
    for(let j=0;j<MAX_STROKES;j++)for(let i=0;i<SEGMENTS;i++){
      const v=(j*ROW+i)*2;
      indices.set([v,v+1,v+2,v+1,v+3,v+2],(j*SEGMENTS+i)*6);
    }
    geometry.setAttribute('position',this.position);
    geometry.setAttribute('normal',this.normal);
    geometry.setAttribute('aBrush',this.brush);
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
    geometry.setDrawRange(0,0);
    geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);
    this.mesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
      vertexShader,fragmentShader,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,forceSinglePass:true,
    }));
    this.mesh.name='断躯与破浪笔迹';
    this.mesh.frustumCulled=false;
    this.mesh.renderOrder=5;
    this.mesh.userData.inkIdSuppressed=true;
    scene.add(this.mesh);
    this.readyPoints=makePoints();
    this.strainPoints=makePoints();
    this.stateSide=new THREE.Vector3();
    this.stateEye=new THREE.Vector3();
    this.stateTangent=new THREE.Vector3();
    this.projected=new THREE.Vector3();
    this.projectedHead=new THREE.Vector3();
    this.alignment=new THREE.Vector3();
    this.dangerSurfaces=new WeakMap();
    this.reset();
  }

  reset(){
    this.entries=[];
    this.queue=[];
    this.previous=null;
    this.lost=0;
    this.regrowth=0;
    this.lastRegrowth=-Infinity;
    this.ready=false;
    this.readyChangedAt=-Infinity;
    this.clearDanger();
    this.mesh.visible=false;
    this.mesh.geometry.setDrawRange(0,0);
  }

  clearDanger(){
    this.dangerUniform?.value.set(0,0);
    this.dangerUniform=null;
    this.dangerBridge=null;
    this.dangerSince=null;
    this.dangerLevel=0;
  }

  bindDanger(bridge){
    const cached=this.dangerSurfaces.get(bridge);
    if(cached)return cached;
    const uniform={value:new THREE.Vector2()};
    for(const {record} of bridge.entries){
      installBodyInkLoss(record.material,uniform,'float reflectance=exp(-pigment*3.1);',`
        float dryShoulder=bodyInkLoss(vPaint);
        pigment*=1.-.94*dryShoulder;
        paperReserve=max(paperReserve,.70*dryShoulder);
        float reflectance=exp(-pigment*3.1);`);
      installBodyInkLoss(record.brush?.material,uniform,'float deposit=brush.x*pigment*(1.0-vReserve);',`
        float dryShoulder=bodyInkLoss(massPosition);
        float deposit=brush.x*pigment*(1.0-vReserve)*(1.-.86*dryShoulder);`);
    }
    this.dangerSurfaces.set(bridge,uniform);
    return uniform;
  }

  updateDanger(frame,time,elapsed,bridge){
    if(bridge?.owner?.stage!==frame.stage)bridge=null;
    if(this.dangerBridge!==bridge){
      this.clearDanger();
      if(!bridge)return;
      this.dangerBridge=bridge;
      this.dangerUniform=this.bindDanger(bridge);
    }
    if(!this.dangerUniform)return;
    const {mass,peakMass,density}=frame.position;
    const relative=mass/Math.max(mass,peakMass,.001);
    // The displayed spine has a three-segment floor. Mass continues to
    // report the loss of viable body below that visible limit.
    const segments=mass/Math.max(density,.001);
    if(mass>0&&(relative<=.25||segments<=3.1))this.dangerSince??=time;
    else if(!(mass>0)||(relative>=.35&&segments>=3.8))this.dangerSince=null;
    const target=this.dangerSince===null?0:1;
    this.dangerLevel=lerp(this.dangerLevel,target,1-Math.exp(-Math.max(0,elapsed)*(target?10:6)));
    if(this.dangerLevel<.003){
      this.dangerUniform.value.set(0,0);
      return;
    }
    const phase=this.dangerSince===null?this.dangerUniform.value.y:
      .5+.5*Math.cos((time-this.dangerSince)*Math.PI*2/2.7);
    const strength=this.dangerLevel*(.55+.45*phase**3);
    this.dangerUniform.value.set(strength,phase);
  }

  event(event,time){
    if(event.type==='evolve'){
      this.reset();
      return;
    }
    if(event.type==='hurt'||event.type==='recover'){
      if(this.queue.length>=8)this.queue.shift();
      this.queue.push({event,time});
    }
  }

  add(kind,time,life,points,options){
    if(this.entries.length>=MAX_STROKES-2)this.entries.shift();
    this.entries.push({kind,time,life,points,...options});
  }

  // Physics trail samples preserve the position of the missing section,
  // even when a collision hit another part of the dragon.
  cutTrace(frame,points,start,end,spacing){
    const trail=frame.trail?.length?sampleSpine(frame.trail,end/spacing,spacing,frame.position):frame.spine;
    for(let i=0;i<ROW;i++){
      const index=lerp(start,end,i/SEGMENTS)/spacing;
      const a=trail[Math.min(trail.length-1,Math.floor(index))];
      const b=trail[Math.min(trail.length-1,Math.floor(index)+1)];
      const t=index-Math.floor(index);
      points[i].set(lerp(a.x,b.x,t),lerp(a.y,b.y,t),lerp(a.z,b.z,t));
    }
  }

  paintedTrace(frame,spine,points,start,end,spacing){
    if(spine?.stage!==frame.stage||spine.points.length<2||!(spine.scale>0)){
      this.cutTrace(frame,points,start,end,spacing);
      return;
    }
    for(let i=0;i<ROW;i++){
      spine.atDistance(lerp(start,end,i/SEGMENTS)/spine.scale,points[i]).multiplyScalar(spine.scale);
    }
  }

  inView(point,camera,nearHead=false){
    if(!camera)return true;
    const projected=this.projected.copy(point).project(camera);
    return projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<.91&&Math.abs(projected.y)<.88&&
      (!nearHead||Math.hypot(projected.x-this.projectedHead.x,projected.y-this.projectedHead.y)<.51);
  }

  cameraSide(points,camera,fallback){
    if(!camera)return fallback;
    const a=points[0],b=points[SEGMENTS>>1],eye=camera.position;
    const toward=(b.z-a.z)*(eye.x-a.x)-(b.x-a.x)*(eye.z-a.z);
    return Math.abs(toward)>.06?Math.sign(toward):fallback;
  }

  exposedFlank(points,camera,stage,fallback){
    if(!camera)return {side:fallback};
    // The close flight camera can hide a world-horizontal stroke behind the
    // mane. Place this one along the exposed side of the painted silhouette.
    const axis=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0)
      .multiplyScalar(this.projectedHead.x>0?-1:1);
    const lift=camera.position.clone().sub(points[SEGMENTS>>1]).normalize()
      .multiplyScalar(stage>=3?.66:.27);
    return {side:1,axis,lift};
  }

  contactDistance(frame,contact,spacing){
    let best=Infinity,station=0;
    for(let i=0;i<frame.spine.length;i++){
      const point=frame.spine[i];
      const distance=Math.hypot(point.x-contact.x,point.y-contact.y,point.z-contact.z);
      if(distance<best){best=distance;station=i*spacing;}
    }
    return station;
  }

  hurt(frame,spine,event,time,spacing,camera){
    const missing=Math.max(0,event.lost||0);
    const cut=frame.length*spacing;
    const sign=Math.sin(time*19+event.x+event.z)>=0?1:-1;
    let cutVisible=false;
    if(missing>=.06){
      this.lost+=missing;
      const start=Math.max(0,cut-.16),end=cut+Math.min(missing*spacing,2.5);
      const points=makePoints();
      // Keep the departing ink on the actual old trail, aligning only the
      // first touch with the painted curve where the retained body retracts.
      this.cutTrace(frame,points,start,end,spacing);
      if(spine?.stage===frame.stage&&spine.scale>0){
        spine.atDistance(start/spine.scale,this.alignment).multiplyScalar(spine.scale);
        this.alignment.sub(points[0]).clampLength(0,.36);
        for(let i=0;i<ROW;i++)points[i].addScaledVector(this.alignment,1-smoothstep(i,0,SEGMENTS*.45));
      }
      cutVisible=this.inView(points[0],camera,true)&&this.inView(points[SEGMENTS>>1],camera);
      const wet=frame.chapter<2||(frame.chapter===2&&frame.position.y<1.8);
      const width=clamp(.22+missing*.033,.24,.44);
      this.add(HURT,time,.68,points,{wet,side:this.cameraSide(points,camera,sign),offset:.08,spread:.73,width,alpha:.93});
    }

    const contact=event.contact;
    const impact=contact?this.contactDistance(frame,contact,spacing):0;
    const direct=contact&&this.inView(contact,camera)&&impact<cut-.60;
    if(cutVisible&&!direct)return;
    // An off-screen tail can still shorten. The exposed flank carries one
    // short recoil stroke. Use the real contact if it is on the visible body.
    const start=direct?Math.max(.22,impact-.18):Math.min(.88,cut*.27);
    const span=clamp(.82+missing*.16,.82,1.67);
    const points=makePoints();
    this.paintedTrace(frame,spine,points,start,Math.min(start+span,cut),spacing);
    const flank=[.40,.53,.86,1.49][frame.stage]??1.49;
    const width=clamp(.22+missing*.026,.24,.41);
    this.add(HURT,time,.42,points,{wet:false,...this.exposedFlank(points,camera,frame.stage,sign),offset:flank,spread:.74,width,alpha:.98});
  }

  stateStroke(index,kind,points,camera,flank,width,load,spent=0){
    const start=index*ROW*2;
    const center=points[SEGMENTS>>1];
    const eye=this.stateEye.subVectors(camera.position,center).normalize();
    const tangent=this.stateTangent.subVectors(points.at(-1),points[0]).normalize();
    const across=this.stateSide.crossVectors(eye,tangent);
    if(across.lengthSq()<.02)across.setFromMatrixColumn(camera.matrixWorld,0);
    across.normalize();
    const strain=kind===STRAIN;
    const faceLift=strain?.38:.31;
    for(let i=0;i<ROW;i++){
      const u=i/SEGMENTS,point=points[i];
      const taper=Math.sin(Math.PI*u)**(strain?.68:.42);
      const half=width*taper*(strain?.82+.18*u:1-.57*u);
      const offset=strain?-flank*(.29+1.39*u):flank+.09*taper+spent*.31*u;
      const pressure=load*taper*(strain?.86+.14*Math.sin(u*6.5):1);
      for(let j=0;j<2;j++){
        const side=j*2-1,k=start+i*2+j,distance=offset+side*half;
        this.position.setXYZ(k,point.x+across.x*distance+eye.x*faceLift,
          point.y+across.y*distance+eye.y*faceLift,point.z+across.z*distance+eye.z*faceLift);
        this.normal.setXYZ(k,eye.x,eye.y,eye.z);
        this.brush.setXYZW(k,side,u,pressure,kind);
      }
    }
  }

  bodyStates(frame,spine,camera,index,time,spacing){
    const position=frame.position;
    const ready=position.dashCD<=0&&position.dash<=0;
    if(ready!==this.ready){
      this.ready=ready;
      this.readyChangedAt=time;
    }
    if(!camera)return index;
    const age=time-this.readyChangedAt;
    const visibleLength=spine?.stage===frame.stage?spine.motion.length:frame.length*spacing;
    const length=Math.min(visibleLength,frame.length*spacing);
    const flank=([.52,.66,.85,1.12][frame.stage]??1.12)+Math.min(length,5)*.032;
    const spent=position.dash>0?clamp(age/.18,0,1):1;
    if(ready||spent<1){
      const start=Math.min(.34,length*.19);
      const span=Math.min(length*.76,1.58)+(ready?0:spent*.38);
      this.paintedTrace(frame,spine,this.readyPoints,start,Math.min(length,start+span),spacing);
      const load=ready?.68+.29*Math.exp(-age*3.7):(1-spent)*.82;
      this.stateStroke(index++,READY,this.readyPoints,camera,flank,.25,load,ready?0:spent);
    }
    const danger=this.dangerUniform?.value.x??0;
    if(danger>.028){
      const start=Math.min(.49,length*.25);
      const span=Math.min(length*.37,.84);
      this.paintedTrace(frame,spine,this.strainPoints,start,Math.min(length,start+span),spacing);
      this.stateStroke(index++,STRAIN,this.strainPoints,camera,flank+.12,.33,.48*this.dangerLevel+.42*danger);
    }
    return index;
  }

  recover(frame,spine,time,amount,picked,spacing,camera){
    const span=clamp(.31+amount*spacing,.40,1.08);
    const side=Math.sin(time*12)>=0?1:-1;
    this.add(RECOVER,time,picked ? .66 : .53,makePoints(),{
      attached:true,wet:false,side,offset:.22,spread:.12,span,width:picked ? .135 : .107,
      alpha:picked ? .73 : .66,
    });
    if(picked&&camera){
      const points=makePoints();
      const end=spine?.stage===frame.stage?spine.motion.length:frame.length*spacing;
      this.paintedTrace(frame,spine,points,Math.max(0,end-span),end,spacing);
      if(!this.inView(points[SEGMENTS>>1],camera,true)){
        const start=Math.min(.96,end*.34);
        this.paintedTrace(frame,spine,points,start,Math.min(start+span,end),spacing);
        const flank=[.48,.59,.91,1.58][frame.stage]??1.58;
        this.add(RECOVER,time,.39,points,{wet:false,...this.exposedFlank(points,camera,frame.stage,side),offset:flank,spread:-.21,width:.17,alpha:.78});
      }
    }
    this.lastRegrowth=time;
  }

  writeStroke(index,entry,age){
    const start=index*ROW*2;
    const fade=(1-age)**1.50;
    const injury=entry.kind===HURT;
    const peel=injury?smoothstep(age,.04,.70):0;
    const progress=injury?lerp(.68,1,smoothstep(age,0,.28)):Math.min(1,.33+age*3.9);
    for(let i=0;i<ROW;i++){
      const u=i/SEGMENTS;
      const p=entry.points[i],a=entry.points[Math.max(0,i-1)],b=entry.points[Math.min(ROW-1,i+1)];
      const dx=b.x-a.x,dz=b.z-a.z;
      const length=Math.hypot(dx,dz)||1;
      const nx=dz/length,nz=-dx/length;
      const taper=Math.sin(Math.PI*u)**(injury?.45:.62);
      const half=entry.width*(.024+taper)*(1-.34*u);
      const spread=injury?(.14+.86*u)*(.20+.80*peel):age*(.63+.37*u);
      const anchor=injury&&entry.axis?entry.offset*lerp(.60,1,smoothstep(u,0,.64)):entry.offset;
      const offset=entry.side*(anchor+entry.spread*spread+.047*Math.sin(u*Math.PI));
      const wetHeight=Math.max(.07,p.y-.55);
      const y=injury?(entry.wet?lerp(p.y+.16,wetHeight,peel):p.y+.15+.19*peel*u):
        entry.wet?wetHeight+.019*Math.sin(u*7):p.y+(entry.kind===RECOVER ? .18 : .065);
      const reveal=1-smoothstep(u,Math.max(0,progress-.13),progress+.055);
      const separation=injury?smoothstep(u,peel*.24,peel*.24+.12):1;
      const pressure=entry.alpha*fade*taper*reveal*separation;
      for(let j=0;j<2;j++){
        const sign=j*2-1,k=start+i*2+j;
        const across=offset+sign*half;
        this.position.setXYZ(k,p.x+(entry.axis?.x??nx)*across+(entry.lift?.x??0),
          y+(entry.axis?.y??0)*across+(entry.lift?.y??0)+sign*half*(injury?.65:.16),
          p.z+(entry.axis?.z??nz)*across+(entry.lift?.z??0));
        this.normal.setXYZ(k,0,1,0);
        this.brush.setXYZW(k,sign,u,pressure,entry.kind);
      }
    }
  }

  update(frame,time,active,spine=null,camera=null,bridge=null){
    if(!active||(frame.spine?.length??0)<2){
      this.mesh.visible=false;
      this.clearDanger();
      return;
    }
    if(this.previous&&(this.previous.stage!==frame.stage||time<this.previous.time))this.reset();
    const spacing=.65*(1+frame.stage*.08);
    const elapsed=this.previous?time-this.previous.time:0;
    this.updateDanger(frame,time,elapsed,bridge);
    const position=frame.position;
    const gained=this.previous?Math.max(0,frame.length-this.previous.length):0;
    if(camera&&this.queue.length){
      camera.updateMatrixWorld();
      this.projectedHead.copy(position).project(camera);
    }
    let recovered=0;
    for(const {event,time:start} of this.queue){
      if(event.type==='hurt')this.hurt(frame,spine,event,start,spacing,camera);
      else if(event.type==='recover')recovered+=Math.max(0,event.mass||0)/(frame.density||1);
    }
    this.queue.length=0;
    if(gained>.0001&&this.lost>0){
      const healed=Math.min(gained,this.lost);
      const picked=Math.min(healed,recovered)>.004;
      this.lost-=healed;
      this.regrowth+=healed;
      // Slow healing leaves a few separate dry touches rather than a fixed
      // aura. A recovered fragment can give a more immediate tail response.
      if((picked||this.regrowth>=.11)&&time-this.lastRegrowth>(picked ? .24 : .72)){
        this.recover(frame,spine,time,this.regrowth,picked,spacing,camera);
        this.regrowth=0;
      }
    }
    this.previous={stage:frame.stage,time,length:frame.length};
    let count=0;
    this.entries=this.entries.filter(entry=>time-entry.time<entry.life);
    for(const entry of this.entries){
      const age=clamp((time-entry.time)/entry.life,0,1);
      if(entry.attached&&(elapsed>0||entry.time===time)){
        const end=spine?.stage===frame.stage?spine.motion.length:frame.length*spacing;
        this.paintedTrace(frame,spine,entry.points,Math.max(0,end-entry.span),end,spacing);
      }
      this.writeStroke(count++,entry,age);
    }
    count=this.bodyStates(frame,spine,camera,count,time,spacing);
    this.mesh.visible=count>0;
    this.mesh.geometry.setDrawRange(0,count*SEGMENTS*6);
    if(count){
      this.position.needsUpdate=true;
      this.normal.needsUpdate=true;
      this.brush.needsUpdate=true;
    }
  }
}
