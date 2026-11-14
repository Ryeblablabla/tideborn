import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../rules.js';
import { buildHeavenFinale, mountGateText } from './heaven-finale.js';
import { vermilionTag } from './ending-foreshadow.js';
import { mountCourtRoofRain } from './court-roof-rain.js';

const STONE = 'whiteStone';
const TERRACE_TOP = 'terraceTop';
const PLINTH = 'batteredStone';
const STONE_SEAT = 'stoneSeat';
const STEPS = 'stairStone';
const CARVING = 'stoneCarving';
const TIMBER = 'timber';
const SHADOWED_WOOD = 'shadowedWood';
const GATE_BEAM = 'gateBeam';
const GATE_BEAM_CROWN = 'gateBeamCrown';
const GATE_BEAM_SPLIT = 'gateBeamSplit';
const GATE_BEAM_CHECK = 'gateBeamCheck';
const REAR_WALL = 'rearWall';
const LACQUER = 'lacquer';
const DOOR_LACQUER = 'doorLacquer';
const WASHED_LACQUER = 'washedLacquer';
const TILE = 'tile';
const PORTAL_TILE = 'portalTile';
const TILE_EDGE = 'tileEdge';
const SOFFIT = 'soffit';
const ROOF_RAFTER = 'roofRafter';
const TILE_BREAK = 'tileBreak';
const METAL = 'bronze';
const CLIFF = 'cliff';
const CLOUD_FOOT = 'cloudFoot';
const smooth = THREE.MathUtils.smoothstep;
const strikeBeamDepth=-10.6;
const portalPostFraction=.137;
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
  [TERRACE_TOP]: { name: '石台踏面', tint: '#ada38f', amount: .23, range: [.039, .24] },
  [PLINTH]: { name: '斜收青灰石台', tint: '#847762', amount: .27, range: [.086,.31] },
  [STONE_SEAT]: { name: '承台斜收阴面', tint: '#756e62', amount: .31, range: [.18,.47] },
  [STEPS]: { name: '雨蚀主阶', tint: '#9c8e74', amount: .22, range: [.023,.15] },
  [CARVING]: { name: '望柱与栏板', tint: '#756b5a', amount: .22, range: [.11, .32] },
  [ROOF_RAFTER]: { name: '瓦底干木椽', tint: '#88755e', amount: .67, range: [.31,.52] },
  [TIMBER]: { name: '斗拱梁枋', tint: '#58493d', amount: .35, range: [.25, .61] },
  [SHADOWED_WOOD]: { name: '暗檐与承梁', tint: '#373129', amount: .28, range: [.47, .78] },
  [GATE_BEAM]: { name: '承重檐梁', tint: '#584337', amount: .82, range: [.31, .65] },
  [GATE_BEAM_CROWN]: { name: '檐梁磨损处', tint: '#806348', amount: .75, range: [.25, .48] },
  [GATE_BEAM_SPLIT]: { name: '檐梁新断木心', tint: '#b48756', amount: .86, range: [.14, .34] },
  [GATE_BEAM_CHECK]: { name: '檐梁顺纹开绺', tint: '#45362b', amount: .75, range: [.44, .64] },
  [REAR_WALL]: { name: '内庭灰墙', tint: '#8b8171', amount: .31, range: [.17, .38] },
  [LACQUER]: { name: '朱漆檐柱', tint: '#913e2c', amount: .87, range: [.32, .69] },
  [DOOR_LACQUER]: { name: '南天门积漆门板', tint: '#944c36', amount: .87, range: [.25, .65] },
  [WASHED_LACQUER]: { name: '飞檐下淡朱内柱', tint: '#a6654e', amount: .78, range: [.16, .43] },
  [TILE]: { name: '重檐墨瓦', tint: '#344246', amount: .45, range: [.32, .71] },
  [PORTAL_TILE]: { name: '门楼下檐灰青瓦', tint: '#485451', amount: .54, range: [.23, .56] },
  [TILE_BREAK]: { name: '剥出的灰褐瓦胎', tint: '#746859', amount: .62, range: [.22,.52] },
  [SOFFIT]: { name: '深墨檐底', tint: '#282726', amount: .19, range: [.51, .77] },
  [TILE_EDGE]: { name: '瓦当与檐口', tint: '#46413a', amount: .18, range: [.38, .70] },
  [METAL]: { name: '脊饰与匾额', tint: '#a4824f', amount: .75, range: [.16, .46] },
  [CLIFF]: { name: '仙山承台', tint: '#6c6b59', amount: .37, range: [.10,.40] },
  [CLOUD_FOOT]: { name: '云脚近岩', tint: '#6b675d', amount: .22, range: [.07,.25] },
};

class PalaceGeometry {
  constructor(detail=false) {
    this.detail=detail;
    this.parts = new Map();
  }

  add(kind, geometry, x = 0, y = 0, z = 0) {
    if(kind===LACQUER||kind===WASHED_LACQUER)weatherLacquer(geometry,x,z,kind===WASHED_LACQUER);
    if ((kind === TILE || kind === PORTAL_TILE) && !geometry.hasAttribute('inkRoofPlane')) {
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox;
      const position = geometry.attributes.position;
      const plane = new Float32Array(position.count * 2);
      const width = Math.max(.01, max.x - min.x), depth = Math.max(.01, max.z - min.z);
      for (let i = 0; i < position.count; i++) {
        plane[2 * i] = 2 * (position.getX(i) - min.x) / width - 1;
        plane[2 * i + 1] = 2 * (position.getZ(i) - min.z) / depth - 1;
      }
      geometry.setAttribute('inkRoofPlane', new THREE.BufferAttribute(plane, 2));
    }
    if(kind===PLINTH&&!geometry.hasAttribute('inkGuides')){
      geometry.setAttribute('inkGuides',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    }
    geometry.translate(x, y, z);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) {
      part.userData.palaceInkBounds=geometry.userData.palaceInkBounds;
      geometry.dispose();
    }
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

  commit(environment, root, depth = 1, fracture = null, stairWash = false) {
    for (const [kind, parts] of this.parts) {
      const pigment = palette[kind];
      const inkBounds=parts.find(part=>part.userData.palaceInkBounds)?.userData.palaceInkBounds;
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const guide=geometry.attributes.inkGuides;
      if(guide&&depth<1) for(let i=0;i<guide.count;i++) {
        guide.setX(i,guide.getX(i)*depth);
        guide.setY(i,guide.getY(i)*(.73+.27*depth));
      }
      const paleStone=kind===STONE||kind===STEPS||kind===TERRACE_TOP;
      const groundWash=stairWash&&(kind===TERRACE_TOP||kind===STEPS||kind===PLINTH||kind===STONE_SEAT);
      const tile=kind===TILE||kind===PORTAL_TILE;
      const portalTile=tile&&inkBounds?.portal;
      const fascia=kind===GATE_BEAM||kind===GATE_BEAM_CROWN||kind===GATE_BEAM_SPLIT||kind===GATE_BEAM_CHECK;
      const brush=portalTile?'portalTile':tile?'tile':kind===CLIFF?'cliff':
        kind===DOOR_LACQUER?'door':kind===LACQUER||kind===WASHED_LACQUER?'lacquer':
        kind===PLINTH||kind===STONE_SEAT?'plinth':paleStone?'stone':
        kind===REAR_WALL?'wall':kind===SOFFIT?'soffit':
        fascia||kind===TIMBER||kind===SHADOWED_WOOD||kind===ROOF_RAFTER?'wood':'none';
      const tint = new THREE.Color(pigment.tint);
      tint.lerp(new THREE.Color('#969185'), (1-depth)*.64);
      const settings = {
        tint: `#${tint.getHexString()}`,
        amount: pigment.amount*(.52+.48*depth),
        profile: {
          toneRange:pigment.range.map(tone=>tone*depth),
          reserveDirection:paleStone||kind===GATE_BEAM_CROWN ? new THREE.Vector3(0,1,0) : new THREE.Vector3(-.51,.56,.55).normalize(),
          reserveStrength:kind===GATE_BEAM_CROWN?.23:paleStone?.19:.08,
          geometryInfluence: 0,
          strokes: false,
          coherentInk: (kind===CLIFF?.13:tile?.14:kind===PLINTH||kind===STONE_SEAT?.083:.04)*depth,
        },
      };
      const polish = mesh => {
        mesh.name=pigment.name;
        mesh.userData.palaceBrush={kind:brush,depth,contact:false,groundWash};
        if(kind===GATE_BEAM_CROWN)mesh.userData.gateBeamCrown=true;
        if(inkBounds)mesh.userData.palaceInkBounds=inkBounds;
        if(fascia||kind===PORTAL_TILE)mesh.userData.inkMineralHold=kind===GATE_BEAM_CROWN?.30:portalTile?.12:.20;
      };
      if(fracture){
        for(const [side,target] of fracture){
          const section=fractureAlongGate(geometry,side);
          if(section)polish(environment.add(target,section,[0,0,0],settings));
        }
        geometry.dispose();
      }else polish(environment.add(root,geometry,[0,0,0],settings));
    }
  }
}

// Both masses share the same cut, including across the beam and its fascia.
// Interpolate the original pigment guides at every new fracture vertex.
function fractureAlongGate(geometry,side){
  const attributes=Object.entries(geometry.attributes);
  const output=attributes.map(()=>[]);
  const p=geometry.attributes.position;
  const distances=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    distances[i]=side*(x-.42*Math.sin(z*.68+y*.54)-.29*Math.cos(z*.37-y*1.12));
  }
  const append=(a,b,t)=>{
    for(let k=0;k<attributes.length;k++){
      const {itemSize,array}=attributes[k][1];
      for(let c=0;c<itemSize;c++)output[k].push(THREE.MathUtils.lerp(array[a*itemSize+c],array[b*itemSize+c],t));
    }
  };
  for(let i=0;i<p.count;i+=3){
    const polygon=[];
    for(let j=0;j<3;j++){
      const a=i+j,b=i+(j+1)%3,d=distances[a],e=distances[b];
      if(d>=0)polygon.push([a,a,0]);
      if((d<0)!==(e<0))polygon.push([a,b,d/(d-e)]);
    }
    for(let j=1;j<polygon.length-1;j++){
      append(...polygon[0]);append(...polygon[j]);append(...polygon[j+1]);
    }
  }
  if(!output[0].length)return null;
  const section=new THREE.BufferGeometry();
  attributes.forEach(([name,{itemSize}],i)=>section.setAttribute(name,new THREE.Float32BufferAttribute(output[i],itemSize)));
  return section;
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
function roofInk(across, down, phase, detail, openRoof = false) {
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
  // The exposed lower sweep has room for the dragon's silhouette. Broken
  // white paint stays in a few hipped strokes, away from the central lintel.
  const bay=openRoof?smooth(Math.abs(across),.16,.56):1;
  return [ink*(openRoof?.72:1),white*bay*(openRoof?.76:1)];
}

function roofSurfacePoint(x,y,z,width,depth,height,curl,tile) {
  return (u,v,drop=0)=>{
    // The lower front tile course lands behind the exposed portal beam.
    const exposedBay=tile===PORTAL_TILE?(1-smooth(Math.abs(u),.267,.43))*smooth(-v,.61,1):0;
    return [
      x + u * (width * .5 + .16 * Math.abs(v) ** 6),
      y + roofHeight(u, v, height, curl) - drop + curl*.024*Math.sin(u*12.4+v*2.9)*Math.abs(v)**6,
      z + v * (depth * .5 + .16 * Math.abs(u) ** 6) + 1.52 * exposedBay,
    ];
  };
}

function makeRoof(batch, x, y, z, width, depth, height, curl, detail, tile = TILE, looseCourses = []) {
  const columns = detail ? 60 : 22;
  const rows = detail ? 22 : 10;
  const stride = columns + 1;
  const topCount = stride * (rows + 1);
  const thickness = detail ? .43 : .32;
  const positions = [];
  const tileGuides = [];
  const roofPlane = [];
  const point=roofSurfacePoint(x,y,z,width,depth,height,curl,tile);
  const shell = () => ({ top: [], under: [], broken: [] });
  const parts = new Map([[batch,shell()]]);
  const fractured=new Set(looseCourses.filter(course=>course.tear).map(({batch})=>batch));
  for(const course of looseCourses){
    const {start,end,steps}=course;
    const u=(start+end)/columns-1;
    const startDepth=course.heel?.reduce((sum,n)=>sum+n,0)??0;
    const v=(startDepth+steps.reduce((sum,n)=>sum+n,0))/(steps.length*rows)-1;
    course.origin.set(...point(u,course.ridge?.09:v,thickness*.50));
    parts.set(course.batch,shell());
  }
  const courseAt=(row,column)=>{
    if(row<0||row>=rows||column<0||column>=columns)return null;
    return looseCourses.find(({start,end,steps,ridge,tear,heel})=>column>=start&&column<end
      &&row>=(tear?heel[column-start]:ridge?8:0)&&row<steps[column-start])?.batch??batch;
  };

  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const u=column / columns * 2 - 1, v=row / rows * 2 - 1;
        positions.push(...point(u,v,layer * thickness));
        if (layer===0) {
          tileGuides.push(...roofInk(u,v,y*.61+z*.22,detail,tile===PORTAL_TILE));
          roofPlane.push(u,v);
        }
        if (row === rows || column === columns) continue;
        const a = layer * topCount + row * stride + column;
        const owner=courseAt(row,column),{top,under}=parts.get(owner);
        if (layer === 0) top.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
        else under.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  }

  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const owner=courseAt(row,column),{under,broken}=parts.get(owner);
    const a=row*stride+column,b=a+1,c=a+stride,d=c+1;
    for(const [neighbor,from,to] of [
      [courseAt(row-1,column),b,a],[courseAt(row+1,column),c,d],
      [courseAt(row,column-1),a,c],[courseAt(row,column+1),d,b],
    ]){
      if(neighbor===owner)continue;
      const tear=fractured.has(owner)||fractured.has(neighbor);
      if(!tear&&neighbor!==null&&owner===batch)continue;
      (tear?broken:under).push(from,to,from+topCount,to,to+topCount,from+topCount);
    }
  }
  const roofTop=positions.slice(0,topCount*3);
  // Subdivided meshes keep the intact shell's pigment coordinates. Once
  // loose, the same pigment follows its tile rather than sliding in world.
  const roofInkBounds=looseCourses.length?{
    center:new THREE.Vector3(x,y+height*.38,z),
    size:Math.max(width,depth)+.32,portal:true,
  }:null;
  for(const [owner,{top,under,broken}] of parts){
    const roofSurface=indexedGeometry(roofTop,top,tileGuides);
    roofSurface.setAttribute('inkRoofPlane', new THREE.Float32BufferAttribute(roofPlane, 2));
    if(roofInkBounds)roofSurface.userData.palaceInkBounds=roofInkBounds;
    owner.add(tile,roofSurface);
    owner.add(SOFFIT,indexedGeometry(positions,under));
    if(broken.length)owner.add(TILE_BREAK,indexedGeometry(positions,broken));
  }

  // Give the front pieces the timber bed that carried the clay. These
  // geometry batches already follow the animated split and keep each rib
  // attached to its own course when the hidden ending overturns it.
  if(looseCourses.length){
    for(const course of looseCourses){
      const {start,end,steps,ridge,spall,tear,heel:innerEdge}=course;
      for(let c=start+1;c<end;c+=2){
        const low=tear?Math.max(innerEdge[c-start-1],innerEdge[c-start]):ridge?8:0;
        const high=Math.min(steps[c-start-1],steps[c-start]);
        const v0=(low+.32)/rows*2-1;
        const v1=(high-.21)/rows*2-1;
        if(v1-v0<.09)continue;
        const u=(c+.18*Math.sin(c*3.42))/columns*2-1;
        const inset=thickness+.18;
        const heel=point(u,v0,inset);
        const head=point(u+Math.sin(c*5.21)*.004,v1,inset+.044);
        const waist=point(u,(v0+v1)*.51,inset);
        const width=.23+.15*Math.sin(c*4.4)**2;
        const holder=course.batch;
        // The short runs follow the underside pitch, leaving broad dark
        // gaps between the scrubbed timber and the surrounding ceramic.
        holder.segment(ROOF_RAFTER,heel,waist,width,.29);
        holder.segment(ROOF_RAFTER,waist,head,width,.29);
        const strip=point(u,v1-.029,inset+.039);
        holder.segment(GATE_BEAM_SPLIT,strip,head,width+.013,.240);
        if((ridge||spall)&&(c-start)%4===1){
          const left=point(u-.023,v0+.12,inset+.17);
          const right=point(u+.028,v0+.12,inset+.17);
          holder.segment(SHADOWED_WOOD,left,right,.14,.17);
        }
      }
    }
  }

  for (const side of [-1, 1]) {
    const edge = Array.from({ length: 13 }, (_, i) => point(i / 6 - 1, side, .12));
    const hip = Array.from({ length: 9 }, (_, i) => point(side, i / 4 - 1, .12));
    if(side>0||!looseCourses.length)batch.curve(TILE_EDGE, edge, thickness * .42);
    else{
      let start=0;
      for(let column=1;column<=columns;column++){
        const owner=courseAt(0,start);
        if(courseAt(0,column)===owner)continue;
        const knots=Array.from({length:Math.max(3,Math.ceil((column-start)/4)+1)},(_,i)=>i);
        owner.curve(TILE_EDGE,knots.map(i=>point((start+(column-start)*i/(knots.length-1))/columns*2-1,-1,.12)),thickness*.42);
        start=column;
      }
    }
    batch.curve(TILE_EDGE, hip, thickness * .42);
    if (detail) {
      const count = Math.round(width / 1.35);
      for (let i = 1; i < count; i++) {
        const u = i / count * 2 - 1;
        const column=Math.floor(i/count*columns);
        const owner=side<0?courseAt(0,column):batch;
        const [tileX, tileY, tileZ] = point(u, side, .06);
        const cap = new THREE.CylinderGeometry(.13, .14, .35, 6).rotateX(Math.PI * .5);
        owner.add(TILE_EDGE, cap, tileX, tileY, tileZ);
        if (Math.abs(u) < .78 && i % 2 === 0) {
          const show = tile!==PORTAL_TILE || Math.abs(u)>.31 && Math.sin(i*2.6+side)>.1;
          if(!show)continue;
          const run = tile===PORTAL_TILE ? .28+.44*Math.sin(i*2.17)**2 : .89;
          const ribs = [];
          for(let j=0;j<6;j++){
            const along=u*(1-.19*j/5),up=side*(1-run*j/5);
            if(side<0&&courseAt(Math.floor((up+1)*rows/2),Math.floor((along+1)*columns/2))!==owner)break;
            ribs.push(point(along,up,-.04));
          }
          if(ribs.length>=2)owner.curve(TILE_EDGE, ribs, tile===PORTAL_TILE?.022:.036, 3);
        }
      }
    }
  }

  const ridgeModules=looseCourses.filter(course=>course.ridge);
  if(ridgeModules.length){
    const seam = u => courseAt(rows/2,Math.min(columns-1,Math.floor((u+1)*columns*.5)));
    let begin=-.63, owner=seam(begin);
    for(let column=Math.ceil((begin+1)*columns*.5);column<=Math.floor(1.63*columns*.5)+1;column++){
      const u=Math.min(.63,column/columns*2-1);
      const next=seam(u+1e-5);
      if(next===owner&&u<.63)continue;
      owner.curve(METAL,Array.from({length:6},(_,i)=>point(THREE.MathUtils.lerp(begin,u,i/5),0,-.15)),.21);
      begin=u;
      owner=next;
    }
  }else{
    const ridge=Array.from({length:13},(_,i)=>point((i/6-1)*.63,0,-.15));
    batch.curve(METAL,ridge,detail?.21:.14);
  }
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

function gateApronInset(x){
  return (x<0?.53:2.54)*smooth(Math.abs(x),12.4,24.5);
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
      // The stair head fixes the inner line. Either side, the underside of
      // the projecting stone cap sets back into a longer sloped retaining face.
      const wing=form==='gate'?front*smooth(Math.abs(u),11.7,u<0?19.2:16.8):0;
      const setback=wing*smooth(lower,.09,.57)*(1-.24*smooth(lower,.57,1))*(u<0?.72:1.63);
      const apron=form==='gate'?gateApronInset(u)*front:0;
      const pz=z+v*(1+2*expansion/depth)+relief*(.35*face+.89*chipped)+setback+apron;
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
      const pressure=(.045+.13*toe+.083*underLip)*(.46+.54*stain)+shelfShade+wing*.16*underLip;
      guides.push(pressure,.22*(1-lower)*(1-stain)+strata*wear*face*.29+wing*.17*smooth(lower,.39,.68));
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
  batch.add(TERRACE_TOP,indexedGeometry(capPositions,cap));
  batch.add(PLINTH,indexedGeometry(positions,indices,guides));
  if(seatIndices.length)batch.add(STONE_SEAT,indexedGeometry(positions,seatIndices,guides));
  return {x,y,z,width,depth,height,frontCut,form,capPositions};
}

function terraceTopAt({capPositions},x,z){
  let inside=false;
  for(let i=3,j=capPositions.length-3;i<capPositions.length;j=i,i+=3){
    const zi=capPositions[i+2],zj=capPositions[j+2];
    if((zi>z)!==(zj>z)&&x<(capPositions[j]-capPositions[i])*(z-zi)/(zj-zi)+capPositions[i])inside=!inside;
  }
  return inside?capPositions[1]:-Infinity;
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
  const sample = (x, z) => {
    if (z<=frontZ) return lower;
    if (z>=backZ) return upper;
    if (ramp && Math.abs(x)<rampSide) return lower+.05+(z-frontZ)*(upper-lower)/(backZ-frontZ);
    return lower+(Math.floor((z-frontZ)/stepDepth)+1)*stepRise;
  };
  function quad(a,b,c,d,paint) {
    const index=positions.length/3;
    positions.push(...a,...b,...c,...d);
    for(const point of [a,b,c,d])guides.push(...(paint?paint(point):[0,0]));
    indices.push(index,index+1,index+2,index,index+2,index+3);
  }
  const panels=ramp?17:batch.detail?7:4;
  const weather=(x,i,phase)=>{
    const split=.53*Math.sin(x*1.15+i*.52+phase)+.31*Math.sin(x*3.35-i*.73)+.16*Math.sin(x*6.71+i*1.73);
    const cluster=.50+.27*Math.sin(x*.90+i*.24+phase)+.22*Math.sin(x*1.41-i*.41+phase*.6);
    const broken=smooth(split,.10,.66)*smooth(cluster,.30,.68);
    return {cluster,broken};
  };
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
        if(!ramp)return [stroke*.55,paper];
        const {cluster,broken}=weather(x,i,phase);
        const bloom=smooth(cluster,.26,.71);
        const mineral=broken*(.38+.62*upperLip);
        // Leave long intact sections between the dry breaks in the lip.
        // The stains bridge adjacent courses, so they do not outline each step.
        const load=stroke*.66+(riser?.066:.037)*bloom+mineral*(riser?.34:.35);
        const dry=paper*.64+.23*(1-bloom)*(1-mineral)*upperLip;
        return [load,dry];
      };
      for(let j=0;j<panels;j++){
        const a=THREE.MathUtils.lerp(left,right,j/panels);
        const b=THREE.MathUtils.lerp(left,right,(j+1)/panels);
        if(!ramp){
          quad([a,y,z],[a,top,z],[b,top,z],[b,y,z],point=>pressure(point,true));
          quad([a,top,z],[a,top,z+stepDepth],[b,top,z+stepDepth],[b,top,z],point=>pressure(point,false));
          continue;
        }
        const chip=x=>weather(x,i,phase).broken*smooth(Math.abs(x)-rampSide,.24,2.03)
          *(1-smooth(Math.abs(x),side-1.2,side-.16));
        const da=chip(a),db=chip(b);
        // Keep the top flat at the authored height; only notch the
        // projecting edge of the flank, clear of the ramp and rail.
        const bite=Math.min(.155,stepDepth*.37);
        const bevel=point=>pressure(point,true).map((tone,k)=>k===0?tone+.16:tone*.71);
        quad([a,y,z],[a,top-.12*da,z],[b,top-.12*db,z],[b,y,z],point=>pressure(point,true));
        if(da+db>.001)quad([a,top-.12*da,z],[a,top,z+bite*da],
          [b,top,z+bite*db],[b,top-.12*db,z],bevel);
        const crest=Math.min(.19,stepDepth*.49);
        quad([a,top,z+bite*da],[a,top,z+crest],[b,top,z+crest],[b,top,z+bite*db],point=>pressure(point,false));
        quad([a,top,z+crest],[a,top,z+stepDepth],[b,top,z+stepDepth],[b,top,z+crest],point=>pressure(point,false));
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
  sample.contains=(x,z)=>Math.abs(x)<=side&&z>=frontZ&&z<=backZ;
  return sample;
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
      const seatDepth=Math.sign(cz)*Math.abs(cz)**.29*(footprint.depth*.5-.15);
      const seatZ=footprint.z+seatDepth;
      const cutback=Math.max(0,(footprint.frontCut??0)-(seatZ-footprint.z+footprint.depth*.5));
      const seatX=footprint.x+Math.sign(cx)*Math.min(
        Math.abs(cx)**.29*(footprint.width*.5-.22),footprint.width*.5-.22-cutback,
      );
      const apron=footprint.form==='gate'?gateApronInset(seatX)*smooth(-2*seatDepth/footprint.depth,.36,.97):0;
      const knife=cleft*(1-smooth(Math.abs(cx-.35),.03,.33))*smooth(-cz,.29,.77);
      const front=smooth(-cz,.39,.93);
      const bed=front*smooth(drop,.05,.36)*(1-.51*smooth(drop,.59,1));
      const fault=cleft*bed*(.33+.67*smooth(Math.sin(theta*5+seed*.81),-.23,.76));
      const recess=knife*smooth(drop,.04,.38)*(1-.36*smooth(drop,.57,1))+fault*.58;
      const px=THREE.MathUtils.lerp(seatX,x+Math.cos(twist)*radiusX*radius,shoulder)+recess*.48;
      const pz=THREE.MathUtils.lerp(seatZ+apron,z+Math.sin(twist)*radiusZ*radius,shoulder)+recess;
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

function clerestory(batch, x, y, z, width, depth, height) {
  // The front screen is a shallow open gallery. The panel at the back of
  // each end bay lies beyond the posts and the two black ceiling beams.
  const sill=y+.36,top=y+height+.06;
  const front=z-depth*.50,back=z+depth*.50,screen=front+depth*.32;
  batch.box(TIMBER,x,sill-.14,z,width,.38,depth);
  batch.box(SHADOWED_WOOD,x,top-.21,z,width+.10,.52,depth);
  batch.box(REAR_WALL,x,(sill+top)*.5,back-.22,width,top-sill,.52);
  for(const side of [-1,1]){
    batch.box(TIMBER,x+side*(width*.5-.22),(sill+top)*.5,z,.44,top-sill,depth);
    batch.box(STONE,x+side*width*.339,sill+.075,front+.79,width*.29,.13,1.55);
  }
  const spans=[[-.463,-.314],[-.283,-.110],[-.081,.109],[.138,.288],[.322,.463]];
  for(const [i,[a,b]] of spans.entries()){
    const center=x+width*(a+b)*.5,span=width*(b-a);
    const floor=sill+(i===2?.43:.20),head=top-(i===2?.46:.59);
    const backset=screen+(i===3?1.24:i===2?2.0:0);
    const panel=i===2?SHADOWED_WOOD:i===3?TIMBER:REAR_WALL;
    batch.box(panel,center,(floor+head)*.5,backset,span,head-floor,.32);
    batch.box(TIMBER,center,head+.10,front+.37,span+.38,.23,.70);
    batch.box(i===2?TIMBER:CARVING,center,floor-.10,front+.25,span+.42,.22,.56);
    for(const side of [-1,1]){
      const post=center+side*(span*.5+.10);
      batch.box(TIMBER,post,(sill+top)*.5,front+.22,.36,top-sill,.55);
      batch.box(SHADOWED_WOOD,post,(head+floor)*.5,(front+backset)*.5,.12,head-floor,backset-front);
      batch.box(CARVING,post,head+.27,front+.20,.57,.21,.61);
    }
    if(i===0||i===4){
      for(const offset of [-.18,.15]){
        batch.box(TIMBER,center+offset*span,(floor+head)*.5,backset-.21,.15,head-floor,.16);
      }
    }
  }
}

function buildHall(batch, { x, y, z, width, depth, height, tiers, portal = false, detailed = false, screened = false, softCenter = false, moving = null }) {
  const columnRadius = Math.max(.25, height * .054);
  const columnXs = portal ? [-.43, -.30, -.137, .137, .30, .43] : [-.40, -.22, 0, .22, .40];
  for (const fraction of columnXs) {
    for (const direction of [-1, 1]) {
      // Open a longer view through the far aisle while keeping both front
      // colonnades and the center bearing posts where they meet the eave.
      const outerAisle=portal&&direction>0&&fraction===.30;
      const columnX=x+width*(fraction+(outerAisle?.031:0));
      const strikePost=portal&&moving&&direction<0&&Math.abs(fraction)===portalPostFraction;
      const columnZ = z + (strikePost?strikeBeamDepth:direction*depth*.40);
      batch.box(PLINTH,columnX,y+.041,columnZ,columnRadius*3.54,.112,columnRadius*3.54);
      batch.column(STONE, columnX, y + .21, columnZ, columnRadius * 1.28, columnRadius * 1.65, .43);
      batch.column(CARVING, columnX, y + .47, columnZ, columnRadius * 1.07, columnRadius * 1.26, .16);
      const pale=portal&&(fraction===-.137||fraction===.137&&direction>0);
      const columnBatch=moving?.pillars.get(`${fraction}:${direction}`)??batch;
      columnBatch.column(pale?WASHED_LACQUER:LACQUER,columnX,y+(height+.55)*.5,columnZ,columnRadius*.84,columnRadius,height-.55);
      columnBatch.column(TIMBER, columnX, y + height - .22, columnZ, columnRadius * 1.07, columnRadius * 1.01, .40);
      if (detailed&&!strikePost) brackets(columnBatch, columnX, y + height, columnZ, height / 10, direction);
    }
  }
  batch=moving?.roof??batch;
  for (const direction of [-1, 1]) {
    const beamZ = z + direction * depth * .40;
    batch.box(TIMBER, x, y + height + .46, beamZ, width * .94, .74, .94);
    batch.box(CARVING, x, y + height + .89, beamZ, width * .96, .18, 1.03);
    for (const side of [-1, 1]) {
      batch.box(TIMBER, x + side * width * .423, y + height + .47, z, .73, .73, depth * .89);
    }
    if (detailed) {
      for (let i = -12; i <= 12; i++) {
        if(portal&&direction<0&&i%2!==0&&Math.abs(i)>4)continue;
        const rafterX = x + i * width / 26;
        const heavy=portal&&direction<0&&i%4===0;
        const loose=direction<0?moving?.spallRafters.find(member=>member.index===i):null;
        const holder=loose?.batch??batch;
        const rafterY=y+height+1.32,rafterZ=z+direction*depth*.47;
        holder.box(TIMBER,rafterX,rafterY,rafterZ,heavy?.38:.24,heavy?.31:.24,depth*.25);
        if(loose)loose.origin.set(rafterX,rafterY,rafterZ);
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
    if(portal){
      for(const side of [-1,1]){
        batch.box(SHADOWED_WOOD,x+side*width*.363,y+height-.28,z+depth*.20,width*.137,.54,depth*.42);
        batch.box(TIMBER,x+side*width*.363,y+height-.70,z+depth*.385,width*.156,.37,.75);
      }
    }
  }
  if (screened) addRearScreen(batch,x,y,z+depth*.29,width*.79,height*.83,softCenter);
  makeRoof(batch, x, baseY, z, width * 1.13, depth * 1.28, tiers > 1 ? 4.3 : height * .42,
    detailed ? 1.9 : 1.15, detailed, portal?PORTAL_TILE:TILE, moving?.tiles.filter(course=>!course.upper));

  if (portal) {
    const plaque=moving?.plaque??batch;
    plaque.box(TIMBER, x, y + height - .43, z - depth * .46, 6.4, 1.62, .34);
    plaque.box(METAL, x, y + height - .43, z - depth * .469, 5.95, 1.21, .10);
    plaque.box(TIMBER, x, y + height - .43, z - depth * .475, 5.66, .95, .08);
  }

  if (tiers === 1) return;
  const tierBase = baseY + 2.25;
  const tierHeight = detailed ? 3.4 : 2.6;
  const tierWidth = width * .72;
  const tierDepth = depth * .70;
  // The gate has a gallery between the two eaves. The quieter distant
  // halls retain simpler infill on their much smaller window band.
  if(portal)clerestory(batch,x,tierBase,z,tierWidth,tierDepth,tierHeight);
  else batch.box(TIMBER, x, tierBase + tierHeight * .46, z, tierWidth, tierHeight * 1.17, tierDepth);
  if(!portal)for (const direction of [-1,1]) {
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
  makeRoof(batch, x, tierBase + tierHeight + .28, z, tierWidth * 1.18, tierDepth * 1.31,
    detailed ? 4.85 : 3.05, detailed ? 2.15 : 1.1, detailed, TILE, moving?.tiles.filter(course=>course.upper));
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
  const surface=[x,roofY,z,width*1.34,depth*1.09,2.0,.95];
  makeRoof(batch,...surface,false);
  if(direction<0)addRearScreen(batch, x, y, z + depth * .35, width * .89, 4.3);
  return {direction,point:roofSurfacePoint(...surface,TILE),
    center:{x,z},halfSize:{x:surface[3]*.5,z:surface[4]*.5}};
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

function gateBeam(side, batch, split){
  const profile=[
    [13.67,-11.24],[13.78,-11.42],[14.29,-11.46],[14.50,-11.27],
    [14.50,-9.98],[14.26,-9.81],[13.80,-9.86],[13.65,-10.07],
  ];
  const breakGrain=[.04,-.20,-.085,.12,-.14,.19,.04,-.14];
  const stations=[0,.25,.85,1.65,2.55,3.50,4.46,5.64,6.48,7.15];
  const point=(distance,i)=>{
    const [y,z]=profile[i];
    const x=distance===0?breakGrain[i]:side*distance;
    const swell=smooth(distance,2.1,6.6);
    const face=Math.sign(z+10.6);
    return [x,y+(y<14.48?swell*.045*Math.sin(x*1.44+i):0),
      z+swell*face*(.06*Math.sin(x*1.06+i*.36)-.08)];
  };
  const indices=(faces)=>side>0?faces:faces.map((id,i)=>i%3===1?faces[i+1]:i%3===2?faces[i-1]:id);

  for(let i=0;i<profile.length;i++){
    const next=(i+1)%profile.length;
    const positions=[],faces=[],guides=[];
    const top=i===3;
    for(const [index,distance] of stations.entries()){
      for(const corner of [i,next]){
        const x=side*distance;
        positions.push(...point(distance,corner));
        const mottling=.5+.5*Math.sin(x*1.23+corner*.65);
        const wear=1-smooth(distance,1.65,5.75);
        const shoulder=smooth(distance,5.1,7.15);
        const edge=(corner===i?1:.41);
        guides.push(top?.085+(1-wear)*.18+shoulder*.16+mottling*.10:
          .14+.21*edge+.17*shoulder+.08*mottling,
          top?wear*(.23+.13*mottling):.06*(1-shoulder)*mottling);
      }
      if(index<stations.length-1){
        const a=index*2;
        faces.push(a,a+1,a+2,a+1,a+3,a+2);
      }
    }
    batch.add(top?GATE_BEAM_CROWN:GATE_BEAM,indexedGeometry(positions,indices(faces),guides));
  }

  // A short tongue enters the dark bearing at each end. The split face is
  // a separate mesh, revealed by the existing moving halves after impact.
  const face=(distance,center,inside)=>{
    const positions=center.slice(),faces=[],guides=inside?[.33,.16]:[.41,.045];
    for(let i=0;i<profile.length;i++){
      positions.push(...point(distance,i));
      guides.push(inside?.095+.19*Math.sin(i*2.23)**2:.33+.17*Math.sin(i*2.23)**2,
        inside?.12+.13*Math.sin(i*.84)**2:.025);
      const a=1+i,b=1+(i+1)%profile.length;
      faces.push(0,inside?b:a,inside?a:b);
    }
    return indexedGeometry(positions,indices(faces),guides);
  };
  batch.add(GATE_BEAM,face(7.15,[side*7.15,14.03,-10.63],false));
  split.add(GATE_BEAM_SPLIT,face(0,[side*.23,14.06,-10.69],true));

  // A few checks run along the grain and taper into the rubbed surface.
  // They follow the physical top and front faces as the beam separates.
  for(const [from,to,z,y,width,phase] of [
    [.32,3.12,-10.98,14.507,.044,1.2],[1.98,5.92,-10.52,14.507,.069,2.3],
    [3.7,6.85,-10.13,14.507,.035,.8],[.52,3.98,-11.461,14.11,.045,1.5],
  ]){
    const positions=[],faces=[],guides=[];
    const top=y>14.50;
    for(let i=0;i<=8;i++){
      const fraction=i/8;
      const x=side*THREE.MathUtils.lerp(from,to,fraction);
      const w=width*Math.sin(Math.PI*fraction);
      const grain=.049*Math.sin(x*1.15+phase)+.015*Math.sin(x*3.17);
      if(top)positions.push(x,y,z+grain-w,x,y,z+grain+w);
      else positions.push(x,y+grain-w,z,x,y+grain+w,z);
      guides.push(.20,.02,.29,.025);
      if(i<8)faces.push(2*i,2*i+1,2*i+2,2*i+1,2*i+3,2*i+2);
    }
    batch.add(GATE_BEAM_CHECK,indexedGeometry(positions,indices(faces),guides));
  }
}

function gateBeamBearing(batch, x, z){
  // The cap and the three crossing members sit directly above the column.
  batch.column(WASHED_LACQUER,x,11.69,z,.60,.54,.42,12);
  batch.box(TIMBER,x,12.04,z,1.36,.39,1.26);
  batch.box(GATE_BEAM,x,12.43,z-.03,1.82,.38,1.33);
  batch.box(TIMBER,x,12.78,z+.05,1.13,.36,1.92);
  batch.box(GATE_BEAM,x,13.13,z,2.08,.35,1.47);
  batch.box(SHADOWED_WOOD,x,13.47,z,1.22,.36,1.64);
  batch.box(TIMBER,x,13.61,z-.04,1.45,.28,1.67);
  for(const cheek of [-1,1]){
    batch.segment(TIMBER,[x+cheek*.25,12.16,z-.52],[x+cheek*.91,13.09,z-.52],.28,.30);
    batch.box(GATE_BEAM,x+cheek*.53,13.82,z-.06,.24,.40,1.67);
    batch.box(SHADOWED_WOOD,x+cheek*.54,13.74,z-.79,.16,.21,.19);
  }
  batch.add(METAL,new THREE.CylinderGeometry(.076,.082,1.36,6).rotateZ(Math.PI*.5),x,13.82,z-.80);
}

function timberPurlin(batch, kind, start, end, width, depth){
  const a=new THREE.Vector3(...start), b=new THREE.Vector3(...end);
  const axis=b.clone().sub(a);
  const geometry=new THREE.BoxGeometry(width,axis.length(),depth,1,8,1);
  const turn=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
  geometry.applyQuaternion(turn);
  batch.add(kind,geometry,...a.lerp(b,.50).toArray());
}

function gateBeamRafters(environment, parent, side){
  const z=strikeBeamDepth;
  const crosspiece=new PalaceGeometry(true);
  const bays=[];
  // Three short roof members pitch up behind the crossbeam; the broad
  // middle retains its full clear length for the two planted foreclaws.
  for(const [bay,offset] of [3.94,5.27,6.62].entries()){
    const x=side*offset;
    const purlin=new THREE.Group();
    purlin.name=side<0?`左檐第${bay+1}椽`:`右檐第${bay+1}椽`;
    parent.add(purlin);
    const member=new PalaceGeometry(true);
    const heel=new THREE.Vector3(x,14.10,z+.43), ridge=new THREE.Vector3(x,15.61,z+4.29);
    timberPurlin(member,TIMBER,heel.toArray(),ridge.toArray(),.37,.42);
    timberPurlin(member,GATE_BEAM,[x,14.24,z+.13],[x,14.67,z+1.34],.42,.34);
    member.commit(environment,purlin);
    bays.push({root:purlin,side,bay,heel,ridge});
  }
  crosspiece.box(TIMBER,side*5.28,14.01,z+1.83,3.12,.36,.43);
  crosspiece.commit(environment,parent);
  return bays;
}

function movingGate(environment,gate,main){
  const roof=new PalaceGeometry(true),plaque=new PalaceGeometry(true),pillars=new Map();
  // Each entry cuts a continuous front course out of the roof shell. The
  // depth changes by column so that no two detached sections share a seam.
  const tiles=[
    {side:-1,upper:false,start:15,steps:[1,2,3,3,3,4,5,5,3]},
    {side:1,upper:false,start:37,steps:[4,5,5,3,3,5,4,4,5,5,4,3,2]},
    {side:-1,upper:true,start:17,steps:[1,2,3,3,2,3,2,1]},
    {side:-1,upper:true,ridge:true,start:21,steps:[14,15,16,16,17,17,16,16,15]},
    {side:1,upper:true,ridge:true,start:30,steps:[15,15,17,17,16,16,15,14,14]},
    {side:-1,upper:false,tear:'near-lower',start:18,heel:[4,4,5,5,6,6,6,7,8,8],steps:[8,10,12,13,13,14,14,13,12,10]},
    {side:1,upper:true,tear:'far-upper',start:39,heel:[5,4,4,3,3,4,5,5,6,6],steps:[11,13,13,14,15,14,12,12,10,8]},
  ].map(course=>({
    ...course,end:course.start+course.steps.length,batch:new PalaceGeometry(true),origin:new THREE.Vector3(),
  }));
  const roofSpall={side:-1,upper:false,spall:true,start:11,end:15,steps:[5,8,9,7],
    batch:new PalaceGeometry(true),origin:new THREE.Vector3()};
  tiles.push(roofSpall);
  const spallRafters=[-8,-6].map(index=>({index,batch:new PalaceGeometry(true),origin:new THREE.Vector3()}));
  const pillarParts=[];
  for(const side of [-1,1])for(const depth of [-1,1]){
    const batch=new PalaceGeometry(true);
    const fraction=portalPostFraction*side;
    const bearing=depth<0;
    pillars.set(`${fraction}:${depth}`,batch);
    pillarParts.push({batch,side,depth,bearing,x:49*fraction,z:bearing?strikeBeamDepth:7*depth});
  }
  buildHall(main,{x:0,y:0,z:0,width:49,depth:17.5,height:11.9,tiers:2,
    portal:true,detailed:true,moving:{roof,plaque,pillars,tiles,spallRafters}});

  // The beam carries the load from the eave to the two door leaves.
  roof.box(SHADOWED_WOOD,0,11.22,-7.18,12.68,.69,.87);
  roof.box(METAL,0,11.42,-7.62,12.71,.09,.084);
  const purlins=[];
  const halves=[-1,1].map(side=>{
    const group=new THREE.Group();
    group.name=side<0?'南天门左重檐':'南天门右重檐';
    gate.add(group);
    purlins.push(...gateBeamRafters(environment,group,side));
    return [side,group];
  });
  roof.commit(environment,gate,1,halves);
  const addCourse=({side,upper,batch,origin,ridge,spall,tear})=>{
    const root=new THREE.Group(),shell=new THREE.Group();
    root.name=tear?'瓦脊内侧折断的斜瓦带':spall?'坠地的左檐瓦楔':ridge?'折落脊檩':upper?'上檐脱落瓦片':side<0?'左檐断瓦带':'右檐断瓦带';
    root.position.copy(origin);
    shell.position.copy(origin).multiplyScalar(-1);
    root.add(shell);
    gate.add(root);
    batch.commit(environment,shell);
    return {root,origin,side,upper,ridge,spall,tear};
  };
  const detachedCourses=tiles.filter(course=>!course.spall).map(addCourse);
  const spall=[roofSpall,...spallRafters].map((course,index)=>({
    ...addCourse({...course,side:-1,spall:true}),tile:index===0,
  }));

  const fascia=[-1,1].map(side=>{
    const center=side*3.4;
    const root=new THREE.Group(),batch=new PalaceGeometry(true),split=new PalaceGeometry(true);
    const mesh=new THREE.Group();
    const cut=new THREE.Group();
    root.name=side<0?'檐梁左断口':'檐梁右断口';
    root.position.set(center,14.14,strikeBeamDepth);
    mesh.position.copy(root.position).multiplyScalar(-1);
    root.add(mesh);
    gate.add(root);
    cut.name='新断木心';
    cut.visible=false;
    mesh.add(cut);
    gateBeam(side,batch,split);
    batch.commit(environment,mesh);
    split.commit(environment,cut);
    // Toe joint rests just above the crown, on its own side of the split.
    const pawSeat=new THREE.Vector3(side*.94-center,14.58-14.14,side*.19);
    const crown=mesh.children.find(child=>child.userData.gateBeamCrown);
    return {root,side,center,cut,crown,pawSeat,pawWorld:new THREE.Vector3()};
  });
  const board=new THREE.Group();
  const boardFace=new THREE.Group();
  board.name='南天门匾额';
  board.position.set(0,11.47,-8.16);
  boardFace.position.copy(board.position).multiplyScalar(-1);
  board.add(boardFace);
  gate.add(board);
  plaque.commit(environment,boardFace);

  for(const part of pillarParts){
    const pivot=new THREE.Group();
    const meshGroup=new THREE.Group();
    pivot.name='中门通柱';
    pivot.position.set(part.x,.55,part.z);
    meshGroup.position.copy(pivot.position).multiplyScalar(-1);
    pivot.add(meshGroup);
    gate.add(pivot);
    part.batch.commit(environment,meshGroup);
    part.pivot=pivot;
    if(part.bearing){
      const bracket=new THREE.Group(),joinery=new PalaceGeometry(true);
      bracket.name='檐梁下承斗拱';
      gateBeamBearing(joinery,part.x,part.z);
      joinery.commit(environment,bracket);
      meshGroup.add(bracket);
      part.bracket=bracket;
    }
  }

  const doors=[-1,1].map(side=>{
    const root=new THREE.Group(),hinge=new THREE.Group();
    root.name=side<0?'南天门左门扇':'南天门右门扇';
    root.position.set(side*5.94,.20,-7.21);
    root.add(hinge);
    gate.add(root);
    const wood=new PalaceGeometry(true),x=-side*2.91;
    wood.box(WASHED_LACQUER,x,5.22,0,5.8,10.48,.42);
    wood.box(TIMBER,x,5.22,-.25,5.25,9.93,.14);
    for(let i=0;i<8;i++){
      const u=x+(i-3.5)*.639;
      wood.box(DOOR_LACQUER,u,5.22,-.34,.60,9.66,.12);
      wood.box(WASHED_LACQUER,u,5.22,.31,.60,9.66,.12);
    }
    for(const z of [-.43,.38])for(const y of [.46,3.37,6.84,10.02]){
      wood.box(TIMBER,x,y,z,5.55,.26,.12);
    }
    for(const xEdge of [x-2.75,x+2.75])wood.box(TIMBER,xEdge,5.21,-.435,.27,10.23,.11);
    for(const y of [2.63,7.55,8.09,8.63])for(let col=0;col<6;col++){
      wood.add(METAL,new THREE.SphereGeometry(.119,7,4).scale(1,1,.37),x+(col-2.5)*.76,y,-.46);
    }
    const ringX=-side*4.94;
    const ring=new THREE.Group();
    ring.name='门扇铜环';
    ring.position.set(ringX,5.12,-.53);
    hinge.add(ring);
    const hardware=new PalaceGeometry(true);
    hardware.add(METAL,new THREE.TorusGeometry(.32,.065,5,17),0,-.32,0);
    hardware.commit(environment,ring);
    wood.box(METAL,ringX,5.14,-.50,.43,.50,.13);
    wood.commit(environment,hinge);
    return {side,root,hinge,ring};
  });
  const latch=new THREE.Group();
  latch.position.set(0,5.31,-7.88);
  gate.add(latch);
  const bronze=new PalaceGeometry(true);
  bronze.box(SHADOWED_WOOD,0,0,0,3.23,.32,.29);
  bronze.box(METAL,0,0,-.18,1.27,.43,.19);
  bronze.box(METAL,0,-.38,-.32,.73,.79,.17);
  bronze.box(METAL,0,-.37,-.43,.45,.53,.09);
  bronze.commit(environment,latch);
  const seal=vermilionTag(environment,latch,.18,-.13,-.54,.64,.08);
  seal.name='门闩朱印';
  return {halves,purlins,fascia,board,boardFace,pillars:pillarParts,doors,latch,tiles:detachedCourses,spall};
}

function distantCourtDepth(environment, gate) {
  const middle = new PalaceGeometry();
  // This hill carries a single open aisle past the lower walk. Its roof
  // turns the eye along the approach while the supports stay low in cloud.
  const aisle = terrace(middle,-21.8,3.95,38.0,11.8,21.6,2.55,2.45);
  pedestalCliff(middle,-22.15,38.6,6.7,10.8,17.2,833,aisle,2.6);
  openSideGallery(middle,-21.8,3.95,38.6);
  railing(middle,[-26.95,4.01,28.82],[-16.62,4.01,28.82],1.62);
  middle.commit(environment,gate,.46);

  const far = new PalaceGeometry();
  // Shift the transverse roof past the near court's right shoulder. Keep
  // the far roof distinct from the center skyline under the damaged gate.
  const shelf = terrace(far,24.25,12.9,68.3,30.1,22.1,3.35,2.2);
  pedestalCliff(far,25.15,69.4,14.85,10.8,24.6,916,shelf,4.7);
  buildHall(far,{x:24.25,y:12.9,z:69.4,width:24.8,depth:12.4,height:6.85,tiers:1,screened:true});
  railing(far,[11.4,12.96,57.87],[37.1,12.96,57.87],1.55);
  cliffRidge(far,42.7,-8.6,86.7,12.5,10.2,24.6,913);
  far.commit(environment,gate,.33);
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
  const lowestStairHeight=stairFlight(main, -31.8, -25.9, -11, -7.65, 21.2, 14);
  const firstStairFoot=terrace(main,0,-7.65,-24.7,22.25,2.52,3.4);
  pedestalCliff(main,0,-24.7,12.1,4.2,13,233,firstStairFoot);
  const middleStairHeight=stairFlight(main, -23.5, -18.1, -7.65, -3.75, 22.1, 15);
  const secondStairFoot=terrace(main,0,-3.75,-16.9,23.15,2.5,3.6);
  pedestalCliff(main,0,-16.9,12.7,4.1,17,239,secondStairFoot);
  gate.userData.upperStairHeight = stairFlight(main, -15.7, -11.9, -3.75, 0, 23, 14);
  const {upperStairHeight}=gate.userData;
  gate.userData.lockStairHeight=(x,z)=>{
    let height=-Infinity;
    for(const sample of [upperStairHeight,middleStairHeight,lowestStairHeight]){
      if(sample.contains(x,z))height=Math.max(height,sample(x,z));
    }
    for(const shelf of [gateFoot,secondStairFoot,firstStairFoot,landingFoot]){
      height=Math.max(height,terraceTopAt(shelf,x,z));
    }
    return height;
  };
  // The roof can touch only the stone that exists beneath it. Read the
  // same chamfered cap polygon the terrace mesh uses.
  const stone=gateFoot.capPositions;
  gate.userData.roofStoneHeight=(x,z)=>{
    if(Math.abs(x)<24.20&&z>=-8.54&&z<12.60)return stone[1];
    if(Math.abs(x)>25.19||z<-12.13||z>13.79){
      return Math.abs(x)<11.5&&z>=-15.7&&z<-11.9?gate.userData.upperStairHeight(x,z):-Infinity;
    }
    let inside=false;
    for(let i=3,j=stone.length-3;i<stone.length;j=i,i+=3){
      const zi=stone[i+2],zj=stone[j+2];
      if((zi>z)!==(zj>z)&&x<(stone[j]-stone[i])*(z-zi)/(zj-zi)+stone[i])inside=!inside;
    }
    if(inside)return stone[1];
    if(Math.abs(x)<11.5&&z>=-15.7&&z<-11.9)return gate.userData.upperStairHeight(x,z);
    return -Infinity;
  };
  for (const direction of [-1, 1]) {
    const apronZ=x=>-11.9+gateApronInset(direction*x);
    railing(main,[direction*11.7,.04,apronZ(11.7)],[direction*17.85,.04,apronZ(17.85)],1.82);
    railing(main,[direction*17.85,.04,apronZ(17.85)],[direction*24.65,.04,apronZ(24.65)],1.82);
    if(direction>0){
      railing(main,[24.65,.04,-7.85],[24.65,.04,13.3],1.82);
      galleryApproach(main);
    }else{
      railing(main,[-24.65,.04,apronZ(24.65)],[-24.65,.04,-2.2],1.82);
      railing(main,[-24.65,.04,1.2],[-24.65,.04,13.3],1.82);
      sideSteps(main,direction);
    }
    for (const [y, z, width, depth] of [[-11, -31.7, 27, 5.2], [-7.65, -24.7, 22.25, 2.52], [-3.75, -16.9, 23.15, 2.50]]) {
      const x = direction * (width * .5 - .25);
      railing(main, [x, y + .04, z - depth * .5 + .18], [x, y + .04, z + depth * .5 - .18], 1.4);
    }
    batchEntranceLantern(main, direction * 12.6, 0, -10.3);
  }
  const moving=movingGate(environment,gate,main);
  main.commit(environment, gate, 1, null, 'throne');

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
  // Bring the stone beneath the marked forepaw seats. Keep the rear edge
  // at the staircase and join the new lip to the same shallow court.
  const courtApron=terrace(court, 0, 1, -11.87, 30, 10.74, 2);
  gate.userData.courtStoneHeight=(x,z)=>terraceTopAt(courtApron,x,z-inner.position.z);
  for(const x of [-2.28,2.44]){
    court.curve(CARVING,[[x,1.024,-17.1],[x+.05,1.024,-14.8],
      [x-.04,1.024,-11.7],[x+.02,1.024,-8.5]],.026,4);
  }
  stairFlight(court, -7.0, -.5, 1, 4.2, 20.6, 18, false);
  const innerFoot=terrace(court,0,4.2,12.2,38,26,3.3);
  pedestalCliff(court,0,10.9,21,15.3,20,508,innerFoot);
  buildHall(court, { x: 0, y: 4.2, z: 12.0, width: 32, depth: 17, height: 9.1, tiers: 2, screened: true, softCenter:true });
  for (const direction of [-1, 1]) {
    railing(court, [direction * 14.6, 1.05, -16.3], [direction * 14.6, 1.05, -6.6], 1.85);
    railing(court, [direction * 10.7, 4.22, -.7], [direction * 18.7, 4.22, -.7], 1.85);
  }
  court.commit(environment,inner,.53,null,'court');

  const walks = new THREE.Group();
  walks.name = '通往内庭的两翼回廊';
  gate.add(walks);
  const walkBatch = new PalaceGeometry();
  const walkRoofs=[-1,1].map(direction=>coveredWalk(walkBatch,direction));
  walkBatch.commit(environment,walks,.61);
  distantCourtDepth(environment,gate);
  gate.userData.finaleParts=moving;
  gate.userData.finaleFactory=()=>{
    const effects=buildHeavenFinale(gate);
    mountGateText(moving.boardFace);
    gate.userData.wetCourtRoof=mountCourtRoofRain(walks,walkRoofs);
    return effects;
  };
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
