import * as THREE from 'three';
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const nextPower=x=>2**Math.ceil(Math.log2(Math.max(2,x)));

export function mixWeights(a,b,t){
 const weights=new Map();for(let i=0;i<4;i++){weights.set(a.j[i],(weights.get(a.j[i])||0)+a.w[i]*(1-t));weights.set(b.j[i],(weights.get(b.j[i])||0)+b.w[i]*t);}
 const entries=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=entries.reduce((s,e)=>s+e[1],0);
 return{j:entries.map(e=>e[0]).concat(Array(4-entries.length).fill(0)),w:entries.map(e=>e[1]/total).concat(Array(4-entries.length).fill(0))};
}
export function interpolateVertex(a,b,t){
 let mane=[-1,0];if(a.mane&&b.mane){if(a.mane[0]===b.mane[0])mane=[a.mane[0],a.mane[1]+(b.mane[1]-a.mane[1])*t];else mane=a.mane[1]*(1-t)>b.mane[1]*t?[a.mane[0],a.mane[1]*(1-t)]:[b.mane[0],b.mane[1]*t];}
 return{p:a.p.map((v,i)=>v+(b.p[i]-v)*t),n:a.n.map((v,i)=>v+(b.n[i]-v)*t),uv:a.uv.map((v,i)=>v+(b.uv[i]-v)*t),mane,...mixWeights(a,b,t),front:a.front+(b.front-a.front)*t,rear:a.rear+(b.rear-a.rear)*t,head:a.head+(b.head-a.head)*t};
}
export function clipPolygon(vertices,z,keepGreater){
 const out=[];for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],insideA=keepGreater?a.p[2]>=z:a.p[2]<=z,insideB=keepGreater?b.p[2]>=z:b.p[2]<=z;
  if(insideA)out.push(a);if(insideA!==insideB)out.push(interpolateVertex(a,b,(z-a.p[2])/(b.p[2]-a.p[2])));
 }return out;
}

export class Profile {
 constructor(data){
  this.raw=data.points;this.center=data.center;
  this.order=this.raw.map((p,i)=>({i,angle:(Math.atan2(p.p[1]-this.center[1],p.p[0]-this.center[0])+TAU)%TAU})).sort((a,b)=>a.angle-b.angle);
  this.ring=[this.ref(0),...this.order.filter(p=>p.angle>1e-7).map(p=>({i:p.i,j:p.i,t:0,angle:p.angle})),this.ref(TAU)];
  this.poseP=this.raw.map(p=>new THREE.Vector3(...p.p));this.poseN=this.raw.map(p=>new THREE.Vector3(...p.n));
 }
 ref(angle){
  let theta=((angle%TAU)+TAU)%TAU,hi=this.order.findIndex(p=>p.angle>=theta);if(hi<0)hi=0;
  const lo=(hi+this.order.length-1)%this.order.length,a=this.order[lo],b=this.order[hi];let aa=a.angle,bb=b.angle;
  if(hi===0){aa-=TAU;if(theta>bb)theta-=TAU;}
  return{i:a.i,j:b.i,t:clamp((theta-aa)/(bb-aa)),angle};
 }
 value(ref,field,posed=false,out=new THREE.Vector3()){
  if(posed){const array=field==='p'?this.poseP:this.poseN;return out.copy(array[ref.i]).lerp(array[ref.j],ref.t);}
  const a=this.raw[ref.i][field],b=this.raw[ref.j][field];return out.set(a[0]+(b[0]-a[0])*ref.t,a[1]+(b[1]-a[1])*ref.t,a[2]+(b[2]-a[2])*ref.t);
 }
 updatePose(mesh){
  const bones=mesh.skeleton.boneMatrices,bind=mesh.bindMatrix,unbind=mesh.bindMatrixInverse,bind3=new THREE.Matrix3().setFromMatrix4(bind),unbind3=new THREE.Matrix3().setFromMatrix4(unbind);
  const source=new THREE.Vector3(),v=new THREE.Vector3(),n=new THREE.Vector3(),tmp=new THREE.Vector3(),matrix=new THREE.Matrix4(),matrix3=new THREE.Matrix3();
  for(let k=0;k<this.raw.length;k++){
   const p=this.raw[k];source.set(...p.p).applyMatrix4(bind);n.set(...p.n).applyMatrix3(bind3);v.set(0,0,0);const normal=new THREE.Vector3();
   for(let j=0;j<4;j++)if(p.w[j]>0){matrix.fromArray(bones,p.j[j]*16);matrix3.setFromMatrix4(matrix);v.addScaledVector(tmp.copy(source).applyMatrix4(matrix),p.w[j]);normal.addScaledVector(tmp.copy(n).applyMatrix3(matrix3),p.w[j]);}
   this.poseP[k].copy(v).applyMatrix4(unbind);this.poseN[k].copy(normal).applyMatrix3(unbind3).normalize();
  }
 }
}

export function zipper(anglesA,anglesB,offsetA,offsetB){
 const result=[];let i=0,j=0;
 while(i<anglesA.length-1||j<anglesB.length-1){
  const nextA=i<anglesA.length-1?anglesA[i+1]:Infinity,nextB=j<anglesB.length-1?anglesB[j+1]:Infinity;
  if(nextA<=nextB){result.push(offsetA+i,offsetB+j,offsetA+i+1);i++;}
  else{result.push(offsetA+i,offsetB+j,offsetB+j+1);j++;}
 }return result;
}

