import * as THREE from 'three';
import { random } from '../rules.js';
import { frontierPassage, passageLimits } from '../world-frontier.js';
import { surfaceHeightSampler } from './warnings.js';

const { smoothstep } = THREE.MathUtils;
const inkStroke = /* glsl */ `
  uniform float uTime,uOpacity,uAligned;
  varying vec2 vUv;
  float tooth(vec2 p){
    vec3 q=fract(vec3(p.xyx)*.1031);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
  }
  float washNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(tooth(i),tooth(i+vec2(1.,0.)),f.x),mix(tooth(i+vec2(0.,1.)),tooth(i+1.),f.x),f.y);
  }
  void main(){
    float side=abs(vUv.y*2.-1.);
    float time=uTime*.42;
    float warp=washNoise(vec2(vUv.x*7.-time,vUv.y*5.));
    float bristles=washNoise(vec2(vUv.x*16.-time*1.6,vUv.y*11.+warp));
    float torn=1.-smoothstep(.33,.99,side+(bristles-.5)*.32);
    float tip=smoothstep(.0,.19,vUv.x)*(1.-smoothstep(.64,1.,vUv.x));
    float pulse=.53+.47*smoothstep(.24,.79,warp);
    float cut=smoothstep(.35,.84,bristles);
    #ifdef PASSAGE
      float grain=.58+.42*smoothstep(.21,.74,bristles);
      float dryEdge=smoothstep(.47,.93,side)*smoothstep(.62,.89,warp);
      float load=(.83+.17*uAligned)*grain;
      gl_FragColor=vec4(mix(.24,.38,warp),.11+dryEdge*.58,.34,torn*tip*load*uOpacity);
    #elif defined(FALLS)
      float fiber=washNoise(vec2(vUv.x*5.9-time*1.82,vUv.y*16.+warp*.37));
      float sheet=(1.-smoothstep(.32,.79,side))*smoothstep(.40,.79,fiber);
      float source=smoothstep(.0,.065,vUv.x);
      float vapor=1.-smoothstep(.79,.99,vUv.x);
      gl_FragColor=vec4(.69+.23*sheet,.72+.27*sheet,.38,torn*pulse*source*vapor*.93);
    #else
      float deposit=smoothstep(.26,.68,bristles)*.52;
      gl_FragColor=vec4(.56+.28*warp,.21+deposit,.32,torn*tip*pulse*.53);
    #endif
  }
`;

function material(kind) {
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    uniforms:{uTime:{value:0},uOpacity:{value:1},uAligned:{value:0}},
    defines:kind?{[kind]:1}:{},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:inkStroke,
  });
}

function ribbon(site, paint, count, divisions, positionAt) {
  const position=[],uv=[],indices=[];
  for(let ribbon=0;ribbon<count;ribbon++){
    const first=position.length/3;
    for(let i=0;i<=divisions;i++){
      const t=i/divisions;
      for(const side of [-1,1]){
        const [u,y,v]=positionAt(ribbon,t,side);
        position.push(u*site.cosine+v*site.sine,y,-u*site.sine+v*site.cosine);
        uv.push(t,side*.5+.5);
      }
      if(i){
        const a=first+(i-1)*2;
        indices.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  const mesh=new THREE.Mesh(geometry,paint);
  mesh.position.set(site.x,0,site.z);
  mesh.userData.inkIdSuppressed=true;
  mesh.userData.frontierMaterial=true;
  mesh.renderOrder=4;
  return mesh;
}

function tidalBrush(root, site) {
  const paint=material();
  const brush=ribbon(site,paint,11,19,(strand,t,side)=>{
    const edge=strand%2===0?-1:1;
    const row=Math.floor(strand/2);
    const bank=site.width*(.57+.075*row);
    const move=Math.sin(t*Math.PI)*Math.sin(t*3.1+row*.91)*1.1;
    const gap=(.20+.34*Math.sin(t*Math.PI)**.6)*(.74+row*.065);
    const v=(t-.5)*(22+row*2.7)+row*1.65-2.0;
    const u=edge*(bank + move + side*gap);
    return [u,.05,v];
  });
  brush.name='石门夹潮水笔';
  root.add(brush);
  return brush;
}

function waterfalls(root, site, heightAt) {
  const paint=material('FALLS'), mistPaint=material();
  const roll=random(Math.round(site.phase*1e6));
  const coordinate=(u,v)=>[site.x+u*site.cosine+v*site.sine,site.z-u*site.sine+v*site.cosine];
  const ground=(u,v)=>heightAt(...coordinate(u,v));
  const drops=[{side:site.side,v:4.5,width:1.66},{side:-site.side,v:-7.2,width:1.40}];
  for(const drop of drops){
    const {side:edge,v,width}=drop;
    const spread=site.width + (edge===site.side ? 6.5 : 7.2);
    const h0=ground(spread*edge,v);
    const startY=Number.isFinite(h0)?h0-.26:0;
    if(startY<4)continue;
    const falls=ribbon(site,paint,2,28,(strand,t,side)=>{
      const slip=(1-(1-t)**2)*3.0 + t**2.2*2.6;
      const out=(spread-slip-(strand? .11 : 0))*edge;
      const s=(strand-.5)*width*.59+side*width*(.44+t*.34);
      const drift=.39*Math.sin(t*3.9+strand)*t;
      const down=(1-t**1.26)*startY;
      const cliff=ground(out,v+s+drift);
      return [out,Math.max(Number.isFinite(cliff)?cliff+.11:-.02,down),v+s+drift];
    });
    falls.name='双瀑落水';
    root.add(falls);
    const shift=roll()*.73;
    const mist=ribbon(site,mistPaint,7,18,(strand,t,side)=>{
      const arc=(t-.5)*Math.PI*1.1;
      const reach=1.25+strand*.65;
      const u=(site.width-.8-reach*Math.cos(arc)+side*.25)*edge;
      const z=v+Math.sin(arc)*reach+shift;
      const base=ground(u,z);
      return [u,Math.max(Number.isFinite(base)?base+.12:0,.07)+.055*Math.sin(t*Math.PI),z];
    });
    mist.name='瀑脚水雾';
    root.add(mist);
  }
  if(!root.children.some(node=>node.material===paint))paint.dispose();
  if(!root.children.some(node=>node.material===mistPaint))mistPaint.dispose();
}

function passageBrush(root, site) {
  const limits=passageLimits(site);
  const distance=site.length+limits.mouthOffset;
  const spacing=site.kind==='split-falls'?8.5:6.2;
  const tint=site.kind==='split-falls'?'#7c956f':'#8ca093';
  const marks=[];
  for(const direction of [-1,1]){
    const paint=material('PASSAGE');
    const mesh=ribbon(site,paint,6,20,(strand,t,side)=>{
      const row=Math.floor(strand/2),edge=strand%2?1:-1;
      const progress=-distance+2+row*spacing;
      const spine=.31+limits.halfWidth*Math.sin(t*Math.PI*.52)**.96;
      const tip=1.85*(1-t)**.86;
      const width=side*(.25+.23*Math.sin(t*Math.PI));
      const u=edge*(spine+width*.45);
      const y=limits.height-.49+row*.20-Math.sin(t*2.2)*.24+width*.73;
      return [u,y,(progress+tip-width*.58)*direction];
    });
    mesh.name=direction>0?'通道入口引路墨痕':'通道背面引路墨痕';
    mesh.userData.inkTint=tint;
    mesh.visible=false;
    root.add(mesh);
    marks.push({mesh,direction,distance});
  }
  root.userData.passage={site,marks,direction:null};
}

function updatePassage(route,time,water,focus) {
  const {site,marks}=route;
  const range=(focus.x-site.x)**2+(focus.z-site.z)**2;
  const nearby=range<74**2;
  if(!nearby){
    route.direction=null;
    for(const {mesh} of marks)mesh.visible=false;
    return;
  }
  const passage=frontierPassage(site,focus,route.direction);
  const {progress,across,aligned,centered}=passage;
  route.direction=passage.direction;
  for(const {mesh,direction,distance} of marks){
    const justEntered=progress>-distance-3&&centered;
    const finished=progress>distance+3;
    const opacity=(1-smoothstep(Math.sqrt(range),55,74))*(justEntered?.58:.88);
    mesh.visible=direction===passage.direction&&!finished&&progress< -11;
    mesh.material.uniforms.uOpacity.value=opacity*(1-smoothstep(Math.abs(across),21,51));
    mesh.material.uniforms.uAligned.value=Number(aligned);
    if(mesh.visible&&site.kind==='reef-gate'&&mesh.userData.surfaceAt!==time){
      mesh.userData.surfaceAt=time;
      const position=mesh.geometry.attributes.position;
      mesh.userData.restY??=Array.from({length:position.count},(_,i)=>position.getY(i));
      const sample=surfaceHeightSampler(water,0);
      for(let i=0;i<position.count;i++){
        const surface=sample(site.x+position.getX(i),site.z+position.getZ(i));
        position.setY(i,Math.max(.16+mesh.userData.restY[i],surface+.12));
      }
      position.needsUpdate=true;
      mesh.geometry.computeBoundingSphere();
    }
  }
}

export function addFrontierLandmark(root, site, heightAt) {
  if (site.kind === 'reef-gate') root.userData.tidalBrush=tidalBrush(root,site);
  else waterfalls(root,site,heightAt);
  passageBrush(root,site);
}

export function updateFrontierLandmark(root, time, water, focus) {
  if(root.userData.passage)updatePassage(root.userData.passage,time,water,focus);
  const tidal=root.userData.tidalBrush;
  if(tidal){
    const near=(tidal.position.x-focus.x)**2+(tidal.position.z-focus.z)**2 < 64**2;
    tidal.visible=near;
    if(near && tidal.userData.surfaceAt !== time){
      tidal.userData.surfaceAt=time;
      const sample=surfaceHeightSampler(water,.02);
      const position=tidal.geometry.attributes.position;
      for(let i=0;i<position.count;i++){
        const x=tidal.position.x+position.getX(i),z=tidal.position.z+position.getZ(i);
        position.setY(i,sample(x,z)+.052);
      }
      position.needsUpdate=true;
      tidal.geometry.computeBoundingSphere();
    }
  }
  for(const node of root.children){
    if(node.userData.frontierMaterial)node.material.uniforms.uTime.value=time;
  }
}
