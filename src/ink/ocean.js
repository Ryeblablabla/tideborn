import * as THREE from 'three';
import { SeaContact, contactWashGLSL } from './water-contact.js';
import { SwimWake } from './swim-wake.js';
import { combatWaterGLSL, combatWaterUniforms } from './water-combat.js';
import { mountainRiverUniforms, mountainRiverGLSL } from './river-ink.js';
import { seaWind, weatherGLSL, sampleSeaFront, sampleOffshore } from './sea-weather.js';

const SHORE_BANKS = 10;
const TINTS = ['#58645b', '#445e78', '#2b4653', '#57747a', '#79736b'];
const TINT_STRENGTH = [.16, .64, .57, .33, .15];

// A shared directional wave field for displaced geometry and the pigment pass.
const PRIMARY_X = seaWind.x * .45;
const PRIMARY_Z = seaWind.z * .45;
const PRIMARY_DRIFT = seaWind.speed * .45;
const CROSS_X = seaWind.acrossX * .39;
const CROSS_Z = seaWind.acrossZ * .39;
const CHOP_X = seaWind.x * .91 + seaWind.acrossX * .14;
const CHOP_Z = seaWind.z * .91 + seaWind.acrossZ * .14;
const CHANNEL_EDGE = 6.4;
const CHANNEL_BANK = 13.2;
const CHANNEL_LENGTH = 28;
const CHANNEL_END = 44;
const FAR_START = 28;
const FAR_FULL = 53;
const waveShader = /* glsl */ `
  ${weatherGLSL}
  float swellPacket(vec2 p,float time) {
    return .5+.5*sin(dot(p,vec2(.106,-.08))+.82*sin(dot(p,vec2(.046,.09)))-time*.14);
  }
  vec3 wavePhase(vec2 p, float time) {
    float a = dot(p, vec2(${PRIMARY_X}, ${PRIMARY_Z}))
      + .83*sin(dot(p,vec2(.094,-.072))+.34*time)
      + .30*sin(dot(p,vec2(.11,.095))-.17*time)-${PRIMARY_DRIFT}*time;
    float b = dot(p,vec2(${CROSS_X},${CROSS_Z}))
      + .52*sin(dot(p,vec2(.071,.06))+.26*time)-.73*time;
    return vec3(a,b,dot(p,vec2(${CHOP_X},${CHOP_Z}))+.39*sin(a)-1.36*time);
  }
`;

const noise = /* glsl */ `
  float inkHash(vec2 p) {
    p = fract(p * vec2(.1031,.11369));
    p += dot(p, p.yx+19.19);
    return fract(p.x*p.y);
  }
  float inkNoise(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(inkHash(i),inkHash(i+vec2(1,0)),f.x),
      mix(inkHash(i+vec2(0,1)),inkHash(i+vec2(1,1)),f.x),f.y);
  }
  float washNoise(vec2 p) {
    return .58*inkNoise(p)+.27*inkNoise(p*2.07+7.9)+.15*inkNoise(p*4.31-8.6);
  }
`;

const seaWash = /* glsl */ `
  float openSeaSide(vec2 p,vec2 head) {
    vec2 right=normalize(vec2(viewMatrix[0][0],viewMatrix[2][0]));
    vec2 offset=p-head;
    float side=abs(dot(offset,right));
    float along=abs(dot(offset,vec2(-right.y,right.x)));
    float reach=smoothstep(${CHANNEL_LENGTH.toFixed(1)},${CHANNEL_END.toFixed(1)},along);
    return max(smoothstep(${CHANNEL_EDGE},${CHANNEL_BANK},side),reach)
      *smoothstep(6.0,11.0,length(offset));
  }
  vec2 sampleDistantWash(vec2 p,vec2 rest,float time,float broad) {
    vec3 front=seaFront(rest,time);
    vec4 sections=offshoreSections(front);
    float dry=washNoise(vec2(front.y*.088,sections.x*.28+.73));
    float broken=washNoise(vec2(front.y*.14+4.2,sections.x*.121));
    // Load the lee face of one crest. The softer echo has its own transverse span.
    float body=offshoreRidge(sections.x-2.4+(dry-.5)*2.8,8.7,6.4)*sections.z;
    float echo=offshoreRidge(sections.y-1.4,10.2,7.8)*sections.w;
    float pocket=offshoreRidge(sections.x-5.1,3.7,6.2)*sections.z;
    float weight=body*(.51+.23*broken+.11*broad)+pocket*.21+echo*.27;
    float edge=1.-smoothstep(.14,.79,abs(sections.x+(dry-.48)*1.9));
    float streak=1.-smoothstep(.09,.52,abs(sections.x-3.5+(broken-.54)*3.8));
    float white=clamp(sections.z*(edge*.96*smoothstep(.29,.68,dry)
      +streak*.49*smoothstep(.34,.72,broken)),0.,.89);
    float horizon=1.-smoothstep(85.,158.,distance(p,cameraPosition.xz));
    return vec2((.014+weight*(.78+.32*dry))*horizon,white*horizon);
  }
  vec2 sampleSeaWash(vec2 p, vec2 rest, vec3 n, vec2 head, float time, float broad, float paper) {
    vec3 phases=wavePhase(rest,time);
    float wave=cos(phases.x), crossed=cos(phases.y);
    float forwardFace=clamp(dot(n,normalize(vec3(-.78,.21,-.58))),0.,1.);
    float sideFace=abs(dot(n,normalize(vec3(-.45,0.,.89))));
    float outside=smoothstep(5.,23.,distance(p,head));
    float brushAxis=dot(p,seaWindAcross);
    float brush=washNoise(vec2(phases.x*4.1,brushAxis*.48));
    float packet=swellPacket(rest,time);
    float primaryFace=smoothstep(-.49,.76,sin(phases.x+.49+.27*crossed));
    float crossFace=smoothstep(.0,.86,sin(phases.y-.31))*smoothstep(.28,.73,broad);
    float waveFace=mix(crossFace,primaryFace,.45+.48*packet);
    float cloudShadow=smoothstep(.18,.68,broad);
    float current=clamp(.02+.65*waveFace+.23*forwardFace+.25*sideFace,0.,1.);
    float inkLoad=(.31+cloudShadow*.79)*current;
    float ink=.075+(.31+.22*outside)*smoothstep(.05,.74,inkLoad)*(.84+brush*.27);
    // The broad pools sit on the flanks of the fight, with a pale channel
    // through the head and the space in which warnings and shots are read.
    float margin=openSeaSide(p,head);
    float nearSide=margin*(1.-smoothstep(24.,66.,distance(p,head)));
    float pool=smoothstep(.24,.71,.62*broad+.38*waveFace);
    float storm=seaFront(rest,time).z;
    ink=mix(ink*.72,ink,margin)+nearSide*(.046+.31*pool)*(.56+.44*storm);
    // The ordinary crossed swell loses pressure before the offshore front.
    // This leaves a quieter gap between the close breakers and the main wash.
    float middle=smoothstep(14.,27.,distance(p,head));
    float loaded=middle*(.42+.58*smoothstep(.18,.84,storm));
    ink*=mix(1.,.57+.43*loaded,middle);

    // Unpainted crests divide broad dark washes, with finer broken streaks down their faces.
    float crestShape=mix(crossed,wave,.46+.42*packet);
    float tornEdge=washNoise(vec2(phases.x*8.7,brushAxis*1.08));
    float foamMask=smoothstep(.63,.87,crestShape+(brush-.5)*.51+(tornEdge-.5)*.41);
    float ragged=smoothstep(.28,.58,inkNoise(vec2(phases.x*18.,brushAxis*1.89)));
    float washRim=smoothstep(.79,.97,wave)*smoothstep(.28,.75,broad+.21*crossed);
    float lines=abs(sin(phases.x*4.2+.61*sin(phases.y*1.15)+brush*.49));
    float fine=(1.-smoothstep(.035,.25,lines))*smoothstep(.38,.73,tornEdge)*waveFace;
    float reserve=clamp(foamMask*(.36+.28*ragged)+washRim*.27+fine*.57,0.,.86);
    reserve *= mix(.74,1.,max(outside,nearSide));
    ink *= .88+.24*paper;
    float distanceBlend=smoothstep(${FAR_START.toFixed(1)},${FAR_FULL.toFixed(1)},distance(p,head));
    vec2 nearWash=vec2(ink,reserve);
    if(distanceBlend<.001)return nearWash;
    return mix(nearWash,sampleDistantWash(p,rest,time,broad),distanceBlend);
  }
`;

const waterVertex = /* glsl */ `
  attribute vec2 aRestWater;
  attribute vec3 aCrestResponse;
  varying vec3 vWorld;
  varying vec3 vWaterNormal;
  varying vec2 vRestWater;
  varying vec3 vCrestResponse;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.);
    vWorld = world.xyz;
    vWaterNormal = mat3(modelMatrix) * normal;
    vRestWater = (modelMatrix*vec4(aRestWater,0.,1.)).xz;
    vCrestResponse = aCrestResponse;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vWaterNormal;
  varying vec2 vRestWater;
  varying vec3 vCrestResponse;
  uniform float uTime, uStage, uFrontierWater;
  uniform vec3 uHead;
  uniform vec4 uBanks[${SHORE_BANKS}];
  uniform vec4 uSurge;
  uniform vec3 uDrillStorm;
  ${noise}
  ${waveShader}
  ${seaWash}
  ${mountainRiverGLSL}
  ${contactWashGLSL}
  ${combatWaterGLSL}

  vec2 lakePull(vec2 p,vec2 center,float halfLength,float halfWidth,float slope,float seed) {
    vec2 q=p-center;
    float along=q.x/halfLength;
    float offset=slope*q.x+.34*sin(along*2.4+seed)+.13*sin(along*7.1+seed);
    float across=(q.y+offset-uTime*.055)/halfWidth;
    float taper=1.-smoothstep(.39,1.07,abs(along));
    float pooling=inkNoise(vec2(along*6.0+seed,across*1.16));
    float drag=1.-smoothstep(.27,1.13,abs(across)+(pooling-.5)*.22);
    float skip=inkNoise(vec2(along*12.+seed,across*4.4));
    float paper=(1.-smoothstep(.04,.23,abs(across+.31+.12*pooling)))*smoothstep(.48,.81,skip);
    return vec2(taper*drag*(.64+.36*pooling),taper*paper);
  }

  float lakeBristle(vec2 p,vec2 center,float halfLength,float slope,float seed) {
    vec2 q=p-center;
    float along=q.x/halfLength;
    float belly=1.-smoothstep(.38,1.02,abs(along));
    float grain=inkNoise(vec2(along*11.0+seed,p.y*.39));
    float line=q.y+slope*q.x+.27*sin(along*2.8+seed)-uTime*.032;
    float pressure=1.-smoothstep(.07,.28+.26*belly,abs(line+(grain-.5)*.37));
    float fray=1.-smoothstep(.028,.18,abs(line+.43+(grain-.5)*.23));
    float breakUp=smoothstep(.19,.67,inkNoise(vec2(along*7.+seed,seed*.48)));
    return belly*(pressure*.78+fray*.22)*breakUp;
  }

  void main() {
    vec2 p=vWorld.xz;
    float distanceToEye=distance(vWorld,cameraPosition);
    float mist=1.-smoothstep(35.,196.,distanceToEye);
    float paper=inkNoise(p*vec2(5.6,10.9));
    float broad=washNoise(p*vec2(.06,.11)+vec2(7.,3.));
    float ink=0., reserve=0.;
    bool sea=uStage>1.5&&uStage<2.5;
    if(sea) {
      vec2 wash=sampleSeaWash(p,vRestWater,normalize(vWaterNormal),uHead.xz,uTime,broad,paper);
      float pull=vortexPullAt(p);
      float cut=vCrestResponse.x;
      float rejoin=vCrestResponse.y;
      float bank=vCrestResponse.z;
      ink=mix(wash.x,.095,pull*.77)*(1.-.85*cut)*(1.+1.12*bank+1.28*rejoin);
      reserve=wash.y*(1.-pull*.88)*(1.-.98*cut)*(1.+.70*bank+.91*rejoin);
      if(max(bank,rejoin)>.008){
        // Compression loads the incoming wave face itself. Leave its hollow
        // and the separated center light so the water can be read in motion.
        float face=smoothstep(-.62,.78,sin(wavePhase(vRestWater,uTime).x+.52));
        float collected=max(bank*.43,rejoin*.69)*(.23+.77*face)*(1.-cut*.86);
        ink=1.-(1.-clamp(ink,0.,1.))*(1.-collected);
        reserve*=1.-collected*.67;
      }

      // Real wind zones stir a spiral in the surface wash around their world position.
      if(uSurge.w>.01) {
        vec2 q=p-uSurge.xy;
        float r=length(q), angle=atan(q.y,q.x);
        float spiral=sin(2.8*r-3.*angle-uTime*2.4);
        float effect=(1.-smoothstep(uSurge.z*.48,uSurge.z*1.42,r))
          *smoothstep(.2,1.,r)*uSurge.w;
        ink=mix(ink, max(ink,.40+spiral*.21), effect);
        reserve=max(reserve, smoothstep(.35,.95,spiral)*effect*.91);
      }
      if(uDrillStorm.z>0.) {
        vec2 radial=p-uDrillStorm.xy;
        float edge=length(radial)-uDrillStorm.z;
        float tooth=inkNoise(p*.77);
        float band=smoothstep(.0,2.8,edge+(tooth-.5)*.36);
        float fringe=1.-smoothstep(.23,.92,abs(edge-(broad-.5)*.43));
        float second=1.-smoothstep(.15,1.30,abs(edge-2.1+(broad-.5)*1.1));
        float fleck=.58+.42*smoothstep(.25,.78,tooth);
        float backwash=1.-smoothstep(.15,.55,abs(sin(edge*1.65+uTime*2.+broad*3.)));
        ink=mix(ink,max(ink,.68+.09*broad),band*.90);
        ink=1.-(1.-ink)*(1.-second*.32);
        ink=mix(ink,min(ink,.075),fringe*fleck*.87);
        reserve=max(reserve,max(fringe*fleck*.83,band*backwash*fleck*.16));
      }
    } else {
      float lake=step(.5,uStage);
      float upland=step(2.5,uStage);
      float upperSea=step(3.5,uStage);
      vec2 current=vec2(p.x*mix(.25,.145,lake)-p.y*.05,p.y*mix(.63,.34,lake)+p.x*.08);
      current.x-=uTime*.045;
      float strand=abs(sin(current.y + (broad-.5)*1.38));
      float stroke=(1.-smoothstep(.015,.055+fwidth(current.y)*.4,strand))
        *smoothstep(.40,.72,inkNoise(vec2(current.x*.78,current.y*.37)));
      float bankWash=smoothstep(.36,.71,broad+.10*inkNoise(p*vec2(.08,.24)));
      ink=mix(.018,.035,lake)+bankWash*mix(.052,.099,lake)+stroke*mix(.09,.135,lake);
      if(upland<.5) {
        float shore=0., bankDistance=1000.;
        for(int i=0;i<${SHORE_BANKS};i++){
          vec4 bank=uBanks[i];
          if(bank.z<.1) break;
          vec2 q=(p-bank.xy)/bank.zw;
          float radial=length(q);
          float edge=abs(radial-1.37+(broad-.5)*.35);
          bankDistance=min(bankDistance,(radial-1.)*min(bank.z,bank.w));
          float wash=(1.-smoothstep(.08,mix(.32,.54,lake),edge))*(.27+.73*broad);
          shore=max(shore,wash*.051);
        }
        if(lake>.5) {
          // Staggered horizontal washes leave a broad near sheet clear and
          // carry the far lake to the horizon without regular ripple rows.
          float shallow=1.-smoothstep(1.0,5.9,bankDistance);
          float viewing=smoothstep(14.,25.,distanceToEye)*(1.-smoothstep(64.,132.,distanceToEye));
          float reach=.25+.75*smoothstep(2.0,9.6,distance(p,uHead.xz));
          float open=(1.-shallow)*viewing*reach;
          vec2 pull=lakePull(p,vec2(5.,11.8),23.,3.1,.032,1.4);
          pull=max(pull,.77*lakePull(p,vec2(-16.,24.6),18.,3.7,.058,3.1));
          pull=max(pull,.61*lakePull(p,vec2(15.,34.7),20.,3.5,.012,6.2));
          pull=max(pull,.46*lakePull(p,vec2(7.,53.0),34.,4.2,-.041,4.6));
          float farWash=smoothstep(21.,40.,p.y)*smoothstep(.24,.73,inkNoise(p*vec2(.032,.10)));
          float bristle=lakeBristle(p,vec2(8.2,-2.6),9.1,.035,2.8);
          bristle=max(bristle,.76*lakeBristle(p,vec2(-5.,8.3),10.8,.071,4.9));
          bristle=max(bristle,.70*lakeBristle(p,vec2(10.,17.6),15.0,.021,7.1));
          bristle=max(bristle,.55*lakeBristle(p,vec2(-18.4,26.9),13.4,.059,8.8));
          float inkLane=.24+.76*smoothstep(2.8,7.3,distance(p,uHead.xz));
          ink=.026+.035*bankWash+shore*.47+(.215*pull.x+.096*farWash)*open+.267*bristle*inkLane*viewing;
          reserve=max(reserve,pull.y*open*.40);
        }else{
          // The marsh reads at the feet of the bank, with no lines drawn
          // through the clear center where the first school leads the player.
          float nearBank=1.-smoothstep(.30,2.9,bankDistance);
          float strokePhase=p.x*.38+p.y*.67+uTime*.17+(broad-.5)*1.06;
          float broken=smoothstep(.37,.67,inkNoise(p*vec2(.57,.25)));
          float fleck=(1.-smoothstep(.08,.29,abs(sin(strokePhase))))*broken;
          float wash=inkNoise(p*vec2(.19,.52)+vec2(uTime*.019,7.9));
          ink=.015+.029*bankWash+shore*.54+nearBank*(wash*.086+fleck*.157);
        }
        // The opening pools have hand-laid strokes. Away from them, the
        // same broken brush families drift in world space between new banks.
        if(uFrontierWater>.5){
          vec2 outer=abs(p)/mix(vec2(45.,53.),vec2(67.,75.),lake);
          float extra=smoothstep(.84,1.28,max(outer.x,outer.y));
          float wash=washNoise(vec2(p.x*.029+7.2,p.y*.21-uTime*.028));
          float span=inkNoise(vec2(p.x*.071,p.y*.095+2.9));
          float run=p.y*.73+p.x*.075+2.2*span+.66*sin(p.x*.14+p.y*.058);
          float drag=1.-smoothstep(.045,.14+fwidth(run)*.44,abs(sin(run)));
          float torn=inkNoise(vec2(p.x*.20+7.0,p.y*.49+span));
          float inkStroke=drag*smoothstep(.45,.71,wash)*smoothstep(.37,.64,torn);
          float shallow=1.-smoothstep(.4,6.4,bankDistance);
          float pressure=mix(.074,.129,lake)*smoothstep(.52,.80,wash);
          ink+=extra*(pressure+inkStroke*mix(.097,.127,lake)+shallow*.044);
          reserve=max(reserve,extra*inkStroke*smoothstep(.68,.87,wash)*lake*.22);
        }
      }
      if(upland>.5) {
        float mistLayer=washNoise(vec2(p.x*.031,p.y*.125-uTime*.04));
        ink=mix(.011,.030,1.-upperSea)+smoothstep(.38,.81,mistLayer)*mix(.18,.095,upperSea);
        ink+=stroke*.04;
        if(upperSea<.5&&uMountainCourseReady>.5){
          vec2 riverWash=mountainWater(p,broad,uTime);
          ink=riverWash.x+ink*.29;
          reserve=max(reserve,riverWash.y);
        }
      }
    }
    if(uStage<2.5) {
      if(sea) {
        vec3 hull=hullWashAt(p,paper);
        ink*=1.-hull.z*.48;
        reserve*=1.-hull.z*.63;
        ink=1.-(1.-clamp(ink,0.,1.))*(1.-hull.x);
        reserve=max(reserve,hull.y);
        vec2 impact=contactWashAt(p,paper);
        ink=1.-(1.-clamp(ink,0.,1.))*(1.-impact.x);
        reserve=max(reserve,impact.y);
      }
      vec2 combat=combatWaterAt(p,paper);
      ink=1.-(1.-clamp(ink,0.,1.))*(1.-combat.x);
      reserve=max(reserve,combat.y);
    }
    // The water tends to the same unpainted horizon as the sky.
    gl_FragColor=vec4(1.-clamp(ink*mist,0.,.93),reserve,paper,1.);
  }
`;

function swellAxis(compact) {
  const positive = [];
  let distance = 0;
  const samples = compact ? 30 : 38;
  for (let i = 1; i <= samples; i++) positive.push(i * (30.82 / samples));
  distance = positive.at(-1);
  for (let i = 0; i < 25; i++) {
    // Use the same vertex budget but sample the visible offshore crests
    // more densely, and spend fewer vertices on the flat, paper-white horizon.
    distance+=i<20?.72+.21*i:12+(i-20)*8.8;
    positive.push(distance);
  }
  return [...positive.map(v => -v).reverse(), 0, ...positive];
}

function makeSwellMesh(compact, axis=swellAxis(compact)) {
  const geometry = new THREE.PlaneGeometry(2, 2, axis.length - 1, axis.length - 1);
  const positions = geometry.attributes.position;
  const rest = new Float32Array(positions.count * 2);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  for (let row = 0; row < axis.length; row++) {
    for (let column = 0; column < axis.length; column++) {
      const i = row * axis.length + column;
      positions.setXYZ(i, axis[column], -axis[row], 0);
      rest[i * 2] = axis[column];
      rest[i * 2 + 1] = -axis[row];
    }
  }
  geometry.setAttribute('aRestWater', new THREE.BufferAttribute(rest, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aCrestResponse',new THREE.BufferAttribute(new Float32Array(positions.count*3),3)
    .setUsage(THREE.DynamicDrawUsage));
  geometry.computeBoundingSphere();
  return { geometry, axis };
}

function sampleNearWave(x,z,time,out) {
  const twistA=.094*x-.072*z+.34*time;
  const twistB=.11*x+.095*z-.17*time;
  const twistC=.071*x+.06*z+.26*time;
  const a=PRIMARY_X*x+PRIMARY_Z*z+.83*Math.sin(twistA)+.30*Math.sin(twistB)-PRIMARY_DRIFT*time;
  const b=CROSS_X*x+CROSS_Z*z+.52*Math.sin(twistC)-.73*time;
  const sinA=Math.sin(a),cosA=Math.cos(a),cosB=Math.cos(b);
  const c=CHOP_X*x+CHOP_Z*z+.39*sinA-1.36*time;
  const packetBend=.046*x+.09*z;
  const packetPhase=.106*x-.08*z+.82*Math.sin(packetBend)-time*.14;
  const packet=.5+.5*Math.sin(packetPhase);
  const harmonic=Math.cos(2*a)-.45*Math.sin(2*a);
  const mainSwell=.46+.28*packet,crossSwell=.32-.15*packet,steepness=.075+.14*packet;
  out.twistA=twistA;out.twistB=twistB;out.twistC=twistC;
  out.a=a;out.b=b;out.c=c;out.sinA=sinA;out.cosA=cosA;out.cosB=cosB;
  out.packetBend=packetBend;out.packetPhase=packetPhase;out.harmonic=harmonic;
  out.mainSwell=mainSwell;out.crossSwell=crossSwell;out.steepness=steepness;
  out.swell=mainSwell*cosA+crossSwell*cosB+steepness*harmonic+.12*Math.cos(c);
  return out;
}

function moveSwells(geometry, axis, centerX, centerZ, time, surge, contact, combat) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const frontSample={};
  const offshoreSample={};
  const nearSample={};
  const gather={x:0,z:0,pull:0};
  const crest={x:0,z:0,gap:0,bank:0,rejoin:0};
  const hasCrest=contact.hasCrest();
  const updateCrest=hasCrest||geometry.userData.hadCrest;
  const {aRestWater,aCrestResponse}=geometry.attributes;
  const hasContact=contact.hasSurface();
  const hasVortex=combat?.vortices.length>0;
  const hasCombat=combat?.hasSurface();
  let firstRow=axis.length,lastRow=-1,firstColumn=axis.length,lastColumn=-1;
  for (let row = 0; row < axis.length; row++) {
    const localZ = axis[row];
    const z = localZ + centerZ;
    for (let column = 0; column < axis.length; column++) {
      const localX = axis[column];
      const x = localX + centerX;
      const i=row*axis.length+column;
      if(hasCrest)contact.crestAt(x,z,crest);
      const sampleX=x+crest.x,sampleZ=z+crest.z;
      if(updateCrest){
        aRestWater.setXY(i,localX+crest.x,-localZ-crest.z);
        aCrestResponse.setXYZ(i,crest.gap,crest.rejoin,crest.bank);
        if(Math.max(crest.gap,crest.rejoin,crest.bank)>.018){
          firstRow=Math.min(firstRow,row);lastRow=Math.max(lastRow,row);
          firstColumn=Math.min(firstColumn,column);lastColumn=Math.max(lastColumn,column);
        }
      }
      const r = Math.hypot(localX, localZ);
      const u = THREE.MathUtils.clamp((r - 6) / 21, 0, 1);
      const response=1-.87*crest.gap+1.05*crest.bank+1.14*crest.rejoin;
      const amp = (.20 + .61 * u * u * (3 - 2 * u))*response;
      const da = r > .001 ? .61 * 6 * u * (1 - u) / (21 * r) : 0;
      const {twistA,twistB,twistC,a,b,c,sinA,cosA,cosB,packetBend,packetPhase,harmonic,
        mainSwell,crossSwell,steepness,swell}=sampleNearWave(sampleX,sampleZ,time,nearSample);
      const packetSlope = .5*Math.cos(packetPhase);
      const packetX = packetSlope*(.106 + .82*.046*Math.cos(packetBend));
      const packetZ = packetSlope*(-.08 + .82*.09*Math.cos(packetBend));
      const packetHeight = .28*cosA - .15*cosB + .14*harmonic;
      const aSlope = -mainSwell*sinA - steepness*(2*Math.sin(2*a) + .9*Math.cos(2*a));
      const bSlope = -crossSwell*Math.sin(b);
      const cSlope = -.12 * Math.sin(c);
      const aX = PRIMARY_X + .83 * .094 * Math.cos(twistA) + .30 * .11 * Math.cos(twistB);
      const aZ = PRIMARY_Z - .83 * .072 * Math.cos(twistA) + .30 * .095 * Math.cos(twistB);
      const bX = CROSS_X + .52 * .071 * Math.cos(twistC);
      const bZ = CROSS_Z + .52 * .06 * Math.cos(twistC);
      let height = amp * swell;
      if (surge.w > 0) {
        const dx = x - surge.x;
        const dz = z - surge.y;
        const distance = Math.hypot(dx, dz);
        if (distance < surge.z * 1.4) {
          const envelope = 1 - THREE.MathUtils.smoothstep(distance, surge.z * .45, surge.z * 1.4);
          height += Math.sin(2.8 * distance - 3 * Math.atan2(dz, dx) - time * 2.4)
            * envelope * .18 * surge.w;
        }
      }
      let slopeX = amp * (aSlope * aX + bSlope * bX + cSlope * (CHOP_X + .39 * cosA * aX) + packetHeight * packetX)
        + da * localX * swell;
      let slopeZ = amp * (aSlope * aZ + bSlope * bZ + cSlope * (CHOP_Z + .39 * cosA * aZ) + packetHeight * packetZ)
        + da * localZ * swell;
      const distant=THREE.MathUtils.smoothstep(r,FAR_START,FAR_FULL);
      if (distant>0) {
        const front=sampleSeaFront(x,z,time,frontSample);
        const wave=sampleOffshore(front,offshoreSample);
        const horizon=1-THREE.MathUtils.smoothstep(r,80,156);
        const alongSlope=wave.slopeAlong*horizon;
        height=THREE.MathUtils.lerp(height,wave.height*horizon,distant);
        slopeX=THREE.MathUtils.lerp(slopeX,alongSlope*front.gradientX,distant);
        slopeZ=THREE.MathUtils.lerp(slopeZ,alongSlope*front.gradientZ,distant);
      }
      if(hasVortex){
        combat.gatherAt(x,z,gather);
        const slack=1-.66*gather.pull;
        height*=slack;
        slopeX*=slack;
        slopeZ*=slack;
      }
      if (hasContact||hasCombat) {
        const lift=(hasContact?contact.liftAt(x,z):0)+(hasCombat?combat.liftAt(x,z):0);
        height+=lift;
        if (Math.abs(lift)>.008) {
          slopeX+=((hasContact?contact.liftAt(x+.2,z)-contact.liftAt(x-.2,z):0)+
            (hasCombat?combat.liftAt(x+.2,z)-combat.liftAt(x-.2,z):0))/.4;
          slopeZ+=((hasContact?contact.liftAt(x,z+.2)-contact.liftAt(x,z-.2):0)+
            (hasCombat?combat.liftAt(x,z+.2)-combat.liftAt(x,z-.2):0))/.4;
        }
      }
      // Compress the horizontal samples under each crest to steepen it without crossing vertices.
      const lean = -.64 * amp * sinA * (1-distant);
      const leanX = -.64 * (da * localX * sinA + amp * cosA * aX) * (1-distant);
      const leanZ = -.64 * (da * localZ * sinA + amp * cosA * aZ) * (1-distant);
      const acrossX = seaWind.x, acrossZ = seaWind.z;
      const dxX = 1 + acrossX * leanX, dxZ = acrossZ * leanX;
      const dzX = acrossX * leanZ, dzZ = 1 + acrossZ * leanZ;
      positions.setXYZ(i, localX + acrossX * lean + gather.x, -localZ - acrossZ * lean - gather.z, height);
      normals.setXYZ(i, slopeZ * dxZ - dzZ * slopeX, slopeZ * dxX - dzX * slopeX, dzZ * dxX - dzX * dxZ);
    }
  }
  // The warped phase has a different slope. Use the resulting surface
  // tangents in the contact patch while leaving the offshore normals analytic.
  const size=axis.length;
  for(let row=Math.max(1,firstRow-1);row<=Math.min(size-2,lastRow+1);row++){
    for(let column=Math.max(1,firstColumn-1);column<=Math.min(size-2,lastColumn+1);column++){
      const i=row*size+column,left=i-1,right=i+1,near=i-size,far=i+size;
      const ax=positions.getX(right)-positions.getX(left);
      const ay=positions.getY(right)-positions.getY(left);
      const az=positions.getZ(right)-positions.getZ(left);
      const bx=positions.getX(near)-positions.getX(far);
      const by=positions.getY(near)-positions.getY(far);
      const bz=positions.getZ(near)-positions.getZ(far);
      normals.setXYZ(i,ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx);
    }
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
  if(updateCrest){
    aRestWater.needsUpdate=true;
    aCrestResponse.needsUpdate=true;
  }
  geometry.userData.hadCrest=hasCrest;
}

function shallowCombatAxis(compact) {
  const count=compact?19:25;
  const side=Array.from({length:count},(_,i)=>(i+1)*.68);
  let distance=side.at(-1);
  for(let i=0;i<9;i++) {
    distance+=.88+i*.34;
    side.push(distance);
  }
  for(const step of [14,31,68,110]){
    distance+=step;
    side.push(distance);
  }
  return [...side.map(value=>-value).reverse(),0,...side];
}

function moveShallowCombat({geometry,axis},centerX,centerZ,combat) {
  const {position,normal}=geometry.attributes;
  for(let row=0;row<axis.length;row++){
    const z=centerZ+axis[row];
    for(let column=0;column<axis.length;column++){
      const x=centerX+axis[column],index=row*axis.length+column;
      const lift=combat.liftAt(x,z);
      position.setZ(index,lift);
      if(Math.abs(lift)<.008){normal.setXYZ(index,0,0,1);continue;}
      const dx=(combat.liftAt(x+.24,z)-combat.liftAt(x-.24,z))/.48;
      const dz=(combat.liftAt(x,z+.24)-combat.liftAt(x,z-.24))/.48;
      normal.setXYZ(index,-dx,dz,1);
    }
  }
  position.needsUpdate=true;
  normal.needsUpdate=true;
}

function waterCell(axis,coordinate) {
  let a=0,b=axis.length-1;
  while(a+1<b){
    const middle=(a+b)>>1;
    if(axis[middle]<coordinate)a=middle;
    else b=middle;
  }
  return a;
}

function meshHeightAt(water,axis,x,z) {
  const localX=x-water.position.x,localZ=z-water.position.z;
  const column=waterCell(axis,localX),row=waterCell(axis,localZ),size=axis.length;
  const index=row*size+column,vertices=water.geometry.attributes.position;
  const u=THREE.MathUtils.clamp((localX-axis[column])/(axis[column+1]-axis[column]),0,1);
  const v=THREE.MathUtils.clamp((localZ-axis[row])/(axis[row+1]-axis[row]),0,1);
  const a=vertices.getZ(index),b=vertices.getZ(index+1),c=vertices.getZ(index+size),d=vertices.getZ(index+size+1);
  return u+v<1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

export function inkWater() {
  const flat = new THREE.PlaneGeometry(650, 650);
  const compact = typeof window !== 'undefined' && window.innerWidth < 700;
  const swells = makeSwellMesh(compact);
  let shallowCombat=null;
  const contact = new SeaContact();
  const wake = new SwimWake();
  const uniforms = {
    uTime: { value: 0 },
    uStage: { value: 0 },
    uFrontierWater: { value: 0 },
    uHead: { value: new THREE.Vector3() },
    uBanks: { value: Array.from({length: SHORE_BANKS}, () => new THREE.Vector4()) },
    uSurge: { value: new THREE.Vector4() },
    uDrillStorm: { value: new THREE.Vector3() },
    uEntry: { value: new THREE.Vector4() },
    ...contact.uniforms,
    ...combatWaterUniforms(),
    ...mountainRiverUniforms(),
  };
  const water = new THREE.Mesh(flat, new THREE.ShaderMaterial({
    uniforms, vertexShader: waterVertex, fragmentShader: waterFragment,
  }));
  water.name = '水面';
  water.frustumCulled = false;
  water.add(contact.mesh,wake.mesh);
  const contactWave={};
  const sampleSurface=(x,z,time,head)=>{
    const distance=Math.hypot(x-head.x,z-head.z);
    const amplitude=.20+.61*THREE.MathUtils.smoothstep(distance,6,27);
    return water.position.y+amplitude*sampleNearWave(x,z,time,contactWave).swell;
  };
  water.userData.sampleSurface=sampleSurface;
  water.userData.inspectContact=()=>({...contact.inspect(),wake:wake.inspect().samples});
  water.userData.inspectWake=()=>wake.inspect();
  water.userData.latestContact=()=>contact.events.at(-1);
  water.userData.crestContact=contact;
  water.userData.seaPose=(time,frame,game)=>frame.chapter===2&&frame.position===game?.p?
    contact.poseAt(time,frame,sampleSurface):null;
  let lastStage = -1, lastSwellTime = -1;
  let wakeAxis=null;
  const surfaceAt=(x,z)=>water.position.y+(wakeAxis?meshHeightAt(water,wakeAxis,x,z):0);
  water.userData.updateSurface = (time, stage, frame, game, banks = game?.obstacles, paintedSpine) => {
    const head = frame.position;
    if (!head) return;
    if (stage !== lastStage) {
      water.geometry = stage === 2 ? swells.geometry : flat;
      water.userData.inkTint = TINTS[stage];
      water.userData.inkTintAmount = TINT_STRENGTH[stage];
      lastSwellTime = -1;
      if (stage !== 2) water.position.setX(0).setZ(0);
      lastStage = stage;
    }
    uniforms.uTime.value = time;
    uniforms.uStage.value = stage;
    uniforms.uFrontierWater.value=Number(Boolean(game?.exploring));
    uniforms.uHead.value.set(head.x, head.y, head.z);
    const storm=stage===2?game?.drill?.storm:null;
    uniforms.uDrillStorm.value.set(storm?.x??0,storm?.z??0,storm?.radius??0);
    contact.update(time,stage,frame,game,paintedSpine,sampleSurface);
    if (stage < 2) {
      for (let i = 0; i < SHORE_BANKS; i++) {
        const bank = banks?.[i];
        if (bank) uniforms.uBanks.value[i].set(bank.x, bank.z, bank.rx, bank.rz);
        else uniforms.uBanks.value[i].set(0, 0, 0, 0);
      }
    }
    const surge = uniforms.uSurge.value;
    const wind = game?.windZone;
    const combat=water.userData.waterCombat;
    if (stage === 2 && wind?.life > 0&&!combat) {
      surge.set(wind.x, wind.z, wind.radius, THREE.MathUtils.clamp(wind.power / 7, 0, .82));
    } else {
      surge.set(0, 0, 0, 0);
    }
    const impact=contact.events.findLast(event=>event.kind==='entry');
    uniforms.uEntry.value.set(impact?.x??0,impact?.z??0,impact?.age??0,impact?.strength??0);
    if (stage === 2 && (lastSwellTime < 0 || time < lastSwellTime || time - lastSwellTime >= 1 / (compact ? 24 : 32))) {
      water.position.x = head.x;
      water.position.z = head.z;
      moveSwells(swells.geometry, swells.axis, head.x, head.z, time, surge,contact,combat);
      lastSwellTime = time;
    } else if (stage<2) {
      if(combat?.hasSurface()){
        shallowCombat??=makeSwellMesh(compact,shallowCombatAxis(compact));
        if(water.geometry!==shallowCombat.geometry||time<lastSwellTime||
            time-lastSwellTime>=1/(compact?22:30)){
          water.geometry=shallowCombat.geometry;
          water.position.setX(head.x).setZ(head.z);
          moveShallowCombat(shallowCombat,head.x,head.z,combat);
          lastSwellTime=time;
        }
      }else if(water.geometry!==flat){
        water.geometry=flat;
        water.position.setX(0).setZ(0);
      }
    }
    if(stage!==2&&water.geometry===flat)water.position.setX(head.x).setZ(head.z);
    wakeAxis=stage===2?swells.axis:water.geometry===shallowCombat?.geometry?shallowCombat.axis:null;
    wake.update(time,stage,head,game,surfaceAt(head.x,head.z));
    wake.paint(time,surfaceAt,water.position);
    contact.render(time,water.position);
  };
  return water;
}

// The broad swell and its fold are separate surfaces. The fold's two
// submerged toes disappear into the surrounding wash at every age.
const breakerProfiles = [
  // A rising back and steepening front, followed by an overhanging lip.
  [
    [-6.1,-.30],[-4.6,-.06],[-3.2,.24],[-2.15,.58],[-1.42,1.06],[-.82,1.56],[-.24,1.98],
    [.37,2.27],[.93,2.32],[1.26,2.17],[1.44,1.96],[1.56,1.79],[1.66,1.65],[1.73,1.50],
    [1.82,1.30],[1.97,1.08],[2.16,.81],[2.43,.56],[2.88,.31],[3.61,.07],[5.03,-.32],
  ],
  [
    [-5.5,-.25],[-4.2,-.04],[-2.8,.25],[-1.65,.73],[-.79,1.36],[-.10,2.06],[.60,2.53],
    [1.31,2.61],[1.94,2.37],[2.26,1.99],[2.32,1.62],[2.11,1.45],[1.86,1.55],[1.86,1.78],
    [1.62,1.96],[1.24,1.83],[.95,1.34],[1.04,.81],[1.59,.44],[2.67,.10],[4.5,-.27],
  ],
  // The lip drops forward and spreads into a shallow tongue of wash.
  [
    [-5.0,-.29],[-3.65,-.06],[-2.5,.16],[-1.47,.42],[-.63,.71],[.11,1.04],[.85,1.32],
    [1.60,1.52],[2.30,1.50],[2.88,1.31],[3.34,1.04],[3.61,.83],[3.67,.68],[3.55,.57],
    [3.41,.49],[3.46,.39],[3.71,.27],[4.09,.16],[4.66,.045],[5.33,-.09],[6.4,-.31],
  ],
];

const spillingFace = [
  [-7.1,-.33],[-5.7,-.09],[-4.45,.09],[-3.34,.32],[-2.36,.56],[-1.56,.86],[-.76,1.22],
  [-.03,1.51],[.58,1.66],[1.13,1.70],[1.65,1.62],[2.06,1.50],[2.45,1.36],[2.82,1.20],
  [3.17,1.01],[3.53,.78],[3.96,.56],[4.42,.38],[4.91,.21],[5.60,.035],[6.45,-.31],
];
const spillingCrest = [
  [-6.7,-.30],[-5.35,-.06],[-3.90,.19],[-2.8,.46],[-1.71,.91],[-.83,1.45],[-.18,1.92],
  [.43,2.18],[1.02,2.23],[1.61,2.14],[2.18,1.93],[2.63,1.65],[2.94,1.36],[3.18,1.08],
  [3.41,.82],[3.64,.62],[3.94,.48],[4.29,.34],[4.72,.21],[5.35,.02],[6.3,-.30],
];
const surgingCrest = [
  [-7.2,-.36],[-6.1,-.08],[-4.7,.17],[-3.7,.48],[-2.71,.84],[-1.84,1.31],[-1.09,1.91],
  [-.51,2.43],[-.04,2.62],[.41,2.61],[.85,2.47],[1.23,2.20],[1.46,1.96],[1.29,1.77],
  [1.15,1.51],[1.19,1.13],[1.43,.78],[1.93,.48],[2.59,.24],[3.51,.035],[4.69,-.30],
];

// A plunging lip, a wide spilling face, and a steep surge. All three occupy
// the same grid slots. Their contours are fixed by each world-space anchor.
const breakerForms = [
  { profiles:breakerProfiles, curve:3.5, sway:1.2, swayRate:2.4, crown:.15, crownRate:6, crownShift:0, taper:.94 },
  { profiles:[spillingFace,spillingCrest,breakerProfiles[2]],
    curve:1.1, sway:1.55, swayRate:3.2, crown:.27, crownRate:9, crownShift:1.7, taper:.94 },
  { profiles:[breakerProfiles[0],surgingCrest,breakerProfiles[2]],
    curve:-2.1, sway:1.5, swayRate:1.65, crown:.21, crownRate:3.6, crownShift:.7, taper:.78 },
];

const breakerVertex = /* glsl */ `
  attribute vec3 aBreaker;
  varying vec3 vWorld, vFaceNormal;
  varying vec2 vStroke;
  varying vec3 vBreaker;
  attribute vec2 aCrown;
  varying vec2 vCrown;
  void main() {
    vec4 world=modelMatrix*vec4(position,1.);
    vWorld=world.xyz;
    vFaceNormal=mat3(modelMatrix)*normal;
    vStroke=uv;
    vBreaker=aBreaker;
    vCrown=aCrown;
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;

const breakerFragment = /* glsl */ `
  varying vec3 vWorld, vFaceNormal;
  varying vec2 vStroke;
  varying vec3 vBreaker;
  varying vec2 vCrown;
  uniform float uTime;
  uniform vec3 uHead;
  ${noise}
  ${waveShader}
  ${seaWash}
  void main() {
    float u=vStroke.x, crosswise=vStroke.y, energy=vBreaker.x, seed=vBreaker.y, age=vBreaker.z;
    float spill=smoothstep(.40,.91,age);
    float y=vWorld.y;
    vec3 face=normalize(vFaceNormal);
    float steep=1.-abs(face.y);
    float front=smoothstep(.57,.72,crosswise);
    float belly=smoothstep(.04,.28,crosswise)*(1.-smoothstep(.87,1.,crosswise));
    float wash=washNoise(vec2(u*7.+seed,crosswise*8.+uTime*.17));
    float dry=washNoise(vec2(u*22.+seed*2.61,crosswise*32.-uTime*.26));
    float fibers=inkNoise(vec2(u*15.+seed*4.3,crosswise*152.+sin(u*19.)*3.));

    float light=.48+.52*clamp(dot(face,normalize(vec3(-.56,.66,.42))),-.4,.9);
    float weight=belly*(.51+.36*steep+.26*front);
    float pigment=.32+weight*(.86+.23*wash)-light*.10;
    float pool=smoothstep(.42,.70,wash)*belly*(.12+.12*front);
    pigment=clamp(pigment+pool,0.,.97)*(.90+.12*fibers);

    // The nose of the wet brush stays on the sampled geometric crown, then
    // peels forward and travels along the breaking wall as a divided lip.
    float flowing=u-vCrown.y*(age*.24+uTime*.011);
    float scud=washNoise(vec2(flowing*13.+seed*3.7,crosswise*38.-age*16.));
    float lipCenter=vCrown.x+spill*.089+.010*sin(u*31.+seed-age*8.);
    float lip=1.-smoothstep(.009,.031+scud*.052,abs(crosswise-lipCenter));
    float headDry=smoothstep(.25,.72,inkNoise(vec2(flowing*19.+seed,crosswise*86.)));
    float strength=smoothstep(.22,.57,age)*(1.-smoothstep(.81,.99,age));
    float alongBleed=smoothstep(.27,.68,inkNoise(vec2(flowing*9.8+seed*1.9,5.13)));
    float tooth=.31+.69*smoothstep(.24,.69,scud*.57+headDry*.43);
    float split=(1.-smoothstep(.005,.026,abs(crosswise-lipCenter-.055-(dry-.5)*.057)))*tooth;
    float fromLip=crosswise-lipCenter;
    float drag=1.-smoothstep(.06,.25,abs(fromLip-.048));
    float strokeY=fromLip*38.0+1.20*sin(flowing*7.+seed-age*3.4)+1.58*wash;
    float breaks=smoothstep(.30,.68,washNoise(vec2(flowing*17.+seed*2.6,crosswise*17.+1.8)));
    float brushCut=(1.-smoothstep(.031,.38,abs(sin(strokeY))))
      *smoothstep(.32,.64,dry)*(.14+.86*breaks)*drag*belly;
    float blade=(1.-smoothstep(.002,.014,abs(crosswise-lipCenter+.087-(dry-.5)*.046)))
      *smoothstep(.26,.66,fibers);
    float sprayBand=1.-smoothstep(.019,.085,abs(crosswise-lipCenter-.043));
    float spray=sprayBand*smoothstep(.61,.84,scud)*strength;
    float reserve=clamp(lip*(.15+.73*tooth+.24*alongBleed)+.61*split*(.42+.58*strength)
      +.74*brushCut+.35*blade+.53*spray,0.,.98);
    reserve=max(reserve,smoothstep(.22,.55,abs(y-.9))*.18*(1.-steep)*dry);
    float edgeDistance=min(u,1.-u);
    float endFade=smoothstep(.021,.265,edgeDistance+(wash-.5)*.021);
    float wetFoot=smoothstep(-.28,1.02,y+(dry-.5)*.18);
    float crest=endFade*wetFoot*smoothstep(.024,.35,energy);
    float eyeDistance=distance(vWorld,cameraPosition);
    float mist=1.-smoothstep(40.,114.,eyeDistance);

    // A spent crest deposits the same cool wash as the swell it falls into.
    // Invert the small horizontal swell displacement before sampling its strokes.
    vec2 p=vWorld.xz;
    float broad=washNoise(p*vec2(.06,.11)+vec2(7.,3.));
    float paper=inkNoise(p*vec2(5.6,10.9));
    float amp=.20+.61*smoothstep(6.,27.,distance(p,uHead.xz));
    vec2 rest=p+.64*amp*sin(wavePhase(p,uTime).x)*seaWindAxis;
    vec2 wetWash=sampleSeaWash(p,rest,vec3(0,1,0),uHead.xz,uTime,broad,paper);
    wetWash.x*=1.-smoothstep(35.,196.,eyeDistance);
    // The lower forward sheet blends back first. This lets the visible
    // white crown run beyond the dark body into its attached spindrift.
    float washOut=front*(.19+.54*spill)*(1.-smoothstep(.22,.74,y));
    float falling=1.-smoothstep(.05,.32,abs(crosswise-lipCenter-.094));
    float bristleDrift=smoothstep(.38,.78,inkNoise(vec2(flowing*24.+seed*6.1,crosswise*125.)))
      *falling*front*endFade*strength*smoothstep(.09,.48,energy);
    pigment=mix(wetWash.x,pigment*mist,crest*(1.-washOut));
    reserve=mix(wetWash.y,reserve,crest);
    reserve=max(reserve,bristleDrift*.54);
    gl_FragColor=vec4(1.-pigment,reserve,mix(paper,fibers,crest),1.);
  }
`;

function makeBreakerAnchors() {
  const authored = [
    [-16.8, -9.7, 25, 2.17, -.50, .27, 0], [15.6, -5.5, 23, 2.40, .39, .48, 1],
    [-19.5, 11, 24, 1.77, -.77, .58, 2], [20.5, 15, 29, 2.22, -.28, .21, 0],
    [-15.8, 31, 31, 1.78, .27, .19, 1], [14.1, 39, 27, 1.83, -.51, .62, 2],
    [-37, 43, 33, 2.03, -.32, .20, 0], [32, 53, 36, 1.78, -.53, .69, 1],
    [-31, -32, 25, 1.50, .21, .63, 1], [29, -37, 34, 1.74, -.61, .33, 2],
  ];
  for (let row = -2; row <= 2; row++) {
    for (let column = -2; column <= 2; column++) {
      if (Math.abs(row) + Math.abs(column) <= 1) continue;
      const n = (row + 2) * 5 + column + 2;
      const phase = (n * .61803398875) % 1;
      authored.push([
        column * 31 + 12 * Math.sin(n * 12.19),
        row * 34 + 10 * Math.sin(n * 9.71),
        17 + 14 * phase, 1.09 + .60 * phase,
        -1.02 + 1.41 * ((n * .4142135623) % 1), phase, (n + row + 2 * column + 6) % breakerForms.length,
      ]);
    }
  }
  const mainAngle=Math.atan2(seaWind.x,-seaWind.z);
  return authored.map(([x,z,width,height,angle,phase,form],index)=>{
    const heading=THREE.MathUtils.lerp(angle,mainAngle,.43);
    return { x,z,width,height,phase,index,form,
      forwardX:Math.sin(heading),forwardZ:-Math.cos(heading),
      rightX:Math.cos(heading),rightZ:Math.sin(heading) };
  });
}

function updateBreakerNormals(index, positions, normal, count, indexCount) {
  const values=normal.array;
  values.fill(0,0,count*3);
  // Use the same indexed face normals and area weights as Three's generic
  // routine. Only the active slots can contribute to the rendered surface.
  for(let i=0;i<indexCount;i+=3){
    const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
    const cx=positions[c]-positions[b],cy=positions[c+1]-positions[b+1],cz=positions[c+2]-positions[b+2];
    const ax=positions[a]-positions[b],ay=positions[a+1]-positions[b+1],az=positions[a+2]-positions[b+2];
    const nx=cy*az-cz*ay,ny=cz*ax-cx*az,nz=cx*ay-cy*ax;
    values[a]+=nx;values[a+1]+=ny;values[a+2]+=nz;
    values[b]+=nx;values[b+1]+=ny;values[b+2]+=nz;
    values[c]+=nx;values[c+1]+=ny;values[c+2]+=nz;
  }
  for(let i=0;i<count*3;i+=3){
    const x=values[i],y=values[i+1],z=values[i+2];
    const scale=1/(Math.sqrt(x*x+y*y+z*z)||1);
    values[i]=x*scale;values[i+1]=y*scale;values[i+2]=z*scale;
  }
}

function makeBreakers(compact) {
  const capacity = compact ? 10 : 15;
  const sections = compact ? 22 : 28;
  const samples = compact ? 26 : 32;
  const rowSize = samples + 1;
  const groupSize = (sections + 1) * rowSize;
  const count = capacity * groupSize;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const breaker = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const crown = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
  const uv = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
  const index = new Uint16Array(capacity * sections * samples * 6);
  position.setUsage(THREE.DynamicDrawUsage);
  breaker.setUsage(THREE.DynamicDrawUsage);
  crown.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aBreaker', breaker);
  geometry.setAttribute('aCrown', crown);
  geometry.setAttribute('uv', uv);
  const normal=new THREE.BufferAttribute(new Float32Array(count * 3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('normal',normal);
  let indexOffset = 0;
  for (let slot = 0; slot < capacity; slot++) {
    for (let i = 0; i <= sections; i++) {
      for (let j = 0; j <= samples; j++) {
        const vertex = slot * groupSize + i * rowSize + j;
        uv.setXY(vertex, i / sections, j / samples);
        if (i === sections || j === samples) continue;
        index.set([vertex, vertex + 1, vertex + rowSize,
          vertex + 1, vertex + rowSize + 1, vertex + rowSize], indexOffset);
        indexOffset += 6;
      }
    }
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHead: { value: new THREE.Vector3() } },
    vertexShader: breakerVertex, fragmentShader: breakerFragment, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = '破浪卷尖';
  mesh.frustumCulled = false;
  mesh.userData.inkTint = TINTS[2];
  mesh.userData.inkTintAmount = TINT_STRENGTH[2];
  const sectionsByForm=breakerForms.map(form=>form.profiles.map(profile=>
    new THREE.CatmullRomCurve3(profile.map(([x,y])=>new THREE.Vector3(x,y,0))).getPoints(samples)));
  const peaksByForm=sectionsByForm.map(form=>form.map(points=>
    points.reduce((peak,point,i)=>point.y>points[peak].y?i:peak,0)/samples));
  const anchors = makeBreakerAnchors().map(wave=>{
    const form=breakerForms[wave.form];
    const offsets=Array.from({length:sections+1},(_,i)=>{
      const along=i/sections*2-1;
      const width=along*wave.width*.5;
      return {
        along,width,bend:curveOffset(along,wave.phase,form),
        tapered:(1-along*along)**form.taper,
        crownPhase:along*form.crownRate+wave.index*.6,
      };
    });
    return {...wave,formProfile:form,offsets,hand:wave.index%2?1:-1,seed:wave.index*2.71};
  });
  const frontSample={};
  const nearby = [];
  let lastTime = -1;

  function curveOffset(along, phase, form) {
    return along*along*form.curve+Math.sin(along*form.swayRate+phase*6.28)*form.sway;
  }

  function clearance(dx,dz,rightX,rightZ,distance=Math.sqrt(dx*dx+dz*dz)) {
    if(distance<=7.4)return 0;
    const across=Math.abs(dx*rightX+dz*rightZ);
    const along=Math.abs(-dx*rightZ+dz*rightX);
    const side=THREE.MathUtils.smoothstep(across,CHANNEL_EDGE,CHANNEL_BANK);
    const reach=THREE.MathUtils.smoothstep(along,CHANNEL_LENGTH,CHANNEL_END);
    const close=THREE.MathUtils.smoothstep(distance,7.4,12.1);
    return Math.max(side,reach)*close;
  }

  function update(time, head, camera, contact) {
    material.uniforms.uTime.value = time;
    material.uniforms.uHead.value.set(head.x, head.y, head.z);
    if (lastTime >= 0 && time >= lastTime && time - lastTime < 1 / (compact ? 22 : 30)) return;
    lastTime = time;
    const basis=camera.matrixWorld.elements;
    const basisLength=Math.hypot(basis[0],basis[2])||1;
    const rightX=basis[0]/basisLength,rightZ=basis[2]/basisLength;
    nearby.length = 0;
    for (const wave of anchors) {
      wave.distance = Math.hypot(wave.x - head.x, wave.z - head.z);
      if (wave.distance < 88) nearby.push(wave);
    }
    nearby.sort((a, b) => a.distance - b.distance);
    const active = Math.min(capacity, nearby.length);
    const hasCrest=contact?.hasCrest();
    const response={x:0,z:0,gap:0,bank:0,rejoin:0};
    for (let slot = 0; slot < active; slot++) {
      const wave = nearby[slot];
      const feelsCrest=hasCrest&&wave.distance<wave.width*.56+18;
      const form=wave.formProfile;
      const [risingFace,foldedLip,fallenWash]=sectionsByForm[wave.form];
      const [earlyPeak,foldPeak,latePeak]=peaksByForm[wave.form];
      const windLoad=.82+.26*sampleSeaFront(wave.x,wave.z,time,frontSample).pressure;
      const travel = time * (.172 + .038 * wave.phase) + wave.phase;
      const age = travel - Math.floor(travel);
      const advance = (age - .44) * (11.5 + wave.width * .12);
      const far = 1 - THREE.MathUtils.smoothstep(wave.distance, 51, 82);
      const hand=wave.hand;
      const collapse=.115*Math.sin(Math.PI*age);
      let openFraction = 0;
      // Use the crest as a whole when it runs into the channel. The remaining
      // near side can still build a wall when most of its span lies outside it.
      for (let i = -2; i <= 2; i++) {
        const along = i * .32;
        const width = along * wave.width * .5;
        const forward = curveOffset(along, wave.phase, form) + advance + 1.2;
        const dx = wave.x + wave.rightX * width + wave.forwardX * forward - head.x;
        const dz = wave.z + wave.rightZ * width + wave.forwardZ * forward - head.z;
        openFraction += clearance(dx,dz,rightX,rightZ);
      }
      const lane = THREE.MathUtils.smoothstep(openFraction/5,.10,.74);
      for (let i = 0; i <= sections; i++) {
        const {along,width,bend,tapered,crownPhase}=wave.offsets[i];
        // Start breaking on one end, so the collapse travels along the wall.
        const localAge = THREE.MathUtils.clamp(age - hand * along * collapse, 0, 1);
        const roll = THREE.MathUtils.smoothstep(localAge, .18, .46);
        const spill = THREE.MathUtils.smoothstep(localAge, .49, .88);
        const crownAt=THREE.MathUtils.lerp(THREE.MathUtils.lerp(earlyPeak,foldPeak,roll),latePeak,spill);
        const grow = THREE.MathUtils.smoothstep(localAge, .005, .23);
        const breakOff = 1 - THREE.MathUtils.smoothstep(localAge, .67, .995);
        const crest=tapered*(1-form.crown+form.crown*
          Math.sin(crownPhase+localAge*5+form.crownShift));
        const baseX = wave.x + wave.rightX * width + wave.forwardX * (bend + advance);
        const baseZ = wave.z + wave.rightZ * width + wave.forwardZ * (bend + advance);
        const amplitude = crest * grow * breakOff * far * lane * windLoad;
        const liveFace=THREE.MathUtils.smoothstep(crest*grow*breakOff*far,.075,.36);
        for (let j = 0; j <= samples; j++) {
          const open = risingFace[j], fold = foldedLip[j], fallen = fallenWash[j];
          const curl = THREE.MathUtils.lerp(THREE.MathUtils.lerp(open.x, fold.x, roll), fallen.x, spill);
          const height = THREE.MathUtils.lerp(THREE.MathUtils.lerp(open.y, fold.y, roll), fallen.y, spill);
          const x = baseX + wave.forwardX * curl;
          const z = baseZ + wave.forwardZ * curl;
          if(feelsCrest)contact.crestAt(x,z,response);
          const offset=feelsCrest?.67:0;
          const load=feelsCrest?1-.93*response.gap+.62*response.bank+.75*response.rejoin:1;
          const dx=x-head.x,dz=z-head.z,distance=Math.sqrt(dx*dx+dz*dz);
          const span=clearance(dx,dz,rightX,rightZ,distance);
          const contactFoot=feelsCrest?(response.bank*.92+response.rejoin*.68)*
            THREE.MathUtils.smoothstep(distance,4.6,7.6):0;
          const compression=feelsCrest?Math.max(response.bank,response.rejoin)*(1-response.gap*.88):0;
          // The existing wave shoulder can run up above its submerged foot
          // briefly when compressed, while the bow's split still opens the center.
          const runup=liveFace*THREE.MathUtils.smoothstep(compression,.17,.60)*
            THREE.MathUtils.smoothstep(height,.58,1.63);
          const energy = amplitude*(span*load+contactFoot)+.14*runup;
          const datum = -.96 + .09 * Math.sin(PRIMARY_X*x+PRIMARY_Z*z-time*PRIMARY_DRIFT)
            +(feelsCrest ? .42*contactFoot+.88*runup : 0);
          const y = datum + height * wave.height * energy;
          const vertex = slot * groupSize + i * rowSize + j;
          position.setXYZ(vertex, x-offset*response.x, y, z-offset*response.z);
          breaker.setXYZ(vertex, energy, wave.seed, localAge);
          crown.setXY(vertex,crownAt,hand);
        }
      }
    }
    const activeIndices=active*sections*samples*6,activeVertices=active*groupSize;
    geometry.setDrawRange(0,activeIndices);
    if(!active)return;
    updateBreakerNormals(index,position.array,normal,activeVertices,activeIndices);
    for(const attribute of [position,breaker,crown,normal]){
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0,activeVertices*attribute.itemSize);
      attribute.needsUpdate=true;
    }
  }

  return { mesh, update };
}

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
  }
`;

const skyFragment = /* glsl */ `
  varying vec3 vDirection;
  uniform float uTime;
  ${noise}
  ${weatherGLSL}
  float cloudBody(vec3 p) {
    vec3 front=seaFront(p.xz,uTime);
    vec2 stroke=vec2(front.y*.035+p.y*.081,front.x*.057-p.y*.092);
    float body=washNoise(stroke+vec2(3.7,6.1));
    float fringe=washNoise(stroke*vec2(2.1,1.6)+vec2(2.1,7.2));
    float curl=front.x+(fringe-.49)*14.;
    float leading=1.-smoothstep(8.,35.,abs(curl));
    float head=(front.y-43.+(body-.5)*13.)*.028;
    float shoulder=(front.y+25.+(fringe-.5)*12.)*.036;
    float width=max(exp(-head*head),.43*exp(-shoulder*shoulder));
    float underside=14.5+2.8*sin(front.y*.044+.37)+4.5*(body-.5)+abs(curl)*.12;
    float shelf=smoothstep(underside-1.8,underside+4.7,p.y)*(1.-smoothstep(32.,42.,p.y));
    float edge=smoothstep(.23,.66,body*.64+fringe*.36);
    return leading*width*shelf*edge;
  }
  void main() {
    vec3 ray=normalize(vDirection);
    float grain=inkNoise(ray.xz*vec2(93.,110.)+ray.y*32.);
    float rise=max(ray.y,.009);
    float start=max(0.,(11.-cameraPosition.y)/rise);
    float stop=min(205.,(42.-cameraPosition.y)/rise);
    float stepLength=max(0.,stop-start)*.142857;
    float optical=0.;
    // Seven depth samples are enough for the broad bank and keep the edge
    // continuous when the camera looks along the underside.
    if(stepLength>.01&&ray.y>.009) {
      for(int i=0;i<7;i++) {
        float distanceAlong=start+(float(i)+.5)*stepLength;
        vec3 p=cameraPosition+ray*distanceAlong;
        optical+=cloudBody(p)*stepLength*(1.-smoothstep(152.,205.,distanceAlong));
      }
    }
    float shade=(1.-exp(-optical*.095))*.91*smoothstep(.012,.076,ray.y);
    float reserve=smoothstep(.52,.84,grain)*.12*shade;
    gl_FragColor=vec4(1.-shade,reserve,grain,1.);
  }
`;

const rainVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  varying float vAlpha;
  const vec2 rainWind=vec2(${seaWind.x.toFixed(3)},${seaWind.z.toFixed(3)});
  void main() {
    vec3 p=position;
    float falling=fract(aSeed.z-uTime*aSeed.w);
    p.x+=aSeed.x+(1.-falling)*rainWind.x*5.4;
    p.y+=falling*22.-1.;
    p.z+=aSeed.y+(1.-falling)*rainWind.y*5.4;
    vec4 world=modelMatrix*vec4(p,1.);
    float eyeDistance=distance(cameraPosition,world.xyz);
    vAlpha=smoothstep(2.3,8.,eyeDistance)*(1.-smoothstep(21.,36.,eyeDistance));
    vAlpha*=smoothstep(.03,.22,falling)*(1.-smoothstep(.88,1.,falling));
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;

function stormRain() {
  const count = 96;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 6);
  const seeds = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const jitter = (i * .61803398875) % 1;
    const offset = (i * .41421356237) % 1;
    const length = .32 + ((i * .74373) % 1) * .68;
    positions.set([0,0,0,length*.30*seaWind.x,-length,length*.30*seaWind.z],i*6);
    const seed = [(jitter - .5) * 62, (offset - .5) * 62, (i * .911134) % 1, .29 + jitter * .19];
    seeds.set(seed, i * 8);
    seeds.set(seed, i * 8 + 4);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const rain = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: rainVertex,
    fragmentShader: 'varying float vAlpha;void main(){gl_FragColor=vec4(.30,0.,.40,vAlpha*.22);}',
  }));
  rain.name = '海雨';
  rain.frustumCulled = false;
  rain.renderOrder = 24;
  return rain;
}

/** Atmosphere remains in world space and renders through the same ink channels as water. */
export function createOcean() {
  const root = new THREE.Group();
  root.name = '沧溟云雨';
  root.visible = false;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(165, 38, 24), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    side: THREE.BackSide,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  }));
  sky.name = '低压墨云';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  const rain = stormRain();
  const compact = typeof window !== 'undefined' && window.innerWidth < 700;
  const breakers = makeBreakers(compact);
  root.add(sky, breakers.mesh, rain);
  return {
    root,
    update(time, stage, camera, frame, contact) {
      root.visible = stage === 2;
      if (!root.visible) return;
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value = time;
      breakers.update(time, frame.position,camera,contact);
      rain.position.set(frame.position.x, 0, frame.position.z);
      rain.material.uniforms.uTime.value = time;
    },
  };
}
