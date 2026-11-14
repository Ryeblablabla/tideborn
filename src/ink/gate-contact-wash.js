import { DoubleSide, DynamicDrawUsage, MathUtils, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { COURT_PAW_STEPS, LOCK_STAIR, STOMP_LOAD } from '../heaven-finale.js';

const { smoothstep } = MathUtils;
const vertexShader = `
  varying vec2 vSurface;
  void main(){
    vSurface=uv*2.-1.;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;
const fragmentShader = `
  varying vec2 vSurface;
  uniform float uOpacity,uOffset;
  uniform float uSpread;
  void main(){
    float grain=fract(sin(dot(floor((vSurface+.013)*47.),vec2(91.3,173.6)))*49318.1);
    vec2 point=vSurface;
    point.x+=.12*sin(point.y*5.+uOffset);
    float distanceToCenter=length(point*vec2(.88,1.));
    float stain=1.-smoothstep(.25,.94,distanceToCenter+(grain-.5)*.13);
    float dry=.57+.43*grain;
    float lip=(1.-smoothstep(.022,.12,abs(distanceToCenter-.72+(grain-.5)*.19)))*uSpread;
    gl_FragColor=vec4(.09+.14*(1.-stain),lip*.37,grain,max(stain,lip*.43)*uOpacity*dry);
  }
`;

function stain(geometry, offset) {
  const material = new ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uOffset: { value: offset }, uSpread: { value: 0 } },
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = '龙爪和龙身的地面墨影';
  mesh.userData.inkIdSuppressed = true;
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
}

function show(mesh, x, y, z, width, depth, opacity) {
  mesh.visible = opacity > .007;
  if (!mesh.visible) return;
  mesh.position.set(x,y,z);
  mesh.scale.set(width, 1, depth);
  mesh.material.uniforms.uOpacity.value = opacity;
}

export class GateContactWash {
  constructor() {
    this.geometry = new PlaneGeometry(2,2).rotateX(-Math.PI*.5);
    this.paw = [stain(this.geometry, 0), stain(this.geometry, 2.3)];
    this.courtPrints = [stain(this.geometry, 5.5), stain(this.geometry, 8.2)];
    this.courtPlant = new Vector3();
    this.courtFarPlant = new Vector3();
    const subdivisions = 14;
    this.lockGeometry = new PlaneGeometry(2,2,subdivisions,subdivisions).rotateX(-Math.PI*.5);
    this.lockGeometry.attributes.position.setUsage(DynamicDrawUsage);
    this.lockPaw = stain(this.lockGeometry,7.1);
    this.lockPaw.name='锁龙前爪的阶面墨影';
    this.lockPaw.frustumCulled=false;
    this.holder = null;
    this.point = new Vector3();
    this.along = new Vector3();
  }

  update(landmark, finale, contacts) {
    if (landmark !== this.holder) {
      this.holder = landmark;
      landmark?.add(...this.paw,...this.courtPrints,this.lockPaw);
    }
    const age=finale?.age??0;
    const stomp=finale?.phase==='stomp';
    const locked=finale?.ending==='locked';
    const court=finale?.phase==='audience';
    if(!court||this.courtSeal!==finale||age<1.68){
      this.courtSeal=court?finale:null;
      this.courtPlantAge=null;
      this.courtFarPlantAge=null;
    }
    const captured=contacts?.courtToe;
    if(court&&captured&&age>=1.68&&this.courtPlantAge==null){
      landmark.worldToLocal(this.point.copy(captured));
      if(age<2.28&&this.point.y<1.072){
        this.courtPlant.copy(this.point);
        this.courtPlantAge=age;
      }
    }
    const farToe=contacts?.courtFarToe;
    if(court&&farToe&&this.courtFarPlantAge===null){
      landmark.worldToLocal(this.point.copy(farToe));
      if(this.point.y<1.08){
        this.courtFarPlant.copy(this.point);
        this.courtFarPlantAge=age;
      }
    }
    for(const [i,mesh] of this.courtPrints.entries()){
      if(i===1&&court&&this.courtFarPlantAge!==null){
        const since=age-this.courtFarPlantAge;
        const spread=smoothstep(since,.008,.31);
        const {x,z}=this.courtFarPlant;
        show(mesh,x,1.043,z,.18+.32*spread,.24+.40*spread,
          smoothstep(since,-.018,.050)*(.81-.42*spread)*(1-smoothstep(since,.40,.85)));
        mesh.material.uniforms.uSpread.value=1-smoothstep(since,.22,.65);
        continue;
      }
      if(i===1&&court&&farToe){
        landmark.worldToLocal(this.point.copy(farToe));
        const pressure=1-smoothstep(this.point.y,1.045,1.41);
        show(mesh,this.point.x,1.043,this.point.z,.19,.24,pressure*.47);
        mesh.material.uniforms.uSpread.value=0;
        continue;
      }
      if(i===0&&court&&this.courtPlantAge!==null){
        const since=age-this.courtPlantAge;
        const spread=smoothstep(since,.02,.47);
        const {x,z}=this.courtPlant;
        show(mesh,x,1.043,z,.17+.42*spread,.25+.56*spread,
          smoothstep(since,-.016,.041)*(1-.32*spread));
        mesh.material.uniforms.uSpread.value=1-smoothstep(since,.24,.87);
        continue;
      }
      if(i===0&&court&&captured){
        landmark.worldToLocal(this.point.copy(captured));
        const pressure=1-smoothstep(this.point.y,1.04,1.58);
        const {x,z}=this.point;
        show(mesh,x,1.043,z,.26-.12*pressure,.35-.17*pressure,pressure*.53);
        mesh.material.uniforms.uSpread.value=0;
        continue;
      }
      const since=age-COURT_PAW_STEPS[i];
      if(!court||since<0||!contacts?.front?.[i]){mesh.visible=false;continue;}
      landmark.worldToLocal(this.point.copy(contacts.front[i]));
      const spread=smoothstep(since,0,.48);
      const contact = 1-smoothstep(this.point.y,1.33,2.22);
      const ink=(.38+.51*(1-spread))*contact;
      show(mesh,this.point.x,1.043,this.point.z,.24+.32*spread,.32+.28*spread,ink);
      mesh.material.uniforms.uSpread.value=1-smoothstep(since,.27,.9);
    }
    const touch=stomp ? smoothstep(age,.74,finale.impactAt-.015)
      * (1-smoothstep(age,finale.impactAt+STOMP_LOAD-.08,finale.impactAt+STOMP_LOAD+.14)) : 0;
    for(const [i,mesh] of this.paw.entries()){
      if(!touch||!contacts?.front?.[i]){mesh.visible=false;continue;}
      landmark.worldToLocal(this.point.copy(contacts.front[i]));
      const height=Math.max(0,this.point.y-14.5);
      const pressure=smoothstep(age,finale.impactAt-.015,finale.impactAt+.12);
      show(mesh,this.point.x,14.522-pressure*.12,this.point.z,
        .48+height*.19+pressure*.15,.53+height*.14,touch*.84/(1+height));
    }
    const claw=contacts?.stairClaw;
    const sample=landmark?.userData.lockStairHeight??landmark?.userData.upperStairHeight;
    if(!locked||!claw||!sample){this.lockPaw.visible=false;return;}
    landmark.worldToLocal(this.point.copy(claw));
    const {x,y,z}=this.point;
    const floor=sample(x,z);
    if(!Number.isFinite(floor)){this.lockPaw.visible=false;return;}
    const height=Math.max(0,y-floor);
    const pressure=1-smoothstep(height,.10,.62);
    const approach=(1-smoothstep(height,.35,1.35))*smoothstep(age,3.55,4.11);
    const pressureRise=smoothstep(finale.elapsed??age,LOCK_STAIR.touch,LOCK_STAIR.landing);
    const opacity=Math.max(pressure*(.28+.36*pressureRise),approach*.26);
    const mesh=this.lockPaw;
    mesh.visible=opacity>.007;
    if(!mesh.visible)return;
    // The toe is sampled after the rig settles. Let the footprint drape
    // over both the center ramp and adjacent stone courses.
    const {position,uv}=this.lockGeometry.attributes;
    const width=.51-.19*pressure;
    const depth=.65-.19*pressure;
    if(contacts.muzzle){
      landmark.worldToLocal(this.along.copy(contacts.muzzle)).sub(this.point);
      this.along.y=0;
      this.along.normalize();
    }else this.along.set(0,0,1);
    const across=this.along.x, ahead=this.along.z;
    for(let i=0;i<position.count;i++){
      const u=(uv.getX(i)*2-1)*width;
      const v=(uv.getY(i)*2-1)*depth;
      const sx=x+u*ahead+v*across;
      const sz=z-u*across+v*ahead;
      const tread=sample(sx,sz);
      position.setXYZ(i,sx,(Number.isFinite(tread)?tread:floor)+.021,sz);
    }
    position.needsUpdate=true;
    mesh.material.uniforms.uOpacity.value=opacity;
  }
}
