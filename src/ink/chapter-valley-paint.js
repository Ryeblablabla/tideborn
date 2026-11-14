import { MathUtils } from 'three';

function valleyPaintRole(mesh) {
  switch (mesh.name) {
    case '江右墨崖':
    case '千山·东岸墨肩':
      return 1;
    case '江左石青':
      return 2;
    case '千山·石青主峰':
      return 3;
    default:
      return 0;
  }
}

export function chapterValleyPaintWeight(age) {
  if (!Number.isFinite(age)) return 0;
  return MathUtils.smootherstep(age, 4.03, 4.95) *
    (1 - MathUtils.smootherstep(age, 7.15, 8.74));
}

const footprint = /* glsl */ `
 uniform sampler2D uChapterLandBrushAtlas;
 uniform vec2 uChapterLandAtlasGrid;
 uniform float uChapterLandBrushAvailable;

 vec2 chapterAtlasStroke(vec2 point, vec2 centre, vec2 size, vec2 axis, vec2 tile) {
   vec2 offset=point-centre;
   vec2 uv=vec2(dot(offset,axis),dot(offset,vec2(-axis.y,axis.x)))/size;
   float box=1.-smoothstep(.78,1.,max(abs(uv.x),abs(uv.y)));
   if (box<=.001) return vec2(0.);
   vec2 atlasUV=(tile*.999+clamp(uv*.5+.5,vec2(.021),vec2(.979)))/uChapterLandAtlasGrid;
   float stamp=texture2D(uChapterLandBrushAtlas,atlasUV).r;
   // Concentrate the deepest pigment in the transferred marks; keep sparse
   // dry nicks within the deposit instead of outlining each stroke in white.
   float ink=smoothstep(.15,.78,stamp)*box;
   float dry=smoothstep(.14,.35,stamp)*(1.-smoothstep(.42,.62,stamp))*box;
   return vec2(ink,dry);
 }
 float chapterFootprint(vec2 q, vec2 centre, vec2 span, float skew, float tooth) {
   vec2 p=q-centre;
   p.x-=p.y*skew;
   return 1.-smoothstep(.62,1.13,length(p/span)+tooth);
 }
`;

export const chapterValleyPaintGLSL = {
  mass: /* glsl */ `
    float chapterLoad=0.;
    float chapterGlaze=0.;
    float chapterNicks=0.;
    if (uChapterValleyPaint>.001&&uChapterLandBrushAvailable>.001) {
      vec3 land=vMountainPoint;
      vec2 q=land.xz;
      float tooth=.21*(seamCloud-.5)+.09*(stoneFiber-.5);
      float contact=smoothstep(.25,1.60,land.y);
      float depthGain=1.-.45*smoothstep(38.,111.,vLandscape.y);
      vec2 stamp=vec2(0.);
      if (uChapterValleyRole<1.5) {
        // Skew the two dry stamps along the actual bank, well below wings.
        vec2 east=chapterAtlasStroke(q,vec2(24.1,25.8),vec2(12.5,7.5),vec2(.461,.887),vec2(0.,1.));
        vec2 lower=chapterAtlasStroke(q,vec2(27.0,36.3),vec2(9.95,6.85),vec2(.711,.703),vec2(2.,0.));
        stamp=max(east,.89*lower)*contact*(1.-smoothstep(7.7,11.5,land.y));
        chapterGlaze=chapterFootprint(q,vec2(25.6,28.7),vec2(2.5,4.5),.48,tooth)
          *smoothstep(2.7,4.6,land.y)*(1.-smoothstep(7.5,10.7,land.y));
      } else if (uChapterValleyRole<2.5) {
        // A second ink cadence stays below the pale shoulder behind the actor.
        vec2 west=chapterAtlasStroke(q,vec2(-14.8,24.9),vec2(11.2,6.75),vec2(-.489,.872),vec2(1.,1.));
        vec2 farWest=chapterAtlasStroke(q,vec2(-21.2,33.),vec2(9.3,6.12),vec2(.579,.815),vec2(2.,1.));
        stamp=max(.82*west,.68*farWest)*contact*(1.-smoothstep(4.15,7.35,land.y));
        chapterGlaze=.88*chapterFootprint(q,vec2(-15.4,29.3),vec2(2.5,3.1),-.28,tooth)
          *smoothstep(1.0,2.2,land.y)*(1.-smoothstep(4.2,5.8,land.y));
      } else {
        // Paint one lower ridge flank. Preserve the recognizable summit and
        // the existing paper break through the middle of the face.
        vec2 cut=vec2(land.x+.23*(land.z-65.),land.y);
        stamp=.58*chapterAtlasStroke(cut,vec2(-30.6,8.8),vec2(8.4,5.7),vec2(-.711,.703),vec2(3.,1.));
        stamp*=smoothstep(1.4,3.0,land.y)*(1.-smoothstep(11.0,15.2,land.y))
          *smoothstep(51.,55.,land.z)*(1.-smoothstep(68.,75.,land.z));
        chapterGlaze=.72*chapterFootprint(cut,vec2(-33.,9.3),vec2(2.5,3.6),-.37,tooth);
      }
      float pressure=uChapterValleyPaint*depthGain;
      chapterGlaze*=pressure;
      chapterLoad=stamp.x*pressure;
      chapterNicks=stamp.y*pressure*smoothstep(.60,.83,stoneFiber);
      mass=max(mass,.98*chapterLoad*(1.-.46*chapterGlaze));
    }
  `,
  reserve: /* glsl */ `
    flyingWhite*=1.-.63*chapterLoad;
    paperReserve=mix(paperReserve,min(paperReserve,.16),.70*chapterLoad);
    paperReserve=max(paperReserve,.21*chapterNicks);
  `,
};

export function prepareChapterValleyPaint(mesh, material, weight, ink) {
  const role = valleyPaintRole(mesh);
  if (role === 0) return false;
  material.uniforms.uChapterValleyPaint = weight;
  material.uniforms.uChapterValleyRole = { value: role };
  material.uniforms.uChapterLandBrushAtlas = ink?.brushUniforms?.uBrushAtlas ?? { value: null };
  material.uniforms.uChapterLandAtlasGrid = ink?.brushUniforms?.uAtlasGrid ?? { value: { x: 4, y: 2 } };
  // Keep sharing InkWash's slots so asynchronous atlas installation remains
  // visible to terrain materials registered during chapter preparation.
  material.uniforms.uChapterLandBrushAvailable = ink?.brushUniforms?.uBrushMix ?? { value: 0 };
  material.fragmentShader = 'uniform float uChapterValleyPaint,uChapterValleyRole;\n' +
    material.fragmentShader.replace('void main() {', footprint + '\nvoid main() {');
  return true;
}

export function finishChapterValleyPaint(material) {
  // Only the existing bed pigments with a mineral mask are eligible for
  // a local glaze. Adjacent rocks keep their current palette parameters.
  material.fragmentShader = material.fragmentShader.replace(
    /vec4\(reflectance,paperReserve,(vMineralMask|mineralGlaze),1\.0\)/,
    (_, channel) => `vec4(reflectance,paperReserve,
      max(${channel}*(1.-.72*chapterLoad),.90*chapterGlaze),1.0)`,
  );
}
