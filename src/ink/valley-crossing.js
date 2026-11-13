import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { foundedStone, SHORE_WATER, shoreStructureMark } from './shore-structure.js';
import { drawStructureContacts } from './shore-plants.js';

function stonePrism(outline, halfWidth, seed, dark, centerV=0) {
  const positions=[],guides=[];
  const size=outline.length;
  const triangle=(a,b,c,face)=>{
    positions.push(...a,...b,...c);
    for(const [u,y,v] of [a,b,c]){
      const tooth=.67+.33*Math.sin(u*7.1+y*4.3+v*6.7+seed)**2;
      guides.push(face*tooth,dark?.024:.15*tooth);
    }
  };
  for(const side of [-1,1]){
    const face=outline.map(([u,y])=>[u,y,centerV+side*halfWidth]);
    for(let i=1;i<size-1;i++){
      if(side>0)triangle(face[0],face[i],face[i+1],dark?.38:.15);
      else triangle(face[0],face[i+1],face[i],dark?.42:.18);
    }
  }
  for(let i=0;i<size;i++){
    const j=(i+1)%size;
    const a=[...outline[i],centerV-halfWidth],b=[...outline[j],centerV-halfWidth];
    const c=[...outline[j],centerV+halfWidth],d=[...outline[i],centerV+halfWidth];
    const pigment=i===0?.38:.09;
    triangle(a,b,d,pigment);triangle(b,c,d,pigment);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(guides,2));
  geometry.computeVertexNormals();
  return geometry;
}

function addMasonry(environment,root,parts,name,tint,tone) {
  const surfaces=parts.map(geometry=>{
    const surface=geometry.index?geometry.toNonIndexed():geometry;
    if(surface!==geometry)geometry.dispose();
    surface.deleteAttribute('uv');
    return surface;
  });
  const geometry=mergeGeometries(surfaces);
  for(const surface of surfaces)surface.dispose();
  const mesh=environment.add(root,geometry,[0,0,0],{
    tint,amount:.31,profile:{toneRange:tone,geometryInfluence:0,strokes:false,coherentInk:.15},
  });
  mesh.name=name;
}

/** Single stone arch between the two rock islands, with both feet seated on the existing bed. */
export function addValleyCrossing(environment,root,x,z,rotation,span,width) {
  const bridge=new THREE.Group();
  bridge.name='江谷单孔石拱';
  bridge.position.set(x,0,z);
  bridge.rotation.y=rotation;
  root.add(bridge);

  const sine=Math.sin(rotation),cosine=Math.cos(rotation);
  const world=(u,v)=>[x+u*cosine+v*sine,z-u*sine+v*cosine];
  const ground=(u,v)=>environment.heightAt(...world(u,v));
  const half=span*.5, halfWidth=width*.5;
  const groundAcross=u=>Math.max(...[-halfWidth,0,halfWidth].map(v=>ground(u,v)));
  const left=Math.max(SHORE_WATER+.18,groundAcross(-half)+.065);
  const right=Math.max(SHORE_WATER+.18,groundAcross(half)+.065);
  const deck=u=>{
    const t=THREE.MathUtils.clamp(u/span+.5,0,1);
    return THREE.MathUtils.lerp(left,right,t)+.76*Math.sin(Math.PI*t)**1.16;
  };
  const masonry=[],ring=[],paving=[],parapet=[],seats=[];
  const archHalf=2.52,spring=.12;
  const peak=deck(0)-.37;
  const intrados=theta=>[archHalf*Math.sin(theta),spring+(peak-spring)*Math.cos(theta)];
  const extrados=(u,y)=>Math.min(deck(u)-.086,y+.22);

  const stones=15;
  for(let i=0;i<stones;i++){
    const angle=(i/stones-.5)*Math.PI;
    const next=((i+1)/stones-.5)*Math.PI;
    const [u0,y0]=intrados(angle),[u1,y1]=intrados(next);
    const [a,base]=intrados(angle+(i===0?0:.006));
    const [b,top]=intrados(next-(i===stones-1?0:.006));
    const stone=[[a,base],[b,top],[b,extrados(b,top)],[a,extrados(a,base)]];
    ring.push(stonePrism(stone,halfWidth+.025+(i%3)*.008,i*.73,i%4===0));
    masonry.push(stonePrism([[u0,extrados(u0,y0)-.012],[u1,extrados(u1,y1)-.012],
      [u1,deck(u1)],[u0,deck(u0)]],halfWidth-.024,i*1.3,false));
  }

  for(const sign of [-1,1]){
    const pierU=sign*(archHalf+(half-archHalf)*.5);
    masonry.push(foundedStone(half-archHalf+.045,width,pierU,0,u=>deck(u),ground,.28,6));
    const approachU=sign*(half+.31);
    paving.push(foundedStone(.69,width+.06,approachU,0,(u,v)=>{
      const t=THREE.MathUtils.clamp((Math.abs(u)-half)/.63,0,1);
      const land=ground(u,v);
      const seat=Number.isFinite(land)?land+.04:SHORE_WATER+.04;
      return THREE.MathUtils.lerp(deck(sign*half),seat,t);
    },ground,.24,5));
    for(const edge of [-1,1]){
      const v=edge*(halfWidth-.04),u=sign*(archHalf+.08);
      const [px,pz]=world(u,v), land=ground(u,v);
      const bed=Number.isFinite(land)?land:SHORE_WATER-.58;
      seats.push({x:px,z:pz,ground:bed,foot:Math.min(deck(u)-.10,bed-.09)});
      shoreStructureMark(root,environment,px,pz,rotation+edge*.72,1.24,.16,.28,6210+sign*5+edge);
      const a=Math.min(sign*2.62,sign*3.46),b=Math.max(sign*2.62,sign*3.46);
      const hA=deck(a),hB=deck(b);
      // Set two offset ashlar faces into the abutment. Their broken lower
      // edges follow the bed and pick out the springing of the arch.
      const shoulder=[[a,hA-.51],[b,hB-.33],[b-.13,hB-.18],[a+.06,hA-.23]];
      masonry.push(stonePrism(shoulder,.037,edge*2.7+sign*3.1,true,edge*(halfWidth-.013)));
      const lo=[[a+.15,hA-.87],[b-.12,hB-.69],[b-.09,hB-.55],[a+.21,hA-.66]];
      masonry.push(stonePrism(lo,.032,edge*1.4-sign*5.6,true,edge*(halfWidth-.014)));
    }
  }

  // Thick low stonework follows the hump. The few larger stones interrupt
  // it and reveal the span without repeating the lake bridge's vertical rhythm.
  for(let i=0;i<10;i++){
    const a=(i/10-.5)*span+.02,b=((i+1)/10-.5)*span-.02;
    const path=[[a,deck(a)-.023],[b,deck(b)-.023],[b,deck(b)+.075],[a,deck(a)+.075]];
    paving.push(stonePrism(path,halfWidth+.055,i+2.1,false));
  }
  const posts=[[-2.82,.36],[-.22,.49],[2.43,.42]];
  const coping=[[-3.51,-2.99],[-2.64,-.42],[-.02,2.24],[2.64,3.48]];
  for(const edge of [-1,1]){
    const v=edge*(halfWidth-.058);
    for(const [i,[a,b]] of coping.entries()){
      const parts=i===1?3:i===2?2:1;
      for(let j=0;j<parts;j++){
        const from=THREE.MathUtils.lerp(a,b,j/parts)+.012;
        const to=THREE.MathUtils.lerp(a,b,(j+1)/parts)-.014;
        const lift=.148+(i%2)*.022;
        const wall=[[from,deck(from)+.063],[to,deck(to)+.063],
          [to,deck(to)+lift+.083],[from,deck(from)+lift+.071]];
        parapet.push(stonePrism(wall,.075,i*2.7+j+edge,true,v));
      }
    }
    for(const [i,[u,height]] of posts.entries()){
      const y=deck(u)+.069;
      const width=i===1?.164:.14;
      const body=[[u-width,y],[u+width,y],[u+width*.78,y+height*.82],
        [u+width*.56,y+height],[u-width*.65,y+height],[u-width*.88,y+height*.77]];
      parapet.push(stonePrism(body,.109,i*3.3+edge,false,v));
      const cap=[[u-width*.83,y+height-.05],[u+width*.83,y+height-.05],
        [u+width*.59,y+height+.039],[u-width*.59,y+height+.041]];
      paving.push(stonePrism(cap,.124,i+7.2,false,v));
    }
  }
  addMasonry(environment,bridge,masonry,'贴岸石台与拱肩','#716a55',[.18,.40]);
  addMasonry(environment,bridge,ring,'单孔拱券楔石','#50493c',[.31,.60]);
  addMasonry(environment,bridge,paving,'错缝压顶石','#887c63',[.13,.29]);
  addMasonry(environment,bridge,parapet,'低石阑与疏列望柱','#72664e',[.23,.46]);
  bridge.userData.shoreSeats={span,width,seats,archCrown:peak,archHalf};
  drawStructureContacts(environment,root);
}
