import * as THREE from 'three';
import {SurfaceBrushLayer} from './surface-brush.js';
import {analyzeInkGeometry} from './geometry-analysis.js';
import {buildInkGuides} from './ink-guides.js';
import {createOcclusionProxy} from './occlusion-proxy.js';
import {FlowWashPass} from './flow-wash.js';
import {inkOutlineGLSL} from './ink-outlines.js';
import {inkMotionGLSL} from './ink-motion.js';
import {inkCompositionGLSL} from './ink-composition.js';
import {buildRidgeBands} from './ridge-bands.js';
import {dragonWashGLSL} from '../dragon-shape-wash.js';

// Object-space pigment: no object UVs, source albedo, or artwork colors.
const vertexShader = /* glsl */`
varying vec3 vPaint;
varying vec3 vNormal;
varying vec3 vFormNormal;
attribute vec3 inkGeometry;
varying vec3 vGeometry;
attribute vec2 inkGuides;
varying vec2 vGuides;
attribute float inkCurvature;
varying float vCurvature;
attribute float inkMacroOcclusion;
varying float vMacroOcclusion;
attribute float inkRidgeBand;
varying float vRidgeBand;
uniform vec3 uCenter;
uniform float uObjectScale;
void main() {
  vPaint = (position - uCenter) * uObjectScale;
  vNormal = normalize(normalMatrix * normal);
  vFormNormal=normal;
  vGeometry=inkGeometry;
  vGuides=inkGuides;
  vCurvature=inkCurvature;
  vMacroOcclusion=inkMacroOcclusion;
  vRidgeBand=inkRidgeBand;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const noise = /* glsl */`
float hash(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  return noise3(p) * .57 + noise3(p * 2.03 + 9.2) * .28 + noise3(p * 4.07 + 3.1) * .15;
}`;

const fragmentShader = /* glsl */`
varying vec3 vPaint;
varying vec3 vNormal;
varying vec3 vFormNormal;
varying vec3 vGeometry;
varying vec2 vGuides;
varying float vCurvature;
varying float vMacroOcclusion;
varying float vRidgeBand;
uniform vec3 uLightView;
uniform vec3 uFlow;
uniform float uDensity;
uniform float uDry;
uniform float uScale;
uniform float uGranulation;
uniform float uReserveStrength;
uniform float uWetness;
uniform float uRidgeReserve;
uniform vec2 uCurvatureRange;
uniform float uMacroInk;
uniform float uInkPooling;
uniform float uBaseWash;
uniform float uCoherentInk;
#if INK_GUIDE_COUNT > 0
uniform vec4 uGuideStart[INK_GUIDE_COUNT];
uniform vec4 uGuideEnd[INK_GUIDE_COUNT];
uniform vec2 uGuidePaint[INK_GUIDE_COUNT];
#endif
${noise}
${inkMotionGLSL}
${inkCompositionGLSL}
vec2 guideCoverage(vec3 p){
  vec2 guides=vec2(0.0);
  #if INK_GUIDE_COUNT > 0
  float ragged=(noise3(p*180.0+vec3(3.1,7.2,1.8))-.5)*(.10+uDry*.25);
  float fiber=noise3(p*420.0+vec3(1.3,8.1,5.5));
  float inkLoad=(.88+.12*noise3(p*42.0+vec3(4.7,2.2,8.1)))*(1.0-(1.0-fiber)*uDry*uGranulation*.35);
  for(int i=0;i<INK_GUIDE_COUNT;i++){
    vec3 edge=uGuideEnd[i].xyz-uGuideStart[i].xyz;
    float t=clamp(dot(p-uGuideStart[i].xyz,edge)/max(dot(edge,edge),.00000001),0.0,1.0);
    float radius=mix(uGuideStart[i].w,uGuideEnd[i].w,t);
    float distance=length(p-mix(uGuideStart[i].xyz,uGuideEnd[i].xyz,t))/max(radius,.000001);
    float coverage=(1.0-smoothstep(mix(.82,.45,uWetness),1.0,distance+ragged))*uGuidePaint[i].y*inkLoad;
    if(uGuidePaint[i].x<.5)guides.x=max(guides.x,coverage);else guides.y=max(guides.y,coverage);
  }
  #else
  guides=vGuides*(.80+.20*noise3(p*420.0+vec3(1.3,8.1,5.5)));
  #endif
  return guides;
}
${dragonWashGLSL}
void main() {
  applyDragonWash();
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 direction = normalize(uFlow);
  vec3 a = normalize(cross(direction, abs(direction.y) < .9 ? vec3(0,1,0) : vec3(1,0,0)));
  vec3 b = cross(direction, a);
  vec3 p = vec3(dot(vPaint,a), dot(vPaint,b), dot(vPaint,direction));
  vec3 q = p * uScale;
  vec3 formNormal=normalize(vFormNormal);
  vec3 paintNormal=vec3(dot(formNormal,a),dot(formNormal,b),dot(formNormal,direction));
  float wash = movingInkFbm(p,paintNormal,vec3(0,0,1),vec3(8.0,9.0,5.5)*uScale,vec3(2.7,8.3,1.9));
  float pooling = movingInkFbm(p,paintNormal,vec3(0,0,1),vec3(19.0)*uScale,vec3(12.3,4.1,7.8));
  float light = dot(n, normalize(uLightView)) * .5 + .5;
  // Ink is organized in object space; lighting only gently modulates it.
  float orientation=dot(normalize(vFormNormal),-normalize(uReserveDirection));
  float dorsal=mix(orientation*.5+.5,abs(orientation),uTwoSidedInk);
  float positionalMass=clamp(.5+dot(vPaint,uCompositionAxis)*1.3,0.0,1.0);
  dorsal=mix(positionalMass,dorsal,uNormalInfluence);
  float cavity=smoothstep(.015,.12,vGeometry.x);
  float ridge=smoothstep(.17,.32,vGeometry.y);
  float occlusion=smoothstep(.03,.62,vGeometry.z);
  float pigment=mix(uToneRange.x,uToneRange.y,pow(dorsal,1.05));
  pigment*=.88+.24*wash;
  pigment+=(cavity*uInkPooling+occlusion*.16-ridge*.19)*uGeometryInfluence;
  pigment+=smoothstep(.05,.55,vMacroOcclusion)*uMacroInk;
  float ridgePaper=max(smoothstep(uCurvatureRange.x,uCurvatureRange.y,vCurvature),vRidgeBand)*(1.0-smoothstep(.25,.85,vGeometry.z))*uRidgeReserve;
  pigment*=uBaseWash;
  if(uCoherentInk>.001){
    float mass=inkMassCoverage(inkMassAmount(vPaint,formNormal,direction,vGeometry));
    pigment+=uCoherentInk*mass*(.65+.35*wash)*uTonalContrast;
  }
  vec2 guides=guideCoverage(vPaint);
  pigment=mix(pigment,.90,clamp(guides.x,0.0,1.0));
  float reserveMask=clamp(guides.y,0.0,1.0);
  reserveMask=clamp(reserveMask+(wash-.5)*reserveMask*(1.0-reserveMask)*.8,0.0,1.0);
  pigment+=((1.0-light)-.5)*.035;
  pigment*=.94+.12*pooling;
  float bristle = fbm(q * vec3(155.0, 86.0, 15.0) + vec3(3,1,7));
  float broken = smoothstep(.46,.69,bristle + .14 * (wash - .5));
  // Flying-white changes pigment coverage, not the geometry or depth buffer.
  pigment *= 1.0 - broken * uDry * .20;
  float grain = noise3(q * 560.0);
  pigment *= 1.0 + (grain - .5) * uGranulation * .55;
  float reserve=smoothstep(.05,.85,dot(normalize(vFormNormal),normalize(uReserveDirection)));
  pigment *= 1.0-reserve*uReserveStrength;
  pigment = clamp(pigment * uDensity, 0.0, 1.6);
  float paperReserve=max(reserveMask*.96,ridgePaper);
  float reflectance=exp(-pigment*3.1);
  // R: reflectance, G: reserved paper, B: object-attached ink grain, A: coverage.
  gl_FragColor = vec4(reflectance,paperReserve,grain,1.0);
}`;

const postVertex = /* glsl */`
varying vec2 vUv;
void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
`;

const postFragment = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tGray;
uniform sampler2D tDepth;
uniform sampler2D tStrokes;
uniform vec2 uResolution;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform float uWet;
uniform float uEdge;
uniform float uPaper;
uniform float uNear;
uniform float uFar;
uniform float uCameraType;
uniform float uCompare;
uniform float uSplit;
uniform float uRaw;
uniform float uStrokeDecode;
${noise}
float linearDepth(vec2 uv) {
  float d = texture2D(tDepth,uv).r;
  return mix(uNear * uFar / (uFar - d * (uFar - uNear)), mix(uNear,uFar,d), uCameraType);
}
float reflectanceAt(vec4 c){return c.a>.00001?clamp(c.r/c.a,0.0,1.0):1.0;}
float pigmentAt(vec4 c) { return 1.0-reflectanceAt(c); }
float composedInk(vec4 c,vec2 strokes){
  float reserve=c.a>.00001?clamp(c.g/c.a,0.0,1.0):0.0;
  float optical=-log(max(reflectanceAt(c),.005));
  optical=max(0.0,optical+strokes.r*uStrokeDecode*.9-strokes.g*uStrokeDecode*1.4);
  // Distinct ink loads and bristle coverage are generated by each surface
  // brush. Preserve their internal variation through optical compositing.
  return (1.0-exp(-optical))*(1.0-reserve)*c.a;
}
${inkOutlineGLSL}
void main() {
  vec2 pixel = 1.0 / uResolution;
  vec2 paperUV = gl_FragCoord.xy;
  float fiber = fbm(vec3(paperUV * vec2(.044,.105),2.0));
  float fine = noise3(vec3(paperUV*.73,7.0));
  vec3 paper = uPaperColor * (1.0 + ((fiber-.5)*.065 + (fine-.5)*.035) * uPaper);
  vec2 ragged=vec2(noise3(vec3(paperUV*.12,1.7)),noise3(vec3(paperUV*.12,8.3)))-.5;
  vec2 paintUV=vUv+ragged*pixel*(.65+uWet*3.6);
  vec4 c = texture2D(tColor,paintUV);
  vec2 strokes=texture2D(tStrokes,paintUV).rg;
  float ink=composedInk(c,strokes);
  float blurInk = ink * 2.0;
  float minimumAlpha = c.a;
  float depth = linearDepth(paintUV);
  float crease = 0.0;
  float radius = .75 + uWet * 3.7;
  // Fixed kernel: cost is bounded, with no iterative fluid simulation.
  for (int i=0; i<8; i++) {
    float angle = float(i) * .78539816;
    vec2 offset = vec2(cos(angle),sin(angle));
    vec4 nearColor = texture2D(tColor, paintUV + offset * pixel * 1.2);
    vec4 wetColor = texture2D(tColor, paintUV + offset * pixel * radius);
    minimumAlpha = min(minimumAlpha, nearColor.a);
    float otherDepth = linearDepth(paintUV + offset * pixel * 1.4);
    // Suppress the smooth surface gradient, keep actual depth jumps.
    crease = max(crease, smoothstep(.018,.065,abs(depth-otherDepth)/max(depth,.01)) * nearColor.a * c.a);
    // Bleed cannot paint through a closer, different surface.
    float wetDepth = linearDepth(paintUV + offset * pixel * radius);
    float allowed = c.a < .1 ? 1.0 : 1.0 - smoothstep(.02,.09,abs(wetDepth-depth)/max(depth,.01));
    vec2 wetStrokes=texture2D(tStrokes,paintUV+offset*pixel*radius).rg;
    blurInk += composedInk(wetColor,wetStrokes)*allowed;
  }
  blurInk /= 10.0;
  float rim = c.a * (1.0 - minimumAlpha);
  float edgeInk = (rim * .29 + crease * .15) * uEdge * smoothstep(.27,.67,fiber)*smoothstep(.08,.65,ink);
  float spread = blurInk * (1.0-c.a) * uWet * .78;
  ink = mix(ink, max(ink,blurInk), uWet*.12) + edgeInk + spread;
  if(uOutline>.001&&uRaw<.5){
    float line=inkOutlineAt(paintUV,ink,fiber);
    ink=1.0-(1.0-clamp(ink,0.0,1.0))*(1.0-line);
  }
  ink = clamp(ink,0.0,1.0);
  vec3 color = mix(paper,uInkColor,ink);
  if(uRaw > .5) {vec4 raw=texture2D(tColor,vUv);color = mix(paper,raw.rgb/max(raw.a,.00001),raw.a);}
  if(uCompare > .5 && vUv.x < uSplit) {
    vec4 gray = texture2D(tGray,vUv);
    color = mix(paper,gray.rgb/max(gray.a,.00001),gray.a);
  }
  gl_FragColor=vec4(color,1.0);
  #include <colorspace_fragment>
}`;

export const INK_PRESETS = {
  expressive: {density:1.16,dry:.50,wet:.55,edge:.30,paper:.68,scale:1.0,brushMix:.85,washBase:.18,strokeStrength:1.4,coarseRatio:.06,tonalContrast:.95,tonalSoftness:.025,cun:.85,boneInk:.65},
  light: {density:.76,dry:.25,wet:.65,edge:.20,paper:.48,scale:.8,brushMix:.75,washBase:.18,strokeStrength:.55,coarseRatio:.045,tonalContrast:.65,tonalSoftness:.055,cun:.50,boneInk:.35},
  dry: {density:1.30,dry:.90,wet:.09,edge:.35,paper:.82,scale:1.28,brushMix:.85,washBase:.12,strokeStrength:1.6,coarseRatio:.04,tonalContrast:1,tonalSoftness:.015,cun:1,boneInk:.85},
};

function washNormalMaterial() {
  const material = new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
  const uniforms = {uDragonWash:{value:null},uDragonWashAxis:{value:null}};
  material.allowOverride = false;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader = dragonWashGLSL + shader.fragmentShader.replace('void main() {','void main() {\n  applyDragonWash();');
  };
  return {material,uniforms};
}

/** Surface ink fields and brush volumes; no reference artwork or source albedo. */
export class InkWashRenderer {
  constructor(renderer, parameters={}) {
    this.renderer=renderer;
    this.parameters={flow:0,brushMix:0,washBase:1,strokeStrength:1,coarseRatio:0,flowBlur:.7,flowInterval:1,flowEdge:.45,outline:0,outlineWidth:1.1,outlineDetail:.35,outlineBreak:.55,inkFlow:0,inkFlowSpeed:.75,...INK_PRESETS.expressive,...parameters};
    this.time=0;this.motionPaused=false;
    this.floatInk=renderer.extensions.has('EXT_color_buffer_float');
    this.strokeStorageScale=this.floatInk?1:.20;
    this.size=new THREE.Vector2(1,1);this.flowPass=null;
    this.sharedResources={};
    const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;this.fallbackBrush=white;
    this.brushUniforms={uBrushAtlas:{value:white},uAtlasGrid:{value:new THREE.Vector2(4,2)},uBrushMix:{value:0}};
    this.records=[];
    this.noShapeWash=new THREE.Vector2();
    this.noShapeWashAxis=new THREE.Vector3();
    this.lightDirection=new THREE.Vector3(.65,.75,.4).normalize();
    this.lightView=new THREE.Vector3();
    this.shared={
      uLightView:{value:this.lightView}, uDensity:{value:this.parameters.density},
      uDry:{value:this.parameters.dry},uScale:{value:this.parameters.scale},
      uGranulation:{value:this.parameters.paper},
      uWetness:{value:this.parameters.wet},
      uStrokeStrength:{value:this.parameters.strokeStrength},uCoarseRatio:{value:this.parameters.coarseRatio},
      uInkStorageScale:{value:this.strokeStorageScale},
      uTonalContrast:{value:this.parameters.tonalContrast},uTonalSoftness:{value:this.parameters.tonalSoftness},
      uInkTime:{value:0},uInkFlow:{value:this.parameters.inkFlow},
      uCun:{value:this.parameters.cun},uBoneInk:{value:this.parameters.boneInk},
    };
    const options={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true};
    this.target=new THREE.WebGLRenderTarget(1,1,options);
    this.target.samples=Math.min(4,renderer.capabilities.maxSamples);
    this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.grayTarget=new THREE.WebGLRenderTarget(1,1,options);
    this.grayTarget.samples=this.target.samples;
    this.normalTarget=new THREE.WebGLRenderTarget(1,1,options);this.normalTarget.samples=this.target.samples;
    this.normalMaterial=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
    this.washNormals=[washNormalMaterial(),washNormalMaterial()];
    this.strokeTarget=new THREE.WebGLRenderTarget(1,1,{...options,depthBuffer:false,type:this.floatInk?THREE.HalfFloatType:THREE.UnsignedByteType});
    this.strokeScene=new THREE.Scene();
    this.postMaterial=new THREE.ShaderMaterial({
      vertexShader:postVertex,fragmentShader:postFragment,depthTest:false,depthWrite:false,
      uniforms:{
        tColor:{value:this.target.texture},tGray:{value:this.grayTarget.texture},tDepth:{value:this.target.depthTexture},tStrokes:{value:this.strokeTarget.texture},
        uResolution:{value:new THREE.Vector2(1,1)},uPaperColor:{value:new THREE.Color('#f3f0e6')},
        uInkColor:{value:new THREE.Color('#101716')},uWet:{value:this.parameters.wet},uEdge:{value:this.parameters.edge},
        uPaper:{value:this.parameters.paper},uNear:{value:.01},uFar:{value:100},uCameraType:{value:0},
        uCompare:{value:0},uSplit:{value:.5},uRaw:{value:0},
        uStrokeDecode:{value:1/this.strokeStorageScale},
        tNormals:{value:this.normalTarget.texture},uOutline:{value:this.parameters.outline},uOutlineWidth:{value:this.parameters.outlineWidth*renderer.getPixelRatio()},uOutlineDetail:{value:this.parameters.outlineDetail},uOutlineBreak:{value:this.parameters.outlineBreak},
      },
    });
    this.postScene=new THREE.Scene();
    this.postCamera=new THREE.Camera();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.postMaterial);
    this.quad.frustumCulled=false;
    this.postScene.add(this.quad);
    this.grayMaterial=new THREE.MeshStandardMaterial({color:'#afb3b3',roughness:1,metalness:0,side:THREE.DoubleSide});
    this.savedClear=new THREE.Color();
  }

  register(root,options={}) {
    const defaults={flow:new THREE.Vector3(0,0,1),reserveDirection:new THREE.Vector3(0,-1,0),reserveStrength:0,toneRange:[.10,.65],geometryInfluence:1,strokes:true,twoSidedInk:false,ridgeReserve:0,ridgeWidth:0,liftStrength:1,coherentInk:0,strokeProfile:{},normalInfluence:1,compositionAxis:new THREE.Vector3(-1,0,0),macroInk:.30,inkPooling:.30,brushPaths:[],...options};
    const proxy=options.occlusionProxy===false?null:createOcclusionProxy(root);
    root.traverse(mesh=>{
      if(!mesh.isMesh || this.records.some(r=>r.mesh===mesh)) return;
      if(mesh.isSkinnedMesh || mesh.morphTargetInfluences?.length)
        throw new Error('当前模块用于静态网格；骨骼和形变模型需接入对应的顶点变形着色。');
      const {flow,reserveDirection,reserveStrength,toneRange,geometryInfluence,strokes,twoSidedInk,ridgeReserve,ridgeWidth,liftStrength,coherentInk,strokeProfile,normalInfluence,compositionAxis,macroInk,inkPooling,brushPaths}= {...defaults,...mesh.userData.inkProfile};
      const originalGeometry=mesh.geometry;mesh.geometry=originalGeometry.clone();
      if(!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals();
      let analysis;
      if(!strokes&&geometryInfluence===0&&!brushPaths.length){
        const attribute=new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*3),3);
        mesh.geometry.setAttribute('inkGeometry',attribute);mesh.geometry.setAttribute('inkCurvature',new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count),1));mesh.geometry.setAttribute('inkMacroOcclusion',new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count),1));analysis={attribute,curvatureRange:[0,1],milliseconds:0,raySamples:0};
      }else analysis=analyzeInkGeometry(mesh.geometry,proxy,proxy?proxy.inverse.clone().multiply(mesh.matrixWorld):null);
      buildRidgeBands(mesh.geometry,analysis,ridgeWidth);
      mesh.geometry.computeBoundingBox();
      const center=mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
      const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3());
      const guideReport=buildInkGuides(mesh.geometry,brushPaths,analysis);
      const objectSize=Math.max(size.x,size.y,size.z,.0001),segments=guideReport?.gpuSegments||[];
      const guideVector=p=>new THREE.Vector4((p[0]-center.x)/objectSize,(p[1]-center.y)/objectSize,(p[2]-center.z)/objectSize,p[3]/objectSize);
      const reserve={uReserveDirection:{value:reserveDirection.clone()},uReserveStrength:{value:THREE.MathUtils.clamp(reserveStrength,0,1)}};
      const composition={uNormalInfluence:{value:THREE.MathUtils.clamp(normalInfluence,0,1)},uCompositionAxis:{value:compositionAxis.clone().normalize()}};
      const material=new THREE.ShaderMaterial({
        defines:{INK_GUIDE_COUNT:segments.length},
        uniforms:{...this.shared,...reserve,...composition,uCoherentInk:{value:coherentInk},uBaseWash:{value:strokes?this.parameters.washBase:1},uCenter:{value:center},uObjectScale:{value:1/objectSize},uFlow:{value:flow.clone()},uToneRange:{value:new THREE.Vector2(...toneRange)},uGeometryInfluence:{value:geometryInfluence},uTwoSidedInk:{value:Number(twoSidedInk)},uRidgeReserve:{value:ridgeReserve},uMacroInk:{value:macroInk},uInkPooling:{value:inkPooling},uCurvatureRange:{value:new THREE.Vector2(...analysis.curvatureRange)},uGuideStart:{value:segments.map(s=>guideVector(s.a))},uGuideEnd:{value:segments.map(s=>guideVector(s.b))},uGuidePaint:{value:segments.map(s=>new THREE.Vector2(s.kind,s.amount))}},
        vertexShader,fragmentShader,side:THREE.DoubleSide,
      });
      material.uniforms.uDragonWash={value:this.noShapeWash};
      material.uniforms.uDragonWashAxis={value:this.noShapeWashAxis};
      const brush=strokes?new SurfaceBrushLayer(mesh,{shared:{...this.shared,...reserve,...composition,...this.brushUniforms,uFlow:{value:flow.clone()},uCenter:{value:center},uObjectScale:{value:1/objectSize},uToneRange:{value:new THREE.Vector2(...toneRange)},uTwoSidedInk:{value:Number(twoSidedInk)},uGeometryInfluence:{value:geometryInfluence},uLiftStrength:{value:liftStrength}},noise,flow,analysis,objectSize:Math.max(size.x,size.y,size.z,.0001),strokeProfile}):null;
      if(brush)this.strokeScene.add(brush.mesh);
      this.records.push({mesh,material,brush,analysis,guideReport,original:mesh.material,originalGeometry,usesSurfaceStrokes:strokes});
    });
    proxy?.geometry.dispose();
  }

  unregister(root) {
    const meshes=new Set();root.traverse(node=>meshes.add(node));
    this.records=this.records.filter(record=>{
      if(!meshes.has(record.mesh))return true;
      record.mesh.material=record.original;record.mesh.geometry.dispose();record.mesh.geometry=record.originalGeometry;record.material.dispose();if(record.brush){this.strokeScene.remove(record.brush.mesh);record.brush.dispose();}return false;
    });
  }

  configure(values) {
    for(const key of ['density','dry','wet','edge','paper','scale','flow','brushMix','washBase','strokeStrength','coarseRatio','flowBlur','flowInterval','flowEdge','outline','outlineWidth','outlineDetail','outlineBreak','tonalContrast','tonalSoftness','inkFlow','inkFlowSpeed','cun','boneInk']) {
      if(Number.isFinite(values[key])) this.parameters[key]=values[key];
    }
    const p=this.parameters,u=this.postMaterial.uniforms;
    this.shared.uDensity.value=p.density;this.shared.uDry.value=p.dry;
    this.shared.uScale.value=p.scale;this.shared.uGranulation.value=p.paper;
    this.shared.uWetness.value=p.wet;
    this.brushUniforms.uBrushMix.value=this.sharedResources.brushAtlas?p.brushMix:0;
    this.shared.uStrokeStrength.value=p.strokeStrength;this.shared.uCoarseRatio.value=p.coarseRatio;
    this.shared.uTonalContrast.value=p.tonalContrast;this.shared.uTonalSoftness.value=p.tonalSoftness;
    this.shared.uInkFlow.value=THREE.MathUtils.clamp(p.inkFlow,0,1);
    this.shared.uCun.value=THREE.MathUtils.clamp(p.cun,0,1);this.shared.uBoneInk.value=THREE.MathUtils.clamp(p.boneInk,0,1);
    for(const record of this.records)record.material.uniforms.uBaseWash.value=record.usesSurfaceStrokes?p.washBase:1;
    u.uWet.value=p.wet;u.uEdge.value=p.edge;u.uPaper.value=p.paper;
    u.uOutline.value=p.outline;u.uOutlineWidth.value=p.outlineWidth*this.renderer.getPixelRatio();u.uOutlineDetail.value=p.outlineDetail;u.uOutlineBreak.value=p.outlineBreak;
  }

  setTime(seconds){
    if(Number.isFinite(seconds)){this.time=Math.max(0,seconds);this.shared.uInkTime.value=this.time;}
  }

  advance(deltaSeconds){
    if(!this.motionPaused&&this.parameters.inkFlow>0&&Number.isFinite(deltaSeconds))
      this.setTime(this.time+Math.max(0,deltaSeconds)*Math.max(0,this.parameters.inkFlowSpeed));
  }

  setMotionPaused(paused){this.motionPaused=Boolean(paused);}

  setSharedResources(resources){
    this.sharedResources=resources;
    this.brushUniforms.uBrushAtlas.value=resources.brushAtlas??this.fallbackBrush;
    if(resources.atlasGrid)this.brushUniforms.uAtlasGrid.value.copy(resources.atlasGrid);
    this.brushUniforms.uBrushMix.value=resources.brushAtlas?this.parameters.brushMix:0;
    if(this.flowPass&&resources.flowNoise)this.flowPass.setNoise(resources.flowNoise);
  }

  setSize(width,height) {
    this.size.set(width,height);this.flowPass?.setSize(width,height);
    this.target.setSize(width,height);this.grayTarget.setSize(width,height);this.strokeTarget.setSize(width,height);this.normalTarget.setSize(width,height);
    this.postMaterial.uniforms.uResolution.value.set(width,height);
    this.postMaterial.uniforms.uOutlineWidth.value=this.parameters.outlineWidth*this.renderer.getPixelRatio();
  }

  render(scene,camera,{mode='ink',split=.5}={}) {
    const r=this.renderer, u=this.postMaterial.uniforms;
    const oldTarget=r.getRenderTarget(),oldAlpha=r.getClearAlpha(),oldAutoClear=r.autoClear,oldAutoReset=r.info.autoReset;
    r.getClearColor(this.savedClear);
    const oldBackground=scene.background;
    scene.background=null;r.autoClear=true;r.setClearColor(0,0);r.info.autoReset=false;r.info.reset();
    camera.updateMatrixWorld();
    this.lightView.copy(this.lightDirection).transformDirection(camera.matrixWorldInverse);
    u.uNear.value=camera.near;u.uFar.value=camera.far;
    u.uCameraType.value=camera.isOrthographicCamera?1:0;
    u.uCompare.value=mode==='compare'?1:0;u.uSplit.value=split;u.uRaw.value=mode==='gray'?1:0;
    try {
      if(mode==='compare') {
        for(const record of this.records) record.mesh.material=this.grayMaterial;
        r.setRenderTarget(this.grayTarget);r.render(scene,camera);
      }
      for(const record of this.records){
        record.material.uniforms.uDragonWash.value=record.mesh.userData.dragonWash??this.noShapeWash;
        record.material.uniforms.uDragonWashAxis.value=record.mesh.userData.dragonWashAxis??this.noShapeWashAxis;
        record.mesh.material=mode==='gray'?this.grayMaterial:record.material;
      }
      r.setRenderTarget(this.target);r.render(scene,camera);
      if(this.parameters.outline>.001&&this.parameters.outlineDetail>.001&&mode!=='gray'){
        const previousOverride=scene.overrideMaterial;
        const washed=[];
        try{
          for(const record of this.records){
            const {dragonWash,dragonWashAxis}=record.mesh.userData;
            if(!dragonWash)continue;
            const normal=this.washNormals[dragonWash.y>0?1:0];
            normal.uniforms.uDragonWash.value=dragonWash;
            normal.uniforms.uDragonWashAxis.value=dragonWashAxis;
            record.mesh.material=normal.material;
            washed.push(record);
          }
          scene.overrideMaterial=this.normalMaterial;r.setRenderTarget(this.normalTarget);r.render(scene,camera);
        }finally{
          scene.overrideMaterial=previousOverride;
          for(const record of washed)record.mesh.material=record.material;
        }
      }
      r.setRenderTarget(this.strokeTarget);r.setClearColor(0,1);r.clear();
      if(mode!=='gray'){
        for(const record of this.records)record.brush?.update(camera,this.target.depthTexture,this.target.width,this.target.height);
        const previous=r.autoClear;r.autoClear=false;r.render(this.strokeScene,camera);r.autoClear=previous;
      }
      if(this.parameters.flow>0&&mode!=='gray'){
        if(!this.flowPass){this.flowPass=new FlowWashPass();this.flowPass.setSize(this.size.x,this.size.y);if(this.sharedResources.flowNoise)this.flowPass.setNoise(this.sharedResources.flowNoise);}
        const fu=this.flowPass.material.uniforms;fu.uBlurWidth.value=this.parameters.flowBlur;fu.uInterval.value=this.parameters.flowInterval;fu.uEdgeStrength.value=this.parameters.flowEdge;fu.uSplit.value=mode==='compare'?split:0;
        r.setRenderTarget(this.flowPass.target);r.render(this.postScene,this.postCamera);this.flowPass.render(r,oldTarget,this.parameters.flow);
      }else{r.setRenderTarget(oldTarget);r.render(this.postScene,this.postCamera);}
      this.stats={drawCalls:r.info.render.calls,triangles:r.info.render.triangles};
    } finally {
      for(const record of this.records) record.mesh.material=record.original;
      scene.background=oldBackground;r.setRenderTarget(oldTarget);
      r.setClearColor(this.savedClear,oldAlpha);r.autoClear=oldAutoClear;r.info.autoReset=oldAutoReset;
    }
  }

  dispose() {
    for(const r of this.records){r.mesh.material=r.original;r.mesh.geometry.dispose();r.mesh.geometry=r.originalGeometry;r.material.dispose();r.brush?.dispose();}
    this.records.length=0;this.target.dispose();this.grayTarget.dispose();this.strokeTarget.dispose();this.normalTarget.dispose();this.normalMaterial.dispose();
    for(const normal of this.washNormals)normal.material.dispose();
    this.grayMaterial.dispose();this.quad.geometry.dispose();this.postMaterial.dispose();
    this.flowPass?.dispose();
    this.fallbackBrush.dispose();
  }
}
