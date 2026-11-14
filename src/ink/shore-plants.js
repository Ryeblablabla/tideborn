import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../rules.js';

const TAU = Math.PI * 2;
const WATER = -.12;
const smooth = THREE.MathUtils.smoothstep;

function surface(rows, columns, sample) {
  const position = [], guides = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const [x,y,z,ink = 0,white = 0] = sample(row / rows, column / columns);
      position.push(x,y,z);
      guides.push(ink,white);
      if (row === rows || column === columns) continue;
      const a = row * (columns + 1) + column, b = a + columns + 1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(guides,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function batch(parts) {
  const geometries = parts.map(part => {
    const flat = part.toNonIndexed();
    part.dispose();
    return flat;
  });
  const result = mergeGeometries(geometries);
  for (const part of geometries) part.dispose();
  return result;
}

function stalk(center, radius, taper = .34, rows = 7) {
  return surface(rows,4,(u,v) => {
    const [x,y,z] = center(u);
    const r = radius * (1 - u * (1 - taper));
    return [x + Math.cos(v * TAU) * r,y,z + Math.sin(v * TAU) * r];
  });
}

// The midrib sweeps forward and then droops. Width, twist and curled edges
// follow the actual leaf surface, so the dark blade still reads on a turn.
function blade(base, angle, length, width, rise, drop, turn, load, seed, rows = 8, columns = 4) {
  const x = Math.cos(angle), z = Math.sin(angle);
  return surface(rows,columns,(u,v) => {
    const across = (v - .5) * 2;
    const arc = length * u;
    const fold = Math.sin(Math.PI * u) ** .81;
    const asymmetry = across < 0 ? .89 : 1.09;
    const widthHere = width * fold * asymmetry * (.85 + .15 * Math.sin(u * 9.1 + seed));
    const twist = turn * u + .18 * Math.sin(seed + u * 6);
    const side = across * widthHere * Math.cos(twist);
    const vein = (1 - smooth(Math.abs(across),0,.37)) * smooth(u,.08,.34) * (1 - smooth(u,.72,.97));
    const dry = smooth(Math.sin(u * 24.4 + across * 14.2 + seed),.34,.91);
    return [
      base[0] + x * arc - z * side,
      base[1] + rise * Math.sin(u * 2.31) - drop * u * u + Math.sin(twist) * across * widthHere - across ** 2 * fold * .052,
      base[2] + z * arc + x * side,
      load * fold * (.74 + .26 * Math.sin(u * 8.0 + seed) ** 2),
      vein * (.26 + dry * .34) + smooth(Math.abs(across),.62,.97) * dry * .26,
    ];
  });
}

function reedClump(environment, root, [x,z,size,lean,ink,seed,stance], contacts) {
  const rng = random(seed), stems = [], tassels = [];
  const baseY = Math.max(WATER - .012, environment.heightAt(x,z) - .075);
  const sparse = ink < .66;
  const foreground=stance==='sweep', bank=stance==='rooted', mist=stance==='mist';
  const count = (foreground ? 8 : bank ? 7 : sparse ? 4 : 6) + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const footX = (rng() - .5) * (foreground?1.71:1.47), footZ = (rng() - .5) * .82;
    const wx = x + footX * size, wz = z + footZ * size;
    const shore = environment.heightAt(wx,wz);
    const localY = (Math.max(WATER - .012, shore - .075) - baseY) / size;
    const height = sparse ? 1.58 + rng() * 2.1 : 1.32 + rng() ** .7 * 2.51;
    const h=height*(foreground?(i<3?1.41:.91):bank?.83:1);
    const angle = lean + (rng() - .5) * .64;
    const bend = (.36 + rng() * .84)*(foreground?1.42:bank?.81:1);
    const stem = u => [
      footX + Math.cos(angle) * bend * u ** 2,
      localY + h * (u - .065 * u ** 4),
      footZ + Math.sin(angle) * bend * u ** 2,
    ];
    stems.push(stalk(stem,.018+rng()*.012,.24));
    const bladeCount = sparse ? 1 + i % 2 : i % 4 === 0 ? 2 : 3;
    for (let leaf = 0; leaf < bladeCount; leaf++) {
      const side = (leaf+i)%2 ? 1 : -1;
      const level = .24 + leaf * .22 + rng() * .14;
      const length = (.81 + rng() * .98) * (1.13 - leaf * .14)*(foreground?1.26:1);
      const direction=angle+side*(.38+rng()*.91);
      const width=(.077+rng()*.080)*(1.14-leaf*.17)*(foreground?1.46:bank?1.24:sparse?.70:1);
      const rise=.33+rng()*.51,drop=.47+rng()*.72,turn=(rng()-.5)*1.19;
      const inkLoad=ink*(.35+rng()*.5)*(foreground?1.18:1);
      stems.push(blade(stem(level),direction,length,width,rise,drop,turn,inkLoad,i*3.19+leaf+seed));
    }
    if (i % 4 !== 1) {
      const top = stem(1), extent = .31 + rng() * .31;
      const plume = u => [top[0]+Math.cos(angle)*extent*u,top[1]+extent*(u-.45*u*u),top[2]+Math.sin(angle)*extent*u];
      tassels.push(stalk(plume,.016,.16,5));
      for (let twig = 0; twig < 6; twig++) {
        const point = plume(.16 + twig * .12);
        const direction = angle + (twig%2 ? 1 : -1) * (.22 + rng()*.48);
        tassels.push(blade(point,direction,(.11+rng()*.13)*(1-twig*.057),.022+rng()*.02,.10,.065,.51,.08,i+twig,3,2));
      }
    }
    if (i % 2 === 0 && shore <= WATER + .035) {
      contacts.push({x:wx,z:wz,angle:lean-.31,length:.36+size*.30,width:.044+size*.037,ink:.11+ink*.22,seed:seed+i});
    }
  }
  const foliage = batch(stems);
  foliage.scale(size,size,size);
  const tone=foreground?[.25,.62]:bank?[.18,.51]:mist?[.058,.23]:[.12+ink*.10,.31+ink*.15];
  const reed = environment.add(root,foliage,[x,baseY,z],{
    tint:ink>.7?'#293f34':'#465346',amount:.38,
    profile:{strokes:false,geometryInfluence:0,toneRange:tone,coherentInk:mist?.12:.18+ink*.18},
    wind:true,
  });
  reed.name = '芦苇';
  reed.userData.shoreCanopy=(foreground?2.35:2)*size;
  const seeds = batch(tassels);
  seeds.scale(size,size,size);
  const head = environment.add(reed,seeds,[0,0,0],{
    tint:'#8a7354',amount:.59,profile:{strokes:false,geometryInfluence:0,toneRange:mist?[.043,.16]:[.08,.27],coherentInk:.10},
  });
  head.name = '苇穗';
}

export function lotusLeaf(radius, tilt, seed) {
  const notch = .12 + (seed % 13) * .014;
  return surface(8,36,(u,v) => {
    const angle = notch + v * (TAU - 2 * notch);
    const edge = .96 + .055 * Math.sin(angle * 5 + seed) + .032 * Math.sin(angle * 9 - seed);
    const r = radius * u * edge * (1 - .15 * Math.abs(v - .5) ** 3);
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const curl = smooth(u,.75,1) * (.053 + .045 * Math.sin(angle*4 + seed));
    const scallop = .026 * Math.sin(angle * 12 + seed * 1.7) * u * u;
    const veinAngle = angle + Math.sin(u * 3 + angle * 2) * .066;
    const radial = Math.abs(Math.cos(veinAngle * 7.5 + seed));
    const vein = smooth(radial,.91,1) * smooth(u,.07,.21) * (1 - smooth(u,.76,1));
    const darkEdge = smooth(u,.76,1) * (.27 + .15 * Math.sin(angle * 3 + seed));
    return [x, .049 * u * u + curl + scallop + x * tilt,z,darkEdge,.26*vein];
  });
}

function openLotus(radius, height, seed) {
  const rng = random(seed), petals = [];
  const size = .43 + radius * .16;
  for (let layer = 0; layer < 3; layer++) {
    const count = 7 - layer;
    for (let index = 0; index < count; index++) {
      const angle = index / count * TAU + layer*.42 + (rng()-.5)*.22;
      const radial = size * (1 - .23*layer) * (.84 + rng()*.29);
      const width = size * (.35 - .047*layer) * (.90 + rng()*.25);
      const climb = (.16 + layer*.085) * (.89 + rng()*.20);
      petals.push(surface(8,4,(u,v)=>{
        const side = (v-.5)*2;
        const cup = Math.sin(Math.PI*u) ** .65;
        const along = radial * Math.sin(u * 1.42);
        const across = width * cup * side;
        return [
          .36+Math.cos(angle)*along-Math.sin(angle)*across,
          height+climb*Math.sin(u*1.57)+.058*side*side*cup,
          .13+Math.sin(angle)*along+Math.cos(angle)*across,
          .14*smooth(u,.46,1) + .05*Math.abs(side)*cup,
          .14*cup*(1-Math.abs(side)),
        ];
      }));
    }
  }
  return batch(petals);
}

function closedLotus(radius, height, seed) {
  const width = .127 + radius * .064;
  const length = .38 + radius * .15;
  return surface(10,22,(u,v)=>{
    const angle=v*TAU;
    const seam=Math.abs(Math.cos(angle*2.5+seed));
    const r=width*Math.sin(Math.PI*u**.76)**.72*(.93+.07*seam);
    return [
      .36+Math.cos(angle)*r+.048*u*u,height+length*u,.13+Math.sin(angle)*r+.022*u,
      .12*u+.14*smooth(seam,.87,1),.16*smooth(Math.sin(angle),.1,.8)*(1-u),
    ];
  });
}

function lotusPod(height, solo) {
  const width=solo?.16:.095;
  return surface(6,22,(u,v)=>{
    const a=v*TAU;
    const cap = u > .66;
    const r=width*(cap ? (1-u)/.34 : .29+.71*smooth(u,0,.66));
    const rise=cap ? .12-.026*(1-u) : .111*u/.66;
    const pits=smooth(Math.sin(a*6)*Math.cos(u*19),.18,.91);
    return [.36+Math.cos(a)*r,height+rise,.13+Math.sin(a)*r,.10+.17*pits,0];
  });
}

function lotusPlant(environment, root, x, z, radius, height, flower, seed, contacts) {
  const rng = random(seed);
  const y = WATER + .045 + height;
  const tilt = height > .12 ? .16 + rng() * .33 : .02 + rng()*.036;
  const yaw = rng() * TAU;
  const leaf = lotusLeaf(radius,tilt,seed);
  leaf.rotateY(yaw);
  const plant = new THREE.Group();
  plant.position.set(x,0,z);
  plant.userData.shoreCanopy=radius;
  root.add(plant);
  const green = height > .12 ? '#416a55' : radius > .85 ? '#334a3b' : '#577363';
  const mesh = environment.add(plant,leaf,[0,y,0],{
    tint:green,amount:.63,
    profile:{strokes:false,geometryInfluence:0,toneRange:[.081,.29],reserveStrength:.10,coherentInk:.19},
    wind:true,
  });
  mesh.name = height > .12 ? '立荷' : '莲叶';
  if(height>.12)mesh.userData.lotusRadius=radius;
  if (height > .12 || flower) {
    const flowerH = (flower==='bud'?.63:flower==='pod'?.38:.49) + radius * .48 + rng()*.26;
    const stems = [];
    if (height > .12) stems.push(stalk(u=>[0,WATER+(y-WATER)*u,0],.022,.52,7));
    if (flower) stems.push(stalk(u=>[.36*u*u,WATER+flowerH*u,.13*u],.024,.42,9));
    const stemMesh = environment.add(plant,batch(stems),[0,0,0],{
      tint:'#58694e',amount:.49,
      profile:{strokes:false,geometryInfluence:0,toneRange:[.12,.31]},
    });
    stemMesh.name = '荷梗';
    const top = WATER + flowerH;
    if (flower === 'open' || flower === 'bud') {
      const bud = flower === 'bud';
      const geometry = bud ? closedLotus(radius,top,seed) : openLotus(radius,top,seed);
      const bloom = environment.add(plant,geometry,[0,0,0],{
        tint:bud?'#954c49':'#9c5c54',amount:bud?.82:.69,
        profile:{strokes:false,geometryInfluence:0,toneRange:[.092,.27],coherentInk:.08},
      });
      bloom.name = bud ? '荷苞' : '荷花';
    }
    if (flower === 'open' || flower === 'pod') {
      const solo=flower==='pod';
      const seedHead = environment.add(plant,lotusPod(top+(solo?0:.06),solo),[0,0,0],{
        tint:'#9c8047',amount:.81,profile:{strokes:false,geometryInfluence:0,toneRange:[.14,.34]},
      });
      seedHead.name = '莲蓬';
    }
  }
  contacts.push({x,z,angle:yaw-.75,length:radius*(height>.12?.66:1.2),width:radius*.103,ink:height>.12?.21:.11,seed});
}

function lotusPatch(environment, root, [x,z,spanX,spanZ,seed,count], contacts) {
  const rng = random(seed);
  const planted = [];
  for (let attempt = 0; attempt < count * 5 && planted.length < count; attempt++) {
    const px = x + (rng()-.5) * spanX, pz = z + (rng()-.5) * spanZ;
    if (environment.heightAt(px,pz) > WATER + .07) continue;
    const radius = .45 + rng() ** .84 * .77;
    if (planted.some(item=>Math.hypot(px-item.x,pz-item.z)<.58*(radius+item.radius))) continue;
    const index = planted.length;
    const flower = index === 0 ? 'open' : index === 2 ? 'bud' : index === 5 ? 'pod' : null;
    const height = index % 3 === 1 ? .31 + rng()*.68 : .012+rng()*.034;
    lotusPlant(environment,root,px,pz,radius,height,flower,seed+index*17,contacts);
    planted.push({x:px,z:pz,radius});
  }
}

// Short tapered stains, rooted at real stalks and footings. The land and
// water meshes keep their usual depth test, so dry faces mask stray strokes.
function shoreContact(environment, root, contacts, name = '苇根、荷梗与桥脚的湿墨') {
  const strips = [];
  for (const {x,z,angle,length,width,ink,seed} of contacts) {
    if (length < .12) continue;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const count = seed % 3 === 0 ? 2 : 1;
    for (let band = 0; band < count; band++) {
      strips.push(surface(8,4,(u,v)=>{
        const s=(v-.5)*2;
        const pressure=Math.sin(Math.PI*u)**.61;
        const along=(u-.31)*length*(band?.66:1);
        const wave=Math.sin(u*8.5+seed)*width*.43;
        const lateral=wave+s*width*pressure+band*width*1.21;
        const tooth=.72+.28*Math.sin(u*17.3+seed+band);
        const edge=1-smooth(Math.abs(s),.1,.93);
        return [x+dx*along-dz*lateral,WATER+.012,z+dz*along+dx*lateral,ink*pressure*edge*tooth,0];
      }));
    }
  }
  if (!strips.length) return;
  const mesh = environment.add(root,batch(strips),[0,0,0],{
    tint:'#59695e',amount:.20,profile:{strokes:false,geometryInfluence:0,toneRange:[0,.017],coherentInk:0},
  });
  mesh.name = name;
}

export function drawStructureContacts(environment, root) {
  shoreContact(environment,root,root.userData.shoreStructureMarks ?? [],'桥墩水脚湿墨');
}

const marshInkBeds = [
  { name:'东汀苇岸', x:9.7,z:-9.4, across:2.5, along:4.7, side:1, ink:.86 },
  { name:'西汀回湾', x:-10.6,z:4.5, across:2.3, along:4.4, side:-1, ink:.69 },
];

// Load the actual bank vertices beneath the reeds and pull broken ink from
// the same waterline. The washes end short of the open fish lane.
function paintMarshFeet(environment,root) {
  const strips=[];
  for(const bed of marshInkBeds){
    const bank=root.getObjectByName(bed.name);
    const {position,inkGuides}=bank.geometry.attributes;
    for(let i=0;i<position.count;i++){
      const x=position.getX(i)+bank.position.x,z=position.getZ(i)+bank.position.z;
      const length=(z-bed.z)/bed.along;
      const cross=(x-bed.x)*bed.side/bed.across-.32*length;
      const edge=.05*Math.sin(length*15+cross*9)+.08*Math.sin(length*6-cross*8);
      const bedLoad=1-smooth(Math.hypot(length,cross*.89)+edge,.39,1);
      const dry=1-smooth(Math.abs(cross-.28*length-.24+edge),.032,.21);
      const aboveWater=smooth(position.getY(i),WATER-.07,WATER+.27);
      inkGuides.setXY(i,Math.max(inkGuides.getX(i),bedLoad*aboveWater*bed.ink),
        Math.max(inkGuides.getY(i),dry*bedLoad*aboveWater*.59));
    }
    const bankEdge=z=>{
      let water=0, land=bed.side*20;
      for(let i=0;i<11;i++){
        const middle=(water+land)*.5;
        if(environment.heightAt(middle,z)>WATER+.008)land=middle;
        else water=middle;
      }
      return water;
    };
    for(const [start,span,width,strength] of [[-.67,.76,.55,.46],[-.13,.83,.36,.32],[.22,.48,.22,.26]]){
      strips.push(surface(17,4,(u,v)=>{
        const z=bed.z+(start+span*u)*bed.along;
        const edge=bankEdge(z);
        const drag=Math.sin(Math.PI*u)**.62;
        const torn=.61+.39*smooth(Math.sin(u*17+bed.x*.44),-.46,.73);
        const x=edge-bed.side*(.08+v*width*(.56+.44*drag));
        const pressure=drag*torn*(1-smooth(v,.08,1))*strength*bed.ink;
        return [x,WATER+.009,z,pressure,0];
      }));
    }
  }
  const mesh=environment.add(root,batch(strips),[0,0,0],{profile:{strokes:false,geometryInfluence:0}});
  mesh.name='苇岸水脚断墨';
  mesh.userData.inkSurfaceWash=true;
  mesh.userData.inkIdSuppressed=true;
  mesh.renderOrder=1;
}

const marshReeds = [
  [8.7,-11.9,1.31,.84,.96,83,'sweep'],[9.1,-10.1,1.05,.73,.85,197,'rooted'],[9.5,-8.4,.78,.91,.70,293],
  [9.4,-4.1,.92,.74,.71,389],[10.2,-2.4,1.22,.53,.84,433],[9.1,-.9,.74,.68,.68,499],
  [10.1,3.0,1.01,.36,.77,617],[10.5,4.2,.69,.46,.56,683],
  [12.5,12.1,1.22,.76,.67,797],[14.0,13.9,.89,.51,.64,829],[13.2,17.1,.68,.37,.49,881],
  [-10.5,-8.1,.83,2.91,.65,941],[-11.1,-7.1,1.08,2.68,.77,991],
  [-11.6,-2.2,1.26,2.74,.85,1087],[-10.6,-1.4,1.12,2.92,.83,1193],
  [-9.4,4.0,1.03,2.64,.88,1277,'rooted'],[-8.85,5.9,.73,2.88,.59,1321],
  [-10.1,10.4,1.04,2.63,.74,1381],[-10.7,11.6,.82,2.71,.63,1423],
  [-11.3,17.6,.97,2.81,.66,1493],[-13.5,19.7,1.10,2.63,.58,1567],
  [14.6,24.1,.94,.64,.46,1627,'mist'],[15.2,26.8,.73,.75,.45,1693,'mist'],[-14.7,24.7,1.09,2.54,.43,1733,'mist'],
];
const lakeRushes = [
  [14.2,-14.0,1.24,1997],[15.35,-12.65,1.03,2027],[18.1,-10.7,.91,2063],[-16.7,-2.1,.81,2099],
  [-12.6,18.95,1.11,2179],[-13.37,24.65,.91,2269],[-11.47,22.05,.74,2289],
  [12.35,-12.33,1.02,2371],[13.27,-11.87,1.26,2383],
  [-12.15,17.12,.98,2441],[-11.7,19.11,1.22,2473],[-12.8,15.78,.82,2519],
];

function lakeRush(environment,root,[x,z,size,seed],contacts) {
  const rng=random(seed),leaves=[],seedHeads=[];
  const floor=environment.heightAt(x,z);
  const y=Math.max(WATER-.026,floor-.04);
  for(let i=0;i<9;i++){
    const angle=i*2.39+rng()*.85;
    const spread=.11+rng()*.33;
    const rootX=Math.cos(angle)*spread,rootZ=Math.sin(angle)*spread;
    const base=[rootX,0,rootZ];
    // A flat sword leaf rises quickly with a short curl. The fan hugs the
    // bank and stays below the reed spears that frame the preceding chapter.
    leaves.push(blade(base,angle,.19+rng()*.57,.047+rng()*.052,.52+rng()*.51,
      .095+rng()*.24,(rng()-.5)*1.1,.11+rng()*.16,seed+i,10,4));
    if(i===1||i===6){
      const stalkHeight=.80+rng()*.31;
      const axis=u=>[rootX+.07*u,stalkHeight*u,rootZ+.04*u];
      leaves.push(stalk(axis,.011,.61));
      seedHeads.push(surface(9,5,(u,v)=>{
        const p=axis(1),r=.036*Math.sin(Math.PI*u)**.58,a=v*TAU;
        return [p[0]+Math.cos(a)*r,p[1]+u*.15,p[2]+Math.sin(a)*r,.23+.1*u,.032];
      }));
    }
  }
  const bladeGeometry=batch(leaves),headGeometry=batch(seedHeads);
  bladeGeometry.scale(size,size,size);headGeometry.scale(size,size,size);
  const tuft=environment.add(root,bladeGeometry,[x,y,z],{
    tint:'#557062',amount:.55,wind:true,
    profile:{toneRange:[.085,.31],strokes:false,geometryInfluence:0,reserveStrength:.15,coherentInk:.09},
  });
  tuft.name='湖岸菖蒲';
  tuft.userData.shoreCanopy=1.1*size;
  const heads=environment.add(tuft,headGeometry,[0,0,0],{
    tint:'#8f7955',amount:.63,profile:{toneRange:[.10,.27],strokes:false,geometryInfluence:0},
  });
  heads.name='菖蒲短穗';
  contacts.push({x,z,angle:.40,length:.83*size,width:.074*size,ink:.24,seed});
}

export function addFrontierShorePlants(environment, root, stage, sites, lilySite) {
  const contacts = [];
  for (const {x,z,size,heading,seed} of sites) {
    if (stage === 0) reedClump(environment,root,[x,z,size,heading,.62,seed,'rooted'],contacts);
    else lakeRush(environment,root,[x,z,size,seed],contacts);
  }
  if(lilySite)lotusPatch(environment,root,lilySite,contacts);
  shoreContact(environment,root,contacts,'远汀草根湿墨');
}

export function populateShallows(environment, root, stage) {
  root.userData.shoreHeightAt=environment.heightAt;
  const contacts = [];
  if(stage===0){
    for(const patch of marshReeds)reedClump(environment,root,patch,contacts);
    paintMarshFeet(environment,root);
    for(const patch of [[7.8,-4.8,2.8,3.0,2309,7],[-8.1,5.8,2.6,3.1,2417,6],[10.0,14.6,2.6,3.3,2521,5]]){
      lotusPatch(environment,root,patch,contacts);
    }
  }else{
    for(const patch of lakeRushes)lakeRush(environment,root,patch,contacts);
    contacts.push(...(root.userData.shoreStructureMarks ?? []));
  }
  shoreContact(environment,root,contacts);
}
