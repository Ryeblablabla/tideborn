import { MathUtils } from 'three';

// The same travelling front is sampled at sea level and by rays into the
// low cloud bank. Its world coordinates do not follow the camera or dragon.
export const seaWind = Object.freeze({
  x:.500, z:-.866, acrossX:.866, acrossZ:.500,
  speed:2.65, origin:54, spacing:158,
});
const {x,z,acrossX,acrossZ,speed,origin,spacing}=seaWind;

export const weatherGLSL = /* glsl */ `
  const vec2 seaWindAxis=vec2(${x.toFixed(3)},${z.toFixed(3)});
  const vec2 seaWindAcross=vec2(${acrossX.toFixed(3)},${acrossZ.toFixed(3)});
  vec3 seaFront(vec2 p,float time) {
    float across=dot(p,seaWindAcross);
    float bend=12.4*sin(across*.027+.46)+4.2*sin(across*.067-.48);
    float d=dot(p,seaWindAxis)-time*${speed}+${origin.toFixed(1)}+bend;
    d=mod(d+${(spacing/2).toFixed(1)},${spacing.toFixed(1)})-${(spacing/2).toFixed(1)};
    float span=1.-smoothstep(13.,65.,abs(across-39.+8.*sin(d*.029)));
    float leading=1.-smoothstep(4.,24.,abs(d));
    float echo=.34*(1.-smoothstep(3.,15.,abs(d+33.)));
    return vec3(d,across,max(leading,echo)*(.24+.76*span));
  }
  vec4 offshoreSections(vec3 front) {
    float s=front.y;
    float lead=front.x+3.1*sin(s*.053+.43)+1.7*sin(s*.107-.8);
    float echo=front.x+31.+4.5*sin(s*.058-.37);
    float mainSpan=1.-smoothstep(16.,66.,abs(s-41.));
    float split=(s-61.)*.071;
    float torn=1.-.69*exp(-split*split);
    float tailSpan=1.-smoothstep(9.,49.,abs(s-13.));
    return vec4(lead,echo,mainSpan*torn,.34*tailSpan);
  }
  float offshoreRidge(float d,float backWidth,float faceWidth) {
    float q=d/mix(backWidth,faceWidth,step(0.,d));
    return exp(-q*q);
  }
`;

export function sampleSeaFront(px,pz,time,out) {
  const side=px*acrossX+pz*acrossZ;
  const a=side*.027+.46,b=side*.067-.48;
  const bend=12.4*Math.sin(a)+4.2*Math.sin(b);
  const turn=12.4*.027*Math.cos(a)+4.2*.067*Math.cos(b);
  const travel=px*x+pz*z-time*speed+origin+bend;
  const d=travel-Math.floor((travel+spacing/2)/spacing)*spacing;
  const span=1-MathUtils.smoothstep(Math.abs(side-39+8*Math.sin(d*.029)),13,65);
  const leading=1-MathUtils.smoothstep(Math.abs(d),4,24);
  const echo=.34*(1-MathUtils.smoothstep(Math.abs(d+33),3,15));
  out.distance=d;
  out.across=side;
  out.pressure=Math.max(leading,echo)*(.24+.76*span);
  out.gradientX=x+turn*acrossX;
  out.gradientZ=z+turn*acrossZ;
  return out;
}

export function sampleOffshore(front,out) {
  const s=front.across;
  const lead=front.distance+3.1*Math.sin(s*.053+.43)+1.7*Math.sin(s*.107-.8);
  const echo=front.distance+31+4.5*Math.sin(s*.058-.37);
  const split=(s-61)*.071;
  const main=(1-MathUtils.smoothstep(Math.abs(s-41),16,66))*(1-.69*Math.exp(-split*split));
  const tail=.34*(1-MathUtils.smoothstep(Math.abs(s-13),9,49));
  const mainWidth=lead<0?10.4:4.7;
  const echoWidth=echo<0?12.1:6.3;
  const frontRatio=lead/mainWidth,echoRatio=echo/echoWidth,troughRatio=(lead-6.4)/6.2;
  const mainRidge=Math.exp(-frontRatio*frontRatio)*main;
  const tailRidge=Math.exp(-echoRatio*echoRatio)*tail;
  const trough=Math.exp(-troughRatio*troughRatio)*main;
  out.height=1.16*mainRidge+.94*tailRidge-.28*trough;
  out.slopeAlong=-2.32*mainRidge*lead/mainWidth**2-1.88*tailRidge*echo/echoWidth**2+
    .56*trough*(lead-6.4)/6.2**2;
  return out;
}
