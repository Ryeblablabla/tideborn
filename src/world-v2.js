import * as THREE from 'three';
import { OceanScene } from './scene.js';
import { CombatVFX } from './combat-vfx.js';
import { AIR_ISLANDS } from './simulation.js';
import { random } from './model.js';
export class LivingWorld extends OceanScene {
  constructor(canvas){super(canvas);this.flatCamera=this.camera;this.flightCamera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.1,250);this.flight=0;this.viewYaw=null;this.viewPivot=new THREE.Vector3();this.viewFocus=new THREE.Vector3();this.combat=new CombatVFX(this.scene);this.sky=new THREE.Group();this.scene.add(this.sky);this.createSky();this.flashLight=new THREE.PointLight('#c4c9ff',0,35,1);this.scene.add(this.flashLight);this.character=null;this.factory=null;this.frame={};this.hitStop=0;window.addEventListener('tideborn:character-ready',()=>this.tryCharacter());this.tryCharacter();}
  tryCharacter(){const factory=window.TidebornCharacterFactory;if(typeof factory!=='function'||factory===this.factory)return;try{const runtime=factory({THREE,scene:this.scene});if(!runtime||typeof runtime.update!=='function')return;this.character?.dispose?.();this.character=runtime;this.factory=factory;}catch(e){console.warn('Character adapter unavailable',e);}}
  createSky(){
    const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{phase:{value:0},time:{value:0}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vP;uniform float phase;uniform float time;float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5);}void main(){float h=clamp(vP.y/100.+.4,0.,1.);vec3 c=mix(vec3(.77,.82,.73),vec3(.17,.32,.48),h);float sun=pow(max(0.,dot(normalize(vP),normalize(vec3(-.7,.3,-.4)))),80.);c+=sun*vec3(.65,.45,.22);vec3 night=mix(vec3(.3,.38,.53),vec3(.055,.08,.2),h);float stars=step(.997,hash(floor(vP*1.1)))*step(5.,vP.y);night+=stars*vec3(.7,.8,.7);float aurora=pow(max(0.,sin(vP.x*.055+sin(vP.z*.04+time*.08)*2.)),12.)*smoothstep(8.,40.,vP.y);night+=aurora*vec3(.08,.2,.15);c=mix(c,night,phase*.82);gl_FragColor=vec4(c,1.);}'});
    this.dome=new THREE.Mesh(new THREE.SphereGeometry(125,24,12),skyMat);this.sky.add(this.dome);
    const rng=random(7918),puffGeo=new THREE.IcosahedronGeometry(1,1),cloudMat=new THREE.MeshLambertMaterial({color:'#d6e4d7',transparent:true,opacity:.28,depthWrite:false});
    this.clouds=new THREE.InstancedMesh(puffGeo,cloudMat,180);this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.cloudData=[];const dummy=new THREE.Object3D();
    for(let i=0;i<180;i++){const q={x:(rng()-.5)*150,z:(rng()-.5)*150,y:3+(i%3)*5+rng()*2,size:2+rng()*4};this.cloudData.push(q);dummy.position.set(q.x,q.y,q.z);dummy.scale.set(q.size,.5+q.size*.16,q.size*.65);dummy.updateMatrix();this.clouds.setMatrixAt(i,dummy.matrix);}this.sky.add(this.clouds);
    const stone=new THREE.MeshToonMaterial({color:'#728f9c'}),top=new THREE.MeshToonMaterial({color:'#b0c5a3'}),crystalMat=new THREE.MeshBasicMaterial({color:'#cceff1'});
    this.airIslands=[];
    for(const q of AIR_ISLANDS){const g=new THREE.Group();g.position.set(q.x,q.y,q.z);g.userData.airIsland=true;g.userData.opacity=1;const rock=new THREE.Mesh(new THREE.ConeGeometry(q.rx,q.ry*3,7),stone.clone());rock.rotation.z=Math.PI;rock.position.y=-q.ry;g.add(rock);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(rock.geometry),new THREE.LineBasicMaterial({color:'#abcfd4',transparent:true,opacity:.35}));edges.visible=false;rock.add(edges);g.userData.edges=edges;const cap=new THREE.Mesh(new THREE.CylinderGeometry(q.rx,q.rx*.9,.5,8),top.clone());cap.scale.z=q.rz/q.rx;g.add(cap);for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.OctahedronGeometry(.4),crystalMat.clone());c.position.set((i-1)*.9,.6+i*.2,0);g.add(c);}this.sky.add(g);this.airIslands.push(g);g.updateWorldMatrix(true,true);}
    this.sunHalo=new THREE.Mesh(new THREE.TorusGeometry(13,.1,4,80),new THREE.MeshBasicMaterial({color:'#e6d49d',transparent:true,opacity:.35}));this.sunHalo.position.set(-35,27,-45);this.sky.add(this.sunHalo);
    this.practiceGuide=new THREE.Group();const guideMat=new THREE.LineDashedMaterial({color:'#f2dfa0',dashSize:.25,gapSize:.2,transparent:true,opacity:.8});
    for(let kind=0;kind<2;kind++){const points=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2,z=-4+i/100*8;points.push(kind?new THREE.Vector3(Math.sin(z*1.2)*2.3,.14,z):new THREE.Vector3(Math.cos(a)*2.6,.14,Math.sin(a)*2.6));}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),guideMat);line.computeLineDistances();this.practiceGuide.add(line);}this.scene.add(this.practiceGuide);
  }
  resize(){if(this.flatCamera)this.camera=this.flatCamera;super.resize();if(this.flightCamera){this.flightCamera.aspect=innerWidth/innerHeight;this.flightCamera.updateProjectionMatrix();}}
  pointer(x,y){this.plane.constant=-(this.lastHeight||0);return super.pointer(x,y);}
  fadeOccluders(game,dt){
    const blocked=new Set(),targets=[game.p,...(game.boss?[game.boss]:[]),...game.enemies.filter(e=>Math.hypot(e.x-game.p.x,e.z-game.p.z)<6).slice(0,2)];
    if(this.flight>.2)for(const target of targets){const end=new THREE.Vector3(target.x,target.y+.8,target.z),direction=end.clone().sub(this.camera.position),length=direction.length();this.ray.set(this.camera.position,direction.normalize());this.ray.far=length;for(const hit of this.ray.intersectObjects(this.airIslands,true)){let g=hit.object;while(g&&!g.userData.airIsland)g=g.parent;if(g)blocked.add(g);}}
    for(const g of this.airIslands){const goal=blocked.has(g)?.12:1;g.userData.opacity+=(goal-g.userData.opacity)*Math.min(1,dt*12);g.userData.edges.visible=g.userData.opacity<.7;g.traverse(m=>{if(m.isMesh){m.material.transparent=true;m.material.opacity=g.userData.opacity;m.material.depthWrite=g.userData.opacity>.9;}});}
    this.ray.far=Infinity;
  }
  event(e){this.combat.event(e);if(e.type==='arc'){this.flashLight.intensity=.75;this.flashLight.position.set(e.to.x,e.to.y+2,e.to.z);}if(e.type==='hurt')this.shake=.55;if(e.type==='ringBurst'){this.shake=Math.max(this.shake,.22);this.hitStop=.035;}if(e.type==='evolve')this.shake=.5;}
  followPlayer(game,dt){
    const {x,z,angle}=game.p;
    const focus=this.viewFocus.set(x,this.player.position.y,z);
    if(this.viewYaw===null||this.viewStage!==game.stage){
      this.viewStage=game.stage;
      this.viewYaw=angle;
      this.viewPivot.copy(focus);
    }else{
      const delta=angle-this.viewYaw;
      this.viewYaw+=Math.atan2(Math.sin(delta),Math.cos(delta))*(1-Math.exp(-dt*8.5));
      this.viewPivot.lerp(focus,1-Math.exp(-dt*10));
    }
    const a=this.flight;
    const sin=Math.sin(this.viewYaw),cos=Math.cos(this.viewYaw);
    const {x:px,y:py,z:pz}=this.viewPivot;
    const distance=THREE.MathUtils.lerp(25,21,a),height=THREE.MathUtils.lerp(30,12,a);
    const shoulder=5*a,ahead=THREE.MathUtils.lerp(1.5,2.5,a);
    this.camera=a>.005?this.flightCamera:this.flatCamera;
    this.camera.position.set(px-sin*distance+cos*shoulder,py+height,pz-cos*distance-sin*shoulder);
    this.camera.lookAt(px+sin*ahead,py,pz+cos*ahead);
    if(this.camera===this.flightCamera){
      this.flightCamera.fov=43+6*a;
      this.flightCamera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }
  render(game,dt,options={}){
    // Update shared actors first; presentation can be supplied by an art renderer.
    this.camera=this.flatCamera;super.render(game,dt,{...options,deferRender:true});
    const menu=options.menu,p=game.p,target=!menu&&game.stage>=2?1:0;this.flight+=(target-this.flight)*Math.min(1,dt*.8);this.sky.visible=this.flight>.01;
    this.tryCharacter();
    if(!menu){
      if (!this.isInk) {
        const rise=game.status==='ascending'?Math.min(10,game.ascend*1.3):0;this.player.position.y=p.y+rise;this.lastHeight=p.y;
        const spine=game.bodyPath||[];for(let i=0;i<this.body.length;i++){const b=this.body[i],q=spine[i+1];if(q&&b.visible)b.position.set(q.x,q.y+rise-.18,q.z);}
        this.spines.forEach((m,i)=>{const b=this.body[i*2];if(b&&m.visible)m.position.copy(b.position).add(new THREE.Vector3(0,b.scale.y*.93,0));});
        this.feet.children.forEach((m,i)=>{const q=spine[i<2?3:Math.min(8,spine.length-1)];if(q)m.position.y=q.y+rise-.2;});
        if(this.character){this.player.visible=false;this.body.forEach(m=>m.visible=false);this.spines.forEach(m=>m.visible=false);this.feet.visible=false;
          this.character.update({stage:game.form,position:{x:p.x,y:p.y+rise,z:p.z},heading:p.angle,spine,length:p.body,density:p.density,organs:game.organs(),casting:{wind:game.pose.wind,s:game.pose.s,ring:game.pose.ring},hurt:p.invul>0,ascending:game.status==='ascending'},dt);}
      }
      if(!this.isInk)for(const e of game.enemies){const m=this.enemyMeshes.get(e.id);if(m){m.position.y=e.y-.6;if(m.children[0])m.children[0].visible=e.y<2;}}
      for(const e of game.shots){const m=this.shotMeshes.get(e.id);if(m)m.position.y=e.y;}
      for(const e of game.hazards){const m=this.hazardMeshes.get(e.id);if(m)m.position.y=e.y;}
      for(const m of this.zoneMeshes.values())m.visible=false;
      if(!this.isInk && game.stage>=2){const dummy=this.dummy;game.food.slice(0,700).forEach((f,i)=>{const size=.12+f.rank*.045;dummy.position.set(f.x,f.y+Math.sin(this.t*2+f.phase)*.1,f.z);dummy.rotation.set(0,this.t*.8+f.phase,Math.PI/4);dummy.scale.set(size,size*1.4,size);dummy.updateMatrix();this.foodMesh.setMatrixAt(i,dummy.matrix);});this.foodMesh.instanceMatrix.needsUpdate=true;this.foodGlow.visible=false;}else this.foodGlow.visible=true;
    }else this.lastHeight=0;
    if(!this.isInk&&!menu)this.followPlayer(game,dt);
    if(!this.isInk&&!menu&&this.flight>.005){
      this.scene.fog.color.set(game.stage>=3?'#8b9db0':'#a8c8c4');this.scene.fog.near=45;this.scene.fog.far=115;this.dome.position.set(p.x,0,p.z);
      this.water.material.uniforms.uStage.value=game.stage+this.flight*2;
    }else this.scene.fog.color.set('#63b8aa');
    if(!this.bossShield){this.bossShield=new THREE.Mesh(new THREE.IcosahedronGeometry(3,1),new THREE.MeshBasicMaterial({color:'#a3ddfa',wireframe:true,transparent:true,opacity:.3,depthWrite:false}));this.scene.add(this.bossShield);}this.bossShield.visible=!!game.boss?.shield;if(game.boss){this.bossShield.position.set(game.boss.x,game.boss.y+1,game.boss.z);this.bossShield.rotation.y=this.t*.3;}
    this.fadeOccluders(game,dt);this.practiceGuide.visible=!!game.practice;this.practiceGuide.children.forEach((line,i)=>line.visible=i===(game.practiceStep===1?1:0));
    this.dome.material.uniforms.phase.value=game.stage>=3?1:0;this.dome.material.uniforms.time.value=this.t;this.flashLight.intensity=Math.max(0,this.flashLight.intensity-dt*3);this.combat.nodes.visible=!menu;this.combat.update(game,dt);this.present(game,dt,options);
  }
  reset(){super.reset();this.combat?.reset();this.character?.reset?.();this.flight=0;this.viewYaw=null;this.lastHeight=0;}
}
