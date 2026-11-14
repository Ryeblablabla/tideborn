import { Vector4 } from 'three';

const slots = 22;
const ashLife = 9.4;
const reflectanceLine = 'float reflectance=exp(-pigment*uLandGain*3.1);';
const mix = (a,b,t) => a + (b-a)*t;

export class BeamTerrainScorch {
  constructor() {
    this.lanes = [];
    this.known = new WeakSet();
    this.count = {value:0};
    this.ends = {value:Array.from({length:slots},()=>new Vector4())};
    this.profile = {value:Array.from({length:slots},()=>new Vector4())};
    this.stage = -1;
  }

  bind(material) {
    Object.assign(material.uniforms,{
      uTerrainScorchCount:this.count, uTerrainScorchEnds:this.ends, uTerrainScorchProfile:this.profile,
    });
    material.vertexShader = 'varying vec3 vScorchWorld;\n' + material.vertexShader.replace(
      'vLandscape =', 'vScorchWorld = worldPosition.xyz; vLandscape =');
    material.fragmentShader = `
      varying vec3 vScorchWorld;
      uniform int uTerrainScorchCount;
      uniform vec4 uTerrainScorchEnds[${slots}], uTerrainScorchProfile[${slots}];
    ` + material.fragmentShader.replace(reflectanceLine,`
      float scorchChar=0., scorchAsh=0.;
      if(uTerrainScorchCount>0){
        float rag=noise3(vec3(vScorchWorld.xz*4.2, vScorchWorld.y*.8));
        float tilt=smoothstep(.16,.50,abs(vFormNormal.y));
        for(int i=0;i<${slots};i++){
          if(i>=uTerrainScorchCount)break;
          vec4 line=uTerrainScorchEnds[i], state=uTerrainScorchProfile[i];
          vec2 axis=line.zw-line.xy;
          vec2 offset=vScorchWorld.xz-line.xy;
          float along=clamp(dot(offset,axis)/max(dot(axis,axis),.01),0.,1.);
          float terrainGap=abs(vScorchWorld.y-mix(state.x,state.y,along));
          float side=length(offset-axis*along);
          float feet=(1.-smoothstep(.50,1.42,terrainGap))*tilt;
          float fringe=1.-smoothstep(.50,1.05,side/abs(state.z)+(rag-.48)*.35);
          float mark=fringe*feet*state.w;
          if(state.z>0.)scorchChar=max(scorchChar,mark);
          else scorchAsh=max(scorchAsh,mark);
        }
        scorchChar *= 1.-.84*scorchAsh;
        float fired=max(scorchChar,scorchAsh*.72);
        if(fired>.002){
          float grainBed=fbm(vScorchWorld*vec3(8.5,4.2,8.5));
          pigment=mix(pigment,.54+.50*grainBed,fired*.85);
          paperReserve=mix(paperReserve,.08+.32*scorchAsh*grainBed,fired);
        }
      }
      ${reflectanceLine}
    `);
  }

  update(stage, time, position, scorch, active) {
    if(this.stage!==stage || !active){
      this.stage=stage;
      this.lanes.length=0;
      this.known=new WeakSet();
      this.count.value=0;
      if(!active)return;
    }
    for(const lane of scorch?.lanes??[]){
      if(this.known.has(lane))continue;
      this.known.add(lane);
      this.lanes.push(lane);
    }
    if(!this.lanes.length)return;
    this.lanes=this.lanes.filter(lane=>time-lane.plantedAt<ashLife);
    const strokes=[];
    for(const lane of this.lanes) for(let i=1;i<lane.points.length;i++){
      const a=lane.points[i-1],b=lane.points[i];
      if(b.along-a.along>3.45||Math.max(a.y,b.y)<.60)continue;
      const margin=Math.hypot(position.x-(a.x+b.x)*.5,position.z-(a.z+b.z)*.5);
      if(margin>53)continue;
      const edges=[a.along,b.along];
      for(const wet of lane.doused??[]){
        if(wet.from>a.along&&wet.from<b.along)edges.push(wet.from);
        if(wet.to>a.along&&wet.to<b.along)edges.push(wet.to);
      }
      edges.sort((left,right)=>left-right);
      for(let j=1;j<edges.length;j++){
        const start=edges[j-1],end=edges[j];
        if(end-start<.14)continue;
        const center=(start+end)*.5;
        const wet=lane.doused?.some(area=>center>=area.from&&center<=area.to);
        strokes.push({a,b,start,end,wet,margin,lane});
      }
    }
    strokes.sort((left,right)=>(left.margin-Number(left.wet)*6)-(right.margin-Number(right.wet)*6));
    this.count.value=Math.min(strokes.length,slots);
    for(let i=0;i<this.count.value;i++){
      const {a,b,start,end,wet,lane}=strokes[i];
      const length=b.along-a.along;
      const u=(start-a.along)/length,v=(end-a.along)/length;
      const age=time-lane.plantedAt;
      const opacity=Math.min(1,.30+age*3.3)*Math.min(1,Math.max(0,(ashLife-age)/3.2));
      this.ends.value[i].set(mix(a.x,b.x,u),mix(a.z,b.z,u),mix(a.x,b.x,v),mix(a.z,b.z,v));
      this.profile.value[i].set(mix(a.y,b.y,u)-.30,mix(a.y,b.y,v)-.30,
        lane.width*(wet?-.98:1.08),opacity);
    }
  }
}
