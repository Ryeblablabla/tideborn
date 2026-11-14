import * as THREE from 'three';

const actionBudget = 27;
const impactBudget = 6;
const maxStrokes = actionBudget + impactBudget;
const sections = 11;
const capacity = maxStrokes * (sections + 1) * 2;
const limits = { clawRelease:.32, weaponStrike:.52, clawStart:.24, shoot:.22 };

const vertex = /* glsl */ `
  attribute vec4 aStroke,aImpactAxis;
  varying vec4 vStroke;
  varying vec3 vPoint;
  void main(){
    vStroke=aStroke;
    vPoint=position;
    vec4 point=modelViewMatrix*vec4(position,1.);
    if(aStroke.w>.5){
      vec3 tangent=mat3(modelViewMatrix)*aImpactAxis.xyz;
      vec2 across=normalize(vec2(-tangent.y,tangent.x)+vec2(.0001,.0002));
      point.xy+=across*aStroke.x*aImpactAxis.w;
    }
    gl_Position=projectionMatrix*point;
  }
`;
const fragment = /* glsl */ `
  varying vec4 vStroke;
  varying vec3 vPoint;
  float fibers(vec3 p) {
    return fract(sin(dot(p,vec3(51.71,73.31,113.03)))*19744.85);
  }
  void main(){
    float edge=abs(vStroke.x);
    float grit=fibers(floor(vPoint*vec3(93.,110.,94.)));
    float trail=1.-smoothstep(.78,.99,edge+.15*(grit-.5));
    if(vStroke.w>.5){
      float guard=step(1.5,vStroke.w)*(1.-step(2.5,vStroke.w)),along=vStroke.y;
      float splash=step(4.5,vStroke.w);
      float crack=step(3.5,vStroke.w)*(1.-splash);
      float wet=step(2.5,vStroke.w)*(1.-step(3.5,vStroke.w));
      float slit=(1.-smoothstep(.13,.50,edge+.13*(grit-.5)))*smoothstep(.10,.29,along);
      float split=1.-smoothstep(.05,.19,abs(along-.56+vStroke.x*.07));
      float skid=(1.-smoothstep(.13,.27,abs(edge-.40)))*smoothstep(.18,.51,grit);
      float paper=mix(slit*.87,skid*.77,guard);
      float ink=mix(.95-.66*slit,.62-.37*skid,guard)+.047*grit;
      if(wet>.5){
        float vein=(1.-smoothstep(.09,.40,abs(vStroke.x-.19*along)))*smoothstep(.12,.42,along);
        paper=max(paper,vein*.91);
        ink=mix(.98,.22,vein);
      }
      if(crack>.5){
        float center=.26*sin(along*21.)+.13*sin(along*43.);
        float fault=1.-smoothstep(.11,.30,abs(vStroke.x-center));
        paper=fault*.94;
        ink=mix(.96,.28,fault);
        trail*=.73+.27*smoothstep(.12,.65,grit);
      }
      if(splash>.5){
        float fork=smoothstep(.37,.87,along)*.51;
        float bristle=1.-smoothstep(.09,.28,abs(edge-fork)+.14*(grit-.5));
        paper=max(bristle*.94,.21*smoothstep(.50,.79,grit));
        ink=mix(.98,.15,paper);
        trail*=1.-smoothstep(.77,.99,along)*(1.-smoothstep(.30,.59,grit));
      }
      float coverage=vStroke.z*trail*(.76+.24*grit)*(1.-guard*split*.73);
      if(coverage<.015)discard;
      gl_FragColor=vec4(1.-ink,paper,grit,coverage);
      return;
    }
    float core=(1.-smoothstep(.12,.48,edge))*.72;
    float ink=mix(.71,.12,core)+.08*grit;
    float reserve=core*smoothstep(.12,.62,grit);
    gl_FragColor=vec4(1.-ink,reserve,grit,vStroke.z*trail);
  }
`;

export class WeaponStrokes {
  constructor(scene) {
    this.entries=[];
    this.impacts=[];
    this.contactRay=new THREE.Raycaster();
    this.contactPoint=new THREE.Vector3();
    this.contactScreen=new THREE.Vector3();
    const geometry=new THREE.BufferGeometry();
    this.position=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    this.brush=new THREE.BufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage);
    this.impactAxis=new THREE.BufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage);
    const indices=new Uint16Array(maxStrokes*sections*6);
    for(let stroke=0;stroke<maxStrokes;stroke++)for(let i=0;i<sections;i++){
      const k=stroke*(sections+1)*2+i*2, offset=(stroke*sections+i)*6;
      indices.set([k,k+1,k+2,k+1,k+3,k+2],offset);
    }
    geometry.setAttribute('position',this.position);
    geometry.setAttribute('aStroke',this.brush);
    geometry.setAttribute('aImpactAxis',this.impactAxis);
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
    geometry.setDrawRange(0,0);
    const material=new THREE.ShaderMaterial({
      vertexShader:vertex,fragmentShader:fragment,transparent:true,
      depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    });
    this.mesh=new THREE.Mesh(geometry,material);
    this.mesh.name='招式飞白';
    this.mesh.userData.inkIdSuppressed=true;
    this.mesh.renderOrder=6;
    this.mesh.frustumCulled=false;
    scene.add(this.mesh);
  }

  reset() {
    this.entries.length=0;
    this.impacts.length=0;
    this.mesh.geometry.setDrawRange(0,0);
  }

  event(event,time,target=null,camera=null) {
    if(event.type==='evolve'){this.reset();return;}
    if(event.type==='armorBreak'){this.addImpact({...event,amount:1,boss:true},time,target,camera);return;}
    if(event.type==='hit'){this.addImpact(event,time,target,camera);return;}
    if(event.type==='clawRelease'&&event.strikeId!=null){
      this.entries=this.entries.filter(({event:start})=>start.type!=='clawStart'||start.strikeId!==event.strikeId);
    }
    if(!limits[event.type]||!event.to||event.strike==='water'||event.cancelled)return;
    if(event.type==='shoot'&&!event.weapon)return;
    if(this.entries.length>=14)this.entries.shift();
    this.entries.push({event,time,life:limits[event.type]});
  }

  ribbon(index, start, axis, radius, width, climb, bend, pressure, reveal) {
    const startVertex=index*(sections+1)*2;
    for(let i=0;i<=sections;i++){
      const u=i/sections;
      const along=u*reveal;
      const angle=axis+(along-.44)*bend;
      const sin=Math.sin(angle), cos=Math.cos(angle);
      const pressureAt=pressure*Math.sin(Math.PI*u)**.72;
      const r=radius*(.64+.37*along);
      const y=start.y+climb*(along-.28)+.22*Math.sin(along*Math.PI);
      const half=width*Math.sin(Math.PI*u)**.58;
      for(let side=0;side<2;side++){
        const vertex=startVertex+i*2+side;
        const sign=side*2-1;
        this.position.setXYZ(vertex,start.x+(r+half*sign)*sin,y+half*.47*sign,start.z+(r+half*sign)*cos);
        this.brush.setXYZW(vertex,sign,u,pressureAt,0);
      }
    }
  }

  addImpact(event,time,target,camera){
    const from=event.from;
    if(!from||!Number.isFinite(from.x+from.y+from.z)||!(event.amount>0))return;
    const dx=event.x-from.x,dy=event.y-from.y,dz=event.z-from.z;
    const span=Math.hypot(dx,dy,dz),planar=Math.hypot(dx,dz);
    if(span<.015)return;
    this.impacts=this.impacts.filter(impact=>time-impact.time<impact.life);
    if(this.impacts.some(impact=>(impact.event.type==='armorBreak'||impact.event.guarded===event.guarded)&&time-impact.time<.10&&
      ((event.targetId!=null&&event.targetId===impact.event.targetId)||
        Math.hypot(impact.event.x-event.x,impact.event.y-event.y,impact.event.z-event.z)<(event.boss?1.25:1.05))))return;
    const ordinary=this.impacts.findIndex(impact=>!impact.event.boss);
    if(!event.boss&&this.impacts.filter(impact=>!impact.event.boss).length>=4)this.impacts.splice(ordinary,1);
    if(this.impacts.length>=impactBudget){
      if(ordinary>=0)this.impacts.splice(ordinary,1);
      else if(event.boss)this.impacts.shift();
      else return;
    }
    const radius=event.radius??(event.boss?2.2:.6);
    // Large modeled heads and armor can reach the collision skin before
    // their visible center. Put the close on the incoming side of that skin.
    const inward=event.boss?Math.min(span,radius+.23):Math.min(span*.95,radius*.69);
    const fx=dx/span,fy=dy/span,fz=dz/span;
    const sx=planar>.01?dz/planar:1,sz=planar>.01?-dx/planar:0;
    let x=event.x-fx*inward,y=event.y-fy*inward+(event.boss?.61:.18),z=event.z-fz*inward;
    const waterPulse=!event.boss&&!event.guarded&&event.y<1.8&&event.source==='water'&&event.strikeId!=null;
    const wetContact=!event.boss&&!event.guarded&&event.y<1.6&&['bubble','mist','poison','needle','breach','bite','claw'].includes(event.source);
    const creature=target?.userData.creature;
    let surface=false,view=null;
    if(creature?.isMesh){
      // Query the painted surface only after the local impact budget admits the event.
      creature.updateWorldMatrix(true,false);
      const ray=this.contactRay;
      const reach=Math.max(span,radius*2.3);
      ray.far=reach+.46;
      ray.ray.direction.set(fx,fy,fz);
      for(const lift of [0,.52]){
        ray.ray.origin.set(event.x-fx*reach,event.y-fy*reach+lift,event.z-fz*reach);
        const hit=ray.intersectObject(creature,false)[0];
        if(!hit)continue;
        x=hit.point.x-fx*.21;y=hit.point.y-fy*.21+.09;z=hit.point.z-fz*.21;
        surface=true;
        break;
      }
      const closeClaw=event.source==='claw'&&event.strikeId!=null;
      if((event.boss||closeClaw||waterPulse)&&camera){
        // Keep the real impact's screen position, but use the part of the
        // shell the camera can see when the strike arrives behind its ridge.
        const screen=this.contactPoint.set(x,y,z).project(camera);
        ray.far=camera.position.distanceTo(this.contactScreen.set(x,y,z))+radius;
        ray.setFromCamera(screen,camera);
        const visible=ray.intersectObject(creature,false)[0];
        if(visible){
          view=ray.ray.direction.clone().negate();
          const p=visible.point.addScaledVector(view,event.boss?.31:.13);
          x=p.x;y=p.y;z=p.z;
          surface=true;
        }
      }
    }
    this.impacts.push({event,time,life:event.type==='armorBreak'?.54:event.guarded?.22:event.boss?.31:
      event.source==='claw'||waterPulse?.33:wetContact?.29:.25,x,y,z,fx,fy,fz,sx,sz,surface,view,wetContact,waterPulse});
  }

  contact(index,impact,t){
    const first=index*(sections+1)*2;
    const {event,x,y,z,fx,fy,fz,sx,sz,view,wetContact,waterPulse}=impact;
    const guard=event.guarded;
    const crack=event.type==='armorBreak';
    const closeClaw=!guard&&event.source==='claw'&&impact.surface;
    const length=crack?2.0:guard?1.47:closeClaw?1.25:event.boss?1.12:waterPulse?1.35:wetContact?1.11:.88;
    const width=crack?.43:guard?.23:closeClaw?.30:event.boss?.28:waterPulse?.34:wetContact?.32:.23;
    const load=(1-t)**1.22*(guard?.94:1);
    for(let i=0;i<=sections;i++){
      const u=i/sections;
      const along=(u-.47)*length;
      const pressure=load*Math.sin(Math.PI*u)**.52;
      const across=crack?along:guard?along+t*.27:along*(closeClaw?.75:waterPulse?.20:.43);
      const depth=guard?-.20+.31*Math.sin(u*Math.PI):along*(impact.surface?.51:.77);
      const lift=guard?along*.29:waterPulse?.74*u+.13*Math.sin(Math.PI*u):
        .15*u+.19*along+(wetContact?.22*Math.sin(u*Math.PI):0);
      const taper=width*Math.sin(Math.PI*u)**.48*(1-.38*u);
      const tx=guard?sx:waterPulse?fx*.33:sx*.43+fx*.77;
      const ty=guard?.29:waterPulse?1:fy*.77+.36;
      const tz=guard?sz:waterPulse?fz*.33:sz*.43+fz*.77;
      let px=fx*depth+sx*across,py=fy*depth+lift,pz=fz*depth+sz*across;
      if(view){
        const plane=px*view.x+py*view.y+pz*view.z;
        px-=plane*view.x;py-=plane*view.y;pz-=plane*view.z;
      }
      for(let side=0;side<2;side++){
        const vertex=first+i*2+side;
        this.position.setXYZ(vertex,x+px,y+py,z+pz);
        this.brush.setXYZW(vertex,side*2-1,u,pressure,waterPulse?5:crack?4:wetContact?3:guard?2:1);
        this.impactAxis.setXYZW(vertex,tx,ty,tz,taper);
      }
    }
  }

  update(time,visible) {
    if(!visible){this.mesh.visible=false;return;}
    this.entries=this.entries.filter(entry=>time-entry.time<entry.life);
    this.impacts=this.impacts.filter(impact=>time-impact.time<impact.life);
    let count=0;
    for(const {event,time:startTime,life} of this.entries) {
      if(count>=actionBudget-3)break;
      const t=Math.max(0,(time-startTime)/life);
      const direction=Math.atan2(event.to.x-event.x,event.to.z-event.z);
      const pressure=(1-t)**1.45;
      const progress=Math.min(1,.21+t*3.1);
      if(event.type==='shoot'){
        const fan=Math.min(.96,.23+(event.count||1)*.095);
        this.ribbon(count++,event,direction,.96+t*.66,.13,.28,fan,pressure*.49,progress);
      }else if(event.type==='clawStart'){
        this.ribbon(count++,event,direction+(event.side||1)*.22,.62,.082,.34,1.1,pressure*.46,progress);
      }else{
        const tail=event.strike==='tail', bite=event.strike==='bite';
        const lanes=tail?2:bite?2:3;
        const coverage=1+.15*Math.max(0,(event.tier??1)-1);
        const reach=Math.min((tail?4.7:2.65)*coverage,event.radius);
        for(let i=0;i<lanes;i++){
          const side=(event.side||1)*(tail?1:.72);
          const root={x:event.x,y:event.y+(i-(lanes-1)*.5)*.19,z:event.z};
          const angle=tail?direction+i*.26:direction+(i-(lanes-1)*.5)*.18;
          this.ribbon(count++,root,angle,reach*(.58+i*.12+t*.2),tail?.21:.134,
            (bite?.46:.93)*side,tail?2.8:1.6*side,pressure*(event.hit?.92:.45),progress);
        }
      }
    }
    for(const impact of this.impacts)this.contact(count++,impact,THREE.MathUtils.clamp((time-impact.time)/impact.life,0,1));
    this.mesh.visible=count>0;
    this.mesh.geometry.setDrawRange(0,count*sections*6);
    if(count){this.position.needsUpdate=true;this.brush.needsUpdate=true;}
    if(this.impacts.length)this.impactAxis.needsUpdate=true;
  }
}
