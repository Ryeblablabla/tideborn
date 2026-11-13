import * as THREE from 'three';

// Expand connected convex crests over the surface. This gives thin feather
// folds a readable paper edge instead of a one-vertex white highlight.
export function buildRidgeBands(geometry,analysis,width=0){
  const count=geometry.attributes.position.count,values=new Float32Array(count);
  const graph=analysis.surfaceGraph;
  if(width>0&&graph){
    const {groups,positions,ids}=graph,distances=new Float64Array(groups.length).fill(Infinity),heap=[];
    const push=(id,d)=>{
      const item={id,d};let i=heap.length;heap.push(item);
      while(i>0){const p=(i-1)>>1;if(heap[p].d<=d)break;heap[i]=heap[p];i=p;}heap[i]=item;
    };
    const pop=()=>{
      const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].d<heap[child].d)child++;if(heap[child].d>=last.d)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;
    };
    geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z)*width;
    const threshold=analysis.curvatureRange[1];
    for(let i=0;i<groups.length;i++)if(groups[i].neighbors.size&&analysis.curvature.getX(groups[i].members[0])>=threshold){distances[i]=0;push(i,0);}
    while(heap.length){
      const {id,d}=pop();if(d!==distances[id]||d>radius)continue;
      for(const next of groups[id].neighbors){const candidate=d+positions[id].distanceTo(positions[next]);if(candidate<=radius&&candidate<distances[next]){distances[next]=candidate;push(next,candidate);}}
    }
    for(let i=0;i<count;i++)values[i]=1-THREE.MathUtils.smoothstep(distances[ids[i]],radius*.20,radius);
  }
  const attribute=new THREE.Float32BufferAttribute(values,1);geometry.setAttribute('inkRidgeBand',attribute);return attribute;
}
