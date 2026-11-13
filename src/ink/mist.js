import * as THREE from 'three';
import { mountainRiver } from './landforms.js';

const valleySlices=24;
const valleyFirstZ=-67;
const valleyLastZ=144;
const valleyStep=(valleyLastZ-valleyFirstZ)/(valleySlices-1);

/** Stage mist samples world space only up to the actual visible surface. */
export class ValleyMist {
  constructor(ink) {
    const material = ink.postMaterial;
    this.uniforms = {
      uMistStage: { value: 0 },
      uTrialCloud: { value: 0 },
      uMistTime: { value: 0 },
      uMistCamera: { value: new THREE.Vector3() },
      uMistProjection: { value: new THREE.Matrix4() },
      uMistWorld: { value: new THREE.Matrix4() },
      uValleyBends:{value:Array.from({length:valleySlices},(_,i)=>{
        const bend=mountainRiver(valleyFirstZ+valleyStep*i);
        return new THREE.Vector2(bend.x,bend.halfWidth);
      })},
    };
    Object.assign(material.uniforms, this.uniforms);
    material.fragmentShader = `
      uniform float uMistStage,uMistTime,uTrialCloud;
      uniform vec3 uMistCamera;
      uniform mat4 uMistProjection,uMistWorld;
      uniform vec2 uValleyBends[${valleySlices}];
      ` + material.fragmentShader;
    material.fragmentShader = material.fragmentShader.replace('void main() {', `
      vec2 valleySection(float z) {
        float slot=clamp((z-(${valleyFirstZ.toFixed(1)}))/${valleyStep.toFixed(7)},0.,${(valleySlices-1).toFixed(1)});
        int i=min(int(slot),${valleySlices-2});
        return mix(uValleyBends[i],uValleyBends[i+1],slot-float(i));
      }
      float mistAlongBend(vec3 start,vec3 end) {
        vec3 ray=end-start;
        float lengthToSurface=length(ray);
        vec3 direction=ray/max(.001,lengthToSurface);
        float deposit=0.;
        for(int i=0;i<5;i++) {
          float stepIndex=float(i);
          float sampleDepth=13.5+stepIndex*11.9+stepIndex*stepIndex*.96;
          vec3 world=start+direction*min(sampleDepth,lengthToSurface);
          vec2 bend=valleySection(world.z);
          float across=(world.x-bend.x)/max(1.,bend.y);
          float side=abs(across);
          vec2 stroke=vec2(world.z*.067+uMistTime*.016,across*1.84);
          float cloud=noise3(vec3(stroke,4.85));
          float gap=noise3(vec3(stroke*vec2(1.9,.87)+vec2(5.9,1.7),2.53));
          float shore=smoothstep(.34,.80,side)*(1.-smoothstep(1.23,1.84,side));
          float height=2.4+shore*(2.0+cloud*5.0)+gap*.82;
          float low=1.-smoothstep(1.2,4.2+shore*2.5,abs(world.y-height));
          float wisp=smoothstep(.41,.69,cloud*.71+gap*.29);
          float visibleDepth=smoothstep(sampleDepth-3.,sampleDepth+3.6,lengthToSurface);
          deposit+=visibleDepth*low*wisp*(.13+.87*shore)*(.84+stepIndex*.12);
        }
        float pockets=1.-exp(-deposit*.34);
        vec2 distantBend=valleySection(end.z);
        float distantCross=abs(end.x-distantBend.x)/max(1.,distantBend.y);
        float middleValley=1.-smoothstep(.92,2.1,distantCross);
        float heightVeil=1.-smoothstep(12.5,29.,end.y);
        float aerial=smoothstep(22.,76.,lengthToSurface)*(.105+.43*middleValley)*heightVeil;
        return min(.65,pockets+aerial*(1.-pockets*.54));
      }
      float cloudFeet(vec3 start,vec3 end) {
        vec3 ray=end-start;
        float span=length(ray);
        float stain=0.;
        for(int i=0;i<4;i++) {
          float t=.29+float(i)*.20;
          vec3 p=start+ray*t;
          vec2 drift=p.xz*.037+vec2(uMistTime*.013,0.);
          float bank=fbm(vec3(drift,4.9));
          float height=5.0+bank*7.3;
          float vapor=1.-smoothstep(1.9,7.2,abs(p.y-height));
          stain+=vapor*smoothstep(.32,.70,bank)*smoothstep(7.,24.,span*t);
        }
        return 1.-exp(-stain*.23);
      }
      float trialCloud(vec3 start,vec3 end) {
        vec3 span=end-start;
        float depth=length(span);
        vec3 direction=span/max(.01,depth);
        if(direction.y<=0. || depth<31.)return 0.;
        float aboveHorizon=smoothstep(0.,.15,direction.y);
        float stain=0.;
        for(int i=0;i<3;i++){
          float d=43.+float(i)*25.;
          float visibleDepth=smoothstep(d-8.,d+7.,depth);
          vec3 point=start+direction*d;
          float bank=smoothstep(24.,30.,point.y)*(1.-smoothstep(39.,51.,point.y));
          vec3 p=vec3(point.x+point.z*.42,point.y*1.65,point.z-point.x*.19)*.036;
          p.x-=uMistTime*.05;
          float deposit=fbm(p+vec3(2.2,7.8,13.7));
          float dry=noise3(p*vec3(6.,12.,7.)+8.4);
          stain+=visibleDepth*bank*smoothstep(.44,.71,deposit+(dry-.5)*.084);
        }
        return aboveHorizon*(1.-exp(-stain*.63));
      }
      void main() {
    `);
    material.fragmentShader = material.fragmentShader.replace(
      '  if(uRaw > .5)',
      `  if(uMistStage>2.5&&uRaw<.5) {
        float depth=texture2D(tDepth,vUv).r;
        vec4 clip=uMistProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);
        vec3 target=(uMistWorld*vec4(clip.xyz/clip.w,1.)).xyz;
        float high=step(3.5,uMistStage);
        float opacity;
        if(high>.5){
          opacity=cloudFeet(uMistCamera,target);
        }else{
          opacity=mistAlongBend(uMistCamera,target);
          // Preserve the warm vermilion of distant warning shapes without
          // sharpening the dark silhouettes that sit behind the fog.
          float vermilion=smoothstep(.035,.121,color.r-max(color.g,color.b));
          opacity*=1.-vermilion*.68;
        }
        color=mix(color,paper,opacity);
        if(high<.5 && uTrialCloud>.02){
          float cloud=trialCloud(uMistCamera,target)*uTrialCloud;
          color=mix(color,mix(paper,uInkColor,.86),cloud*.68);
        }
      }
      if(uRaw > .5)`,
    );
    material.needsUpdate = true;
  }
  update(stage, time, camera, trial, dt) {
    this.uniforms.uMistStage.value = stage;
    const pressure=this.uniforms.uTrialCloud;
    pressure.value=THREE.MathUtils.lerp(pressure.value,stage===3?(trial?.95:.29):0,1-Math.exp(-Math.max(0,dt)*2.6));
    if (stage < 3) return;
    this.uniforms.uMistTime.value = time;
    this.uniforms.uMistCamera.value.setFromMatrixPosition(camera.matrixWorld);
    this.uniforms.uMistProjection.value.copy(camera.projectionMatrixInverse);
    this.uniforms.uMistWorld.value.copy(camera.matrixWorld);
  }
}
