import { MathUtils, Vector2 } from 'three';

const layer = /* glsl */ `
  // Shape the cliff pigment with broken, diagonal bands and smaller dry gaps.
  // Return the graphite, paper reserve and mineral channels of the stone.
  vec3 chapterInkChannels(vec2 uv) {
    vec2 p = vec2(uv.x + .57 * uv.y, uv.y);
    float slope = noise3(vec3(p * vec2(5.8, 3.6), 2.1));
    float tooth = noise3(vec3(p * vec2(24., 9.3), 7.4));
    float grain = noise3(vec3(p * vec2(77., 35.), 4.8));
    float pigment = smoothstep(.29, .70, slope * .68 + tooth * .32);
    float paper = smoothstep(.55, .82, tooth * .68 + grain * .32) * (1. - pigment);
    float mineral = smoothstep(.39, .71, noise3(vec3(p * vec2(8.4, 4.8), 12.4)));
    return vec3(pigment, paper, mineral * (1. - .43 * pigment));
  }
`;

export function installChapterCliffBrush(material) {
  material.vertexShader='varying vec3 vChapterCliffLocal;\n'+
    material.vertexShader.replace('vLandscape = vec2(worldPosition.y,-viewPosition.z);',
      'vChapterCliffLocal=position; vLandscape = vec2(worldPosition.y,-viewPosition.z);');
  material.fragmentShader=`varying vec3 vChapterCliffLocal;
  `+material.fragmentShader.replace('void main() {',layer+'\nvoid main() {')
    .replace('float reflectance=exp(-pigment*uLandGain*3.1);',`
      float cliffGlaze=vMineralMask;
      {
        // Project the procedural pigment along the real slope in cliff-local
        // strike coordinates, attached even while the cliff recedes.
        vec3 rock=vChapterCliffLocal;
        vec2 contact=vec2(rock.z+.32*rock.x,rock.y-10.6);
        vec2 uv=vec2(.565+contact.x*.064-.013*contact.y,
          .51+contact.y*.067+.006*contact.x);
        float edge=smoothstep(.01,.10,uv.x)*(1.-smoothstep(.91,.99,uv.x))
          *smoothstep(.01,.10,uv.y)*(1.-smoothstep(.91,.99,uv.y));
        float face=smoothstep(3.85,5.5,rock.y)*(1.-smoothstep(15.0,17.4,rock.y))
          *(1.-smoothstep(-.25,2.3,rock.x))*edge;
        if(face>.001){
          vec3 ink=chapterInkChannels(uv);
          float loaded=smoothstep(.12,.74,ink.x);
          float colored=smoothstep(.10,.70,ink.z);
          // Break up the dry edges with paper texture while the rock beneath
          // it remains a mid-dark graphite plane. Only small interruptions
          // in that exposure take an additional paper reserve.
          float bite=noise3(vec3(contact.x*.57+contact.y*.27,contact.y*.40,9.7));
          float grain=noise3(vec3(contact.x*2.3+contact.y*.61,contact.y*1.18,4.6));
          float reserve=ink.y*smoothstep(.49,.72,bite*.76+grain*.24);
          float graphite=.37+.32*loaded+.06*smoothstep(.31,.65,bite);
          float mineralStroke=colored*(.88+.12*smoothstep(.20,.68,bite));
          float target=mix(graphite,.46+.09*loaded,mineralStroke*.75);
          pigment=mix(pigment,target,face*.74);
          paperReserve=mix(paperReserve,mix(.035,.207,reserve),face*.76);
          cliffGlaze=mix(vMineralMask,.89*mineralStroke,face*.76);
        }
      }
      float reflectance=exp(-pigment*uLandGain*3.1);
    `).replace('vec4(reflectance,paperReserve,vMineralMask,1.0)',
      'vec4(reflectance,paperReserve,cliffGlaze,1.0)');
}

export function installChapterBankBrush(material, weight, shelf) {
  material.uniforms.uChapterBankInk=weight;
  if(shelf){
    material.vertexShader='varying vec3 vChapterShelfLocal;\n'+
      material.vertexShader.replace('vLandscape = vec2(worldPosition.y,-viewPosition.z);',
        'vChapterShelfLocal=position; vLandscape = vec2(worldPosition.y,-viewPosition.z);');
    material.fragmentShader='varying vec3 vChapterShelfLocal;\n'+material.fragmentShader;
  }

  const projection=shelf ? `
    vec3 rock=vChapterShelfLocal;
    vec2 uv=vec2(.625+rock.x*.054+rock.z*.019,
      .405+(rock.y-8.)*.050-rock.z*.022);
    float contour=smoothstep(2.3,5.,rock.y)*(1.-smoothstep(13.3,17.1,rock.y));
    float strength=.50;
  ` : `
    vec3 rock=vMountainPoint;
    vec2 flow=vec2(rock.z-22.+.44*(rock.x+16.),rock.y-5.60);
    vec2 uv=vec2(.55+flow.x*.035,.47+flow.y*.091-.016*(rock.x+16.));
    float bank=smoothstep(9.,14.,rock.z)*(1.-smoothstep(34.5,42.,rock.z));
    float contour=bank*smoothstep(1.65,3.2,rock.y)*(1.-smoothstep(8.9,11.6,rock.y))
      *smoothstep(9.,13.,-rock.x)*(1.-smoothstep(25.,34.,-rock.x));
    float strength=.79;
  `;
  material.fragmentShader=`uniform float uChapterBankInk;
  `+material.fragmentShader.replace('void main() {',layer+'\nvoid main() {')
    .replace('float reflectance=exp(-pigment*uLandGain*3.1);',`
      float bankTransfer=0.;
      float bankMineral=0.;
      if(uChapterBankInk>.001){
        ${projection}
        float edge=smoothstep(.032,.17,uv.x)*(1.-smoothstep(.85,.984,uv.x))
          *smoothstep(.032,.17,uv.y)*(1.-smoothstep(.85,.984,uv.y));
        bankTransfer=uChapterBankInk*contour*edge*strength;
        if(bankTransfer>.001){
          // Apply the pigment deposit inside one continuous stone face
          // and let the middle tones of the rock hold between strokes.
          vec3 ink=chapterInkChannels(uv);
          float loaded=smoothstep(.06,.65,ink.x);
          float mineral=smoothstep(.047,.576,ink.z);
          float softTooth=.66+.34*stoneFiber;
          float graphite=.295+.31*loaded+.05*seamCloud;
          float value=mix(graphite,.39+.09*seamCloud,mineral*.80);
          pigment=mix(pigment,max(value,pigment*.70),bankTransfer);
          paperReserve=mix(paperReserve,mix(.065,.15,ink.y*softTooth),bankTransfer*.77);
          bankMineral=.92*mineral*(.91+.09*seamCloud);
        }
      }
      float reflectance=exp(-pigment*uLandGain*3.1);
    `);
  if(!shelf){
    // Existing west cliff already has a mineral channel; the shelf keeps
    // its original uniformly tinted palette and uses the mineral transfer
    // only to shape its pigment load, retaining its exact gameplay grade.
    material.fragmentShader=material.fragmentShader.replace(
      /(vec4\(reflectance,paperReserve,)([\s\S]*?)(,1\.0\))/,
      '$1mix($2,bankMineral,bankTransfer*.86)$3',
    );
  }
}

export function chapterRidgeGlazeWeight(age) {
  return Number.isFinite(age) ? MathUtils.smootherstep(age, 5.40, 6.36)
    * (1 - MathUtils.smootherstep(age, 8.78, 9.30)) : 0;
}

export function installChapterRidgeGlaze(material, weight, role) {
  material.uniforms.uChapterRidgeGlaze=weight;
  material.vertexShader='varying vec3 vChapterRidgeLocal;\n'+
    material.vertexShader.replace('vLandscape = vec2(worldPosition.y,-viewPosition.z);',
      'vChapterRidgeLocal=position; vLandscape = vec2(worldPosition.y,-viewPosition.z);');
  material.fragmentShader='varying vec3 vChapterRidgeLocal;\n'+material.fragmentShader;

  const distant=role==='far';
  const placement={
    malachite:`
      vec2 uv=vec2(.62+.019*rock.x+.017*rock.z,.423+.037*(rock.y-6.)-.014*rock.z);
      float divide=rock.y-4.3+.17*rock.x+.11*rock.z;
      float cap=smoothstep(0.,3.0,divide)*(1.-smoothstep(14.4,19.0,rock.y));
      float face=smoothstep(2.05,4.80,rock.y)*(1.-smoothstep(17.5,20.,rock.y));
      float transfer=.96;
    `,
    azurite:`
      vec2 uv=vec2(.546-.024*rock.x+.011*rock.z,.505+.029*(rock.y-8.)+.012*rock.x);
      float divide=rock.y-5.35-.175*rock.x+.115*rock.z;
      float cap=smoothstep(.3,5.0,divide)*(1.-smoothstep(18.7,23.25,rock.y));
      float face=smoothstep(2.7,6.0,rock.y)*(1.-smoothstep(19.2,23.5,rock.y));
      float transfer=.94;
    `,
    far:`
      vec2 uv=vec2(.52+.022*rock.x+.019*rock.z,.49+.017*(rock.y-15.)-.007*rock.x);
      float cap=0.;
      float face=smoothstep(9.3,14.4,rock.y)*(1.-smoothstep(22.5,29.4,rock.y));
      float transfer=.23;
    `,
  }[role];
  material.fragmentShader=`uniform float uChapterRidgeGlaze;
  `+material.fragmentShader.replace('void main() {',layer+'\nvoid main() {')
    .replace('float reflectance=exp(-pigment*uLandGain*3.1);',`
      float strokeGlaze=0.;
      float tailGlaze=0.;
      if(uChapterRidgeGlaze>.001) {
        vec3 rock=vChapterRidgeLocal;
        ${placement}
        float edge=smoothstep(.03,.17,uv.x)*(1.-smoothstep(.84,.98,uv.x))
          *smoothstep(.02,.14,uv.y)*(1.-smoothstep(.83,.98,uv.y));
        float air=1.-${distant ? '.45' : '.1'}*smoothstep(43.,127.,vLandscape.y);
        strokeGlaze=transfer*uChapterRidgeGlaze*face*edge*air;
        if(strokeGlaze>.001){
          vec3 ink=chapterInkChannels(uv);
          float cyan=smoothstep(.016,.30,ink.z);
          float graphite=smoothstep(.12,.74,ink.x);
          // Let the native mountain planes own broad mineral color. The
          // procedural pattern breaks that color across deposits and dry edges.
          float terrace=cap*(.80+.20*smoothstep(.28,.67,seamCloud+.31*ink.z));
          float ledge=smoothstep(.1,.79,graphite)*terrace*(1.-.57*cyan);
          float pigmentPlane=${distant ? '.175+.19*graphite+.13*cyan' : '.275+.27*terrace+.17*ledge+.075*cyan'};
          pigment=mix(pigment,max(pigmentPlane,pigment*.64),strokeGlaze);
          float fibre=ink.y*smoothstep(.60,.85,stoneFiber)*(1.-.82*terrace);
          paperReserve=mix(paperReserve,.045+.12*fibre,strokeGlaze*.83);
          tailGlaze=clamp(${distant ? '.16+.48*cyan' : '.27+.72*max(terrace,cyan*.85)-.16*ledge'},0.,1.);
        }
      }
      float reflectance=exp(-pigment*uLandGain*3.1);
    `);
  material.fragmentShader=material.fragmentShader.replace(
    /(vec4\(reflectance,paperReserve,)([\s\S]*?)(,1\.0\))/,
    (_,prefix,channel,suffix)=>{
      const previous=distant?channel:'1.';
      return `${prefix}mix(${previous},tailGlaze,strokeGlaze*.94)${suffix}`;
    },
  );
}


// Reserve atmospheric separation at the feet of the two colored cliffs.
// Reuse the existing opaque surface IDs; the wings, river, sky and other
// slopes cannot be selected even when their projections cross the bloom.
export function registerChapterTerraceMist(ink,mesh,weight,role) {
  const post=ink.postMaterial;
  const key=role==='malachite'?'uChapterJadeSurface':'uChapterBlueSurface';
  if(!post.uniforms.uChapterTerraceMist) {
    post.uniforms.uChapterTerraceMist=weight;
    post.uniforms.uChapterJadeSurface={ value:new Vector2(-1,-1) };
    post.uniforms.uChapterBlueSurface={ value:new Vector2(-1,-1) };
    post.fragmentShader=`uniform float uChapterTerraceMist;
      uniform vec2 uChapterJadeSurface,uChapterBlueSurface;
    `+post.fragmentShader.replace(
      '        color=mix(color,paper,opacity);',
      `        if(high<.5&&uChapterTerraceMist>.001){
          vec2 targetSurface=floor(texture2D(tInkSurfaceId,vUv).rg*255.+.5);
          float terrace=max(step(length(targetSurface-uChapterJadeSurface),.1),
            step(length(targetSurface-uChapterBlueSurface),.1));
          if(terrace>.5){
            float rise=smoothstep(2.40,7.30,target.y);
            float distanceFade=1.-smoothstep(79.,129.,length(target-uMistCamera))*.47;
            opacity*=1.-.54*uChapterTerraceMist*rise*distanceFade;
          }
        }
        color=mix(color,paper,opacity);`,
    );
    post.needsUpdate=true;
  }
  const id=mesh.id%65535+1;
  post.uniforms[key].value.set(id%256,Math.floor(id/256));
}

export function chapterWestShoreInkWeight(age) {
  if (!Number.isFinite(age)) return 0;
  return MathUtils.smootherstep(age,4.90,6.30)*(1-MathUtils.smootherstep(age,8.35,9.50));
}

export function installChapterWestShoreInk(material,weight, hasMineral) {
  material.uniforms.uWestShoreInk=weight;
  material.fragmentShader=`uniform float uWestShoreInk;
  `+material.fragmentShader.replace('void main() {',layer+'\nvoid main() {')
    .replace('float reflectance=exp(-pigment*uLandGain*3.1);',`
      float westShoreGlaze=0.;
      float westShoreDepth=0.;
      if(uWestShoreInk>.001) {
        vec3 rock=vMountainPoint;
        // Join the visible west wall and its low riverbank in the same
        // coordinates. These are two oblique rock beds, not one wash/tint.
        float bankRise=smoothstep(.56,2.85,rock.y)*(1.-smoothstep(8.25,12.05,rock.y));
        float along=smoothstep(7.5,12.5,rock.z)*(1.-smoothstep(33.,45.,rock.z));
        float inland=smoothstep(8.5,13.8,-rock.x)*(1.-smoothstep(26.5,36.5,-rock.x));
        westShoreDepth=bankRise*along*inland*uWestShoreInk;
        if(westShoreDepth>.001){
          float strike=rock.x+.34*(rock.z-21.)-.78*(rock.y-5.);
          vec2 uv=vec2(.53+.026*(strike+16.0),.34+.046*rock.y+.008*(rock.z-22.));
          vec3 materialInk=chapterInkChannels(clamp(uv,vec2(.06),vec2(.94)));
          float teal=smoothstep(.04,.42,materialInk.z);
          float charcoal=smoothstep(.18,.72,materialInk.x);
          float bite=(seamCloud-.5)*1.58+(stoneFiber-.5)*.33;
          float bench=1.-smoothstep(2.3,5.7,abs(strike+15.8+bite));
          float head=1.-smoothstep(1.45,4.6,abs(strike+23.1-bite));
          float dark=max(.94*head,(1.-bench)*(.46+.54*smoothstep(.27,.72,charcoal)));
          float fracture=(1.-smoothstep(.13,.48,abs(strike+19.3+.55*bite)))
            *smoothstep(.51,.82,stoneFiber*.31+seamCloud*.69);
          float face=.32+.303*bench+.07*teal;
          float stoneValue=mix(face,.68+.19*charcoal,dark*.90);
          pigment=mix(pigment,stoneValue,westShoreDepth*.93);
          pigment*=1.-.16*fracture*westShoreDepth;
          paperReserve=mix(paperReserve,.033+.155*fracture,westShoreDepth*.87);
          westShoreGlaze=max(.13+.77*bench,.74*teal)*(1.-.67*dark);
        }
      }
      float reflectance=exp(-pigment*uLandGain*3.1);
    `);
  if(hasMineral){
    material.fragmentShader=material.fragmentShader.replace(
      /(vec4\(reflectance,paperReserve,)([\s\S]*?)(,1\.0\))/,
      '$1mix($2,westShoreGlaze,westShoreDepth*.96)$3',
    );
  }
}
