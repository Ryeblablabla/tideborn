import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

// A registration-time, root-local triangle proxy. Parts can cast onto one
// another without introducing lights, image inputs, or per-frame ray tracing.
export function createOcclusionProxy(root){
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),entries=[];let vertices=0;
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    let visible=true;for(let node=mesh;node&&node!==root;node=node.parent){if(!node.visible){visible=false;break;}}
    if(!visible)return;
    const geometry=mesh.geometry,count=geometry.index?.count??geometry.attributes.position.count;
    entries.push({mesh,count,matrix:inverse.clone().multiply(mesh.matrixWorld)});vertices+=count;
  });
  if(!vertices)return null;
  const positions=new Float32Array(vertices*3),p=new THREE.Vector3();let cursor=0;
  for(const {mesh,count,matrix}of entries){
    const geometry=mesh.geometry,source=geometry.attributes.position;
    for(let i=0;i<count;i++){
      const index=geometry.index?geometry.index.getX(i):i;p.fromBufferAttribute(source,index).applyMatrix4(matrix);p.toArray(positions,cursor);cursor+=3;
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  return{geometry,bvh:new MeshBVH(geometry,{indirect:true}),inverse,length:Math.max(...size.toArray(),1e-6)};
}
