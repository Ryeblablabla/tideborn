import * as THREE from 'three';
import {MeshSurfaceSampler} from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import {inkMotionGLSL} from './ink-motion.js';
import {inkCompositionGLSL} from './ink-composition.js';
import {dragonWashGLSL} from '../dragon-shape-wash.js';

// Estimate the least-curved tangent direction from neighboring positions/normals.
// Cylindrical forms naturally produce longitudinal strokes; flat areas fall back
// to an art-directable preferred direction. The field is generated once per mesh.
function geometricFlow(geometry,preferred){
  const positions=geometry.attributes.position,normals=geometry.attributes.normal;
  const count=positions.count,axisA=new Float32Array(count*3),axisB=new Float32Array(count*3);
  const tensors=new Float32Array(count*3),result=new Float32Array(count*3);
  const n=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),fallback=new THREE.Vector3();
  for(let i=0;i<count;i++){
    n.fromBufferAttribute(normals,i).normalize();a.copy(preferred).addScaledVector(n,-n.dot(preferred));
    if(a.lengthSq()<.025){fallback.set(Math.abs(n.y)<.9?0:1,Math.abs(n.y)<.9?1:0,0);a.crossVectors(n,fallback);}
    a.normalize();b.crossVectors(n,a).normalize();a.toArray(axisA,i*3);b.toArray(axisB,i*3);
  }
  function edge(i,j){
    const k=i*3;
    const dx=positions.getX(j)-positions.getX(i),dy=positions.getY(j)-positions.getY(i),dz=positions.getZ(j)-positions.getZ(i);
    const length2=dx*dx+dy*dy+dz*dz;if(length2<1e-16)return;
    const nx=normals.getX(j)-normals.getX(i),ny=normals.getY(j)-normals.getY(i),nz=normals.getZ(j)-normals.getZ(i);
    const x=dx*axisA[k]+dy*axisA[k+1]+dz*axisA[k+2],y=dx*axisB[k]+dy*axisB[k+1]+dz*axisB[k+2];
    const u=nx*axisA[k]+ny*axisA[k+1]+nz*axisA[k+2],v=nx*axisB[k]+ny*axisB[k+1]+nz*axisB[k+2];
    tensors[k]+=u*x/length2;tensors[k+1]+=(u*y+v*x)*.5/length2;tensors[k+2]+=v*y/length2;
  }
  const indices=geometry.index,triangles=indices?indices.count:count;
  for(let i=0;i<triangles;i+=3){
    const x=indices?indices.getX(i):i,y=indices?indices.getX(i+1):i+1,z=indices?indices.getX(i+2):i+2;
    edge(x,y);edge(y,x);edge(x,z);edge(z,x);edge(y,z);edge(z,y);
  }
  for(let i=0;i<count;i++){
    const k=i*3,xx=tensors[k],xy=tensors[k+1],yy=tensors[k+2];
    const radius=Math.sqrt((xx-yy)**2*.25+xy*xy),middle=(xx+yy)*.5;
    const plus=middle+radius,minus=middle-radius;
    let angle=Math.atan2(2*xy,xx-yy)*.5;
    if(Math.abs(minus)<Math.abs(plus))angle+=Math.PI*.5;
    const confidence=THREE.MathUtils.clamp((Math.max(Math.abs(plus),Math.abs(minus))-Math.min(Math.abs(plus),Math.abs(minus)))/(Math.abs(plus)+Math.abs(minus)+.001),0,1);
    a.fromArray(axisA,k);b.fromArray(axisB,k);
    n.copy(a).multiplyScalar(Math.cos(angle)).addScaledVector(b,Math.sin(angle));
    if(n.dot(a)<0)n.negate();
    a.lerp(n,confidence*.82).normalize().toArray(result,k);
  }
  return result;
}

const vertexShader=/* glsl */`
attribute vec3 aAnchor;
attribute vec3 aNormal;
attribute vec3 aFlow;
attribute vec3 aSize;
attribute vec3 aGeometry;
attribute float aReserve;
varying vec3 vAnchor;
varying vec3 vSurfaceNormal;
varying vec3 vFlow;
varying vec3 vSize;
varying vec3 vGeometry;
varying float vReserve;
uniform float uScale;
uniform float uCoarseRatio;
uniform float uInkFlow;
uniform float uCun;
uniform float uBoneInk;
void main(){
  vec3 tangent=normalize(aFlow);
  vec3 side=normalize(cross(aNormal,tangent));
  float factor=fract(aSize.z*.731)<uCoarseRatio?2.8:1.0;
  vAnchor=aAnchor;vSurfaceNormal=aNormal;vFlow=tangent;vSize=vec3(aSize.xy*factor,aSize.z);
  float family=fract(aSize.z*.371);
  float bone=1.0-step(.16,family),wet=step(.68,family);
  vSize.x*=mix(1.0,1.15,wet*uCun);
  vSize.y*=mix(1.0,1.28,wet*uCun)*mix(1.0,.30,bone*uBoneInk);
  vGeometry=aGeometry;
  vReserve=aReserve;
  // Rasterize a conservative screen rectangle around the fixed 3D brush
  // volume; the fragment shader still evaluates the real surface position.
  vec4 center=modelViewMatrix*vec4(aAnchor,1.0);
  vec3 e1=mat3(modelViewMatrix)*(tangent*vSize.x/uScale);
  vec3 e2=mat3(modelViewMatrix)*(side*vSize.y*1.3/uScale);
  vec3 e3=mat3(modelViewMatrix)*(aNormal*vSize.y*.85/uScale);
  vec3 extent=(abs(e1)+abs(e2))*(1.0+uInkFlow*.65)+abs(e3);
  vec2 bounds=(extent.xy*abs(center.z)+abs(center.xy)*extent.z)/max(abs(center.z)-extent.z,.01);
  gl_Position=projectionMatrix*vec4(center.xy+position.xy*bounds,center.z,1.0);
}`;

/** Sparse, surface-attached procedural strokes. No painted image or model UV. */
export class SurfaceBrushLayer {
  constructor(source,{shared,noise,flow,analysis,objectSize,strokeProfile={}}){
    this.source=source;
    let state=7919;
    const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
    const samplingGeometry=source.geometry.clone();
    samplingGeometry.setAttribute('color',new THREE.Float32BufferAttribute(geometricFlow(source.geometry,flow),3));
    const sampler=new MeshSurfaceSampler(new THREE.Mesh(samplingGeometry)).setRandomGenerator(random).build();
    const area=sampler.distribution[sampler.distribution.length-1]/(objectSize*objectSize);
    // Many weak overlapping marks average into a smooth grey surface. Keep
    // fewer, individually loaded strokes so a brush can still be read.
    const {lengthRange=[.028,.080],widthRange=[.20,.42],jitter=.55,frequency=1}=strokeProfile;
    const count=Math.round(THREE.MathUtils.clamp(area*1400*frequency,180,4200));
    const anchors=new Float32Array(count*3),normals=new Float32Array(count*3),flows=new Float32Array(count*3),sizes=new Float32Array(count*3);
    const features=new Float32Array(count*3);
    const reserves=new Float32Array(count);
    const point=new THREE.Vector3(),normal=new THREE.Vector3(),tangent=new THREE.Vector3(),sampledFlow=new THREE.Color();
    const fallback=new THREE.Vector3(),bitangent=new THREE.Vector3();
    const closest={point:new THREE.Vector3(),distance:0,faceIndex:-1},bary=new THREE.Vector3(),triangle=new THREE.Triangle();
    const geometry=source.geometry,indices=geometry.index;
    for(let i=0;i<count;i++){
      sampler.sample(point,normal,sampledFlow);normal.normalize();
      tangent.set(sampledFlow.r,sampledFlow.g,sampledFlow.b);tangent.addScaledVector(normal,-tangent.dot(normal));
      if(tangent.lengthSq()<.025){fallback.set(Math.abs(normal.y)<.9?0:1,Math.abs(normal.y)<.9?1:0,0);tangent.crossVectors(normal,fallback);}
      tangent.normalize();bitangent.crossVectors(normal,tangent).normalize();
      tangent.addScaledVector(bitangent,(random()-.5)*jitter).normalize();
      point.toArray(anchors,i*3);normal.toArray(normals,i*3);tangent.toArray(flows,i*3);
      const length=THREE.MathUtils.lerp(...lengthRange,random())*objectSize;
      sizes.set([length,length*THREE.MathUtils.lerp(...widthRange,random()),random()*100],i*3);
      analysis.bvh.closestPointToPoint(point,closest);
      const face=closest.faceIndex*3,ids=[0,1,2].map(j=>indices?indices.getX(face+j):face+j);
      triangle.a.fromBufferAttribute(geometry.attributes.position,ids[0]);triangle.b.fromBufferAttribute(geometry.attributes.position,ids[1]);triangle.c.fromBufferAttribute(geometry.attributes.position,ids[2]);
      triangle.getBarycoord(point,bary);
      for(let c=0;c<3;c++)features[i*3+c]=analysis.attribute.array[ids[0]*3+c]*bary.x+analysis.attribute.array[ids[1]*3+c]*bary.y+analysis.attribute.array[ids[2]*3+c]*bary.z;
      const guides=geometry.attributes.inkGuides;
      reserves[i]=guides.getY(ids[0])*bary.x+guides.getY(ids[1])*bary.y+guides.getY(ids[2])*bary.z;
    }
    samplingGeometry.dispose();
    const strokeGeometry=new THREE.InstancedBufferGeometry();
    strokeGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    strokeGeometry.setIndex([0,1,2,0,2,3]);strokeGeometry.instanceCount=count;
    for(const [name,data]of Object.entries({aAnchor:anchors,aNormal:normals,aFlow:flows,aSize:sizes,aGeometry:features}))strokeGeometry.setAttribute(name,new THREE.InstancedBufferAttribute(data,3));
    strokeGeometry.setAttribute('aReserve',new THREE.InstancedBufferAttribute(reserves,1));
    this.noShapeWash=new THREE.Vector2();
    this.noShapeWashAxis=new THREE.Vector3();
    this.material=new THREE.ShaderMaterial({
      uniforms:{...shared,tSurfaceDepth:{value:null},uViewport:{value:new THREE.Vector2(1,1)},
        uDragonWash:{value:this.noShapeWash},uDragonWashAxis:{value:this.noShapeWashAxis},
        uInverseProjection:{value:new THREE.Matrix4()},uInverseView:{value:new THREE.Matrix4()},uWorldToModel:{value:new THREE.Matrix4()}},
      vertexShader,
      fragmentShader:/* glsl */`
        varying vec3 vAnchor;
        varying vec3 vSurfaceNormal;
        varying vec3 vFlow;
        varying vec3 vSize;
        varying vec3 vGeometry;
        varying float vReserve;
        uniform sampler2D tSurfaceDepth;
        uniform vec2 uViewport;
        uniform mat4 uInverseProjection;
        uniform mat4 uInverseView;
        uniform mat4 uWorldToModel;
        uniform vec3 uLightView;
        uniform vec3 uFlow;
        uniform float uDensity;
        uniform float uDry;
        uniform float uScale;
        uniform float uGranulation;
        uniform sampler2D uBrushAtlas;
        uniform vec2 uAtlasGrid;
        uniform float uBrushMix;
        uniform float uStrokeStrength;
        uniform float uInkStorageScale;
        uniform float uLiftStrength;
        uniform vec3 uCenter;
        uniform float uObjectScale;
        uniform float uReserveStrength;
        uniform float uCun;
        uniform float uBoneInk;
        uniform float uWetness;
        ${noise}
        ${inkMotionGLSL}
        ${inkCompositionGLSL}
        ${dragonWashGLSL}
        float brushFootprint(vec2 q,float seed){
          if(any(greaterThan(abs(q),vec2(1.0))))return 0.0;
          float taper=pow(max(0.0,1.0-q.x*q.x),.38);
          float rough=(noise3(vec3(q*vec2(11,19),seed))-.5)*.16;
          float footprint=(1.0-smoothstep(taper-.15,taper+.05,abs(q.y)+rough))*(1.0-smoothstep(.78,1.0,abs(q.x)));
          if(uBrushMix>.001){
            float slot=mod(floor(seed*23.17),uAtlasGrid.x*uAtlasGrid.y);
            vec2 tile=vec2(mod(slot,uAtlasGrid.x),floor(slot/uAtlasGrid.x));
            float mask=texture2D(uBrushAtlas,(tile+clamp(q*.5+.5,vec2(.015),vec2(.985)))/uAtlasGrid).r;
            footprint=mix(footprint,mask,uBrushMix);
          }
          return footprint;
        }
        vec2 brushDeposit(vec2 q,float seed,float dryness,float wetness){
          q.y+=(noise3(vec3(q.x*1.7,seed,3.7))-.5)*.28;
          float footprint=brushFootprint(q,seed);
          float fiber=noise3(vec3(q*vec2(1.5,42),seed));
          float pressure=.76+.24*noise3(vec3(q*vec2(2,5),seed+3.7));
          float bristles=smoothstep(.27,.59,fiber);
          float dryCoverage=mix(1.0,bristles,clamp(dryness*(.90+uCun*.25),0.0,1.0));
          float ragged=noise3(vec3(q*vec2(10,25),seed+9.4));
          float transition=max(.015,uTonalSoftness)+wetness*.12;
          float mark=smoothstep(.07+dryness*.07,.24+transition,footprint*pressure+(ragged-.5)*.08);
          float coverage=mix(footprint,mark,uTonalContrast)*dryCoverage;
          float pooling=.72+.28*noise3(vec3(q*vec2(5,9),seed));
          return vec2(coverage*pooling,footprint);
        }
        void main(){
          applyDragonWash();
          vec2 uv=gl_FragCoord.xy/uViewport;
          float depth=texture2D(tSurfaceDepth,uv).r;
          if(depth>.999999)discard;
          vec4 view=uInverseProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
          view/=view.w;
          vec3 surface=(uWorldToModel*uInverseView*view).xyz;
          vec3 delta=surface-vAnchor;
          vec3 across=normalize(cross(vSurfaceNormal,vFlow));
          float length=vSize.x/uScale,width=vSize.y/uScale;
          if(abs(dot(delta,vSurfaceNormal))>width*.85)discard;
          vec2 q=vec2(dot(delta,vFlow)/length,dot(delta,across)/width);
          float seed=vSize.z;
          float family=fract(seed*.371);
          float bone=1.0-step(.16,family),wet=step(.68,family);
          float dryTarget=mix(clamp(.55+uDry*.50,0.0,1.0),uDry*.15,wet);
          float dryness=mix(uDry,mix(dryTarget,.75,bone*uBoneInk),uCun);
          float wetness=wet*uCun*uWetness;
          // Bone ink and dry texture stay registered while the wet wash moves.
          float motion=uInkFlow;
          if((uCun>.001&&wet<.5)||(uBoneInk>.001&&bone>.5))motion=0.0;
          vec3 massPosition=(vAnchor-uCenter)*uObjectScale;
          vec2 brush;
          if(motion<.0001)brush=brushDeposit(q,seed,dryness,wetness);
          else{
            vec3 phases=inkPhases(massPosition);
            vec2 shift=vec2(motion,motion*.12);
            vec2 a=brushDeposit(q-shift*(phases.x-.5),seed,dryness,wetness);
            vec2 b=brushDeposit(q-shift*(phases.y-.5),seed,dryness,wetness);
            brush=mix(b,a,phases.z);
          }
          if(brush.y<.001)discard;
          float field=inkMassAmount(massPosition,vSurfaceNormal,uFlow,vGeometry,motion>.0001?1.0:0.0);
          float strokeChoice=hash(vec3(seed,18.7,4.1));
          // A stroke is dipped once: coherent pale wash or concentrated ink,
          // with short transitions. Do not quantize the final rendered image.
          float transition=max(.015,uTonalSoftness);
          float loaded=inkMassCoverage(field);
          float load=mix(.07+field*.28,.06+loaded*(.72+strokeChoice*.28),uTonalContrast);
          float pigment=load*uDensity*uStrokeStrength;
          float structural=smoothstep(.18,.65,vGeometry.x/.12+vGeometry.z*.35);
          float boneAmount=bone*uBoneInk*structural;
          float boneLoad=(.25+structural*.80)*uDensity*uStrokeStrength;
          pigment=mix(pigment,boneLoad,boneAmount);
          pigment+=(1.0-wet-bone)*uCun*.18*structural*uDensity*uStrokeStrength;
          pigment*=mix(1.0,.80,wet*uCun);
          float reserve=smoothstep(.05,.85,dot(normalize(vSurfaceNormal),normalize(uReserveDirection)));
          pigment*=1.0-reserve*uReserveStrength*(1.0-boneAmount);
          float deposit=brush.x*pigment*(1.0-vReserve);
          float lift=brush.y*smoothstep(.14,.30,vGeometry.y)*(1.0-vGeometry.z*.5)*.13*uLiftStrength;
          gl_FragColor=vec4(deposit*uInkStorageScale,lift*uInkStorageScale,0.0,1.0);
        }`,
      transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquation:THREE.AddEquation,
    });
    this.mesh=new THREE.Mesh(strokeGeometry,this.material);this.mesh.matrixAutoUpdate=false;this.mesh.frustumCulled=false;
    this.count=count;
  }
  update(camera,depthTexture,width,height){
    let visible=true;for(let node=this.source;node;node=node.parent)if(!node.visible){visible=false;break;}
    this.mesh.visible=visible;if(!visible)return;
    this.mesh.matrix.copy(this.source.matrixWorld);
    const u=this.material.uniforms;
    u.uDragonWash.value=this.source.userData.dragonWash??this.noShapeWash;
    u.uDragonWashAxis.value=this.source.userData.dragonWashAxis??this.noShapeWashAxis;
    u.tSurfaceDepth.value=depthTexture;u.uViewport.value.set(width,height);
    u.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    u.uInverseView.value.copy(camera.matrixWorld);
    u.uWorldToModel.value.copy(this.source.matrixWorld).invert();
  }
  dispose(){this.mesh.geometry.dispose();this.material.dispose();}
}
