import { forgedGateVertex, forgedGateFragment } from './gate-mineral-ink.js';
import * as THREE from 'three';
import { random } from '../rules.js';
import { LockAtmosphere } from './heaven-lock-atmosphere.js';
import {
  COURT_SEAL_AT, FASCIA, GATE_BIND, LOCK_DOOR, LOCK_LANDING, LOCK_SETTLE, STOMP_CHAIN_RELEASE,
  STOMP_DURATION, STOMP_LOAD, STOMP_PAD, STOMP_PAW_GAP,
} from '../heaven-finale.js';

const { clamp, lerp, smoothstep: smooth, smootherstep: settle } = THREE.MathUtils;
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const UP=v(0,1,0);
const TAU=Math.PI*2;
export const GATE_RELEASE_INSERT = STOMP_DURATION - .16;
const TETHER_TAUT=4.61;
const TETHER_UNSEAT=4.78;
const beamPawSpread=.18;

const paintVertex=`
varying vec2 vUv;
void main(){
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
const paintNoise=`
uniform float uOpacity,uTime,uSeed;
varying vec2 vUv;
float grain(vec2 uv){return fract(sin(dot(floor(uv),vec2(91.79,67.13)))*43758.55);}
`;
const ringPaint=`
${paintNoise}
void main(){
  vec2 q=2.*vUv-1.;
  float r=length(q), a=atan(q.y,q.x);
  float f=grain(vec2(a*53.,r*30.+uSeed));
  float tooth=.016*sin(a*7.1+uSeed)+.009*sin(a*15.3+uTime*2.);
  float perimeter=abs(r-.902);
  float line=1.-smoothstep(.027,.061,perimeter+tooth);
  float reserve=(1.-smoothstep(.008,.031,abs(r-.902+tooth*.45)))*(.55+.45*sin(a*21.)*sin(a*21.));
  float charge=smoothstep(.95,2.42,uTime);
  float inward=(1.-smoothstep(.83,.90,r))*smoothstep(.53,.78,r);
  float rushed=.22+.78*smoothstep(.15,.86,sin(a*5.0+r*19.-uTime*(5.1+4.2*charge))*.5+.5);
  float breath=.70+.30*pow(.5+.5*sin(uTime*(8.+charge*11.)),2.);
  float alpha=clamp(line*(.86+.14*f)+(.23+.40*charge)*inward*rushed*breath,0.,1.)*uOpacity;
  if(alpha<.015)discard;
  gl_FragColor=vec4(.12+.13*f+.60*reserve,.05+.77*reserve,f,alpha);
}`;
const lockChargePaint=`
${paintNoise}
void main(){
  float h=vUv.x,across=2.*vUv.y-1.;
  float load=smoothstep(.95,2.42,uTime);
  float fiber=grain(vec2(h*67.+uSeed,across*27.));
  float travel=1.-smoothstep(.09,.46,abs(h-(1.21-fract(uTime*(1.2+load*.7)))));
  float edge=1.-smoothstep(.23,.91,abs(across+(fiber-.5)*.20));
  float core=1.-smoothstep(.10,.35,abs(across));
  float taper=smoothstep(.0,.08,h)*(1.-smoothstep(.81,1.,h));
  float alpha=edge*taper*(.41+.59*travel)*(.72+.28*fiber)*uOpacity;
  if(alpha<.014)discard;
  gl_FragColor=vec4(.15+.64*core,.17+.73*core,fiber,alpha);
}`;
const layerInk=`
${paintNoise}
void main(){
  float s=vUv.x,Across=2.*vUv.y-1.;
  float grainy=grain(vec2(s*228.+uSeed,Across*44.));
  float wet=.55+.27*sin(s*22.+uSeed)+.18*sin(s*56.+uSeed*3.-uTime*.95);
  float drift=Across+.16*sin(s*18.+uSeed)+.08*sin(s*91.+uSeed*2.);
  float shape=(1.-smoothstep(.20,.99,abs(drift)))*( .49+.51*smoothstep(.06,.72,wet));
  float ragged=.63+.37*smoothstep(.06,.74,grainy+.17*sin(Across*16.+s*51.));
  float tip=smoothstep(.0,.105,s)*(1.-smoothstep(.90,1.,s));
  float core=(1.-smoothstep(.02,.20,abs(drift+.19)))*smoothstep(.42,.77,wet+(grainy-.5)*.24);
  gl_FragColor=vec4(.15+.18*grainy+.56*core,.11+.62*core,.60+.32*grainy,
    shape*ragged*tip*uOpacity);
}`;
const trialCloudPaint=`
${paintNoise}
float cloudGrain(vec2 p){
  vec2 a=floor(p),b=fract(p);
  b=b*b*(3.-2.*b);
  return mix(mix(grain(a),grain(a+vec2(1.,0.)),b.x),
    mix(grain(a+vec2(0.,1.)),grain(a+1.),b.x),b.y);
}
void main(){
  float x=vUv.x,h=vUv.y;
  float tooth=grain(vec2(x*195.+uSeed,h*81.));
  float flow=x+uTime*.013;
  float wet=cloudGrain(vec2(flow*12.+uSeed,h*2.88));
  float crease=cloudGrain(vec2(flow*26.+uSeed,h*7.28));
  float fiber=cloudGrain(vec2(flow*17.+uSeed,h*68.+crease*2.5));
  float edge=.015+.041*cloudGrain(vec2(flow*29.+uSeed,6.3));
  float heavy=smoothstep(edge,edge+.062,h)
    *(1.-smoothstep(.73+.15*wet,.99,h));
  float lip=smoothstep(edge*.58,edge+.018,h)*(1.-smoothstep(edge+.039,edge+.13,h));
  float fray=smoothstep(.61,.83,fiber+.22*(tooth-.5))*smoothstep(.35,.71,crease)
    *(1.-smoothstep(.26,.62,h));
  float reserve=clamp(lip*(.65+.32*crease)+fray*.76,0.,.92);
  float ends=smoothstep(.0,.105,x)*(1.-smoothstep(.885,1.,x));
  float side=ends*(.58+.42*smoothstep(.18,.81,wet));
  float alpha=side*max(heavy*(.84+.16*wet),lip*.78)*uOpacity;
  if(alpha<.012)discard;
  gl_FragColor=vec4(clamp(.020+.13*wet+.52*reserve,0.,1.),reserve,tooth,alpha);
}`;
const brushPaint=`
${paintNoise}
void main(){
  float x=vUv.x, y=2.*vUv.y-1.;
  float f=grain(vec2(x*93.,y*14.+uSeed));
  float tooth=grain(vec2(x*229.,y*31.));
  float taper=smoothstep(0.,.14,x)*(1.-smoothstep(.63,1.,x));
  float edge=1.-smoothstep(.40,.99,abs(y+(f-.5)*.23));
  float white=(1.-smoothstep(.17,.41,abs(y)))*.88;
  float alpha=edge*taper*(.52+.48*tooth)*uOpacity;
  gl_FragColor=vec4(.14+.76*white,white,.54+.36*f,alpha);
}`;
const fissurePaint=`
${paintNoise}
void main(){
  float s=vUv.x,d=2.*vUv.y-1.;
  float grainy=grain(vec2(s*107.,d*26.+uSeed));
  float spread=.7+.30*sin(s*22.+uSeed);
  float edge=(1.-smoothstep(.28,.98,abs(d+(grainy-.5)*.34)))*spread;
  float taper=smoothstep(0.,.12,s)*(1.-smoothstep(.79,1.,s));
  float reserve=(1.-smoothstep(.12,.43,abs(d-.32)))*.88;
  gl_FragColor=vec4(.17+.74*reserve,.91*reserve,grainy,edge*taper*uOpacity);
}`;
const risingPaint=`
${paintNoise}
void main(){
  float s=vUv.x, d=2.*vUv.y-1.;
  float f=grain(vec2(s*131.,d*45.+uSeed));
  float tooth=grain(vec2(s*77.,d*16.+uSeed*3.));
  float broken=smoothstep(.13,.75,sin(d*14.2+s*27.+uSeed)*.5+.5);
  float taper=smoothstep(.01,.21,s)*(1.-smoothstep(.75,.99,s));
  float edge=1.-smoothstep(.15,.95,abs(d+.24*(tooth-.5)));
  float reserve=(1.-smoothstep(.07,.48,abs(d-.21+.11*sin(s*21.))))*broken;
  float ink=.31+.54*reserve;
  gl_FragColor=vec4(ink,.20+.70*reserve,.48+.50*f,uOpacity*taper*edge*(.65+.35*f));
}`;
const ochrePaint=`
${paintNoise}
void main(){
  float s=vUv.x,d=2.*vUv.y-1.;
  float dry=grain(vec2(s*90.,d*47.+uSeed));
  float tooth=grain(vec2(s*37.,d*83.+uSeed*.25));
  float width=.41+.36*sin(s*2.65+.3)+.14*sin(s*13.7+uSeed);
  float spread=1.-smoothstep(width*.47,width,abs(d+.19*sin(s*15.)));
  float ends=smoothstep(.012,.15,s)*(1.-smoothstep(.79,1.,s));
  float speck=smoothstep(.11,.54,dry+.25*sin(d*25.+s*12.));
  float load=spread*ends*(.58+.42*speck);
  gl_FragColor=vec4(.29+.33*tooth,.06+.10*speck,.55+.41*dry,uOpacity*load);
}`;
const mistPaint=`
${paintNoise}
void main(){
  vec2 q=2.*vUv-1.;
  float f=grain(vec2(vUv.x*83.,vUv.y*47.+uSeed));
  float rip=.078*sin(q.x*18.+uSeed)+.06*sin(q.x*7.2+q.y*4.3-uTime*.44);
  float d=length(vec2(q.x,q.y+rip));
  float edge=(1.-smoothstep(.19,.91,d+.04*(f-.5)));
  float pigment=.27+.17*sin(q.x*4.7-q.y*5.4+uSeed);
  gl_FragColor=vec4(1.-pigment,.37+.42*edge,f,uOpacity*edge);
}`;
const pathPaint=`
${paintNoise}
void main(){
  float x=vUv.x, y=abs(vUv.y-.5)*2.;
  float f=grain(vec2(x*119.,y*46.+uSeed));
  float ends=smoothstep(0.,.17,x)*(1.-smoothstep(.83,1.,x));
  float hair=1.-smoothstep(.012,.054,abs(y-.76+.038*sin(x*47.)));
  float white=(1.-smoothstep(.23,.95,y))*(.44+.56*sin(x*3.14159));
  gl_FragColor=vec4(.62+.28*white,.45+.40*white,f,uOpacity*ends*(.40*hair+.62*white));
}`;
const texturePaint=`
uniform sampler2D uPaint;
uniform float uOpacity,uReveal,uReserve,uValue;
varying vec2 vUv;
void main(){
  vec4 c=texture2D(uPaint,vUv);
  float t=vUv.x;
  float edge=1.-smoothstep(uReveal-.025,uReveal+.015,t);
  gl_FragColor=vec4(uValue,uReserve,.62,c.a*uOpacity*edge);
}`;
const vermilionTransfer=`
${paintNoise}
uniform sampler2D uPaint;
uniform float uReveal;
void main(){
  vec2 uv=vUv;
  float fibre=grain(vec2(uv.x*133.,uv.y*89.));
  vec2 wobble=vec2(grain(uv*93.+2.7),grain(uv*84.+6.1))-.5;
  float shape=texture2D(uPaint,uv+.008*wobble).a;
  float swept=1.-smoothstep(uReveal-.09,uReveal+.011,uv.x+.17*uv.y+.047*(fibre-.5));
  float edge=texture2D(uPaint,uv+.012*normalize(uv-.5+vec2(.0001))).a;
  float print=shape*(.82+.18*fibre)+max(0.,edge-shape)*.19;
  float alpha=print*swept*uOpacity;
  if(alpha<.009)discard;
  gl_FragColor=vec4(.098+.19*fibre,.035+.12*fibre,fibre,alpha);
}`;
const metalVertex=`
varying vec3 vNorm,vPosition;
void main(){
  vPosition=position;
#ifdef USE_INSTANCING
  vNorm=normalize(mat3(modelViewMatrix)*mat3(instanceMatrix)*normal);
  gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
#else
  vNorm=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
#endif
}`;
const metalPaint=`
varying vec3 vNorm,vPosition;
void main(){
  float wash=.5+.5*sin(vPosition.x*79.+vPosition.y*8.5-vPosition.z*58.);
  float light=pow(max(0.,dot(normalize(vNorm),normalize(vec3(-.55,.80,.44)))),3.);
  float reserve=.30*light+.035*wash;
  gl_FragColor=vec4(.09+.27*light+.055*wash,reserve,.60,1.);
}`;
const debrisPaint=`
varying vec3 vNorm,vPosition;
uniform float uTile;
void main(){
  float edge=max(0.,dot(normalize(vNorm),normalize(vec3(-.66,.69,.47))));
  float knot=.48*sin(vPosition.y*52.+vPosition.x*8.2)+.25*sin(vPosition.y*109.+vPosition.z*14.);
  float cut=.54+.38*sin(vPosition.x*9.3+vPosition.z*7.8);
  float ink=mix(.28,.14,uTile)+edge*.28+mix(knot,cut,uTile)*.14;
  gl_FragColor=vec4(clamp(ink,.06,.72),.22*edge,.55+.24*cut,1.);
}`;

function wash(parent,geometry,fragment,{tint=null,seed=0,order=0}={}){
  const material=new THREE.ShaderMaterial({
    vertexShader:paintVertex,fragmentShader:fragment,side:THREE.DoubleSide,
    transparent:true,depthWrite:false,forceSinglePass:true,
    uniforms:{uOpacity:{value:0},uTime:{value:0},uSeed:{value:seed}},
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.visible=false;
  mesh.frustumCulled=false;
  mesh.renderOrder=order;
  if(tint)mesh.userData.inkTint=tint;
  mesh.userData.inkTintAmount=.81;
  mesh.userData.inkIdSuppressed=!tint;
  if(!mesh.userData.inkIdSuppressed){
    material.uniforms.uSurface={value:v()};
    const masked=fragment.replace(/gl_FragColor\s*=\s*([^;]+);/,
      'vec4 paint=$1; if(paint.a<.15)discard; gl_FragColor=vec4(uSurface,1.);');
    mesh.userData.inkSurfaceMaterial=new THREE.ShaderMaterial({
      vertexShader:paintVertex,fragmentShader:'uniform vec3 uSurface;\n'+masked,
      side:THREE.DoubleSide,uniforms:material.uniforms,
    });
  }
  parent.add(mesh);
  return mesh;
}

function opacity(mesh,value,time=0){
  mesh.visible=value>.008;
  mesh.material.uniforms.uOpacity.value=value;
  if(mesh.material.uniforms.uTime)mesh.material.uniforms.uTime.value=time;
}

function paintCanvas(w,h,draw){
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  draw(ctx);
  const texture=new THREE.CanvasTexture(canvas);
  texture.anisotropy=4;
  return texture;
}

function brushLabel(text,width,height,size){
  const family='"Tideborn Calligraphy","Kaiti SC","STKaiti","Songti SC",serif';
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.anisotropy=4;
  const draw=()=>{
    ctx.clearRect(0,0,width,height);
    ctx.font=size+'px '+family;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#000';
    const chars=Array.from(text),step=width/(chars.length+.32);
    chars.forEach((char,i)=>{
      ctx.save();
      ctx.translate(width*.5+(i-(chars.length-1)*.5)*step,height*.52+Math.sin(i*4)*height*.034);
      ctx.rotate(.047*Math.cos(i*1.8));
      ctx.fillText(char,0,0);
      ctx.restore();
    });
    texture.needsUpdate=true;
  };
  draw();
  if(document.fonts)document.fonts.load('64px "Tideborn Calligraphy"',text).then(draw,()=>{});
  return texture;
}

function inkDecal(parent,texture,w,h,position,tint,value,reserve=.09){
  const mesh=wash(parent,new THREE.PlaneGeometry(w,h),texturePaint,{tint,order:8});
  Object.assign(mesh.material.uniforms,{
    uPaint:{value:texture},uValue:{value:value},uReserve:{value:reserve},uReveal:{value:1.03},
  });
  mesh.position.copy(position);
  opacity(mesh,1);
  return mesh;
}

export function mountGateText(board){
  const plaque=inkDecal(board,brushLabel('南天门',960,210,181),5.14,1.12,v(0,11.47,-8.423),'#ab8752',.43,.35);
  plaque.rotation.y=Math.PI;
}

function thinStroke(parent,points,width,seed,tint,{fragment=brushPaint,horizontal=false,order=10}={}){
  const p=[],uv=[],indices=[];
  const total=points.length-1;
  for(let i=0;i<=total;i++){
    const next=points[Math.min(total,i+1)];
    const prev=points[Math.max(0,i-1)];
    const direction=next.clone().sub(prev);
    const lateral=(horizontal?v(-direction.z,0,direction.x)
      :v(direction.y,-direction.x,direction.x===0&&direction.y===0?1:0)).normalize();
    for(const s of [-1,1]){
      const pos=points[i].clone().addScaledVector(lateral,s*width);
      p.push(pos.x,pos.y,pos.z);
      uv.push(i/total,(s+1)*.5);
    }
    if(i<total){
      const k=2*i;
      indices.push(k,k+1,k+2,k+1,k+3,k+2);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);
  return wash(parent,geo,fragment,{seed,tint,order});
}

function fractureVeins(parent){
  const points=[
    v(-2.1,14.01,-11.32),v(-1.12,14.18,-11.33),v(-.49,13.89,-11.33),v(.18,14.02,-11.32),
    v(.72,13.39,-11.19),v(1.28,13.27,-10.83),v(1.77,12.40,-8.40),v(2.01,11.31,-8.04),
  ];
  return [
    thinStroke(parent,points,.34,31.4,'#7e5440',{fragment:fissurePaint}),
    thinStroke(parent,[points[3],v(.40,14.53,-10.23),v(.59,14.66,-8.66),v(-.31,14.95,-6.94),v(.35,15.59,-5.31)],
      .23,41.3,'#645044',{fragment:fissurePaint,horizontal:true}),
    thinStroke(parent,[points[2],v(-.89,13.42,-10.53),v(-.66,12.88,-9.47),v(-1.32,11.55,-8.53)],
      .14,51.3,'#6f5744',{fragment:fissurePaint}),
  ];
}

const roofDraftPaint=`
${paintNoise}
void main(){
  float s=vUv.x,d=2.*vUv.y-1.;
  float tooth=grain(vec2(s*97.+uSeed,d*48.));
  float tide=.16*sin(s*11.8-uTime*1.9+uSeed)+.09*sin(s*23.7+uSeed);
  float belly=.23+.59*sin(s*2.91+.23);
  float edge=1.-smoothstep(belly*.30,belly,abs(d-tide));
  float grainy=.46+.54*smoothstep(.15,.83,tooth+.21*sin(s*49.+d*25.));
  float bleed=.57+.43*smoothstep(.23,.72,.50+.31*sin(s*28.-uTime*3.1+uSeed)+.24*sin(s*57.+uSeed));
  float tip=smoothstep(0.,.12,s)*(1.-smoothstep(.61,1.,s));
  gl_FragColor=vec4(.41+.27*grainy,.23+.28*grainy,.47+.46*tooth,uOpacity*edge*bleed*tip*grainy);
}`;

function roofWind(parent){
  const lane=new THREE.Group();
  lane.name='断檐俯冲区 · 两道擦风';
  parent.add(lane);
  const {x,zMin,zMax}=STOMP_PAD;
  const sides=[-1,1].map(side=>{
    const run=(offset,lift,seed)=>{
      const sweep=Array.from({length:14},(_,i)=>{
        const t=i/13;
        const bow=Math.sin(Math.PI*t);
        return v(side*(x-offset-.38*bow**2),
          lift+.24*Math.sin(t*5.2+side*.4),lerp(zMin+.20,zMax-.18,t));
      });
      return thinStroke(lane,sweep,offset?.16:.37,seed,offset?'#c59b62':'#bd9b73',{
        fragment:roofDraftPaint,horizontal:true,order:11,
      });
    };
    const rail=run(0,0,27+side*8);
    const dry=run(.31,.035,39+side*5);
    return {rail,dry};
  });
  const drop=[
    thinStroke(parent,[v(.09,14.55,0),v(.02,15.01,-.13),v(.27,15.72,-.26),
      v(.19,16.36,-.38),v(.49,17.10,-.50),v(.82,17.48,-.72)],
      .53,57.2,'#c1a685',{fragment:roofDraftPaint,order:12}),
    thinStroke(parent,[v(-.25,14.83,-.13),v(-.49,15.35,-.24),v(-.44,15.92,-.26),
      v(-.80,16.81,-.39),v(-.73,17.20,-.51)],
      .31,39.4,'#b69b7b',{fragment:roofDraftPaint,order:12}),
    thinStroke(parent,[v(-.06,16.29,-.27),v(.14,16.72,-.31),v(.07,17.15,-.40),
      v(.43,17.68,-.54),v(.44,18.16,-.73)],
      .18,89.3,'#cbb18d',{fragment:roofDraftPaint,order:12}),
  ];
  return {lane,sides,drop};
}

function landingMarks(parent, fascia){
  const cleftPaint=`
  ${paintNoise}
  void main(){
    float s=vUv.x,d=2.*vUv.y-1.;
    float grainy=grain(vec2(s*119.,d*36.+uSeed));
    float center=.08*sin(s*16.+uSeed)+.05*sin(s*38.);
    float taper=smoothstep(0.,.10,s)*(1.-smoothstep(.90,1.,s));
    float core=1.-smoothstep(.34,.79,abs(d-center)*(1.+.26*grainy));
    float chipped=(1.-smoothstep(.055,.24,abs(d-center-.53)))*grainy;
    gl_FragColor=vec4(.15+.65*chipped,.035+.45*chipped,grainy,
      max(core,chipped*.58)*taper*uOpacity);
  }`;
  const chippedTimberPaint=`
  ${paintNoise}
  void main(){
    float s=vUv.x, d=vUv.y;
    float tooth=grain(vec2(s*146.,d*36.+uSeed));
    float splinter=smoothstep(.46,.81,sin(d*47.+sin(s*4.)*.57)*.5+.5)*tooth;
    float end=smoothstep(.00,.135,s)*(1.-smoothstep(.61,1.,s));
    float torn=.62+.16*sin(s*18.+uSeed)+.09*sin(s*49.);
    float edge=1.-smoothstep(torn*.89,torn+.26,abs(d-.52)*2.);
    float inner=smoothstep(.27,.77,edge*end);
    float fiber=inner*(.61+.27*tooth+.10*splinter);
    float rust=(1.-inner)*end*edge;
    gl_FragColor=vec4(.26+.58*fiber-.13*rust,.27+.58*fiber,tooth,
      clamp(end*edge*(.79+.24*tooth)*uOpacity,0.,1.));
  }`;
  const frontTimberPaint=`
  ${paintNoise}
  void main(){
    float s=vUv.x, d=vUv.y;
    float tooth=grain(vec2(s*165.,d*27.+uSeed));
    float tear=d*(.51+.38*sin(s*15.4+uSeed)+.19*sin(s*41.));
    float alpha=(1.-smoothstep(.25,.60,tear+d*.34))*
      smoothstep(0.,.14,s)*(1.-smoothstep(.56,1.,s));
    float grainy=.40+.25*tooth;
    gl_FragColor=vec4(grainy-.15*d,.23+.34*tooth-.20*d,tooth,alpha*uOpacity);
  }`;
  const rawCrownPaint=`
  ${paintNoise}
  uniform vec2 uPawSeat;
  void main(){
    vec2 p=vUv-uPawSeat;
    float dry=grain(vec2(vUv.x*172.,vUv.y*44.+uSeed));
    float time=uTime;
    vec2 q=vec2(p.x,p.y+.08+p.x*.17);
    float footing=length(q*vec2(6.9,2.35));
    float heel=1.-smoothstep(.27,.73,footing+.043*(dry-.5));
    float lip=1.-smoothstep(.035,.25,abs(footing-.94-.065*sin(p.y*28.)));
    float falloff=1.-smoothstep(.18,.34,abs(q.x)+(dry-.5)*.031);
    float feather=smoothstep(.24,.72,sin(p.y*111.+p.x*67.+uSeed)*.5+.5+.34*dry);
    float force=.46+.54*smoothstep(.01,.13,time);
    float powder=lip*feather*(.48+.52*(1.-smoothstep(.06,.28,time)));
    float shadow=heel*force*(.84+.16*dry);
    float amount=falloff*max(powder,shadow)*uOpacity;
    float reserve=(1.-heel)*(.39+.48*powder);
    float tone=mix(.12+.07*dry,.68+.27*feather,(1.-heel)*smoothstep(.0,.62,powder));
    gl_FragColor=vec4(tone,reserve,dry,clamp(amount*1.26,0.,1.));
  }`;
  // The irregular cut across the grain follows the beam crown into its near face.
  const score=thinStroke(parent,[v(.12,14.515,-11.27),v(.19,14.515,-11.05),
    v(-.075,14.515,-10.92),v(.070,14.515,-10.65),
    v(-.21,14.515,-10.39),v(-.08,14.515,-10.24),v(-.14,14.515,-9.98)],
    .205,39.1,'#452b22',{fragment:cleftPaint,horizontal:true,order:12});
  const face=thinStroke(parent,[v(.12,14.51,-11.28),v(-.087,14.30,-11.474),
    v(.12,14.12,-11.461),v(-.032,13.97,-11.451),v(.047,13.82,-11.438),
    v(-.20,13.77,-11.428)],.17,24.7,'#452b22',{fragment:cleftPaint,order:12});
  const seats=fascia.map(({root,side,pawSeat})=>{
    const {x,z}=pawSeat;
    const y=pawSeat.y-.065;
    const length=side<0?3.37:3.02;
    const inner=x-side*.66;
    const bevel=-.67;
    const rows=9;
    const sections=Array.from({length:rows},(_,index)=>{
      const s=index/(rows-1);
      const width=Math.sin(Math.PI*s)**.43;
      const rear=z+.52*width+.09*Math.sin(s*12.+side);
      const edgeFront=bevel+(1-width)*.35+.10*Math.sin(s*24.+side)**2;
      const edgeX=inner+side*s*length;
      return {
        crown:[v(edgeX,y,edgeFront),v(edgeX,y-.003,rear)],
        face:[v(edgeX,y,bevel-.014),v(edgeX,.156,-.879),
          v(edgeX,.115-.43*width,-.879)],
      };
    });
    const chipSurface=(face,fragment,tint)=>{
      const points=[],uv=[],indices=[];
      const columns=sections[0][face].length;
      for(const [index,row] of sections.entries()){
        for(const [edge,point] of row[face].entries()){
          points.push(...point.toArray());
          uv.push(index/(rows-1),edge/(columns-1));
        }
        if(index===rows-1)continue;
        for(let edge=0;edge<columns-1;edge++){
          const start=index*columns+edge;
          indices.push(start,start+1,start+columns,start+1,start+columns+1,start+columns);
        }
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);
      return wash(root,geometry,fragment,{seed:68.5+side*12,tint,order:11});
    };
    const surfaces=[chipSurface('crown',chippedTimberPaint,'#b16641'),
      chipSurface('face',frontTimberPaint,'#a85a39')];
    for(const surface of surfaces)surface.userData.inkTintAmount=1;
    // The dark crushed bed and its pale broken rim inherit the same
    // deformed crown strip the skinned foreclaws are pressing.
    const raw=chipSurface('crown',rawCrownPaint,'#9f805f');
    raw.name='梁面承爪 · 压痕与飞白';
    raw.renderOrder=12;
    raw.userData.inkTintAmount=.78;
    const seat=(.66+beamPawSpread)/length;
    const row=seat*(rows-1);
    const index=Math.floor(row);
    const [front,back]=sections[index].crown.map(({z},edge)=>
      lerp(z,sections[index+1].crown[edge].z,row-index));
    raw.material.uniforms.uPawSeat={value:new THREE.Vector2(seat,(z-front)/(back-front))};
    const fibers=[
      thinStroke(root,[v(x-side*.36,y+.011,z-.18),v(x+side*.42,y+.011,z-.19),
        v(x+side*.88,y+.011,z-.22),v(x+side*1.72,y+.011,z-.32)],.041,29.7+side,
        '#814635',{fragment:cleftPaint,horizontal:true,order:12}),
      thinStroke(root,[v(x-side*.34,y+.011,z+.09),v(x+side*.27,y+.011,z+.12),
        v(x+side*.72,y+.011,z+.07),v(x+side*1.46,y+.011,z+.20)],.035,22.3+side,
        '#814e32',{fragment:cleftPaint,horizontal:true,order:12}),
    ];
    const powder=Array.from({length:2},(_,index)=>{
      const offset=.10*index;
      return thinStroke(root,[v(x-side*.42,y+.029,z+offset-.10),
        v(x+side*.27,y+.14+offset,z+offset-.10),v(x+side*.95,y+.18+offset,z+offset+.04),
        v(x+side*1.52,y+.28+offset,z+offset+.12)],.092-index*.015,79.4+index*8.1+side,
        '#ab7750',{fragment:risingPaint,horizontal:true,order:13});
    });
    return {side,surfaces,raw,fibers,powder};
  });
  const goldenWind=[];
  for(let i=0;i<5;i++){
    const p=Array.from({length:14},(_,j)=>{
      const t=j/13;
      return v(12.4-(12.1+i*.13)*t, 21.85-6.88*t+.8*Math.sin(t*Math.PI)+i*.10,
        -15.62+5.36*t-1.34*Math.sin(t*Math.PI)+i*.26);
    });
    goldenWind.push(thinStroke(parent,p,.28-.034*i,49+i*4.23,'#ad7952',{
      fragment:ochrePaint,horizontal:true,order:8,
    }));
  }
  return {goldenWind,face,score,seats,guide:roofWind(parent),armedAt:null};
}

function lightning(parent){
  const rng=random(83925);
  const root=new THREE.Group();
  parent.add(root);
  const p=Array.from({length:14},(_,i)=>{
    const t=i/13,wave=Math.sin(t*Math.PI);
    return v((.5-rng())*wave*3.8+1.35*t,t*21.4,(.5-rng())*wave*1.4);
  });
  const branches=[thinStroke(root,p,.24,20.1,'#4b5454')];
  for(const [index,side,run] of [[3,1,3],[6,-1,4],[8,1,5],[10,-1,4]]){
    const start=p[index];
    const points=Array.from({length:6},(_,i)=>{
      const t=i/5;
      return start.clone().add(v(side*run*t+Math.sin(i*4.7)*.37*t,t*(3.3+run),-.76*t));
    });
    branches.push(thinStroke(root,points,.091,25+index,'#5b5e58'));
  }
  const leaders=[-1,0,1].map((side,i)=>{
    const points=p.map((point,index)=>{
      const height=index/(p.length-1);
      return v(point.x*.72+side*(.19+height*1.79)+.15*Math.sin(index*1.72+i),
        point.y*.72,point.z*.80+side*height*.48);
    });
    return thinStroke(root,points,i===1?.21:.10,28.4+i*5.7,'#a85c47',{fragment:lockChargePaint,order:11});
  });
  return {root,branches,leaders};
}

function horizontalLightning(parent,seed){
  const rng=random(seed);
  const strokes=[];
  for(let lane=0;lane<3;lane++){
    const points=Array.from({length:14},(_,i)=>{
      const t=i/13;
      return v((t-.5)*(35+lane*2),lane*.62+(rng()-.5)*1.35+Math.sin(t*7.45)*.36,
        lane*2.26+(rng()-.5)*1.7);
    });
    strokes.push(thinStroke(parent,points,lane===1?.28:.125,seed+lane*3,null));
  }
  return strokes;
}

function trialCloud(upper, depth) {
  const positions=[], uv=[], faces=[];
  const columns=48, rows=12;
  const direction=upper?1:-1;
  const front=depth===0;
  for(let i=0;i<=columns;i++){
    const x=lerp(-27.6,27.6,i/columns);
    const side=upper?-1:1;
    const shoulder=Math.exp(-((x-side*(upper?12.7:14.4))**2)/(upper?95:119));
    const taper=.22+.67*shoulder+.12*Math.cos(x*.072);
    const pocket=upper
      ? .64+.31*Math.sin(x*.137-.8)+.28*Math.sin(x*.319+1.3)
      : .51+.29*Math.sin(x*.173+1.1)+.21*Math.sin(x*.43+2.1);
    const frontZ=-(front?28.35:21.8)+side*.185*x+1.82*Math.sin(x*.112+depth*1.6);
    for(let j=0;j<=rows;j++){
      const h=j/rows;
      const depthFold=upper?4.45*Math.sin(h*1.52):3.79*h;
      const coarse=.14*Math.sin(x*.53+h*4.9)+.085*Math.sin(x*1.17+h*12.5);
      const billow=Math.min(1,Math.max(0,h*2.1));
      const outward=Math.pow(h,.83)*(front?(upper?2.59:2.70):1.78)*taper;
      const offset=(front?.086:.21)+pocket*(front?.14:.36)+outward+coarse*billow;
      positions.push(x,direction*(-1+offset),frontZ+depthFold+.60*billow*Math.sin(x*.228+depth*1.9));
      uv.push(i/columns,h);
      if(!i||!j)continue;
      const a=(i-1)*(rows+1)+j-1,b=i*(rows+1)+j-1;
      faces.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(faces);
  return geometry;
}

function stormVolume(parent,index){
  const root=new THREE.Group();
  const upper=index===1;
  root.name=upper?'上重雷 · 危险高度':'下重雷 · 危险高度';
  parent.add(root);
  const banks=[1,0].map(depth=>wash(root,trialCloud(upper,depth),trialCloudPaint,{
    seed:21.3+index*13.7+depth*7.2,
    tint:upper?'#536568':'#344d55',
    order:9+depth+(upper?2:0),
  }));
  return {root,banks,bolts:horizontalLightning(parent,4101+index*227)};
}

function lockBoundary(parent){
  const parts=[];
  for(const height of [-4.25,4.25]){
    for(let arc=0;arc<3;arc++){
      const full=arc*TAU/3;
      const points=Array.from({length:21},(_,i)=>{
        const a=full+.16+i/20*1.52;
        return v(Math.cos(a),height,Math.sin(a));
      });
      parts.push(thinStroke(parent,points,.022,61+arc*4+height,'#9c5142',{
        fragment:layerInk,horizontal:true,order:9,
      }));
    }
  }
  return parts;
}

const trialSillPaint=`
${paintNoise}
void main(){
  vec2 d=vUv*2.-1.;
  float grainy=grain(vec2(d.x*70.+uSeed,d.y*141.));
  float lift=1.-smoothstep(.14,.90,length(vec2(d.x,d.y*.92)));
  float fiber=.77+.23*grainy;
  float alpha=lift*fiber*uOpacity;
  if(alpha<.012)discard;
  gl_FragColor=vec4(.90+.08*grainy,.81,grainy,alpha);
}`;

function trialThresholdLight(parent){
  const root=new THREE.Group();
  root.name='雷隙落在天门的光';
  parent.add(root);
  // Spill along the closed leaves and their load-bearing columns. The
  // pigment reveals a lit destination below the eaves as the clouds build.
  return [[-2.92,2.83,2.91,.56],[2.92,2.83,2.91,.54],[-6.18,.63,3.75,.39],[6.18,.63,3.75,.31]]
    .map(([x,width,height,gain],i)=>{
      const mesh=wash(root,new THREE.PlaneGeometry(2,2),trialSillPaint,{seed:26.7+i*4,order:8});
      mesh.position.set(x,i<2?5.42:5.61,i<2?-7.95:-9.32);
      mesh.scale.set(width,height,1);
      return {mesh,gain};
    });
}

function cloud(parent,n,seed,tint){
  return Array.from({length:n},(_,i)=>wash(parent,new THREE.PlaneGeometry(2,2),mistPaint,{
    seed:seed+i*5.23,tint,order:3+i%3,
  }));
}

const rainTallyPaint=`
varying vec3 vNormal,vPosition;
void main(){
  vec3 normal=normalize(vNormal);
  float light=.36+.64*max(0.,dot(normal,normalize(vec3(-.44,.68,.55))));
  float grain=.50+.34*sin(vPosition.y*21.+sin(vPosition.x*33.)*.70)+.10*sin(vPosition.y*99.);
  float edge=smoothstep(.32,.55,abs(vPosition.x));
  float pigment=.19+.22*light+.06*grain-.11*edge;
  gl_FragColor=vec4(pigment,.31*light,grain,1.);
}`;

function rainTally(parent, podium){
  const root=new THREE.Group();
  root.name='司雨玉符';
  parent.add(root);
  const vertices=`varying vec3 vNormal,vPosition;void main(){vPosition=position;
    vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const jade=new THREE.ShaderMaterial({vertexShader:vertices,fragmentShader:rainTallyPaint});
  const plateShape=new THREE.Shape([
    new THREE.Vector2(-.51,-.77),new THREE.Vector2(.51,-.77),new THREE.Vector2(.56,-.61),
    new THREE.Vector2(.56,.63),new THREE.Vector2(.42,.81),new THREE.Vector2(.20,.83),
    new THREE.Vector2(.02,.99),new THREE.Vector2(-.22,.83),new THREE.Vector2(-.42,.81),
    new THREE.Vector2(-.56,.63),new THREE.Vector2(-.56,-.61),
  ]);
  const pin=new THREE.Path();
  pin.absarc(0,.64,.097,0,TAU,true);
  plateShape.holes.push(pin);
  const plateMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape,{
    depth:.14,bevelEnabled:true,bevelThickness:.047,bevelSize:.054,bevelSegments:2,curveSegments:9,steps:1,
  }).translate(0,0,-.07),jade);
  plateMesh.userData.inkTint='#83a495';
  plateMesh.userData.inkTintAmount=.91;
  plateMesh.userData.inkMineralHold=.43;
  root.add(plateMesh);
  const engraving=paintCanvas(192,290,ctx=>{
    ctx.lineCap='round';
    ctx.strokeStyle='#000';
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.moveTo(26,32);ctx.lineTo(23,236);ctx.quadraticCurveTo(27,258,55,258);
    ctx.lineTo(138,258);ctx.quadraticCurveTo(165,257,167,233);ctx.lineTo(168,32);
    ctx.stroke();
    ctx.lineWidth=9;
    ctx.beginPath();
    ctx.moveTo(46,112);ctx.bezierCurveTo(48,70,80,80,83,121);
    ctx.bezierCurveTo(89,152,113,130,112,113);
    ctx.bezierCurveTo(107,78,141,73,148,113);
    ctx.moveTo(67,144);ctx.bezierCurveTo(51,164,51,202,65,219);
    ctx.moveTo(96,151);ctx.bezierCurveTo(103,179,81,190,94,226);
    ctx.moveTo(132,144);ctx.bezierCurveTo(142,166,123,194,133,212);
    ctx.stroke();
  });
  const relief=inkDecal(root,engraving,.94,1.32,v(0,-.02,.127),'#3d5750',.21,.12);
  relief.renderOrder=9;
  const silk=new THREE.Group();
  silk.position.set(0,.64,.144);
  root.add(silk);
  const ties=[-1,1].map(side=>thinStroke(silk,[
    v(0,0,0),v(.11*side,.14,.045),v(.34*side,-.04,.08),v(.46*side,-.26,.14),
    v(.61*side,-.44,.13),v(.66*side,-.63,.14),
  ],.033,131+side*2,'#a2513e',{order:10}));
  const seat=new THREE.Group();
  // The side rest shares the wooden table and receives the tally before
  // the new rain office is granted.
  seat.position.set(-2.36,.66,-.22);
  podium.add(seat);
  for(const [size,position,tint] of [
    [[1.28,.12,.85],[0,.06,0],'#745340'],
    [[1.16,.10,.15],[0,.14,-.31],'#886951'],
    [[1.16,.10,.15],[0,.14,.31],'#886951'],
  ]){
    const wood=new THREE.Mesh(new THREE.BoxGeometry(...size),jade);
    wood.position.set(...position);
    wood.userData.inkTint=tint;
    wood.userData.inkTintAmount=.83;
    seat.add(wood);
  }
  root.visible=false;
  seat.visible=false;
  return {root,silk,ties,seat};
}

function presentRainTally(tally,finale){
  const {root,silk,seat}=tally;
  const audience=finale?.phase==='audience';
  const blessing=finale?.phase==='blessing';
  const age=finale?.age??0;
  root.visible=(audience&&age>3.13)||(blessing&&age<.93);
  seat.visible=audience ? age>3.13 : blessing;
  if(!root.visible)return;
  const time=audience ? age-COURT_SEAL_AT : .85+age;
  const rise=settle(time,.045,.52);
  const receive=settle(time,.28,.73);
  const release=settle(time,.80,1.57);
  const turn=settle(time,.21,.65);
  const rest=1-rise;
  const crownArc=Math.sin(Math.PI*rise)*(1-receive);
  root.position.set(-2.36*rest+lerp(-1.92,-1.20,receive)*rise-.30*release,
    lerp(3.27,5.88,rise)-.16*receive+.50*crownArc+1.24*release,
    lerp(15.29,14.24,rise)-.56*receive-.56*release);
  root.rotation.set(lerp(-1.36,-.06,rise)+.22*release,
    Math.PI+lerp(.44,-.24,turn)+.78*release,lerp(.17,-.15,receive)-.25*release);
  root.scale.setScalar(lerp(.61,.69,rise)*(1-.98*settle(time,1.20,1.72)));
  silk.rotation.z=.15*Math.sin(time*12.3)*rise+.68*release;
  silk.rotation.x=-.24*Math.sin(time*7.84)*rise+.45*release;
  for(const tie of tally.ties)opacity(tie,.84,time);
}

function courtPaper(parent){
  const podium=new THREE.Group();
  podium.position.set(0,2.54,15.52);
  parent.add(podium);
  const woodMaterial=new THREE.ShaderMaterial({
    vertexShader:`
    varying vec3 N,P;
    void main(){P=position;N=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
    varying vec3 N,P;
    void main(){
      float g=.5+.5*sin(P.x*7.7+P.y*74.1+P.z*6.);
      float l=max(0.,dot(normalize(N),normalize(vec3(.26,.71,.5))));
      gl_FragColor=vec4(.21+.17*l+.052*g,.13,g,1.);
    }`,
  });
  const wood=(width,height,depth,x,y,z,tint='#573f34')=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),woodMaterial);
    mesh.position.set(x,y,z);mesh.userData.inkTint=tint;mesh.userData.inkTintAmount=.71;
    podium.add(mesh);
    return mesh;
  };
  wood(5.6,.37,2.8,0,.34,0);
  wood(5.42,.22,2.68,0,.54,0,'#85513c');
  wood(5.24,.08,.19,0,.20,-1.39,'#936e48');
  for(const side of [-1,1]){
    wood(.42,1.54,1.35,side*2.18,-.5,.02);
    wood(.83,.16,2.13,side*2.18,-1.23,.02);
  }
  const upright=new THREE.Group();
  upright.position.set(0,1.61,-.71);
  upright.rotation.set(-.24,Math.PI,0,'YXZ');
  podium.add(upright);
  const texture=paintCanvas(512,210,ctx=>{
    const rng=random(5537);
    ctx.fillStyle='#000';
    ctx.beginPath();ctx.moveTo(3,8);
    for(let i=0;i<18;i++)ctx.lineTo(i*30,6+rng()*5);
    ctx.lineTo(507,203);
    for(let i=17;i>=0;i--)ctx.lineTo(i*30,197+rng()*6);
    ctx.closePath();ctx.fill();
  });
  const paper=inkDecal(upright,texture,5.1,1.83,v(),'#c9ad72',.81,.26);
  const paperGrain=paintCanvas(512,210,ctx=>{
    const rng=random(6029);
    for(let i=0;i<680;i++){
      const x=6+rng()*500,y=7+rng()*194;
      ctx.fillStyle=`rgba(10,0,0,${.09+rng()*.20})`;
      ctx.fillRect(x,y,1+rng()*8,.35+rng()*.95);
    }
  });
  const threads=inkDecal(upright,paperGrain,5.10,1.83,v(0,0,.014),'#8c674b',.49,.05);
  const heading=inkDecal(upright,brushLabel('封神榜',780,210,171),2.95,.67,v(.03,.52,.038),'#534234',.14,.06);
  const characters=inkDecal(upright,brushLabel('司雨应龙',980,210,157),4.40,.91,v(.18,-.19,.063),'#46332b',.12,.035);
  paper.renderOrder=7;
  characters.renderOrder=9;
  const sealTexture=paintCanvas(96,96,ctx=>{
    ctx.strokeStyle='#000';ctx.lineWidth=6;
    ctx.strokeRect(9,8,77,77);
    ctx.beginPath();ctx.moveTo(29,35);ctx.lineTo(68,36);ctx.moveTo(29,54);ctx.lineTo(69,55);
    ctx.moveTo(48,20);ctx.lineTo(46,70);ctx.lineTo(57,74);ctx.stroke();
  });
  const seal=wash(upright,new THREE.PlaneGeometry(.60,.60),vermilionTransfer,{seed:4.32,tint:'#a03d29',order:10});
  Object.assign(seal.material.uniforms,{uPaint:{value:sealTexture},uReveal:{value:0}});
  seal.position.set(-1.89,-.49,.035);
  const ties=[-1,1].map(side=>{
    const swivel=new THREE.Group();
    swivel.position.set(side*2.32,.58,.09);
    upright.add(swivel);
    const cord=thinStroke(swivel,[v(0,0,0),v(.05*side,-.29,.03),v(-.03*side,-.57,.05),
      v(.08*side,-.88,.06),v(.14*side,-1.15,.09)],.028,17.2+side*5.7,'#95583f',{order:10});
    const knots=[0,1,2].map(i=>wood(.075,.16+.025*i,.06,0,0,0,'#9e5040'));
    for(let i=0;i<knots.length;i++){
      swivel.add(knots[i]);
      knots[i].position.set(side*(.13+.035*i),-1.11-.059*i,.077+.019*i);
      knots[i].rotation.z=side*(.05+i*.19);
    }
    return {side,swivel,cord};
  });
  const stamp=new THREE.Group();
  stamp.name='司雨应龙册封朱印';
  stamp.position.copy(seal.position);
  const jewel=(geometry,y,tint,reserve)=>{
    const material=new THREE.ShaderMaterial({
      vertexShader:`varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 n;void main(){float lit=max(0.,dot(normalize(n),vec3(-.42,.67,.61)));gl_FragColor=vec4(.18+.27*lit,${reserve}+.10*lit,.62,1.);}`,
    });
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.y=y;
    mesh.userData.inkTint=tint;
    mesh.userData.inkTintAmount=.78;
    stamp.add(mesh);
  };
  jewel(new THREE.BoxGeometry(.57,.16,.57),.085,'#8f473a','.06');
  jewel(new THREE.BoxGeometry(.47,.13,.47),.22,'#a6654a','.09');
  jewel(new THREE.SphereGeometry(.15,10,7).scale(.88,1.37,.88),.40,'#59685b','.12');
  stamp.visible=false;
  upright.add(stamp);
  const stampWash=wash(upright,new THREE.PlaneGeometry(2,2),mistPaint,{seed:56.3,tint:'#a05240',order:9});
  stampWash.position.copy(seal.position);
  stampWash.position.z=.028;
  return {podium,upright,paper,heading,characters,seal,threads,stamp,stampWash,ties,tally:rainTally(parent,podium)};
}

function longLinks(parent){
  const geo=new THREE.TorusGeometry(1,.155,7,22).rotateZ(Math.PI*.5).scale(.53,.91,1);
  const material=new THREE.ShaderMaterial({vertexShader:metalVertex,fragmentShader:metalPaint});
  const mesh=new THREE.InstancedMesh(geo,material,152);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  mesh.userData.inkTint='#4b4339';
  mesh.userData.inkTintAmount=.74;
  mesh.visible=false;
  parent.add(mesh);
  return mesh;
}

function forgedCuffs(parent){
  const iron=new THREE.ShaderMaterial({
    vertexShader:forgedGateVertex,fragmentShader:forgedGateFragment,
    uniforms:{uGlint:{value:0},uJaw:{value:0}},
  });
  // The contact flash still reaches the iron lip on the same ankle cue.
  const ankleIron=iron.clone();
  ankleIron.uniforms.uGateGlint={value:0};
  ankleIron.uniforms.uGlint=ankleIron.uniforms.uGateGlint;
  ankleIron.uniforms.uJaw.value=.40;
  const wingIron=iron.clone();
  wingIron.uniforms.uJaw.value=.73;
  const bevel=(outline,width)=>{
    const shape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
    return new THREE.ExtrudeGeometry(shape,{
      depth:width,bevelEnabled:true,bevelThickness:.031,bevelSize:.039,bevelSegments:2,steps:1,
    }).translate(0,0,-width*.5);
  };
  const jawOutline=[
    [-.88,.11],[-.78,.49],[-.59,.71],[-.27,.83],[.16,.84],[.54,.70],[.77,.45],
    [.82,.15],[.73,.012],[.63,.12],[.63,.29],[.48,.53],[.20,.63],[-.19,.62],
    [-.45,.49],[-.59,.23],[-.70,.04],
  ];
  const pinX=-.79,pinY=.22;
  const jawsGeo=[-1,1].map(sign=>bevel(jawOutline.map(([x,y])=>[x-pinX,sign*(y-pinY)]),.18));
  const wingJawOutline=[
    [-.88,.11],[-.85,.46],[-.56,.78],[-.25,.90],[.21,.91],[.61,.74],[.86,.48],
    [.97,.15],[.95,-.025],[.73,-.025],[.71,.23],[.51,.50],[.18,.67],[-.20,.66],
    [-.48,.52],[-.64,.33],[-.66,.055],
  ];
  const wingJaws=[-1,1].map(sign=>bevel(
    wingJawOutline.map(([x,y])=>[x-pinX,sign*(y-pinY)]),.235));
  const tongueGeo=new THREE.BoxGeometry(.20,.16,.183);
  const palmGeo=bevel([[-1.28,-.13],[-1.19,-.24],[-.75,-.34],[-.59,-.25],[-.59,.25],[-.75,.34],[-1.19,.24],[-1.28,.13]],.22);
  const rivetGeo=new THREE.CylinderGeometry(.122,.133,.29,7).rotateX(Math.PI*.5);
  const eyeGeo=new THREE.TorusGeometry(.35,.083,6,15).scale(1.16,.66,1).rotateX(Math.PI*.36);
  const flangeGeo=bevel([[-.31,-.43],[.27,-.43],[.34,-.30],[.34,.32],[.20,.45],[-.21,.45],[-.34,.31],[-.34,-.28]],.12);
  const stapleGeo=new THREE.TorusGeometry(.23,.088,7,14).scale(.75,1,1).rotateY(Math.PI*.36);
  const stapleBoltGeo=new THREE.CylinderGeometry(.067,.073,.13,6).rotateX(Math.PI*.5);
  const piece=(holder,geometry,x,y,z,tint='#514a40',material=iron)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);
    mesh.userData.inkTint=tint;
    mesh.userData.inkTintAmount=.84;
    holder.add(mesh);
    return mesh;
  };
  return [-1,1].map(side=>{
    const root=new THREE.Group();
    root.name=side<0?'天锁 · 踝爪':'天锁 · 缚翼爪';
    root.visible=false;
    parent.add(root);
    piece(root,palmGeo,0,0,0);
    piece(root,eyeGeo,-1.45,0,0,'#77614d');
    const jaws=[-1,1].map((sign,i)=>{
      const jaw=new THREE.Group();
      jaw.position.set(pinX,sign*pinY,0);
      root.add(jaw);
      piece(jaw,side<0?jawsGeo[i]:wingJaws[i],0,0,0,side<0?'#4f4d3e':'#675647',side<0?ankleIron:wingIron);
      if(side>0&&sign>0){
        const tongue=piece(jaw,tongueGeo,.865-pinX,-.017-pinY,.139,'#aa8960',wingIron);
        tongue.name='缚翼扣 · 掣舌';
      }
      piece(root,rivetGeo,pinX,sign*pinY,0,'#96744c');
      return jaw;
    });
    const staple=new THREE.Group();
    staple.name='前柱锁链扣眼';
    staple.position.set(side*6.713,1.61,-11.14);
    staple.visible=false;
    parent.add(staple);
    piece(staple,flangeGeo,0,0,.05,'#655040');
    piece(staple,stapleGeo,0,0,-.11,'#876c4e');
    for(const y of [-.30,.29])piece(staple,stapleBoltGeo,0,y,-.06,'#91734f');
    return {side,root,jaws,staple,jawIron:side<0?ankleIron:wingIron,target:v(),axial:v(),along:v(),across:v(),eye:v(),basis:new THREE.Matrix4()};
  });
}

function brokenSection(tile){
  const profile=tile?[[-.53,-.45],[-.31,-.54],[.39,-.43],[.51,.08],[.24,.48],[-.21,.53],[-.55,.19]]
    :[[-.50,-.32],[-.40,-.43],[-.35,-.25],[.47,-.33],[.52,.23],[.21,.48],[-.06,.28],[-.45,.30]];
  const n=profile.length,p=[],indices=[];
  for(const side of [-1,1])for(const [j,[a,b]] of profile.entries()){
    p.push(tile?a:side*(.5+.15*Math.sin(j*11.7)),tile?side*.5+.37*(1-a*a):a,
      tile?b: b+.17*side*Math.sin(j*4.9));
  }
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    indices.push(i,j,i+n,j,j+n,i+n);
    if(i>0&&i<n-1)indices.push(0,i+1,i,n,i+n,i+n+1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setIndex(indices);
  const flat=geo.toNonIndexed();
  geo.dispose();flat.computeVertexNormals();
  return flat;
}

function rubble(parent,tile){
  const geom=brokenSection(tile);
  const material=new THREE.ShaderMaterial({
    vertexShader:metalVertex,fragmentShader:debrisPaint,side:THREE.DoubleSide,
    uniforms:{uTile:{value:Number(tile)}},
  });
  const mesh=new THREE.InstancedMesh(geom,material,tile?52:23);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  mesh.userData.inkTint=tile?'#4a4540':'#855f46';
  mesh.userData.inkTintAmount=tile?.34:.88;
  mesh.visible=false;
  parent.add(mesh);
  const rng=random(tile?167307:913317);
  const fragments=Array.from({length:mesh.count},(_,i)=>{
    const close=i<8;
    const sign=i%2?1:-1;
    const x=sign*(close?.2+rng()*2.15:2.4+rng()*(tile?9.8:4.9));
    const depth=close?(rng()-.5)*1.25:1.2+rng()*(tile?7.1:3.4);
    return {
      x,z:-10.4+depth,y:14.44+(close?0:depth*.24),
      vx:sign*(.58+rng()*2.7+Math.abs(x)*.20),vy:close?.38+rng()*1.4:1.1+rng()*2.15,
      vz:-.37-rng()*(close?1.8:3.8),
      size:close?.13+rng()*.29:tile?.15+rng()*.44:.26+rng()*.56,
      time:.105+Math.abs(x)*.028+depth*.036+rng()*.10,spin:rng()*6.4,
    };
  });
  return {mesh,fragments,tile};
}

const beamKeyPaint=`
varying vec3 vNorm,vPosition;
void main(){
  float light=max(0.,dot(normalize(vNorm),normalize(vec3(-.62,.67,.42))));
  float grain=.44+.35*sin(vPosition.y*78.+vPosition.x*12.)+.15*sin(vPosition.y*129.);
  float exposed=smoothstep(.018,.12,vPosition.z);
  gl_FragColor=vec4(.074+.17*light+.16*exposed+.075*grain,.034+.18*exposed,.58+.25*grain,1.);
}`;
const beamSocketPaint=`
${paintNoise}
void main(){
  vec2 edge=abs(vUv*2.-1.);
  float tooth=grain(vec2(vUv.x*44.+uSeed,vUv.y*27.));
  float cut=max(edge.x+.14*edge.y,edge.y+.10*edge.x);
  float rim=smoothstep(.53,.76,cut)*(1.-smoothstep(.77,.97,cut));
  float alpha=(1.-smoothstep(.79,.98,cut+(tooth-.5)*.12))*uOpacity;
  gl_FragColor=vec4(.065+rim*(.35+.21*tooth),.02+.57*rim,.62,alpha);
}`;

function beamKeys(parent, fascia){
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape([
    new THREE.Vector2(-.25,.23),new THREE.Vector2(.27,.18),new THREE.Vector2(.19,-.26),new THREE.Vector2(-.15,-.29),
  ]),{depth:.3,bevelEnabled:true,bevelSize:.027,bevelThickness:.028,bevelSegments:1,steps:1}).translate(0,0,-.18);
  const material = new THREE.ShaderMaterial({
    vertexShader:metalVertex,fragmentShader:beamKeyPaint,side:THREE.DoubleSide,
  });
  return fascia.map(beam=>{
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = '檐梁前楔';
    mesh.userData.inkTint = '#52352b';
    mesh.userData.inkTintAmount = .94;
    mesh.visible = false;
    parent.add(mesh);
    const socket=wash(parent,new THREE.PlaneGeometry(.60,.56),beamSocketPaint,
      {seed:16.5+beam.side*2.1,tint:'#6c4940',order:11});
    return {beam,mesh,socket,release:beam.side<0?.19:.34};
  });
}

const tornWoodPaint=`
${paintNoise}
void main(){
  float run=vUv.x,edge=abs(vUv.y*2.-1.);
  float tooth=grain(vec2(run*43.+uSeed,vUv.y*9.));
  float strip=sin(vUv.y*18.+.57*sin(run*13.+uSeed))*.5+.5;
  float reserve=smoothstep(.18,.83,strip+.19*(tooth-.5));
  float uneven=1.-smoothstep(.60,.99,edge+(tooth-.5)*.17);
  float tip=1.-smoothstep(.84,1.,run+.06*(tooth-.5));
  gl_FragColor=vec4(.15+.58*reserve,.14+.51*reserve,tooth,
    uneven*tip*(.72+.28*tooth)*uOpacity);
}`;
const tearStations=8;

function grainRibbon(parent,seed){
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.Float32BufferAttribute(new Float32Array(tearStations*6),3);
  const uv=[],index=[];
  for(let i=0;i<tearStations;i++){
    const u=i/(tearStations-1),j=i*2;
    uv.push(u,0,u,1);
    if(i<tearStations-1)index.push(j,j+1,j+2,j+1,j+3,j+2);
  }
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',position);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(index);
  const ribbon=wash(parent,geometry,tornWoodPaint,{seed,tint:'#937050',order:12});
  return ribbon;
}

function brokenGrain(parent){
  const group=new THREE.Group();
  group.name='檐梁断纤与木屑';
  parent.add(group);
  const strands=[
    {from:[14.45,-11.28],to:[14.28,-11.42],width:.097,fail:.107,x:-.08},
    {from:[14.19,-11.46],to:[14.38,-11.40],width:.192,fail:.210,x:.09},
    {from:[14.06,-11.43],to:[13.94,-11.48],width:.067,fail:.151,x:-.12},
    {from:[13.92,-11.43],to:[14.13,-11.42],width:.136,fail:.224,x:.03},
    {from:[14.37,-10.65],to:[14.42,-11.22],width:.078,fail:.270,x:.16},
  ].map((strand,i)=>({
    ...strand,phase:1.37*i,wide:grainRibbon(group,20.8+i*1.71),
    loose:[grainRibbon(group,18.7+i*1.6),grainRibbon(group,43.9+i*1.2)],
    a:v(),b:v(),burst:v(),
  }));
  const chips=new THREE.InstancedMesh(brokenSection(false),new THREE.ShaderMaterial({
    vertexShader:metalVertex,fragmentShader:debrisPaint,side:THREE.DoubleSide,
    uniforms:{uTile:{value:0}},
  }),strands.length);
  chips.name='断口长木屑';
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chips.frustumCulled=false;
  chips.userData.inkTint='#9a7454';
  chips.userData.inkTintAmount=.86;
  group.add(chips);
  group.visible=false;
  return {group,strands,chips,to:v(),temp:v(),chipPose:new THREE.Object3D()};
}

function boltReceivers(parts){
  const iron=new THREE.MeshStandardMaterial({color:'#65574e',roughness:.87});
  const lip=new THREE.MeshStandardMaterial({color:'#857357',roughness:.73});
  const dark=new THREE.MeshStandardMaterial({color:'#3d3934',roughness:.91});
  const add=(group,material,width,height,depth,x,y,z)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    mesh.position.set(x,y,z);
    mesh.userData.inkTint='#635342';
    mesh.userData.inkTintAmount=.81;
    group.add(mesh);
  };
  return parts.doors.map(({hinge,side})=>{
    const shoe=new THREE.Group();
    shoe.name='闩铁承座';
    shoe.position.set(-side*4.62,5.12,-.49);
    hinge.add(shoe);
    // Timber stays visible between the two flanks of the open iron saddle.
    add(shoe,dark,.73,.68,.13,0,-.04,-.04);
    for(const x of [-.32,.32])add(shoe,iron,.11,.53,.37,x,.075,-.20);
    add(shoe,lip,.63,.12,.37,0,-.24,-.20);
    add(shoe,iron,.63,.31,.09,0,-.19,-.37);
    for(const x of [-.24,.24])add(shoe,lip,.078,.078,.046,x,-.20,-.426);
    shoe.visible=false;
    return shoe;
  });
}

export function buildHeavenFinale(landmark){
  const root=new THREE.Group();
  root.name='门雷 · 天锁 · 殿前演出';
  landmark.add(root);
  const horizontal=new THREE.PlaneGeometry(2,2).rotateX(-Math.PI*.5);
  const bands=[0,1].map(i=>stormVolume(root,i));
  const trialLight=trialThresholdLight(root);
  const mark=wash(root,horizontal,ringPaint,{seed:27.6,tint:'#a85545',order:10});
  const lockEdges=lockBoundary(root);
  const strike=lightning(root);
  const split=fractureVeins(root);
  const updraft=Array.from({length:9},(_,i)=>{
    const points=Array.from({length:15},(_,j)=>{
      const t=j/14,angle=t*2.04-.91;
      const radius=3.56-.81*t+(i%3)*.29;
      return v(Math.cos(angle)*radius,t*3.9,Math.sin(angle)*radius);
    });
    return thinStroke(root,points,.32+(i%3)*.14,i*7.3,'#786e56',{
      fragment:risingPaint,horizontal:true,order:6,
    });
  });
  const landing=landingMarks(root,landmark.userData.finaleParts.fascia);
  const threshold=wash(root,horizontal,pathPaint,{seed:69,tint:'#b29b76',order:8});
  const doorsmoke=cloud(root,7,13.1,'#9a8876');
  const dust=cloud(root,17,17.3,'#665a4d');
  const bearingDust=cloud(root,4,42.6,'#776250');
  const contactDust=cloud(root,4,86.2,'#c0a789');
  const roofScuff=cloud(root,3,157.7,'#8b7560');
  const nearMist=cloud(root,6,83.9,'#6e6051');
  const distantWash=cloud(root,5,37.8,'#8c9186');
  const receivers=boltReceivers(landmark.userData.finaleParts);
  const cuffs=forgedCuffs(root);
  const taggedTether={
    pin:v(), hook:v(), endpoint:v(), witness:v(), direction:v(), bent:v(), arc:new Float32Array(61),
  };
  return {
    root,bands,trialLight,mark,lockEdges,strike,split,updraft,landing,threshold,doorsmoke,dust,bearingDust,contactDust,roofScuff,nearMist,distantWash,receivers,links:longLinks(root),lockChainLine:v(),cuffs,
    lockAtmosphere:new LockAtmosphere(root,cuffs),
    debris:[rubble(root,false),rubble(root,true)],grain:brokenGrain(root),
    keys:beamKeys(root,landmark.userData.finaleParts.fascia),keyPose:new THREE.Object3D(),
    paper:courtPaper(root),taggedTether,a:v(),b:v(),c:v(),d:v(),
    object:new THREE.Object3D(),eaves:prepareEaves(landmark.userData.finaleParts.tiles.filter(course=>!course.ridge)),
    purlins:preparePurlins(landmark.userData.finaleParts.purlins),
  };
}

function beamCenter(x){
  return 1-smooth(Math.abs(x),.45,7.03);
}

function pawPressure(fascia,x){
  const seat=fascia.center+fascia.pawSeat.x+fascia.side*beamPawSpread;
  return Math.exp(-(((x-seat)/1.18)**2));
}

function fasciaSkin(fascia){
  if(fascia.strainSkin)return fascia.strainSkin;
  const skin=[];
  fascia.root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const position=mesh.geometry.attributes.position;
    position.setUsage(THREE.DynamicDrawUsage);
    // Painted strips are direct children and already in beam coordinates.
    // Only the batched beams and the split face have a cancelling offset.
    const offset=mesh.parent===fascia.root?mesh.position
      :mesh.parent===fascia.cut?fascia.cut.parent.position:mesh.parent.position;
    const source=position.array.slice();
    const profile=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++){
      const j=i*3;
      const x=source[j]+offset.x+fascia.center;
      const level=source[j+1]+offset.y;
      const crown=smooth(level,-.53,.33);
      const center=beamCenter(x);
      const underPaw=pawPressure(fascia,x);
      profile[j]=center;
      profile[j+1]=underPaw*(.41+.59*crown);
      profile[j+2]=center*(.51+.49*crown)*(.35+.65*underPaw);
    }
    mesh.frustumCulled=false;
    skin.push({position,source,profile});
  });
  return fascia.strainSkin=skin;
}

function beamLoad(fascia,after,crash,out){
  const t=Math.max(0,after-(fascia.side<0?0:STOMP_PAW_GAP));
  const release=Math.max(0,after-STOMP_LOAD);
  const firstLoad=crash?smooth(after,0,.095):0;
  const ownLoad=crash?smooth(t,0,.065):0;
  const coupling=crash?smooth(after,STOMP_PAW_GAP+.036,STOMP_LOAD-.012):0;
  const recover=1-.15*smooth(release,.025,.25);
  // The intact crown carries the first impact across the span. The local
  // dent remains at each claw as both halves turn into the central split.
  out[0]=((fascia.side<0?.17:.095)*firstLoad+.17*ownLoad+.29*coupling)*recover;
  out[1]=(.19*ownLoad+.065*coupling)*(1-.15*smooth(release,.13,.40));
  out[2]=coupling*(1-smooth(release,.38,.66));
  return out;
}

const beamLoadScratch=[0,0,0];
function beamDeflection(fascia,after,crash){
  const [bend,crush,strain]=beamLoad(fascia,after,crash,beamLoadScratch);
  const previous=fascia.strain??[0,0,0];
  if(Math.abs(previous[0]-bend)+Math.abs(previous[1]-crush)+Math.abs(previous[2]-strain)<.0001)return;
  fascia.strain=[bend,crush,strain];
  for(const {position,source,profile} of fasciaSkin(fascia)){
    for(let j=0;j<source.length;j+=3){
      position.array[j]=source[j]+fascia.side*.08*strain*profile[j];
      position.array[j+1]=source[j+1]-bend*profile[j]-crush*profile[j+1];
      position.array[j+2]=source[j+2]-.12*strain*profile[j+2];
    }
    position.needsUpdate=true;
  }
}

const strainedPaw=v();
const courtPaws=[{pawWorld:v()},{pawWorld:v()}];
const crownRay=new THREE.Ray(v(),v(0,-1,0));
const crownHit=v();

function sampleBeamCrown(fascia){
  const {crown}=fascia;
  if(!crown)return;
  const {position}=crown.geometry.attributes;
  fascia.crownPoints??=Array.from({length:position.count},()=>v());
  crown.updateWorldMatrix(true,false);
  for(let i=0;i<position.count;i++){
    fascia.crownPoints[i].fromBufferAttribute(position,i).applyMatrix4(crown.matrixWorld);
  }
  fascia.heightAt??=(x,z)=>{
    crownRay.origin.set(x,fascia.pawWorld.y+4,z);
    const points=fascia.crownPoints;
    const index=crown.geometry.index;
    let top=-Infinity;
    for(let j=0;j<(index?.count??points.length);j+=3){
      const a=points[index?index.getX(j):j];
      const b=points[index?index.getX(j+1):j+1];
      const c=points[index?index.getX(j+2):j+2];
      if(crownRay.intersectTriangle(a,b,c,false,crownHit))top=Math.max(top,crownHit.y);
    }
    return top;
  };
}

function beamPlacement(target,side,center,after,release){
  const contact=Math.max(0,after-(side<0?0:STOMP_PAW_GAP));
  const crush=smooth(contact,0,.102);
  const shear=smooth(release,.013,.16);
  const dropAge=clamp((release-.125)/1.16,0,1);
  const drop=dropAge**1.78;
  target.position.set(center+side*(.54*shear+5.70*drop),
    14.14-(side<0?.068:.081)*crush-13.65*drop,-10.6+.15*shear-4.6*drop);
  target.rotation.set(-.010*crush-.89*drop,side*.14*shear,side*(.024*crush-.82*drop));
}

function dropBeamKeys(state, finale, after){
  const {keys,keyPose}=state;
  const visible=finale?.phase==='stomp' || (finale?.roofLine&&finale.stompArmed);
  for(const {beam,mesh,socket,release} of keys){
    mesh.visible=visible&&after<release+.74;
    const side=beam.side;
    const gap=visible?smooth(after,release-.055,release+.055)*(1-smooth(after,STOMP_LOAD+.07,STOMP_LOAD+.36)):0;
    opacity(socket,gap*.94,after);
    const x=beam.pawSeat.x+side*(beamPawSpread+.25);
    if(socket.visible){
      const [bend,crush]=beam.strain;
      socket.position.set(x,-.072-bend*beamCenter(x+beam.center)-crush*.63,-.892)
        .applyQuaternion(beam.root.quaternion).add(beam.root.position);
      socket.rotation.copy(beam.root.rotation);
    }
    if(!mesh.visible)continue;
    const loaded=Math.min(after,release);
    const travel=Math.max(0,after-release);
    const [bend,crush]=beamLoad(beam,loaded,true,beamLoadScratch);
    const onset=smooth(loaded,side<0?.018:STOMP_PAW_GAP+.018,release);
    beamPlacement(keyPose,side,beam.center,loaded,0);
    mesh.position.set(x,-.072-bend*beamCenter(x+beam.center)-crush*.63-.104*onset,-.849-.19*onset)
      .applyQuaternion(keyPose.quaternion).add(keyPose.position);
    // Once the key clears the face, turn and fall independently of the beam.
    mesh.position.x+=side*travel*.85;
    mesh.position.y-=travel*(.75+6.0*travel);
    mesh.position.z-=travel*1.85;
    mesh.rotation.copy(keyPose.rotation);
    mesh.rotation.x+=.12*onset+travel*6.3;
    mesh.rotation.z+=side*(.08*onset+travel*4.7);
    const scale=1-smooth(travel,.57,.74);
    mesh.scale.set(scale*(side<0?.95:1.1),scale*(side<0?1.03:.85),scale);
  }
}

function poseGateBeam(parts,crash,after){
  const release=Math.max(0,after-STOMP_LOAD);
  for(const fascia of parts.fascia){
    const {root,side,center,cut}=fascia;
    beamDeflection(fascia,after,crash);
    cut.visible=crash&&release>.013;
    beamPlacement(root,side,center,after,release);
  }
}

function cutEdge(fascia,[y,z],grainX,[bend,crush,strain],matrix,out){
  const x=fascia.side*grainX,center=beamCenter(x);
  const crown=smooth(y-14.14,-.53,.33);
  const underPaw=pawPressure(fascia,x);
  return out.set(x-fascia.center+fascia.side*.08*strain*center,
    y-14.14-bend*center-crush*underPaw*(.41+.59*crown),
    z+10.57-.12*strain*center*(.51+.49*crown)*(.35+.65*underPaw)).applyMatrix4(matrix);
}

function shapeTornGrain(mesh,from,to,width,bow,phase,alpha){
  opacity(mesh,alpha);
  if(!mesh.visible)return;
  const position=mesh.geometry.attributes.position;
  for(let i=0;i<tearStations;i++){
    const u=i/(tearStations-1),arc=Math.sin(Math.PI*u);
    const x=lerp(from.x,to.x,u),y=lerp(from.y,to.y,u)-arc*(bow+.034*Math.sin(u*15.+phase));
    const z=lerp(from.z,to.z,u)-arc*.028;
    const edge=width*.5*(1-.38*u)*(.87+.13*Math.sin(i*2.7+phase));
    position.setXYZ(i*2,x,y-edge,z);
    position.setXYZ(i*2+1,x,y+edge,z+.025);
  }
  position.needsUpdate=true;
}

function drawBrokenGrain(wood,fascia,crash,release){
  wood.group.visible=crash&&release>.023&&release<1.02;
  if(!wood.group.visible)return;
  const [left,right]=fascia;
  left.root.updateMatrix();
  right.root.updateMatrix();
  const {strands,chips,to,temp,chipPose}=wood;
  for(const [i,strand] of strands.entries()){
    const {from,to:edge,wide,loose,a,b,burst,fail,width,phase,x}=strand;
    const age=release-fail;
    cutEdge(left,from,x,left.strain,left.root.matrix,a);
    cutEdge(right,edge,.14-x,right.strain,right.root.matrix,b);
    const reveal=smooth(a.distanceTo(b),.19,.48);
    shapeTornGrain(wide,a,b,width,.13*(1-smooth(release,.03,fail)),phase,
      release<fail?reveal*.94:0);
    for(const [side,start,end] of [[0,a,b],[1,b,a]]){
      const held=age>=0?1-smooth(age,.08,.43):0;
      const curl=Math.max(0,age);
      to.copy(start).lerp(end,.31*(1-smooth(curl,0,.28)));
      to.y-=(.18+1.35*curl)*held;
      to.z-=.11*held;
      shapeTornGrain(loose[side],start,to,width*.82,.055,phase,held*.86);
    }
    if(age<0){
      chipPose.scale.setScalar(0);
    }else{
      // Evaluate the actual lip positions at the severing time. The loose
      // chunk does not inherit beam motion after it leaves the grain.
      const after=STOMP_LOAD+fail;
      beamPlacement(chipPose,left.side,left.center,after,fail);
      chipPose.updateMatrix();
      cutEdge(left,from,x,beamLoad(left,after,true,beamLoadScratch),chipPose.matrix,burst);
      beamPlacement(chipPose,right.side,right.center,after,fail);
      chipPose.updateMatrix();
      cutEdge(right,edge,.14-x,beamLoad(right,after,true,beamLoadScratch),chipPose.matrix,temp);
      burst.lerp(temp,.45);
      const side=i%2?1:-1,life=1-smooth(age,.49,.72);
      chipPose.position.set(burst.x+side*age*(.32+.138*i),burst.y-age*(.74+3.9*age),
        burst.z-age*(.45+.14*i));
      chipPose.rotation.set(phase+age*4.4,side*age*4.5,.11+side*age*4.1);
      chipPose.scale.set((.20+.035*i)*life,width*.42*life,width*.29*life);
    }
    chipPose.updateMatrix();
    chips.setMatrixAt(i,chipPose.matrix);
    // The placement helper uses unit scale for the historical lip transform.
    chipPose.scale.setScalar(1);
  }
  chips.instanceMatrix.needsUpdate=true;
}

const lockDoorPaws=[{pawWorld:v(),reach:3.05},{pawWorld:v()}];

function poseDoor(door,finale,fall=0){
  const {side,root,hinge,ring}=door;
  const locked=finale?.ending==='locked';
  const open=finale?.gateOpen??0;
  const angle=locked&&side<0?finale.otherGateOpen??open:open;
  const seat=locked?smooth(finale.age,GATE_BIND.latch-.10,GATE_BIND.latch+.03)*.138:0;
  hinge.rotation.y=side*angle*1.37;
  const elapsed=finale?.elapsed??0;
  const tension=locked&&side>0?smooth(elapsed,LOCK_DOOR.grip-.12,LOCK_DOOR.grip+.08)
    *(1-smooth(elapsed,LOCK_DOOR.release-.07,LOCK_DOOR.release+.21)):0;
  ring.rotation.x=.64*tension;
  root.position.set(side*(5.94-seat+5.1*fall),.2-.75*fall,-7.21-5.4*fall);
  root.rotation.set(-1.42*fall,side*.54*fall,side*.40*fall);
}

export function prepareGatePawTargets(landmark,finale){
  if(!landmark)return null;
  if(finale?.phase==='audience'&&finale.age>1.39&&finale.age<4.13){
    landmark.localToWorld(courtPaws[0].pawWorld.set(-.92,1.16,12.25));
    landmark.localToWorld(courtPaws[1].pawWorld.set(.83,1.16,12.87));
    return courtPaws;
  }
  const parts=landmark.userData.finaleParts;
  const elapsed=finale?.elapsed??0;
  if(parts&&finale?.phase==='lock'&&elapsed>=LOCK_DOOR.reach&&elapsed<=LOCK_DOOR.release+.21){
    const handle=parts.doors[1];
    poseDoor(handle,finale);
    handle.ring.localToWorld(lockDoorPaws[0].pawWorld.set(.04,-.46,-.035));
    return lockDoorPaws;
  }
  if(!parts||finale?.phase!=='stomp'||finale.age<.68||finale.age>finale.impactAt+STOMP_LOAD+.23)return null;
  poseGateBeam(parts,true,Math.max(0,finale.age-finale.impactAt));
  for(const fascia of parts.fascia){
    const {root,pawSeat,pawWorld,side,strain}=fascia;
    const [bend,crush,shear]=strain??[0,0,0];
    strainedPaw.copy(pawSeat);
    strainedPaw.x+=side*beamPawSpread;
    const center=beamCenter(strainedPaw.x+fascia.center);
    strainedPaw.x+=side*.08*shear*center;
    strainedPaw.y-=bend*center+crush;
    strainedPaw.z-=.12*shear*center;
    root.localToWorld(pawWorld.copy(strainedPaw));
    sampleBeamCrown(fascia);
  }
  return parts.fascia;
}

const bearingFailure=side=>side<0?.095:.61;
const dropRoof=side=>side<0?.29:.72;
const bracketSeat=v();
const bracketOffset=v();

function moveGate(parts,finale,crash,after,beamPrepared,eaves,purlins,ground,roofStone){
  const release=Math.max(0,after-STOMP_LOAD);
  const progress=smooth(release,0,.44);
  const locked=finale?.ending==='locked';
  const closing=locked?smooth(finale.age,GATE_BIND.latch-.20,GATE_BIND.latch):1;
  const open=finale?.gateOpen??0;
  for(const door of parts.doors){
    const t=Math.max(0,release-dropRoof(door.side));
    poseDoor(door,finale,settle(t,.07,1.18));
    if(crash)door.hinge.rotation.y=door.side*open*(1-smooth(release,.04,.53)*.80)*1.37;
  }
  parts.latch.visible=locked?finale.age>GATE_BIND.latch-.30:open<.105||crash;
  const landed=Math.max(0,(finale?.age??0)-GATE_BIND.latch);
  const latchDrop=locked?(1-closing*closing)*1.19+.088*Math.sin(landed*34)*Math.exp(-landed*12):0;
  const age=finale?.age??0;
  const latchFall=crash?Math.pow(smooth(age,TETHER_UNSEAT+.025,STOMP_DURATION),1.37):0;
  const drag=crash?smooth(age,TETHER_TAUT-.33,TETHER_UNSEAT)*(1-.66*smooth(age,STOMP_CHAIN_RELEASE,STOMP_DURATION)):0;
  const slip=crash?Math.max(0,age-TETHER_TAUT):0;
  const tremor=Math.sin(slip*28.3)*Math.exp(-slip*7.2)*drag;
  parts.latch.position.set(-2.25*progress-.68*latchFall-.28*drag,
    5.31+latchDrop-2.15*progress-2.2*latchFall-.43*drag+.07*tremor,
    -7.88-2.5*progress-1.05*latchFall-.34*drag);
  parts.latch.rotation.z=.28*progress+.39*latchFall-(1-closing)*.20+.17*drag+.050*tremor;
  const load=crash?smooth(after,.10,.41)*(1-smooth(release,.045,.33)):0;
  for(const [side,roof] of parts.halves)poseRoofHalf(roof,side,release,load,roofStone);
  dropRoofRidges(parts,release,ground);
  bowPurlins(purlins,after,release,crash);
  peelEaves(parts,eaves,release);
  spallRoofSeat(parts,release,roofStone);
  if(!beamPrepared)poseGateBeam(parts,crash,after);
  for(const {pivot,side,depth,x,z,bearing,bracket} of parts.pillars){
    const give=bearingFailure(side)+(bearing?0:.38);
    const bend=smooth(release,give+.15,give+.40);
    const fall=settle(release,give+.25,give+(side<0?1.15:1.34));
    const sag=bearing?load*(side<0?1:.81):0;
    const strained=crash?smooth(after,(side<0?.12:.18),.40)*(1-smooth(release,give,give+.15)):0;
    pivot.position.set(x+side*(1.4*fall+.098*strained),.55-.57*fall-.065*sag,z-2.3*fall);
    pivot.rotation.set(-.72*fall-.013*sag,side*-.34*fall,side*(-1.09*fall-.10*bend+.022*sag));
    if(bracket){
      // The top arm pulls off the upright while the post is still carrying it.
      const pry=smooth(release,give,give+.18);
      const yieldOff=smooth(release,give+.075,give+.36);
      const rebound=smooth(release,give+.26,give+.55);
      bracket.rotation.set(.17*pry-.44*yieldOff,side*.16*yieldOff,
        side*(.034*sag-.28*pry+.09*rebound));
      bracketSeat.set(x,12.14,z+.08);
      bracketOffset.copy(bracketSeat).applyQuaternion(bracket.quaternion);
      bracket.position.copy(bracketSeat).sub(bracketOffset);
      bracket.position.x+=side*(.69*yieldOff+.17*fall);
      bracket.position.y-=.19*sag+.76*yieldOff;
      bracket.position.z-=.58*yieldOff;
    }
  }
  dropPlaque(parts.board,release);
}

const roofBearing=v();
const roofBearingOffset=v();
const roofVertex=v();
const roofFlightPose=new THREE.Object3D();
const roofStoneSeats=new WeakMap();

function stockRoofHalf(roof,side,release,load=0){
  const near=side<0;
  const t=Math.max(0,release-bearingFailure(side)-.16);
  const shake=Math.sin(t*38)*Math.exp(-t*9);
  const rock=smooth(t,.02,.36);
  const unseat=smooth(t,near?.46:.53,near?.99:1.13);
  const grav=clamp((t-(near?.50:.62))/(near?1.01:1.06),0,1);
  const fall=grav**1.78;
  const settleOnStone=smooth(t,near?1.50:1.78,near?2.36:2.59);
  const ring=Math.max(0,t-(near?1.57:1.83));
  const rattle=Math.sin(ring*17.5)*Math.exp(-ring*5.1);
  // Start by rolling around the loaded bearing. Sideways motion starts
  // only when the tenon pulls out; gravity then carries the roof down.
  roof.rotation.set(-.145*rock-.36*fall-.10*settleOnStone+.029*load,
    side*(.079*rock+.19*unseat+.085*settleOnStone),
    side*(-.071*rock-.65*fall-.105*settleOnStone+.012*rattle-.021*load));
  roofBearing.set(side*6.71,13.80,-10.60);
  roofBearingOffset.copy(roofBearing).applyQuaternion(roof.quaternion);
  roof.position.copy(roofBearing).sub(roofBearingOffset);
  roof.position.x+=side*(3.35*unseat+6.9*fall+1.15*settleOnStone+.087*shake);
  roof.position.y-=.46*rock+12.9*fall+2.65*settleOnStone+.155*load;
  roof.position.y+=.18*rattle;
  roof.position.z-=.40*rock+(near?4.6:3.3)*fall+2.2*settleOnStone;
}

function swingRoof(roof,side,release,load){
  const near=side<0;
  const age=Math.max(0,release-bearingFailure(side)-.16);
  const hingeTime=near?.47:.62;
  const hanging=Math.min(age/hingeTime,1);
  const free=Math.max(0,age-hingeTime);
  const lean=hanging*hanging;
  const releaseKick=free*free;
  const shake=Math.sin(age*36)*Math.exp(-age*11)*(1-lean);
  // After the central bearing opens, the far end hangs from the first
  // standing outer bracket at the original eave height. The inner end
  // sags into the opening before the outer load pulls free.
  roof.rotation.set(-.106*lean-.43*free-.32*releaseKick+.029*load,
    side*(.08*lean+.35*free),
    side*(.125*lean-.36*free-.78*releaseKick-.021*load));
  roofBearing.set(side*14.7,12.36,-7);
  roofBearingOffset.copy(roofBearing).applyQuaternion(roof.quaternion);
  roof.position.copy(roofBearing).sub(roofBearingOffset);
  roof.position.x+=side*(.70*lean+(near?7.65:6.35)*free+1.45*releaseKick+.064*shake);
  roof.position.y-=.31*lean+(near?1.95:1.50)*free+(near?19.8:17.4)*releaseKick+.155*load;
  roof.position.z-=.32*lean+(near?3.75:1.68)*free+1.19*releaseKick;
}

function roofPoints(roof){
  const cells=new Map();
  for(const mesh of roof.children){
    if(!mesh.isMesh)continue;
    const points=mesh.geometry.attributes.position;
    for(let i=0;i<points.count;i++){
      const x=points.getX(i), y=points.getY(i), z=points.getZ(i);
      // All faces use the original baked coordinates. Keep a real point
      // from each small cell; occupy concavities only where vertices exist.
      const key=Math.round(x*2.6)+256*Math.round(y*2.6)+16384*Math.round(z*2.6);
      const present=cells.get(key);
      if(!present||y< present.y)cells.set(key,v(x,y,z));
    }
  }
  return [...cells.values()];
}

function roofStrike(points,pose,surface){
  let lowest=0;
  let foot=null;
  for(const point of points){
    roofVertex.copy(point).applyQuaternion(pose.quaternion).add(pose.position);
    const penetration=surface(roofVertex.x,roofVertex.z)+.06-roofVertex.y;
    if(penetration>lowest){
      foot=point;
      lowest=penetration;
    }
  }
  return foot;
}

function roofSeat(roof,side,surface){
  if(roofStoneSeats.has(roof))return roofStoneSeats.get(roof);
  const points=roofPoints(roof);
  const start=bearingFailure(side)+.16+(side<0?.47:.62);
  let before=start,after=start,foot;
  while(after<start+1.45){
    after+=.06;
    swingRoof(roofFlightPose,side,after,0);
    foot=roofStrike(points,roofFlightPose,surface);
    if(foot)break;
    before=after;
  }
  if(!foot){
    roofStoneSeats.set(roof,null);
    return null;
  }
  for(let i=0;i<7;i++){
    const center=(before+after)*.5;
    swingRoof(roofFlightPose,side,center,0);
    const candidate=roofStrike(points,roofFlightPose,surface);
    if(candidate){after=center;foot=candidate;}
    else before=center;
  }
  swingRoof(roofFlightPose,side,after,0);
  const seat={at:after,foot,point:foot.clone().applyQuaternion(roofFlightPose.quaternion).add(roofFlightPose.position),
    angle:roofFlightPose.rotation.clone()};
  roofStoneSeats.set(roof,seat);
  roof.userData.roofStoneContact=seat;
  return seat;
}

function poseRoofHalf(roof,side,release,load=0,surface){
  if(side>0||release<=bearingFailure(side)+.16)return stockRoofHalf(roof,side,release,load);
  swingRoof(roof,side,release,load);
  if(!surface||release<bearingFailure(side)+.68)return;
  const seat=roofSeat(roof,side,surface);
  if(!seat||release<seat.at)return;
  const time=release-seat.at;
  const skid=1-Math.exp(-time*5.1);
  const vibration=Math.sin(time*22)*Math.exp(-time*7.4);
  const {angle,point,foot}=seat;
  // Once it strikes, the contact point stays on the terrace. Dissipate the
  // fall in a short slide around that point and a damped rotation.
  roof.rotation.set(angle.x+.035*skid+.017*vibration,
    angle.y+side*.061*skid,angle.z+side*(.055*skid+.013*vibration));
  roof.position.copy(point).sub(roofBearingOffset.copy(foot).applyQuaternion(roof.quaternion));
  roof.position.x+=side*.91*skid;
  roof.position.z+=.56*skid;
  const y=surface(point.x+side*.91*skid,point.z+.56*skid);
  if(Number.isFinite(y))roof.position.y+=y-surface(point.x,point.z);
}

const spallPose=new THREE.Object3D();
const spallTilt=new THREE.Euler();
const spallTurn=new THREE.Quaternion();
const spallReleaseOffsets=[.023,.064,.088];

function spallRoofSeat(parts,release,stone){
  const roof=parts.halves[0][1],seat=roof.userData.roofStoneContact;
  for(const [index,piece] of parts.spall.entries()){
    const {root,origin,tile}=piece;
    const at=(seat?.at??Infinity)+spallReleaseOffsets[index];
    const age=Math.max(0,release-at);
    if(!age){
      root.position.copy(origin).applyQuaternion(roof.quaternion).add(roof.position);
      root.quaternion.copy(roof.quaternion);
      continue;
    }
    poseRoofHalf(spallPose,-1,at,0);
    const reach=Math.min(age,tile?.93:1.06);
    const slip=Math.min(reach,tile?.70:.83);
    const start=root.position.copy(origin).applyQuaternion(spallPose.quaternion).add(spallPose.position);
    start.x+=slip*(tile?8.8:7.1+index*1.79);
    start.y+=reach*((tile?7.30:4.91+index*1.06)-9.8*reach);
    start.z-=slip*(tile?4.6:4.2+index*.82);
    const floor=stone?.(start.x,start.z)??-Infinity;
    if(Number.isFinite(floor))start.y=Math.max(start.y,floor+(tile?.38:.22));
    spallTilt.set((tile?.89:2.03)*slip,(index%2===0?-1:1)*(tile?.68:2.88)*slip,
      (index%2===0?1:-1)*(tile?1.18:3.9)*slip);
    root.quaternion.copy(spallPose.quaternion).multiply(spallTurn.setFromEuler(spallTilt));
  }
}

function drawRoofScuff(state,parts,release){
  const seat=parts.halves[0][1].userData.roofStoneContact;
  const t=release-(seat?.at??Infinity);
  for(const [index,mesh] of state.roofScuff.entries()){
    const age=t-index*.037;
    if(age<=0||age>=.51){opacity(mesh,0);continue;}
    const mark=smooth(age,0,.095)*(1-smooth(age,.18,.51));
    mesh.position.copy(seat.point);
    mesh.position.x+=.32+age*(4.05+index*.44);
    mesh.position.y+=.07+index*.068+age*(.36+index*.22);
    mesh.position.z-=.31+age*(1.15+index*.58);
    mesh.rotation.set(-.45+index*.19,.24*index,-.18-index*.085);
    mesh.scale.set(.52+age*(2.43+index*.49),.13+age*(.55+index*.066),1);
    opacity(mesh,mark*(.65-index*.09),age);
  }
}

const ridgeSupport=new THREE.Object3D();
const ridgeHinge=v(),ridgeOffset=v();
const ridgeAngle=new THREE.Quaternion();
const ridgeEuler=new THREE.Euler();
const ridgeFlat=new THREE.Quaternion();
const ridgeRest=new THREE.Euler();
const ridgeVertex=v();
const ridgeSupportSamples=new WeakMap();

function ridgeSeats(root){
  const existing=ridgeSupportSamples.get(root);
  if(existing)return existing;
  const samples=[];
  root.updateMatrixWorld(true);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const vertices=mesh.geometry.attributes.position;
    const toRoot=new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
    // The broken faces and outermost tile corners are in the mesh, not a box.
    for(let i=0;i<vertices.count;i+=3)samples.push(v().fromBufferAttribute(vertices,i).applyMatrix4(toRoot));
  });
  ridgeSupportSamples.set(root,samples);
  return samples;
}

function seatRoofRidge(root, sample, settle){
  const points=ridgeSeats(root);
  let clearance=-Infinity;
  for(const point of points){
    ridgeVertex.copy(point).applyQuaternion(root.quaternion).add(root.position);
    const floor=sample(ridgeVertex.x,ridgeVertex.z);
    clearance=Math.max(clearance,floor+.068-ridgeVertex.y);
  }
  // Before contact the geometric limit has no effect. After contact the same
  // surface holds a damped settling turn and a short horizontal slide.
  root.position.y+=Math.max(0,clearance)+.045*Math.sin(Math.PI*settle);
}

function dropRoofRidges(parts,release,sample){
  for(const {root,origin,side,ridge} of parts.tiles){
    if(!ridge)continue;
    const start=side<0?.42:.60;
    const half=parts.halves[side<0?0:1][1];
    if(release<=start){
      root.position.copy(origin).applyQuaternion(half.quaternion).add(half.position);
      root.quaternion.copy(half.quaternion);
      continue;
    }
    poseRoofHalf(ridgeSupport,side,start);
    const age=release-start;
    const buckle=smooth(age,0,.19);
    const fall=clamp((age-.11)/(side<0?1.18:1.36),0,1)**1.83;
    const slide=smooth(age,1.12,2.12);
    const settle=smooth(age,1.16,1.87);
    ridgeHinge.copy(origin).add(ridgeOffset.set(side*2.95,-.92,-.26));
    ridgeEuler.set(.13*buckle-.78*fall+.15*settle,side*(-.17*buckle+.51*fall),
      side*(.20*buckle+.94*fall-.24*settle));
    ridgeAngle.setFromEuler(ridgeEuler);
    root.position.copy(origin).sub(ridgeHinge).applyQuaternion(ridgeAngle).add(ridgeHinge);
    root.position.x+=side*(-.55*buckle-1.35*fall+(side<0?6.05:4.72)*slide);
    root.position.y-=.31*buckle+20.9*fall;
    root.position.z+=.24*buckle-(side<0?6.90:6.10)*fall+(side<0?1.30:.62)*slide;
    root.position.applyQuaternion(ridgeSupport.quaternion).add(ridgeSupport.position);
    root.quaternion.copy(ridgeSupport.quaternion).multiply(ridgeAngle);
    ridgeRest.set(side<0?-.17:.21,side<0?-.47:.70,side<0?.13:-.20);
    ridgeFlat.setFromEuler(ridgeRest);
    root.quaternion.slerp(ridgeFlat,settle);
    if(sample&&age>.52)seatRoofRidge(root,sample,settle);
  }
}

const eavePoint=v();
const eaveNormal=v();
const eaveEuler=new THREE.Euler();
const eaveTurn=new THREE.Quaternion();
const eaveOffset=v();
const eaveRelease=new THREE.Object3D();
const eaveInverse=new THREE.Matrix4();
const eaveSample=new THREE.Matrix4();
const purlinPivot=v(),purlinTurned=v();
const purlinFailure=(side,bay)=>bearingFailure(side)+.056+[0,.108,.223][Math.min(bay,2)] + Math.max(0,bay-2)*.094;

function preparePurlins(parts){
  return (parts??[]).map(purlin=>{
    const members=[];
    purlin.root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const position=mesh.geometry.attributes.position;
      mesh.frustumCulled=false;
      position.setUsage(THREE.DynamicDrawUsage);
      const source=position.array.slice();
      const bendByVertex=new Float32Array(position.count*2);
      for(let i=0;i<position.count;i++){
        const near=1-clamp((source[i*3+2]-purlin.heel.z)/(purlin.ridge.z-purlin.heel.z),0,1);
        bendByVertex[i*2]=near;
        bendByVertex[i*2+1]=Math.sin(Math.PI*near);
      }
      members.push({position,source,bendByVertex});
    });
    return {...purlin,members,last:0};
  });
}

function bowPurlins(purlins,after,release,crash){
  for(const part of purlins){
    const {root,side,bay,ridge,members}=part;
    const first=STOMP_LOAD*.20+.045*bay+(side<0?0:.071);
    const yieldAt=purlinFailure(side,bay);
    const bend=crash?smooth(after,first,STOMP_LOAD-.025)*(1-smooth(release,yieldAt+.28,yieldAt+.68)):0;
    const letGo=smooth(release,yieldAt+.04,yieldAt+.37);
    const fall=clamp((release-yieldAt-.23)/1.28,0,1)**1.72;
    root.rotation.set(-.17*letGo-.70*fall,side*(.09*letGo+.24*fall),side*(.13*letGo+.48*fall));
    purlinPivot.copy(ridge);
    purlinTurned.copy(ridge).applyQuaternion(root.quaternion);
    root.position.copy(purlinPivot).sub(purlinTurned);
    root.position.x+=side*(.10*letGo+(1.45+.32*bay)*fall);
    root.position.y-=(5.35+.59*bay)*fall;
    root.position.z-=.22*letGo+(1.69+.29*bay)*fall;
    const flex=bend*(.87-.14*bay)+letGo*(1-fall)*.52;
    if(Math.abs(part.last-flex)<.0001)continue;
    part.last=flex;
    for(const {position,source,bendByVertex} of members){
      for(let i=0;i<position.count;i++){
        const j=i*3,k=i*2;
        const near=bendByVertex[k],span=bendByVertex[k+1];
        position.array[j]=source[j]+side*flex*span*.115;
        position.array[j+1]=source[j+1]-flex*(span*.34+near*.21);
        position.array[j+2]=source[j+2]-flex*near*.15;
      }
      position.needsUpdate=true;
    }
  }
}

function prepareEaves(tiles){
  return tiles.map(course=>{
    const meshes=[];
    course.root.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
    const bounds=new THREE.Box3();
    for(const mesh of meshes){
      mesh.geometry.computeBoundingBox();
      bounds.union(mesh.geometry.boundingBox);
    }
    const length=bounds.max.x-bounds.min.x;
    const inner=course.side<0?bounds.max.x:bounds.min.x;
    // Use the existing tiles and their undersides as uneven courses.
    // Each starts just after the connected purlin lets go.
    const cuts=course.tear?[.32,.63,1]
      :course.upper?[.22,.57,.78,1]:course.side<0?[.15,.43,.57,.85,1]:[.20,.32,.56,.78,1];
    const strips=cuts.map((edge,i)=>({
      edge,
      pivot:v(inner+course.side*length*(edge+(cuts[i-1]??0))*.5,course.origin.y+.38,course.origin.z+.57),
      starts:course.tear?(course.upper?.77:.41)+[0,.16,.24][i]
        :course.upper?purlinFailure(course.side,i)+.63+.032*i:
        (course.side<0?.235:.53)+[0,.116,.171,.303,.395][i],
    }));
    const surfaces=meshes.map(mesh=>{
      const {position,normal}=mesh.geometry.attributes;
      const source=position.array.slice(),sourceNormals=normal.array.slice();
      const sections=strips.map(()=>[]);
      for(let i=0;i<source.length;i+=9){
        const center=(source[i]+source[i+3]+source[i+6])/3;
        const station=course.side*(center-inner)/length;
        const band=cuts.findIndex(cut=>station<cut);
        sections[band<0?cuts.length-1:band].push(i);
      }
      position.setUsage(THREE.DynamicDrawUsage);
      normal.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled=false;
      return {position,normal,source,sourceNormals,sections};
    });
    return {...course,strips,surfaces,disturbed:false};
  });
}

function peelEaves(parts,courses,release){
  for(const course of courses){
    const {root,origin,side,upper,tear,strips,surfaces}=course;
    const half=parts.halves[side<0?0:1][1];
    root.position.copy(origin).applyQuaternion(half.quaternion).add(half.position);
    root.quaternion.copy(half.quaternion);
    if(release<=strips[0].starts&&!course.disturbed)continue;
    const disturbed=release>strips[0].starts;
    eaveInverse.compose(half.position,half.quaternion,half.scale).invert();
    for(const [i,{pivot,starts}] of strips.entries()){
      const age=Math.max(0,release-starts);
      const slip=smooth(age,0,tear?.37:upper?.37:.24);
      const dropAt=upper?.10+i*.025:.075+(i%2)*.048;
      const descent=clamp((age-dropAt)/(upper?1.58:1.05+i*.065),0,1);
      const fall=descent*descent;
      const hang=smooth(age,.025,.16)*(1-smooth(age,.22,.49));
      const rest=smooth(age,upper?1.55:1.19,upper?1.97:1.74);
      const stagger=1+((i+1)%3)*.24;
      const shear=tear?.47:1;
      eaveEuler.set(shear*((.66+i*.10)*hang+(1.42-i*.20)*slip-.59*rest),
        side*((i%2?-.12:.23)+i*.074)*slip,side*(-.21*hang+(.49-i*.13)*fall));
      eaveTurn.setFromEuler(eaveEuler);
      eaveOffset.copy(pivot).sub(eavePoint.copy(pivot).applyQuaternion(eaveTurn));
      eaveOffset.x+=side*((.20+i*.45)*slip+(1.0+i*.47)*fall);
      eaveOffset.y-=(upper?20.0:15.2)*fall+.21*rest;
      eaveOffset.z-=(tear?2.1+i*.71:upper?1.1+i*1.55:.62+stagger*.65+i*.92)*slip
        +(upper?5.8:3.7)*fall;
      if(age>0){
        poseRoofHalf(eaveRelease,side,starts);
        eaveRelease.updateMatrix();
        eaveSample.makeRotationFromQuaternion(eaveTurn).setPosition(eaveOffset);
        eaveSample.premultiply(eaveRelease.matrix).premultiply(eaveInverse);
      }else eaveSample.identity();
      for(const {position,normal,source,sourceNormals,sections} of surfaces){
        for(const first of sections[i])for(let j=first;j<first+9;j+=3){
          eavePoint.fromArray(source,j).applyMatrix4(eaveSample).toArray(position.array,j);
          eaveNormal.fromArray(sourceNormals,j).transformDirection(eaveSample).toArray(normal.array,j);
        }
      }
    }
    for(const {position,normal} of surfaces){position.needsUpdate=true;normal.needsUpdate=true;}
    course.disturbed=disturbed;
  }
}

function dropPlaque(board,release){
  const age=Math.max(0,release-.20);
  const start=smooth(age,.0,.24);
  const reach=clamp(age/1.12,0,1);
  const fall=reach*reach;
  const skim=smooth(age,1.10,1.95);
  const turn=smooth(age,.67,1.17);
  const rock=Math.sin(Math.max(0,age-1.12)*23)*Math.exp(-Math.max(0,age-1.12)*6)*turn;
  // The old lacquer remains visible while falling. It hits above the
  // second flight of steps and slides down it with the inscription up.
  board.rotation.set(.11*start+1.35*turn+.09*rock,-.10*start+.08*turn,
    -.09*start+.18*turn+.033*rock);
  board.position.set(-.45*start-.55*fall-.34*skim,
    11.47-13.95*fall-1.18*skim+.22*rock,-8.16-2.5*start-4.2*fall-3.25*skim);
}

function displayWeather(state,landmark,finale){
  const warning=finale?.warning;
  const strike=finale?.strike;
  const field=warning?.kind==='layers'?warning:strike?.kind==='layers'?strike:null;
  const time=field?.age??0;
  const opening=field?(field===warning?smooth(time,.08,.45):1-smooth(time,.23,.76)):0;
  state.trialLight.forEach(({mesh,gain})=>opacity(mesh,opening*gain,time));
  for(let i=0;i<state.bands.length;i++){
    const {root,banks,bolts}=state.bands[i];
    const layer=field?.layers[i];
    root.visible=Boolean(layer);
    if(layer){
      const gathering=warning?.kind==='layers';
      const reveal=smooth(time,i===0?.015:.05,i===0?.27:.36);
      const fade=gathering?reveal:1-smooth(time,.25,.79);
      const breath=gathering?smooth(time,.42,2.28):1;
      root.position.y=layer.y-17;
      root.scale.y=layer.halfHeight;
      opacity(banks[0],fade*(.23+.14*breath),time);
      opacity(banks[1],fade*(.78+.13*breath),time);
      const flash=strike?.kind==='layers'?1-smooth(strike.age,.085,.55):0;
      for(const [lane,bolt] of bolts.entries()){
        const height=layer.y-17+(i===0?1:-1)*layer.halfHeight*.60;
        bolt.position.set(0,height-lane*.38,-28.8+(strike?.age??0)*4.1);
        opacity(bolt,flash*(lane===1?1:.67),time);
      }
    }else{
      for(const bolt of bolts)opacity(bolt,0);
    }
  }
  const seeker=warning?.kind==='lock'?warning:strike?.kind==='lock'?strike:null;
  const bolt=state.strike;
  opacity(state.mark,0);bolt.root.visible=Boolean(seeker);
  state.lockEdges.forEach(edge=>opacity(edge,0));
  if(!seeker)return;
  landmark.worldToLocal(state.a.set(seeker.center.x,seeker.center.y,seeker.center.z));
  bolt.root.position.copy(state.a);
  state.mark.position.copy(state.a);
  const tracking=warning?.kind==='lock';
  state.mark.position.y-=.28;
  const charge=tracking?smooth(seeker.age,.95,2.42):0;
  const pulse=tracking?(warning.locked?.86+.14*charge:.48+.28*smooth(seeker.age,0,.89)):.64*(1-smooth(seeker.age,.24,.86));
  state.mark.scale.set(seeker.radius/.902,1,seeker.radius/.902);
  opacity(state.mark,pulse,seeker.age);
  const cut=tracking&&warning.locked?smooth(warning.age,.93,1.21):0;
  for(const edge of state.lockEdges){
    edge.position.copy(state.a);
    edge.scale.set(seeker.radius,1,seeker.radius);
    opacity(edge,cut*.69,seeker.age);
  }
  const leaderPower=tracking?(.34*cut+.64*smooth(charge,.09,.84))*(.68+.31*Math.sin(seeker.age*17.2)**2):0;
  bolt.leaders.forEach((mesh,i)=>opacity(mesh,leaderPower*(i===1?.91:.60),seeker.age));
  const flash=strike?.kind==='lock'?(1-smooth(strike.age,.09,.73))*(.89+.11*Math.cos(strike.age*53.4)):0;
  bolt.branches.forEach((mesh,i)=>opacity(mesh,flash*(i===0?1:.78),seeker.age));
}

function drawUpdraft(state,landmark,game,finale,time){
  const active=finale?.phase==='choice'&&finale.cracked;
  const split=finale?.cracked&&(active||finale.phase==='stomp'&&finale.age<finale.impactAt);
  const ready=active&&finale.stompReady;
  const roof=active&&finale.roofLine;
  state.split.forEach((m,i)=>opacity(m,split
    ? (.73+.14*Math.sin(time*2.8+i)**2)*(i===0?1:.84)*(roof?.16:1):0,time));
  const committed=finale?.phase==='stomp' ? 1-smooth(finale.age,finale.impactAt+.21,finale.impactAt+STOMP_LOAD+.18) : 0;
  const landing=state.landing;
  const guide=landing.guide;
  if(active||committed){
    // Simulation and scene share the ascent origin; the landmark is
    // translated to the gate center. Derive that offset from the impact.
    landmark.worldToLocal(state.b.copy(finale.impact));
    const originZ=state.b.z-FASCIA.z;
    guide.lane.position.set(state.b.x,state.b.y+STOMP_PAD.yMin-FASCIA.y,originZ);
    for(const stroke of guide.drop)stroke.position.z=state.b.z;
  }
  const stage=active?smooth(game.p.y,30.5,STOMP_PAD.yMin+.3):0;
  const tone=stage*(ready?(finale.stompArmed?.47:.81):.92);
  for(const [i,{rail,dry}] of guide.sides.entries()){
    const gust=.71+.29*Math.sin(time*3.9-i*.85)**2;
    opacity(rail,tone*gust*(ready?.68:.80),time);
    opacity(dry,tone*gust*(ready?.29:.39),time);
  }
  const gather=active&&ready?(finale.stompArmed?.68:.83):committed*.34;
  guide.drop.forEach((stroke,i)=>opacity(stroke,gather*(.71+.29*Math.sin(time*5.1+i)**2),time));
  opacity(landing.face,roof?.94:(active?.25:committed*.94),time);
  opacity(landing.score,roof?1:(active?.31:committed),time);
  if(ready&&finale.stompArmed)landing.armedAt??=time;
  else landing.armedAt=null;
  const dustAge=landing.armedAt===null?1:time-landing.armedAt;
  for(const {side,surfaces,raw,fibers,powder} of landing.seats){
    const loaded=finale?.phase==='stomp'?smooth(finale.age,finale.impactAt+.02,finale.impactAt+.19):0;
    const chipped=roof?(ready?1:.90):active?.74:committed*(.64-.43*loaded);
    for(const surface of surfaces)opacity(surface,chipped,time);
    for(const fiber of fibers)opacity(fiber,chipped*.89,time);
    const landAt=finale?.impactAt+(side<0?0:STOMP_PAW_GAP);
    const mark=finale?.phase==='stomp'
      ? smooth(finale.age,landAt-.018,landAt+.075)
        *(1-smooth(finale.age,finale.impactAt+STOMP_LOAD+.095,finale.impactAt+STOMP_LOAD+.37)) : 0;
    opacity(raw,mark,Math.max(0,(finale?.age??0)-landAt));
    const dust=Math.max(0,dustAge-(side<0?0:.095));
    const release=smooth(dust,0,.07)*(1-smooth(dust,.24,.47));
    for(const mesh of powder){
      mesh.position.set(side*dust*2.25,dust*.44,dust*.12);
      opacity(mesh,release*.81,time);
    }
  }
  state.landing.goldenWind.forEach((mesh,i)=>{
    const alpha=roof&&!ready?.35:0;
    opacity(mesh,alpha*(.64+.36*Math.sin(time*2.8+i*.82)**2),time);
  });
  if(active)landmark.worldToLocal(state.a.set(finale.updraft.x,finale.updraft.y,finale.updraft.z));
  state.updraft.forEach((m,i)=>{
    if(!active){opacity(m,0);return;}
    const t=(time*.21+i/state.updraft.length)%1;
    m.position.set(state.a.x+Math.sin(t*TAU+i*.29)*.79,2.0+t*19.4,state.a.z+Math.cos(t*TAU+i*.23)*.65);
    m.scale.setScalar(1.07-.22*t);
    m.rotation.y=t*4.8+i*2.4;
    opacity(m,(roof?.34:.83)*Math.sin(t*Math.PI)**.61*(.76+.24*Math.sin(time*1.77+i)**2),time);
  });
}

function ballistics(state,age){
  const dummy=state.object;
  for(const {mesh,fragments,tile} of state.debris){
    mesh.visible=age>0&&age<3.85;
    if(!mesh.visible)continue;
    for(const [i,piece] of fragments.entries()){
      const {x,y,z,vx,vy,vz,size,time,spin}=piece;
      const a=Math.max(0,age-time);
      if(age<time)dummy.scale.setScalar(0);
      else{
        const floor=z+vz*a>-11.9?.04:-3.7;
        const height=Math.max(floor,y+a*vy-10.7*a*a);
        dummy.position.set(x+vx*a,height,z+vz*a);
        dummy.rotation.set(spin+a*4.05,vx*.6+a*3.1,spin+a*1.85);
        dummy.scale.set(size*(tile?1:2.6),size*(tile?.11:.31),size*(tile?.84:.58));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
}

function traceThreshold(state,landmark,game){
  const finale=game?.finale;
  const strip=state.threshold;
  const show=finale?.phase==='choice'&&finale.gateOpen>.78;
  if(!show){opacity(strip,0);return;}
  const local=landmark.worldToLocal(state.a.copy(game.p));
  const distance=Math.hypot(local.x*.70,local.z+7.21);
  const headingGap=Math.abs(local.y-6.3);
  const alpha=(1-smooth(distance,7.5,14.0))*smooth(headingGap,2.45,4.2);
  strip.position.set(0,6.30,-7.79);
  strip.scale.set(4.30,1,1.28);
  strip.rotation.y=Math.PI*.5;
  opacity(strip,alpha*.87,game.time);
}

function washClouds(state,game,age,crash,lock){
  const time=game?.time??0;
  state.doorsmoke.forEach((mesh,i)=>{
    const t=smooth(game?.finale?.gateOpen??0,.10,.85);
    const drift=(time*.14+i/state.doorsmoke.length)%1;
    const alpha=(crash||lock?0:.23)*t*(.30+.7*Math.sin(drift*Math.PI));
    mesh.position.set((i-3)*1.75+(i%2?-1:1)*drift*2.8,1.0+drift*.82,-8.65-drift*5);
    mesh.rotation.y=.32*Math.sin(i*3.9);
    mesh.scale.set(1.6+drift*3.7,.35+drift*.92,1);
    opacity(mesh,alpha,time);
  });
  state.nearMist.forEach((mesh,i)=>{
    const t=Math.max(0,age-(STOMP_LOAD+.045)-(i%3)*.039);
    const side=i%2?1:-1;
    mesh.position.set(side*(.73+t*(3.4+.46*i)),14.37+t*.55,-10.28+(i%3)*.27+t*.56);
    mesh.rotation.set(-.16,side*.30,side*.15);
    mesh.scale.set(.73+t*2.5,.18+t*.44,1);
    opacity(mesh,crash?smooth(t,.01,.13)*(1-smooth(t,.22,.55))*.45:0,time);
  });
  state.bearingDust.forEach((mesh,i)=>{
    const side=i<2?-1:1;
    const t=age-(i<2?.06:.12)-(i%2)*.032;
    const loaded=crash&&t>0;
    const step=Math.max(0,t);
    mesh.position.set(side*(6.71+step*(.65+.18*(i%2))),13.72-1.3*step-3.2*step*step,-10.70-step*.58);
    mesh.rotation.set(-.10,side*.23,side*.38);
    mesh.scale.set(.32+step*1.35,.21+step*.67,1);
    opacity(mesh,loaded?smooth(t,0,.085)*(1-smooth(t,.13,.46))*.60:0,time);
  });
  state.dust.forEach((mesh,i)=>{
    const first=i<8;
    const t=Math.max(0,age-STOMP_LOAD-(first?.12:.41)-(i%5)*.045);
    const speed=.66+.39*(i%4);
    const x=(i%2?-1:1)*((first?1.72:4.4)+t*speed*(first?5.2:3.2));
    const y=first?14.19+Math.min(1.35,t*.79)-4.8*smooth(t,.44,1.7):1.14+t*.7;
    mesh.position.set(x,y,-9.67-t*(first?.75:3.1)+(i%4)*.59);
    mesh.rotation.set(-.24+Math.sin(i*8.1)*.29,Math.sin(i*5.6)*.91,Math.sin(i*2.8)*.33);
    mesh.scale.set(1.06+t*(first?3.90:4.9),.43+t*(first?.96:.84),1);
    const rise=first?smooth(t,.012,.16):smooth(t,.48,.91);
    const fade=1-smooth(t,first?.36:1.02,first?1.84:2.58);
    opacity(mesh,crash?rise*fade*(.25+.12*(i%3)) : 0,time);
  });
  state.distantWash.forEach((mesh,i)=>{
    const drift=Math.min(2.8,age)*.86;
    const reveal=smooth(age,STOMP_LOAD+.28,1.46);
    const fade=1-smooth(age,2.1,3.65);
    mesh.position.set((i-2)*10.9-drift*(1+i*.11),7.2+(i%3)*2.3-drift*.4,11.9+(i%2)*6.8);
    mesh.rotation.set(-.17,-.12+(i%3)*.15,(i-2)*.045);
    mesh.scale.set(7.5+i*1.22,1.16+(i%3)*.56,1);
    opacity(mesh,crash?reveal*(.075+.09*fade):0,time);
  });
}

function measureLink(state,i,center,direction,roll,scale=.39){
  const {object}=state;
  object.position.copy(center);
  object.quaternion.setFromUnitVectors(UP,direction);
  object.rotateY(roll);
  object.scale.setScalar(scale);
  object.updateMatrix();
  state.links.setMatrixAt(i,object.matrix);
}

function shapeTaggedTether(state,landmark,finale,count){
  const age=finale.age;
  const {pin,hook,endpoint,witness,direction,bent,arc}=state.taggedTether;
  const latch=landmark.userData.finaleParts.latch;
  endpoint.set(latch.position.x+.05,latch.position.y+.31,latch.position.z-.19);

  // Pull the length from a stout block of the fallen door jamb.
  // Contact on the upper tread drives the shake as the chain pays out.
  const catchLoad=smooth(age,TETHER_TAUT-.30,TETHER_TAUT+.06);
  const unseat=smooth(age,TETHER_TAUT+.04,STOMP_CHAIN_RELEASE);
  const free=smooth(age,STOMP_CHAIN_RELEASE-.018,STOMP_DURATION-.02);
  const recoil=Math.max(0,age-TETHER_TAUT);
  const tremor=Math.sin(recoil*40.3)*Math.exp(-recoil*7.4)*smooth(age,TETHER_TAUT-.04,TETHER_TAUT+.035);
  const hinge=landmark.userData.finaleParts.doors[0].root;
  hinge.localToWorld(pin.set(4.80,.88,-.41));
  landmark.worldToLocal(pin);
  pin.x-=.91*free;
  pin.y-=.64*free;
  pin.z-=1.10*free;
  hook.set(lerp(-5.55,endpoint.x-.88,catchLoad*.66+unseat*.23),
    -.17+1.27*unseat,-13.27+.58*catchLoad+.46*unseat);
  pin.y+=.09*tremor;
  hook.y+=.17*tremor;
  const dropped=.84*free;
  witness.copy(hook).lerp(endpoint,.34+.38*unseat).lerp(pin,dropped);
  const direct=pin.distanceTo(endpoint),legs=pin.distanceTo(hook)+hook.distanceTo(endpoint);
  const referenceLength=12.1;
  // Solve sufficient slack before resampling by actual arc length, so a
  // strained or settled chain keeps the same visible links and spacing.
  const slack=clamp((referenceLength-lerp(legs,direct,catchLoad*.68))*.64,.18,5.7)
    *(1-.46*catchLoad)*(1-.12*unseat);
  const slackWeight=1-catchLoad*.66;
  const along=(t,out)=>{
    if(t<.44)bent.copy(pin).lerp(hook,t/.44);
    else bent.copy(hook).lerp(endpoint,(t-.44)/.56);
    out.copy(pin).lerp(endpoint,t).lerp(bent,slackWeight);
    const sag=Math.sin(Math.PI*t);
    out.y-=sag*(slack*.28+free*.49);
    out.y+=sag*.17*tremor;
    out.z-=sag*(slack*.77+free*.48);
    const bed=lerp(-3.75,0,clamp((out.z+15.7)/3.8,0,1));
    if(out.z<-11.9&&out.z>-15.7)out.y=Math.max(out.y,bed+.21);
    return out;
  };
  const samples=arc.length-1;
  let t2=0;
  along(0,state.c);
  for(let s=1;s<=samples;s++){
    along(s/samples,state.d);
    arc[s]=arc[s-1]+state.c.distanceTo(state.d);
    state.c.copy(state.d);
  }
  const links=15;
  const total=arc[samples];
  for(let i=0;i<links;i++){
    const pos=(i+.5)/links*total;
    while(t2<samples-1&&arc[t2+1]<pos)t2++;
    const t=(t2+clamp((pos-arc[t2])/Math.max(.001,arc[t2+1]-arc[t2]),0,1))/samples;
    along(t,state.c);
    along(t+.002,state.d).sub(along(t-.002,direction)).normalize();
    measureLink(state,count++,state.c,state.d,i*Math.PI*.50+.12*Math.sin(i*2.4)+.23*tremor,.39);
  }
  return count;
}

function swingCuff(cuff,landmark,contacts,age,catchTime,extend,force){
  const {side,root,jaws,target,axial,along,across,eye,basis,staple}=cuff;
  const ankle=side<0;
  const index=ankle?0:1;
  const point=(ankle?contacts?.ankle:contacts?.wingSeat)?.[index];
  if(!point)return false;

  landmark.worldToLocal(target.copy(point));
  const attached=(ankle?contacts.ankleAxis:contacts.wingAxis)?.[index]??(ankle?contacts.rear?.[index]:null);
  if(attached){
    landmark.worldToLocal(axial.copy(attached)).sub(target);
    const span=axial.length();
    axial.normalize();
    if(!ankle){
      // Seat the iron around the exposed upper wing, beyond the shoulder
      // socket. The chain must pull the wing rather than cross the chest.
      target.addScaledVector(axial,Math.min(.38,span*.34));
    }
  }
  else axial.set(ankle?.15:side,ankle?1:.22,ankle?.36:.32).normalize();
  if(axial.z<0)axial.negate();
  const latch=ankle?settle(age,catchTime-.078,catchTime+.091):settle(age,catchTime-.044,catchTime+.070);
  if(ankle){
    const entry=smooth(age,catchTime-.18,catchTime+.025);
    const exit=1-smooth(age,catchTime+.17,catchTime+.46);
    cuff.jawIron.uniforms.uGateGlint.value=entry*exit;
  }
  const nearing=settle(extend,.30,.96);
  root.position.copy(staple.position).lerp(target,extend);
  const bow=Math.sin(Math.PI*extend);
  root.position.x+=side*2.08*bow;
  root.position.y+=(ankle?2.42:3.28)*bow;
  root.position.z-=2.31*bow;
  // At contact the opening surrounds the limb and its own axis controls roll.
  // While travelling, the plane banks with the leading pull of the chain.
  axial.multiplyScalar(.48+.52*nearing);
  axial.z+=(1-nearing)*.72;
  axial.normalize();
  along.copy(root.position).sub(staple.position).addScaledVector(axial,-along.dot(axial));
  if(along.lengthSq()<.008)along.crossVectors(UP,axial);
  if(along.lengthSq()<.008)along.set(0,0,1);
  along.normalize();
  across.crossVectors(axial,along).normalize();
  root.quaternion.setFromRotationMatrix(basis.makeBasis(along,across,axial));
  const scale=(ankle?.55:lerp(.69,.64,latch))*(1-.065*force);
  root.scale.set(scale,scale,scale*(ankle?.71:.89));

  const after=Math.max(0,age-catchTime-.063);
  const tap=Math.sin(after*57)*Math.exp(-after*28)*.091;
  const opening=(ankle?.93:1.04)*(1-latch)+tap;
  jaws[0].rotation.z=-opening;
  jaws[1].rotation.z=opening;
  eye.copy(root.position).addScaledVector(along,-1.62*scale);
  root.visible=true;
  return true;
}

function chainLinks(state,landmark,game,contacts,crash,after){
  const finale=game?.finale;
  const age=finale?.age??0;
  const elapsed=finale?.elapsed??age;
  const binding=finale?.ending==='locked'&&age>.22;
  const falling=crash&&after>=STOMP_LOAD&&after<3.85;
  const tethered=finale?.secret&&(finale.phase==='choice'&&finale.cracked||
    finale.phase==='stomp'&&age<finale.impactAt+STOMP_LOAD);
  state.links.visible=binding||falling||tethered;
  for(const {root,staple} of state.cuffs){
    root.visible=false;
    staple.visible=finale?.ending==='locked';
  }
  if(!state.links.visible)return;
  let count=0;
  if(tethered){
    // The remnant of the long chain runs over the fractured beam and
    // through the cloud bank. Its links stay on the same route as it quivers.
    const beam=landmark.userData.finaleParts.fascia;
    const plane=beam[0]?.root;
    const contactY=plane ? plane.position.y+.44 : 14.58;
    const silhouette=finale.phase==='stomp'?smooth(age,finale.impactAt,finale.impactAt+.21):0;
    const signal=finale.phase==='choice'?Math.exp(-age*.52):0;
    const countToCloud=49;
    const touch=(t,out)=>{
      const drape=smooth(t,0,.35);
      const slack=smooth(t,.25,1);
      out.set(lerp(.28,-9.9,slack),lerp(contactY-.14*silhouette,3.32,drape)-10.4*slack,
        lerp(-10.78,-17.70,drape)-12.6*slack);
      out.y+=signal*.22*Math.sin(t*24-age*11)*Math.sin(t*Math.PI);
      return out;
    };
    for(let i=0;i<countToCloud;i++){
      const t=(i+.5)/countToCloud;
      touch(t,state.c);
      touch(t+.003,state.d).sub(state.c).normalize();
      measureLink(state,count++,state.c,state.d,i*Math.PI*.5+.14,.31-.075*t);
    }
  }
  for(const cuff of state.cuffs){
    const {side,staple}=cuff;
    const base=binding?state.a.copy(staple.position):state.a.set(side*5.06,1.61,-7.86);
    if(!binding&&!falling)continue;
    if(falling&&side<0){
      count=shapeTaggedTether(state,landmark,finale,count);
      continue;
    }
    if(falling&&age>3.82)continue;
    if(binding)base.z-=.18;
    const anchor=state.b;
    const catchTime=side<0?GATE_BIND.ankle:GATE_BIND.wing;
    const launchTime=side<0?.22:catchTime-.48;
    const extend=binding?Math.pow(smooth(age,launchTime,catchTime),.86):1;
    if(extend<=.015)continue;
    const wrench=binding?smooth(age,catchTime,catchTime+.13)*(1-smooth(age,catchTime+.19,catchTime+.53)):0;
    const struggle=binding?smooth(age,GATE_BIND.ankle+.57,GATE_BIND.wing-.12)*(1-smooth(age,GATE_BIND.wing+.11,GATE_BIND.wing+.39)):0;
    const tug=binding?(side<0?struggle:.55*smooth(age,GATE_BIND.wing+.18,GATE_BIND.wing+.45)
      *(1-smooth(age,GATE_BIND.wing+.55,GATE_BIND.latch-.24))):0;
    const settleLoad=binding?smooth(elapsed,LOCK_LANDING.skid,LOCK_LANDING.catch)
      *(1-smooth(elapsed,16.47,17.42)):0;
    const stopLoad=binding?smooth(elapsed,LOCK_SETTLE.load,LOCK_SETTLE.arrest):0;
    const stopRelease=stopLoad*(1-.60*smooth(elapsed,LOCK_SETTLE.arrest,LOCK_SETTLE.rest));
    const lastPull=binding?smooth(elapsed,9.54,10.13)*(1-smooth(elapsed,10.31,11.51)):0;
    const taut=binding?smooth(age,GATE_BIND.latch-.08,GATE_BIND.latch+.09)
      *(1-.19*smooth(age,GATE_BIND.latch+.62,GATE_BIND.latch+1.18))+.18*settleLoad+(side>0?.92:.64)*lastPull:0;
    if(binding){
      if(!swingCuff(cuff,landmark,contacts,age,catchTime,extend,Math.max(taut,tug)))continue;
      anchor.copy(cuff.eye);
      if(anchor.distanceToSquared(base)<.095){cuff.root.visible=false;continue;}
    }else{
      anchor.set(side*(.8+after*2.15),10.4-after*after*6.5,-10.39-after*3.5);
    }
    const wingLoad=binding&&side>0?smooth(age,catchTime+.04,catchTime+.29)*1.14:0;
    const wingRelease=wingLoad>0?1-smooth(age,catchTime+.34,catchTime+.59):0;
    const relay=binding?state.lockAtmosphere.relay(side,elapsed):null;
    const ground=landmark.userData.lockStairHeight??landmark.userData.roofStoneHeight;
    let length=base.distanceTo(anchor);
    const whip=binding?1-smooth(extend,.10,.97):0;
    const loose=binding?(1-Math.max(taut,tug))*(.72+.28*Math.sin(age*5.1)):0;
    const recoil=binding?Math.max(0,age-GATE_BIND.latch):0;
    const ring=binding?Math.sin(recoil*34)*Math.exp(-recoil*9)*taut:0;
    const along=(t,out)=>{
      out.copy(base).lerp(anchor,t);
      const arc=Math.sin(Math.PI*t);
      if(binding){
        const slung=Math.sin(Math.PI*extend)*(1.5+side*.28);
        out.y+=arc*(slung-loose*(.87+side*.15)+ring*(.55-.48*t));
        out.x+=arc*(side*(1.13*whip+.76*(1-taut))+Math.sin(t*13.4-age*18)*(.21*loose+.48*wrench));
        out.z+=arc*(-1.67*whip+Math.sin(t*7.2-age*16)*.39*wrench);
        // The catch takes up slack from the wing toward the fixed staple.
        // A narrow bend crosses the row of links ahead of that straight run.
        if(wingRelease>0){
          const fromWing=1-t;
          const load=smooth(wingLoad,fromWing,fromWing+.14)*wingRelease;
          out.lerp(state.lockChainLine.copy(base).lerp(anchor,t),.90*load);
          const bend=(1-smooth(Math.abs(wingLoad-fromWing),0,.17))*wingRelease;
          out.y+=arc*.33*bend;
        }
        // Both spans straighten against the established staples before
        // the body settles. Their endpoint positions still follow the cuffs.
        if(stopRelease>0){
          out.lerp(state.lockChainLine.copy(base).lerp(anchor,t),.91*stopRelease);
        }
        // The upper stair is a sloped stone bed extending out from the
        // sill. Preserve contact shadow without letting slack links burrow.
        const bed=lerp(-3.75,0,clamp((out.z+15.7)/3.8,0,1));
        if(relay)state.lockAtmosphere.applyRelay(t,out,base,anchor,relay,ground);
        else if(out.z<=-11.9&&out.z>=-15.7&&Math.abs(out.x)<11.4)out.y=Math.max(out.y,bed+.26);
      }else{
        out.y-=arc*2.9;
        out.x+=arc*Math.sin(t*9-age*7.8)*.39;
      }
      return out;
    };
    const arc=relay?.arc;
    let section=0;
    if(arc){
      const samples=arc.length-1;
      along(0,state.c);
      for(let i=1;i<=samples;i++){
        along(i/samples,state.d);
        arc[i]=arc[i-1]+state.c.distanceTo(state.d);
        state.c.copy(state.d);
      }
      length=arc[samples];
    }
    const n=Math.min(60,Math.ceil((length+whip*1.45)/(binding?.46:.54)));
    if(binding)state.lockAtmosphere.trace(side,along);
    for(let i=0;i<n;i++){
      let t=(i+.50)/n;
      if(arc){
        const distance=t*length;
        while(arc[section+1]<distance)section++;
        t=(section+clamp((distance-arc[section])/Math.max(.001,arc[section+1]-arc[section]),0,1))/(arc.length-1);
      }
      along(t,state.c);
      along(t+.003,state.d).sub(state.c).normalize();
      const gauge=binding?lerp(.36,.30,smooth(t,.24,1)):.39;
      measureLink(state,count++,state.c,state.d,i*Math.PI*.5+.13*Math.sin(i*2.8)+side*.24,gauge);
    }
  }
  state.links.count=count;
  state.links.instanceMatrix.needsUpdate=true;
}

function writeCourt(state,finale){
  const {podium,upright,paper,heading,characters,seal,threads,stamp,stampWash,ties,tally}=state.paper;
  podium.visible=finale?.phase==='audience'||finale?.phase==='blessing';
  presentRainTally(tally,finale);
  if(!podium.visible)return;
  const t=finale.phase==='audience'?finale.age:5;
  const unroll=smooth(t,1.04,2.19);
  paper.scale.x=.08+unroll*.92;
  threads.scale.x=paper.scale.x;
  opacity(threads,unroll*.59,t);
  heading.material.uniforms.uReveal.value=unroll*1.07;
  const inscription=finale.inscriptionAt??2.30;
  characters.material.uniforms.uReveal.value=1.05*smooth(t,inscription,inscription+1.17);
  const mark=t-COURT_SEAL_AT;
  const after=Math.max(0,mark);
  const contact=smooth(mark,-.035,.045)*(1-smooth(mark,.15,.34));
  const tremble=Math.sin(after*17)*Math.exp(-after*5.4);
  upright.rotation.x=-.24-.028*contact-.021*tremble;
  for(const {side,swivel,cord} of ties){
    swivel.visible=unroll>.33;
    swivel.position.x=side*(.88+1.44*unroll);
    const lag=Math.max(0,after-(side<0?.025:.058));
    const swing=Math.sin(lag*10.7)*Math.exp(-lag*4.7);
    swivel.rotation.z=side*(.03*Math.sin(t*6.6)*(1-unroll)+.24*swing);
    swivel.rotation.x=.18*swing+.15*contact;
    opacity(cord,smooth(unroll,.30,.82)*.83,t);
  }
  const press=settle(mark,-.24,-.005);
  const lift=settle(mark,.09,.36);
  stamp.visible=mark>-.24&&mark<.39;
  stamp.position.set(seal.position.x+.08*(1-press)+.31*lift,seal.position.y+.32*(1-press)+.62*lift,
    seal.position.z+.57*(1-press)+.66*lift);
  stamp.rotation.set(1.07+(Math.PI*.5-1.07)*press-.24*lift,-.12+.12*press,.08*(1-press)+.15*lift);
  seal.material.uniforms.uReveal.value=1.26*smooth(mark,.075,.30);
  opacity(seal,smooth(mark,.069,.113));
  const bloom=smooth(mark,.026,.12)*(1-smooth(mark,.22,.50));
  stampWash.scale.setScalar(.19+.29*smooth(mark,.025,.39));
  opacity(stampWash,bloom*.37,t);
}

function drawBeamContact(state,finale,contacts,landmark){
  const age=finale?.age??0;
  const impact=finale?.impactAt??0;
  state.contactDust.forEach((mesh,i)=>{
    const side=i%2;
    const landAt=impact+side*STOMP_PAW_GAP;
    const holding=finale?.phase==='stomp'
      ? smooth(age,landAt,landAt+.095)*(1-smooth(age,impact+STOMP_LOAD-.03,impact+STOMP_LOAD+.19)) : 0;
    const paw=contacts?.front?.[side];
    if(!holding||!paw){opacity(mesh,0);return;}
    landmark.worldToLocal(state.a.copy(paw));
    const ageFromPaw=Math.max(0,age-landAt);
    const drift=(i<2?1:-1)*(.31+ageFromPaw*1.03);
    const crest=landmark.userData.finaleParts.fascia[side].heightAt?.(paw.x,paw.z);
    if(Number.isFinite(crest))state.a.y+=crest-paw.y;
    // The short pale plume comes up on the far side of each planted
    // paw, while the compressed crown under it stays dark.
    mesh.position.set(state.a.x+drift,state.a.y+.105+ageFromPaw*.36,state.a.z+(i<2?.35:.48));
    mesh.rotation.set(-.21,-.12,drift*.37);
    mesh.scale.set(.58+ageFromPaw*.89,.17+ageFromPaw*.32,1);
    opacity(mesh,holding*(i<2?.85:.61),age);
  });
}

export function updateHeavenFinale(landmark,game,_dt,contacts,beamPrepared){
  if(!landmark?.userData.finaleParts)return;
  const parts=landmark.userData.finaleParts;
  if(!landmark.userData.finale){
    landmark.userData.finale=landmark.userData.finaleFactory();
  }
  const state=landmark.userData.finale;
  const finale=game?.finale;
  const crash=finale?.ending==='dragon-king';
  const lock=finale?.ending==='locked';
  const after=crash?(finale.phase==='stomp'?Math.max(0,finale.age-finale.impactAt):3.5):0;
  moveGate(parts,finale,crash,after,beamPrepared,state.eaves,state.purlins,landmark.userData.upperStairHeight,landmark.userData.roofStoneHeight);
  dropBeamKeys(state,finale,after);
  drawBrokenGrain(state.grain,parts.fascia,crash,after-STOMP_LOAD);
  for(const shoe of state.receivers)shoe.visible=lock;
  displayWeather(state,landmark,finale);
  drawUpdraft(state,landmark,game,finale,game?.time??0);
  ballistics(state,Math.max(0,after-STOMP_LOAD));
  drawRoofScuff(state,parts,after-STOMP_LOAD);
  traceThreshold(state,landmark,game);
  washClouds(state,game,after,crash,lock);
  drawBeamContact(state,finale,contacts,landmark);
  state.lockAtmosphere.update(finale,landmark);
  chainLinks(state,landmark,game,contacts,crash,after);
  writeCourt(state,finale);
}
