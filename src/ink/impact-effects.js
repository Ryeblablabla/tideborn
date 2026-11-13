import * as THREE from 'three';

const boltVertex = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec4 aStroke;
  uniform vec2 uViewport;
  varying vec2 vStroke;
  void main(){
    vec4 p=modelViewMatrix*vec4(position,1.);
    vec3 t=mat3(modelViewMatrix)*aTangent;
    vec2 side=normalize(vec2(-t.y,t.x)+vec2(.00001,.00002));
    vec4 clip=projectionMatrix*p;
    vec2 clipSide=(projectionMatrix*vec4(side,0.,0.)).xy;
    float pixelsPerUnit=.5*length(clipSide*uViewport)/max(.001,abs(clip.w));
    // Keep distant strokes at their world size and cap the projected near stroke.
    float width=min(aStroke.z,aStroke.w/max(.001,pixelsPerUnit));
    p.xy+=side*aStroke.x*width;
    vStroke=aStroke.xy;
    gl_Position=projectionMatrix*p;
  }
`;

const boltFragment = /* glsl */ `
  varying vec2 vStroke;
  uniform float uFade;
  void main(){
    float d=abs(vStroke.x);
    float jitter=fract(sin(floor(vStroke.y*87.)*91.7)*43758.5);
    float split=fract(sin(floor(vStroke.y*149.)*27.4)*19573.8);
    float coverage=(1.-smoothstep(.53,.98,d+(jitter-.5)*.18))*uFade;
    float dryStroke=smoothstep(.34,.82,split)*smoothstep(.30,.83,d);
    float white=1.-smoothstep(.12,.34,d+(jitter-.5)*.08);
    // Reserve the narrow lightning core inside a broken, concentrated wash.
    float pigment=mix(.91,.27,white);
    gl_FragColor=vec4(1.-pigment,max(white*.91,dryStroke*.28),jitter,coverage*(1.-dryStroke*.18));
  }
`;

const ringVertex = /* glsl */ `
  varying vec2 vPlane;
  void main(){
    vPlane=position.xz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const ringFragment = /* glsl */ `
  varying vec2 vPlane;
  uniform float uFade,uSeed;
  void main(){
    float distanceFromCenter=length(vPlane);
    float angle=atan(vPlane.y,vPlane.x);
    float bristle=fract(sin(floor(angle*43.+uSeed)*97.1)*46123.2);
    float wave=.06*sin(angle*6.3+uSeed)+.037*sin(angle*17.7);
    float pressure=1.-smoothstep(.012,.13,abs(distanceFromCenter-.84+wave*.57));
    float broken=smoothstep(-.71,.13,sin(angle*4.3+uSeed)+.39*bristle);
    float alpha=pressure*broken*uFade*(.61+.39*bristle);
    gl_FragColor=vec4(.33+.22*bristle,.19*(1.-pressure),bristle,alpha);
  }
`;

function ribbon(stroke, points, halfWidth, pixelCap) {
  const first=stroke.positions.length/3;
  points.forEach((point,i)=>{
    const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
    const tangent=after.clone().sub(before).normalize();
    const along=i/(points.length-1);
    const width=halfWidth*(.40+.60*Math.sin(along*Math.PI*.75));
    for(const side of [-1,0,1]){
      stroke.positions.push(point.x,point.y,point.z);
      stroke.tangents.push(tangent.x,tangent.y,tangent.z);
      stroke.strokes.push(side,along,width,pixelCap);
    }
    if(i>0){
      const a=first+i*3-3;
      stroke.indices.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);
    }
  });
}

function crack(seed, radius, short=false, rises=false) {
  const stroke={positions:[],tangents:[],strokes:[],indices:[]};
  const point=(x,y,z)=>new THREE.Vector3(x,y,z);
  const random=i=>Math.sin(seed*81.7+i*127.2);
  const height=short?3.25+radius*.58:11.6+radius*.60;
  const direction=rises?-1:1;
  const main=Array.from({length:13},(_,i)=>{
    const t=i/12,spread=Math.sin(Math.PI*t)*.85;
    return point((1-t)*random(9)*(short?.80:1.9)+random(i)*spread,direction*height*(1-t),random(i+23)*spread*.77);
  });
  ribbon(stroke,main,.25,5.5);
  for(let i=0;i<2;i++){
    const root=main[3+i*3],side=i?1:-1;
    const branch=[
      root,
      root.clone().add(point(side*.72,-.85*direction,random(i)*.42)),
      root.clone().add(point(side*1.38,-1.96*direction,random(i+1)*.67)),
      root.clone().add(point(side*2.14,-2.23*direction,random(i+2)*.84)),
    ];
    ribbon(stroke,branch,.112,2.5);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(stroke.positions,3));
  geometry.setAttribute('aTangent',new THREE.Float32BufferAttribute(stroke.tangents,3));
  geometry.setAttribute('aStroke',new THREE.Float32BufferAttribute(stroke.strokes,4));
  geometry.setIndex(stroke.indices);
  return geometry;
}

/** Short 3D brush impacts anchored to the resolved hazard, including misses. */
export class InkImpactEffects {
  constructor(scene) {
    this.root=new THREE.Group();
    this.root.name='雷劫着点';
    this.records=[];
    this.count=0;
    this.viewport={value:new THREE.Vector2(1,1)};
    this.readViewport=renderer=>{
      const canvas=renderer.domElement;
      if(canvas.clientWidth>0&&canvas.clientHeight>0){
        this.viewport.value.set(canvas.clientWidth,canvas.clientHeight);
      }else renderer.getDrawingBufferSize(this.viewport.value);
    };
    this.ringShape=new THREE.RingGeometry(.68,1.02,64,4).rotateX(-Math.PI/2);
    scene.add(this.root);
  }

  add(event,time) {
    this.count++;
    // The displaced water and splash already express a surface impact.
    // Keep an independent aftermath only for strikes hanging in the air.
    if(event.surface)return;
    if(this.records.length>=9)this.remove(this.records.shift());
    const thunder=event.stage===3;
    const y=thunder?event.y:Math.max(.04,event.y-.53);
    const origin=new THREE.Vector3(event.x,y,event.z);
    const seed=event.id||event.x*17+event.z*11;
    const ring=new THREE.Mesh(this.ringShape,new THREE.ShaderMaterial({
      vertexShader:ringVertex,fragmentShader:ringFragment,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uFade:{value:0},uSeed:{value:seed}},
    }));
    ring.position.copy(origin);
    ring.position.y+=.035;
    ring.userData.inkIdSuppressed=true;
    ring.frustumCulled=false;
    this.root.add(ring);
    let bolt=null;
    if(thunder){
      const crossed=event.attack==='sky-cross';
      bolt=new THREE.Mesh(crack(seed,event.radius,crossed,crossed&&event.layer==='low'),new THREE.ShaderMaterial({
        vertexShader:boltVertex,fragmentShader:boltFragment,transparent:true,depthWrite:false,
        side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uFade:{value:0},uViewport:this.viewport},
      }));
      bolt.material.onBeforeRender=this.readViewport;
      bolt.position.copy(origin);
      bolt.userData.inkIdSuppressed=true;
      bolt.frustumCulled=false;
      this.root.add(bolt);
    }
    this.records.push({time,ring,bolt,id:event.id,radius:event.radius,x:event.x,y,z:event.z});
  }

  remove(record) {
    this.root.remove(record.ring);
    record.ring.material.dispose();
    if(record.bolt){
      this.root.remove(record.bolt);
      record.bolt.geometry.dispose();
      record.bolt.material.dispose();
    }
  }

  reset() {
    for(const record of this.records)this.remove(record);
    this.records.length=0;
    this.count=0;
  }

  update(time,visible) {
    this.root.visible=visible;
    this.records=this.records.filter(record=>{
      const age=Math.max(0,time-record.time);
      if(age>.85){this.remove(record);return false;}
      record.ring.scale.setScalar(record.radius*THREE.MathUtils.lerp(.29,1.14,1-Math.exp(-age*4.8)));
      record.ring.material.uniforms.uFade.value=(1-THREE.MathUtils.smoothstep(age,.17,.85))*.72;
      if(record.bolt){
        record.bolt.visible=age<.265;
        record.bolt.material.uniforms.uFade.value=1-THREE.MathUtils.smoothstep(age,.056,.265);
      }
      return true;
    });
  }

  inspect() {
    return {count:this.count,active:this.records.map(record=>({
      id:record.id,x:record.x,y:record.y,z:record.z,bolt:!!record.bolt?.visible,
      ring:record.ring.material.uniforms.uFade.value,
    }))};
  }
}
