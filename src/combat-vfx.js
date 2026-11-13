import * as THREE from 'three';
const TAU=Math.PI*2;
const COLORS={storm:0xa9f5eb,fire:0xffa54e,poison:0xb0e97d,rain:0x79cfff,steam:0xe4efd9,cloud:0xc7dbeb,thunder:0xc7b3ff,ring:0xf3dc94};
const torus=new THREE.TorusGeometry(1,.025,3,44),arcGeo=new THREE.TorusGeometry(1,.038,3,32,Math.PI*1.45),sphere=new THREE.IcosahedronGeometry(1,1),cube=new THREE.BoxGeometry(1,1,1),flameGeo=new THREE.ConeGeometry(.35,1,5);
const mats=new Map();
function mat(color,opacity=1,additive=false){const key=`${color}:${opacity}:${additive}`;if(!mats.has(key))mats.set(key,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity>=1,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending}));return mats.get(key);}
export class CombatVFX {
  constructor(scene){this.scene=scene;this.root=new THREE.Group();scene.add(this.root);this.fields=new Map();this.transients=[];this.particles=[];this.pool=new THREE.InstancedMesh(cube,new THREE.MeshBasicMaterial({vertexColors:false}),1600);this.pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.pool.frustumCulled=false;this.root.add(this.pool);this.nodes=new THREE.InstancedMesh(sphere,new THREE.MeshBasicMaterial({transparent:true,opacity:.85}),10);this.nodes.frustumCulled=false;this.root.add(this.nodes);this.dummy=new THREE.Object3D();this.color=new THREE.Color();this.clock=0;}
  burst(p,color,n=18,speed=4){for(let i=0;i<n&&this.particles.length<1500;i++){const a=Math.random()*TAU,k=Math.random()*speed;this.particles.push({x:p.x,y:p.y??.7,z:p.z,vx:Math.cos(a)*k,vz:Math.sin(a)*k,vy:(Math.random()-.2)*speed,color,life:.4+Math.random()*.5,size:.06+Math.random()*.08});}}
  pulse(p,color=0xcdf6dd,radius=2,life=.6){if(this.transients.length>90)return;const m=new THREE.Mesh(torus,mat(color,.7,true));m.rotation.x=-Math.PI/2;m.position.set(p.x,p.y??.3,p.z);this.root.add(m);this.transients.push({m,life,max:life,radius,pulse:true});}
  bolt(from,to,power=1,conductive=false,branch=false){
    if(this.transients.filter(t=>t.bolt).length>24)return;const points=[],start=new THREE.Vector3(from.x,from.y??.7,from.z),end=new THREE.Vector3(to.x,to.y??.7,to.z),d=start.distanceTo(end);
    const sections=conductive?8:12;
    for(let i=0;i<=sections;i++){const t=i/sections,v=start.clone().lerp(end,t),j=Math.sin(t*Math.PI)*Math.min(1,d*(conductive?.063:.09));v.x+=(Math.random()-.5)*j;v.y+=(Math.random()-.5)*j;v.z+=(Math.random()-.5)*j;points.push(v);}
    const curve=new THREE.CatmullRomCurve3(points),group=new THREE.Group();
    group.userData.kind=branch?'relay-arc':conductive?'wet-arc':'dry-arc';
    const width=branch?.72:1;
    const outer=new THREE.Mesh(new THREE.TubeGeometry(curve,28,((conductive?.155:.10)+power*.008)*width,4,false),mat(0x7a9fff,conductive?.49:.32,true));
    const core=new THREE.Mesh(new THREE.TubeGeometry(curve,28,(conductive?.053:.035)*width,3,false),mat(0xf9f6d8));group.add(outer,core);
    const life=branch?.27:conductive?.35:.24;
    this.root.add(group);this.transients.push({m:group,life,max:life,bolt:true,steady:conductive,owned:true});this.burst(to,0xbce9ff,branch?2:4,2);
  }
  bodyArc(points){if(points.length<3)return;const m=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,p.y+.5,p.z))),Math.min(100,points.length*3),.07,4,false),mat(0xd2e9ff,.8,true));this.root.add(m);this.transients.push({m,life:.55,max:.55,owned:true});}
  chargeLane(event){
    const from=new THREE.Vector3(event.from.x,event.from.y,event.from.z);
    const to=new THREE.Vector3(event.to.x,event.to.y,event.to.z);
    const direction=to.clone().sub(from);
    if(direction.lengthSq()<.01)return;
    const across=new THREE.Vector3(direction.z,0,-direction.x).normalize().multiplyScalar(event.width??.65);
    const strokes=new THREE.Group();
    strokes.userData.hostileWarning=true;
    const gaps=[[.02,.23],[.29,.53],[.59,.76],[.83,.98]];
    for(const side of [-1,1])for(const [start,end] of gaps){
      const a=from.clone().addScaledVector(direction,start).addScaledVector(across,side);
      const b=from.clone().addScaledVector(direction,end).addScaledVector(across,side);
      const line=new THREE.Mesh(cube,mat(0xe2644e,.88));
      line.position.copy(a).lerp(b,.5);
      line.scale.set(.158,.048,a.distanceTo(b));
      line.lookAt(b);
      strokes.add(line);
    }
    this.root.add(strokes);
    const duration=event.duration??1.1;
    this.transients.push({m:strokes,life:duration,max:duration});
  }
  event(e){
    if(e.type==='bossCharge'){this.chargeLane(e);return;}
    if(e.type==='bossWave'){const geometry=new THREE.TorusGeometry(1,.045,3,44,TAU-1.2),m=new THREE.Mesh(geometry,mat(0xa9dcf3,.6));m.rotation.x=-Math.PI/2;m.rotation.z=e.gap-Math.PI/2+.6;m.position.set(e.x,e.y,e.z);this.root.add(m);this.transients.push({m,life:2,max:2,radius:7.6,pulseStart:0,pulse:true,owned:true});return;}
    if(e.type==='arc'){this.bolt(e.from,e.to,e.power,e.conductive,e.branch);return;}
    if(e.type==='bodyArc'){this.bodyArc(e.points);return;}
    if(e.type==='hit'){
      const color=e.guarded ? 0xdbbd87 : e.source==='fire' ? 0xffbd69 : e.source==='poison' ? 0xc7ee8b : 0xf4edbc;
      this.burst(e,color,e.guarded?8:e.boss?5:2,e.guarded?3.8:2);
    }
    if(e.type==='kill'){this.burst(e,0xf3d9b8,12,4);this.pulse(e,0xcdeab8,.65,.35);}
    if(e.type==='hurt'){this.burst(e,0xb9e9a3,25,5);this.pulse(e,0xffb3a1,2);}
    if(e.type==='dash'){this.burst(e,0xbff9ee,35,5);this.pulse(e,0xc7f5de,3);}
    if(e.type==='eat'&&e.rank>=2)this.burst(e,[0xf1efd1,0xb9ed94,0x9ee5ff,0xe4b5ff,0xffdf85][e.rank],8,2);
    if(e.type==='recover')this.burst(e,0xa9efbc,8,2);
    if(e.type==='evolve'){
      this.burst(e,0xffe4a3,24,4);
      this.pulse({...e,y:(e.y||.7)+.24},0xf8e9b1,3.5,.74);
    }
    if(e.type==='ringBurst'){this.burst(e,0xffe5a2,70,8);for(let i=0;i<4;i++)this.pulse({...e,y:e.y+i*.35},i%2?0xa8ecf2:0xf3dda4,e.radius*(1+i*.25),1);}
    if(e.type==='reaction'){this.burst(e,0xdbb5ff,25,4);this.pulse(e,0xc5c6ff,3,.8);}
  }
  makeField(z){
    const g=new THREE.Group();g.userData.kind=z.kind;
    for(let i=0;i<7;i++){const r=new THREE.Mesh(['storm','fire'].includes(z.kind)?arcGeo:torus,mat(COLORS[z.kind]||COLORS.storm,.5,true));r.rotation.x=-Math.PI/2;g.add(r);}
    for(let i=0;i<5;i++){const puff=new THREE.Mesh(sphere,mat(COLORS[z.kind]||0xe8f4df,.17));g.add(puff);}
    for(let i=0;i<8;i++)g.add(new THREE.Mesh(flameGeo,mat(i%2?0xffa340:0xffde8b,.82)));
    if(z.kind==='ring'){const line=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf7e6a7,transparent:true,opacity:.9}));g.add(line);g.userData.line=line;}
    this.root.add(g);return g;
  }
  update(game,dt){this.clock+=dt;const t=this.clock,live=new Set();
    const organs=game.organs();this.nodes.count=organs.length;organs.forEach((node,i)=>{const p=game.bodyPath[node.index]||game.p;this.dummy.position.set(p.x,p.y+.32,p.z);this.dummy.scale.setScalar(.12+Math.sin(t*4+i)*.025);this.dummy.updateMatrix();this.nodes.setMatrixAt(i,this.dummy.matrix);this.nodes.setColorAt(i,this.color.setHex(COLORS[node.type]||0xd8edb6));});this.nodes.instanceMatrix.needsUpdate=true;if(this.nodes.instanceColor)this.nodes.instanceColor.needsUpdate=true;
    if(dt)for(const s of game.shots)if(Math.random()<dt*16)this.burst(s,s.kind==='poison'?0xb9e87e:0xb0f0e8,1,.4);
    for(const z of game.zones){live.add(z.id);let g=this.fields.get(z.id);if(!g){g=this.makeField(z);this.fields.set(z.id,g);}g.position.set(z.x,z.y,z.z);
      const color=z.flame?COLORS.fire:z.toxic?COLORS.poison:COLORS[z.kind]||COLORS.storm,wind=z.kind==='storm',cloud=['steam','cloud','thunder','rain'].includes(z.kind),fire=z.kind==='fire',toxic=z.kind==='poison';
      for(let i=0;i<7;i++){const r=g.children[i],k=i/6;r.material=mat(color,z.flame||fire?.65:.3,!(z.flame||fire));r.visible=!cloud&&(!(toxic||z.kind==='ring')||i<2);
        r.position.set(Math.sin(t*3+k*5)*.25,wind?k*(3.2+z.power*.4):fire?k*2.6:.03+i*.03,Math.cos(t*3+k*5)*.25);
        const radius=wind?z.radius*(.18+k*.7):fire?z.radius*(.55-k*.4):z.radius*(.85+Math.sin(t*2+i)*.04);r.scale.set(radius,radius,1);r.rotation.z=t*(i%2?1:-1)*1.3;
      }
      for(let i=0;i<5;i++){const puff=g.children[7+i],a=i*2.4+t*.18;puff.visible=(cloud&&i<3)||wind||fire||(toxic&&i<3);puff.material=mat(color,cloud?.12:fire?.1:toxic?.16:.05);const height=z.kind==='steam'?1+(t*.6+i*.35)%1.8:cloud?1.5+Math.sin(a)*.3:toxic?.3+Math.sin(a)*.15:1+i*.6;puff.position.set(Math.cos(a)*z.radius*.4,height,Math.sin(a)*z.radius*.4);puff.scale.set(z.radius*.4,cloud?.7:toxic?.35:z.radius*.4,z.radius*.4);}
      for(let i=0;i<8;i++){const flame=g.children[12+i],a=t*(wind?4:2)+i*.79,k=(i+Math.sin(t*3+i)*.4)/8;flame.visible=fire||!!z.flame;flame.position.set(Math.cos(a)*z.radius*(.2+k*.3),.7+k*(wind?4:2),Math.sin(a)*z.radius*(.2+k*.3));flame.rotation.z=Math.sin(a)*.45;flame.rotation.x=Math.cos(a)*.45;flame.scale.set(1+k*.6,1.8+Math.sin(t*9+i)*.6,1+k*.6);}
      if(g.userData.line){const points=z.polygon.map(p=>new THREE.Vector3(p.x-z.x,.12,p.z-z.z));g.userData.line.geometry.dispose();g.userData.line.geometry=new THREE.BufferGeometry().setFromPoints(points);}
      if(dt&&Math.random()<dt*(wind?35:fire?25:cloud?12:8)){const a=Math.random()*TAU,r=Math.random()*z.radius,point={x:z.x+Math.sin(a)*r,y:z.y+(cloud?2:Math.random()*2),z:z.z+Math.cos(a)*r};this.burst(point,color,1,wind?1:2);}
      if(cloud&&dt){const rate=z.kind==='rain'?30:10;for(let i=0;i<Math.floor(rate*dt+Math.random());i++){this.particles.push({x:z.x+(Math.random()-.5)*z.radius*1.5,y:z.y+2,z:z.z+(Math.random()-.5)*z.radius*1.5,vx:0,vy:-4,vz:0,color:0x9acfff,life:.5,size:.06});}}
    }
    for(const [id,g]of this.fields)if(!live.has(id)){this.root.remove(g);if(g.userData.line){g.userData.line.geometry.dispose();g.userData.line.material.dispose();}this.fields.delete(id);}
    for(let i=this.transients.length-1;i>=0;i--){const q=this.transients[i];q.life-=dt;if(q.life<=0){this.root.remove(q.m);if(q.owned)q.m.traverse(m=>{if(m.geometry)m.geometry.dispose();});this.transients.splice(i,1);continue;}if(q.pulse)q.m.scale.setScalar(q.radius*((q.pulseStart??.15)+1-q.life/q.max));q.m.visible=!q.bolt||q.steady||Math.floor(q.life*45)%3!==0;}
    this.particles=this.particles.filter(p=>{p.life-=dt;if(p.life<=0)return false;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.vy-=dt*1.8;return true;}).slice(-1500);
    this.pool.count=this.particles.length;this.particles.forEach((p,i)=>{this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(t+i,t*.5,0);this.dummy.scale.setScalar(p.size*Math.min(1,p.life*4));this.dummy.updateMatrix();this.pool.setMatrixAt(i,this.dummy.matrix);this.pool.setColorAt(i,this.color.setHex(p.color));});this.pool.instanceMatrix.needsUpdate=true;if(this.pool.instanceColor)this.pool.instanceColor.needsUpdate=true;
  }
  reset(){for(const q of this.transients){this.root.remove(q.m);if(q.owned)q.m.traverse(m=>m.geometry?.dispose());}this.transients=[];for(const g of this.fields.values()){this.root.remove(g);if(g.userData.line){g.userData.line.geometry.dispose();g.userData.line.material.dispose();}}this.fields.clear();this.particles=[];this.pool.count=0;}
}
