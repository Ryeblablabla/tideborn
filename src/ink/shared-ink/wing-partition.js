// Asset-authoring partition, separate from ink rendering. Anatomical seeds
// grow over welded surface connectivity, so feather tips are not clipped by
// a rectangular XYZ selection. Original vertices and triangles are unchanged.
export function classifyYinglongWings(geometry){
  const p=geometry.attributes.position,index=geometry.index,ids=new Uint32Array(p.count),groups=[],map=new Map();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),key=[x,y,z].map(v=>Math.round(v*1e6)).join(',');
    if(!map.has(key)){map.set(key,groups.length);groups.push({x,y,z,edges:new Set()});}ids[i]=map.get(key);
  }
  for(let i=0;i<index.count;i+=3){const face=[ids[index.getX(i)],ids[index.getX(i+1)],ids[index.getX(i+2)]];for(let a=0;a<3;a++)for(let b=0;b<3;b++)if(a!==b)groups[face[a]].edges.add(face[b]);}
  const wingSeeds=[],bodySeeds=[];
  for(let i=0;i<groups.length;i++){
    const {x,y,z}=groups[i],span=Math.abs(x);
    if(span>.12&&y>-.055&&z>-.38&&z<.30)wingSeeds.push(i);
    if(span<.065||y<-.065||(z<-.31&&span<.12)||(z>.28&&span<.12))bodySeeds.push(i);
  }
  const distanceFrom=seeds=>{
    const distance=new Float64Array(groups.length).fill(Infinity),heap=[];
    const push=(id,d)=>{const item={id,d};let i=heap.length;heap.push(item);while(i>0){const j=(i-1)>>1;if(heap[j].d<=d)break;heap[i]=heap[j];i=j;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&heap[j+1].d<heap[j].d)j++;if(heap[j].d>=last.d)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    for(const id of seeds){distance[id]=0;push(id,0);}
    while(heap.length){const {id,d}=pop();if(d!==distance[id])continue;const a=groups[id];for(const next of a.edges){const b=groups[next],candidate=d+Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(candidate<distance[next]){distance[next]=candidate;push(next,candidate);}}}
    return distance;
  };
  const wingDistance=distanceFrom(wingSeeds),bodyDistance=distanceFrom(bodySeeds),mask=new Uint8Array(p.count);
  for(let i=0;i<p.count;i++){
    const id=ids[i],a=wingDistance[id],b=bodyDistance[id],g=groups[id];
    mask[i]=Number(Number.isFinite(a)?a<b*1.12:!Number.isFinite(b)&&Math.abs(g.x)>.068&&g.y>-.075&&g.z<.30&&g.z>-.33);
  }
  return {mask,report:{method:'welded-surface geodesic anatomical partition',groups:groups.length,wingSeeds:wingSeeds.length,bodySeeds:bodySeeds.length}};
}
