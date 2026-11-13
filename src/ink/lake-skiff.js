import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHORE_WATER, shoreStructureMark } from './shore-structure.js';

const stations = [
  [-2.32,.04,.40],[-2.04,.26,.24],[-1.47,.55,.13],[-.60,.68,.09],
  [.48,.67,.09],[1.30,.55,.13],[1.94,.31,.21],[2.32,.06,.34],
];

function strip(rows,columns,sample) {
  const points=[],guides=[],faces=[];
  for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
    const [x,y,z,ink,paper]=sample(i/rows,j/columns);
    points.push(x,y,z);guides.push(ink,paper);
    if(i===rows||j===columns)continue;
    const a=i*(columns+1)+j,b=a+columns+1;
    faces.push(a,a+1,b,b,a+1,b+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(guides,2));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function hullSeat(u) {
  const index=Math.min(stations.length-2,Math.floor(u*(stations.length-1)));
  const fraction=u*(stations.length-1)-index;
  return stations[index].map((value,i)=>THREE.MathUtils.lerp(value,stations[index+1][i],fraction));
}

function hull(side) {
  return strip(21,4,(u,v)=>{
    const [x,width,sheer]=hullSeat(u);
    const rise=(1-v)**2;
    return [x,sheer*rise-.128*v,side*width*(1-v*.72),.15+.25*(1-rise),
      (1-v)*.20*(.42+.58*Math.cos(u*15+side)**2)];
  });
}

function roofPoint(u,v) {
  const beam=.598*(.92+.08*Math.sin(u*Math.PI));
  const arch=(1-v*v)**.73;
  return [-.95+u*2.0,.276+.66*arch+.065*Math.sin(u*Math.PI)*arch,v*beam];
}

function canopy() {
  return strip(16,16,(u,v)=>{
    const cross=v*2-1;
    const point=roofPoint(u,cross);
    const ribs=.42+.58*Math.cos(u*18.9+cross*.31)**2;
    const wear=THREE.MathUtils.smoothstep(Math.sin(u*26+v*9),.05,.83);
    return [...point,.16+.23*ribs*Math.abs(cross)**.59,wear*(1-Math.abs(cross))*.30];
  });
}

function edge(points,radius,ink,paper) {
  const path=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
  const geometry=new THREE.TubeGeometry(path,points.length+2,radius,5,false);
  geometry.deleteAttribute('uv');
  const guides=new Float32Array(geometry.attributes.position.count*2);
  for(let i=0;i<guides.length;i+=2){guides[i]=ink;guides[i+1]=paper;}
  geometry.setAttribute('inkGuides',new THREE.BufferAttribute(guides,2));
  return geometry;
}

function paint(environment,root,parts,name,tint,tone,amount=.4) {
  const geometry=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  const mesh=environment.add(root,geometry,[0,0,0],{
    tint,amount,profile:{toneRange:tone,strokes:false,geometryInfluence:0,reserveStrength:.10,coherentInk:.13},
  });
  mesh.name=name;
}

export function addLakeSkiff(environment,root) {
  const x=11.8,z=-7.6,yaw=-.33;
  const boat=new THREE.Group();
  boat.name='松岬乌篷舟';
  boat.position.set(x,SHORE_WATER,z);
  boat.rotation.y=yaw;
  root.add(boat);

  const deck=strip(21,5,(u,v)=>{
    const [x,width,sheer]=hullSeat(u);
    return [x,sheer-.03,(v*2-1)*width*.96,.20+.13*Math.cos(u*21+v*.5)**2,.083];
  });
  paint(environment,boat,[hull(-1),hull(1),deck],'卧水木船身','#504f42',[.15,.43]);
  paint(environment,boat,[canopy()],'低弧乌篷','#353a34',[.25,.50],.35);

  const ribs=[0,.52,1].map(u=>edge(Array.from({length:9},(_,i)=>roofPoint(u,i/4-1)),u===.52?.022:.031,.22,.12));
  for(const side of [-1,1]){
    ribs.push(edge(stations.map(([x,width,sheer])=>[x,sheer,side*width]),.031,.12,.23));
  }
  // The shallow oar rests inside the open bow. Its outline stays below the roof.
  ribs.push(edge([[1.12,.202,-.47],[1.60,.184,-.21],[2.12,.222,.18]],.024,.17,.11));
  paint(environment,boat,ribs,'篷骨与两舷木线','#82715a',[.18,.31],.57);

  for(const side of [-1,1]){
    const v=side*.79;
    shoreStructureMark(root,environment,x+v*Math.sin(yaw),z+v*Math.cos(yaw),-yaw,
      side<0?3.32:2.69,.12,.21,7348+side);
  }
}
