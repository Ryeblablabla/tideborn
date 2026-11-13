import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../rules.js';

const STONE = 'whiteStone';
const PLINTH = 'batteredStone';
const STONE_SEAT = 'stoneSeat';
const STEPS = 'stairStone';
const CARVING = 'stoneCarving';
const TIMBER = 'timber';
const SHADOWED_WOOD = 'shadowedWood';
const REAR_WALL = 'rearWall';
const LACQUER = 'lacquer';
const WASHED_LACQUER = 'washedLacquer';
const TILE = 'tile';
const TILE_EDGE = 'tileEdge';
const SOFFIT = 'soffit';
const METAL = 'bronze';
const CLIFF = 'cliff';
const CLOUD_FOOT = 'cloudFoot';
const smooth = THREE.MathUtils.smoothstep;
const terraceCourses = {
  gate: [
    [.02,.17,0,0],[-.12,.19,0,0],[-.36,-.29,.13,.09],
    [-.61,-.48,.21,.17],[-1.37,-.92,.55,.30],[-2.12,-.78,.47,.28],[-2.82,-.65,.18,.12],
  ],
  landing: [
    [.02,.17,0,0],[-.14,.18,0,0],[-.36,-.26,.27,.13],
    [-.59,-.38,.41,.17],[-1.35,-.99,.78,.42],[-2.26,-1.14,.96,.60],[-2.82,-.79,.55,.40],
  ],
  sideSlope: [
    [.02,.17,0,0],[-.16,.18,0,0],[-.38,-.11,.11,.12],
    [-1.25,-.63,.39,.44],[-2.04,-.81,.59,.49],[-2.67,-.48,.45,.35],
  ],
  sideSteps: [
    [.02,.17,0,0],[-.14,.15,0,0],[-.39,-.38,.09,.17],[-.59,-.48,.14,.17],
    [-.85,-.49,.19,.25],[-1.15,-.72,.31,.29],[-1.78,-.45,.21,.33],
  ],
};
const roofCourses = [
  [-.66,.056,.23,.86,.19],[-.45,.038,.52,.94,.22],[-.10,.068,.30,.92,-.15],
  [.33,.055,.44,.97,-.17],[.66,.057,.20,.82,-.20],
];

const palette = {
  [STONE]: { name: '踏面白石', tint: '#ada38f', amount: .23, range: [.039, .24] },
  [PLINTH]: { name: '斜收青灰石台', tint: '#847762', amount: .27, range: [.086,.31] },
  [STONE_SEAT]: { name: '承台斜收阴面', tint: '#756e62', amount: .31, range: [.18,.47] },
  [STEPS]: { name: '雨蚀主阶', tint: '#9c8e74', amount: .22, range: [.023,.15] },
  [CARVING]: { name: '望柱与栏板', tint: '#756b5a', amount: .22, range: [.11, .32] },
  [TIMBER]: { name: '斗拱梁枋', tint: '#58493d', amount: .35, range: [.25, .61] },
  [SHADOWED_WOOD]: { name: '暗檐与承梁', tint: '#373129', amount: .28, range: [.47, .78] },
  [REAR_WALL]: { name: '内庭灰墙', tint: '#8b8171', amount: .31, range: [.17, .38] },
  [LACQUER]: { name: '朱漆檐柱', tint: '#913e2c', amount: .87, range: [.32, .69] },
  [WASHED_LACQUER]: { name: '飞檐下淡朱内柱', tint: '#a6654e', amount: .78, range: [.16, .43] },
  [TILE]: { name: '重檐墨瓦', tint: '#2f302e', amount: .19, range: [.27, .68] },
  [SOFFIT]: { name: '深墨檐底', tint: '#282726', amount: .19, range: [.51, .77] },
  [TILE_EDGE]: { name: '瓦当与檐口', tint: '#46413a', amount: .18, range: [.38, .70] },
  [METAL]: { name: '脊饰与匾额', tint: '#a4824f', amount: .75, range: [.16, .46] },
  [CLIFF]: { name: '仙山承台', tint: '#6c6053', amount: .25, range: [.115,.44] },
  [CLOUD_FOOT]: { name: '云脚近岩', tint: '#6b675d', amount: .22, range: [.07,.25] },
};

class PalaceGeometry {
  constructor(detail=false) {
    this.detail=detail;
    this.parts = new Map();
  }

  add(kind, geometry, x = 0, y = 0, z = 0) {
    if(kind===LACQUER||kind===WASHED_LACQUER)weatherLacquer(geometry,x,z,kind===WASHED_LACQUER);
    if(kind===PLINTH&&!geometry.hasAttribute('inkGuides')){
      geometry.setAttribute('inkGuides',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    }
    geometry.translate(x, y, z);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    part.deleteAttribute('uv');
    if (!this.parts.has(kind)) this.parts.set(kind, []);
    this.parts.get(kind).push(part);
  }

  box(kind, x, y, z, width, height, depth) {
    this.add(kind, new THREE.BoxGeometry(width, height, depth), x, y, z);
  }

  column(kind, x, y, z, topRadius, bottomRadius, height, sides = 10) {
    const lacquer=kind===LACQUER||kind===WASHED_LACQUER;
    this.add(kind, new THREE.CylinderGeometry(topRadius, bottomRadius, height, sides, lacquer?(this.detail?7:3):1), x, y, z);
  }

  segment(kind, a, b, width, depth = width) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const geometry = new THREE.BoxGeometry(width, direction.length(), depth);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    this.add(kind, geometry, ...start.lerp(end, .5).toArray());
  }

  curve(kind, points, radius, sides = 5) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    this.add(kind, new THREE.TubeGeometry(curve, points.length + 2, radius, sides, false));
  }

  commit(environment, root, depth = 1) {
    for (const [kind, parts] of this.parts) {
      const pigment = palette[kind];
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const guide=geometry.attributes.inkGuides;
      if(guide&&depth<1) for(let i=0;i<guide.count;i++) {
        guide.setX(i,guide.getX(i)*depth);
        guide.setY(i,guide.getY(i)*(.73+.27*depth));
      }
      const paleStone=kind===STONE||kind===STEPS;
      const mesh = environment.add(root, geometry, [0, 0, 0], {
        tint: pigment.tint,
        amount: pigment.amount*(.52+.48*depth),
        profile: {
          toneRange:pigment.range.map(tone=>tone*depth),
          reserveDirection:paleStone ? new THREE.Vector3(0,1,0) : new THREE.Vector3(-.51,.56,.55).normalize(),
          reserveStrength:paleStone ? .19 : .08,
          geometryInfluence: 0,
          strokes: false,
          coherentInk: (kind===CLIFF?.18:kind===TILE?.15:kind===PLINTH||kind===STONE_SEAT?.083:.04)*depth,
        },
      });
      mesh.name = pigment.name;
    }
  }
}

function weatherLacquer(geometry, columnX, columnZ, pale) {
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox;
  const position=geometry.attributes.position;
  const normal=geometry.attributes.normal;
  const guides=new Float32Array(position.count*2);
  const seed=columnX*.65+columnZ*.23;
  for(let i=0;i<position.count;i++) {
    const y=(position.getY(i)-min.y)/Math.max(.001,max.y-min.y);
    const x=position.getX(i),z=position.getZ(i);
    const face=THREE.MathUtils.smoothstep(normal.getX(i)*-.42+normal.getZ(i)*-.52,-.15,.49);
    const stripe=THREE.MathUtils.smoothstep(Math.sin(x*11.9+z*4.8+seed)+.25*Math.sin(y*9.7+seed),.50,.94);
    const fray=.36+.64*THREE.MathUtils.smoothstep(Math.sin(y*7.6+seed),-.74,.62);
    const shade=pale?smooth(y,.60,.94):0;
    guides[i*2]=(.04+.16*(1-face))*(.68+.32*Math.sin(y*4.6+seed))+.31*shade;
    guides[i*2+1]=face*stripe*fray*.48+(pale?.15*face*(1-shade):0);
  }
  geometry.setAttribute('inkGuides',new THREE.BufferAttribute(guides,2));
}

function indexedGeometry(positions, indices, guides) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  if (guides) geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(guides,2));
  geometry.computeVertexNormals();
  return geometry;
}

// The roof's hip descends from the ends of the ridge. Its upward curl is
// strongest at the corners, then continues into a separate deep fascia.
function roofHeight(x, z, height, curl) {
  const hip = Math.max(0, (Math.abs(x) - .64) / .36);
  const pitch = Math.max(hip, Math.abs(z));
  const corner = Math.abs(x) ** 8 * (.24 + .76 * Math.abs(z) ** 5);
  return height * (1 - pitch) ** 1.43 + curl * corner;
}

// Press the ink into the curved tile bed. A few dragged strokes follow the
// same convergence as the modeled tile ribs, with paper left at their tips.
function roofInk(across, down, phase, detail) {
  const slope=Math.abs(down);
  const hip=smooth(Math.abs(across),.53,.98);
  const rib=across/(.81+.19*slope);
  const drag=.57+.43*Math.sin(rib*4.3+phase*.73)**2;
  const beneath=(1-smooth(Math.abs(slope-.84),.08,.27))*(.66+.34*drag);
  const seam=(1-smooth(slope,.07,.25))*(.55+.45*drag);
  let ink=.13+Math.max(beneath*.31,seam*.26,hip*.23);
  let white=0;
  for(let i=0;i<roofCourses.length;i++) {
    if(!detail&&i%2===1)continue;
    const [center,width,start,end,slant]=roofCourses[i];
    const skew=.017*Math.sin(phase+i*2.1+down*3.7)+slant*(slope-.63);
    const strand=rib-center-skew;
    const taper=.51+.49*(1-smooth(slope,start,end));
    const stroke=smooth(slope,start-.14,start+.08)*(1-smooth(slope,end-.11,end+.06));
    const pressure=(1-smooth(Math.abs(strand),width*.23,width*taper))*stroke;
    ink=Math.max(ink,.16+pressure*(detail?.37:.26));
    const broken=.22+.78*smooth(Math.sin(slope*15+phase+i*1.8),-.55,.61);
    const dry=(1-smooth(Math.abs(strand+width*.49),width*.14,width*.49))*stroke*broken;
    white=Math.max(white,dry*(detail?.51:.36));
  }
  return [ink,white];
}

function makeRoof(batch, x, y, z, width, depth, height, curl, detail) {
  const columns = detail ? 60 : 22;
  const rows = detail ? 22 : 10;
  const stride = columns + 1;
  const topCount = stride * (rows + 1);
  const thickness = detail ? .43 : .32;
  const positions = [];
  const topIndices = [], underIndices = [], tileGuides = [];
  const point = (u, v, drop = 0) => [
    x + u * (width * .5 + .16 * Math.abs(v) ** 6),
    y + roofHeight(u, v, height, curl) - drop + curl*.024*Math.sin(u*12.4+v*2.9)*Math.abs(v)**6,
    z + v * (depth * .5 + .16 * Math.abs(u) ** 6),
  ];

  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const u=column / columns * 2 - 1, v=row / rows * 2 - 1;
        positions.push(...point(u,v,layer * thickness));
        if (layer===0)tileGuides.push(...roofInk(u,v,y*.61+z*.22,detail));
        if (row === rows || column === columns) continue;
        const a = layer * topCount + row * stride + column;
        if (layer === 0) topIndices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
        else underIndices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  }

  const boundary = [];
  for (let column = columns; column >= 0; column--) boundary.push(column);
  for (let row = 1; row <= rows; row++) boundary.push(row * stride);
  for (let column = 1; column <= columns; column++) boundary.push(rows * stride + column);
  for (let row = rows - 1; row > 0; row--) boundary.push(row * stride + columns);
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    underIndices.push(a, b, a + topCount, b, b + topCount, a + topCount);
  }
  batch.add(TILE, indexedGeometry(positions.slice(0,topCount*3), topIndices, tileGuides));
  batch.add(SOFFIT, indexedGeometry(positions, underIndices));

  for (const side of [-1, 1]) {
    const edge = Array.from({ length: 13 }, (_, i) => point(i / 6 - 1, side, .12));
    const hip = Array.from({ length: 9 }, (_, i) => point(side, i / 4 - 1, .12));
    batch.curve(TILE_EDGE, edge, thickness * .42);
    batch.curve(TILE_EDGE, hip, thickness * .42);
    if (detail) {
      const count = Math.round(width / 1.35);
      for (let i = 1; i < count; i++) {
        const u = i / count * 2 - 1;
        const [tileX, tileY, tileZ] = point(u, side, .06);
        const cap = new THREE.CylinderGeometry(.13, .14, .35, 6).rotateX(Math.PI * .5);
        batch.add(TILE_EDGE, cap, tileX, tileY, tileZ);
        if (Math.abs(u) < .73 && i % 2 === 0) {
          const ribs = Array.from({ length: 6 }, (_, j) => point(u * (1 - .19 * j / 5), side * (1 - .89 * j / 5), -.05));
          batch.curve(TILE_EDGE, ribs, .05, 3);
        }
      }
    }
  }

  const ridge = Array.from({ length: 13 }, (_, i) => point((i / 6 - 1) * .63, 0, -.15));
  batch.curve(METAL, ridge, detail ? .21 : .14);
  for (const side of [-1, 1]) {
    const end = point(side * .63, 0, -.22);
    const sweep = detail ? 1.15 : .74;
    batch.curve(METAL, [end, [end[0] + side * sweep * .44, end[1] + sweep * .34, end[2]],
      [end[0] + side * sweep, end[1] + sweep, end[2]], [end[0] + side * sweep * .77, end[1] + sweep * 1.3, end[2]]], sweep * .16);
    for (const front of [-1, 1]) {
      const tip = point(side, front, -.05);
      batch.curve(METAL, [point(side * .84, front, -.02), tip,
        [tip[0] + side * .52, tip[1] + .72, tip[2] + front * .25],
        [tip[0] + side * .43, tip[1] + 1.02, tip[2] + front * .16]], detail ? .12 : .085);
    }
  }
}

function railing(batch, a, b, spacing = 2, height = 1.12) {
  const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / spacing));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = THREE.MathUtils.lerp(a[0], b[0], t);
    const y = THREE.MathUtils.lerp(a[1], b[1], t);
    const z = THREE.MathUtils.lerp(a[2], b[2], t);
    batch.box(STONE, x, y + .11, z, .36, .22, .36);
    batch.box(CARVING, x, y + height * .48, z, .20, height * .94, .20);
    batch.column(CARVING, x, y + height * 1.02, z, .10, .14, .14, 6);
  }
  for (const h of [.27, .81]) {
    batch.segment(CARVING, [a[0], a[1] + h * height, a[2]], [b[0], b[1] + h * height, b[2]], .13, .15);
  }
}

function chamferedPerimeter(width,depth,frontCut) {
  const halfWidth=width*.5,halfDepth=depth*.5;
  const corner=Math.min(.82,width*.072,depth*.19);
  const front=frontCut??corner;
  const corners=[
    [-halfWidth+front,-halfDepth],[halfWidth-front,-halfDepth],
    [halfWidth,-halfDepth+front],[halfWidth,halfDepth-corner],
    [halfWidth-corner,halfDepth],[-halfWidth+corner,halfDepth],
    [-halfWidth,halfDepth-corner],[-halfWidth,-halfDepth+front],
  ];
  const points=[];
  for(let i=0;i<corners.length;i++){
    const a=corners[i],b=corners[(i+1)%corners.length];
    const divisions=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2.6));
    for(let j=0;j<divisions;j++){
      points.push([THREE.MathUtils.lerp(a[0],b[0],j/divisions),THREE.MathUtils.lerp(a[1],b[1],j/divisions)]);
    }
  }
  return points;
}

function terrace(batch,x,y,z,width,depth,height,frontCut,form) {
  const outline=chamferedPerimeter(width,depth,frontCut);
  const positions=[],guides=[],indices=[],seatIndices=[],capPositions=[x,y+.02,z],cap=[];
  const rows=terraceCourses[form]??[
    [.02,.17],[-.11,.19],[-.27,-.07],[-height*.62,-.23],[-height-.12,-.41],
  ];
  for(let row=0;row<rows.length;row++){
    const [level,expansion,relief=0,wear=0]=rows[row],lower=row/(rows.length-1);
    for(let i=0;i<outline.length;i++){
      const [u,v]=outline[i];
      const u01=u/(width*.5),v01=v/(depth*.5);
      const front=smooth(-v01,.36,.97);
      const shoulder=smooth(Math.abs(u01),.37,.93);
      const face=front*(.41+.59*shoulder);
      const joint=Math.sin(u*.29+z*.18)+.39*Math.sin(u*.81-v*.44);
      const chipped=face*smooth(joint,-.65,.81);
      const px=x+u*(1+2*expansion/width)+.23*relief*Math.sin(u*.63+v*.23);
      const pz=z+v*(1+2*expansion/depth)+relief*(.35*face+.89*chipped);
      const edge=wear*face*(.67*Math.sin(u*.41+z*.16)+.33*Math.sin(u*.87+level*.9));
      positions.push(px,y+level+edge,pz);
      const stain=THREE.MathUtils.smoothstep(
        Math.sin(px*.31+pz*.37+lower*1.89)+.45*Math.sin(px*.91-pz*.51+lower*3.2),-.73,.97,
      );
      // The thin upper lip catches light, the sloped retaining face gathers
      // ink toward the real support rock. Broad stains do not trace every edge.
      const toe=THREE.MathUtils.smoothstep(lower,.18,.93);
      const underLip=1-THREE.MathUtils.smoothstep(Math.abs(lower-.31),.07,.24);
      const shelfShade=form?(.17*underLip+.12*toe)*face*(.64+.36*stain):0;
      const strata=1-smooth(Math.abs(Math.sin(u*.46+lower*3.5+z*.23)),.22,.66);
      const pressure=(.045+.13*toe+.083*underLip)*(.46+.54*stain)+shelfShade;
      guides.push(pressure,.22*(1-lower)*(1-stain)+strata*wear*face*.29);
      if(row===0)capPositions.push(px,y+.02,pz);
      if(row===rows.length-1)continue;
      const a=row*outline.length+i,b=row*outline.length+(i+1)%outline.length;
      // The lower stone bed reads as a single weighted course under the
      // broad face. Different foundations pick different contact depths.
      const seat=form&&(form==='sideSteps'?row===rows.length-2:row>=3);
      (seat?seatIndices:indices).push(a,b,a+outline.length,b,b+outline.length,a+outline.length);
    }
  }
  for(let i=0;i<outline.length;i++)cap.push(0,1+(i+1)%outline.length,1+i);
  batch.add(STONE,indexedGeometry(capPositions,cap));
  batch.add(PLINTH,indexedGeometry(positions,indices,guides));
  if(seatIndices.length)batch.add(STONE_SEAT,indexedGeometry(positions,seatIndices,guides));
  return {x,y,z,width,depth,height,frontCut};
}

function stairFlight(batch, frontZ, backZ, lower, upper, width, steps, ramp = true) {
  const positions = [];
  const indices = [], guides=[];
  const stepDepth = (backZ - frontZ) / steps;
  const stepRise = (upper - lower) / steps;
  const side = width * .5;
  const rampSide = ramp ? width * .092 : 0;
  const footing = lower - 2.65;
  const intervals = ramp ? [[-side, -rampSide], [rampSide, side]] : [[-side, side]];
  function quad(a,b,c,d,paint) {
    const index=positions.length/3;
    positions.push(...a,...b,...c,...d);
    for(const point of [a,b,c,d])guides.push(...(paint?paint(point):[0,0]));
    indices.push(index,index+1,index+2,index,index+2,index+3);
  }
  const panels=batch.detail?7:4;
  for (let i = 0; i < steps; i++) {
    const z = frontZ + i * stepDepth;
    const y = lower + i * stepRise;
    const top = y + stepRise;
    const progress=(i+.5)/steps;
    for (const [left,right] of intervals) {
      const phase=frontZ*.23+(left>0?1.7:0);
      const run=smooth(Math.sin(progress*6.2+phase),-.68,.57);
      const bank=.64+.19*Math.sin(progress*3.5+phase*1.6);
      const cadence=.42+.58*smooth(Math.sin(i*1.52+phase),-.51,.68);
      const pressure=([x,pointY,pointZ],riser)=>{
        const cross=Math.abs(x)/side;
        const shoulder=1-smooth(Math.abs(cross-bank),.16,.45);
        const limit=smooth(cross,.18,.41);
        const band=shoulder*limit*run;
        const upperLip=riser ? smooth((pointY-y)/stepRise,.10,.88) : 1-smooth((pointZ-z)/stepDepth,.05,.90);
        const stroke=(riser?.029:.012)+band*(riser?.40:.19)*(.36+.64*upperLip)*cadence;
        const fray=smooth(Math.sin(cross*17+phase+i*.52),.03,.77);
        const paper=.32*band*upperLip*fray*(1-cadence*.68)+.12*(1-limit);
        return [stroke*(ramp?1:.55),paper];
      };
      for(let j=0;j<panels;j++){
        const a=THREE.MathUtils.lerp(left,right,j/panels);
        const b=THREE.MathUtils.lerp(left,right,(j+1)/panels);
        quad([a,y,z],[a,top,z],[b,top,z],[b,y,z],point=>pressure(point,true));
        quad([a,top,z],[a,top,z+stepDepth],[b,top,z+stepDepth],[b,top,z],point=>pressure(point,false));
      }
    }
    quad([-side, footing, z], [-side, footing, z + stepDepth], [-side, top, z + stepDepth], [-side, top, z]);
    quad([side, footing, z], [side, top, z], [side, top, z + stepDepth], [side, footing, z + stepDepth]);
  }
  if (ramp) {
    quad([-rampSide, lower + .05, frontZ], [-rampSide, upper + .05, backZ], [rampSide, upper + .05, backZ], [rampSide, lower + .05, frontZ]);
    for (const sign of [-1, 1]) {
      const x = rampSide * sign;
      quad([x, footing, frontZ], [x, lower + .05, frontZ], [x, upper + .05, backZ], [x, footing, backZ]);
      batch.segment(CARVING, [x, lower + .12, frontZ], [x, upper + .12, backZ], .14, .24);
    }
  }
  quad([-side, footing, frontZ], [-side, lower, frontZ], [side, lower, frontZ], [side, footing, frontZ]);
  quad([-side, footing, backZ], [side, footing, backZ], [side, upper, backZ], [-side, upper, backZ]);
  batch.add(STEPS,indexedGeometry(positions,indices,guides));
  for (const sign of [-1, 1]) {
    const x = sign * (side - .23);
    railing(batch, [x, lower, frontZ], [x, upper, backZ], 1.7);
  }
}

// The rock starts inside the actual chamfered stone terrace and turns
// into asymmetric bearing blades before disappearing into cloud at its foot.
function pedestalCliff(batch,x,z,radiusX,radiusZ,height,seed,footprint,cleft=0) {
  const rng=random(seed);
  const sides=42;
  const profiles=[[1.02,0],[1.035,.08],[1.06,.18],[1.02,.31],[1.11,.49],[1.17,.64],[1.24,.80],[1.35,1]];
  const outline=Array.from({length:sides},(_,i)=>{
    const theta=i/sides*Math.PI*2;
    const radius=.91+rng()*.15+.11*Math.cos(theta*7);
    return [theta,radius];
  });
  const positions=[],indices=[],inkGuides=[];
  const y=footprint.y-footprint.height+.07;
  for(let ring=0;ring<profiles.length;ring++){
    const [spread,drop]=profiles[ring];
    for(let i=0;i<sides;i++){
      const [theta,ridge]=outline[i];
      const cx=Math.cos(theta),cz=Math.sin(theta);
      const shoulderStart=.045+.03*Math.sin(theta*4.4+seed);
      const shoulder=THREE.MathUtils.smoothstep(drop,shoulderStart,.36+.11*Math.sin(theta*2.6+seed*.18));
      const twist=theta+.15*Math.sin(theta*3+seed)*drop;
      const cut=Math.cos(theta*4.1-drop*3.6+seed*.13);
      const folds=.96+.14*cut+.047*Math.sin(theta*9.1+drop*5.7+seed);
      const radius=spread*ridge*folds;
      const seatZ=footprint.z+Math.sign(cz)*Math.abs(cz)**.29*(footprint.depth*.5-.15);
      const cutback=Math.max(0,(footprint.frontCut??0)-(seatZ-footprint.z+footprint.depth*.5));
      const seatX=footprint.x+Math.sign(cx)*Math.min(
        Math.abs(cx)**.29*(footprint.width*.5-.22),footprint.width*.5-.22-cutback,
      );
      const knife=cleft*(1-smooth(Math.abs(cx-.35),.03,.33))*smooth(-cz,.29,.77);
      const front=smooth(-cz,.39,.93);
      const bed=front*smooth(drop,.05,.36)*(1-.51*smooth(drop,.59,1));
      const fault=cleft*bed*(.33+.67*smooth(Math.sin(theta*5+seed*.81),-.23,.76));
      const recess=knife*smooth(drop,.04,.38)*(1-.36*smooth(drop,.57,1))+fault*.58;
      const px=THREE.MathUtils.lerp(seatX,x+Math.cos(twist)*radiusX*radius,shoulder)+recess*.48;
      const pz=THREE.MathUtils.lerp(seatZ,z+Math.sin(twist)*radiusZ*radius,shoulder)+recess;
      const stratum=theta+drop*.89+.18*Math.sin(seed*.4);
      const plane=Math.sin(stratum*3.0)*.58+Math.sin(stratum*4.7+.83)*.26;
      const foot=THREE.MathUtils.smoothstep(drop,.42+.20*Math.sin(theta*2.3+seed),.97);
      const bearing=1-THREE.MathUtils.smoothstep(drop,.06,.29);
      const crease=1-THREE.MathUtils.smoothstep(Math.abs(Math.sin(stratum*3.6+.6)),.12,.52);
      const torn=1-THREE.MathUtils.smoothstep(Math.abs(Math.sin(stratum*5.0+drop*2.7)),.09,.43);
      const turn=THREE.MathUtils.smoothstep(drop,.13,.33);
      const dry=Math.max(crease*.54,torn*.24)*turn*(1-foot)*(.69+.31*Math.sin(theta*2.7+drop*2.3));
      const pressure=THREE.MathUtils.clamp(.14+.34*plane+.17*bearing+cut*.12+recess*.049,0,.65)*(1-foot);
      const foldedDrop=drop+Math.sin(drop*Math.PI)*(.11*Math.sin(theta*4.2+seed)+.063*Math.sin(theta*7.1));
      inkGuides.push(pressure,Math.min(.93,dry+foot*.76));
      positions.push(px,y-height*foldedDrop+(rng()-.5)*(ring?.61:.045),pz);
      if(ring===profiles.length-1)continue;
      const a=ring*sides+i,b=ring*sides+(i+1)%sides;
      indices.push(a,b,a+sides,b,b+sides,a+sides);
    }
  }
  batch.add(CLIFF,indexedGeometry(positions,indices,inkGuides));
}

function brackets(batch, x, y, z, size, direction) {
  batch.box(TIMBER, x, y + .10 * size, z, .94 * size, .2 * size, .94 * size);
  for (let level = 0; level < 3; level++) {
    const offset = level * .34 * size;
    const lift = y + (.29 + level * .30) * size;
    batch.box(TIMBER, x, lift, z + direction * offset, (1.07 + level * .4) * size, .21 * size, .62 * size);
    batch.box(TIMBER, x, lift + .15 * size, z + direction * (.18 + level * .47) * size, .34 * size, .13 * size, (.9 + .28 * level) * size);
    for (const side of [-1, 1]) {
      batch.box(CARVING, x + side * (.33 + level * .19) * size, lift + .13 * size, z + direction * offset, .22 * size, .10 * size, .37 * size);
    }
  }
}

function buildHall(batch, { x, y, z, width, depth, height, tiers, portal = false, detailed = false, screened = false, softCenter = false }) {
  const columnRadius = Math.max(.25, height * .054);
  const columnXs = portal ? [-.43, -.30, -.137, .137, .30, .43] : [-.40, -.22, 0, .22, .40];
  for (const fraction of columnXs) {
    const columnX = x + width * fraction;
    for (const direction of [-1, 1]) {
      const columnZ = z + direction * depth * .40;
      batch.box(PLINTH,columnX,y+.041,columnZ,columnRadius*3.54,.112,columnRadius*3.54);
      batch.column(STONE, columnX, y + .21, columnZ, columnRadius * 1.28, columnRadius * 1.65, .43);
      batch.column(CARVING, columnX, y + .47, columnZ, columnRadius * 1.07, columnRadius * 1.26, .16);
      const pale=portal&&(fraction===-.137||fraction===.137&&direction>0);
      batch.column(pale?WASHED_LACQUER:LACQUER,columnX,y+(height+.55)*.5,columnZ,columnRadius*.84,columnRadius,height-.55);
      batch.column(TIMBER, columnX, y + height - .22, columnZ, columnRadius * 1.07, columnRadius * 1.01, .40);
      if (detailed) brackets(batch, columnX, y + height, columnZ, height / 10, direction);
    }
  }
  for (const direction of [-1, 1]) {
    const beamZ = z + direction * depth * .40;
    batch.box(TIMBER, x, y + height + .46, beamZ, width * .94, .74, .94);
    batch.box(CARVING, x, y + height + .89, beamZ, width * .96, .18, 1.03);
    for (const side of [-1, 1]) {
      batch.box(TIMBER, x + side * width * .423, y + height + .47, z, .73, .73, depth * .89);
    }
    if (detailed) {
      for (let i = -12; i <= 12; i++) {
        const rafterX = x + i * width / 26;
        batch.box(TIMBER, rafterX, y + height + 1.32, z + direction * depth * .47, .24, .24, depth * .25);
      }
    }
  }
  const baseY = y + height + 1.55;
  if (detailed) {
    // The inset soffit and tie beams leave a dark ceiling behind the lit rafters.
    batch.box(SHADOWED_WOOD, x, baseY - .47, z, width * .94, .29, depth * .84);
    for (const fraction of columnXs) {
      batch.box(TIMBER, x + width * fraction, baseY - .67, z, .38, .25, depth * .91);
    }
  }
  if (screened) addRearScreen(batch,x,y,z+depth*.29,width*.79,height*.83,softCenter);
  makeRoof(batch, x, baseY, z, width * 1.13, depth * 1.28, tiers > 1 ? 4.3 : height * .42, detailed ? 1.9 : 1.15, detailed);

  if (portal) {
    batch.box(TIMBER, x, y + height - .43, z - depth * .46, 6.4, 1.62, .34);
    batch.box(METAL, x, y + height - .43, z - depth * .469, 5.95, 1.21, .10);
    batch.box(TIMBER, x, y + height - .43, z - depth * .475, 5.66, .95, .08);
    const textY = y + height - .43;
    const textZ = z - depth * .475 - .066;
    const mark = (a, b) => batch.segment(METAL, [x - a[0], textY + a[1], textZ], [x - b[0], textY + b[1], textZ], .065, .032);
    for (const [a, b] of [
      [[-1.17, .25], [-.63, .25]], [[-1.25, .06], [-.53, .06]],
      [[-.90, .24], [-.91, -.09]], [[-.91, -.09], [-1.26, -.33]], [[-.91, -.05], [-.55, -.31]],
      [[.62, .32], [.73, .23]], [[.52, .16], [.52, -.33]],
      [[.76, .24], [1.22, .24]], [[1.22, .24], [1.22, -.30]], [[1.22, -.30], [1.10, -.34]],
    ]) mark(a, b);
  }

  if (tiers === 1) return;
  const tierBase = baseY + 2.25;
  const tierHeight = detailed ? 3.4 : 2.6;
  const tierWidth = width * .72;
  const tierDepth = depth * .70;
  // The upper floor sits behind the roof's lip. Larger, grouped panes
  // give the main eave a readable silhouette at both ends of the flight.
  batch.box(TIMBER, x, tierBase + tierHeight * .46, z, tierWidth, tierHeight * 1.17, tierDepth);
  for (const direction of [-1, 1]) {
    const galleryZ=z+direction*(tierDepth*.5+.13);
    batch.box(TIMBER,x,tierBase+tierHeight*.32,galleryZ,tierWidth*.96,.18,.34);
    batch.box(TIMBER,x,tierBase+tierHeight*.82,galleryZ,tierWidth*.96,.20,.34);
    const bayWidth=tierWidth/7;
    for(let bay=-3;bay<=3;bay++){
      const bayX=x+bay*bayWidth;
      const panel=tierBase+tierHeight*.56;
      const lightBay=detailed?Math.abs(bay)!==2:Math.abs(bay)<2;
      batch.box(lightBay?REAR_WALL:SHADOWED_WOOD,bayX,panel,galleryZ,bayWidth*.71,tierHeight*.42,.26);
      batch.box(LACQUER,bayX-bayWidth*.43,panel,galleryZ,.24,tierHeight*.72,.32);
      if(lightBay){
        for(const offset of [-.17,.16]){
          batch.box(CARVING,bayX+offset*bayWidth,panel,galleryZ+direction*.16,.15,tierHeight*.39,.20);
        }
        batch.box(TIMBER,bayX,panel+tierHeight*.075,galleryZ+direction*.16,bayWidth*.66,.10,.18);
      }
    }
  }
  makeRoof(batch, x, tierBase + tierHeight + .28, z, tierWidth * 1.18, tierDepth * 1.31, detailed ? 4.85 : 3.05, detailed ? 2.15 : 1.1, detailed);
}

function sideSteps(batch, direction) {
  const start = 24.55;
  const end = 30.8;
  const front = -2.22;
  const back = 1.28;
  const steps = 11;
  for (let step = 0; step < steps; step++) {
    const x = start + (step + .5) / steps * (end - start);
    const y = -step / steps * 3.4;
    const tread = (end - start) / steps;
    batch.box(STONE, x * direction, (y - 3.54) * .5, (front + back) * .5, tread + .012, y + 3.54, back - front);
  }
  for (const z of [front + .18, back - .18]) {
    railing(batch, [start * direction, .035, z], [end * direction, -3.31, z], 1.6);
  }
}

function galleryApproach(batch) {
  const course=[
    [24.46,.02,-9.3],[25.58,.02,-9.65],[26.50,-.65,-10.16],
    [27.38,-1.3,-10.48],[28.30,-1.95,-10.46],[29.15,-2.62,-10.05],
    [29.95,-3.4,-9.46],[30.75,-3.4,-8.72],
  ];
  const positions=[],guides=[],stone=[],side=[];
  const half=1.27;
  function quad(points,indices,paint){
    const i=positions.length/3;
    for(const point of points){
      positions.push(...point);
      guides.push(...paint);
    }
    indices.push(i,i+1,i+2);
    if(points.length===4)indices.push(i,i+2,i+3);
  }
  for(let i=0;i<course.length-1;i++){
    const [x,y,z]=course[i], [next,lower,far]=course[i+1];
    const width=half+.15*Math.sin(i*.68),nextWidth=half+.15*Math.sin((i+1)*.68);
    const front=z-width,back=z+width,outer=far-nextWidth,inner=far+nextWidth;
    quad([[x,y,front],[x,y,back],[next,y,inner],[next,y,outer]],stone,[.028,.24]);
    if(lower!==y)quad([[next,y,outer],[next,y,inner],[next,lower,inner],[next,lower,outer]],stone,[.20,.08]);
    const foot=Math.max(-5.12,y-1.16)+.11*Math.sin(i*.76);
    const end=Math.max(-5.12,lower-1.16)+.11*Math.sin((i+1)*.76);
    quad([[x,y,front],[next,y,outer],[next,end,outer+.35],[x,foot,front+.35]],side,[.18,.06]);
    quad([[next,y,inner],[x,y,back],[x,foot,back-.24],[next,end,inner-.24]],side,[.095,.07]);
    if(lower!==y)quad([[next,y,outer],[next,lower,outer],[next,end,outer+.35]],side,[.21,.06]);
  }
  batch.add(STEPS,indexedGeometry(positions,stone,guides));
  batch.add(STONE_SEAT,indexedGeometry(positions,side,guides));
  const rockSeat={x:28.35,y:-3.62,z:-8.75,width:6.4,depth:1.84,height:1.35};
  pedestalCliff(batch,29.05,-7.7,4.8,2.3,9.6,726,rockSeat,1.8);
}

function addRearScreen(batch, x, y, z, width, height, softCenter=false) {
  batch.box(REAR_WALL, x, y + height * .43, z, width, height * .86, .42);
  batch.box(TIMBER, x, y + height * .87, z, width + .22, height * .11, .57);
  batch.box(STONE, x, y + height * .08, z, width + .34, height * .16, .64);
  const bayWidth = width / 5;
  for (let bay = -2; bay <= 2; bay++) {
    const center = x + bay * bayWidth;
    if(softCenter&&Math.abs(bay)<=1){
      batch.box(STONE,center,y+height*.50,z-.252,bayWidth*.76,height*.52,.18);
      batch.box(CARVING,center,y+height*.245,z-.36,bayWidth*.76,.11,.15);
      continue;
    }
    batch.box(SHADOWED_WOOD, center, y + height * .51, z - .25, bayWidth * .76, height * .55, .19);
    for (let bar = -2; bar <= 2; bar++) {
      batch.box(TIMBER, center + bar * bayWidth * .11, y + height * .51, z - .38, .13, height * .51, .14);
    }
    batch.box(CARVING, center, y + height * .38, z - .43, bayWidth * .78, .11, .16);
    batch.box(CARVING, center, y + height * .63, z - .43, bayWidth * .78, .11, .16);
  }
}

function coveredWalk(batch, direction) {
  const x = direction * 14.4;
  const y = .95;
  const width = 7.7;
  const start = 13.25;
  const end = 27.1;
  const depth = end - start;
  const z = (start + end) * .5;
  const roofY = y + 5.8;
  const footing=terrace(batch,x,y,z,width+1.1,depth+.45,2.4);
  pedestalCliff(batch,x,z,5.1,7.6,14.1,690+direction,footing);
  for (const postX of [x - width * .4, x + width * .4]) {
    for (let i = 0; i < 4; i++) {
      const postZ = start + 1 + (depth - 2) * i / 3;
      batch.column(STONE, postX, y + .17, postZ, .31, .44, .34, 8);
      batch.column(TIMBER, postX, y + 2.71, postZ, .23, .29, 4.72, 8);
    }
    batch.box(SHADOWED_WOOD, postX, roofY - .51, z, .51, .5, depth);
  }
  // A receding roof and terrace appear only in the outer bays. The
  // central stair continues uninterrupted towards the distant hall.
  makeRoof(batch, x, roofY, z, width * 1.34, depth * 1.09, 2.0, .95, false);
  addRearScreen(batch, x, y, z + depth * .35, width * .89, 4.3);
}

// Open longitudinal gallery, with a gable facing the ascent instead of a
// second broad hall. Its lower roof leaves the higher hall behind visible.
function openSideGallery(batch,x,y,z) {
  const halfWidth=4.9,halfLength=9.0,eave=y+4.8;
  const columns=12,rows=16,stride=columns+1;
  const positions=[],top=[],under=[],guides=[];
  const count=stride*(rows+1);
  const roofPoint=(u,v,drop)=>[
    x+u*halfWidth,
    eave+2.18*(1-Math.abs(u))**1.48+.29*Math.abs(v)**4*Math.abs(u)**3-drop,
    z+v*halfLength,
  ];
  for(let layer=0;layer<2;layer++){
    for(let row=0;row<=rows;row++) for(let col=0;col<=columns;col++){
      const u=col/columns*2-1,v=row/rows*2-1;
      positions.push(...roofPoint(u,v,layer*.25));
      if(layer===0)guides.push(...roofInk(v,u,z*.61,false));
      if(row===rows||col===columns)continue;
      const i=layer*count+row*stride+col;
      if(layer===0)top.push(i,i+stride,i+1,i+1,i+stride,i+stride+1);
      else under.push(i,i+1,i+stride,i+1,i+stride+1,i+stride);
    }
  }
  const perimeter=[];
  for(let col=columns;col>=0;col--)perimeter.push(col);
  for(let row=1;row<=rows;row++)perimeter.push(row*stride);
  for(let col=1;col<=columns;col++)perimeter.push(rows*stride+col);
  for(let row=rows-1;row>0;row--)perimeter.push(row*stride+columns);
  for(let i=0;i<perimeter.length;i++){
    const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
    under.push(a,b,a+count,b,b+count,a+count);
  }
  batch.add(TILE,indexedGeometry(positions.slice(0,count*3),top,guides));
  batch.add(SOFFIT,indexedGeometry(positions,under));
  for(const side of [-1,1]){
    const postX=x+side*3.61;
    for(const postZ of [-7.4,-3.9,.45,4.4,7.5]){
      batch.column(STONE,postX,y+.15,z+postZ,.28,.39,.30,8);
      batch.column(LACQUER,postX,y+2.39,z+postZ,.16,.23,4.18,8);
      batch.box(TIMBER,postX,y+4.53,z+postZ,.49,.19,.42);
    }
    batch.box(TIMBER,postX,y+4.66,z,.38,.34,16.2);
    batch.curve(TILE_EDGE,Array.from({length:9},(_,i)=>roofPoint(side,i/4-1,.13)),.12);
  }
  for(const side of [-1,1]){
    const end=z+side*7.4;
    batch.box(TIMBER,x,y+4.76,end,7.7,.27,.40);
    for(const corner of [-1,1]){
      batch.segment(TIMBER,[x+corner*3.52,y+4.88,end],[x,y+6.62,end],.26,.24);
      batch.segment(CARVING,[x+corner*1.2,y+4.83,end],[x+corner*.57,y+5.63,end],.12,.14);
    }
  }
  batch.box(STONE,x,y+.09,z,8.0,.18,17.1);
}

function octagonalCanopy(batch,x,y,z,radius,rise) {
  const facets=8,cells=5,perimeter=facets*cells;
  const outline=Array.from({length:facets},(_,i)=>{
    const angle=(i+.5)*Math.PI*2/facets;
    return [Math.cos(angle),Math.sin(angle)];
  });
  const rings=[[1,0],[.88,.035],[.68,.18],[.43,.44],[.20,.72],[.026,1]];
  const positions=[],ink=[],tiles=[],soffit=[];
  const ringCount=rings.length*perimeter;
  function roofPoint(index,ring,drop) {
    const facet=Math.floor(index/cells),offset=(index%cells)/cells;
    const a=outline[facet],b=outline[(facet+1)%facets];
    const [scale,height]=rings[ring];
    return [
      x+THREE.MathUtils.lerp(a[0],b[0],offset)*radius*scale,
      y+rise*height+.35*(1-scale*.6)*Math.abs(offset-.5)**2*4-drop,
      z+THREE.MathUtils.lerp(a[1],b[1],offset)*radius*scale,
    ];
  }
  for(let layer=0;layer<2;layer++) for(let ring=0;ring<rings.length;ring++) for(let i=0;i<perimeter;i++){
    positions.push(...roofPoint(i,ring,layer*.26));
    const seam=(1-Math.abs(i%cells/cells-.5)*2);
    if(!layer)ink.push(.17+.24*(1-seam)+.09*Math.sin(i*.67+ring*.8),.29*seam*smooth(rings[ring][0],.23,.81));
    const a=layer*ringCount+ring*perimeter+i,b=layer*ringCount+ring*perimeter+(i+1)%perimeter;
    if(ring<rings.length-1){
      if(layer)soffit.push(a,b,a+perimeter,b,b+perimeter,a+perimeter);
      else tiles.push(a,a+perimeter,b,b,a+perimeter,b+perimeter);
    }
    if(!layer&&!ring)soffit.push(a,b,a+ringCount,b,b+ringCount,a+ringCount);
  }
  batch.add(TILE,indexedGeometry(positions.slice(0,ringCount*3),tiles,ink));
  batch.add(SOFFIT,indexedGeometry(positions,soffit));
  for(let i=0;i<facets;i++){
    const start=i*cells;
    batch.curve(TILE_EDGE,rings.map((_,ring)=>roofPoint(start,ring,-.10)),.095);
    batch.curve(TILE_EDGE,Array.from({length:cells+1},(_,j)=>roofPoint((start+j)%perimeter,0,.09)),.13);
  }
  batch.column(METAL,x,y+rise+.4,z,.11,.33,.80,8);
}

function bellPavilion(batch,x,y,z) {
  const lowerDeck=6.45;
  batch.column(PLINTH,x,y+.33,z,lowerDeck+.20,lowerDeck+.57,.66,8);
  for(const [floor,deck,height] of [[.62,lowerDeck,4.77],[6.82,3.4,3.9]]){
    const floorY=y+floor;
    const upper=floor>1;
    batch.column(upper?TIMBER:STONE,x,floorY+.12,z,deck,deck+.2,.24,8);
    for(let i=0;i<8;i++){
      const angle=(i+.5)*Math.PI/4;
      const u=x+Math.cos(angle)*deck*.79,v=z+Math.sin(angle)*deck*.79;
      batch.column(STONE,u,floorY+.26,v,.27,.39,.34,8);
      batch.column(LACQUER,u,floorY+height*.50,v,.20,.29,height-.34,8);
      const next=angle+Math.PI/4;
      batch.segment(TIMBER,[u,floorY+height-.08,v],[
        x+Math.cos(next)*deck*.79,floorY+height-.08,z+Math.sin(next)*deck*.79,
      ],.33,.49);
      if(!upper&&Math.sin(angle+Math.PI/8)>.19){
        const endX=x+Math.cos(next)*deck*.76,endZ=z+Math.sin(next)*deck*.76;
        const length=Math.hypot(endX-u,endZ-v),yaw=-Math.atan2(endZ-v,endX-u);
        for(const [material,center,height,depth] of [
          [STONE,.46,.77,.29],[REAR_WALL,2.21,2.96,.27],[TIMBER,3.63,.18,.30],
        ]){
          batch.add(material,new THREE.BoxGeometry(length,height,depth).rotateY(yaw),
            (u+endX)*.5,floorY+center,(v+endZ)*.5);
        }
      }
    }
    octagonalCanopy(batch,x,floorY+height+.18,z,deck*1.22,upper?4.12:3.05);
  }
  batch.column(SHADOWED_WOOD,x,y+4.35,z,.24,.31,1.45,8);
  batch.column(METAL,x,y+3.37,z,.89,1.23,2.18,14);
  batch.column(METAL,x,y+2.26,z,1.31,1.28,.22,14);
}

function bellSideHall(batch,x,y,z) {
  const depth=7.6;
  batch.box(PLINTH,x,y+.28,z,13.1,.56,depth+.65);
  batch.box(REAR_WALL,x,y+1.97,z+.37,12.75,3.28,depth-.66);
  const face=z-depth*.49;
  for(const u of [-5.9,-3.15,3.15,5.9]){
    batch.column(LACQUER,x+u,y+2.05,face,.21,.28,3.38,8);
  }
  batch.box(SHADOWED_WOOD,x,y+2.0,face-.07,5.36,2.87,.20);
  for(const u of [-1.94,-.65,.65,1.94]){
    batch.box(TIMBER,x+u,y+2.02,face-.20,.18,2.79,.20);
  }
  batch.box(TIMBER,x,y+3.67,z,13.3,.39,depth);
  makeRoof(batch,x,y+3.96,z,14.8,depth+1.9,1.65,.53,false);
}

function cliffScreenCourt(batch,x,y,z) {
  const width=22,front=z-3.10,back=z+2.45;
  const rise=1.32;
  batch.box(PLINTH,x,y+.27,z-.30,width,.54,6.73);
  batch.box(STONE,x,y+.58,z-.30,width-.34,.15,6.36);
  const wallTop=y+4.93;
  const roof=[[-10.8,3.24],[-7.8,3.43],[-4.9,3.39],[-1.2,3.46],[2.4,3.59],[5.6,3.77],[7.8,3.76]];
  function sheet(under) {
    const positions=[],faces=[],ink=[];
    for(const [i,[u,frontLift]] of roof.entries()){
      for(let j=0;j<4;j++){
        const across=j/3;
        positions.push(x+u,y+THREE.MathUtils.lerp(frontLift,4.63,across)*rise
          +.073*Math.sin(Math.PI*across)-under*.19,THREE.MathUtils.lerp(front-.56,back+.27,across));
        ink.push((.17+.16*Math.sin(i*1.1+across*3.0)**2)*(.64+.36*across),
          (i===2||i===5?.33:.09)*(1-across));
        const a=i*4+j;
        if(i<roof.length-1&&j<3)faces.push(a,a+4,a+1,a+4,a+5,a+1);
      }
    }
    return indexedGeometry(positions,faces,under?undefined:ink);
  }
  batch.add(TILE,sheet(0));
  batch.add(SOFFIT,sheet(1));
  batch.curve(TILE_EDGE,roof.map(([u,lift])=>[x+u,y+lift*rise-.07,front-.55]),.112);

  // A stepped masonry back keeps this wing lower and more solid than the
  // main gate, with an unbroken pale interval between the open front bays.
  for(const [u,w,h] of [[-8.9,3.9,3.82],[-5.27,3.4,4.25],[-1.32,4.63,4.01],[3.15,4.41,4.34],[6.61,2.66,4.46]]){
    batch.box(REAR_WALL,x+u,y+.64+h*.5*rise,back,w,h*rise,.61);
    batch.box(PLINTH,x+u,y+.68,back,w,.42,.80);
    batch.box(TILE_EDGE,x+u,y+.66+h*rise,back,w+.12,.13,.87);
  }
  for(const [u,h] of [[-10.08,3.32],[-6.47,3.41],[-2.87,3.44],[1.0,3.55],[4.41,3.69],[7.33,3.76]]){
    batch.box(CARVING,x+u,y+.77,front,.47,.29,.51);
    batch.column(TIMBER,x+u,y+(.86+h*rise)*.5,front,.105,.15,h*rise-.86,8);
    batch.box(SHADOWED_WOOD,x+u,y+h*rise-.12,front,.34,.19,.41);
  }
  const gateway=x+9.14;
  for(const side of [-1,1]){
    batch.box(PLINTH,gateway+side*1.05,y+.84,front+.22,.59,.69,.85);
    batch.box(CARVING,gateway+side*1.05,y+2.74,front+.22,.39,3.77,.61);
  }
  batch.box(SHADOWED_WOOD,gateway,y+4.77,front+.22,2.61,.42,.70);
  batch.box(STONE,gateway,y+5.05,front+.22,3.02,.20,1.21);
  batch.segment(TILE_EDGE,[gateway-1.73,wallTop+.09,front+.22],
    [gateway-.11,wallTop+.89,front+.22],.25,1.06);
  batch.segment(TILE_EDGE,[gateway-.12,wallTop+.89,front+.22],
    [gateway+1.62,wallTop+.17,front+.22],.22,1.06);
  batch.box(STONE,gateway,y+.54,front-.55,2.37,.23,1.72);
}

function cliffRidge(batch,x,y,z,width,depth,rise,seed) {
  const rng=random(seed),sides=20;
  const profile=[
    [0,1,0],[.23,.97,.11],[.47,.81,-.09],[.64,.75,.04],[.75,.67,-.11],
    [.84,.63,-.16],[.92,.54,-.20],[.97,.40,-.18],[1,.27,-.17],
  ];
  const edges=Array.from({length:sides},(_,i)=>[i/sides*Math.PI*2,.87+rng()*.24]);
  const positions=[],indices=[],guides=[];
  for(let ring=0;ring<profile.length;ring++) for(let i=0;i<sides;i++){
    const [height,spread,offset]=profile[ring],[angle,edge]=edges[i];
    const fold=Math.sin(angle*3+height*.88);
    const face=.79+.21*fold+.16*Math.cos(angle*6-height*2.05);
    const weather=Math.sin(angle*5+.34*Math.sin(height*8.2));
    const dry=1-smooth(Math.abs(weather),.14,.51);
    const appear=smooth(height,.09,.48);
    positions.push(
      x+width*(offset+Math.cos(angle)*spread*edge*face),
      y+rise*(height+Math.sin(angle*4.2+ring*.45)*spread*.072)+smooth(height,.65,.99)*Math.cos(angle+.65)*1.8,
      z+depth*Math.sin(angle)*spread*edge*(1+.16*fold)+height*2.3,
    );
    const plate=smooth(Math.sin(angle*2.6+height*2.4+seed),-.13,.68);
    guides.push(appear*(.10+.29*smooth(fold,-.45,.75)+plate*.19),(1-appear)*.81+appear*dry*.48);
    if(ring<profile.length-1){
      const a=ring*sides+i,b=ring*sides+(i+1)%sides;
      indices.push(a,a+sides,b,b,a+sides,b+sides);
    }
  }
  const cap=positions.length/3,last=cap-sides;
  positions.push(x-width*.18,y+rise,z+2.3);
  guides.push(.19,.29);
  for(let i=0;i<sides;i++)indices.push(cap,last+(i+1)%sides,last+i);
  batch.add(CLIFF,indexedGeometry(positions,indices,guides));
}

function sideCourt(near,back,direction) {
  const center=direction*34;
  const nearZ=direction<0?-3.9:.6;
  const nearDepth=direction<0?23:21;
  const nearHeight=direction<0?6.3:6.85;
  const cut=direction<0?4.25:.82;
  const lower=terrace(near,center,-3.4,nearZ,22,nearDepth,direction<0?1.66:2.55,cut,
    direction<0?'sideSteps':'sideSlope');
  pedestalCliff(near,center+direction*.85,nearZ+.62,12.6,13.2,direction<0?17.3:19.7,
    direction+412,lower,direction>0?2.4:4.4);
  if(direction>0)openSideGallery(near,center+1.5,-3.4,nearZ);
  else buildHall(near,{x:center,y:-3.4,z:nearZ,width:17.4,depth:10.9,height:nearHeight,tiers:1,screened:true});
  const nearEdge=nearZ-nearDepth*.5+.50,span=10.65-cut;
  railing(near,[center-span,-3.35,nearEdge],[center+span,-3.35,nearEdge],1.89);
  railing(near,[center+direction*span,-3.35,nearEdge],
    [center+direction*10.42,-3.35,nearEdge+cut],1.6);
  railing(near,[center+direction*10.42,-3.35,nearEdge+cut],
    [center+direction*10.42,-3.35,nearZ+nearDepth*.46],2.09);

  const rearCenter=center+direction*(direction<0?7.4:9.9);
  const rearZ=direction<0?17.2:20.0;
  const rearY=direction<0?2.9:2.4;
  const upper=terrace(back,rearCenter,rearY,rearZ,26,20,3.10);
  pedestalCliff(back,rearCenter,rearZ,14.9,11.6,20.5,direction+119,upper);
  if(direction>0){
    bellSideHall(back,rearCenter-6.0,rearY,rearZ-2.5);
    bellPavilion(back,rearCenter+.65,rearY,rearZ+1.3);
  }else{
    cliffScreenCourt(back,rearCenter+.55,rearY,rearZ-.7);
  }
  railing(back,[rearCenter-12.6,rearY+.05,rearZ-9.5],[rearCenter+12.6,rearY+.05,rearZ-9.5],1.97);
}

function cloudFoot(batch, x, y, z, width, depth, peak, seed) {
  const nx=23,nz=13,points=[],indices=[],guides=[];
  const phase=seed*.716;
  for(let row=0;row<=nz;row++) for(let column=0;column<=nx;column++){
    const u=column/nx*2-1,v=row/nz*2-1;
    const r=Math.hypot(u*.89,v*.98);
    const shoulder=Math.max(0,1-r)**.68;
    const slope=.45+.32*Math.sin(u*3.7+v*1.6+phase)+.19*Math.cos(u*7.4-v*4.5+phase);
    const height=peak*shoulder*Math.max(.08,slope);
    points.push(x+u*width,y+height,z+v*depth);
    const stripe=THREE.MathUtils.smoothstep(Math.sin(u*9.0-v*5.6+phase),-.51,.64);
    const tip=THREE.MathUtils.smoothstep(height/peak,.15,.55);
    guides.push(tip*(.12+.41*stripe),.91*(1-tip)+.14*tip*(1-stripe));
    if(row===nz||column===nx)continue;
    const i=row*(nx+1)+column;
    indices.push(i,i+nx+1,i+1,i+1,i+nx+1,i+nx+2);
  }
  batch.add(CLOUD_FOOT,indexedGeometry(points,indices,guides));
}

export function createHeaven(environment, root) {
  const gate = new THREE.Group();
  gate.name = '九重天阙 · 中门';
  gate.position.set(0, 17, 52);
  root.add(gate);

  const main = new PalaceGeometry(true);
  const gateFoot=terrace(main,0,0,.8,50,25.6,2.7,undefined,'gate');
  pedestalCliff(main,0,4,28,13.2,26.5,193,gateFoot,3.6);
  const landingFoot=terrace(main,0,-11,-31.7,27.0,5.2,2.7,undefined,'landing');
  pedestalCliff(main,-.75,-30.7,13.9,4.1,10.8,217,landingFoot,2.4);
  stairFlight(main, -31.8, -25.9, -11, -7.65, 21.2, 14);
  const firstStairFoot=terrace(main,0,-7.65,-24.7,22.25,2.52,3.4);
  pedestalCliff(main,0,-24.7,12.1,4.2,13,233,firstStairFoot);
  stairFlight(main, -23.5, -18.1, -7.65, -3.75, 22.1, 15);
  const secondStairFoot=terrace(main,0,-3.75,-16.9,23.15,2.5,3.6);
  pedestalCliff(main,0,-16.9,12.7,4.1,17,239,secondStairFoot);
  stairFlight(main, -15.7, -11.9, -3.75, 0, 23, 14);
  for (const direction of [-1, 1]) {
    railing(main,[direction*11.7,.04,-11.9],[direction*24.65,.04,-11.9],1.82);
    if(direction>0){
      railing(main,[24.65,.04,-11.9],[24.65,.04,-10.72],1.8);
      railing(main,[24.65,.04,-7.85],[24.65,.04,13.3],1.82);
      galleryApproach(main);
    }else{
      railing(main,[-24.65,.04,-11.9],[-24.65,.04,-2.2],1.82);
      railing(main,[-24.65,.04,1.2],[-24.65,.04,13.3],1.82);
      sideSteps(main,direction);
    }
    for (const [y, z, width, depth] of [[-11, -31.7, 27, 5.2], [-7.65, -24.7, 22.25, 2.52], [-3.75, -16.9, 23.15, 2.50]]) {
      const x = direction * (width * .5 - .25);
      railing(main, [x, y + .04, z - depth * .5 + .18], [x, y + .04, z + depth * .5 - .18], 1.4);
    }
    batchEntranceLantern(main, direction * 12.6, 0, -10.3);
  }
  buildHall(main, { x: 0, y: 0, z: 0, width: 49, depth: 17.5, height: 11.9, tiers: 2, portal: true, detailed: true });
  main.commit(environment, gate);

  const foreground=new PalaceGeometry();
  cloudFoot(foreground,26,-14.1,-41.9,13.2,7.0,7.8,53);
  cloudFoot(foreground,-28.6,-14.9,-37.3,12.6,7.9,5.3,112);
  foreground.commit(environment,gate,.74);

  const mountain=new PalaceGeometry();
  cliffRidge(mountain,-56.7,-12.5,35.0,21.4,14.7,24.1,330);
  cliffRidge(mountain,-73.5,-13.6,30.3,19.5,13.9,24.7,381);
  mountain.commit(environment,gate,.48);

  const nearCourt=new PalaceGeometry(),rearCourt=new PalaceGeometry();
  for (const direction of [-1, 1]) {
    const side=new THREE.Group();
    side.name=direction<0?'左阙松影':'右阙松影';
    gate.add(side);
    sideCourt(nearCourt,rearCourt,direction);
    environment.pine(side,direction<0?-40.5:43.3,-3.48,direction<0?-9.0:-6.2,1.5,623+direction);
    environment.pine(side,direction*51.4,direction<0?2.77:2.27,direction<0?11.7:14.3,1.62,643+direction);
  }

  nearCourt.commit(environment,gate,.76);
  rearCourt.commit(environment,gate,.45);

  const inner = new THREE.Group();
  inner.name = '内庭 · 正殿';
  inner.position.z = 27;
  gate.add(inner);
  const court = new PalaceGeometry();
  terrace(court, 0, 1, -11.5, 30, 10, 2);
  stairFlight(court, -7.0, -.5, 1, 4.2, 20.6, 18, false);
  const innerFoot=terrace(court,0,4.2,12.2,38,26,3.3);
  pedestalCliff(court,0,10.9,21,15.3,20,508,innerFoot);
  buildHall(court, { x: 0, y: 4.2, z: 12.0, width: 32, depth: 17, height: 9.1, tiers: 2, screened: true, softCenter:true });
  for (const direction of [-1, 1]) {
    railing(court, [direction * 14.6, 1.05, -16.3], [direction * 14.6, 1.05, -6.6], 1.85);
    railing(court, [direction * 10.7, 4.22, -.7], [direction * 18.7, 4.22, -.7], 1.85);
  }
  court.commit(environment,inner,.53);

  const walks = new THREE.Group();
  walks.name = '通往内庭的两翼回廊';
  gate.add(walks);
  const walkBatch = new PalaceGeometry();
  for (const direction of [-1, 1]) coveredWalk(walkBatch, direction);
  walkBatch.commit(environment,walks,.61);
  return gate;
}

function batchEntranceLantern(batch, x, y, z) {
  batch.column(STONE, x, y + .18, z, .55, .72, .36, 8);
  batch.column(CARVING, x, y + .77, z, .16, .23, .97, 8);
  batch.box(STONE, x, y + 1.29, z, .68, .17, .68);
  batch.box(METAL, x, y + 1.58, z, .54, .46, .54);
  for (const dx of [-.27, .27]) for (const dz of [-.27, .27]) {
    batch.box(CARVING, x + dx, y + 1.58, z + dz, .09, .49, .09);
  }
  batch.add(TIMBER, new THREE.ConeGeometry(.63, .35, 4).rotateY(Math.PI * .25), x, y + 1.96, z);
}
