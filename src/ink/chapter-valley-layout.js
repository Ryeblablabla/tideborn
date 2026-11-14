import { Color, MathUtils } from 'three';
import { chapterRidgeGlazeWeight } from './chapter-cliff-brush.js';

const { lerp, smootherstep }=MathUtils;

// All these are scenic meshes made by addValleyMass. The west/east terrain
// shoulders and the islands used by gameplay stay in their original places.
const layout=[
  { name:'千山·岸悬松', scale:[1.23,1.15,1.14] },
  { name:'江左石青', tint:'#2d7093', amount:.92 },
  { name:'千山·石青主峰', position:[-57,-.50,89], scale:[1.03,.86,1.17], tint:'#647e91', amount:.68 },
  { name:'江口劈崖', position:[-19.4,-.34,59.0], scale:[.87,.39,.83], tint:'#195e92', amount:.95, mineral:.86 },
  { name:'远峡双峰', position:[-75,-2.2,118], scale:[1.19,.62,1.24], tint:'#788a93', amount:.35 },
  // Bring one sculpted shelf right behind the near cliff. The narrow
  // reach leaves the river open, while the existing stone shrine gives scale.
  { name:'千山·隔岸横岭', position:[17.4,-.28,48.9], scale:[.67,.59,.83], tint:'#087a55', amount:.98, mineral:.86 },
  { name:'隔江长脊', position:[60,-3.8,93], scale:[1.19,.40,1.08], tint:'#7c9485', amount:.42 },
  { name:'云后横坡', position:[72,-2.7,110], scale:[1.22,.58,1.12], tint:'#83988d', amount:.25 },
  { name:'千山·云后连脊', position:[-3,-3.05,128], scale:[1.35,.37,1.40], tint:'#87989d', amount:.32 },
];

export function arrangeChapterValley(root) {
  const layers=[];
  for(const spec of layout){
    const mesh=root.getObjectByName(spec.name);
    if(!mesh)continue;
    const { inkTint, inkTintAmount, inkMineralHold }=mesh.userData;
    layers.push({
      spec,mesh,position:mesh.position.toArray(),scale:mesh.scale.toArray(),
      inkTint,inkTintAmount,inkMineralHold,baseColor:new Color(inkTint),color:new Color(spec.tint??inkTint),paint:new Color(),
    });
  }
  let previous=-1, previousMineral=-1;
  return age=>{
    const weight=Number.isFinite(age)
      ? smootherstep(age,3.85,4.34)*(1-smootherstep(age,8.05,9.67)) : 0;
    const mineral=chapterRidgeGlazeWeight(age);
    if(mineral!==previousMineral){
      previousMineral=mineral;
      for(const {spec,mesh,inkMineralHold} of layers) {
        if(spec.mineral)mesh.userData.inkMineralHold=lerp(inkMineralHold,spec.mineral,mineral);
      }
    }
    if(weight===previous)return weight;
    previous=weight;
    for(const layer of layers){
      const {spec,mesh,position,scale,inkTint,inkTintAmount,baseColor,color,paint}=layer;
      if(spec.position)mesh.position.set(
        lerp(position[0],spec.position[0],weight),
        lerp(position[1],spec.position[1],weight),
        lerp(position[2],spec.position[2],weight),
      );
      if(spec.scale)mesh.scale.set(
        lerp(scale[0],spec.scale[0],weight),
        lerp(scale[1],spec.scale[1],weight),
        lerp(scale[2],spec.scale[2],weight),
      );
      if(spec.tint){
        mesh.userData.inkTint=weight===0?inkTint:paint.copy(baseColor).lerp(color,weight);
        mesh.userData.inkTintAmount=weight===0?inkTintAmount:lerp(inkTintAmount,spec.amount,weight);
      }
    }
    return weight;
  };
}


// Lay a slate face and its adjacent dark rock independently in pigment
// and mineral. Flecks in the seam come from the already loaded dry atlas.
export function reserveChapterValleyShoulder(material,weight) {
  material.uniforms.uChapterLayout=weight;
  const stamp=material.fragmentShader.includes('vec2 chapterAtlasStroke(')
    ? `if(uChapterLandBrushAvailable>.001&&shoulder>.02) {
         vec2 brush=chapterAtlasStroke(vec2(x,.72*low+.3*z),vec2(-16.5,10.1),
           vec2(7.0,3.6),vec2(.795,.607),vec2(2.,1.));
         chip=brush.y; bedding=brush.x;
       }` : '';
  material.fragmentShader='uniform float uChapterLayout;\n'+material.fragmentShader.replace(
    'float reflectance=exp(-pigment*uLandGain*3.1);',
    `float chapterShoulderGlaze=0.;
     float chapterShoulderBone=0.;
     if(uChapterLayout>.001){
       float z=vMountainPoint.z;
       float x=vMountainPoint.x;
       float low=vMountainPoint.y;
       float strike=x+14.75+.22*(z-20.);
       float tooth=(seamCloud-.5)*1.75+(stoneFiber-.5)*.62;
       float reach=smoothstep(8.9,14.4,z)*(1.-smoothstep(26.6,32.1,z));
       float face=smoothstep(2.0,3.55,low)*(1.-smoothstep(9.2,11.8,low));
       float shoulder=reach*face*uChapterLayout;
       float slate=1.-smoothstep(1.35,3.6,abs(strike+.48*(low-5.4)+tooth));
       float innerCut=1.-smoothstep(.20,.73,abs(strike-1.05+.31*(low-5.4)+tooth*.61));
       float outerBed=smoothstep(17.0,21.2,-x)*(1.-smoothstep(28.4,35.0,-x));
       float toe=(1.-smoothstep(3.4,5.85,low))*smoothstep(12.8,16.3,-x);
       float chip=smoothstep(.76,.95,stoneFiber*.7+seamCloud*.3);
       float bedding=.55+.45*seamCloud;
       ${stamp}
       float pool=max(.79*outerBed,.61*toe)*(.63+.37*bedding)*shoulder;
       float deposit=slate*(.47+.53*max(bedding,.58))*shoulder;
       float reserve=innerCut*chip*shoulder;
       pigment=mix(pigment,max(pigment,.68+.08*stoneFiber),pool);
       pigment=mix(pigment,.39+.12*bedding,deposit*.86);
       pigment*=1.-.19*reserve;
       paperReserve=mix(paperReserve,min(paperReserve,.14),max(pool,deposit)*.81);
       paperReserve=max(paperReserve,.22*reserve);
       chapterShoulderGlaze=.98*deposit;
       chapterShoulderBone=pool;
     }
     float reflectance=exp(-pigment*uLandGain*3.1);`,
  ).replace(
    /max\((mineralGlaze|vMineralMask)\*\(1\.-\.72\*chapterLoad\),\.90\*chapterGlaze\)/,
    'max(max($1*(1.-.72*chapterLoad),.90*chapterGlaze)*(1.-.66*chapterShoulderBone),chapterShoulderGlaze)',
  );
}
