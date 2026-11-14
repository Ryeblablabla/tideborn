import {
  DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry,
  MathUtils, Mesh, PlaneGeometry, ShaderMaterial, Vector3,
} from 'three';
import { random } from '../rules.js';

const terraceDrops = 64;
const featherSheets = 2;
const drops = terraceDrops + featherSheets;
const wingOffset = [0, 1, .255];
const { clamp, lerp, smoothstep } = MathUtils;

const defaultArrival = .59;
const across = new Vector3();

export function courtRainLanding(landmark, player, out) {
  landmark.worldToLocal(out.set(player.x, player.y, player.z));
  const matrix=landmark.matrixWorld.elements;
  const heading=player.angle-Math.atan2(matrix[8],matrix[10]);
  const steer=Math.sin(heading);
  const side=out.x < -1.65 || (out.x < 1.1 && steer < -.48) ? -1 : 1;
  out.x=side*(10.66+.92*clamp((side*out.x+1.6*side*steer)/7,0,1));
  out.z=clamp(out.z+2.05+2.01*Math.cos(heading)+1.33*side*steer,15.1,24.0);
  out.y=landmark.userData.wetCourtRoof?.heightAt(out.x,out.z)??7.04;
  return out;
}

const rainfall = /* glsl */ `
  attribute vec4 aRelease,aLanding,aBrush,aWingSpan;
  uniform float uAge;
  varying vec2 vBrush;
  varying float vAge,vInk,vSeed,vFeather;

  void place(vec3 point){
    vBrush=uv*2.-1.;
    vSeed=aBrush.z;
    vFeather=step(1.01,aBrush.w);
    gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);
  }

  vec3 falling(float age){
    float travel=clamp(age,0.,1.);
    vec3 point=mix(aRelease.xyz,aLanding.xyz,travel);
    point.y=mix(aRelease.y,aLanding.y,travel*(.53+.47*travel));
    return point;
  }
`;

const dropVertex = /* glsl */ `
  ${rainfall}
  void main(){
    float age=(uAge-aRelease.w)/aLanding.w;
    float sheet=step(1.01,aBrush.w);
    float length=mix(.24,.61,aBrush.z);
    length=mix(length,.86,sheet);
    float t=age-length*uv.y;
    vec3 point=falling(t);
    if(sheet>.5){
      float fall=clamp(t,0.,1.);
      vec3 span=aWingSpan.xyz;
      span.y*=1.-fall;
      // The wing's actual swept edge rides the top of the hanging sheet.
      vec3 sideways=normalize(cross(cameraPosition-point,falling(.83)-falling(.17))+vec3(.0001));
      vec3 visibleWidth=sideways*(dot(sideways,span)<0.?-1.:1.)*aWingSpan.w;
      span=mix(span,visibleWidth,smoothstep(.06,.37,fall)*.69);
      point+=span*position.x*mix(1.,.82,fall);
      point.y+=.38*(1.-position.x*position.x)*sin(fall*3.14159);
    }else{
      vec3 movement=normalize(falling(.75)-falling(.25));
      vec3 eye=normalize(cameraPosition-point);
      vec3 right=normalize(cross(eye,movement));
      point+=right*position.x*aBrush.x;
    }
    vAge=age;
    vInk=aBrush.w*smoothstep(.012,mix(.13,.24,sheet),age)
      *(1.-smoothstep(mix(.89,1.16,sheet),mix(1.08,1.71,sheet),age));
    place(point);
  }
`;

const dropFragment = /* glsl */ `
  varying vec2 vBrush;
  varying float vAge,vInk,vSeed,vFeather;
  void main(){
    float u=.5+.5*vBrush.y;
    if(vFeather>.5){
      float along=vBrush.x;
      float hairs=.51+.49*sin(along*22.7+vSeed*3.+2.31*u+sin(along*25.+u*3.)*.32);
      float backs=.50+.50*sin(along*5.6-vSeed*4.+u*.88);
      float rag=.50+.50*sin(along*34.9+vSeed+u*17.);
      float skirt=mix(.54,.70,hairs)+.22*backs+.04*rag;
      float pooling=(1.-smoothstep(.57,.98,abs(along)))*smoothstep(.05,.55,hairs*.68+backs*.32);
      float head=smoothstep(.015,.124,u)*(1.-smoothstep(skirt-.12,skirt+.09,u));
      float rim=1.-smoothstep(.014,.12,abs(u-.31-.05*backs));
      float vein=smoothstep(.57,.94,hairs)*(.61+.39*rag);
      float core=(1.-smoothstep(.29,.92,abs(along+.11*sin(7.8*u+vSeed))))*smoothstep(.16,.63,backs);
      float ink=1.41*vInk*head*(pooling*(.33+.52*vein)+.49*core);
      if(ink<.014)discard;
      float paper=smoothstep(.53,.86,hairs)*smoothstep(.26,.83,rag)*rim;
      gl_FragColor=vec4(.071+.15*backs,.056+.49*paper,.58,min(.94,ink));
      return;
    }
    float taper=sin(3.14159*pow(u,.68));
    float wet=.58+.42*sin(u*30.+vSeed*81.+1.6*sin(u*13.));
    float edge=abs(vBrush.x+.08*sin(u*14.+vSeed*23.));
    float breadth=taper*mix(.63,1.,wet);
    float profile=1.-smoothstep(breadth*.23,breadth*.83+max(.08,fwidth(edge)),edge);
    float ink=vInk*profile*taper*(.58+.42*wet);
    if(ink<.014)discard;
    gl_FragColor=vec4(.16+.22*wet,.06+.17*u,.57,min(.98,ink));
  }
`;

const contactVertex = /* glsl */ `
  ${rainfall}
  void main(){
    float age=uAge-aRelease.w-aLanding.w;
    float phase=smoothstep(.015,.59,age);
    float size=aBrush.y*(.20+.80*phase);
    float sheet=step(1.01,aBrush.w);
    vec2 span=aWingSpan.xz;
    vec2 across=span/max(length(span),.01);
    vec2 along=vec2(-across.y,across.x);
    vec2 strip=span*position.x*(.74+.25*phase)+along*position.y*(.18+size*.71);
    vec2 delta=mix(vec2(position.x*size,position.y*size*.79),strip,sheet);
    vec3 point=aLanding.xyz+vec3(delta.x,.024,delta.y);
    vAge=age;
    vInk=(1.-sheet)*aBrush.w*step(0.,age)*(1.-smoothstep(.29,.57,age));
    place(point);
  }
`;

const contactFragment = /* glsl */ `
  varying vec2 vBrush;
  varying float vAge,vInk,vSeed,vFeather;
  void main(){
    if(vFeather>.5){
      float x=vBrush.x;
      float cut=.49+.51*sin(x*18.33+vSeed*5.4+1.62*vBrush.y);
      float spread=.23+.52*smoothstep(.025,.41,vAge);
      float margin=abs(vBrush.y+(cut-.5)*.21);
      float wet=(1.-smoothstep(spread*.18,spread,margin))*(1.-smoothstep(.62,1.,abs(x)));
      float hair=(.24+.76*smoothstep(.13,.74,cut))*(.52+.48*sin(x*37.2-vBrush.y*8.)*.5);
      float brief=1.-smoothstep(.035,.28,vAge);
      float rim=1.-smoothstep(.05,.25,abs(margin-spread*.62));
      float ink=vInk*max(wet*hair,rim*hair*brief*.65)*(1.-smoothstep(.80,1.,abs(x)));
      if(ink<.014)discard;
      gl_FragColor=vec4(.24+.23*cut,.11+.36*rim*brief,.61,min(.89,ink));
      return;
    }
    float radius=length(vBrush);
    float angle=atan(vBrush.y,vBrush.x);
    float grain=.5+.5*sin(angle*6.+vSeed*27.+sin(angle*3.)*.56);
    float stain=(1.-smoothstep(.21,.83,radius+.18*(grain-.5)))*(.34+.39*grain);
    float rim=1.-smoothstep(.044,.16+min(.10,fwidth(radius)),abs(radius-.62-.08*grain));
    float splash=(1.-smoothstep(.055,.22,radius))*(1.-smoothstep(.025,.19,vAge));
    float scatter=rim*smoothstep(.24,.77,grain)*(.15+.35*(1.-smoothstep(.08,.42,vAge)));
    float alpha=vInk*max(stain,max(scatter,.91*splash));
    if(alpha<.014)discard;
    gl_FragColor=vec4(.43-.19*splash+.11*grain,.15+scatter*.52,.61,alpha);
  }
`;

function paint(geometry, clock, name, vertexShader, fragmentShader, order) {
  const material = new ShaderMaterial({
    uniforms: { uAge: clock }, vertexShader, fragmentShader, side: DoubleSide,
    transparent: true, depthWrite: false, forceSinglePass: true,
  });
  material.allowOverride=false;
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.inkIdSuppressed = true;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = order;
  return mesh;
}

/** The first wingbeat plants one rain front on the real roof. */
export class BlessingRain {
  constructor(scene) {
    const plane = new PlaneGeometry(2, 2);
    this.geometry = new InstancedBufferGeometry().copy(plane);
    plane.dispose();
    this.release = this.attribute('aRelease');
    this.landing = this.attribute('aLanding');
    this.brush = this.attribute('aBrush');
    this.wingSpan = this.attribute('aWingSpan');
    this.clock = { value: 0 };
    this.fall = paint(this.geometry, this.clock, '司雨 · 羽缘落成墨雨', dropVertex, dropFragment, 5);
    this.stone = paint(this.geometry, this.clock, '司雨 · 瓦面落雨', contactVertex, contactFragment, 4);
    scene.add(this.stone, this.fall);
    this.wrist = new Vector3();
    this.primary = new Vector3();
    this.releasePoint = new Vector3();
    this.landPoint = new Vector3();
    this.localPlayer = new Vector3();
    this.span = new Vector3();
    this.storm = {age:0, localLanding:new Vector3(), direction:new Vector3(), width:3.9, arrival:defaultArrival};
  }

  attribute(name) {
    const attribute = new InstancedBufferAttribute(new Float32Array(drops * 4), 4).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute(name, attribute);
    return attribute;
  }

  update(finale, actor, landmark, pressAt, player) {
    this.fall.visible = this.stone.visible = false;
    const wings = actor?.flightLimbs?.wings;
    if (finale?.phase !== 'blessing' || !wings || !landmark) {
      this.phase = null;
      return null;
    }
    const elapsed = finale.age - pressAt;
    if (this.phase !== finale || elapsed < 0) {
      this.phase = finale;
      this.released = false;
    }
    if (elapsed < 0) return null;
    if (!this.released) {
      const {localLanding,direction}=this.storm;
      courtRainLanding(landmark,player,localLanding);
      landmark.worldToLocal(this.localPlayer.set(player.x,player.y,player.z));
      direction.copy(localLanding).sub(this.localPlayer).setY(0).normalize();
      this.storm.arrival=clamp((this.localPlayer.y-localLanding.y)/8.6,.46,.73);
      this.sow(wings, actor, landmark);
      this.released = true;
    }
    if (elapsed < .18) this.setWingSheets(wings, actor, landmark);
    this.storm.age=elapsed;
    this.clock.value = elapsed;
    this.fall.visible = this.stone.visible = elapsed < 2.08;
    return this.storm;
  }

  land(landmark,out,lateral,along) {
    const {localLanding,direction}=this.storm;
    across.set(-direction.z,0,direction.x);
    out.copy(localLanding).addScaledVector(across,lateral).addScaledVector(direction,along);
    const side=Math.sign(localLanding.x);
    out.x=side*clamp(side*out.x,9.48,15.42);
    out.z=clamp(out.z,13.38,26.62);
    out.y=landmark.userData.wetCourtRoof?.heightAt(out.x,out.z)??localLanding.y;
    return landmark.localToWorld(out);
  }

  sow(wings, actor, landmark) {
    const rng = random(83194);
    const half = terraceDrops / 2;
    const {arrival,direction,width}=this.storm;
    for (let side = 0; side < wings.length; side++) {
      const { joints } = wings[side];
      actor.contactWorld(joints[3].bone.getWorldPosition(this.wrist), wingOffset, this.wrist);
      actor.contactWorld(joints[5].bone.getWorldPosition(this.primary), wingOffset, this.primary);
      landmark.worldToLocal(this.wrist);
      landmark.worldToLocal(this.primary);
      for (let i = 0; i < half; i++) {
        const selected = rng();
        const trail=(i/Math.max(1,half-1))**1.12;
        const spread=(rng()-.5)*(width+2.15*trail);
        const offset=.034+side*.045+trail*.93+rng()*.09;
        const release=this.releasePoint.copy(this.wrist).lerp(this.primary,.26+.71*rng());
        release.addScaledVector(direction,-.25+.56*trail);
        release.y-=.08+.42*trail;
        const landed=this.land(landmark,this.landPoint,spread+(side-.5)*1.35,-.82+trail*3.3+rng()*.61);
        const fallTime=arrival+lerp(-.10,.12,rng())+.11*trail;
        landmark.localToWorld(release);
        const index = side * half + i;
        this.release.setXYZW(index, release.x, release.y, release.z, offset);
        this.landing.setXYZW(index, landed.x, landed.y, landed.z, fallTime);
        const stroke=lerp(.038,.151,selected)*(1-.36*trail);
        const weight=lerp(.57,.96,rng())*(1-.21*trail);
        this.brush.setXYZW(index,stroke,lerp(.095,.24,selected),selected,weight);
      }
    }
    this.geometry.instanceCount = drops;
    this.setWingSheets(wings, actor, landmark);
    this.release.needsUpdate = this.landing.needsUpdate = this.brush.needsUpdate = true;
  }

  setWingSheets(wings, actor, landmark) {
    for(let side=0;side<wings.length;side++){
      const {joints}=wings[side];
      actor.contactWorld(joints[3].bone.getWorldPosition(this.wrist),wingOffset,this.wrist);
      actor.contactWorld(joints[5].bone.getWorldPosition(this.primary),wingOffset,this.primary);
      const release=this.releasePoint.copy(this.wrist).lerp(this.primary,.55);
      const landing=this.land(landmark,this.landPoint,(side-.5)*2.02,.05+.32*side);
      release.y-=.043;
      const span=this.span.subVectors(this.primary,this.wrist).multiplyScalar(.74);
      const index=terraceDrops+side;
      this.release.setXYZW(index,release.x,release.y,release.z,.013+side*.043);
      this.landing.setXYZW(index,landing.x,landing.y,landing.z,this.storm.arrival+.05*side);
      this.wingSpan.setXYZW(index,span.x,span.y,span.z,1.12);
      this.brush.setXYZW(index,.11,.70,.26+side*.61,1.08);
    }
    this.release.needsUpdate=this.landing.needsUpdate=this.brush.needsUpdate=this.wingSpan.needsUpdate=true;
  }
}
