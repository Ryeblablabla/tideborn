import * as THREE from 'three';

const HISTORY = 28;
const ROWS_PER_BOW = 16;
const LIFE = 2.65;
const SIDES = [-1, 1];
const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

const vertexShader = /* glsl */ `
  attribute vec4 aWaterBrush;
  varying vec4 vBrush;
  void main(){
    vBrush=aWaterBrush;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec4 vBrush;
  uniform float uSea;
  float hash(vec2 p){
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+19.19);
    return fract(p.x*p.y);
  }
  float wash(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
      mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  void main(){
    float across=vBrush.x, along=vBrush.y, strength=vBrush.z, bow=vBrush.w;
    float broad=wash(vec2(along*.9,across*3.5+1.7));
    float fray=wash(vec2(along*2.7,across*16.0+4.3));
    float grain=wash(vec2(along*5.8,across*42.));
    float curve=across-(broad-.5)*.15;
    float pressure=1.-smoothstep(.035,.24,abs(curve+.19));
    float pooled=(1.-smoothstep(.07,.58,abs(curve+.19)))*(.59+.41*broad);
    float echo=(1.-smoothstep(.016,.068,abs(curve-.48)))*smoothstep(.29,.68,broad);
    float bristle=(1.-smoothstep(.035,.23,abs(curve-.04)))*smoothstep(.27,.69,.69*fray+.31*grain);
    float foam=(1.-smoothstep(.022,.14,abs(curve+.02)))*smoothstep(.30,.72,fray+.14*broad);
    float broken=.55+.45*smoothstep(.14,.72,broad);
    float ink=(.21*pooled+.29*pressure+.31*echo+.18*bristle)*broken;
    float reserve=foam*(.18+uSea*.40)+bristle*(.09+uSea*.22);
    float coverage=strength*clamp(pooled*.36+pressure*.72+echo*.77+foam*.68,0.,1.);
    coverage*=1.-smoothstep(.75,1.,abs(across));
    if(coverage<.012)discard;
    gl_FragColor=vec4(1.-ink*(1.+.12*bow),reserve,grain,coverage);
  }
`;

function sample() {
  return {x:0,z:0,distance:0,time:0,strip:0,fx:0,fz:1,load:0,bend:0};
}

/** A short history of wet contact, painted as two widening brush ribbons and a bow wash. */
export class SwimWake {
  constructor() {
    const rows=(HISTORY+1)*2+ROWS_PER_BOW+1;
    this.position=new THREE.BufferAttribute(new Float32Array(rows*6),3).setUsage(THREE.DynamicDrawUsage);
    this.brush=new THREE.BufferAttribute(new Float32Array(rows*8),4).setUsage(THREE.DynamicDrawUsage);
    this.index=new THREE.BufferAttribute(new Uint16Array(rows*6),1).setUsage(THREE.DynamicDrawUsage);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',this.position);
    geometry.setAttribute('aWaterBrush',this.brush);
    geometry.setIndex(this.index);
    geometry.setDrawRange(0,0);
    this.mesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
      vertexShader,fragmentShader,uniforms:{uSea:{value:0}},
      transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    }));
    this.mesh.name='游迹 · 洇墨与飞白';
    this.mesh.frustumCulled=false;
    this.mesh.renderOrder=-8;
    this.mesh.userData.inkIdSuppressed=true;
    this.samples=Array.from({length:HISTORY},sample);
    this.current=sample();
    this.paintTime=-1;
    this.reset();
  }

  reset() {
    this.start=0;
    this.count=0;
    this.strip=0;
    this.wet=false;
    this.game=null;
    this.stage=-1;
    this.speed=0;
    this.indexCount=0;
    this.current.load=0;
    this.paintTime=-1;
    this.mesh.visible=false;
    this.mesh.geometry.setDrawRange(0,0);
  }

  append() {
    if(this.count===HISTORY){
      this.start=(this.start+1)%HISTORY;
      this.count--;
    }
    Object.assign(this.samples[(this.start+this.count)%HISTORY],this.current);
    this.count++;
  }

  update(time,stage,head,game,surfaceHeight) {
    if(stage>=3||head!==game?.p){
      if(this.game)this.reset();
      return;
    }
    const p=this.current;
    const dx=head.x-p.x,dz=head.z-p.z,travel=Math.hypot(dx,dz),dt=time-p.time;
    if(this.game!==game||this.stage!==stage||dt<0||travel>5){
      this.reset();
      this.game=game;
      this.stage=stage;
      Object.assign(p,{x:head.x,z:head.z,time,distance:0,fx:Math.sin(head.angle),fz:Math.cos(head.angle),load:0,bend:0});
      return;
    }
    if(dt<=0)return;
    while(this.count&&time-this.samples[this.start].time>LIFE){
      this.start=(this.start+1)%HISTORY;
      this.count--;
    }
    const ease=1-Math.exp(-dt*15);
    this.speed=lerp(this.speed,Math.min(22,travel/dt),ease);
    const speedLoad=smooth(this.speed,.37,stage===0?4.4:6.5);
    const clearance=head.y-surfaceHeight;
    const heightLoad=1-smooth(clearance,stage===2?1.13:.94,stage===2?1.93:1.60);
    const load=speedLoad*heightLoad;
    const fx=travel>.014?dx/travel:p.fx,fz=travel>.014?dz/travel:p.fz;
    p.bend=lerp(p.bend,THREE.MathUtils.clamp((p.fz*fx-p.fx*fz)/dt*.38,-1,1),ease);
    Object.assign(p,{x:head.x,z:head.z,time,fx,fz,distance:p.distance+travel,load});
    if(game.status!=='playing'||load<.025){
      this.wet=false;
      p.load=0;
      return;
    }
    const last=this.samples[(this.start+this.count-1+HISTORY)%HISTORY];
    if(!this.wet||!this.count){
      p.strip=++this.strip;
      this.append();
    }else if(p.distance-last.distance>=.48){
      this.append();
    }
    this.wet=true;
  }

  row(x,z,nx,nz,width,distance,load,bow,join) {
    const {surface,water}=this;
    const vertex=this.vertexCount;
    for(const side of SIDES){
      const offset=side*width;
      const px=x+nx*offset,pz=z+nz*offset;
      const y=surface(px,pz)+.035;
      this.position.setXYZ(this.vertexCount,px-water.x,water.z-pz,y-water.y);
      this.brush.setXYZW(this.vertexCount++,side,distance,load,bow);
    }
    if(join){
      const indices=this.index.array,i=this.indexCount;
      indices[i]=vertex-2;indices[i+1]=vertex-1;indices[i+2]=vertex;
      indices[i+3]=vertex-1;indices[i+4]=vertex+1;indices[i+5]=vertex;
      this.indexCount+=6;
    }
  }

  paint(time,surface,water) {
    if(time===this.paintTime)return;
    this.paintTime=time;
    this.indexCount=0;
    this.vertexCount=0;
    if(!this.game||!this.count){
      this.mesh.visible=false;
      this.mesh.geometry.setDrawRange(0,0);
      return;
    }
    this.surface=surface;
    this.water=water;
    const p=this.current;
    const sea=this.stage===2;
    const scale=this.stage===0?.72:this.stage===1?1:1.33;
    this.mesh.material.uniforms.uSea.value=Number(sea);
    for(const side of SIDES){
      let last=null;
      for(let i=0;i<=this.count;i++){
        if(i===this.count&&(!this.wet||!last||p.distance-last.distance<.025))break;
        const node=i===this.count?p:this.samples[(this.start+i)%HISTORY];
        const age=Math.max(0,time-node.time);
        const retreat=Math.max(0,p.distance-node.distance);
        const expansion=smooth(age,0,.77);
        const draft=(.31+node.load*.17)*scale;
        const swell=(.26+.22*node.load)*Math.sqrt(retreat)+.45*expansion;
        const turn=side*node.bend;
        const gap=scale*(draft+swell*(1+.29*turn)+.075*Math.sin(node.distance*1.1+side*.86));
        const width=scale*(.31+node.load*.13+expansion*.18);
        const nx=node.fz*side,nz=-node.fx*side;
        const strength=node.load*(1-smooth(age,.49,LIFE))*(.88+.14*turn);
        const join=last?.strip===node.strip;
        // Fade the ends where a dive, a stop, or elapsed wake history cuts the stroke.
        const next=i<this.count-1?this.samples[(this.start+i+1)%HISTORY]:this.wet?p:null;
        const fade=join&&next?.strip===node.strip?1:.36;
        this.row(node.x+nx*gap,node.z+nz*gap,nx,nz,width,node.distance+side*3.47,strength*fade,0,join);
        last=node;
      }
    }
    if(p.load>.05){
      for(let row=0;row<=ROWS_PER_BOW;row++){
        const u=row/ROWS_PER_BOW,cross=(2*u-1)*scale*(1.17+.45*p.load);
        const lead=scale*(.52+.26*p.load)-cross*cross*(.39/scale);
        const fade=smooth(u,0,.21)*(1-smooth(u,.79,1));
        const width=scale*(.32+.15*p.load);
        this.row(p.x+p.fx*lead+p.fz*cross,p.z+p.fz*lead-p.fx*cross,p.fx,p.fz,width,
          u*3.8+p.distance*.44,p.load*fade*(sea?.68:.81),1,row>0);
      }
    }
    this.mesh.visible=this.indexCount>0;
    this.mesh.geometry.setDrawRange(0,this.indexCount);
    if(!this.mesh.visible)return;
    this.position.clearUpdateRanges();
    this.position.addUpdateRange(0,this.vertexCount*3);
    this.position.needsUpdate=true;
    this.brush.clearUpdateRanges();
    this.brush.addUpdateRange(0,this.vertexCount*4);
    this.brush.needsUpdate=true;
    this.index.clearUpdateRanges();
    this.index.addUpdateRange(0,this.indexCount);
    this.index.needsUpdate=true;
  }

  inspect(){
    return {samples:this.count,triangles:this.indexCount/3,speed:this.speed,load:this.current.load};
  }
}
