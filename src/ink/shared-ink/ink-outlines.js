// Geometry-derived ink contours. No albedo edges are traced, so brush grain
// does not turn into a dense wire drawing. Width is supplied in screen pixels.
export const inkOutlineGLSL=/* glsl */`
uniform sampler2D tNormals;
uniform float uOutline;
uniform float uOutlineWidth;
uniform float uOutlineDetail;
uniform float uOutlineBreak;
vec3 outlineNormal(vec2 uv){
  vec4 encoded=texture2D(tNormals,uv);
  return encoded.a>.01?normalize(encoded.rgb/encoded.a*2.0-1.0):vec3(0,0,1);
}
float inkOutlineAt(vec2 uv,float centerInk,float fiber){
  vec2 pixel=1.0/uResolution;
  vec4 center=texture2D(tColor,uv);
  float low=center.a,high=center.a,internal=0.0;
  float centerDepth=linearDepth(uv),mass=centerInk;
  vec3 normal=vec3(0,0,1);
  if(uOutlineDetail>.001&&center.a>.5)normal=outlineNormal(uv);
  for(int i=0;i<8;i++){
    float angle=float(i)*.78539816;
    vec2 q=uv+vec2(cos(angle),sin(angle))*pixel*uOutlineWidth;
    vec4 other=texture2D(tColor,q);
    low=min(low,other.a);high=max(high,other.a);
    mass=max(mass,pigmentAt(other)*other.a);
    if(uOutlineDetail>.001&&min(center.a,other.a)>.5){
      float normalEdge=smoothstep(.22,.58,length(normal-outlineNormal(q)));
      float depthEdge=smoothstep(.012,.045,abs(centerDepth-linearDepth(q))/max(centerDepth,.01));
      internal=max(internal,max(normalEdge,depthEdge));
    }
  }
  float silhouette=smoothstep(.03,.80,high-low);
  float line=max(silhouette,internal*uOutlineDetail);
  float broken=mix(1.0,.25+.75*smoothstep(.30,.64,fiber),uOutlineBreak);
  // A clear paper or water silhouette has no pigment to pool at its edge.
  float pressure=smoothstep(.018,.36,mass) * (.52+.48*smoothstep(.12,.77,mass));
  return clamp(line*uOutline*broken*pressure,0.0,.95);
}
`;
