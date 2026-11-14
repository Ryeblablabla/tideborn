import * as THREE from 'three';

const openingShader = /* glsl */ `
  uniform vec2 uShoreResolution;
  uniform vec3 uShoreHead, uShoreNeck, uShoreWater;
  uniform float uShoreOpening;

  float shoreCut(vec2 pixel, vec3 a, vec3 b, float reach) {
    vec2 axis=b.xy-a.xy;
    float progress=clamp(dot(pixel-a.xy,axis)/max(.000001,dot(axis,axis)),0.,1.);
    vec3 point=mix(a,b,progress);
    float distanceToPath=length(pixel-point.xy);
    // In a perspective lens the foreground has a smaller depth-buffer value.
    float foreground=smoothstep(.000015,.00023,point.z-gl_FragCoord.z);
    return (1.-smoothstep(reach*.44,reach,distanceToPath))*foreground;
  }

  float shoreCoverage() {
    if (uShoreOpening<.002) return 1.;
    vec2 pixel=gl_FragCoord.xy/uShoreResolution.y;
    float head=shoreCut(pixel,uShoreNeck,uShoreHead,.058);
    float channel=shoreCut(pixel,uShoreHead,uShoreWater,.037);
    return 1.-uShoreOpening*max(head*.88,channel*.81);
  }
`;

function offsetFromWaterPath(out,x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const along=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/Math.max(.01,dx*dx+dz*dz),0,1);
  return out.set(x-a.x-dx*along,z-a.z-dz*along);
}

/** Open a small depth-tested window through the foreground leaves. */
export class ReedVisibility {
  constructor(ink) {
    this.ink=ink;
    this.stage=-1;
    this.revision=-1;
    this.foliage=[];
    this.head={value:new THREE.Vector3()};
    this.neck={value:new THREE.Vector3()};
    this.water={value:new THREE.Vector3()};
    this.ahead=new THREE.Vector3();
    this.offset=new THREE.Vector2();
  }

  update(stage,frame,camera,dt,active,revision=0) {
    if(stage!==this.stage||revision!==this.revision){
      const current=stage===this.stage?new Map(this.foliage.map(clump=>[clump.root,clump])):null;
      if(!current)this.restore();
      this.stage=stage;
      this.revision=revision;
      this.foliage=stage<2?this.findCanopies(current):[];
    }
    if(!this.foliage.length)return;
    if(!active){this.restore();return;}

    const head=frame.position;
    const neck=frame.spine?.[3]??head;
    const heightAt=this.foliage[0].root.parent.userData.shoreHeightAt;
    const forwardX=Math.sin(frame.heading),forwardZ=Math.cos(frame.heading);
    this.ahead.set(head.x,head.y,head.z);
    for(let travel=.65;travel<=3.9;travel+=.65){
      const x=head.x+forwardX*travel,z=head.z+forwardZ*travel;
      if(heightAt(x,z)>.16)break;
      this.ahead.set(x,THREE.MathUtils.lerp(head.y,.20,travel/3.9),z);
    }
    this.project(this.head.value,head,.14,camera);
    this.project(this.neck.value,neck,.05,camera);
    this.project(this.water.value,this.ahead,0,camera);

    for(const clump of this.foliage){
      const {x,z}=clump.root.position;
      const offset=offsetFromWaterPath(this.offset,x,z,neck,this.ahead);
      const distance=offset.length();
      const edge=clump.root.userData.shoreCanopy;
      const target=1-THREE.MathUtils.smoothstep(distance,edge+1.7,edge+4.0);
      const easing=1-Math.exp(-Math.max(0,dt)*(target>clump.amount?22:7.5));
      let amount=THREE.MathUtils.lerp(clump.amount,target,easing);
      if(Math.abs(amount-target)<.012)amount=target;
      this.setOpening(clump,amount);
      if(clump.root.isMesh){
        const lean=.23*amount*(1-THREE.MathUtils.smoothstep(distance,edge*.47,edge+1.0));
        const unit=lean/Math.max(.5,distance);
        clump.root.rotation.x=offset.y*unit;
        // Wind has already supplied the current rotation about the planted foot.
        clump.root.rotation.z-=offset.x*unit;
      }
    }
  }

  project(out,point,height,camera) {
    out.set(point.x,point.y+height,point.z).project(camera);
    out.set((out.x*.5+.5)*camera.aspect,out.y*.5+.5,out.z*.5+.5);
  }

  findCanopies(current) {
    const groups=new Map();
    for(const record of this.ink.records){
      const {mesh}=record;
      const root=mesh.userData.shoreCanopy?mesh:mesh.parent;
      if(!root?.userData.shoreCanopy||root.parent?.userData.stage!==this.stage)continue;
      if(!groups.has(root)){
        const existing=current?.get(root);
        groups.set(root,existing?{...existing,parts:[]}:{root,parts:[],amount:0,opening:{value:0}});
      }
      const clump=groups.get(root),material=record.material;
      clump.parts.push(record);
      if(material.uniforms.uShoreOpening){material.uniforms.uShoreOpening=clump.opening;continue;}
      Object.assign(material.uniforms,{
        uShoreResolution:this.ink.postMaterial.uniforms.uResolution,
        uShoreHead:this.head,uShoreNeck:this.neck,uShoreWater:this.water,uShoreOpening:clump.opening,
      });
      material.fragmentShader=openingShader+material.fragmentShader.replace(
        'gl_FragColor = vec4(reflectance,paperReserve,grain,1.0);',
        'gl_FragColor = vec4(reflectance,paperReserve,grain,shoreCoverage());',
      );
      material.forceSinglePass=true;
      material.needsUpdate=true;
    }
    return [...groups.values()];
  }

  setOpening(clump,amount) {
    if(amount===clump.amount)return;
    clump.amount=clump.opening.value=amount;
    for(const {material} of clump.parts){
      material.transparent=amount>.02;
      material.depthWrite=amount<=.02;
    }
  }

  restore(){
    for(const clump of this.foliage){
      this.setOpening(clump,0);
      if(clump.root.isMesh)clump.root.rotation.x=0;
    }
  }
}
