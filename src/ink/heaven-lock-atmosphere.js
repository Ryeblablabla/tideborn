import * as THREE from 'three';
import { endingElapsedAt, GATE_BIND, LOCK_SETTLE } from '../heaven-finale.js';

const { smoothstep, lerp } = THREE.MathUtils;
const steps = 38;
const cycles = [
  { at:5.52,duration:.82,weights:[1,0],wedge:true },
  { at: endingElapsedAt('lock',GATE_BIND.wing), duration: .90, weights: [.18,1] },
  { at: endingElapsedAt('lock',GATE_BIND.latch)-.30, duration: .92, weights: [.92,1] },
  { at: LOCK_SETTLE.arrest-.33, duration: 1.11, weights: [.95,.82] },
];

const guideSideZ=[-14.53,-15.14];
const relayClearance=.26;
const wedgeStrike=5.65;
const wedgeRelease=6.30;
const wedgeLanding=6.94;

function anchorWedge(material){
  const shape=new THREE.Shape([
    [-.59,-.20],[-.45,.18],[-.14,.32],[.49,.24],[.60,-.13],[.23,-.26],[-.30,-.24],
  ].map(([x,y])=>new THREE.Vector2(x,y)));
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:.63,steps:1,bevelEnabled:true,bevelSize:.047,bevelThickness:.041,bevelSegments:1,
  }).translate(0,0,-.315);
  const shard=new THREE.Mesh(geometry,material);
  shard.name='前柱镇石 · 崩落边楔';
  shard.userData.inkTint='#81746b';
  shard.userData.inkTintAmount=.73;
  return shard;
}

function guideGeometry(stoneMaterial){
  const group=new THREE.Group();
  group.name='上阶 · 锁链转向墩';
  const stone=new THREE.Mesh(new THREE.BoxGeometry(1.41,.64,1.12),stoneMaterial);
  stone.position.y=.14;
  stone.userData.inkTint='#695e4f';
  stone.userData.inkTintAmount=.68;
  const cap=new THREE.Mesh(new THREE.BoxGeometry(1.57,.20,1.25),stoneMaterial);
  cap.position.y=.48;
  cap.userData.inkTint='#86725a';
  cap.userData.inkTintAmount=.55;
  const saddle=new THREE.Mesh(new THREE.TorusGeometry(.31,.096,7,18).rotateY(Math.PI*.5),stoneMaterial);
  saddle.position.y=.74;
  saddle.userData.inkTint='#3d3831';
  saddle.userData.inkTintAmount=.94;
  group.add(stone,cap,saddle);
  return group;
}

const chainVertex = /* glsl */`
  attribute vec3 aTangent;
  varying vec2 vBrush;
  void main(){
    vec3 eye=normalize(cameraPosition-(modelMatrix*vec4(position,1.)).xyz);
    vec3 tangent=normalize(mat3(modelMatrix)*aTangent);
    vec3 crosswise=normalize(cross(eye,tangent)+vec3(.0001));
    vec3 world=(modelMatrix*vec4(position,1.)).xyz;
    world+=crosswise*uv.y*.24+eye*.10;
    gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
    vBrush=uv;
  }
`;
const chainFragment = /* glsl */`
  uniform float uFront,uWeight;
  varying vec2 vBrush;
  void main(){
    float t=vBrush.x,y=vBrush.y;
    float band=1.-smoothstep(.025,.18,abs(t-uFront-.035));
    float fibre=fract(sin(floor(t*161.)*31.41)*6553.73);
    float broken=smoothstep(.13,.67,fibre+.23*sin(t*129.));
    float spine=.075*sin(t*51.)+.029*sin(t*231.);
    float reserve=1.-smoothstep(.04,.62,abs(y-spine));
    float ash=(1.-smoothstep(.05,.96,abs(y-spine)))*(.22+.69*broken);
    float alpha=uWeight*band*ash*smoothstep(.0,.027,t)*(1.-smoothstep(.97,1.,t));
    if(alpha<.01)discard;
    gl_FragColor=vec4(.10+.61*reserve,.055+.81*reserve,.67,alpha);
  }
`;
const ashVertex = /* glsl */`
  varying vec2 vBrush;
  void main(){
    vBrush=uv*2.-1.;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;
const ashFragment = /* glsl */`
  uniform float uWeight,uAge;
  varying vec2 vBrush;
  void main(){
    vec2 q=vBrush;
    q.x+=.17*sin(q.y*3.1+uAge);
    float grain=fract(sin(dot(floor(q*57.),vec2(29.1,61.2)))*7317.);
    float pocket=1.-smoothstep(.27,.94,length(q*vec2(1.,.84))+(grain-.5)*.12);
    float clots=smoothstep(.23,.71,grain+.14*sin(q.x*19.+q.y*7.));
    float alpha=uWeight*pocket*(.29+.53*clots);
    if(alpha<.01)discard;
    gl_FragColor=vec4(.29+.21*pocket,.08+.32*pocket,grain,alpha);
  }
`;
const stoneVertex = /* glsl */`
  varying vec3 vStone,vNormal;
  void main(){
    vStone=position;
    vNormal=normalize(normalMatrix*normal);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;
const stoneFragment = /* glsl */`
  varying vec3 vStone,vNormal;
  void main(){
    float fold=sin(vStone.x*7.4+vStone.y*18.5+sin(vStone.z*8.)*.74);
    float grain=fract(sin(dot(floor(vStone*35.),vec3(45.,91.,27.)))*7317.);
    float wash=smoothstep(-.43,.82,fold+.49*sin(vStone.x*17.+vStone.z*25.));
    float light=max(0.,dot(normalize(vNormal),normalize(vec3(-.47,.76,.50))));
    gl_FragColor=vec4(.21+.24*light+.09*wash+.029*grain,.07+.12*light,.59+.26*grain,1.);
  }
`;

function ribbon() {
  const geometry=new THREE.BufferGeometry();
  const points=new THREE.BufferAttribute(new Float32Array((steps+1)*6),3);
  const tangents=new THREE.BufferAttribute(new Float32Array((steps+1)*6),3);
  const uv=[];
  const faces=[];
  for(let k=0;k<=steps;k++){
    uv.push(k/steps,-1,k/steps,1);
    if(k<steps)faces.push(2*k,2*k+1,2*k+2,2*k+1,2*k+3,2*k+2);
  }
  geometry.setAttribute('position',points.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aTangent',tangents.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(faces);
  const material=new THREE.ShaderMaterial({
    vertexShader:chainVertex,fragmentShader:chainFragment,transparent:true,
    depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    uniforms:{uFront:{value:2},uWeight:{value:0}},
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='锁链回震 · 铁面飞白';
  mesh.visible=false;
  mesh.frustumCulled=false;
  mesh.userData.inkIdSuppressed=true;
  mesh.renderOrder=7;
  return mesh;
}

export class LockAtmosphere {
  constructor(parent,cuffs){
    this.root=new THREE.Group();
    this.root.name='天锁 · 墩石承力';
    this.root.visible=false;
    parent.add(this.root);
    this.point=new THREE.Vector3();
    this.tangent=new THREE.Vector3();
    this.relayPoint=new THREE.Vector3();
    const outline=new THREE.Shape([
      [-1.14,.04],[-1.07,.79],[-.69,1.18],[.66,1.19],[1.08,.82],[1.16,.03],
    ].map(([x,y])=>new THREE.Vector2(x,y)));
    const geometry=new THREE.ExtrudeGeometry(outline,{
      depth:.74,steps:1,bevelEnabled:true,bevelSize:.095,bevelThickness:.06,bevelSegments:1,
    }).translate(0,0,-.37);
    const material=new THREE.ShaderMaterial({vertexShader:stoneVertex,fragmentShader:stoneFragment});
    const ashGeometry=new THREE.PlaneGeometry(2,2).rotateX(-Math.PI*.5);
    this.sides=cuffs.map(({side,staple})=>{
      const p=staple.position;
      const block=new THREE.Mesh(geometry,material);
      block.name='前柱 · 锁链镇石';
      block.position.set(p.x,.07,p.z+.16);
      block.rotation.y=-side*.045;
      block.userData.inkTint='#766e61';
      block.userData.inkTintAmount=.55;
      const run=ribbon();
      const dust=new THREE.Mesh(ashGeometry,new THREE.ShaderMaterial({
        vertexShader:ashVertex,fragmentShader:ashFragment,transparent:true,depthWrite:false,
        side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uAge:{value:0},uWeight:{value:0}},
      }));
      dust.name='镇石受力 · 浮灰';
      dust.renderOrder=8;
      dust.userData.inkIdSuppressed=true;
      dust.position.set(p.x,.073,p.z-.65);
      dust.rotation.y=-side*.31;
      const guide=guideGeometry(material);
      this.root.add(block,guide,run,dust);
      const wedge=side<0?anchorWedge(material):null;
      if(wedge)this.root.add(wedge);
      return {side,run,dust,guide,wedge,seat:new THREE.Vector3(),route:new Float32Array(45),baseX:p.x,baseZ:p.z};
    });
  }

  update(finale,landmark){
    this.root.visible=finale?.ending==='locked'&&finale.phase==='lock';
    if(!this.root.visible)return;
    const elapsed=finale.elapsed??endingElapsedAt('lock',finale.age,'locked');
    const ground=landmark.userData.lockStairHeight??landmark.userData.upperStairHeight;
    for(const [index,{side,run,dust,guide,wedge,seat,baseX,baseZ}] of this.sides.entries()){
      const x=side*(index===0?7.74:8.31),z=guideSideZ[index];
      guide.position.set(x,ground(x,z)-.20,z);
      guide.rotation.y=side*.12;
      seat.set(x,guide.position.y+.74,z);
      const cycle=cycles.find(({at,duration})=>elapsed>=at&&elapsed<at+duration+.48);
      run.visible=false;
      dust.visible=false;
      if(wedge)this.dropWedge(wedge,dust,ground,baseX,baseZ,elapsed);
      if(!cycle)continue;
      const t=(elapsed-cycle.at)/cycle.duration;
      const weight=cycle.weights[index];
      const glow=smoothstep(t,0,.13)*(1-smoothstep(t,.77,1.04))*weight;
      run.material.uniforms.uFront.value=1-.97*smoothstep(t,0,.88);
      run.material.uniforms.uWeight.value=glow;
      const hit=smoothstep(t,.74,.92)*(1-smoothstep(t,1.00,1.40))*weight;
      if(cycle.wedge)continue;
      dust.visible=hit>.01;
      if(dust.visible){
        const drift=smoothstep(t,.79,1.34);
        if(elapsed>=LOCK_SETTLE.load){
          dust.position.set(seat.x+side*drift*.51,guide.position.y+.57+.15*drift,seat.z-.34-.40*drift);
        }else{
          dust.position.set(baseX+side*drift*.64,.073+.15*drift,baseZ-.65-.72*drift);
        }
        dust.scale.set(lerp(.43,1.42,drift),1,lerp(.53,1.35,drift));
        dust.material.uniforms.uAge.value=elapsed;
        dust.material.uniforms.uWeight.value=.62*hit;
      }
    }
  }

  dropWedge(wedge,dust,ground,x,z,elapsed){
    // The tie keeps its buried iron staple. The fitted facing stone
    // shifts out of its pocket and tumbles down the actual outside treads.
    const seat=smoothstep(elapsed,wedgeStrike,wedgeRelease);
    const tumble=smoothstep(elapsed,wedgeRelease,wedgeLanding);
    const skid=smoothstep(elapsed,wedgeLanding,wedgeLanding+.32);
    const run=THREE.MathUtils.clamp((elapsed-wedgeRelease)/(wedgeLanding-wedgeRelease),0,1);
    const stoneX=x-.20-.57*tumble-.28*skid;
    const stoneZ=z-.36-.57*seat-2.19*tumble-.65*skid;
    const floor=ground(stoneX,stoneZ);
    const lift=Math.sin(Math.PI*run)*(.91-.24*run);
    const spin=.13*seat-1.38*tumble-.24*skid;
    const base=Number.isFinite(floor)?floor+.34+Math.abs(Math.sin(spin))*.036:.40;
    const height=base+.64*(1-tumble)-.04*seat*(1-tumble)+lift;
    wedge.position.set(stoneX,height,stoneZ);
    wedge.rotation.set(spin,.11+.55*tumble,-.13-.33*tumble);
    const tap=smoothstep(elapsed,wedgeLanding-.12,wedgeLanding+.055)
      *(1-smoothstep(elapsed,wedgeLanding+.07,wedgeLanding+.49));
    if(tap<=.01)return;
    dust.visible=true;
    dust.position.set(stoneX-.23,height-.22,stoneZ-.25);
    dust.scale.set(.69+.62*skid,1,.49+.44*skid);
    dust.material.uniforms.uAge.value=elapsed;
    dust.material.uniforms.uWeight.value=.77*tap;
  }

  relay(side,elapsed){
    const guide=this.sides[side<0?0:1];
    const start=side<0?13.46:13.79;
    const weight=smoothstep(elapsed,start,start+1.10);
    return weight>0?{point:guide.seat,weight,arc:guide.route}:null;
  }

  applyRelay(t,out,base,anchor,relay,ground){
    const {point,weight}=relay;
    const first=base.distanceTo(point),last=point.distanceTo(anchor);
    const corner=first/(first+last);
    if(t<corner)this.relayPoint.copy(base).lerp(point,t/corner);
    else this.relayPoint.copy(point).lerp(anchor,(t-corner)/(1-corner));
    out.lerp(this.relayPoint,weight);
    // Hold the center of each link above the visible tread; the cuff
    // endpoint itself always follows the dragon's real joint.
    const tread=ground(out.x,out.z);
    if(Number.isFinite(tread)&&t<1)out.y=Math.max(out.y,tread+relayClearance*smoothstep(1-t,0,.065));
  }

  trace(side,along){
    const {run}=this.sides[side<0?0:1];
    if(!this.root.visible||run.material.uniforms.uWeight.value<=.012)return;
    const {position,aTangent}=run.geometry.attributes;
    for(let k=0;k<=steps;k++){
      const t=k/steps;
      along(t,this.point);
      along(t+.002,this.tangent).sub(this.point);
      for(let i=2*k;i<=2*k+1;i++){
        position.setXYZ(i,this.point.x,this.point.y,this.point.z);
        aTangent.setXYZ(i,this.tangent.x,this.tangent.y,this.tangent.z);
      }
    }
    position.needsUpdate=true;
    aTangent.needsUpdate=true;
    run.visible=true;
  }
}
