import { BufferGeometry, Float32BufferAttribute, Group, MathUtils, Raycaster, Vector3 } from 'three';

const {lerp,smoothstep,smootherstep}=MathUtils;
const originX=25.9, originZ=31.5;

// z, wet toe x, broken shelf x/y, crest x/y, back x. Each rib samples
// the original banks independently at its front and back to share the foot.
const ribs=[
  [19.8,24.0,26.6,3.0,30.0,5.6,35.8],
  [21.5,21.75,23.6,4.6,28.1,7.8,34.2],
  [23.1,21.05,23.9,5.0,27.65,9.15,34.3],
  [24.65,20.83,22.15,5.8,24.70,11.05,32.7],
  [25.7,19.72,21.90,5.6,23.86,12.78,33.7],
  [27.15,19.15,21.38,6.9,23.08,13.45,33.8],
  [28.2,18.55,20.85,6.2,22.76,12.88,33.4],
  [29.45,18.45,19.92,6.05,23.61,11.58,33.4],
  [30.6,18.25,20.61,5.15,24.08,12.27,33.4],
  [31.6,18.85,21.44,5.6,24.92,10.90,34.3],
  [33.1,18.64,21.05,5.05,25.20,10.25,34.1],
  [34.55,19.6,22.30,4.84,26.84,8.9,35.6],
  [36.9,21.60,24.46,4.03,27.85,7.2,36.5],
  [39.5,24.9,26.7,3.40,31.29,5.6,38.4],
];

function sculptFlank(ground) {
  const columns=ribs.map(([z,toe,shelf,h,crest,peak,back],i)=>{
    const seam=crest-.61-.29*Math.sin(i*1.77);
    const top=crest+.88+.33*Math.sin(i*.88);
    const scarpZ=z+.31*Math.sin(i*1.95);
    return [
      [toe,ground(toe,z)-.44,z],
      [shelf-.74,Math.max(h-.86,ground(shelf-.74,z)-.06),z],
      [shelf,Math.max(h,ground(shelf,scarpZ)),scarpZ],
      [seam,Math.max(peak-1.66,ground(seam,scarpZ)),scarpZ],
      [crest,Math.max(peak,ground(crest,z)),z],
      [top,Math.max(peak-.45-.49*Math.sin(i*.95),ground(top,z)),z],
      [back,ground(back,z)-.42,z],
    ];
  });

  const position=[], guides=[], mineral=[];
  function triangle(a,b,c,band,row) {
    const cleft=Math.sin(row*1.77+band*.82)>.55;
    for(const [x,y,z] of [a,b,c]){
      position.push(x-originX,y,z-originZ);
      const along=.5+.5*Math.sin(.76*z+.84*x+.33*y);
      const charcoal=band===2||band===3;
      const toe=band<=1;
      const ink=charcoal? .59+.14*along : toe? .15+.35*smoothstep(1.8,5.4,y) : .22+.14*along;
      const reserve=charcoal? .021+.055*Number(cleft)*along : .026+.09*along;
      guides.push(ink,reserve);
      const blue=(1-smoothstep(.98,2.8,Math.abs(x-22.25+.28*(z-26)-.14*y)))*
        smoothstep(22.1,25.1,z)*(1-smoothstep(30.8,34.6,z));
      mineral.push(blue*(band===3||band===4?.73:band===2?.37:.09));
    }
  }
  for(let row=0;row<columns.length-1;row++){
    const front=columns[row],back=columns[row+1];
    for(let band=0;band<front.length-1;band++){
      const a=front[band],b=front[band+1],c=back[band],d=back[band+1];
      // Alternate the planes across the longitudinal chips, without a
      // repetitive triangle fan or a regular flat top.
      if((row+band)%3===0){
        triangle(a,c,d,band,row);
        triangle(a,d,b,band,row);
      }else{
        triangle(a,c,b,band,row);
        triangle(b,c,d,band,row);
      }
    }
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(position,3));
  geometry.setAttribute('inkGuides',new Float32BufferAttribute(guides,2));
  geometry.setAttribute('inkMineralMask',new Float32BufferAttribute(mineral,1));
  geometry.computeVertexNormals();
  return geometry;
}

export function addChapterInkForeground(environment,root) {
  const banks=['江右墨崖','千山·东岸墨肩','千山·墨岸松坪']
    .map(name=>root.getObjectByName(name)).filter(Boolean);
  banks.forEach(bank=>bank.updateMatrixWorld(true));
  const down=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  const ground=(x,z)=>{
    down.ray.origin.set(x,49,z);
    return Math.max(-.14,environment.heightAt(x,z),down.intersectObjects(banks,false)[0]?.point.y??-.14);
  };

  const group=new Group();
  group.name='千山过场·墨壁探松';
  group.visible=false;
  root.add(group);
  const shell=environment.add(group,sculptFlank(ground),[originX,0,originZ],{
    tint:'#32737b',amount:.78,
    profile:{strokes:false,geometryInfluence:0,toneRange:[.16,.39],
      coherentInk:.11,reserveStrength:.14,macroInk:.08},
  });
  shell.name='千山·斧劈墨壁';
  Object.assign(shell.userData,{
    landscape:1,landWash:.73,landPooling:.038,landGain:1.28,
    landStrokeStrength:0,authoredPigment:true,inkMineralHold:.84,
  });
  group.updateMatrixWorld(true);

  const pine=root.getObjectByName('千山·岸悬松');
  const old=pine?.position.clone();
  const socket=new Vector3(23.15,13.05,27.32);
  if(pine){
    down.ray.origin.set(socket.x,49,socket.z);
    const hit=down.intersectObject(shell,false)[0];
    if(hit)socket.y=hit.point.y-.28;
    else socket.copy(old);
  }
  return {
    root:group,
    setAge(age){
      const live=Number.isFinite(age)&&age>=3.85&&age<8.48;
      group.visible=live;
      const retire=live?smootherstep(age,7.76,8.48):1;
      group.position.y=-15.4*retire;
      if(pine) {
        const weight=1-smootherstep(retire,.51,.98);
        pine.position.lerpVectors(old,socket,weight);
        pine.position.y=Math.max(old.y,pine.position.y-15.4*retire*weight);
      }
    },
  };
}
