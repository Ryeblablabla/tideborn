// A shared cutout between the colour and surface-ID passes. Complementary
// masks let the ink of the former shape give way to the next at the same depth.
export const dragonWashGLSL = /* glsl */ `
uniform vec2 uDragonWash;
uniform vec3 uDragonWashAxis;
float dragonGrain(vec2 p) {
  vec3 v=fract(vec3(p.xyx)*.1031);
  v+=dot(v,v.yzx+33.33);
  return fract((v.x+v.y)*v.z);
}
void applyDragonWash(){
  if(abs(uDragonWash.y)<.5)return;
  vec2 p=gl_FragCoord.xy*.22;
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  float pool=mix(mix(dragonGrain(i),dragonGrain(i+vec2(1,0)),f.x),
                 mix(dragonGrain(i+vec2(0,1)),dragonGrain(i+vec2(1,1)),f.x),f.y);
  float along=clamp(dot(gl_FragCoord.xy,uDragonWashAxis.xy)+uDragonWashAxis.z,0.,1.);
  float wash=clamp(.11+.78*along+.15*(pool-.5)+.052*(dragonGrain(floor(gl_FragCoord.xy))-.5),.015,.985);
  if((wash-uDragonWash.x)*uDragonWash.y>0.)discard;
}
`;
