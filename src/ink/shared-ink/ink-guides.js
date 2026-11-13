import * as THREE from 'three';

class MinHeap{
  constructor(){this.items=[];}
  push(node,priority){
    const value={node,priority},a=this.items;let i=a.length;a.push(value);
    while(i>0){const parent=(i-1)>>1;if(a[parent].priority<=priority)break;a[i]=a[parent];i=parent;}a[i]=value;
  }
  pop(){
    const a=this.items;if(!a.length)return null;const result=a[0],last=a.pop();
    if(a.length){let i=0;while(true){let child=i*2+1;if(child>=a.length)break;if(child+1<a.length&&a[child+1].priority<a[child].priority)child++;
      if(a[child].priority>=last.priority)break;a[i]=a[child];i=child;}a[i]=last;}
    return result;
  }
  get length(){return this.items.length;}
}

function surfaceRoute(graph,start,end){
  if(start===end)return[start];
  const {groups,positions}=graph,N=groups.length;
  const distances=new Float64Array(N).fill(Infinity),previous=new Int32Array(N).fill(-1),closed=new Uint8Array(N),heap=new MinHeap();
  distances[start]=0;heap.push(start,positions[start].distanceTo(positions[end]));
  while(heap.length){
    const {node}=heap.pop();if(closed[node])continue;closed[node]=1;if(node===end)break;
    for(const next of groups[node].neighbors){
      if(closed[next])continue;
      const distance=distances[node]+positions[node].distanceTo(positions[next]);
      if(distance<distances[next]){distances[next]=distance;previous[next]=node;heap.push(next,distance+positions[next].distanceTo(positions[end]));}
    }
  }
  if(previous[end]===-1)return[];
  const route=[end];while(route.at(-1)!==start)route.push(previous[route.at(-1)]);return route.reverse();
}

function compressSurfaceLine(points,maximum=17){
  if(points.length<=maximum)return points.map((p,i)=>i);
  const selected=[0,points.length-1],edge=new THREE.Vector3(),delta=new THREE.Vector3();
  while(selected.length<maximum){
    let best=-1,error=-1;
    for(let k=1;k<selected.length;k++){
      const start=selected[k-1],end=selected[k];edge.copy(points[end]).sub(points[start]);
      for(let i=start+1;i<end;i++){
        delta.copy(points[i]).sub(points[start]);const t=THREE.MathUtils.clamp(delta.dot(edge)/Math.max(edge.lengthSq(),1e-12),0,1);
        const d=delta.addScaledVector(edge,-t).lengthSq();if(d>error){error=d;best=i;}
      }
    }
    if(best<0||error<1e-10)break;selected.push(best);selected.sort((a,b)=>a-b);
  }
  return selected;
}

function analyticSegments(pieces,graph,analysis,path,pressure,maximumSegments){
  const result=[],closest={point:new THREE.Vector3(),distance:0,faceIndex:-1};
  const curves=pieces.map(piece=>piece.map(id=>graph.positions[id].clone()));
  for(const points of curves)for(let pass=0;pass<3;pass++){
    const next=points.map(p=>p.clone());
    for(let i=1;i<points.length-1;i++){
      const smooth=points[i-1].clone().add(points[i+1]).multiplyScalar(.5).lerp(points[i],.3);
      analysis.bvh.closestPointToPoint(smooth,closest);next[i].copy(closest.point);
    }
    points.forEach((p,i)=>p.copy(next[i]));
  }
  const distances=curves.map(points=>{const d=[0];for(let i=1;i<points.length;i++)d.push(d.at(-1)+points[i].distanceTo(points[i-1]));return d;});
  const total=Math.max(1e-8,distances.reduce((sum,d)=>sum+d.at(-1),0));let offset=0;
  const perPiece=Math.max(1,Math.floor(maximumSegments/Math.max(1,curves.length)));
  for(let k=0;k<curves.length;k++){
    const points=curves[k],d=distances[k];if(!points.length)continue;
    const selected=compressSurfaceLine(points,perPiece+1);
    if(selected.length===1)selected.push(selected[0]);
    for(let i=1;i<selected.length;i++){
      const a=selected[i-1],b=selected[i],ra=path.radius*Math.max(.08,pressure((offset+d[a])/total)),rb=path.radius*Math.max(.08,pressure((offset+d[b])/total));
      result.push({a:[...points[a].toArray(),ra],b:[...points[b].toArray(),rb],kind:path.kind==='ink'?0:1,amount:path.amount??1});
    }
    offset+=d.at(-1);
  }
  return result;
}

// Surface brush strokes defined by sparse 3D landmarks. A* joins landmarks on
// the mesh, then a geodesic brush expands from that route. No camera or artwork
// color is involved, and the stroke cannot jump to a nearby disconnected sheet.
export function buildInkGuides(geometry,paths=[],analysis){
  if(geometry.hasAttribute('inkGuides')&&!paths.length)return{paths:0,preserved:true};
  const started=performance.now(),N=geometry.attributes.position.count,data=new Float32Array(N*2);
  const report={paths:paths.length,connectedSegments:0,missingSegments:0,coveredVertices:0,milliseconds:0,gpuSegments:[]};
  if(!paths.length){geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(data,2));return report;}
  const graph=analysis.surfaceGraph,features=graph.groups.length,position=geometry.attributes.position;
  const estimates=paths.map(path=>{
    let length=0;for(let i=1;i<path.points.length;i++)length+=new THREE.Vector3(...path.points[i]).distanceTo(new THREE.Vector3(...path.points[i-1]));
    return Math.max(length,.001)*(path.importance??1);
  });
  const totalEstimate=estimates.reduce((a,b)=>a+b,0),freeBudget=Math.max(0,64-paths.length*2);
  const budgets=estimates.map(length=>2+Math.floor(freeBudget*length/totalEstimate));
  let spare=64-budgets.reduce((a,b)=>a+b,0);for(let i=0;spare>0;i++,spare--)budgets[i%budgets.length]++;
  const closest={point:new THREE.Vector3(),distance:0,faceIndex:-1},probe=new THREE.Vector3();
  const index=geometry.index,groupPaint=new Float32Array(features*2);
  function nearestGroup(point){
    analysis.bvh.closestPointToPoint(new THREE.Vector3(...point),closest);
    let chosen=0,best=Infinity;
    for(let j=0;j<3;j++){
      const vertex=index?index.getX(closest.faceIndex*3+j):closest.faceIndex*3+j;
      const distance=probe.fromBufferAttribute(position,vertex).distanceToSquared(closest.point);
      if(distance<best){best=distance;chosen=graph.ids[vertex];}
    }
    return chosen;
  }
  for(let pathIndex=0;pathIndex<paths.length;pathIndex++){
    const path=paths[pathIndex];
    if(path.points.length<2||!(path.radius>0))continue;
    const anchors=path.points.map(nearestGroup),ordered=[],pieces=[];let piece=[];
    for(let i=1;i<anchors.length;i++){
      const route=surfaceRoute(graph,anchors[i-1],anchors[i]);
      if(route.length){
        report.connectedSegments++;
        if(piece.length&&piece.at(-1)!==route[0]){pieces.push(piece);piece=[];}
        for(const id of route){if(ordered.at(-1)!==id)ordered.push(id);if(piece.at(-1)!==id)piece.push(id);}
      }else{report.missingSegments++;if(piece.length){pieces.push(piece);piece=[];}}
    }
    if(piece.length)pieces.push(piece);
    if(!pieces.length)for(const anchor of anchors)pieces.push([anchor]);
    if(!ordered.length)ordered.push(...anchors);
    const lengths=[0];for(let i=1;i<ordered.length;i++)lengths.push(lengths.at(-1)+graph.positions[ordered[i]].distanceTo(graph.positions[ordered[i-1]]));
    const total=Math.max(lengths.at(-1),1e-8);
    const pressure=t=>{
      if(path.pressure?.length){const x=t*(path.pressure.length-1),i=Math.min(path.pressure.length-2,Math.floor(x));return THREE.MathUtils.lerp(path.pressure[i],path.pressure[i+1],x-i);}
      return .25+.75*Math.pow(Math.sin(Math.PI*t),.55);
    };
    report.gpuSegments.push(...analyticSegments(pieces,graph,analysis,path,pressure,budgets[pathIndex]));
    const distances=new Float64Array(features).fill(Infinity),radii=new Float32Array(features),heap=new MinHeap(),channel=path.kind==='ink'?0:1;
    for(let i=0;i<ordered.length;i++){
      const node=ordered[i],radius=path.radius*Math.max(.08,pressure(lengths[i]/total));
      if(distances[node]>0||radius>radii[node]){distances[node]=0;radii[node]=radius;heap.push(node,0);}
    }
    while(heap.length){
      const {node,priority:distance}=heap.pop();if(distance>distances[node]||distance>1)continue;
      const strength=(1-THREE.MathUtils.smoothstep(distance,.70,1))*(path.amount??1);
      groupPaint[node*2+channel]=Math.max(groupPaint[node*2+channel],strength);
      for(const next of graph.groups[node].neighbors){
        const d=distance+graph.positions[node].distanceTo(graph.positions[next])/radii[node];
        if(d<=1&&d<distances[next]){distances[next]=d;radii[next]=radii[node];heap.push(next,d);}
      }
    }
  }
  for(let i=0;i<N;i++){
    data[i*2]=groupPaint[graph.ids[i]*2];data[i*2+1]=groupPaint[graph.ids[i]*2+1];
    if(data[i*2]>.01||data[i*2+1]>.01)report.coveredVertices++;
  }
  report.gpuSegments=report.gpuSegments.slice(0,64);
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(data,2));report.milliseconds=performance.now()-started;return report;
}
