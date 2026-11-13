import * as THREE from 'three';

const HALF_PI = Math.PI / 2;
const BRISTLES = [[0,.28],[.22,1],[.56,.79],[1,.08]];

export function laneBrush(from, to, halfWidth, style=0) {
  const dx=to.x-from.x, dz=to.z-from.z, length=Math.hypot(dx,dz);
  if(length<.1||halfWidth<=0)return null;
  const fx=dx/length, fz=dz/length;
  const y=from.y;
  const positions=[], loads=[], lengths=[], widths=[], indices=[];

  function stroke(steps, width, point, seed, amount=1) {
    for(let i=0;i<=steps;i++){
      const t=i/steps;
      const taper=.45+.55*Math.pow(Math.sin(t*Math.PI),.48);
      const load=.74+.16*Math.cos(t*23.2+seed)+.10*Math.cos(t*57.3+seed);
      const bristle=width*(.17+.83*taper)*(.92+.08*Math.sin(t*15.1+seed));
      const base=positions.length/3;
      for(const [lane,pressure] of BRISTLES){
        const [forward,across]=point(t,bristle*lane);
        positions.push(from.x+fx*forward+fz*across,y,from.z+fz*forward-fx*across);
        loads.push(pressure*load*taper*amount);
        lengths.push(forward/length);
        widths.push(lane);
      }
      if(i>0)for(let lane=0;lane<BRISTLES.length-1;lane++){
        const current=base+lane, previous=current-BRISTLES.length;
        indices.push(previous,current,previous+1,previous+1,current,current+1);
      }
    }
  }

  const width=Math.min(.29,halfWidth*(style===2?.25:.21));
  for(const side of [-1,1]){
    stroke(48,width,(t,inset)=>[length*t,side*(halfWidth-inset)],side*2.3);
  }
  // Both round ends belong to the same swept collision capsule as the rails.
  for(const front of [false,true])stroke(30,width,(t,inset)=>{
    const angle=THREE.MathUtils.lerp(-HALF_PI,HALF_PI,t);
    const r=halfWidth-inset;
    return [front?length+Math.cos(angle)*r:-Math.cos(angle)*r,Math.sin(angle)*r];
  },front?2.7:4.1,front?1:.62);

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aLoad',new THREE.Float32BufferAttribute(loads,1));
  geometry.setAttribute('aAlong',new THREE.Float32BufferAttribute(lengths,1));
  geometry.setAttribute('aAcross',new THREE.Float32BufferAttribute(widths,1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function brushMaterial(progress, sweep, player, occluded=false, style=0) {
  const traceUniforms=occluded?{
    uTraceCenter:{value:new THREE.Vector3()},uTraceAxis:{value:new THREE.Vector2()},
    uTraceWidth:{value:0},tSurfaceId:{value:null},tDragonIds:{value:null},
  }:{};
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    depthFunc:occluded?THREE.GreaterDepth:THREE.LessEqualDepth,
    defines:{OCCLUDED_LANE_TRACE:Number(occluded),FLIGHT_LANE_STYLE:style},
    uniforms:{uProgress:progress,uSweep:sweep,uPlayer:player,...traceUniforms},
    vertexShader:/* glsl */ `
      attribute float aLoad,aAlong;
      varying float vLoad,vAlong;
      varying vec2 vWater;
      #if FLIGHT_LANE_STYLE > 0
      attribute float aAcross;
      varying float vAcross;
      #endif
      #if OCCLUDED_LANE_TRACE
      varying float vHeight;
      #endif
      void main(){
        vLoad=aLoad;
        vAlong=aAlong;
        vWater=position.xz;
        #if FLIGHT_LANE_STYLE > 0
        vAcross=aAcross;
        #endif
        #if OCCLUDED_LANE_TRACE
        vHeight=position.y;
        #endif
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader:/* glsl */ `
      uniform float uProgress,uSweep;
      uniform vec2 uPlayer;
      #if OCCLUDED_LANE_TRACE
      uniform vec3 uTraceCenter;
      uniform vec2 uTraceAxis;
      uniform float uTraceWidth;
      uniform sampler2D tSurfaceId,tDragonIds;
      varying float vHeight;
      #endif
      varying float vLoad,vAlong;
      varying vec2 vWater;
      #if FLIGHT_LANE_STYLE > 0
      varying float vAcross;
      #endif
      float hash(vec2 p){
        return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);
      }
      void main(){
        float fiber=hash(floor(vWater*63.));
        float dry=hash(floor(vWater*23.));
        float pressure=smoothstep(.055,.75,vLoad);
        float grain=mix(.68,1.,smoothstep(.08,.56,fiber*.68+dry*.32));
        float along=clamp(vAlong,0.,1.);
        float approaching=smoothstep(along*.74-.12,along*.74+.22,uProgress);
        float exit=1.-smoothstep(.65,3.4,distance(vWater,uPlayer));
        float ahead=uSweep<0.?1.:smoothstep(uSweep-.17,uSweep+.035,vAlong);
        #if FLIGHT_LANE_STYLE == 1
        float gap=smoothstep(.10,.27,fract(along*6.0+.23+vAcross*.19));
        float stroke=mix(.32,1.,gap);
        #elif FLIGHT_LANE_STYLE == 2
        float lip=smoothstep(.44,.61,vAcross)*(1.-smoothstep(.76,.94,vAcross));
        #endif
        #if OCCLUDED_LANE_TRACE
        vec2 fromTip=vWater-uTraceCenter.xz;
        float alongTip=dot(fromTip,uTraceAxis);
        float side=abs(dot(fromTip,vec2(uTraceAxis.y,-uTraceAxis.x)));
        float rail=1.-smoothstep(.039,.086,abs(side-uTraceWidth*.91));
        float near=1.-smoothstep(1.34,2.65,length(fromTip));
        float close=1.-smoothstep(1.60,3.05,length(vWater-uPlayer));
        float height=1.-smoothstep(.25,1.05,abs(vHeight-uTraceCenter.y));
        float end=1.-smoothstep(.21,.68,alongTip);
        float broken=mix(.42,1.,smoothstep(.27,.60,dry));
        float trace=rail*near*close*height*end*ahead*pressure*broken;
        #if FLIGHT_LANE_STYLE == 1
        trace*=mix(.48,1.,stroke);
        #endif
        trace*=smoothstep(.36,.71,uProgress);
        if(trace<.018)discard;
        vec2 surface=texelFetch(tSurfaceId,ivec2(gl_FragCoord.xy),0).rg;
        if(texture2D(tDragonIds,(floor(surface*255.+.5)+.5)/256.).r<.5)discard;
        gl_FragColor=vec4(.81+.12*dry,.68+.18*fiber,grain,trace*.81);
        return;
        #endif
        float alpha=pressure*grain*(.67+.22*approaching+.11*exit)*ahead;
        float ink=mix(.19,.047,max(approaching,exit*.72))+.06*dry;
        #if FLIGHT_LANE_STYLE == 1
        alpha*=stroke;
        #elif FLIGHT_LANE_STYLE == 2
        ink=mix(ink,.80+.08*dry,lip*.80);
        #endif
        if(alpha<.018)discard;
        #if FLIGHT_LANE_STYLE == 2
        gl_FragColor=vec4(ink,lip*.61,fiber,alpha);
        #else
        gl_FragColor=vec4(ink,.0,fiber,alpha);
        #endif
      }
    `,
  });
}

export function addOccludedLaneTrace(mesh, progress, sweep, player, style) {
  const trace=new THREE.Mesh(mesh.geometry,brushMaterial(progress,sweep,player,true,style));
  trace.name='掠袭遮挡飞白';
  trace.renderOrder=mesh.renderOrder+1;
  trace.frustumCulled=false;
  trace.visible=false;
  trace.userData.inkIdSuppressed=true;
  mesh.add(trace);
  return trace;
}

export function placeOccludedLaneTrace(trace, mesh, from, to, width, player) {
  if(!trace)return;
  trace.geometry=mesh.geometry;
  const {uTraceCenter,uTraceAxis,uTraceWidth}=trace.material.uniforms;
  const dx=to.x-from.x,dz=to.z-from.z;
  const length=Math.hypot(dx,dz);
  if(length<.001){
    trace.userData.flightTraceInRange=false;
    trace.visible=false;
    return;
  }
  const {clamp}=THREE.MathUtils;
  const along=clamp(((player.x-from.x)*dx+(player.z-from.z)*dz)/(length*length),.66,1);
  const lineHeight=THREE.MathUtils.lerp(from.y,to.y,along);
  trace.userData.flightTraceInRange=Math.abs(lineHeight-player.y)<width+.15;
  trace.visible=trace.userData.flightTraceInRange&&Boolean(trace.material.uniforms.tSurfaceId.value);
  uTraceCenter.value.set(from.x+dx*along, player.y, from.z+dz*along);
  uTraceAxis.value.set(dx/length,dz/length);
  uTraceWidth.value=width;
}

export class FlightTraceOcclusion {
  constructor(){
    this.ids=new Uint8Array(256*256);
    this.texture=new THREE.DataTexture(this.ids,256,256,THREE.RedFormat);
    this.roots=[];
  }

  set(palette, roots, lanes){
    const changed=this.palette!==palette||roots.some((root,i)=>root!==this.roots[i]);
    this.palette=palette;
    if(changed){
      this.roots=roots;
      this.ids.fill(0);
      for(const root of roots)root?.traverse(mesh=>{
        if(mesh.isMesh)this.ids[palette.id(mesh)]=255;
      });
      this.texture.needsUpdate=true;
    }
    for(const lane of Object.values(lanes)){
      if(!lane.trace)continue;
      const uniforms=lane.trace.material.uniforms;
      uniforms.tSurfaceId.value=palette.target.texture;
      uniforms.tDragonIds.value=this.texture;
      lane.trace.visible=lane.mesh.visible&&lane.trace.userData.flightTraceInRange;
    }
  }
}

/** World-space crab charge boundaries, driven by the encounter's locked windup. */
export class CrabChargeWarning {
  constructor(scene) {
    this.root=new THREE.Group();
    this.root.name='蟹王冲锋预警';
    this.root.visible=false;
    this.progress={value:0};
    this.sweep={value:-1};
    this.player={value:new THREE.Vector2()};
    this.brush=new THREE.Mesh(new THREE.BufferGeometry(),brushMaterial(this.progress,this.sweep,this.player));
    this.brush.userData.inkTint='#872a22';
    this.brush.userData.inkTintAmount=.99;
    this.brush.renderOrder=19;
    this.root.add(this.brush);
    scene.add(this.root);
    this.lane=null;
  }

  event(event) {
    if(event.type!=='bossCharge'||event.attack!=='crab-charge')return;
    const {from,to,width,duration,bossId}=event;
    const geometry=laneBrush(from,to,width);
    if(!geometry)return;
    this.brush.geometry.dispose();
    this.brush.geometry=geometry;
    this.lane={from,to,width,duration,bossId};
    this.progress.value=0;
    this.sweep.value=-1;
  }

  update(game, active) {
    const boss=game.boss;
    const plan=boss?.bossPlan;
    const charge=!!this.lane&&boss?.id===this.lane.bossId&&plan?.definition.name==='crab-charge';
    const winding=charge&&plan.phase==='windup';
    const sweeping=charge&&plan.phase==='active'&&!plan.hit;
    this.root.visible=active&&(winding||sweeping);
    if(winding||sweeping){
      this.player.value.set(game.p.x,game.p.z);
      this.progress.value=winding?THREE.MathUtils.clamp(1-plan.remaining/this.lane.duration,0,1):1;
      this.sweep.value=winding?-1:THREE.MathUtils.clamp(1-plan.remaining/plan.definition.active,0,1);
    }else{
      this.lane=null;
    }
  }

  reset() {
    this.lane=null;
    this.root.visible=false;
  }

  inspect() {
    return {visible:this.root.visible,progress:this.progress.value,sweep:this.sweep.value,lane:this.lane};
  }
}
