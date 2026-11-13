import * as THREE from 'three';

const sampleCount = 36;
const firstZ = -84;
const lastZ = 156;
const step = (lastZ-firstZ)/(sampleCount-1);

export const mountainRiverGLSL = /* glsl */ `
  uniform float uMountainCourseReady;
  uniform vec2 uMountainCourse[${sampleCount}];
  vec2 mountainWater(vec2 p, float paperWash, float time) {
    float s=clamp((p.y-(${firstZ.toFixed(1)}))/${step.toFixed(8)},0.,${(sampleCount-1).toFixed(1)});
    int index=min(int(s),${sampleCount-2});
    vec2 bend=mix(uMountainCourse[index],uMountainCourse[index+1],s-float(index));
    float across=(p.x-bend.x)/max(1.,bend.y);
    float fromCenter=abs(across);
    float fleck=washNoise(vec2(p.y*.145-time*.075,across*7.1+4.));
    float dry=inkNoise(vec2(p.y*.34-time*.15,across*33.));
    float outer=smoothstep(.33,.97,fromCenter);
    // Keep the water's winding core open, with long broken marks running
    // around the actual bends instead of across the valley.
    float wetShoulder=(.028+.103*outer)*(.45+.55*paperWash);
    float line=across*10.8 + .42*sin(p.y*.073)+.39*fleck;
    float fibers=1.-smoothstep(.019,.076+fwidth(line)*.55,abs(sin(line)));
    float streak=smoothstep(.53,.76,fleck)*smoothstep(.26,.62,dry);
    float current=fibers*streak*(.018+.10*outer);
    float stain=inkNoise(vec2(p.y*.177+2.35,sign(across)*1.61));
    float bank=smoothstep(.72,1.0,fromCenter)*(.029+.10*smoothstep(.31,.72,stain));
    float white=fibers*smoothstep(.68,.91,dry)*streak*.08
      *(1.-.87*smoothstep(.47,.88,fromCenter));
    return vec2(wetShoulder+current+bank,white);
  }
`;

export function mountainRiverUniforms() {
  return {
    uMountainCourseReady:{value:0},
    uMountainCourse:{value:Array.from({length:sampleCount},()=>new THREE.Vector2(0,1))},
  };
}

/** Use the same river course as the mountains, sampled in world coordinates. */
export function applyMountainRiver(water, river) {
  if (typeof river !== 'function' || water.userData.mountainCourse === river) return;
  const uniforms=water.material.uniforms;
  uniforms.uMountainCourse.value.forEach((point,i)=>{
    const section=river(firstZ+i*step);
    point.set(section.x,section.halfWidth);
  });
  uniforms.uMountainCourseReady.value=1;
  water.userData.mountainCourse=river;
}
