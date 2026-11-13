import * as THREE from 'three';

// Gradient-flow watercolor processing adapted from Keijiro Takahashi's
// KinoAqua (Unlicense), inspired by Florian Berger / flockaroo.
// Input is the current live ink framebuffer, never the reference artwork.
const vertex=/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const fragment=/* glsl */`
varying vec2 vUv;
uniform sampler2D tInput;
uniform sampler2D tNoise;
uniform float uAspect;
uniform float uAmount;
uniform float uBlurWidth;
uniform float uBlurFrequency;
uniform float uInterval;
uniform float uEdgeContrast;
uniform float uEdgeStrength;
uniform vec3 uInkColor;
uniform float uSplit;
vec2 toScreen(vec2 uv){vec2 p=uv-.5;p.x*=uAspect;return p;}
vec2 toUV(vec2 p){p.x/=uAspect;return p+.5;}
vec3 sampleColor(vec2 p){return texture2D(tInput,clamp(toUV(p),vec2(0.0),vec2(1.0))).rgb;}
float luminance(vec2 p){return dot(sampleColor(p),vec3(.2126,.7152,.0722));}
vec3 sampleNoise(vec2 p){return texture2D(tNoise,p).rgb;}
vec2 gradient(vec2 p,float frequency){
  vec2 dx=vec2(uInterval/200.0,0.0);
  vec2 g=vec2(luminance(p+dx.xy)-luminance(p-dx.xy),luminance(p+dx.yx)-luminance(p-dx.yx));
  return g+(sampleNoise(p*.4*frequency).gb-.5)*.05;
}
vec2 direction(vec2 v){return v/max(length(v),.00001);}
float edgeStep(inout vec2 p,float stride){
  vec2 g=gradient(p,1.0);float edge=clamp(length(g)*10.0,0.0,1.0),pattern=sampleNoise(p*.8).r;
  p+=direction(vec2(-g.y,g.x))*stride;return pattern*edge;
}
vec3 fillStep(inout vec2 p,float stride){p+=direction(gradient(p,uBlurFrequency))*stride;return sampleColor(p);}
void main(){
  vec2 origin=toScreen(vUv),en=origin,ep=origin,cn=origin,cp=origin;
  float edges=0.0,edgeWeights=0.0,colorWeights=0.0;vec3 colors=vec3(0.0);
  const float stride=.04/6.0;
  for(int i=0;i<6;i++){
    float t=float(i)/6.0,we=1.5-t,wc=.2+t;
    edges+=(edgeStep(en,-stride)+edgeStep(ep,stride))*we;edgeWeights+=we*2.0;
    colors+=(fillStep(cn,-stride*uBlurWidth)+fillStep(cp,stride*uBlurWidth)*.3)*wc;colorWeights+=wc*1.3;
  }
  edges=clamp((edges/edgeWeights-.5)*uEdgeContrast+.5,0.0,1.0);
  vec3 processed=mix(vec3(1.0),uInkColor,uEdgeStrength*edges)*(colors/colorWeights);
  vec3 original=texture2D(tInput,vUv).rgb;
  gl_FragColor=vec4(vUv.x<uSplit?original:mix(original,processed,uAmount),1.0);
  #include <colorspace_fragment>
}`;

function fallbackNoise(){
  const size=128,data=new Uint8Array(size*size*4);
  const hash=(x,y,seed)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  function value(x,y,period,seed){
    const px=x/size*period,py=y/size*period,ix=Math.floor(px),iy=Math.floor(py);let fx=px-ix,fy=py-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    const h=(dx,dy)=>hash((ix+dx)%period,(iy+dy)%period,seed);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(0,0),h(1,0),fx),THREE.MathUtils.lerp(h(0,1),h(1,1),fx),fy);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    for(let c=0;c<3;c++)data[(y*size+x)*4+c]=Math.round(255*(value(x,y,4,c*331+17)*.35+value(x,y,8,c*731+29)*.30+value(x,y,16,c*919+37)*.22+value(x,y,32,c*127+41)*.13));
    data[(y*size+x)*4+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
  texture.userData.inkResourceKind='generated-flow-noise';return texture;
}

export class FlowWashPass{
  constructor(){
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    this.noise=fallbackNoise();
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,uniforms:{
      tInput:{value:this.target.texture},tNoise:{value:this.noise},uAspect:{value:1},uAmount:{value:0},uBlurWidth:{value:.7},uBlurFrequency:{value:.5},uInterval:{value:1},uEdgeContrast:{value:1.2},uEdgeStrength:{value:.45},uInkColor:{value:new THREE.Color('#182025')},uSplit:{value:0},
    }});
    this.scene=new THREE.Scene();this.camera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
  }
  setSize(width,height){this.target.setSize(width,height);this.material.uniforms.uAspect.value=width/height;}
  setNoise(texture){this.material.uniforms.tNoise.value=texture;}
  render(renderer,target,amount){this.material.uniforms.uAmount.value=amount;renderer.setRenderTarget(target);renderer.render(this.scene,this.camera);}
  dispose(){this.target.dispose();this.noise.dispose();this.material.dispose();this.quad.geometry.dispose();}
}
