import * as THREE from 'three';
import {bendManeVector, maneAngles} from './mane-flow.js';

const vertex=/* glsl */`
attribute vec3 aRoot;attribute vec3 aAxis;attribute vec3 aUp;
attribute vec4 aShape;
varying vec3 vRoot;varying vec3 vAxis;varying vec3 vUp;varying vec3 vSide;varying vec3 vSurface;varying vec4 vShape;
void main(){
 vRoot=aRoot;vAxis=normalize(aAxis);vUp=normalize(aUp-vAxis*dot(aUp,vAxis));vSide=normalize(cross(vAxis,vUp));vShape=aShape;
 vSurface=aRoot+vSide*position.x*aShape.x*5.4+vUp*position.y*aShape.x*5.4+vAxis*(position.z+.52)*aShape.y*1.18;
 gl_Position=projectionMatrix*viewMatrix*vec4(vSurface,1.);
}`;
const fragment=/* glsl */`
varying vec3 vRoot;varying vec3 vAxis;varying vec3 vUp;varying vec3 vSide;varying vec3 vSurface;varying vec4 vShape;
uniform sampler2D tSurfaceDepth;uniform vec2 uViewport;uniform mat4 uInverseProjection;uniform mat4 uInverseView;
uniform vec3 uEye;uniform float uTime;uniform float uStrength;uniform float uStream;uniform float uOrtho;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.62+noise3(p*2.07+3.9)*.26+noise3(p*4.13+7.1)*.12;}
vec3 local(vec3 p){return vec3(dot(p,vSide),dot(p,vUp),dot(p,vAxis));}
vec2 slab(vec3 origin,vec3 ray,vec3 lo,vec3 hi){vec3 inverse=1./(ray+vec3(.0000001)),a=(lo-origin)*inverse,b=(hi-origin)*inverse;vec3 near=min(a,b),far=max(a,b);return vec2(max(max(near.x,near.y),near.z),min(min(far.x,far.y),far.z));}
float densityAt(vec3 p){
 float plumeLength=vShape.y,width=vShape.x,seed=vShape.z,z=p.z/plumeLength,time=uTime*(.84+fract(seed*.31)*.19);
 if(z<-.025||z>1.1)return 0.;
 float tip=clamp(z,0.,1.),bend=tip*tip,phase=tip*5.1-time*(2.0+uStream*1.8)+seed;
 vec2 curl=vec2(sin(phase)*.78+sin(phase*.53+seed)*.24,cos(phase*.8+1.7)*(.54+uStream*.20))*width*bend;
 // Different winding tongues share the same source-hair direction and root.
 vec2 transverse=(p.xy-curl)/width;
 float wobble=fbm(vec3(transverse*1.7,z*5.-time*1.8+seed));
 float taper=pow(max(0.,1.-tip),.70),body=length(transverse*vec2(1.,1.13));
 float radius=taper*(.56+.17*sin(phase*1.15)+.24*wobble)+.022;
 float edge=body-radius;
 float inkCore=(1.-smoothstep(-.19,.17,edge))*(.78+.30*wobble);
 float paperBleed=(1.-smoothstep(.05,.84,edge))*.16;
 float cut=noise3(vec3(transverse*2.6,z*9.-time*3.+seed*.73));
 float broken=mix(1.,smoothstep(.24,.61,cut),smoothstep(.36,.98,tip)*.78);
 float envelope=smoothstep(-.025,.08,z)*(1.-smoothstep(.75,1.08,z));
 return (inkCore*broken+paperBleed)*envelope*vShape.w;
}
void main(){
 vec2 uv=gl_FragCoord.xy/uViewport;
 vec3 rayOrigin=uEye,ray=normalize(vSurface-uEye);
 if(uOrtho>.5){
  vec4 nearView=uInverseProjection*vec4(uv*2.-1.,-1.,1.);
  rayOrigin=(uInverseView*(nearView/nearView.w)).xyz;
  ray=normalize((uInverseView*vec4(0.,0.,-1.,0.)).xyz);
 }
 vec3 origin=local(rayOrigin-vRoot),direction=local(ray),lo=vec3(-vShape.x*2.7,-vShape.x*2.7,-vShape.y*.07),hi=vec3(vShape.x*2.7,vShape.x*2.7,vShape.y*1.15);
 vec2 limits=slab(origin,direction,lo,hi);float begin=max(limits.x,0.),end=limits.y;if(end<=begin)discard;
 float depth=texture2D(tSurfaceDepth,uv).r;
 if(depth<.999999){vec4 view=uInverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);view/=view.w;vec3 world=(uInverseView*view).xyz;end=min(end,dot(world-rayOrigin,ray)+.0006);}
 if(end<=begin)discard;
 const int STEPS=12;float stepSize=(end-begin)/float(STEPS),optical=0.;
 for(int i=0;i<STEPS;i++){float distance=begin+(float(i)+.5)*stepSize;optical+=densityAt(origin+direction*distance)*stepSize/max(vShape.x,.0001);}
 optical=min(4.,optical*uStrength*1.74);
 if(optical<.001)discard;
 // R is concentrated pigment; G is the much softer surrounding wet wash.
 gl_FragColor=vec4(optical,optical*.16,0.,0.);
}`;


const washByRenderer=new WeakMap();

/** One depth-clipped wet-ink pass shared by all forms. */
class ManeWash {
 constructor(ink){
  this.providers=[];this.capacity=0;this.active={value:0};
  const renderer=ink.renderer;
  this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType});
  this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,uniforms:{tSurfaceDepth:{value:null},uViewport:{value:new THREE.Vector2()},uInverseProjection:{value:new THREE.Matrix4()},uInverseView:{value:new THREE.Matrix4()},uEye:{value:new THREE.Vector3()},uTime:{value:0},uStrength:{value:0},uStream:{value:0},uOrtho:{value:0}}});
  this.scene=new THREE.Scene();this.mesh=new THREE.Mesh(new THREE.InstancedBufferGeometry(),this.material);this.mesh.frustumCulled=false;this.scene.add(this.mesh);
  this.point=new THREE.Vector3();this.axis=new THREE.Vector3();this.up=new THREE.Vector3();this.scale=new THREE.Vector3();this.clearColor=new THREE.Color();
  const post=ink.postMaterial;post.uniforms.tManeFlame={value:this.target.texture};post.uniforms.uManeVisible=this.active;
  post.fragmentShader='uniform sampler2D tManeFlame;uniform float uManeVisible;\n'+post.fragmentShader;
  post.fragmentShader=post.fragmentShader.replace('ink = clamp(ink,0.0,1.0);',/* glsl */`
   float maneFringe=0.;
   if(uManeVisible>.5&&uRaw<.5){
    vec2 flame=texture2D(tManeFlame,vUv).rg;
    float haze=0.;
    for(int j=0;j<6;j++){
     float angle=float(j)*1.04719755;
     haze+=texture2D(tManeFlame,vUv+vec2(cos(angle),sin(angle))*pixel*3.1).g;
    }
    float wetInk=1.-exp(-flame.r-haze*.077);
    maneFringe=clamp(flame.g*2.1+haze*.11,0.,1.)*(1.-smoothstep(.59,1.25,flame.r));
    ink=1.-(1.-clamp(ink,0.,1.))*(1.-wetInk);
   }
   ink = clamp(ink,0.0,1.0);
  `);
  post.fragmentShader=post.fragmentShader.replace('gl_FragColor=vec4(color,1.0);',/* glsl */`
   if(maneFringe>.001){
    // The thin wet edge takes a little mineral color where the dark
    // silhouette overlaps roof or rock. Concentrated ink keeps its tone.
    float ground=1.-smoothstep(.12,.40,dot(color,vec3(.2126,.7152,.0722)));
    vec3 wetTint=mix(vec3(.17,.21,.22),vec3(.28,.34,.34),ground);
    color=mix(color,wetTint,maneFringe*(.13+.34*ground));
   }
   gl_FragColor=vec4(color,1.0);
  `);post.needsUpdate=true;
  const previous=ink.strokeScene.onBeforeRender;
  ink.strokeScene.onBeforeRender=(r,scene,camera,geometry,material,group)=>{
   previous?.call(scene,r,scene,camera,geometry,material,group);
   this.render(r,camera,ink.target);
  };
 }
 reserve(required){
  if(required<=this.capacity)return;this.capacity=2**Math.ceil(Math.log2(Math.max(32,required)));const box=new THREE.BoxGeometry(1,1,1),g=new THREE.InstancedBufferGeometry();g.setAttribute('position',box.attributes.position.clone());g.setIndex(box.index.clone());box.dispose();
  this.attrs={};for(const name of['aRoot','aAxis','aUp']){this.attrs[name]=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,this.attrs[name]);}
  this.attrs.aShape=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*4),4).setUsage(THREE.DynamicDrawUsage);g.setAttribute('aShape',this.attrs.aShape);this.mesh.geometry.dispose();this.mesh.geometry=g;
 }
 render(renderer,camera,target){
  const sources=this.providers.filter(provider=>provider.visible()&&provider.enabled&&provider.strength>.001&&provider.count>0);
  this.active.value=sources.length?1:0;
  if(!sources.length)return;
  const old=renderer.getRenderTarget(),auto=renderer.autoClear,color=renderer.getClearColor(this.clearColor),alpha=renderer.getClearAlpha();
  if(this.target.width!==target.width||this.target.height!==target.height)this.target.setSize(target.width,target.height);
  const u=this.material.uniforms;u.tSurfaceDepth.value=target.depthTexture;u.uViewport.value.set(target.width,target.height);
  u.uInverseProjection.value.copy(camera.projectionMatrixInverse);u.uInverseView.value.copy(camera.matrixWorld);u.uEye.value.setFromMatrixPosition(camera.matrixWorld);u.uOrtho.value=camera.isOrthographicCamera?1:0;
  try{
   renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.clear();
   for(const source of sources){
    this.reserve(source.count);
    const world=source.root.matrixWorld,worldScale=this.scale.setFromMatrixScale(world).x;
    source.plumes.forEach((plume,i)=>{
     this.point.copy(plume.root).applyMatrix4(world);this.axis.copy(plume.axis).transformDirection(world);this.up.copy(plume.up).transformDirection(world);
     if(Math.abs(this.axis.dot(this.up))>.985)this.up.set(Math.abs(this.axis.x)<.85?1:0,0,Math.abs(this.axis.x)<.85?0:1);
     this.attrs.aRoot.setXYZ(i,this.point.x,this.point.y,this.point.z);this.attrs.aAxis.setXYZ(i,this.axis.x,this.axis.y,this.axis.z);this.attrs.aUp.setXYZ(i,this.up.x,this.up.y,this.up.z);
     this.attrs.aShape.setXYZW(i,plume.width*worldScale,plume.length*worldScale,plume.seed,plume.amount);
    });
    for(const a of Object.values(this.attrs)){a.clearUpdateRanges();a.addUpdateRange(0,source.count*a.itemSize);a.needsUpdate=true;}
    this.mesh.geometry.instanceCount=source.count;
    u.uTime.value=source.time;u.uStrength.value=source.strength*source.washOpacity;u.uStream.value=source.stream;
    renderer.render(this.scene,camera);
   }
  }finally{renderer.setRenderTarget(old);renderer.setClearColor(color,alpha);renderer.autoClear=auto;}
 }
}

export class ManeWashEmitter {
 constructor(ink,root,visible,shapeMesh){
  this.root=root;this.visible=visible;this.shapeMesh=shapeMesh;this.enabled=true;this.strength=.74;this.time=0;this.stream=0;this.plumes=[];
  let wash=washByRenderer.get(ink);
  if(!wash){wash=new ManeWash(ink);washByRenderer.set(ink,wash);}
  wash.providers.push(this);
 }
 get count(){return this.plumes.length;}
 get washOpacity(){
  const wash=this.shapeMesh?.userData.dragonWash;
  if(!wash)return 1;
  return wash.y>0?wash.x:1-wash.x;
 }
}

/** Continue the original Yinglong locks with a short, attached ink fringe. */
export class InkFlame extends ManeWashEmitter {
 constructor(bridge){
  const dragon=bridge.dragon;
  super(bridge.ink,dragon.root,()=>bridge.root.visible,dragon.body);
  this.dragon=dragon;this.strength=.82;this.speed=1;this.paused=false;this.flowTime=0;
  const source=dragon.body.userData.originalGeometry;
  this.sourceAnchors=dragon.mane.groups.filter(group=>group.kind!=='brow').map(group=>{
   let best=Infinity,index=0;for(let i=0;i<source.attributes.position.count;i++){
    const x=source.attributes.position.getX(i)-group.root[0],y=source.attributes.position.getY(i)-group.root[1],z=source.attributes.position.getZ(i)-group.root[2],d=x*x+y*y+z*z;
    if(d<best){best=d;index=i;}
   }
   const zone=group.root[2]>=dragon.data.gaps[0].frontCutZ?0:group.root[2]<=dragon.data.gaps[1].rearCutZ?2:1;
   return{group,tipIndex:group.seedVertex,rootIndex:index,zone};
  });
  this.matrix=new THREE.Matrix4();this.flow=new THREE.Vector4();this.angles=new THREE.Vector2();
 }
 update(dt){
  const dragon=this.dragon,flow=dragon.mane.flow,plumes=[];
  if(flow.time<this.flowTime)this.time=0;
  this.flowTime=flow.time;
  if(!this.paused)this.time+=Math.max(0,dt)*this.speed;
  this.stream=flow.stream;
  for(const anchor of this.sourceAnchors){
   const group=anchor.group,geometry=dragon.body.userData.originalGeometry;
   const rv=dragon.vertex(geometry,anchor.rootIndex),tv=dragon.vertex(geometry,anchor.tipIndex);
   const root=dragon.mapPoint(dragon.skinPoint(rv),dragon.params(rv,anchor.zone));
   const tip=dragon.mapPoint(dragon.skinPoint(tv),dragon.params(tv,anchor.zone));
   const axis=tip.clone().sub(root),length=axis.length();
   if(length<.008)continue;
   const arc=dragon.headZ-tv.p[2]+dragon.shift(anchor.zone),frame=dragon.sampleFrame(arc),out=frame.b.clone();
   const start=root.clone().lerp(tip,.52);
   axis.normalize().multiplyScalar(.77).addScaledVector(frame.t,.16+.18*flow.stream).addScaledVector(out,.20).normalize();
   const prominent=group.kind==='crest'||group.kind==='neck';
   plumes.push({root:start,axis,up:out,width:Math.min(.013,Math.max(.0035,group.width*.43)),length:length*(prominent?.84+.32*flow.stream:.74+.29*flow.stream),seed:arc*11.+group.id*.61,amount:prominent?.90:.57});
  }
  for(const batch of dragon.mane.batches){
   const mesh=batch.mesh;if(!mesh?.visible||mesh.count===0)continue;
   const flutter=mesh.geometry.attributes.aFlutter,template=batch.template;
   const [dx,dy,dz]=template.tip.map((value,i)=>value-template.root[i]);
   for(let copy=0;copy<mesh.count;copy++){
    const raised=mesh.userData.maneRaised[copy]===1;
    if(!raised&&copy%3!==0)continue;
    mesh.getMatrixAt(copy,this.matrix);
    this.flow.set(flutter.getX(copy),flutter.getY(copy),flutter.getZ(copy),flutter.getW(copy));maneAngles(1,this.flow,this.angles);
    const root=new THREE.Vector3().setFromMatrixPosition(this.matrix);
    const tip=bendManeVector(new THREE.Vector3(),dx,dy,dz,this.angles.x,this.angles.y).applyMatrix4(this.matrix);
    const axis=tip.clone().sub(root),length=axis.length();if(length<.022)continue;
    const up=new THREE.Vector3(0,1,0).transformDirection(this.matrix),start=root.lerp(tip,raised?.48:.58);
    axis.normalize().multiplyScalar(.88).addScaledVector(up,.12).normalize();
    plumes.push({root:start,axis,up,width:Math.min(raised?.014:.009,Math.max(.003,length*.13)),
     length:length*((raised?.81:.64)+.29*flow.stream),seed:copy*.71+template.sourceGroup*.32,amount:raised?.86:.43});
   }
  }
  this.plumes=plumes;
 }
}
