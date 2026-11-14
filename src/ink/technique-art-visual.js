import * as THREE from 'three';

const colors = {
  hoarfrost: ['#2d778b', '#bad9dc'],
  stonecrest: ['#6d4d39', '#b99666'],
  emberwings: ['#ad422b', '#e0a55a'],
  sporeseed: ['#39452d', '#b0af61'],
  bankweir: ['#2e686b', '#d1e7d9'],
  windkite: ['#414b4d', '#d8d6be'],
  icekeel: ['#2a5463', '#e4e8dc'],
};
const horizontal = new THREE.Vector3(0, 1, 0);
const count = 780;
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
const fade = (age, duration) => Math.max(0, Math.min(1, 1 - age / duration));
const measureRoute = points => {
  let length=0;
  return points.map((point,index)=>{
    if(index)length+=Math.hypot(point.x-points[index-1].x,point.z-points[index-1].z);
    return {...point,along:length};
  });
};
function sampleRoute(points, distance) {
  const next=points.findIndex((point,index)=>index>0&&point.along>=distance);
  const index=next<0?points.length-1:next;
  const a=points[index-1], b=points[index];
  const t=THREE.MathUtils.clamp((distance-a.along)/Math.max(.001,b.along-a.along),0,1);
  const span=Math.max(.01,b.along-a.along);
  return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),nx:(b.z-a.z)/span,nz:-(b.x-a.x)/span};
}
const vertexShader = `
  varying vec3 vTone;
  void main(){
    vTone=instanceColor;
    gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
  }`;
const fragmentShader = `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  varying vec3 vTone;
  void main(){
    if(gl_FragCoord.z>texture2D(tDepth,gl_FragCoord.xy/uResolution).r+.000049)discard;
    gl_FragColor=vec4(vTone,.83);
    #include <colorspace_fragment>
  }`;

/** One depth-aware batch for automatic setup techniques. */
export class TechniqueArtVisual {
  constructor() {
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.axis = new THREE.Vector3();
    this.pose = new THREE.Object3D();
    this.color = new THREE.Color();
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, depthTest:false, depthWrite:false, transparent:true,
      uniforms:{tDepth:{value:null},uResolution:{value:new THREE.Vector2(1,1)}},
    });
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1),material,count);
    this.mesh.setColorAt(0,this.color);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder=9;
    this.mesh.frustumCulled=false;
    this.reset();
  }

  reset() {
    this.cues=[];
    this.mesh.count=0;
  }

  event(event,time) {
    if(event.type==='dragonArtReaction'&&['frost-prism-fork','frost-prism-hold'].includes(event.reaction)){
      this.cues.push({...event,kind:'icekeel',time,
        route:event.reaction==='frost-prism-fork'?measureRoute([event.from,event.to]):null});
      if(this.cues.length>112)this.cues.shift();
      return;
    }
    if(!Object.hasOwn(colors,event.kind) ||
      !['techniqueArtStart','techniqueArtImpact','techniqueArtBloom','techniqueArtRelease'].includes(event.type))return;
    if(event.type==='techniqueArtStart'&&event.kind==='hoarfrost')return;
    if(event.secondary==='kite-downpour'&&event.type==='techniqueArtRelease')return;
    const weir=event.kind==='bankweir'&&event.type==='techniqueArtRelease';
    const kite=event.kind==='windkite'&&event.type==='techniqueArtStart';
    const prism=event.kind==='icekeel'&&event.type==='techniqueArtRelease';
    const curve=kite?new THREE.CubicBezierCurve3(...event.points.map(p=>new THREE.Vector3(p.x,p.y,p.z))):null;
    this.cues.push({...event,time,curve,route:prism||weir?measureRoute(event.points):event.route});
    if(this.cues.length>112)this.cues.shift();
  }

  get visible() { return this.cues.length>0; }

  frostFocus(time) {
    for (let i=this.cues.length-1;i>=0;i--) {
      const cue=this.cues[i];
      const age=time-cue.time;
      if(age<0||age>.68)continue;
      if(cue.carrier!=='frost-fork'&&cue.reaction!=='frost-prism-fork')continue;
      return {point:cue.to??cue, gain:(.55+.45*smooth(age,0,.07))*
        (1-smooth(age,cue.duration??.12,(cue.duration??.12)+.35))};
    }
    return null;
  }

  write(tone){
    if(this.written>=count)return;
    this.pose.updateMatrix();
    this.mesh.setMatrixAt(this.written,this.pose.matrix);
    this.mesh.setColorAt(this.written++,this.color.set(tone));
  }

  splinter(x,y,z,angle,height,width,tone){
    this.pose.position.set(x,y,z);
    this.pose.rotation.set(.27*Math.sin(angle*1.8),angle,.23*Math.cos(angle*2.1));
    this.pose.scale.set(width,Math.max(.01,height),width*.66);
    this.write(tone);
  }

  stroke(from,to,width,tone){
    this.start.set(from.x,from.y+.17,from.z);
    this.end.set(to.x,to.y+.17,to.z);
    this.axis.subVectors(this.end,this.start);
    const span=this.axis.length();
    if(span<.025)return;
    this.pose.position.copy(this.start).lerp(this.end,.5);
    this.pose.quaternion.setFromUnitVectors(horizontal,this.axis.multiplyScalar(1/span));
    this.pose.scale.set(width,span*.58,width*.76);
    this.write(tone);
  }

  drawSpore(cue, age, game, ink, pale) {
    if (cue.type === 'techniqueArtBloom') {
      const front = Math.min(1, Math.sqrt(age * 2.3));
      const release = fade(Math.max(0, age - .13), .69);
      const {x,y,z,radius} = cue;
      const lift = THREE.MathUtils.smoothstep(age, 0, .29);
      // Each fold curls out from the host with the foot still near the water.
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + cue.id * .77;
        const origin = {x:x + Math.cos(angle) * radius * .13,y:y + .22,z:z + Math.sin(angle) * radius * .13};
        const bend = {x:x + Math.cos(angle + .42) * radius * front * .46,y:y + .36 + lift * 1.25,
          z:z + Math.sin(angle + .42) * radius * front * .46};
        const ending = {x:x + Math.cos(angle + .68) * radius * front * .81,y:y + .46 + lift * 1.70,
          z:z + Math.sin(angle + .68) * radius * front * .81};
        this.stroke(origin,bend,.24 * release,ink);
        this.stroke(bend,ending,.21 * release,i % 2 === 0 ? pale : ink);
      }
      for (let i = 0; i < 15; i++) {
        const angle = i * 2.399963 + cue.id * .77;
        const reach = radius * front * (.36 + .14 * (i % 5));
        const height = (i % 4 * .24 + .35) * Math.sin(front * 2.1 + .21) + lift * .35;
        this.splinter(x + Math.cos(angle) * reach, y + .18 + height, z + Math.sin(angle) * reach,
          angle + age * .69, (.57 + i % 4 * .19) * release, (.25 + i % 3 * .12) * release,
          i % 4 ? ink : pale);
      }
      return;
    }
    const live = game.techniqueArts?.find(art => art.id === cue.id);
    if (!live || live.host.hp <= 0) return;
    const {host, path, delay} = live;
    const rise = Math.max(.41, host.radius * .72);
    const opening = THREE.MathUtils.smoothstep(age, .0, .17);
    if (opening < 1) {
      const t = opening;
      const lift = Math.sin(Math.PI * t) * .91;
      this.splinter(lerp(cue.from.x, host.x, t), lerp(cue.from.y + .28, host.y + rise, t) + lift,
        lerp(cue.from.z, host.z, t), age * 4, .52, .23, pale);
      return;
    }
    const ripeness = THREE.MathUtils.smoothstep(age, .13, delay);
    const twist = age * 7 + cue.id * .41;
    this.splinter(host.x, host.y + rise, host.z, twist, .58 + ripeness * .59, .27 + ripeness * .14, ink);
    this.splinter(host.x, host.y + rise + .25, host.z, twist + .77, .34 + ripeness * .28, .14 + ripeness * .09, pale);
    let to = {x:host.x, y:host.y + rise, z:host.z};
    for (let i=path.length-1; i>=0; i--) {
      const seen = path.length - i;
      const from = {...path[i], y:path[i].y + rise};
      this.stroke(from, to, .13 * (1 - seen / (path.length + 2)), seen % 3 === 0 ? pale : ink);
      to = from;
    }
  }

  drawWeir(cue,age,game,ink,pale) {
    if (cue.type==='techniqueArtStart') {
      const live=game.techniqueArts?.find(art=>art.id===cue.id);
      if(!live||live.flow)return;
      const [a,b]=cue.points;
      const build=THREE.MathUtils.smoothstep(age,0,cue.delay);
      const clearing=fade(Math.max(0,age-cue.duration+.29),.29);
      const lip=t=>({x:lerp(a.x,b.x,t),y:a.y+.14+Math.sin(t*Math.PI)*.13*build,z:lerp(a.z,b.z,t)});
      for(let i=0;i<8;i++) {
        const a=lip(.5+build*(i/8-.5));
        const b=lip(.5+build*((i+1)/8-.5));
        this.stroke(a,b,.12*build*clearing,i%3===0?pale:ink);
      }
      return;
    }
    if (cue.type==='techniqueArtRelease') {
      const {route,radius,duration}=cue;
      const distance=route.at(-1).along*Math.min(1,age/duration);
      const wash=fade(Math.max(0,age-duration),.36);
      for(let i=0;i<5;i++) {
        const back=distance-i*.85;
        if(back<0)break;
        const row=sampleRoute(route,back);
        const crest=(1-.11*i)*wash;
        const curl=(i===0?1:.50)/(1+i*.27);
        const height=(i===0?.89:.44)*wash;
        const point=t=>{
          const side=t*radius*crest;
          const lift=(1-t*t)*curl*height;
          const backwash=t*t*(1.04-i*.10)*crest;
          return {x:row.x+row.nx*side+row.nz*backwash,y:row.y+.11+lift,z:row.z+row.nz*side-row.nx*backwash};
        };
        for(let j=0;j<8;j++) {
          const a=point(-1+j*.25), b=point(-1+(j+1)*.25);
          const taper=.57+.43*Math.sin((j+.5)/8*Math.PI);
          this.stroke(a,b,(i===0?.25:.14)*taper*crest,ink);
          if(i<2) this.stroke({...a,y:a.y+.16},{...b,y:b.y+.16},.106*taper*crest,pale);
        }
        const across=radius*crest*(.83-i*.043);
        if (i>0) {
          const edge=side=>({x:row.x+row.nx*side,y:row.y+.105,z:row.z+row.nz*side});
          this.stroke(edge(-across),edge(across),.115*crest,pale);
        }
      }
      return;
    }
    const {to}=cue;
    const rot=cue.targetId*.73;
    for(let i=0;i<5;i++) {
      const a=rot+i*2.39996;
      const spread=.18+age*(1.9+i%2*.38);
      const bloom=fade(age,.44);
      this.splinter(to.x+Math.sin(a)*spread,to.y+.25+Math.sin(age*6)*.55,to.z+Math.cos(a)*spread,
        a,.36*bloom,.16*bloom,i<2?pale:ink);
    }
  }

  drawKite(cue,age,ink,pale) {
    if(cue.type==='techniqueArtImpact'){
      const {to,from}=cue;
      const width=.16*fade(age,.40);
      this.stroke({x:to.x,y:to.y+.27,z:to.z},{x:from.x,y:from.y+.55,z:from.z},width,ink);
      return;
    }
    if(cue.pickupAt && age<cue.pickupAt){
      const t=age/cue.pickupAt;
      const along=t=>({x:lerp(cue.launch.x,cue.from.x,t),y:lerp(cue.launch.y,cue.from.y,t)+.46+Math.sin(t*Math.PI)*.78,
        z:lerp(cue.launch.z,cue.from.z,t)});
      this.stroke(along(Math.max(0,t-.30)),along(t),.18*THREE.MathUtils.smoothstep(age,0,.08),ink);
      return;
    }
    const loadedFire=cue.carrier==='fire';
    const tint=loadedFire?'#aa4d36':cue.carrier==='poison'?'#536347':cue.carrier?'#71968c':ink;
    const highlight=loadedFire?'#d99557':pale;
    if(cue.type==='techniqueArtRelease'){
      if(cue.converted)return this.drawKiteSteam(cue,age);
      const open=THREE.MathUtils.smoothstep(age,0,.22);
      const wash=fade(age,cue.duration);
      const end=cue.to;
      const radius=cue.radius*(cue.vessel?1:.47);
      for(let i=0;i<7;i++){
        const a=i*2.39996+cue.id*.71;
        const from={x:end.x+Math.sin(a)*radius*.16,y:end.y+.36,z:end.z+Math.cos(a)*radius*.16};
        const tip={x:end.x+Math.sin(a+.33)*radius*open,y:end.y+.29+open*(.54+i%3*(loadedFire?.33:.18)),z:end.z+Math.cos(a+.33)*radius*open};
        this.stroke(from,tip,(loadedFire?.25:.17)*wash,i%3===0?highlight:tint);
        if(loadedFire&&i%2===0)this.splinter(tip.x,tip.y+.33*open,tip.z,a,.51*wash,.12*wash,highlight);
      }
      return;
    }
    const progress=THREE.MathUtils.clamp((age-(cue.pickupAt??0))/Math.max(.1,cue.duration-.10-(cue.pickupAt??0)),0,1);
    const current=cue.curve.getPoint(progress);
    const direction=cue.curve.getTangent(progress);
    const normal=new THREE.Vector3(direction.z,0,-direction.x).normalize();
    const trace=cue.carrier?2:1;
    const lift=THREE.MathUtils.smoothstep(age,0,.14);
    const width=(cue.carrier?.84:.61)*lift;
    const tip=current.clone().addScaledVector(direction,.54);
    const base=current.clone().addScaledVector(direction,-.69);
    // Bowed shoulders and split tail give the carrier a moving paper-kite silhouette.
    for(const side of [-1,1]){
      const shoulder=current.clone().addScaledVector(normal,width*side);
      shoulder.y+=.30*lift;
      this.stroke(tip,shoulder,(loadedFire?.24:.17)*lift,loadedFire?'#743b2f':ink);
      this.stroke(shoulder,base,(loadedFire?.22:.14)*lift,tint);
      this.stroke(tip,base.clone().addScaledVector(normal,width*.13*side),.082*lift,highlight);
    }
    for(let strand=0;strand<trace;strand++){
      let previous=base;
      for(let i=1;i<=(loadedFire?12:8);i++){
        const t=progress-i*.045;
        if(t<0)break;
        const trailing=cue.curve.getPoint(t);
        const waving=(strand===0?.2:-.31)*Math.sin(i*.55+age*9)*(loadedFire?.64:1);
        trailing.addScaledVector(normal,waving);
        trailing.y+=Math.sin(i*.70+age*8)*.16;
        const taper=1-i/(loadedFire?14:10);
        this.stroke(previous,trailing,((loadedFire?.24:.15)*taper+.04)*lift,strand===0?tint:highlight);
        if(loadedFire&&strand===0&&i%3===2){
          this.splinter(trailing.x,trailing.y+.27+i*.025,trailing.z,i+age, .28*taper,.093*taper,highlight);
        }
        previous=trailing;
      }
    }
  }

  drawKiteDownpour(cue,age) {
    const {to,from,radius}=cue;
    if(!to) return;
    const wet='#567a85';
    const light='#d8e6e2';
    const thump=fade(age,cue.type==='techniqueArtBloom'?.63:.37);
    const open=THREE.MathUtils.smoothstep(age,0,.27);
    if(cue.type==='techniqueArtBloom') {
      const reach=radius*(.28+.79*open);
      for(let i=0;i<10;i++){
        const swing=i*Math.PI*.2;
        const r=reach*(.77+.20*Math.sin(i*4.36+cue.id));
        const foot={x:to.x+Math.sin(swing)*r,y:to.y+.19,z:to.z+Math.cos(swing)*r};
        const crest={x:to.x+Math.sin(swing+.53)*reach*.88,y:to.y+.15+(1-open)*(.58+i%3*.19),
          z:to.z+Math.cos(swing+.53)*reach*.88};
        this.stroke(foot,crest,(.19+thump*.17)*thump,i%4===1?light:wet);
      }
      return;
    }
    if(cue.type!=='techniqueArtImpact')return;
    const skew=Math.atan2(to.x-(from?.x??to.x),to.z-(from?.z??to.z));
    for (const bank of [-1,1]) {
      const spread=bank*(.17+open*.48);
      const start={x:to.x,y:to.y+.44+age*.26,z:to.z};
      const tail={x:to.x+Math.cos(skew)*spread,y:to.y+.12+open*.25,z:to.z-Math.sin(skew)*spread};
      this.stroke(start,tail,.16*thump,bank===-1?light:wet);
    }
  }

  drawKiteSteam(cue,age) {
    const {x,y,z,radius}=cue.to?{...cue.to,radius:cue.radius}:cue;
    const open=THREE.MathUtils.smoothstep(age,0,.25);
    const rise=THREE.MathUtils.smoothstep(age,.05,.49);
    const fadeOut=fade(Math.max(0,age-.24),.50);
    const lip='#729b90', paper='#e5dfc7';
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+cue.id*.2;
      const ribbon=(r,yaw,height)=>({x:x+Math.sin(angle+yaw)*r*radius,y:y+height,z:z+Math.cos(angle+yaw)*r*radius});
      const foot=ribbon(.12,0,.20);
      const shoulder=ribbon(.32+.31*open,-.44,.28+rise*1.33);
      const tip=ribbon(.55*open,.16,.35+rise*(2.25+(i%2)*.40));
      this.stroke(foot,shoulder,.21*fadeOut,lip);
      this.stroke(shoulder,tip,(.24+.09*open)*fadeOut,i%2===0?lip:paper);
      this.stroke({...shoulder,y:shoulder.y+.13},{...tip,y:tip.y+.15},.10*fadeOut,paper);
      if(age<.18)this.splinter(foot.x,foot.y+.39,foot.z,angle,.38*fade(age,.18),.12*fade(age,.18),'#da9059');
    }
  }

  drawPrism(cue,age,game,ink,pale) {
    if(cue.reaction==='frost-prism-hold'){
      const live=game.techniqueArts?.find(art=>art.id===cue.prismId);
      if(!live?.charge||live.jump||age>=cue.duration)return;
      const {x,y,z}=live.center;
      const hold=smooth(age,0,.08)*fade(age,cue.duration)*.70;
      this.splinter(x,y+.84,z,cue.prismId*.71,1.24*hold,.31*hold,'#584479');
      this.splinter(x,y+.96,z,cue.prismId*1.21,.83*hold,.17*hold,pale);
      return;
    }
    if(cue.carrier==='frost-fork'||cue.reaction==='frost-prism-fork'){
      this.drawFrostRelay(cue,age);
      return;
    }
    if(cue.type==='techniqueArtStart'){
      const live=game.techniqueArts?.find(art=>art.id===cue.id);
      if(!live||live.jump)return;
      const {x,y,z}=cue.center;
      const rise=THREE.MathUtils.smoothstep(age,0,.16);
      const fadeOut=fade(Math.max(0,age-cue.duration+.26),.26);
      const radius=cue.radius*fadeOut;
      const top={x,y:y+.18+rise*radius*1.85,z};
      const angle=cue.id*1.32;
      for(const [index,side] of [-1.21,.85,2.95].entries()){
        const foot={x:x+Math.cos(angle+side)*radius*.77,y:y-.10,z:z+Math.sin(angle+side)*radius*.77};
        this.stroke(foot,top,(.11+.047*index)*rise*fadeOut,index===1?pale:ink);
        const vein={x:lerp(foot.x,x,.47),y:y+.05+radius*rise*.85,z:lerp(foot.z,z,.47)};
        this.stroke(foot,vein,.17*rise*fadeOut,'#78a4ae');
      }
      return;
    }
    if(cue.type==='techniqueArtRelease'){
      const {route,via,radius,duration}=cue;
      const charged=fade(age,.40);
      const front=route.at(-1).along*THREE.MathUtils.clamp(age/duration,0,1);
      const before=cue.from;
      const span=Math.hypot(before.x-via.x,before.y-via.y,before.z-via.z);
      if(span>.25&&age<.16){
        const near={x:lerp(via.x,before.x,Math.min(1,2.6/span)),
          y:lerp(via.y,before.y,Math.min(1,2.6/span))+.18,z:lerp(via.z,before.z,Math.min(1,2.6/span))};
        this.stroke(near,via,.16*fade(age,.16),'#d9cdaa');
      }
      let previous={...via,y:via.y+.49};
      for(let step=1;step<=9;step++){
        const now=sampleRoute(route,front*step/9);
        const wave=step%2?.19:-.16;
        const ridge={x:now.x+now.nx*wave,y:now.y+.49,z:now.z+now.nz*wave};
        this.stroke(previous,ridge,.21*charged,'#524875');
        this.stroke({...previous,y:previous.y+.10},{...ridge,y:ridge.y+.10},.09*charged,'#e5dff1');
        previous=ridge;
      }
      const cracked=fade(age,.45);
      const surge=THREE.MathUtils.smoothstep(age,0,.27);
      for(let i=0;i<7;i++){
        const a=i*2.39996+cue.id*.69;
        const send=(.16+surge*(.84+i%3*.42))*radius;
        this.splinter(via.x+Math.cos(a)*send,via.y+.25+cracked*.58+surge*.95,via.z+Math.sin(a)*send,a,
          (.42+i%3*.18)*cracked,.13*cracked,i%2===0?pale:ink);
      }
      return;
    }
    const {to,from}=cue;
    const shock=fade(age,.39);
    const yaw=Math.atan2(to.x-from.x,to.z-from.z);
    for(const side of [-1,1]) {
      const peak={x:to.x+Math.cos(yaw)*side*(.47+age*2),y:to.y+.8+age*.55,z:to.z-Math.sin(yaw)*side*(.47+age*2)};
      this.stroke(to,peak,.20*shock,'#524875');
      this.stroke({...to,y:to.y+.1},{...peak,y:peak.y+.15},.088*shock,pale);
    }
  }

  drawFrostRelay(cue,age) {
    const dark='#30234b', violet='#726593', edge='#ecf3e9';
    const drawLine=(route,reach,load)=>{
      if(reach<.03||load<.035)return;
      let previous=sampleRoute(route,0);
      const segments=14;
      for(let i=1;i<=segments;i++){
        const point=sampleRoute(route,reach*i/segments);
        const arc=Math.sin(i*Math.PI/segments);
        const spread=(i%2?.19:-.19)*arc;
        const next={x:point.x+point.nx*spread,y:point.y+.17+.28*arc,z:point.z+point.nz*spread};
        this.stroke(previous,next,.36*load,dark);
        this.stroke({...previous,y:previous.y+.18},{...next,y:next.y+.18},.19*load,violet);
        this.stroke({...previous,y:previous.y+.26},{...next,y:next.y+.26},.082*load,edge);
        previous=next;
      }
    };
    const crystal=(p,load,scale)=>{
      const height=scale*(.68+load*.47);
      const top={...p,y:p.y+height};
      for(let i=0;i<3;i++){
        const a=i*Math.PI*2/3+cue.id*.51;
        const foot={x:p.x+Math.sin(a)*scale*.33,y:p.y+.16,z:p.z+Math.cos(a)*scale*.33};
        this.stroke(foot,top,.19*load,i===1?edge:dark);
      }
    };
    if(cue.type==='techniqueArtImpact'){
      const p=cue.to??cue;
      const load=fade(age,cue.killed?.48:.26);
      const open=smooth(age,0,.28);
      const count=cue.killed?7:3;
      const line=Math.atan2(p.x-cue.from.x,p.z-cue.from.z);
      for(let i=0;i<count;i++){
        const slip=(i-(count-1)*.5)/count;
        const reach=.43+open*(1.04+(i%3)*.37);
        const x=p.x+Math.cos(line)*slip*reach+Math.sin(line)*.22*open;
        const z=p.z-Math.sin(line)*slip*reach+Math.cos(line)*.22*open;
        this.splinter(x,p.y+.25+open*(.45+.19*(i%3)),z,line+i*.63,
          (.57+.22*(i%3))*load,.23*load,i%3===0?dark:edge);
      }
      return;
    }
    const {route,duration}=cue;
    const progress=smooth(age,0,duration);
    const load=(.35+.65*smooth(age,0,.065))*(1-smooth(age,duration+.13,duration+.51));
    drawLine(route,route.at(-1).along*progress,load);
    if(cue.reaction==='frost-prism-fork'){
      crystal(cue.from,load*.68,.94);
      crystal(cue.to,load*smooth(age,duration*.43,duration*.9),1.72);
    }else{
      crystal(cue.via,load,1.94);
      if(cue.from&&age<.20){
        const entry=measureRoute([cue.from,cue.via]);
        drawLine(entry,entry.at(-1).along,fade(age,.20)*.64);
      }
    }
  }

  draw(cue,age,game) {
    const [ink, pale]=colors[cue.kind];
    if(cue.kind==='sporeseed')return this.drawSpore(cue,age,game,ink,pale);
    if(cue.kind==='bankweir')return this.drawWeir(cue,age,game,ink,pale);
    if(cue.kind==='windkite')return cue.secondary==='kite-downpour'?this.drawKiteDownpour(cue,age):this.drawKite(cue,age,ink,pale);
    if(cue.kind==='icekeel')return this.drawPrism(cue,age,game,ink,pale);
    const center=cue.center??cue.to??cue;
    const target=cue.to??cue;
    const id=cue.targetId??cue.id??0;
    if(cue.type==='techniqueArtStart'){
      if(cue.kind==='stonecrest'){
        for(const [order,site] of (cue.points??[center]).entries()){
          const elapsed=age-order*.19;
          if(elapsed<0)continue;
          const rise=(elapsed-(cue.delay??.34))/.24;
          const radius=cue.radius??2.5;
          for(let i=0;i<14;i++){
            const a=i*Math.PI*2/14+id*.13;
            const edge=radius*(.70+.21*Math.cos(i*2.39));
            const size=rise<0?.05:Math.max(.06,Math.sin(Math.min(1,rise)*Math.PI)*(.78+i%4*.27));
            this.splinter(site.x+Math.cos(a)*edge,site.y+.08+size*.49,
              site.z+Math.sin(a)*edge,a,size,.24*fade(elapsed,.85),i%4===0?pale:ink);
          }
        }
      }else if(cue.kind==='emberwings'){
        const live=game.techniqueArts?.find(art=>art.id===cue.id);
        const orbit=live?.orbitRadius??cue.orbitRadius??1.7;
        const origin=game.p;
        const start=cue.delay??.42;
        for(let i=0;i<2;i++){
          const travel=fade(Math.max(0,age-start-i*.22),.12);
          for(let j=0;j<7;j++){
            const a=age*13+i*Math.PI+id*.2-j*.22;
            const radius=orbit*(.93+j*.022);
            this.splinter(origin.x+Math.sin(a)*radius,origin.y+.35+.45*Math.cos(a),
              origin.z+Math.cos(a)*radius,a,(.21-j*.018)*travel,(.23-j*.023)*travel,j%3===0?pale:ink);
          }
        }
      }
      return;
    }
    const from=cue.from??center;
    const presence=fade(age,.46);
    if(cue.launch){
      const flight=cue.travel??.23;
      for(let i=0;i<8;i++){
        const t=(age-i*.011)/flight;
        if(t<0||t>1)continue;
        const y=lerp(from.y,target.y,t)+Math.sin(t*Math.PI)*1.28;
        const width=.31-i*.021;
        this.splinter(lerp(from.x,target.x,t),y,lerp(from.z,target.z,t),id+i,
          width*.88,width,i<3?pale:ink);
      }
      return;
    }
    if(cue.kind==='hoarfrost'){
      const path=Array.isArray(cue.route)&&cue.route.length>1?cue.route:[from,target];
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i];
        const cut={x:lerp(a.x,b.x,.52)+.13,y:lerp(a.y,b.y,.52)+.46,z:lerp(a.z,b.z,.52)};
        this.stroke(a,cut,.10*presence,ink);
        this.stroke(cut,b,.13*presence,pale);
      }
    }
    const reach=Math.min(.8,age*3.2);
    for(let i=0;i<7;i++){
      const a=i*2.39+id*.73;
      const size=(.16+i%3*.048)*presence;
      this.splinter(target.x+Math.cos(a)*reach,target.y+.24+age*(2+i%4*.5),
        target.z+Math.sin(a)*reach,a,size*(cue.kind==='stonecrest'?1.55:1),size*.66,i%3===0?pale:ink);
    }
  }

  update(game,time,depth,resolution) {
    this.cues=this.cues.filter(cue=>time-cue.time<
      (cue.type==='techniqueArtStart'?Math.min(['icekeel','bankweir'].includes(cue.kind)?5.8:1.7,(cue.duration??.4)+.15)
        :cue.reaction==='frost-prism-hold'?cue.duration
        :cue.type==='techniqueArtRelease'?cue.duration+.36:cue.type==='techniqueArtBloom'?.82:.46));
    const uniforms=this.mesh.material.uniforms;
    uniforms.tDepth.value=depth;
    uniforms.uResolution.value.copy(resolution);
    this.written=0;
    for(const cue of this.cues)this.draw(cue,Math.max(0,time-cue.time),game);
    this.mesh.count=this.written;
    if(!this.written)return;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceColor.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0,this.written*16);
    this.mesh.instanceColor.addUpdateRange(0,this.written*3);
    this.mesh.instanceMatrix.needsUpdate=true;
    this.mesh.instanceColor.needsUpdate=true;
  }
}
