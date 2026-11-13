import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {classifyYinglongWings} from './wing-partition.js';

// Optional geometry study. This is asset authoring, separate from ink rendering.
// Coordinates describe anatomy and feather surfaces, never sampled artwork color.
function triangleSubset(source,selected){
  const result=new THREE.BufferGeometry();
  for(const name of ['position','normal']){
    const attribute=source.attributes[name],data=new Float32Array(selected.length*3);
    for(let i=0;i<selected.length;i++){const j=selected[i];data.set([attribute.getX(j),attribute.getY(j),attribute.getZ(j)],i*3);}
    result.setAttribute(name,new THREE.Float32BufferAttribute(data,3));
  }
  return result;
}

export function createYinglongStudy(source){
  const root=source.clone(true);root.name='Yinglong authored geometry study';
  const meshes=[];root.traverse(m=>{if(m.isMesh){m.geometry=m.geometry.clone();meshes.push(m);}});
  const sourceWings=[],keratinParts=[],partitions=[];
  for(const mesh of meshes){
    const geometry=mesh.geometry,p=geometry.attributes.position,index=geometry.index,kept=[],hard=[],wingIndices=[[],[]];
    const partition=classifyYinglongWings(geometry);partitions.push(partition.report);
    const wingVertex=i=>partition.mask[i]===1;
    const clawVertex=i=>p.getY(i)<-.169&&Math.abs(p.getX(i))>.067;
    for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      if(Number(clawVertex(a))+Number(clawVertex(b))+Number(clawVertex(c))>=2)hard.push(a,b,c);
      else if(Number(wingVertex(a))+Number(wingVertex(b))+Number(wingVertex(c))<2)kept.push(a,b,c);
      else wingIndices[(p.getX(a)+p.getX(b)+p.getX(c))>0?1:0].push(a,b,c);
    }
    for(let i=0;i<2;i++)if(wingIndices[i].length)sourceWings.push({geometry:triangleSubset(geometry,wingIndices[i]),side:i?1:-1});
    if(hard.length)keratinParts.push(triangleSubset(geometry,hard));
    geometry.setIndex(kept);geometry.clearGroups();geometry.computeBoundingBox();
  }
  const base=new THREE.MeshStandardMaterial({color:'#afb3b3',roughness:1,side:THREE.DoubleSide});
  const body=meshes[0],bvh=new MeshBVH(body.geometry,{indirect:true});
  for(const geometry of keratinParts){const mesh=new THREE.Mesh(geometry,base);mesh.name='Keratin claw tips';mesh.userData.inkProfile={toneRange:[.9,1.2],geometryInfluence:.2,reserveStrength:0,strokes:false};root.add(mesh);}
  for(const {geometry,side}of sourceWings){
    const wing=new THREE.Mesh(geometry,base);wing.name=side>0?'Right source feather wing':'Left source feather wing';
    wing.userData.inkProfile={flow:new THREE.Vector3(side*.65,.45,-1),toneRange:[.18,.68],reserveStrength:0,twoSidedInk:true,ridgeReserve:.85,ridgeWidth:.035};root.add(wing);
  }
  // Eyes are actual small lens-shaped geometry; no painted iris or face decal.
  const usedVertices=[...new Set(body.geometry.index.array)],bodyPositions=body.geometry.attributes.position;
  const paths=[];
  for(const side of [-1,1]){
    // Locate the crown on the real head, rather than projecting guessed
    // coordinates onto a nearby disconnected mane or whisker surface.
    const brow=[];
    for(const [z,lateral]of [[.485,.003],[.476,.003],[.465,.003],[.452,.005],[.440,.007],[.427,.012],[.414,.013],[.402,.010],[.388,.014]]){
      let hit=null;
      for(const factor of [1,.65,.25,0]){
        hit=bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(side*lateral*factor,.20,z),new THREE.Vector3(0,-1,0)),THREE.DoubleSide);
        if(hit)break;
      }
      if(hit)brow.push(hit.point.toArray());
    }
    paths.push({kind:'reserve',points:brow,radius:.009,amount:.95,importance:2,pressure:[.22,.8,1,.85,.3]});
    const cheek=[];
    for(const [z,y]of [[.470,-.047],[.448,-.042],[.425,-.040],[.400,-.052],[.375,-.067],[.350,-.078],[.320,-.073],[.290,-.059]]){
      const hit=bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(side*.20,y,z),new THREE.Vector3(-side,0,0)),THREE.DoubleSide);
      if(hit)cheek.push(hit.point.toArray());
    }
    paths.push({kind:'reserve',points:cheek,radius:.014,amount:.91,importance:1.6,pressure:[.15,.55,1,1,.65,.15]});
    const back=[],widths=[];
    for(const z of [.33,.25,.17,.09,.01,-.08,-.17,-.27,-.37,-.44]){
      const section=usedVertices.filter(i=>Math.abs(bodyPositions.getZ(i)-z)<.022&&Math.abs(bodyPositions.getX(i))<.115);
      const ys=section.map(i=>bodyPositions.getY(i)).sort((a,b)=>a-b),middle=ys[Math.floor(ys.length*.5)]??0;
      const xs=section.filter(i=>bodyPositions.getY(i)>middle).map(i=>Math.abs(bodyPositions.getX(i))).sort((a,b)=>a-b);
      const width=xs[Math.floor(xs.length*.94)]??.04;
      const lateral=THREE.MathUtils.clamp(width*.72,.012,.065);
      const ray=new THREE.Ray(new THREE.Vector3(side*lateral,.28,z),new THREE.Vector3(0,-1,0));
      const hit=bvh.raycastFirst(ray,THREE.DoubleSide);if(hit){back.push(hit.point.toArray());widths.push(THREE.MathUtils.clamp(width/.055,.3,1.3));}
    }
    if(widths.length){const rhythm=[.3,.8,1,.4,.7,1,.3,.8,.5,.2];for(let i=0;i<widths.length;i++)widths[i]*=rhythm[i%rhythm.length];}
    paths.push({kind:'reserve',points:back,radius:.0085,amount:.96,pressure:widths});
  }
  for(const z of [.24,.18,.12,.06,-.10,-.17]){
    const rib=[];
    for(const x of [-.025,0,.025]){
      const hit=bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(x,-.30,z+x*.16),new THREE.Vector3(0,1,0)),THREE.DoubleSide);
      if(hit)rib.push(hit.point.toArray());
    }
    if(rib.length>1)paths.push({kind:'ink',points:rib,radius:.0035,amount:.18,pressure:[.25,1,.25],importance:.6});
  }
  body.userData.inkProfile={brushPaths:paths,ridgeReserve:0,macroInk:.25};
  const landmarks=[];
  for(const side of [-1,1]){
    const ray=new THREE.Ray(new THREE.Vector3(side*.16,-.023,.439),new THREE.Vector3(-side,0,0));
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide);
    if(!hit)continue;
    const socket=[];
    for(const dz of [-.009,0,.009]){
      const h=bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(side*.16,-.020,.439+dz),new THREE.Vector3(-side,0,0)),THREE.DoubleSide);
      if(h)socket.push(h.point.toArray());
    }
    if(socket.length>1)paths.push({kind:'reserve',points:socket,radius:.006,amount:.88,importance:1.2,pressure:[.25,1,.25]});
    const eye=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),base);
    eye.name=side>0?'Right ink eye':'Left ink eye';eye.position.copy(hit.point).add(new THREE.Vector3(side*.0018,.0005,0));eye.scale.set(.0022,.0031,.0105);
    eye.userData.inkProfile={toneRange:[1.35,1.35],geometryInfluence:0,reserveStrength:0,strokes:false};root.add(eye);landmarks.push(eye.position.toArray());
  }
  root.userData.geometryStudy={sourceWingsReplaced:false,sourceWingsSplit:true,originalWingPositionsRetained:true,partitions,eyeLandmarks:landmarks,artworkSampling:false};
  return root;
}
