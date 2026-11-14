import * as THREE from 'three';
import { random } from '../rules.js';
import { addValleyPine } from './valley-pines.js';
import { addSplitValleyShoal, addValleyMass, addValleyShoulder, addValleyShrine, VALLEY_SHRINE_SITE } from './valley-rock.js';
import { addLakeTree } from './lake-trees.js';
import { addLakeSkiff } from './lake-skiff.js';
import { addValleyCrossing } from './valley-crossing.js';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = (start, end, value) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};
const bell = value => Math.exp(-value * value);

// These broad strokes wrap the geometric shore ribs. Their companion
// reserve gives one broken dry face within each loaded brush shape.
function rockStroke(dabs, x, z) {
  let load = 0, reserve = 0, lift = 0;
  for (const [cx,cz,width,length,angle,weight] of dabs) {
    const dx=x-cx, dz=z-cz;
    const cosine=Math.cos(angle), sine=Math.sin(angle);
    const along=(dx*cosine+dz*sine)/length;
    const across=(dz*cosine-dx*sine)/width;
    const taper=.74+.26*clamp(.9-along*.37);
    const bend=.12*Math.sin(along*3.1);
    const tooth=.045*Math.sin(along*12.7+across*4.4)+.026*Math.sin(along*29.6-across*16);
    const radius=Math.hypot(along,(across-bend)/taper)+tooth;
    const pressure=1-ease(.62,1.06,radius);
    const seam=Math.abs(across+.33+along*.15+Math.sin(along*6.8)*.065);
    const cut=pressure*(1-ease(.095,.29,seam))*ease(-.84,-.30,along);
    reserve=Math.max(reserve,cut*weight*.86);
    const slabBoundary=1-Math.abs(along*.63)-Math.abs(across+.08+along*.21);
    const brokenEdge=.046*Math.sin(along*14.8+across*8.3);
    const chippedFace=clamp(slabBoundary+brokenEdge)**.54;
    const facet=ease(.14,.46,chippedFace);
    load=Math.max(load,pressure*weight*(1-.69*cut)*(.77+.23*facet));
    lift=Math.max(lift,chippedFace*weight);
  }
  return [load,reserve,lift];
}

const marshRockBeds = {
  reed: [[13.4,-8.2,4.8,3.1,.91,.78],[14.5,-.6,5.2,3.3,.70,.59],[18.3,9.7,4.9,2.8,.91,.53],[17.3,18.6,4.6,3.5,.58,.46]],
  return: [[-15.5,-12.7,6.2,3.6,1.03,.65],[-14.9,-1.5,6.0,3.2,.79,.61],[-13.4,8.2,4.7,3.1,.52,.56],[-14.4,18.6,5.7,2.9,1.06,.52]],
};

function marshRockInk(x,z,height,kind) {
  let root=0, reserve=0;
  for(const [cx,cz,length,width,angle,weight] of marshRockBeds[kind]){
    const dx=x-cx,dz=z-cz;
    const cosine=Math.cos(angle),sine=Math.sin(angle);
    const along=(dx*cosine+dz*sine)/length,across=(dz*cosine-dx*sine)/width;
    const ridge=across+.28*along+.085*Math.sin(along*5.8+cz);
    const bristle=.037*Math.sin(along*23+across*6)+.025*Math.sin(along*45-across*13);
    const reach=1-ease(.31,.98,Math.hypot(along,ridge*.94)+bristle);
    const dry=1-ease(.045,.23,Math.abs(ridge+.20+bristle));
    const cut=.35+.65*ease(-.36,.63,Math.sin(along*15.7+cx));
    const slab=reach*ease(.03,.57,ridge+.33)*weight;
    root=Math.max(root,slab*(1-dry*cut*.48));
    reserve=Math.max(reserve,reach*dry*cut*weight);
  }
  // Resolve the dry terrace and the lowest, wetted shelf separately. The
  // paper gap follows a height band, so it stays on the bank around bends.
  const upper=ease(.20,.77,height);
  const margin=ease(-.126,.015,height)*(1-ease(.14,.49,height));
  const broken=ease(-.22,.80,Math.sin(z*.83+x*.36)+.33*Math.sin(z*1.86-x*.63));
  const drift=.61+.39*ease(-.43,.52,Math.sin(z*.48+x*.51));
  const seam=ease(.10,.29,height)*(1-ease(.35,.58,height));
  return [Math.max(root*upper,margin*(.085+.35*broken)*drift),Math.max(reserve*upper*.83,seam*broken*.37)];
}

/** Wet, low banks from joined masses, with the submerged margin outside the solid cores. */
function shoreline(environment, root, lumps, { tint, amount, shadow, seed, name, dabs = [], marsh }) {
  const minX = Math.min(...lumps.map(([x,,rx]) => x - rx * 1.23));
  const maxX = Math.max(...lumps.map(([x,,rx]) => x + rx * 1.23));
  const minZ = Math.min(...lumps.map(([,z,,rz]) => z - rz * 1.23));
  const maxZ = Math.max(...lumps.map(([,z,,rz]) => z + rz * 1.23));
  const centerX = (minX + maxX) * .5;
  const centerZ = (minZ + maxZ) * .5;
  const width = (maxX - minX) * .5;
  const depth = (maxZ - minZ) * .5;
  function field(u, v) {
    const x = centerX + u * width;
    const z = centerZ + v * depth;
    let top = 0;
    let second = 0;
    for (const [px,pz,rx,rz,height] of lumps) {
      const radius = Math.hypot((x - px) / rx, (z - pz) / rz);
      const ripple = .035 * Math.sin(x * .84 + z * .69 + seed) + .018 * Math.cos(x * 2.28 - z * 1.78);
      const shelf = Math.max(0, 1.08 - radius + ripple) ** .89 * height;
      if (shelf > top) { second = top; top = shelf; }
      else second = Math.max(second, shelf);
    }
    const base = top + second * .27 - .26;
    const lift = dabs.length ? rockStroke(dabs,x,z)[2] : 0;
    return base + lift * ease(.24,.65,base) * 1.32;
  }
  const bank = environment.terrain(root,centerX,0,centerZ,[width,6,depth],{
    field, seed, tint, amount, columns:Math.ceil(Math.max(34,width * 4)), rows:Math.ceil(Math.max(30,depth * 3.5)),
    paint(u,v,h) {
      const x=centerX+u*width,z=centerZ+v*depth;
      const [load,reserve,crest] = rockStroke(dabs,x,z);
      const laid=load*ease(.40,.83,h)*ease(.17,.63,crest);
      const paper=reserve*ease(.25,.62,h)*ease(.15,.59,crest);
      if(!marsh)return [laid,paper];
      const [rootInk,bedPaper]=marshRockInk(x,z,h,marsh);
      return [Math.max(laid*.82,rootInk),Math.max(paper,bedPaper)];
    },
    wash:marsh ? .64 : shadow ? .82 : .45, pooling:marsh ? .043 : shadow ? .11 : .036, gain:shadow ? 1.21 : .92,
    profile:{
      toneRange:marsh ? shadow ? [.145,.38] : [.10,.31] : shadow ? [.18,.51] : [.10,.34],
      coherentInk:marsh ? shadow ? .106 : .08 : shadow ? .17 : .09,
      strokes:false,geometryInfluence:0,
    },
  });
  bank.mesh.name = name;
  for (const [x,z,rx,rz,height] of lumps) {
    const fraction = 1.08 - (.34 / height) ** (1 / .89);
    if (fraction > .44) environment.obstacles.push({x,z,rx:rx * fraction,rz:rz * fraction});
  }
  return bank;
}

const valleyMiddleBeds = {
  slate: [[-.49,-.23,.17,.72,-.16,.96],[-.07,-.25,.15,.68,-.21,.84],[.47,-.18,.16,.53,-.13,.71]],
  jade: [[-.57,-.24,.29,.38,.29,.72],[-.08,-.26,.37,.34,.26,.87],[.43,-.19,.25,.36,.12,.56]],
};

function valleyMiddleInk(u,v,h,style,seed) {
  let mass=0, paper=0;
  const raised=ease(.11,.54,h);
  for(const [centerU,centerV,width,length,lean,weight] of valleyMiddleBeds[style]){
    const along=(v-centerV)/length;
    const across=(u-centerU-lean*(v-centerV))/width;
    const bend=.085*Math.sin(along*5.2+seed);
    const tooth=.051*Math.sin(along*17+seed)+.039*Math.sin(across*13-along*21);
    const edge=1-ease(.49,.99,Math.hypot(along,(across+bend)*(.92+.14*along))+tooth);
    const head=.62+.38*ease(-.28,.54,along);
    const drag=1-ease(.055,.34,Math.abs(across+.41+.13*along+tooth));
    const broken=.32+.68*ease(-.43,.68,Math.sin(along*15.8+seed));
    mass=Math.max(mass,edge*head*weight);
    paper=Math.max(paper,drag*edge*broken*weight);
  }
  const foot=ease(.015,.15,h)*(1-ease(.25,.48,h));
  const run=u+.15*Math.sin(v*4.5+seed);
  const loaded=(1-ease(.22,.78,Math.abs(run+.20)))*(.48+.52*ease(-.56,.56,Math.sin(v*9-u*5)));
  const stoneEdge=foot*(1-ease(.15,.44,Math.abs(v-.33*u+.48)))*loaded;
  return [Math.max(mass*raised,stoneEdge*(style==='slate'?.88:.61)),Math.max(paper*raised,stoneEdge*.19)];
}

function valleyShoalStrata(u,v,height,form) {
  const flow=v+.47*u+.10*Math.sin(u*5.6);
  const shoulder=1-ease(.49,.93,Math.abs(u+.11));
  const risen=ease(.025,.22,height);
  const gravel=1-ease(.40,.94,Math.abs(flow-.13));
  const fray=.041*Math.sin(u*18.4-v*7.4)+.019*Math.sin(u*41+v*16);
  const drag=1-ease(.065,.38,Math.abs(flow+.21+fray));
  const taper=shoulder*risen;
  if(form==='bench'){
    const bank=ease(-.55,-.30,flow)*(1-ease(.02,.47,flow));
    const breakLine=.43+.57*ease(-.51,.61,Math.sin(u*9.7+1.32));
    return [Math.max(drag*.58*breakLine,bank*gravel*.26)*taper,
      (1-ease(.039,.20,Math.abs(flow-.045+fray)))*taper*breakLine*.59];
  }
  const pressed=ease(-.59,-.24,flow)*(1-ease(.21,.69,flow));
  const divide=.47+.53*ease(-.44,.70,Math.sin(u*7.4-v*5.9));
  return [Math.max(drag*.55,pressed*divide*.71)*taper,
    (1-ease(.042,.26,Math.abs(flow-.29+fray)))*taper*divide*.59];
}

function range(environment, root, { x,z,width,depth,height,tint = '#587178',amount = .38, seed, near = false, middle = false, shape = 'range', shoulder, terrace }) {
  const valley=near && root.userData.stage===3;
  const valleyIsland=valley && shape==='island';
  const valleyShoal=valley && shape==='bank';
  const ridge = environment.terrain(root,x,-.09,z,[width,height,depth],{
    shape,seed,distant:!near,columns:near?44:64,rows:near?26:18,tint,amount,
    paint(u,v,h) {
      if(shoulder)return valleyMiddleInk(u,v,h/height,shoulder,seed);
      if(terrace){
        const [ink,paper]=valleyShoalStrata(u,v,h/height,terrace);
        if(terrace!=='cliff')return [ink,paper];
        const dx=x+u*width-VALLEY_SHRINE_SITE.x,dz=z+v*depth-VALLEY_SHRINE_SITE.z;
        // These stone-side pools continue the islet's diagonal layers
        // beneath the actual plinth and along the ragged stair shoulder.
        const foot=bell((dx+.29+.37*dz)/1.39)*bell((dz+.93)/1.67);
        const edge=bell((dx-.44+.68*dz)/.79)*bell((dz+1.17)/1.29);
        const contact=Math.max(foot*.84,edge*.58)*ease(.16,.62,h);
        return [Math.max(ink,contact),paper*(1-contact*.66)];
      }
      const bend=.37*Math.sin(u*4.3+seed);
      const crest=ease(.06,.55,h/height)*(1-ease(.24,.81,Math.abs(v-bend)));
      const broad=crest*(.58+.42*Math.sin(u*3.8+seed));
      const white=crest*(1-ease(.075,.32,Math.abs(v+.28+u*.2)));
      if(valleyIsland){
        const fall=v-u*.42-.14*Math.sin(u*5.4+seed);
        const ledge=ease(.10,.46,fall)*(1-ease(.58,.92,fall));
        const wet=ease(.03,.20,h)*(1-ease(.24,.63,h));
        const deposits=.33+.67*ease(-.45,.63,Math.sin(u*6.8+seed));
        const broken=ease(-.38,.65,Math.sin(u*8.1-v*7.8+seed));
        return [Math.max(broad*.66,crest*ledge*.84,wet*deposits*.37),white*broken*.55];
      }
      if(valleyShoal){
        const edge=v+.11*Math.sin(u*6.5+seed)+u*.22;
        const shallow=ease(.015,.25,h)*(1-ease(.48,.92,h));
        const pools=1-ease(.05,.50,Math.abs(edge+.32));
        const slit=1-ease(.02,.16,Math.abs(edge-.05));
        return [pools*shallow*.44,slit*shallow*.45];
      }
      return [broad*(near?.76:middle?.29:.14),white*(near?.49:middle?.18:.10)];
    },
    wash:shoulder ? .75 : near ? .82 : .81, pooling:shoulder ? .042 : near ? .080 : .018,gain:shoulder ? 1.27 : near ? 1.19 : middle ? 1.13 : .94,
    profile:{
      toneRange:shoulder ? [.13,.42] : near ? [.19,.55] : middle ? [.064,.205] : [.026,.113], coherentInk:shoulder ? .08 : near ? .12 : middle ? .07 : .025,
      reserveStrength:.12,macroInk:.04,strokes:false,geometryInfluence:0,
    },
  });
  if(valley)ridge.mesh.userData.inkMineralHold=shoulder?.58:valleyIsland?.60:valleyShoal?.22:.48;
  ridge.mesh.name=terrace?(terrace==='bench'?'青赭低汀':'崖下石洲'):shoulder?(shoulder==='slate'?'石青斜坡':'灰青长肩'):valleyIsland?'青绿江岛':valleyShoal?'赭墨横洲':near?'江中低岭':middle?'谷口淡岭':'横展远岭';
  return ridge;
}

function drawShoreMarks(environment, root, coast, seed, near = false) {
  const rng = random(seed);
  const positions = [], indices = [];
  for (let i = 0; i < coast.length - 1; i++) {
    if (i % 5 === 3 || i % 9 === 6) continue;
    const [ax,az] = coast[i];
    const [bx,bz] = coast[i+1];
    const length = Math.hypot(bx-ax,bz-az);
    if (length < .01) continue;
    const start = i % 5 === 0 ? .26 : 0;
    const end = i % 7 === 4 ? .64 : 1;
    const width = (.025+rng()*.10) * (near ? 1 : 1.4);
    const offset = Math.sin(i*.9)*.027;
    const normalX = (bz-az) / length;
    const normalZ = -(bx-ax) / length;
    const base = positions.length / 3;
    const y = .014 + offset*.08;
    positions.push(ax+(bx-ax)*start,y,az+(bz-az)*start,
      bx-(bx-ax)*(1-end),y,bz-(bz-az)*(1-end),
      bx-(bx-ax)*(1-end)+normalX*width,y,bz-(bz-az)*(1-end)+normalZ*width,
      ax+(bx-ax)*start+normalX*width,y,az+(bz-az)*start+normalZ*width);
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const marks = environment.add(root,geometry,[0,0,0],{
    tint:'#5b6966',amount:.21,
    profile:{toneRange:near?[.032,.09]:[.018,.05],strokes:false,geometryInfluence:0,coherentInk:0},
  });
  marks.name = '水际断墨';
}

function plantPine(environment, root, x, z, size, seed, name, form, facing) {
  const y = environment.heightAt(x,z);
  if (!Number.isFinite(y) || y < .10) return;
  const around = [[x-.48,z],[x+.48,z],[x,z-.48],[x,z+.48]].map(([qx,qz])=>environment.heightAt(qx,qz));
  if (around.some(height=>!Number.isFinite(height) || Math.abs(height-y) > 1.12)) return;
  const base = y-.13*size;
  const tree = addValleyPine(environment,root,x,base,z,size,form,facing,seed);
  tree.name = name;
  return tree;
}

function lakeHeadland(environment,root,{x,z,width,depth,height,lean,seed,tint,near}) {
  const coast = (u,v) => {
    const along=u*lean;
    const reach=1-ease(.65,.995,Math.abs(u));
    const shore=v-.30*along+.09*Math.sin(u*5+seed);
    const shelf=1-ease(.28,.73,Math.abs(shore));
    const terrace=bell((along+.38)*2.58)*(.94+.06*Math.cos(u*10+seed));
    const shoulder=bell((along-.28)*3.6)*.47;
    const top=Math.max(terrace,shoulder);
    const rib=1-ease(.11,.72,Math.abs(shore-.16));
    return height*reach*(shelf*.28+rib*top*.72)-.57;
  };
  const {mesh}=environment.terrain(root,x,-.09,z,[width,height,depth],{
    field:coast,seed,distant:true,columns:72,rows:22,tint,amount:near?.44:.25,
    paint(u,v,h) {
      const settled=(1-ease(.28,.78,Math.abs(v+.13+u*.21)))*ease(.14,1.7,h);
      const interrupted=ease(-.32,.81,Math.sin(u*17.6+v*4.1+seed));
      return [settled*(near?.43:.23),settled*interrupted*.30];
    },
    wash:near?.70:.59,pooling:.024,gain:near?1.24:1.03,
    profile:{toneRange:near?[.06,.21]:[.026,.12],coherentInk:.046,
      reserveStrength:.14,macroInk:.04,strokes:false,geometryInfluence:0},
  });
  mesh.name=near?'湖口横汀':'隔水淡岸';
}

function lakeStoneCape(environment,root) {
  const centerX=29.8,centerZ=51.5,width=13.5,depth=14.3;
  const beds=[
    [.38,-.30,.58,.43,4.96],
    [.06,.04,.62,.43,5.95],
    [-.33,.35,.44,.42,3.95],
    [-.55,.52,.33,.29,2.02],
  ];
  function faces(u,v) {
    let crest=0;
    for(const [x,z,w,d,level] of beds){
      const run=(v-z)/d,across=(u-x+.33*(v-z))/w;
      const tooth=.032*Math.sin(u*24+v*17)+.026*Math.sin(u*12-v*11);
      const cut=Math.max(Math.abs(across)*.83+Math.abs(run)*.44,
        Math.abs(run)*.76+Math.abs(across)*.32);
      const piece=clamp(1-cut+tooth);
      const ledge=Math.min(1,piece/.37);
      crest=Math.max(crest,level*ledge**.58*(.80+.20*piece));
    }
    const shoulder=1-ease(.28,.98,Math.hypot((u-.32)*.88,(v+.29)*.88));
    return crest+shoulder*.53-.38;
  }
  const {mesh,heightAt}=environment.terrain(root,centerX,0,centerZ,[width,7.8,depth],{
    field:faces,columns:49,rows:42,tint:'#566a70',amount:.43,
    paint(u,v,h) {
      const rock=ease(.25,2.2,h);
      const shore=1-ease(-.44,.37,u+.32*v);
      const rib=u*4.7+v*7.8+.49*Math.sin(v*7.4);
      const slab=ease(-.18,.71,Math.sin(rib));
      const worn=(1-ease(.15,.59,Math.abs(Math.sin(rib+.94))))*
        (.40+.60*ease(-.26,.63,Math.sin(v*14.8+u*2.4)));
      return [rock*(.09+.31*shore+.28*slab),rock*worn*.51];
    },
    wash:.52,pooling:.039,gain:1.13,
    profile:{toneRange:[.095,.33],coherentInk:.13,macroInk:.065,
      reserveStrength:.21,strokes:false,geometryInfluence:0},
  });
  mesh.name='东湖横卧石岬';
  const wetEdge=[];
  for(let i=0;i<25;i++){
    const dz=(i/24-.34)*depth*1.40;
    let water=-width,land=0;
    if(heightAt(land,dz)<-.12)continue;
    for(let step=0;step<12;step++){
      const mid=(water+land)*.5;
      if(heightAt(mid,dz)>-.12)land=mid;
      else water=mid;
    }
    wetEdge.push([centerX+water-.22,centerZ+dz]);
  }
  drawShoreMarks(environment,root,wetEdge,827,true);
}

function marshBackwater(environment,root,{x,z,width,depth,seed,spits}) {
  const {mesh}=environment.terrain(root,x,-.08,z,[width,2.8,depth],{
    distant:true,columns:56,rows:18,seed,tint:'#6d7058',amount:.48,
    field(u,v){
      const curve=v-.23*u-.12*Math.sin(u*5.4+seed);
      const ends=1-ease(.61,.98,Math.abs(u));
      const bar=1-ease(.09,.81,Math.abs(curve));
      let bank=.12;
      for(const [center,spread,height] of spits)bank=Math.max(bank,height*bell((u-center)/spread));
      const chipped=.91+.09*Math.sin(u*26+seed);
      return 2.8*ends*bar*bank*chipped-.32;
    },
    paint(u,v,h){
      const notches=ease(-.34,.64,Math.sin(u*18+v*8+seed));
      const mark=ease(.06,1.10,h)*(1-ease(.30,.90,Math.abs(v+.14)));
      return [mark*(.18+.16*notches),mark*(1-notches)*.22];
    },
    wash:.66,gain:1.20,pooling:.026,
    profile:{toneRange:[.053,.20],coherentInk:.048,strokes:false,geometryInfluence:0},
  });
  mesh.name='远汀苇影';
}

export function buildReedMarsh(environment, root) {
  shoreline(environment,root,[
    [14,-9,6.3,9.5,2.35],[16,3,7.3,8.9,1.34],[21,11,10.4,8.4,1.13],
    [16,16,5.6,7.4,1.05],[19,26,9.2,7.8,.92],
  ],{name:'东汀苇岸',tint:'#4f4b38',amount:.29,shadow:true,seed:2.7,marsh:'reed',
    dabs:[[12.7,-9.0,2.8,4.0,.52,1],[13.5,-5.7,1.9,3.4,.34,.86],[13.6,2.3,2.1,3.1,.38,.68]]});
  shoreline(environment,root,[
    [-21,-15,11.7,9.5,1.38],[-20,-3,9.5,8.2,1.95],[-16,7,6.7,7.8,1.13],
    [-16,18,6.3,7.3,1.58],[-22,25,10.9,6.7,1.48],
  ],{name:'西汀回湾',tint:'#626853',amount:.34,shadow:false,seed:6.9,marsh:'return',
    dabs:[[-12.8,7.0,2.1,2.8,-.58,.63],[-14.1,12.9,2.5,4.0,-.61,.43]]});
  shoreline(environment,root,[
    [31,-19,12.7,10.4,1.24],[34,-4,9.9,13.6,1.59],[37,14,13.8,16.9,1.68],
    [38,35,14.7,14.1,1.87],
  ],{name:'外汀草洲',tint:'#737c68',amount:.27,shadow:false,seed:3.3});

  marshBackwater(environment,root,{x:-21,z:43,width:14,depth:6.8,seed:21,
    spits:[[-.64,.27,.62],[-.12,.38,.86],[.38,.44,.68]]});
  marshBackwater(environment,root,{x:20,z:50,width:17,depth:7.2,seed:23,
    spits:[[-.49,.49,.47],[.03,.32,.62],[.55,.30,.79]]});
  // A low foreground bar leaves the higher, staggered peaks behind it.
  range(environment,root,{x:-22,z:53,width:22,depth:9,height:6.1,seed:21,amount:.28,middle:true});
  range(environment,root,{x:23,z:65,width:29,depth:11,height:6.4,seed:23,amount:.24,middle:true});
  range(environment,root,{x:-9,z:88,width:52,depth:12,height:5.9,seed:31,amount:.19});
}

export function* buildGreatLake(environment, root) {
  shoreline(environment,root,[
    [-32,-25,14.0,15.1,2.8],[-30,-9,13.2,13.8,3.1],[-31,8,12.7,14.8,2.9],
    [-38,24,14.5,13.7,3.9],[-48,37,16.7,17.8,4.15],
  ],{name:'西面湖湾',tint:'#536761',amount:.40,shadow:false,seed:4.3});
  yield;
  shoreline(environment,root,[
    [25,-19,11.8,10.7,4.4],[29,-8,13.8,13.2,3.8],[38,5,14.7,15.5,3.5],
    [44,22,15.7,17.5,3.1],[49,40,13.5,16.1,2.5],
  ],{name:'东面松岬',tint:'#4b5c56',amount:.32,shadow:true,seed:3.2,
    dabs:[[17.6,-11.5,3.5,5.8,.56,1],[20.5,-5.3,2.8,5.1,.39,.91],[22.7,1.3,3.2,4.2,.57,.61]]});
  yield;
  lakeStoneCape(environment,root);
  yield;
  shoreline(environment,root,[
    [-14.7,19,4.1,5.15,1.35],[-16.8,23,5.6,4.0,1.7],[-18.7,26.4,6.2,3.3,1.08],
  ],{name:'湖亭小洲',tint:'#71694f',amount:.39,shadow:false,seed:4.4,
    dabs:[[-13.6,18.9,1.55,2.8,-.52,.66],[-16.7,24.5,1.50,2.1,-.58,.46]]});
  yield;
  const pavilionX = -16.2, pavilionZ = 21.8;
  environment.pavilion(root,pavilionX,Math.max(.38,environment.heightAt(pavilionX,pavilionZ)-.12),pavilionZ,1.62);
  yield;
  environment.bridge(root,-23.7,19.5,-.37);
  yield;
  // The pines hold one headland. The west terrace and pavilion have lighter,
  // upright or pendant silhouettes, with open gaps between stands.
  const headlandPines = [
    [18.8,-20.8,1.43,'fork',1.34],[20.5,-16.1,2.02,'cliff',2.49],[22.5,-17.8,1.30,'sparse',.45],
    [21.8,-11.0,1.55,'fork',2.58],[27.4,3.8,1.43,'sparse',1.12],[35.6,15.0,1.26,'cliff',.38],
  ];
  for(const [i,[x,z,size,form,facing]] of headlandPines.entries()){
    plantPine(environment,root,x,z,size,560+i*11,'松岬团墨',form,facing);
    yield;
  }
  addLakeSkiff(environment,root);
  yield;
  const lakeTrees = [
    [-17.85,23.45,1.25,'tree',.72],[-19.60,25.4,1.42,'willow',2.50],
    [-26.6,-12.5,1.26,'tree',.12],[-22.8,-2,1.82,'willow',1.84],
    [-24.5,.1,1.12,'tree',.75],[-27.7,3.2,1.36,'tree',-1.12],
    [-33.5,19.2,1.30,'willow',-.27],
  ];
  for(const [i,[x,z,size,form,facing]] of lakeTrees.entries()){
    const y=environment.heightAt(x,z);
    if(y>.1)addLakeTree(environment,root,{x,y:y-.11*size,z,size,facing},form,760+i*17);
    yield;
  }
  lakeHeadland(environment,root,{x:-48,z:64,width:33,depth:11,height:3.7,lean:-1,seed:41,tint:'#526c72',near:true});
  yield;
  lakeHeadland(environment,root,{x:44,z:73,width:39,depth:14,height:4.8,lean:1,seed:44,tint:'#627879',near:true});
  yield;
  lakeHeadland(environment,root,{x:-47,z:92,width:45,depth:15,height:6.7,lean:1,seed:42,tint:'#748487'});
  yield;
  lakeHeadland(environment,root,{x:37,z:105,width:46,depth:15,height:5.0,lean:-1,seed:46,tint:'#758b8a'});
  yield;
  const shoal = Array.from({length:30},(_,i)=>[-11.3+Math.sin(i*.21)*.65,16+i*.37]);
  drawShoreMarks(environment,root,shoal,660);
}

export function buildOffshoreReefs(environment, root) {
  // The faces lean into the weather. The low reef uses a long broken bed;
  // the two stacks use independent shoulders cut out of their silhouette.
  const reefs = [
    {name:'斜断双礁',x:-26,z:39,width:9.2,depth:5.9,height:6.4,angle:-.28,seed:3.2,
      beds:[[-.24,.14,.31,.48,1.08,.34],[.41,-.11,.21,.36,.61,.36]]},
    {name:'卧潮暗礁',x:35,z:53,width:12.5,depth:3.7,height:2.1,angle:.29,seed:7.5,
      beds:[[-.27,-.02,.62,.40,.81,-.34],[.29,.16,.47,.27,.61,-.27]]},
    {name:'回望断柱',x:12,z:-48,width:5.9,depth:5.0,height:7.6,angle:.67,seed:11.6,
      beds:[[-.13,.14,.24,.39,1.10,.37],[.29,-.17,.23,.36,.36,.17]]},
  ];
  for(const {name,x,z,width,depth,height,angle,seed,beds} of reefs){
    function field(u,v){
      const shear=.065*Math.sin(v*8.2+seed);
      let face=0;
      for(const [cx,cz,rx,rz,weight,lean] of beds){
        const across=(u-cx-lean*v+shear)/rx;
        const back=(v-cz)/rz;
        const radius=Math.abs(across)*.83+Math.abs(back)*.73;
        const flake=.065*Math.sin(u*28+v*12+seed)+.032*Math.cos(u*49-v*31);
        face=Math.max(face,weight*Math.max(0,1-radius+flake)**.75);
      }
      return height*face-.25;
    }
    const {mesh}=environment.terrain(root,x,-.11,z,[width,height,depth],{
      field,seed,angle,distant:true,collision:true,columns:56,rows:34,tint:'#425560',amount:.43,
      paint(u,v,h){
        const face=h/height;
        const fracture=u*.72+v*.21-face*.51;
        const broken=ease(-.28,.59,Math.sin(fracture*15.8+seed));
        const cut=ease(.64,.97,Math.cos(fracture*23.6+v*4.6));
        const wet=1-ease(.075,.30,face);
        return [(.28+broken*.59)*(.65+.35*wet),cut*(1-wet)*.39];
      },
      wash:.76,pooling:.078,gain:1.30,
      profile:{toneRange:[.13,.40],coherentInk:.16,reserveStrength:.14,strokes:false,geometryInfluence:0},
    });
    mesh.name=name;
  }
}

const riverKnots = [
  [-52,-6,22],[-17,-2.8,15.7],[-3,0,12.8],[15,6,14.0],[32,10.2,17.8],
  [55,1.4,23.1],[78,-10.8,30.4],[111,-13.0,41.0],[155,4.0,55.0],
];

/** One river axis for terrain, water wash and optional forward framing. */
export function mountainRiver(z) {
  const last = riverKnots.length - 1;
  if (z <= riverKnots[0][0]) return {x:riverKnots[0][1],halfWidth:riverKnots[0][2],grade:0};
  if (z >= riverKnots[last][0]) return {x:riverKnots[last][1],halfWidth:riverKnots[last][2],grade:0};
  let i = 0;
  while (riverKnots[i+1][0] < z) i++;
  const [fromZ,fromX,fromWidth] = riverKnots[i];
  const [toZ,toX,toWidth] = riverKnots[i+1];
  const span=toZ-fromZ, t=(z-fromZ)/span;
  const blend=t*t*(3-2*t);
  return {
    x:THREE.MathUtils.lerp(fromX,toX,blend),
    halfWidth:THREE.MathUtils.lerp(fromWidth,toWidth,blend),
    grade:(toX-fromX)*6*t*(1-t)/span,
  };
}

function riverEdge(side,z) {
  const river=mountainRiver(z);
  return river.x + side*river.halfWidth;
}

function lowestShore(environment,side,z) {
  const river=mountainRiver(z);
  const expected=riverEdge(side,z);
  const waterline=-.109;
  let previous=expected-side*4;
  for (let s=-3.5;s<=12;s+=.5) {
    const x=expected+side*s;
    if (environment.heightAt(x,z)>waterline) {
      let wet=previous,dry=x;
      for(let i=0;i<7;i++) {
        const mid=(wet+dry)*.5;
        if (environment.heightAt(mid,z)>waterline) dry=mid;
        else wet=mid;
      }
      return wet;
    }
    previous=x;
  }
  return river.x+side*river.halfWidth;
}

// Draw long and short strokes in small families with broken, feathered ends.
// They sit where the measured land mesh actually meets the low water plane.
function addRiverInk(environment,root) {
  const positions=[],guides=[],indices=[];
  function line(points,halfWidth,pressure,shoreBed=false) {
    const first=positions.length/3;
    for (let i=0;i<points.length;i++) {
      const [x,z]=points[i];
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0], dz=b[1]-a[1], d=Math.hypot(dx,dz)||1;
      const u=i/(points.length-1);
      const fade=ease(0,.23,u)*(1-ease(.65,1,u));
      const width=halfWidth*(.38+.62*fade)*(.76+.24*Math.sin(i*1.73+points[0][0]));
      const drag=shoreBed?.79+.21*Math.sin(i*.83+points[0][0])**2:1;
      for(let c=0;c<3;c++) {
        const side=c-1;
        positions.push(x+side*dz/d*width,-.107+Math.sin(i*.7)*.001,z-side*dx/d*width);
        guides.push((c===1?1:.048)*pressure*fade*drag,0);
      }
      if (i===points.length-1) continue;
      const base=first+i*3;
      for(let k=0;k<2;k++)indices.push(base+k,base+k+1,base+k+3,base+k+1,base+k+4,base+k+3);
    }
  }
  for (const side of [-1,1]) {
    for (const [index,[start,span,reach,ink]] of [[-23,10,.43,.43],[-11,9,.48,.39],[1,14,.45,.41],[17,11,.49,.36],[31,10,.49,.29]].entries()) {
      for (let copy=0;copy<(index===1||index===3?2:1);copy++) {
        const points=[];
        for(let i=0;i<=17;i++){
          const t=i/17;
          const z=start+t*span+(copy?2.0:0);
          const offset=.28+copy*.84 + .24*Math.sin(t*Math.PI+side);
          points.push([lowestShore(environment,side,z)-side*offset,z]);
        }
        line(points,reach*(copy?.62:1),ink*(copy?.63:1));
      }
      if(index%2===0){
        const z=start+span*.55;
        const river=mountainRiver(z);
        const q=Array.from({length:12},(_,i)=>{
          const t=i/11;
          return [river.x+side*(river.halfWidth*.55+.9*Math.sin(t*Math.PI)),z+8*t];
        });
        line(q,.28,.16);
      }
    }
  }
  for(const side of [-1,1]){
    const tributary=Array.from({length:20},(_,i)=>{
      const d=2.2+i*1.24,z=-.8-.37*d+side*(1.14+.44*Math.sin(i*.3));
      return [riverEdge(-1,z)-d,z];
    });
    line(tributary,.33,.24);
  }
  // Read the continuous bank from the upland inwards so detached islets do
  // not interrupt the contour. Shorter marks flank the island channel.
  function margin(z,start,end){
    const count=Math.ceil(Math.abs(end-start)/.30);
    const wetLimit=-.109;
    const wetAt=x=>environment.heightAt(x,z)<=wetLimit;
    let previous=start;
    let wet=wetAt(previous);
    for(let i=1;i<=count;i++){
      const x=THREE.MathUtils.lerp(start,end,i/count);
      const nextWet=wetAt(x);
      if(wet!==nextWet){
        let water=wet?previous:x,land=wet?x:previous;
        for(let j=0;j<6;j++){
          const middle=(water+land)*.5;
          if(wetAt(middle))water=middle;else land=middle;
        }
        return water;
      }
      previous=x;
      wet=nextWet;
    }
    return null;
  }
  function shoreSweep(start,length,width,ink,edge,offset){
    const points=[];
    for(let i=0;i<=24;i++){
      const t=i/24,z=start+t*length;
      const bank=edge(z);
      if(bank!==null)points.push([bank-offset*(.62+.38*Math.sin(Math.PI*t)),z]);
      else if(points.length>2){line(points,width,ink,true);points.length=0;}
      else points.length=0;
    }
    if(points.length>2)line(points,width,ink,true);
  }
  const mainland=z=>margin(z,riverEdge(1,z)+15,riverEdge(1,z)-4);
  for(const [start,length,width,ink,offset] of [[19,16,1.46,.65,.48],[37,15,1.62,.59,.48],
    [20,8.3,.98,.62,.55],[29.5,10.7,1.19,.74,.76],[41.2,10.0,1.25,.65,.63]]){
    shoreSweep(start,length,width,ink,mainland,offset);
  }
  const bars=[[28.6,6.4,16,21.3,29,.81,.50],[37.7,8.4,11.7,19.3,27.5,.89,.51]];
  for(const [start,length,river,land,back,width,ink] of bars){
    shoreSweep(start,length,width,ink,z=>margin(z,river,land),.54);
    shoreSweep(start+.7,length-1.4,width*.45,ink*.52,z=>margin(z,river,land),1.35);
    // Two shorter backs of the same stroke run into the actual side channel.
    // Their center sits in water even where the island outline turns in.
    shoreSweep(start+.40,length*.76,width*.96,ink*.88,z=>{
      const shore=margin(z,back,land);
      return shore===null?null:shore+1.34;
    },.27);
  }
  const bends=[
    [4,22,5.4,.20],[7,31,7.3,.23],[7,49,7.4,.22],[-5,58,8.4,.14],
  ];
  for (const [x,z,length,load] of bends) {
    const points=Array.from({length:13},(_,i)=>{
      const t=i/12;
      return [x+(t-.5)*length*.63+Math.sin(t*Math.PI)*.55,z+t*length*.72];
    });
    line(points,.23,load);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(guides,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const marks=environment.add(root,geometry,[0,0,0],{profile:{geometryInfluence:0,strokes:false}});
  marks.name='水际行笔';
  marks.userData.inkSurfaceWash=true;
  marks.userData.inkIdSuppressed=true;
  marks.renderOrder=1;
}

function seatValleyPines(environment, root, roots) {
  const position=[], paint=[], index=[];
  const spokes=9;
  for (const {x,z,size,facing} of roots) {
    const y=environment.heightAt(x,z);
    const ring=Array.from({length:spokes},(_,i)=>{
      const a=i/spokes*Math.PI*2, drag=.79+.21*Math.sin(i*4.7+x);
      const dx=Math.cos(a)*size*.82*drag, dz=Math.sin(a)*size*.47*drag;
      const px=x+dx*Math.cos(facing)+dz*Math.sin(facing);
      const pz=z+dz*Math.cos(facing)-dx*Math.sin(facing);
      return [px,environment.heightAt(px,pz)+.033,pz];
    });
    if(ring.some(p=>!Number.isFinite(p[1])))continue;
    const start=position.length/3;
    position.push(x,y+.033,z);
    paint.push(.48,0);
    for (const p of ring) {
      position.push(...p);
      paint.push(0,0);
    }
    for (let i=0;i<spokes;i++) index.push(start,start+1+i,start+1+(i+1)%spokes);
  }
  if(!index.length)return;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(paint,2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const marks=environment.add(root,geometry,[0,0,0],{profile:{geometryInfluence:0,strokes:false}});
  marks.name='山松根墨';
  marks.userData.inkSurfaceWash=true;
  marks.userData.inkIdSuppressed=true;
  marks.renderOrder=1;
}

export function* buildMountainValley(environment, root) {
  addValleyShoulder(environment,root,riverEdge,1,{
    base:5.8,front:10.3,rear:3.4,dip:.88,seed:1.9,tint:'#3f8665',gain:1.14,
    ink:.85,paper:.55,tone:[.17,.40],
    plates:[[-17.0,8.4,8.3,9.8,.05,-2.1],[-4.2,7.0,7.6,8.8,-.13,1.8],[5.6,9.6,6.1,10.3,.23,4.1],[17.1,8.7,4.8,9.7,.12,-3.3]],
  });
  yield;
  addValleyShoulder(environment,root,riverEdge,-1,{
    base:5.4,front:5.0,rear:1.8,dip:.58,seed:7.4,tint:'#356e9c',gain:1.09,
    ink:.76,paper:.48,tone:[.15,.37],
    plates:[[-18.2,7.7,7.0,12.2,.06,2.3],[-7.1,9.5,7.2,9.2,-.02,-3.7],[4.3,6.8,5.8,8.2,.12,1.4],[17.6,10.7,4.5,11.3,.27,-2.5]],
  });
  yield;
  range(environment,root,{x:-36,z:44,width:15.7,depth:13.8,height:10.2,tint:'#50715e',amount:.65,seed:12,near:true,shoulder:'jade'});
  yield;
  range(environment,root,{x:46,z:44,width:15.1,depth:11.3,height:12.6,tint:'#43657e',amount:.68,seed:23,near:true,shoulder:'slate'});

  yield;
  const islands=[
    [-6.2,21.6,4.7,3.2,2.5,8,'island'],[-12.5,30.8,7.3,4.3,3.9,11,'island'],
    [21.0,33.0,6.0,2.6,1.64,21,'bank','bench'],[18.6,42.6,6.6,4.0,4.5,17,'island','cliff'],
    [16.7,57.7,8.1,3.5,2.9,19,'island'],
    [2.7,66.6,8.9,2.6,1.75,12,'bank'],
  ];
  for (const [x,z,width,depth,height,seed,shape,terrace] of islands) {
    const tint=terrace?(terrace==='bench'?'#7f8060':'#537964'):shape==='bank'?'#a48659':seed%2?'#5c8b6c':'#3e77a0';
    range(environment,root,{x,z,width,depth,height,seed,tint,amount:shape==='bank'?.59:.76,near:true,shape,terrace});
    yield;
  }
  addSplitValleyShoal(environment,root,-7.6,51.9,8.2,3.6);
  yield;
  addValleyShrine(environment,root);
  yield;
  // One crossing spans the narrow side channel, while the main bend remains open.
  addValleyCrossing(environment,root,-9.6,25.8,1.15,8.0,.85);

  yield;
  const ranges=[
    {name:'江口劈崖',x:-39,z:84,width:22,depth:13,height:23.2,tint:'#3c6878',angle:-.19,near:true,brush:'cliff',
      folds:[[-.31,.31,-.31,1.0,-.16],[.21,.39,.29,.61,.05]]},
    {name:'隔江长脊',x:40,z:85,width:25,depth:13,height:14.1,tint:'#5b8569',angle:.13,near:true,brush:'shelf',
      folds:[[-.25,.63,.23,.92,.31],[.39,.43,-.12,.48,.28]]},
    {name:'远峡双峰',x:-52,z:103,width:35,depth:20,height:21.7,tint:'#64858f',angle:-.08,
      folds:[[-.33,.41,-.28,.85,-.18],[.06,.33,-.19,.66,-.17],[.48,.39,.24,.43,.12]]},
    {name:'云后横坡',x:49,z:107,width:40,depth:17,height:11.4,tint:'#73918a',angle:-.12,
      folds:[[-.16,.72,.27,.70,.28],[.52,.39,-.27,.42,.24]]},
    {name:'水天淡岭',x:12,z:142,width:52,depth:16,height:7.3,tint:'#809998',angle:.10,
      folds:[[-.27,.57,.17,.65,.16],[.31,.39,-.23,.37,.27]]},
    {name:'西峡斜肩',x:-61,z:-18,width:26,depth:24,height:16.2,tint:'#64837b',angle:.49,near:true,
      folds:[[-.35,.37,-.25,.84,.03],[.13,.48,-.20,.60,.22]]},
    {name:'回身青屏',x:67,z:-21,width:28,depth:28,height:16.0,tint:'#6c886d',angle:-.26,near:true,
      folds:[[-.24,.44,.25,.56,.25],[.37,.48,-.13,.83,.04]]},
  ];
  for(const ridge of ranges){
    addValleyMass(environment,root,ridge);
    yield;
  }

  const trees=[
    [17,-9,1.31,'cliff',2.93],[19.9,-5,.97,'fork',.53],[18.2,1.5,1.04,'cliff',2.26],
    [23.4,6.7,1.12,'sparse',1.07],[25.8,12.6,.88,'fork',-.36],
    [-18.2,-8,1.18,'sparse',.45],[-22.8,-2.8,.93,'fork',1.33],
    [-18.7,5.8,1.07,'cliff',.29],[-17.1,11.3,.92,'fork',-.86],
    [-6.6,21.3,.78,'cliff',-.73],
    [-12.6,30.6,.70,'fork',.50],[-14.6,31.2,.83,'sparse',-1.03],
  ];
  const treeNames={cliff:'临崖探枝',fork:'双干并松',sparse:'疏冠高松'};
  const planted=[];
  for (const [i,[x,z,size,form,facing,seed=680+i*13]] of trees.entries()) {
    if(plantPine(environment,root,x,z,size,seed,treeNames[form],form,facing)){
      planted.push({x,z,size,facing});
    }
    yield;
  }
  seatValleyPines(environment,root,planted);
  yield;
  addRiverInk(environment,root);
}
