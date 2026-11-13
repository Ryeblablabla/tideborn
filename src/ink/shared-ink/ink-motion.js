// Two staggered advection phases prevent an ever-stretching or abruptly
// resetting pattern. The vector field lives on the model, not on the screen.
// This is procedural material motion, not a fluid-volume simulation.
export const inkMotionGLSL=/* glsl */`
uniform float uInkTime;
uniform float uInkFlow;
vec3 inkPhases(vec3 p){
  float phase=fract(uInkTime*.12+noise3(p*3.0+vec3(7.1,2.3,4.7))*.23);
  return vec3(phase,fract(phase+.5),1.0-abs(phase*2.0-1.0));
}
vec3 inkFlowPoint(vec3 p,vec3 normal,vec3 preferred,float phase){
  vec3 n=normalize(normal);
  vec3 tangent=preferred-n*dot(preferred,n);
  vec3 curl=cross(n,vec3(sin(p.y*11.0+1.7),cos(p.z*9.0+3.1),sin(p.x*10.0+2.4)));
  vec3 velocity=tangent*.8+curl*.32;
  velocity/=max(length(velocity),.25);
  return p-velocity*(phase-.5)*uInkFlow*.28;
}
float movingInkFbm(vec3 p,vec3 normal,vec3 preferred,vec3 frequency,vec3 offset){
  if(uInkFlow<.0001)return fbm(p*frequency+offset);
  vec3 phases=inkPhases(p);
  float a=fbm(inkFlowPoint(p,normal,preferred,phases.x)*frequency+offset);
  float b=fbm(inkFlowPoint(p,normal,preferred,phases.y)*frequency+offset);
  return mix(b,a,phases.z);
}
`;
