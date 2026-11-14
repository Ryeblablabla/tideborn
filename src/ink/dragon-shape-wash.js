// A shared cutout between the colour and surface-ID passes. Complementary
// masks let the ink of the former shape give way to the next at the same depth.
export const dragonWashGLSL = /* glsl */ `
uniform vec2 uDragonWash;
uniform vec3 uDragonWashAxis;
float dragonWashBleed;
float dragonGrain(vec2 p) {
  vec3 v=fract(vec3(p.xyx)*.1031);
  v+=dot(v,v.yzx+33.33);
  return fract((v.x+v.y)*v.z);
}
void applyDragonWash(){
  dragonWashBleed=0.;
  if(abs(uDragonWash.y)<.5)return;
  float along=clamp(dot(gl_FragCoord.xy,uDragonWashAxis.xy)+uDragonWashAxis.z,0.,1.);
  float direction=sign(uDragonWash.y);
  if(abs(uDragonWash.y)>1.5){
    // A single wet edge carries down the dragon. Curving across the spine
    // leaves a coherent head and neck as their silhouette changes.
    vec2 across=vec2(-uDragonWashAxis.y,uDragonWashAxis.x);
    float brush=dot(gl_FragCoord.xy,across)*9.;
    float sweep=uDragonWash.x;
    float curl=.060*sin(brush+sweep*2.4)+.022*sin(brush*2.7-sweep*3.1);
    float edge=clamp(.11+.78*along+curl,.045,.955);
    float overlap=.055*smoothstep(.02,.14,sweep)*(1.-smoothstep(.86,.98,sweep));
    if(abs(uDragonWash.y)>2.5){
      // The rear settles inside the mist while the nose and wing roots
      // retain their own slow wet edge. Both forms agree on ownership here.
      float rear=smoothstep(.49,.76,along-.014*sin(brush*.67));
      edge=mix(edge,.035+curl*.17,rear);
      overlap*=1.-rear;
    }
    float distance=(edge-sweep)*direction;
    if(distance>overlap)discard;
    // Both halves briefly share the darkest part of the brush, preventing
    // a pale stripe when one painted surface gives way to the other.
    float endFade=smoothstep(.05,.20,sweep)*(1.-smoothstep(.80,.96,sweep));
    dragonWashBleed=(1.-smoothstep(.006,.113,abs(distance)))*endFade;
    return;
  }
  vec2 p=gl_FragCoord.xy*.22;
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  float pool=mix(mix(dragonGrain(i),dragonGrain(i+vec2(1,0)),f.x),
                 mix(dragonGrain(i+vec2(0,1)),dragonGrain(i+vec2(1,1)),f.x),f.y);
  float grain=dragonGrain(floor(gl_FragCoord.xy))-.5;
  float wash=clamp(.11+.78*along+.15*(pool-.5)+.052*grain,.015,.985);
  if((wash-uDragonWash.x)*direction>0.)discard;
}
`;
