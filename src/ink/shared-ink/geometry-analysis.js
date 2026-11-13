import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

const cache=new WeakMap();

// Geometry-only signals. No artwork, texture, color attribute or camera input.
// The BVH is built once at registration; all subsequent frames are rasterized.
export function analyzeInkGeometry(geometry,occluder=null,relativeMatrix=null){
  if(cache.has(geometry))return cache.get(geometry);
  const started=performance.now();
  geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  const length=Math.max(...size.toArray(),1e-6);
  const positions=geometry.attributes.position,normals=geometry.attributes.normal,N=positions.count;
  const buckets=new Map(),ids=new Uint32Array(N),groups=[];
  const precision=1/(length*1e-5);
  for(let i=0;i<N;i++){
    const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(x=>Math.round(x*precision)).join(',');
    if(!buckets.has(key)){buckets.set(key,groups.length);groups.push({members:[],neighbors:new Set()});}
    ids[i]=buckets.get(key);groups[ids[i]].members.push(i);
  }
  const indices=geometry.index,M=indices?indices.count:N;
  for(let i=0;i<M;i+=3){
    const face=[0,1,2].map(j=>ids[indices?indices.getX(i+j):i+j]);
    for(let j=0;j<3;j++)for(let k=0;k<3;k++)if(face[j]!==face[k])groups[face[j]].neighbors.add(face[k]);
  }
  const groupPoints=groups.map(g=>new THREE.Vector3().fromBufferAttribute(positions,g.members[0]));
  const cavity=new Float32Array(groups.length),physicalCavity=new Float32Array(groups.length),ridge=new Float32Array(groups.length),physicalRidge=new Float32Array(groups.length),occlusion=new Float32Array(groups.length),macroOcclusion=new Float32Array(groups.length);
  const n=new THREE.Vector3(),p=new THREE.Vector3(),delta=new THREE.Vector3(),mean=new THREE.Vector3();
  for(let i=0;i<groups.length;i++){
    const g=groups[i];n.set(0,0,0);for(const j of g.members){delta.fromBufferAttribute(normals,j);n.add(delta);}n.normalize();
    mean.set(0,0,0);let distance=0;
    for(const j of g.neighbors){mean.add(groupPoints[j]);distance+=p.copy(groupPoints[j]).sub(groupPoints[i]).length();}
    if(g.neighbors.size){mean.multiplyScalar(1/g.neighbors.size).sub(groupPoints[i]);distance/=g.neighbors.size;
      const bend=mean.dot(n)/Math.max(distance,1e-8);cavity[i]=Math.max(0,bend);ridge[i]=Math.max(0,-bend);
      physicalCavity[i]=Math.min(512,Math.max(0,bend)*length/Math.max(distance,1e-7));
      physicalRidge[i]=Math.min(512,Math.max(0,-bend)*length/Math.max(distance,1e-7));}
  }
  // Smooth triangle-scale noise while preserving broad folds and convex edges.
  for(const values of [cavity,physicalCavity,ridge,physicalRidge])for(let pass=0;pass<2;pass++){
    const next=values.slice();
    for(let i=0;i<groups.length;i++){
      let sum=values[i]*2,total=2;
      for(const j of groups[i].neighbors){sum+=values[j];total++;}next[i]=sum/total;
    }
    values.set(next);
  }
  const bvh=new MeshBVH(geometry,{indirect:true});
  const ray=new THREE.Ray(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3(),direction=new THREE.Vector3();
  const up=new THREE.Vector3(),samples=8;
  const castTree=occluder?.bvh??bvh,castLength=occluder?.length??length;
  const transform=relativeMatrix??new THREE.Matrix4(),normalTransform=new THREE.Matrix3().getNormalMatrix(transform);
  for(let i=0;i<groups.length;i++){
    const g=groups[i];n.set(0,0,0);for(const j of g.members){delta.fromBufferAttribute(normals,j);n.add(delta);}n.normalize();
    n.applyMatrix3(normalTransform).normalize();
    up.set(Math.abs(n.y)<.9?0:1,Math.abs(n.y)<.9?1:0,0);tangent.crossVectors(n,up).normalize();bitangent.crossVectors(n,tangent);
    ray.origin.copy(groupPoints[i]).applyMatrix4(transform).addScaledVector(n,castLength*.0007);
    let sum=0,broad=0;
    for(let j=0;j<samples;j++){
      const z=Math.sqrt(1-(j+.5)/samples),r=Math.sqrt(1-z*z),angle=j*2.39996323;
      direction.copy(n).multiplyScalar(z).addScaledVector(tangent,r*Math.cos(angle)).addScaledVector(bitangent,r*Math.sin(angle));
      ray.direction.copy(direction);
      const hit=castTree.raycastFirst(ray,THREE.DoubleSide,castLength*.0005,castLength*.28);
      if(hit){sum+=Math.exp(-hit.distance/(castLength*.028));broad+=Math.exp(-hit.distance/(castLength*.11));}
    }
    occlusion[i]=sum/samples;
    macroOcclusion[i]=broad/samples;
  }
  const concave=Array.from(physicalCavity).filter(v=>v>.05&&Number.isFinite(v)).sort((a,b)=>a-b);
  const cavityLow=concave[Math.floor(concave.length*.30)]??0,cavityHigh=Math.max(cavityLow+.01,concave[Math.floor(concave.length*.80)]??1);
  const data=new Float32Array(N*3);
  for(let i=0;i<N;i++){const g=ids[i],pool=THREE.MathUtils.smoothstep(physicalCavity[g],cavityLow,cavityHigh);data.set([pool*.12,ridge[g],occlusion[g]],i*3);}
  const attribute=new THREE.Float32BufferAttribute(data,3);geometry.setAttribute('inkGeometry',attribute);
  const curvature=new THREE.Float32BufferAttribute(Float32Array.from(ids,id=>physicalRidge[id]),1);geometry.setAttribute('inkCurvature',curvature);
  const macro=new THREE.Float32BufferAttribute(Float32Array.from(ids,id=>macroOcclusion[id]),1);geometry.setAttribute('inkMacroOcclusion',macro);
  const ordered=Array.from(physicalRidge).filter(Number.isFinite).sort((a,b)=>a-b);
  const curvatureRange=[ordered[Math.floor(ordered.length*.65)]||0,ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.92))]||1];curvatureRange[1]=Math.max(curvatureRange[1],curvatureRange[0]+.01);
  const result={attribute,curvature,curvatureRange,macro,bvh,surfaceGraph:{groups,positions:groupPoints,ids},vertices:N,uniqueVertices:groups.length,raySamples:groups.length*samples,milliseconds:performance.now()-started};
  cache.set(geometry,result);return result;
}
