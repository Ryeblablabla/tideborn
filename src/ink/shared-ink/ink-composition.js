// Shared macro composition for the wash and individual surface brushes.
// An object's broad ink masses must agree before small brush marks are added.
export const inkCompositionGLSL=/* glsl */`
uniform vec3 uReserveDirection;
uniform vec2 uToneRange;
uniform float uGeometryInfluence;
uniform float uTwoSidedInk;
uniform float uNormalInfluence;
uniform vec3 uCompositionAxis;
uniform float uTonalContrast;
uniform float uTonalSoftness;
float inkMassAmount(vec3 p,vec3 normal,vec3 preferred,vec3 features,float flowing){
  float orientation=dot(normalize(normal),-normalize(uReserveDirection));
  float dorsal=mix(orientation*.5+.5,abs(orientation),uTwoSidedInk);
  float positionalMass=clamp(.5+dot(p,uCompositionAxis)*1.3,0.0,1.0);
  dorsal=mix(positionalMass,dorsal,uNormalInfluence);
  float field=mix(uToneRange.x,uToneRange.y,pow(dorsal,1.1));
  field+=(features.z*.12+clamp(features.x/.12,0.0,1.0)*.16)*uGeometryInfluence;
  float massNoise=flowing>.5?movingInkFbm(p,normalize(normal),normalize(preferred),vec3(5,8,5),vec3(2.7,8.3,1.9)):fbm(p*vec3(5,8,5)+vec3(2.7,8.3,1.9));
  return field+(massNoise-.5)*.52;
}
float inkMassAmount(vec3 p,vec3 normal,vec3 preferred,vec3 features){return inkMassAmount(p,normal,preferred,features,1.0);}
float inkMassCoverage(float amount){
  float transition=max(.015,uTonalSoftness);
  return smoothstep(.30-transition,.44+transition,amount);
}
`;
