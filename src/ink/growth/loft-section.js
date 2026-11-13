import * as THREE from 'three';
import {Profile,zipper} from './growth-utils.js';
import {modifyMaterial} from './curve-field.js';
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const nextPower=x=>2**Math.ceil(Math.log2(Math.max(2,x)));

export class LoftSection {
 constructor(owner,data,zone){
  this.owner=owner;this.root=owner.root;this.shared=owner.shared;this.data=data;this.zone=zone;this.headZ=owner.headZ;this.a=this.headZ-data.frontCutZ;this.b=this.headZ-data.rearCutZ;this.extra=0;this.spacing=.012;this.radial=64;this.stride=65;this.rings=0;this.capacity=0;
  this.front=new Profile(data.profiles.front);this.middleProfile=new Profile(data.profiles.middle);this.rear=new Profile(data.profiles.rear);
  this.canonicalRefs=Array.from({length:this.stride},(_,i)=>this.middleProfile.ref(i/this.radial*TAU));this.frontRefs=this.canonicalRefs.map((_,i)=>this.front.ref(i/this.radial*TAU));this.rearRefs=this.canonicalRefs.map((_,i)=>this.rear.ref(i/this.radial*TAU));
  this.profileSamples=this.canonicalRefs.map((ref,i)=>{const a=this.frontRefs[i],b=this.rearRefs[i],pa=this.front.value(a,'p'),pb=this.rear.value(b,'p'),pc=this.middleProfile.value(ref,'p'),na=this.front.value(a,'n').normalize(),nb=this.rear.value(b,'n').normalize(),nc=this.middleProfile.value(ref,'n');nc.z=0;nc.normalize();return{pa,pb,pc,na,nb,nc,poseA:pa.clone(),poseB:pb.clone(),normalA:na.clone(),normalB:nb.clone()};});
  this.gray=modifyMaterial(new THREE.MeshStandardMaterial({color:'#aeb9b5',roughness:.94,side:THREE.DoubleSide}),this.shared,true);this.colorTexture=this.makeColorTexture(owner.body.userData.originalMaterial.map);this.ink=modifyMaterial(new THREE.MeshBasicMaterial({map:this.colorTexture,side:THREE.DoubleSide,toneMapped:false}),this.shared,true);
  this.midMesh=new THREE.Mesh(new THREE.BufferGeometry(),this.gray);this.midMesh.frustumCulled=false;this.midMesh.name='Growing_'+data.name;this.root.add(this.midMesh);this._reserve(8);this._setLength(0);
 }
 update(extra){
  this.front.updatePose(this.owner.body);this.rear.updatePose(this.owner.body);for(let i=0;i<this.stride;i++){const s=this.profileSamples[i];this.front.value(this.frontRefs[i],'p',true,s.poseA);this.rear.value(this.rearRefs[i],'p',true,s.poseB);this.front.value(this.frontRefs[i],'n',true,s.normalA).normalize();this.rear.value(this.rearRefs[i],'n',true,s.normalB).normalize();}
  if(Math.abs(extra-this.extra)>1e-8||!this.rings)this._setLength(extra);this._boundary(this.front,0,0,false);for(let i=0;i<Math.min(this.rings,6);i++)this._canonicalRing(i);for(let i=Math.max(6,this.rings-6);i<this.rings;i++)this._canonicalRing(i);const offset=this.front.ring.length+this.rings*this.stride;this._boundary(this.rear,offset,this.extra,true);this._markVertices(0,this.front.ring.length+Math.min(this.rings,6)*this.stride);const start=this.front.ring.length+Math.max(0,this.rings-6)*this.stride;this._markVertices(start,offset+this.rear.ring.length-start);
 }
 setMaterial(mode){this.midMesh.material=mode==='gray'?this.gray:this.ink;}
 surface(distance,angle){
  const part=(angle/TAU%1+1)%1*this.radial,i=Math.min(this.radial-1,Math.floor(part)),t=part-i,s=this.profileSamples[i],v=this.profileSamples[i+1],[wa,wb]=this._mixAt(distance),wc=1-wa-wb;const mix=(a,b)=>a+(b-a)*t;return new THREE.Vector3(mix(s.poseA.x,v.poseA.x)*wa+mix(s.poseB.x,v.poseB.x)*wb+mix(s.pc.x,v.pc.x)*wc,mix(s.poseA.y,v.poseA.y)*wa+mix(s.poseB.y,v.poseB.y)*wb+mix(s.pc.y,v.pc.y)*wc,this.headZ-distance+mix(s.poseA.z-s.pa.z,v.poseA.z-v.pa.z)*wa+mix(s.poseB.z-s.pb.z,v.poseB.z-v.pb.z)*wb);
 }
 makeColorTexture(map){
  if(!map?.image){const t=new THREE.DataTexture(new Uint8Array([180,180,180,255]),1,1);t.needsUpdate=true;return t;}
  const image=map.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  const width=512,out=new Uint8Array(width*3*4),color=new THREE.Color();
  const pointColor=p=>{
   const x=clamp(p.uv[0])*(canvas.width-1),y=clamp(p.uv[1])*(canvas.height-1),ix=Math.floor(x),iy=Math.floor(y);const value=[0,0,0];
   for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
    const k=(Math.min(canvas.height-1,iy+dy)*canvas.width+Math.min(canvas.width-1,ix+dx))*4,w=(dx?x-ix:1-x+ix)*(dy?y-iy:1-y+iy);color.setRGB(pixels[k]/255,pixels[k+1]/255,pixels[k+2]/255,THREE.SRGBColorSpace);value[0]+=color.r*w;value[1]+=color.g*w;value[2]+=color.b*w;
   }return value;
  };
  [this.front,this.middleProfile,this.rear].forEach((profile,row)=>{
   const colors=profile.raw.map(pointColor);
   for(let i=0;i<width;i++){
    const ref=profile.ref((i+.5)/width*TAU),c=colors[ref.i].map((v,j)=>v+(colors[ref.j][j]-v)*ref.t);color.setRGB(...c).convertLinearToSRGB();const k=(row*width+i)*4;out[k]=Math.round(clamp(color.r)*255);out[k+1]=Math.round(clamp(color.g)*255);out[k+2]=Math.round(clamp(color.b)*255);out[k+3]=255;
   }
  });
  const texture=new THREE.DataTexture(out,width,3,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.wrapS=THREE.RepeatWrapping;texture.needsUpdate=true;return texture;
 }

 _reserve(required){
  if(required<=this.capacity)return;
  const oldGeometry=this.midMesh.geometry;this.capacity=nextPower(required);const vertexCount=this.front.ring.length+this.capacity*this.stride+this.rear.ring.length;
  this.position=new THREE.BufferAttribute(new Float32Array(vertexCount*3),3).setUsage(THREE.DynamicDrawUsage);this.normal=new THREE.BufferAttribute(new Float32Array(vertexCount*3),3).setUsage(THREE.DynamicDrawUsage);
  this.uv=new THREE.BufferAttribute(new Float32Array(vertexCount*2),2);this.profileMix=new THREE.BufferAttribute(new Float32Array(vertexCount*2),2).setUsage(THREE.DynamicDrawUsage);const growth=new THREE.BufferAttribute(new Float32Array(vertexCount*3),3);for(let i=0;i<vertexCount;i++)growth.setX(i,this.zone);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',this.position);geometry.setAttribute('normal',this.normal);geometry.setAttribute('uv',this.uv);geometry.setAttribute('aProfileMix',this.profileMix);geometry.setAttribute('aGrowth',growth);
  const angles=Array.from({length:this.stride},(_,i)=>i/this.radial*TAU);
  this.frontZip=zipper(this.front.ring.map(r=>r.angle),angles,0,this.front.ring.length);
  this.indexArray=new Uint32Array(this.frontZip.length+this.capacity*this.radial*6+(this.rear.ring.length+this.stride)*3);this.indexArray.set(this.frontZip);
  geometry.setIndex(new THREE.BufferAttribute(this.indexArray,1).setUsage(THREE.DynamicDrawUsage));this.midMesh.geometry=geometry;oldGeometry.dispose();
  for(let i=0;i<this.capacity;i++){this._canonicalRing(i);if(i<this.capacity-1)this._strip(i);}
  this.rings=0;
 }
 _strip(i){
  let k=this.frontZip.length+i*this.radial*6;const a=this.front.ring.length+i*this.stride,b=a+this.stride;
  for(let j=0;j<this.radial;j++){this.indexArray[k++]=a+j;this.indexArray[k++]=b+j;this.indexArray[k++]=a+j+1;this.indexArray[k++]=b+j;this.indexArray[k++]=b+j+1;this.indexArray[k++]=a+j+1;}
 }
 _mixAt(distance){
  const length=this.b-this.a+this.extra,width=Math.min(.046,length*.40);
  return[1-smooth(0,width,distance-this.a),1-smooth(0,width,this.b+this.extra-distance)];
 }
 _canonicalRing(i){
  const start=this.front.ring.length+i*this.stride,d=this.a+(i+1)*this.spacing,[wa,wb]=this._mixAt(d),wc=1-wa-wb;
  const n=new THREE.Vector3();
  for(let j=0;j<this.stride;j++){
   const s=this.profileSamples[j],x=s.poseA.x*wa+s.poseB.x*wb+s.pc.x*wc,y=s.poseA.y*wa+s.poseB.y*wb+s.pc.y*wc,z=this.headZ-d+(s.poseA.z-s.pa.z)*wa+(s.poseB.z-s.pb.z)*wb;
   n.copy(s.normalA).multiplyScalar(wa).addScaledVector(s.normalB,wb).addScaledVector(s.nc,wc).normalize();
   const index=start+j;this.position.setXYZ(index,x,y,z);this.normal.setXYZ(index,n.x,n.y,n.z);this.uv.setXY(index,j/this.radial,.5);this.profileMix.setXY(index,wa,wb);
  }
 }
 _markVertices(start,count){
  if(count<=0)return;for(const a of[this.position,this.normal,this.uv,this.profileMix]){a.addUpdateRange(start*a.itemSize,count*a.itemSize);a.needsUpdate=true;}
 }
 _boundary(profile,start,shift,rear){
  const p=new THREE.Vector3(),n=new THREE.Vector3();for(let i=0;i<profile.ring.length;i++){
   const ref=profile.ring[i];profile.value(ref,'p',true,p);profile.value(ref,'n',true,n).normalize();this.position.setXYZ(start+i,p.x,p.y,p.z-shift);this.normal.setXYZ(start+i,n.x,n.y,n.z);this.uv.setXY(start+i,ref.angle/TAU,.5);this.profileMix.setXY(start+i,rear?0:1,rear?1:0);
  }
 }
 _setLength(extra){
  this.extra=extra;const required=Math.max(2,Math.ceil((this.b-this.a+extra)/this.spacing)-1);const old=this.rings;this._reserve(required);const before=Math.min(old,this.rings);
  this.rings=required;
  const first=Math.max(0,before-6);for(let i=first;i<required;i++)this._canonicalRing(i);this._markVertices(this.front.ring.length+first*this.stride,(required-first)*this.stride);
  if(old!==required||before===0){
   for(let i=Math.max(0,Math.min(old,required)-3);i<Math.min(this.capacity-1,Math.max(old,required)+2);i++)this._strip(i);
   const offset=this.front.ring.length+required*this.stride,angles=Array.from({length:this.stride},(_,j)=>j/this.radial*TAU);
   const rearZip=zipper(angles,this.rear.ring.map(r=>r.angle),this.front.ring.length+(required-1)*this.stride,offset),indexStart=this.frontZip.length+(required-1)*this.radial*6;this.indexArray.set(rearZip,indexStart);
   this.midMesh.geometry.setDrawRange(0,indexStart+rearZip.length);const begin=this.frontZip.length+Math.max(0,Math.min(old,required)-3)*this.radial*6,end=Math.min(this.indexArray.length,this.frontZip.length+(Math.max(old,required)+3)*this.radial*6+rearZip.length);this.midMesh.geometry.index.addUpdateRange(begin,end-begin);this.midMesh.geometry.index.needsUpdate=true;
  }
  
 }


}
