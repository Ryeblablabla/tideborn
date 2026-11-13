import * as THREE from 'three';

const MAX_WARNINGS = 16;
const RIM_STEPS = 64;
const RIM_ROWS = [[0,.27],[.12,.79],[.23,.96],[.43,.84],[.59,.70],[.74,.46],[.88,.23],[1,.04]];
const {clamp,lerp,smoothstep}=THREE.MathUtils;
const random = n => {
  const x = Math.sin(n * 93.713 + 8.27) * 43658.5;
  return x - Math.floor(x);
};

function brushRing(arcSegments=null) {
  const position = [], opacity = [], index = [];
  // Slightly irregular arcs with gaps, like a brush running out of ink.
  const arcs = arcSegments??[[0,.195],[.217,.429],[.449,.692],[.719,.986]];
  const lanes = [[0,.22],[.25,1],[.65,.90],[1,.13]];
  for (let a = 0; a < arcs.length; a++) {
    const [start,end] = arcs[a];
    const segments = Math.ceil((end-start)*96);
    for (let i=0;i<=segments;i++) {
      const t = i/segments;
      const angle = THREE.MathUtils.lerp(start,end,t)*Math.PI*2;
      const stroke = Math.pow(Math.sin(t*Math.PI),.27);
      const outside = 1.006 + Math.sin(angle*9+1)*.009 + (random(i+a*31)-.5)*.013;
      const width = (.026 + stroke*.057) * (.75+random(i*.41+a*10)*.45);
      const v=position.length/3;
      for (const [across,load] of lanes) {
        const radius=outside-width*across;
        position.push(Math.cos(angle)*radius,0,Math.sin(angle)*radius);
        opacity.push(stroke*load);
      }
      if (i>0) for (let lane=0; lane<lanes.length-1; lane++) {
        const current=v+lane, previous=current-lanes.length;
        index.push(previous,current,previous+1,previous+1,current,current+1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('aBristle',new THREE.Float32BufferAttribute(opacity,1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function impactColumn() {
  const geometry = new THREE.CylinderGeometry(.010,.029,1,5,6,true);
  geometry.translate(0,.5,0);
  const p=geometry.getAttribute('position'), alpha=[];
  for(let i=0;i<p.count;i++){
    const y = p.getY(i);
    p.setX(i,p.getX(i)+Math.sin(y*16)*.035*y);
    p.setZ(i,p.getZ(i)+Math.sin(y*8)*.028*y);
    alpha.push(Math.pow(Math.sin(y*Math.PI),.68)*.77);
  }
  geometry.setAttribute('aBristle',new THREE.Float32BufferAttribute(alpha,1));
  return geometry;
}

function warningBatch(geometry, tint, boundary, pressure=1, highLayer=false, occluded=false) {
  geometry.setAttribute('aCharge',new THREE.InstancedBufferAttribute(new Float32Array(MAX_WARNINGS),1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
    depthFunc:occluded?THREE.GreaterDepth:THREE.LessEqualDepth,
    uniforms:{uBoundary:{value:Number(boundary)},uPressure:{value:pressure},uHighLayer:{value:Number(highLayer)},
      uOccluded:{value:Number(occluded)},uFocus:{value:new THREE.Vector3()},uBoss:{value:new THREE.Vector3(0,1e4,0)}},
    vertexShader:/* glsl */`
      attribute float aBristle,aCharge;
      varying float vLoad,vCharge;
      varying vec3 vSurface,vWorld;
      void main(){
        vLoad=aBristle;
        vCharge=aCharge;
        vSurface=position;
        vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader:/* glsl */`
      uniform float uBoundary,uPressure,uHighLayer,uOccluded;
      uniform vec3 uFocus,uBoss;
      varying float vLoad,vCharge;
      varying vec3 vSurface,vWorld;
      float grain(vec3 p){
        p=fract(p*.1031);
        p+=dot(p,p.yzx+33.33);
        return fract((p.x+p.y)*p.z);
      }
      void main(){
        float dry=grain(floor(vSurface*85.));
        float edge=vLoad*(.79+.21*dry);
        if(uOccluded>.5){
          float nearBody=1.-smoothstep(2.1,4.2,length(vWorld.xz-uFocus.xz));
          float nearBoss=1.-smoothstep(1.2,3.5,length(vWorld.xz-uBoss.xz));
          float fiber=1.-smoothstep(.010,.024,abs(length(vSurface.xz)-.968));
          float keep=smoothstep(.22,.58,dry);
          float coverage=max(nearBody,nearBoss)*edge*fiber*(.58+.42*keep);
          if(coverage<.02)discard;
          gl_FragColor=vec4(.82,.72,dry,coverage*.64);
          return;
        }
        float imminent=smoothstep(.35,.92,vCharge);
        float pressure=mix(.34+.34*imminent,.75+.25*imminent,uBoundary);
        float reflectance=mix(.28+.08*dry,.12+.07*dry-.07*imminent,uBoundary);
        float fiber=uHighLayer*(1.-smoothstep(.006,.013,abs(length(vSurface.xz)-.983)));
        reflectance=mix(reflectance,.68+.12*dry,fiber);
        gl_FragColor=vec4(reflectance,fiber*.90,dry,clamp(edge*pressure*uPressure,0.,1.));
      }
    `,
  });
  const mesh=new THREE.InstancedMesh(geometry,material,MAX_WARNINGS);
  mesh.name='落击预警';
  mesh.count=0;
  mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.inkTint=tint;
  mesh.userData.inkTintAmount=boundary?.98:.84;
  mesh.userData.inkMineralHold=boundary?.16:0;
  // Favor the warning stroke over translucent allied washes while retaining depth.
  mesh.renderOrder=boundary?9:8;
  if(occluded){mesh.renderOrder=10;mesh.userData.inkIdSuppressed=true;}
  return mesh;
}

function surfaceHeightSampler(water, fallback) {
  if(!water)return ()=>fallback;
  const {geometry,position}=water;
  const columns=(geometry.parameters?.widthSegments??1)+1;
  const rows=(geometry.parameters?.heightSegments??1)+1;
  const data=geometry.attributes.position.array;
  if(columns===2&&rows===2)return ()=>position.y+data[2];
  const indices=geometry.index.array;
  const middleRow=(rows>>1)*columns,middleColumn=columns>>1;

  function cell(size,target,at){
    let low=0,high=size-1;
    while(high-low>1){
      const mid=(low+high)>>1;
      if(at(mid)<target)low=mid;else high=mid;
    }
    return low;
  }
  const xAt=i=>data[(middleRow+i)*3];
  const zAt=i=>-data[(i*columns+middleColumn)*3+1];
  function heightInCell(row,column,x,z){
    const first=(row*(columns-1)+column)*6;
    for(let i=first;i<first+6;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,d=indices[i+2]*3;
      const ax=data[a],az=-data[a+1];
      const ux=data[b]-ax,uz=-data[b+1]-az,vx=data[d]-ax,vz=-data[d+1]-az;
      const det=ux*vz-uz*vx;
      if(Math.abs(det)<1e-7)continue;
      const dx=x-ax,dz=z-az;
      const u=(dx*vz-dz*vx)/det,v=(ux*dz-uz*dx)/det;
      if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001){
        return position.y+data[a+2]+(data[b+2]-data[a+2])*u+(data[d+2]-data[a+2])*v;
      }
    }
    return null;
  }
  return (x,z)=>{
    // The authored water plane is rotated -90° about X. Its current indexed
    // triangles already include swells, crest lean and combat deformation.
    const tx=x-position.x,tz=z-position.z;
    const column=cell(columns,tx,xAt),row=cell(rows,tz,zAt);
    const direct=heightInCell(row,column,tx,tz);
    if(direct!==null)return direct;
    for(let r=Math.max(0,row-2);r<=Math.min(rows-2,row+2);r++){
      for(let c=Math.max(0,column-2);c<=Math.min(columns-2,column+2);c++){
        if(r===row&&c===column)continue;
        const height=heightInCell(r,c,tx,tz);
        if(height!==null)return height;
      }
    }
    return position.y;
  };
}

function surfaceRim() {
  const rows=RIM_ROWS.length,vertices=(RIM_STEPS+1)*rows*MAX_WARNINGS;
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage);
  const cue=new THREE.BufferAttribute(new Float32Array(vertices*4),4).setUsage(THREE.DynamicDrawUsage);
  const normal=new THREE.BufferAttribute(new Float32Array(vertices*3),3);
  for(let i=0;i<vertices;i++)normal.setXYZ(i,0,1,0);
  const index=[];
  for(let j=0;j<MAX_WARNINGS;j++)for(let i=0;i<RIM_STEPS;i++)for(let lane=0;lane<rows-1;lane++){
    const a=(j*(RIM_STEPS+1)+i)*rows+lane,b=a+rows;
    index.push(a,b,a+1,a+1,b,b+1);
  }
  geometry.setAttribute('position',position);
  geometry.setAttribute('aCue',cue);
  geometry.setAttribute('normal',normal);
  geometry.setIndex(index);
  geometry.setDrawRange(0,0);
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:/* glsl */`
      attribute vec4 aCue;
      varying vec4 vCue;
      varying vec3 vWater;
      void main(){
        vCue=aCue;
        vWater=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader:/* glsl */`
      varying vec4 vCue;
      varying vec3 vWater;
      float grain(vec3 p){
        p=fract(p*.1031);
        p+=dot(p,p.yzx+33.33);
        return fract((p.x+p.y)*p.z);
      }
      void main(){
        float paper=grain(floor(vWater*79.));
        float lead=vCue.y,imminent=vCue.z;
        if(vCue.w>=0.){
          // Loaded pigment on the collision edge, with a narrow unpainted
          // strip directly inside it so either side of a swell stays legible.
          float across=vCue.w;
          float ragged=grain(floor(vWater*vec3(31.,17.,31.)));
          float inner=across+(ragged-.5)*.075;
          float ink=(.34+.66*smoothstep(0.,.095,across))*(1.-smoothstep(.47,.64,inner));
          float skip=smoothstep(.15,.67,ragged+.34*smoothstep(.08,.26,across));
          ink*=.69+.31*skip;
          float reserve=smoothstep(.48,.59,inner)*(1.-smoothstep(.78,.99,inner));
          float dryRim=mix(.24+.08*paper,.041+.062*paper-.022*imminent,lead);
          float pigment=ink*(.86+.14*paper);
          float bare=reserve*(.72+.23*lead)*(.90+.10*paper);
          float coverage=clamp(vCue.x*(pigment+bare),0.,.98);
          float reflected=mix(.98,dryRim,pigment/max(.001,pigment+bare));
          if(coverage<.014)discard;
          gl_FragColor=vec4(reflected,.86*bare/max(.001,pigment+bare),paper,coverage);
          return;
        }
        float alpha=vCue.x*(.82+.18*paper);
        float reflectance=mix(.35+.11*paper,.10+.065*paper-.062*imminent,lead);
        if(alpha<.018)discard;
        gl_FragColor=vec4(reflectance,.0,paper,alpha);
      }
    `,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='水上落击边界';
  mesh.frustumCulled=false;
  mesh.visible=false;
  mesh.renderOrder=9;
  Object.assign(mesh.userData,{inkTint:'#8b3026',inkTintAmount:.98,inkMineralHold:.18});
  return mesh;
}

function waveRims(hazard){
  const half=hazard.halfWidth??.42;
  if(hazard.wave){
    if(hazard.hit)return [];
    const travel=clamp(hazard.age/hazard.maxLife,0,1);
    return [{...hazard,radius:lerp(hazard.startRadius,hazard.radius,travel)+half,edge:'front'}];
  }
  const inner=hazard.startRadius-half,outer=hazard.radius+half;
  if(hazard.attack==='lantern-pulse')return [{...hazard,radius:outer,edge:'limit',mid:inner}];
  const mid=(inner+outer)*.5;
  return [
    {...hazard,radius:inner,mid,edge:'origin'},
    {...hazard,radius:outer,mid,edge:'limit'},
  ];
}

/** Keeps strike radius and height readable without covering dragon silhouettes. */
export class InkWarnings {
  constructor(scene) {
    const lowArcs=[[0,.32],[.353,.67],[.702,.987]];
    const highArcs=[[.01,.143],[.169,.309],[.337,.471],[.503,.641],[.671,.809],[.838,.983]];
    this.rings=warningBatch(brushRing(),'#892e23',true);
    this.columns=warningBatch(impactColumn(),'#8b4c42',false);
    this.lowRing=warningBatch(brushRing(lowArcs),'#8f3b2e',true,1.24);
    this.highRing=warningBatch(brushRing(highArcs),'#74342d',true,1.38,true);
    this.lowTrace=warningBatch(brushRing(lowArcs),'#8f3b2e',true,1,false,true);
    this.highTrace=warningBatch(brushRing(highArcs),'#74342d',true,1,false,true);
    this.surface=surfaceRim();
    this.transform=new THREE.Object3D();
    scene.add(this.rings,this.columns,this.lowRing,this.highRing,this.lowTrace,this.highTrace,this.surface);
  }

  write(batch, i, x, y, z, width, height, progress) {
    const object=this.transform;
    object.position.set(x,y,z);
    object.scale.set(width,height,width);
    object.updateMatrix();
    batch.setMatrixAt(i,object.matrix);
    batch.geometry.attributes.aCharge.setX(i,progress);
  }

  writeSurface(warnings,player,water) {
    this.surface.visible=warnings.length>0;
    if(!warnings.length)return;
    const {geometry}=this.surface;
    const {position,aCue}=geometry.attributes;
    const heightAt=surfaceHeightSampler(water,.16);
    const rows=RIM_ROWS.length;
    for(const [index,hazard] of warnings.entries()){
      const {x,y,z,radius,life,edge}=hazard;
      const shell=hazard.attack==='shell-breaker'||Boolean(edge);
      const partners=edge?[]:warnings.filter(other=>other!==hazard&&other.bossId===hazard.bossId&&other.attack===hazard.attack);
      const playerRadius=player?Math.hypot(player.x-x,player.z-z):radius;
      const outwardExit=Number.isFinite(hazard.mid)?smoothstep(playerRadius,hazard.mid-.50,hazard.mid+.50):0;
      const lead=edge==='origin'?lerp(.44,1,1-outwardExit):edge==='limit'?lerp(.55,1,outwardExit):edge==='front'?1:
        Number(partners.every(other=>life<=other.life+.001));
      const urgency=edge==='front'?1:1-smoothstep(life,.05,.84);
      const altitude=player?1-smoothstep(Math.abs(player.y-y),edge?.86:.95,edge?1.16:1.30):1;
      const reach=player?1-smoothstep(playerRadius-radius,5,14):1;
      const width=edge?(edge==='limit'?lerp(.37,.49,lead):edge==='front'?.31:.43):
        shell?lerp(.39,.47,lead?urgency:0):clamp(radius*.10,.16,.28);
      const pressure=lerp(.62,.90+.10*urgency,lead)*(.30+.70*altitude)*(.62+.38*reach);
      for(let step=0;step<=RIM_STEPS;step++){
        const angle=step/RIM_STEPS*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle);
        const rimX=x+dx*radius,rimZ=z+dz*radius;
        const close=player?1-smoothstep(Math.hypot(rimX-player.x,rimZ-player.z),.65,4.2):.5;
        let overlap=0;
        for(const other of partners){
          overlap=Math.max(overlap,smoothstep(other.radius-Math.hypot(rimX-other.x,rimZ-other.z),.02,.55));
        }
        // The outer union remains clear. The shared interior is still marked
        // lightly so a delayed footprint never reads as a safe opening.
        const fiber=.86+.095*Math.sin(angle*7+hazard.id)+.045*Math.sin(angle*19+.4);
        const edgeLoad=edge==='limit'?lerp(.96,1.05,lead):edge==='front'?.90:1;
        const azimuth=Math.atan2(dx,dz)-(hazard.gap??0);
        const cut=hazard.gapWidth>0?smoothstep(Math.abs(Math.atan2(Math.sin(azimuth),Math.cos(azimuth))),
          hazard.gapWidth*.5,hazard.gapWidth*.5+.105):1;
        const load=cut*(shell?edgeLoad*lerp(.70,1.06+.14*urgency,lead)*(.30+.70*altitude)*(.62+.38*reach)*
          (.87+.13*close)*(1-.56*overlap)*(.87+.13*fiber):pressure*fiber*(.86+.14*close)*(1-.61*overlap));
        const lift=edge==='limit'?.095:.062;
        const raised=heightAt(rimX,rimZ)+lift;
        // A few loaded bristles on the first edge feather away from the safe bowl.
        const outward=edge==='origin'?.23*urgency*(.5+.5*Math.cos(angle*6+.53))**9:0;
        for(let lane=0;lane<rows;lane++){
          const [across,bristle]=RIM_ROWS[lane];
          const r=radius+(edge==='origin'?1:-1)*(width+outward)*across;
          const i=(index*(RIM_STEPS+1)+step)*rows+lane;
          const px=x+dx*r,pz=z+dz*r;
          const py=shell&&lane>0?heightAt(px,pz)+lift:raised;
          position.setXYZ(i,px,py,pz);
          aCue.setXYZW(i,shell?load:load*bristle,lead,urgency,shell?across:-1);
        }
      }
    }
    geometry.setDrawRange(0,warnings.length*RIM_STEPS*(rows-1)*6);
    position.needsUpdate=true;
    aCue.needsUpdate=true;
  }

  update(hazards, stage, active, player=null, water=null, boss=null) {
    let ringCount=0, columnCount=0, lowCount=0, highCount=0, lowTraceCount=0, highTraceCount=0;
    const surface=[];
    if(active)for(const hazard of hazards) {
      if(hazard.life<=0)continue;
      if((hazard.attack==='shell-backwash'||hazard.attack==='lantern-pulse')&&(hazard.warning||hazard.wave)){
        for(const rim of waveRims(hazard))if(surface.length<MAX_WARNINGS)surface.push(rim);
        continue;
      }
      if(!hazard.warning)continue;
      const air=stage===3&&!hazard.surface;
      if(!air){
        if(surface.length<MAX_WARNINGS)surface.push(hazard);
        continue;
      }
      if(ringCount+lowCount+highCount>=MAX_WARNINGS)continue;
      const height=hazard.y;
      const progress=THREE.MathUtils.clamp(1-hazard.life/(hazard.maxLife??(air?1.9:1.6)),0,1);
      const crossed=hazard.attack==='sky-cross';
      const rise=crossed&&hazard.layer==='low';
      if(crossed){
        const batch=rise?this.lowRing:this.highRing;
        const trace=rise?this.lowTrace:this.highTrace;
        const index=rise?lowCount++:highCount++;
        this.write(batch,index,hazard.x,height,hazard.z,hazard.radius,1,progress);
        const traceIndex=rise?lowTraceCount++:highTraceCount++;
        this.write(trace,traceIndex,hazard.x,height,hazard.z,hazard.radius,1,progress);
      }else{
        this.write(this.rings,ringCount++,hazard.x,height,hazard.z,hazard.radius,1,progress);
        if(hazard.attack==='starfall'&&player&&hazard.life<.66&&
          Math.hypot(player.x-hazard.x,player.y-hazard.y,player.z-hazard.z)<hazard.radius+.72){
          this.write(this.lowTrace,lowTraceCount++,hazard.x,height,hazard.z,hazard.radius,1,progress);
        }
      }
      const span=crossed?1.65-progress*.66:3.9-progress*2.8;
      const y=rise?height-span:height;
      this.write(this.columns,columnCount++,hazard.x,y,hazard.z,crossed?.81:1.2,span,progress);
    }
    this.writeSurface(surface,player,water);
    this.rings.count=ringCount;
    this.lowRing.count=lowCount;
    this.highRing.count=highCount;
    this.lowTrace.count=player?lowTraceCount:0;
    this.highTrace.count=player?highTraceCount:0;
    for(const trace of [this.lowTrace,this.highTrace])if(trace.count){
      trace.material.uniforms.uFocus.value.set(player.x,player.y,player.z);
      trace.material.uniforms.uBoss.value.set(boss?.x??1e4,boss?.y??1e4,boss?.z??1e4);
    }
    this.columns.count=columnCount;
    for(const batch of [this.rings,this.columns,this.lowRing,this.highRing,this.lowTrace,this.highTrace])if(batch.count){
      batch.instanceMatrix.needsUpdate=true;
      batch.geometry.attributes.aCharge.needsUpdate=true;
    }
  }
}
