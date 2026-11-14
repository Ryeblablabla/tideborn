import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fillStoneGuides, foundedStone } from './shore-structure.js';

const clamp = THREE.MathUtils.clamp;
const rise = (from, to, x) => {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t*t*(3 - 2*t);
};
const bell = value => Math.exp(-value*value);
export const VALLEY_SHRINE_SITE = { x:18.19,z:42.55 };

/** Two low shelves replace the repeated peaks on the downstream stone bar. */
export function addSplitValleyShoal(environment,root,x,z,width,depth) {
  const beds=[[-.39,-.16,.60,.75,-.29,2.84],[.49,.21,.45,.64,.36,2.17]];
  let strata=[0,0];
  const rock=environment.terrain(root,x,0,z,[width,4.25,depth],{
    columns:59,rows:30,tint:'#59737b',amount:.61,
    field(u,v){
      let shape=0, ink=0, paper=0;
      for(const [cx,cz,width,depth,lean,height] of beds){
        const along=(u-cx+lean*(v-cz))/width, cross=(v-cz)/depth;
        const chip=.065*Math.sin(u*27+v*19)+.045*Math.cos(u*34-v*15);
        const wedge=Math.max(Math.abs(along)*.88+Math.abs(cross)*.38,
          Math.abs(cross)*.79+Math.abs(along)*.42);
        const weight=1-rise(.42,1.00,wedge+chip);
        const tilt=.74+.26*rise(-.62,.55,along+cross*.46);
        const h=height*weight*tilt;
        if(h>shape)shape=h;
        const bed=along*.59+cross*.42+.083*Math.sin(along*4.5+cross*2.9);
        const lee=rise(-.30,.05,bed)*(1-rise(.38,.80,bed));
        const crack=(1-rise(.047,.19,Math.abs(bed+.25+chip*.47)))
          *(.38+.62*rise(-.36,.72,Math.sin(along*14.6+cross*7.2)));
        ink=Math.max(ink,weight*(.11+.66*lee)*rise(.16,.84,h));
        paper=Math.max(paper,weight*crack*.83);
      }
      const cleft=u+.044+v*.24+.018*Math.sin(v*6.7);
      const through=1-rise(.023,.125,Math.abs(cleft));
      shape*=1-through;
      ink*=1-through;
      paper*=1-through;
      strata=[ink,paper];
      return shape-.31;
    },
    paint(u,v,h){
      const foot=rise(-.10,.22,h)*(1-rise(.31,.73,h));
      const pools=.44+.56*rise(-.52,.67,Math.sin(u*17.8+v*8.2));
      return [Math.max(strata[0],foot*pools*.46),strata[1]];
    },
    wash:.64,pooling:.033,gain:1.53,
    profile:{toneRange:[.11,.38],geometryInfluence:0,strokes:false,coherentInk:.09,reserveStrength:.15},
  });
  rock.mesh.name='北涧双叠石';
  rock.mesh.userData.inkMineralHold=.55;
}

/** The higher islet holds a low river shrine with an open stone niche. */
export function addValleyShrine(environment,root) {
  const {x,z}=VALLEY_SHRINE_SITE;
  const site=new THREE.Group();
  site.name='临江听水龛';
  site.position.set(x,0,z);
  root.add(site);
  const ground=(u,v)=>environment.heightAt(x+u,z+v);
  const floor=Math.max(...[-.75,0,.75].flatMap(u=>[-.62,0,.62].map(v=>ground(u,v))))+.035;
  const stone=[foundedStone(1.65,1.39,0,0,()=>floor,ground,.34,5)];
  for(const [u,v,width,y] of [[-.14,-.85,1.31,floor-.34],[-.27,-1.13,1.17,floor-.65],[-.38,-1.40,.96,floor-.98]]){
    stone.push(foundedStone(width,.34,u,v,(u,localV)=>Math.max(y,ground(u,localV)+.025),ground,.29,5));
  }
  const box=(width,height,depth,u,y,v)=>new THREE.BoxGeometry(width,height,depth).translate(u,y,v);
  const posts=[];
  for(const side of [-1,1]){
    const column=box(.32,1.11,.91,side*.46,floor+.54,.075);
    const points=column.attributes.position;
    for(let i=0;i<points.count;i++){
      const local=points.getX(i)-side*.46;
      const height=(points.getY(i)-floor)/1.11;
      points.setX(i,side*.46+local*(1-.26*height)-side*.035*height);
    }
    column.computeVertexNormals();posts.push(column);
    stone.push(box(.42,.16,.98,side*.46,floor+.11,.075));
  }
  const recess=box(.78,1.10,.21,0,floor+.55,.425);
  const roof=[[-.88,1.13],[-.63,1.34],[.03,1.66],[.55,1.38],[.81,1.17],[.67,1.075],[-.74,1.07]];
  const outline=new THREE.Shape(roof.map(([u,v])=>new THREE.Vector2(u,v)));
  const crown=[new THREE.ExtrudeGeometry(outline,{depth:1.09,bevelEnabled:true,
    bevelSegments:1,bevelSize:.028,bevelThickness:.035,steps:1}).translate(0,floor,-.59),
    box(1.49,.113,.99,0,floor+1.11,-.05)];
  function mount(parts,name,tint,tone) {
    const flat=fillStoneGuides(parts).map(part=>{
      const geometry=part.index?part.toNonIndexed():part;
      if(geometry!==part)part.dispose();
      geometry.deleteAttribute('uv');
      const pos=geometry.attributes.position,normal=geometry.attributes.normal,ink=geometry.attributes.inkGuides;
      for(let i=0;i<pos.count;i++){
        const u=pos.getX(i),v=pos.getZ(i),y=pos.getY(i)-floor;
        const seam=.57+.43*Math.sin(u*7.4+y*3.6+v*8.2)**2;
        const riseFace=rise(-.58,.57,normal.getY(i));
        const old=ink.getX(i);
        ink.setXY(i,Math.max(old,(.17+.13*(1-riseFace))*seam),
          Math.max(ink.getY(i),.16*riseFace*rise(.41,.79,Math.sin(u*8.3+y*8.4+v*3.2))));
      }
      return geometry;
    });
    const geometry=mergeGeometries(flat);
    for(const part of flat)part.dispose();
    const mesh=environment.add(site,geometry,[0,0,0],{tint,amount:.32,
      profile:{toneRange:tone,strokes:false,geometryInfluence:0,coherentInk:.12}});
    mesh.name=name;
  }
  mount(stone,'入坡石脚与残阶','#6d745d',[.17,.36]);
  mount(posts,'听水龛双石柱','#71725d',[.22,.48]);
  mount([recess],'龛内留暗','#494637',[.51,.72]);
  mount(crown,'断边折脊石盖','#56533e',[.32,.57]);
}

// A brush starts on one rock bed and follows the climb from the river to
// the shoulder. Each entry is [position on bed, foot, shoulder, width,
// downslope lean, ink load]. Empty beds leave room between the ink groups.
const brushBeds = {
  green: [
    [[-.36,2.5,11.6,.24,.16,.88],[-.67,4.2,9.1,.12,.13,.52]],
    [[.01,4.4,12.2,.20,-.26,.70]],
    [],
    [[-.39,3.4,9.8,.19,.31,.76],[-.61,4.1,8.5,.10,.24,.45]],
  ],
  blue: [
    [[-.49,2.8,11.5,.25,-.34,.91],[-.18,4.2,10.1,.13,-.26,.61]],
    [[-.26,4.0,11.7,.25,.28,.91],[-.57,2.8,9.4,.11,.17,.53]],
    [[-.41,2.9,10.6,.23,-.24,.87],[-.13,3.8,8.5,.10,-.19,.55]],
    [[.11,3.3,12.1,.23,.34,.92],[-.29,3.1,10.2,.17,-.27,.79],[.37,4.7,9.8,.10,.31,.55]],
  ],
};

// Two slanting rock shelves on the high blue wall. The entire operation
// vanishes at its toe and far side, leaving the low river margin intact.
function fracturedBlueBed(d,strike,y) {
  const mask=rise(4.1,5.9,d)*(1-rise(12.7,15.9,d))*rise(2.35,5.5,y);
  if(mask<=0)return {rise:0,ink:0,paper:0};
  let relief=0,lip=0,paper=0;
  for(const [from,to,cross,tilt,lift] of [[-13,7,7.43,-.088,.96],[5.8,22.5,8.58,.105,.82]]){
    const along=(strike-from)/(to-from);
    const reach=rise(-.01,.18,along)*(1-rise(.82,1.0,along));
    const chip=.17*Math.sin(along*13.2+cross)+.09*Math.sin(along*29.9+tilt);
    const hinge=cross+tilt*(strike-(from+to)*.5)+chip;
    const breakAt=d-hinge;
    const top=rise(-.37,.22,breakAt)*(1-rise(.91,2.12,breakAt));
    const under=rise(-1.20,-.56,breakAt)*(1-rise(-.29,.10,breakAt));
    const teeth=.68+.32*rise(-.36,.61,Math.sin(along*22.4+cross));
    relief+=reach*(lift*top-.45*under)*teeth;
    lip=Math.max(lip,reach*under*teeth);
    const tail=1-rise(.38,.89,Math.abs(breakAt-.31));
    paper=Math.max(paper,reach*top*tail*(.13+.87*rise(-.10,.77,Math.sin(along*28.2+cross))));
  }
  return {rise:relief*mask,ink:lip*mask,paper:paper*mask};
}

/** The river edge, sloping beds and pigment use one cross section. */
function rockProfile(x, z, edge, side, style) {
  const bankBend = .83*bell((z+11+side*4)/7.8) - .56*bell((z-9+side*3)/8.9);
  const d = side*(x-edge(side,z)) + bankBend;
  const hinge = .85*bell((d-10)/6.1)*bell((z+2+side*6)/18);
  const strike = z-style.dip*d+hinge;
  const shore = rise(-.85,2.9,d);
  const reach = rise(1.7,7.7,d);
  const spread = bell((d-11.3)/14.6)*reach;
  const outer = rise(6,14,d)*bell((d-27)/17.2);
  const extent = rise(-46,-32,z)*(1-rise(32,49,z));
  let crest = 0, blackFace = 0, mineral = 0, reserve = 0;
  let bone=0, bristles=0;
  const beds=side>0?brushBeds.green:brushBeds.blue;
  for (let i=0;i<style.plates.length;i++) {
    const [center,span,lift,reachCenter,spanBias,breakOffset]=style.plates[i];
    const split=bell((d-reachCenter-breakOffset)/2.1);
    const curl=bell((d-reachCenter+breakOffset*.63)/4.3);
    const s = (strike-center)/span + .096*split-.055*curl;
    const profile = rise(-1.06,-.28,s)*(1-rise(spanBias,1.05,s));
    const reachFade = bell((d-reachCenter)/(7.5+reachCenter*.13));
    const pressure = profile*reachFade;
    crest = Math.max(crest, pressure*lift);
    const lee = rise(.02,.40,s)*(1-rise(.71,1.06,s));
    blackFace = Math.max(blackFace, lee*reachFade*(.75+.25*pressure));
    const exposedBed = rise(-.68,-.29,s)*(1-rise(.11,.43,s));
    const nearChip=bell((d-reachCenter+3.5+breakOffset*.33)/1.48);
    const farChip=bell((d-reachCenter-3.2+breakOffset*.67)/2.18);
    const chip = Math.max(nearChip,.73*farChip);
    const nick = 1-rise(.034,.17,Math.abs(s+.51+.072*split));
    reserve = Math.max(reserve,nick*reachFade*chip);
    mineral = Math.max(mineral,exposedBed*reachFade*(.69+.31*curl));
    for(const [at,foot,shoulder,width,lean,load] of beds[i]) {
      const run=(d-foot)/(shoulder-foot);
      if(run<=0||run>=1)continue;
      const reach=rise(0,.28,run)*(1-rise(.73,1,run));
      const sweep=at+lean*(run-.46)+.055*Math.sin(run*5.2+breakOffset);
      const cross=s-sweep;
      const taper=width*(.48+.52*rise(.05,.65,run));
      const tooth=.024*Math.sin(run*31+center)+.011*Math.sin(run*79+center);
      const loaded=1-rise(taper*.23,taper,Math.abs(cross+tooth));
      const pressure=loaded*reach*load*(.64+.36*rise(-.77,.68,Math.sin(run*13+center)));
      const broken=rise(-.34,.60,Math.sin(run*20.5+breakOffset)+.29*Math.sin(run*48+center));
      const cut=1-rise(.018,.061,Math.abs(cross+taper*.47+tooth*.66));
      bone=Math.max(bone,pressure);
      bristles=Math.max(bristles,cut*broken*reach*load);
    }
  }

  const bulk = style.base+style.front*bell((z+9.5)/13.5)+style.rear*bell((z-14)/14.3);
  const shoulder=.064*bell((d-12)/8.3)*bell((z+5+side*2)/15);
  const bench=.041*rise(6.1,8.4,d)*(1-rise(12.6,16.5,d))*bell((z-8)/13.5);
  const cleft=.054*bell((d-.37*z-10)/4.8)*bell((z+1)/7.2);
  const broadFace=.97+shoulder+bench-cleft;
  const stone = extent*shore*(bulk*(spread*broadFace+outer*.29)+crest*rise(1.2,6.8,d));
  let inlet = 0;
  if (side < 0) {
    const near = 1-rise(2.8,7.35,Math.abs(z+.8+.37*d));
    const far = 1-rise(2.4,5.9,Math.abs(z-8.6-.31*d));
    inlet = Math.max(near,far*.72)*rise(-.6,2.5,d)*(1-rise(25,38,d));
  }
  const base = stone*(1-inlet)-.72;
  const fracture=side<0?fracturedBlueBed(d,strike,base):null;
  const y = base+(fracture?.rise??0);
  const faceWeight = rise(.31,3.2,y)*(1-rise(20,35,d));
  const seep=Math.max(bell((strike+7.2+side*4)/8.8),.84*bell((strike-11+side*3)/7.6));
  const wetFoot = rise(-.18,.35,y)*(1-rise(1.0,3.15,y))*extent*(.40+.60*seep);
  // The outer beds take color on their higher shoulders. Damp feet and deep
  // breaks keep the paper and ink values of the original heightfield.
  const clay = rise(2.3,6.0,y)*(1-rise(20,31,d));
  const shelf = bell((d-8.2)/5.8)*(.58+.42*bell((strike-2.3)/13));
  const slab = bell((d-11.6)/7.0)*(.68+.32*bell((strike+5.8)/10));
  const coloredFace = side>0 ? shelf : slab;
  const glazed = Math.max(mineral*.88,coloredFace*.82)*faceWeight*clay;
  const attached=faceWeight*extent*rise(.96,3.72,y)*(1-inlet*.35);
  return {
    y, strike, d,
    ink: Math.max(faceWeight*blackFace*style.ink,(fracture?.ink??0)*.71),
    mineral: rise(.07,.66,glazed)*(1-.48*blackFace)*(1-bone*attached*.64),
    reserve: Math.max(reserve*faceWeight*style.paper,(fracture?.paper??0)*.53),
    wetFoot: wetFoot*(1-inlet*.47),
    bone:bone*attached,
    bristles:bristles*attached,
  };
}

export function addValleyShoulder(environment, root, edge, side, style) {
  const centerX=side*45, centerZ=2, width=48, depth=49;
  const sample = (u,v) => rockProfile(centerX+u*width,centerZ+v*depth,edge,side,style);
  let local;
  const ridge = environment.terrain(root,centerX,0,centerZ,[width,22,depth],{
    columns:96, rows:102, seed:style.seed, tint:style.tint, amount:.96,
    wash:.70, pooling:.039, gain:style.gain,
    field(u,v) {
      local=sample(u,v);
      return local.y;
    },
    paint() {
      // The heightfield samples field and paint together at each grid point.
      return [local.ink,local.reserve];
    },
    profile:{toneRange:style.tone,macroInk:.08,coherentInk:.065,geometryInfluence:0,strokes:false},
  });
  ridge.mesh.name=side>0?'江右墨崖':'江左石青';
  const position=ridge.mesh.geometry.attributes.position;
  const strata=new Float32Array(position.count*4);
  const mineral=new Float32Array(position.count);
  const brush=new Float32Array(position.count*2);
  for(let i=0;i<position.count;i++){
    const p=sample(position.getX(i)/width,position.getZ(i)/depth);
    strata[i*4]=p.strike;
    strata[i*4+1]=p.d;
    strata[i*4+2]=p.wetFoot;
    strata[i*4+3]=Number(side<0);
    mineral[i]=p.mineral;
    brush[i*2]=p.bone;
    brush[i*2+1]=p.bristles;
  }
  ridge.mesh.geometry.setAttribute('inkStrata',new THREE.BufferAttribute(strata,4));
  ridge.mesh.geometry.setAttribute('inkMineralMask',new THREE.BufferAttribute(mineral,1));
  ridge.mesh.geometry.setAttribute('inkValleyBrush',new THREE.BufferAttribute(brush,2));
  ridge.mesh.userData.inkMineralHold=.85;
}

/** Sparse silhouettes sit behind the collision-bearing river banks. */
export function addValleyMass(environment,root,{x,z,width,depth,height,tint,angle=0,near=false,name,folds,brush,paintFace}) {
  let deposited=0, inkBone=0, dryEdge=0;
  const cliff=brush==='cliff';
  const {mesh}=environment.terrain(root,x,-.09,z,[width,height,depth],{
    distant:true,angle,columns:68,rows:23,tint,amount:near?.68:.43,
    field(u,v) {
      let body=0, glaze=0, bone=0, dry=0;
      for(let i=0;i<folds.length;i++){
        const [center,foot,rake,weight,plateau]=folds[i];
        const leeway=u-center-(v-.16)*rake;
        const along=leeway/foot;
        const cap=rise(-1,-.28,along)*(1-rise(plateau,1.03,along));
        const face=v-.18+rake*along*.45;
        const pitch=face<0 ? .57 : .72;
        const cross=1-rise(.02,pitch,Math.abs(face));
        const split=brush==='shelf'?.99+.01*Math.cos(along*11+face*7):.94+.06*Math.cos(along*18.6+face*11.2);
        const weightHere=cap*cross*weight;
        body=Math.max(body,weightHere*split);
        glaze=Math.max(glaze,weightHere*(1-rise(-.01,.59,face)));
        if(!brush)continue;
        // Side-loaded knife strokes fall off the steep shoulder. Long slopes
        // carry broader, lower deposits, with much more exposed paper between.
        const grain=.047*Math.sin(along*17+face*16+i*1.8)+.024*Math.sin(along*36+face*29);
        const stroke=cliff ? along+face*(1.08+i*.17)-(.10-i*.28) : face+along*(.39-i*.15)+.21;
        const darkFace=1-rise(cliff?.09:.063,cliff?.32:.23,Math.abs(stroke+grain));
        const span=cliff ? rise(-.57,-.30,face)*(1-rise(.12,.41,face)) : rise(-.67,-.27,along)*(1-rise(.45,.92,along));
        const ink=darkFace*span*cap*weight;
        const rip=(1-rise(.039,.143,Math.abs(stroke-.20+grain)))*span*cap;
        const breaks=.31+.69*rise(-.58,.52,Math.sin((cliff?face*22:along*13)+i*2.7));
        bone=Math.max(bone,ink);
        dry=Math.max(dry,rip*breaks*weight);
      }
      deposited=glaze;
      inkBone=bone;
      dryEdge=dry;
      const softFoot=(1-rise(.48,.99,Math.abs(u)))*(1-rise(.54,.98,Math.abs(v)));
      return height*softFoot*(.13+body*.87)-.49;
    },
    paint(u,v,h) {
      const tooth=rise(-.45,.57,Math.sin(u*14-v*5));
      const pigment=deposited*(.50+.26*tooth);
      if(brush){
        const heightWeight=rise(.11,.37,h/height);
        const pool=inkBone*(cliff?1.16:1.03)*heightWeight;
        // Leave a paper interval below the cap; only the exposed fold gets
        // a colored shoulder, with the next ridge still visible through haze.
        const fall=rise(.27,.64,h/height)*(1-rise(.70,.98,h/height));
        const shoulder=deposited*fall*(cliff?.38:.30);
        const ink=Math.max(pigment*.23,pool,shoulder);
        const paper=dryEdge*heightWeight*(cliff?.78:.62);
        if(!paintFace)return [ink,paper];
        const [reserve,crease]=paintFace(u,v,h/height);
        return [Math.max(ink,crease)*(1-.96*reserve),Math.max(paper,reserve)];
      }
      return [pigment*(near?.70:.49),pigment*.24*rise(.04,.42,h/height)];
    },
    wash:near?.77:.64,pooling:.026,gain:brush?1.63:near?1.08:.91,
    profile:{toneRange:brush?[.06,.23]:near?[.07,.27]:[.036,.16],coherentInk:.041,geometryInfluence:0,
      reserveStrength:.14,macroInk:.053,strokes:false},
  });
  mesh.name=name;
  mesh.userData.inkMineralHold=near?.62:.44;
  if(paintFace){
    const position=mesh.geometry.getAttribute('position');
    const mask=new Float32Array(position.count);
    const cosine=Math.cos(angle),sine=Math.sin(angle);
    for(let i=0;i<position.count;i++){
      const px=position.getX(i),pz=position.getZ(i);
      const u=(px*cosine-pz*sine)/width;
      const v=(px*sine+pz*cosine)/depth;
      const [reserve]=paintFace(u,v,position.getY(i)/height);
      mask[i]=.93*(1-reserve);
    }
    mesh.geometry.setAttribute('inkMineralMask',new THREE.BufferAttribute(mask,1));
    mesh.userData.inkMineralHold=.82;
  }
}

export function shadeValleyStrata(material) {
  material.vertexShader = 'attribute vec4 inkStrata; attribute vec2 inkValleyBrush; varying vec4 vInkStrata; varying vec2 vValleyBrush;\n'
    + material.vertexShader.replace('vGuides=inkGuides;', 'vGuides=inkGuides; vInkStrata=inkStrata; vValleyBrush=inkValleyBrush;');
  material.fragmentShader = 'varying vec4 vInkStrata; varying vec2 vValleyBrush;\n' + material.fragmentShader.replace('void main() {', `
    float valleyInkPool(vec2 p, vec2 centre, vec2 size, float lean, float load, float knot) {
      vec2 q=p-centre;
      q.x-=lean*q.y;
      float edge=length(q/size);
      float drag=noise3(vec3(q.x*.57+q.y*.19,q.y*.74,knot));
      return load*(1.-smoothstep(.56,1.1,edge+.48*(drag-.5)));
    }
    void main() {
  `).replace(
    'float reflectance=exp(-pigment*uLandGain*3.1);',
    `float depthWash=1.-smoothstep(26.,100.,vLandscape.y);
     // The modeled beds carry the long direction. Pool on those faces in
     // uneven patches so the pigment does not cut another set of parallel lines.
     float bed=noise3(vec3(vInkStrata.x*.29+vInkStrata.y*.083,vInkStrata.y*.17,7.1));
     float tooth=noise3(vec3(vInkStrata.x*1.82+vInkStrata.y*.24,vInkStrata.y*.78,8.6));
     float skip=smoothstep(.28,.75,bed*.76+tooth*.24);
     float paintedFace=smoothstep(.15,.74,vGuides.x);
     float stoneGlaze=smoothstep(.19,.80,vMineralMask);
     float brush=noise3(vec3(vInkStrata.x*.14+vInkStrata.y*.39,vInkStrata.y*.26,9.31));
     float brokenRib=smoothstep(.51,.76,brush)*smoothstep(.27,.62,bed);
     float drySplit=1.-smoothstep(.036,.145,abs(brush-.47));
     float laidPaper=smoothstep(.10,.46,vGuides.y)*skip*depthWash;
     pigment*=1.-.14*paintedFace*(1.-skip);
     pigment+=paintedFace*depthWash*(.076+.10*skip);
     pigment+=stoneGlaze*(.062+.068*bed+.115*brokenRib)*depthWash;
     pigment+=vInkStrata.z*(.072+.103*bed)*depthWash;
     float cliffSlope=1.-abs(normalize(vFormNormal).y);
     float strokeEdge=vValleyBrush.x+(tooth-.5)*.19;
     float brokenInk=smoothstep(.12,.62,strokeEdge)*(.53+.47*smoothstep(.18,.78,cliffSlope));
     float fiberCut=noise3(vec3(vInkStrata.x*4.6+vInkStrata.y*.47,vInkStrata.y*1.34,11.7));
     float dryDrag=smoothstep(.11,.56,vValleyBrush.y)*(.28+.72*smoothstep(.27,.71,fiberCut));
     pigment=mix(pigment,.88+.24*bed,brokenInk*depthWash*.97);
     paperReserve=max(paperReserve,max(laidPaper*.44,stoneGlaze*drySplit*skip*.29*depthWash));
     paperReserve=max(paperReserve,dryDrag*depthWash*.70);
     // Broad deposits pool unevenly on two connected low rock faces.
     // The handful of dry nicks cuts pigment at clumps rather than tracing
     // the entire fall of the sloping surface.
     float mineralGlaze=vMineralMask;
     float westPaint=vInkStrata.w*smoothstep(1.55,3.0,vLandscape.x)*
       (1.-smoothstep(7.1,10.6,vLandscape.x))*
       smoothstep(2.9,4.3,vInkStrata.y)*(1.-smoothstep(11.6,14.8,vInkStrata.y));
     if(westPaint>.001){
       vec2 p=vInkStrata.xy;
       float upper=valleyInkPool(p,vec2(14.6,6.8),vec2(5.7,4.05),-.34,1.,3.9);
       float shoulder=valleyInkPool(p,vec2(9.1,8.4),vec2(4.4,3.95),.71,.92,6.4);
       float foot=valleyInkPool(p,vec2(1.6,5.8),vec2(5.25,3.6),-1.22,.91,11.7);
       float load=max(max(upper,shoulder),foot);
       float slurry=noise3(vec3(p.x*.49+p.y*.19,p.y*.59,2.5));
       float deposits=smoothstep(.19,.58,load+.18*(slurry-.5));
       float pooling=smoothstep(.62,.90,load+.12*(slurry-.5));
       float bringInk=westPaint*deposits*(.79+.21*depthWash);
       float dryAxis=p.x-.33*p.y+.52*slurry;
       float bristle=noise3(vec3(dryAxis*2.4,p.y*1.21,13.3));
       float endGrain=noise3(vec3((p.x+.65*p.y)*1.31,p.y*1.85,8.9));
       float nicks=smoothstep(.745,.92,bristle*.69+endGrain*.31)*bringInk;
       float loadedInk=max(.26+.14*pooling,.88*pigment+.065);
       pigment=mix(pigment,loadedInk,bringInk*.75)*(1.-.23*nicks);
       paperReserve=mix(paperReserve,min(paperReserve,.18),bringInk*.82);
       paperReserve=min(.36,paperReserve+.27*nicks)*bringInk+paperReserve*(1.-bringInk);
       mineralGlaze*=1.-.38*nicks;
     }
     float reflectance=exp(-pigment*uLandGain*3.1);`
  ).replace(
    'vec4(reflectance,paperReserve,grain,1.0)',
    'vec4(reflectance,paperReserve,mineralGlaze,1.0)',
  );
}
