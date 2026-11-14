import * as THREE from 'three';

const MAX_IMPACTS = 9;
const MAX_ARCS = 28;
const BOLT_ROWS = 13;
const FORK_ROWS = 5;
const BOLT_VERTICES = (BOLT_ROWS+FORK_ROWS*2)*2*(MAX_IMPACTS+MAX_ARCS);
const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

const boltVertex = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec4 aStroke;
  attribute vec2 aStrike;
  uniform vec2 uViewport;
  varying vec4 vStroke;
  varying vec2 vStrike;
  void main(){
    vec4 p=modelViewMatrix*vec4(position,1.);
    vec3 t=mat3(modelViewMatrix)*aTangent;
    vec2 side=normalize(vec2(-t.y,t.x)+vec2(.00001,.00002));
    vec4 clip=projectionMatrix*p;
    vec2 clipSide=(projectionMatrix*vec4(side,0.,0.)).xy;
    float pixelsPerUnit=.5*length(clipSide*uViewport)/max(.001,abs(clip.w));
    float width=min(aStroke.z,aStroke.w/max(.001,pixelsPerUnit));
    p.xy+=side*aStroke.x*width;
    vStroke=aStroke;
    vStrike=aStrike;
    gl_Position=projectionMatrix*p;
  }
`;

const boltFragment = /* glsl */ `
  varying vec4 vStroke;
  varying vec2 vStrike;
  float hash(float q){return fract(sin(q*97.1)*46123.2);}
  void main(){
    float u=vStroke.y;
    float age=vStrike.y;
    float grain=hash(floor(u*149.)+floor(vStroke.x*13.));
    float pulse=sin(u*68.6+2.3)+.42*sin(u*197.);
    float d=abs(vStroke.x-.075*pulse);
    float fracture=hash(floor(u*91.));
    float belly=1.-smoothstep(.44,.99,d+(fracture-.5)*.19);
    float filament=1.-smoothstep(.072,.29,d+(grain-.5)*.09);
    float second=1.-smoothstep(.014,.125,abs(d-.55+(fracture-.5)*.16));
    float tooth=smoothstep(.25,.82,grain);
    float pressure=(.82+.17*fracture)*(1.-filament*.69);
    float paper=filament*(.78+.20*tooth)+second*tooth*.32;
    float leader=smoothstep(.20,.51,age);
    float corona=.54+.46*(1.-leader);
    float alpha=(belly*(.68+.30*corona)+filament*.26)*vStrike.x;
    alpha*=1.-leader*.47*smoothstep(.42,.89,d);
    if(alpha<.018)discard;
    gl_FragColor=vec4(1.-pressure,paper,grain,alpha);
  }
`;

const ringVertex = /* glsl */ `
  varying vec2 vPlane;
  void main(){
    vPlane=position.xz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const ringFragment = /* glsl */ `
  varying vec2 vPlane;
  uniform float uFade,uSeed,uAge;
  void main(){
    float r=length(vPlane), a=atan(vPlane.y,vPlane.x);
    float bristle=fract(sin(floor(a*43.+uSeed)*97.1)*46123.2);
    float curl=.043*sin(a*5.+uSeed)+.023*sin(a*17.7);
    float pooled=1.-smoothstep(.018,.118,abs(r-.77+curl));
    float edge=1.-smoothstep(.01,.049,abs(r-.92+curl*.7));
    float broken=smoothstep(-.79,.23,sin(a*4.3+uSeed)+.48*bristle);
    float incision=1.-smoothstep(.017,.090,abs(r-.823+curl));
    float alpha=max(edge*.66,pooled)*broken*uFade*(.63+.37*bristle);
    if(alpha<.012)discard;
    gl_FragColor=vec4(.23+.22*bristle+uAge*.16,incision*.59,bristle,alpha);
  }
`;

function seedNoise(seed, index) {
  return Math.sin(seed*81.7+index*127.2);
}

function brushAttributes(size,geometry) {
  const attr={};
  for(const [name,width] of [['position',3],['aTangent',3],['aStroke',4],['aStrike',2]]){
    attr[name]=new THREE.BufferAttribute(new Float32Array(size*width),width).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name,attr[name]);
  }
  return attr;
}

class BoltBrush {
  constructor(root) {
    const geometry=new THREE.BufferGeometry();
    this.attr=brushAttributes(BOLT_VERTICES,geometry);
    const indices=new Uint16Array(BOLT_VERTICES*3);
    this.index=new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage);
    geometry.setIndex(this.index);
    geometry.setDrawRange(0,0);
    const viewport={value:new THREE.Vector2(1,1)};
    const material=new THREE.ShaderMaterial({
      vertexShader:boltVertex,fragmentShader:boltFragment,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uViewport:viewport},
    });
    material.onBeforeRender=renderer=>{
      const canvas=renderer.domElement;
      if(canvas.clientWidth>0&&canvas.clientHeight>0)viewport.value.set(canvas.clientWidth,canvas.clientHeight);
      else renderer.getDrawingBufferSize(viewport.value);
    };
    this.mesh=new THREE.Mesh(geometry,material);
    this.mesh.name='霹雳 · 墨脊与飞白';
    this.mesh.userData.inkIdSuppressed=true;
    this.mesh.renderOrder=-2;
    this.mesh.frustumCulled=false;
    this.mesh.visible=false;
    this.main=Array.from({length:BOLT_ROWS},()=>new THREE.Vector3());
    this.fork=Array.from({length:FORK_ROWS},()=>new THREE.Vector3());
    root.add(this.mesh);
  }

  reset(){this.count=0;this.indexCount=0;}

  ribbon(points,width,cap,force,age) {
    const {position,aTangent,aStroke,aStrike}=this.attr;
    for(let i=0;i<points.length;i++){
      const point=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(i+1,points.length-1)];
      const u=i/(points.length-1),base=this.count;
      const loading=width*(.40+.60*Math.sin(Math.PI*(u*.85+.06)));
      const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
      for(let side=-1;side<=1;side+=2){
        const at=this.count++;
        position.setXYZ(at,point.x,point.y,point.z);
        aTangent.setXYZ(at,dx,dy,dz);
        aStroke.setXYZW(at,side,u,loading,cap);
        aStrike.setXY(at,force,age);
      }
      if(i===0)continue;
      const index=this.index.array,k=this.indexCount;
      index[k]=base-2;index[k+1]=base-1;index[k+2]=base;
      index[k+3]=base-1;index[k+4]=base+1;index[k+5]=base;
      this.indexCount+=6;
    }
  }

  bolt(record,time) {
    const {from,to,seed,life,width,cap,conductive,branch,hostile}=record;
    const age=time-record.time;
    if(age<0||age>=life)return;
    const lifePhase=age/life;
    const rebound=(conductive||hostile) ? .89+.11*Math.sin(age*81)**2 : 1;
    const force=(1-smooth(lifePhase,.27,1))*rebound;
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
    const horizontal=Math.hypot(dx,dz),height=Math.abs(dy);
    const sx=horizontal>.16?dz/horizontal:1,sz=horizontal>.16?-dx/horizontal:0;
    const jag=Math.min(hostile?2.2:1.18,.13+Math.hypot(horizontal,height)*(hostile?.13:.107));
    for(let i=0;i<BOLT_ROWS;i++){
      const u=i/(BOLT_ROWS-1),tip=Math.sin(u*Math.PI);
      const kink=(seedNoise(seed,i)+.56*seedNoise(seed,i+13))*jag*tip;
      this.main[i].set(lerp(from.x,to.x,u)+sx*kink,
        lerp(from.y,to.y,u)+seedNoise(seed,i+29)*jag*tip*(hostile?.25:.57),lerp(from.z,to.z,u)+sz*kink);
    }
    this.ribbon(this.main,width,cap,force,lifePhase);
    if(branch)return;
    const forks=hostile?2:conductive?1:0;
    for(let n=0;n<forks;n++){
      const start=this.main[3+n*4],sign=n?-1:1;
      for(let j=0;j<FORK_ROWS;j++){
        const u=j/(FORK_ROWS-1),drift=jag*u*(sign*(1.4+.59*u)+.33*seedNoise(seed,28+n*13+j));
        this.fork[j].set(start.x+sx*drift+dx*u*.18,
          start.y+dy*u*.23+jag*.26*seedNoise(seed,39+n*17+j)*u,start.z+sz*drift+dz*u*.18);
      }
      this.ribbon(this.fork,width*.43,cap*.49,force*(hostile?.72:.59),lifePhase);
    }
  }

  upload() {
    this.mesh.visible=this.indexCount>0;
    this.mesh.geometry.setDrawRange(0,this.indexCount);
    if(!this.mesh.visible)return;
    for(const attr of Object.values(this.attr)){
      attr.clearUpdateRanges();
      attr.addUpdateRange(0,this.count*attr.itemSize);
      attr.needsUpdate=true;
    }
    this.index.clearUpdateRanges();
    this.index.addUpdateRange(0,this.indexCount);
    this.index.needsUpdate=true;
  }
}

/** Landed hazard marks and conductive links share one transient brush mesh. */
export class InkImpactEffects {
  constructor(scene) {
    this.root=new THREE.Group();
    this.root.name='雷劫着点';
    this.count=0;
    this.serial=0;
    this.records=[];
    this.arcs=[];
    this.brush=new BoltBrush(this.root);
    const shape=new THREE.RingGeometry(.61,1.02,52,3).rotateX(-Math.PI/2);
    this.rings=Array.from({length:MAX_IMPACTS},()=>{
      const ring=new THREE.Mesh(shape,new THREE.ShaderMaterial({
        vertexShader:ringVertex,fragmentShader:ringFragment,transparent:true,depthWrite:false,
        side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uFade:{value:0},uSeed:{value:0},uAge:{value:0}},
      }));
      ring.visible=false;
      ring.userData.inkIdSuppressed=true;
      this.root.add(ring);
      return ring;
    });
    scene.add(this.root);
  }

  add(event,time) {
    this.count++;
    // Water hazards have a displaced contact sheet at the impact point.
    if(event.surface)return;
    const expired=this.records.length===MAX_IMPACTS?this.records.shift():null;
    const ring=expired?.ring??this.rings.find(mesh=>!this.records.some(record=>record.ring===mesh));
    const hostile=event.stage===3;
    const y=hostile?event.y:Math.max(.04,event.y-.53);
    const to={x:event.x,y,z:event.z};
    const seed=event.id||event.x*17+event.z*11;
    ring.position.set(to.x,y+.035,to.z);
    ring.material.uniforms.uSeed.value=seed;
    const crossed=event.attack==='sky-cross';
    const rise=crossed&&event.layer==='low';
    const length=crossed?5.2+event.radius*.62:11.6+event.radius*.60;
    const from={x:to.x+seedNoise(seed,9)*(crossed?1.5:2.7),y:y+(rise?-length:length),z:to.z+seedNoise(seed,12)*1.8};
    const bolt=hostile?{from,to,seed,time,life:.33,width:crossed?.43:.52,cap:crossed?8.5:10.5,hostile}:null;
    this.records.push({time,ring,bolt,id:event.id,radius:event.radius,x:to.x,y,z:to.z});
    this.lastTime=undefined;
  }

  addArc(event,time) {
    if(!event.from||!event.to)return;
    if(this.arcs.length===MAX_ARCS)this.arcs.shift();
    const {from,to,conductive,branch}=event;
    const power=Math.min(5,event.power??1);
    this.arcs.push({from,to,conductive,branch,time,seed:++this.serial*.712+time*.31,
      life:branch?.25:conductive?.36:.28,
      width:branch?.12:conductive?.225+power*.017:.16+power*.012,
      cap:branch?4.3:conductive?8:6.3});
    this.lastTime=undefined;
  }

  reset() {
    this.records.length=0;
    this.arcs.length=0;
    this.count=0;
    this.serial=0;
    for(const ring of this.rings)ring.visible=false;
    this.brush.reset();
    this.brush.upload();
    this.lastTime=undefined;
  }

  update(time,visible) {
    this.root.visible=visible;
    if(!visible||time===this.lastTime)return;
    this.lastTime=time;
    this.brush.reset();
    for(let i=this.records.length-1;i>=0;i--){
      const record=this.records[i];
      const age=Math.max(0,time-record.time),{ring,bolt}=record;
      if(age>.85){ring.visible=false;this.records.splice(i,1);continue;}
      ring.visible=true;
      ring.scale.setScalar(record.radius*lerp(.29,1.14,1-Math.exp(-age*4.8)));
      ring.material.uniforms.uFade.value=(1-smooth(age,.17,.85))*.78;
      ring.material.uniforms.uAge.value=age;
      if(bolt)this.brush.bolt(bolt,time);
    }
    for(let i=this.arcs.length-1;i>=0;i--){
      const arc=this.arcs[i];
      if(time-arc.time>arc.life)this.arcs.splice(i,1);
      else this.brush.bolt(arc,time);
    }
    this.brush.upload();
  }

  inspect() {
    return {count:this.count,arcs:this.arcs.length,boltTriangles:this.brush.indexCount/3,active:this.records.map(record=>({
      id:record.id,x:record.x,y:record.y,z:record.z,
      bolt:!!record.bolt&&this.lastTime-record.bolt.time<record.bolt.life,
      ring:record.ring.material.uniforms.uFade.value,
    }))};
  }
}
