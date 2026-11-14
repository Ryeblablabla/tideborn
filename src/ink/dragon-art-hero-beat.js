import * as THREE from 'three';
import { surfaceHeightSampler } from './warnings.js';
import { deathImpression } from './dragon-art-death-plates.js';

const {clamp,lerp,smoothstep} = THREE.MathUtils;
const smooth = (value,start,end) => smoothstep(value,start,end);
const fade = (value,start,end) => 1-smooth(value,start,end);
const hash = seed => {
  const sample = Math.sin(seed*127.11 + 37.73)*43758.53;
  return sample-Math.floor(sample);
};
const ROWS = 940;
const BLOCKS = 184;
const LIFE = {stone:1.06,frost:.85,abyss:.94};
const kinds = { 'stone-quarry':'stone', 'stone-march':'stone', 'abyss-undertow':'abyss', 'abyss-steamwake':'abyss',
  'abyss-transfer':'abyss', 'frost-thunder-fork':'frost', 'rift-seam':'rift', 'rift-clash':'rift', 'rift-recoil':'rift',
  'rift-wind-seam':'rift', 'frost-sheet':'frost', 'frost-temper-rush':'frost', 'stone-contour':'stone',
  'beam-quench':'beam', 'beam-quench-runoff':'beam', 'beam-intercept':'beam' };
const INK = new THREE.Color('#152724');
const MINERAL = new THREE.Color('#526e64');
const PAPER = new THREE.Color('#e5f1e5');
const OCHRE = new THREE.Color('#573c2a');
const STONE = new THREE.Color('#372b23');
const HIGHLIGHT = new THREE.Color('#e5c695');
const POISON_INK = new THREE.Color('#132e22');
const POISON_MID = new THREE.Color('#57664a');
const POISON_LIGHT = new THREE.Color('#f0ebc7');
const STEAM_INK = new THREE.Color('#4e302c');
const STEAM_MID = new THREE.Color('#a37457');
const STEAM_LIGHT = new THREE.Color('#fff8e9');
const EMBER_INK = new THREE.Color('#643626');
const EMBER_MID = new THREE.Color('#c76b3d');
const EMBER_LIGHT = new THREE.Color('#ffe3ac');
const CINNABAR_INK = new THREE.Color('#451a1d');
const CINNABAR_MID = new THREE.Color('#b45337');
const ICE_INK = new THREE.Color('#192b58');
const ICE_MID = new THREE.Color('#5d9bb8');
const ICE_LIGHT = new THREE.Color('#efffff');
const SHELF_INK = new THREE.Color('#163e43');
const SHELF_MID = new THREE.Color('#55a7a0');
const RAIN_INK = new THREE.Color('#263d50');
const RAIN_MID = new THREE.Color('#6c94a1');
const RIFT_INK = new THREE.Color('#140d1b');
const RIFT_MID = new THREE.Color('#65415e');
const RIFT_PAPER = new THREE.Color('#fff1e4');
const QUENCH_INK = new THREE.Color('#143237');
const QUENCH_MID = new THREE.Color('#578383');
const QUENCH_PAPER = new THREE.Color('#eff4e5');
const quenchBrush = {face:32, wake:33, impact:34, stored:35};
const climbingSteamBrush = {lip:52, bank:53, wet:54, spill:55};
const stoneMarchBrush = {wake:36, fissure:37, face:38, imprint:39};
const abyssTransferBrush = {bank:40, fold:41, carrier:42, residue:43};
const recoilBrush = {wake:48, bank:49, cut:50, mark:51};
const beamInterceptBrush = {char:56, paper:57};
const windSeamBrush = {ridge:60, fold:61, cut:62, trace:63};
const frostSheetBrush = {join:64, clay:65, cut:66, fragment:67};
const stoneContourBrush = {settle:68, seam:69, crest:70, impact:71};
const abyssMouthBrush = {pupil:72, fold:73, dryRim:74, trace:75};
const frostTemperBrush = {fissure:76, heat:77, vapor:78, burst:79};
const thawBrush = {crest:80, vapor:81, landing:82, paper:83};
const thawThunderBrush = {mist:84, rain:85, bolt:86, burst:87};
const galeSporeBrush = {seed:88, roll:89, wake:90, pool:91, capsule:92, stem:93, trace:94, curl:95};
const galeSplitBrush = {rill:96, husk:97, turn:98, sweep:99};
const massBrush = {frost:100, stone:104};
const massClearLife = .62;
const point = p => ({x:p.x,y:p.y,z:p.z});
const validPoint = p => p && Number.isFinite(p.x+p.y+p.z);

const depthMask = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  void maskDepth() {
    if (gl_FragCoord.z > texture2D(tDepth,gl_FragCoord.xy/resolution).r + .000031) discard;
  }
  float hash(vec2 p) {
    return fract(sin(dot(p,vec2(73.17,157.8)))*43758.532);
  }
  float grain(vec2 p) {
    vec2 c=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(hash(c),hash(c+vec2(1,0)),f.x),mix(hash(c+vec2(0,1)),hash(c+vec2(1)),f.x),f.y);
  }
`;
const ribbonVertex = /* glsl */ `
  attribute vec4 stroke;
  varying vec4 vStroke;
  void main() {
    vStroke=stroke;
    gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);
  }
`;
const ribbonFragment = /* glsl */ `
  ${depthMask}
  uniform vec3 dark, middle, paper, ochre, sandstone;
  uniform vec3 poisonInk, poisonMid, poisonLight, steamInk, steamMid, steamLight, emberInk, emberMid, emberLight;
  uniform vec3 iceInk, iceMid, iceLight, shelfInk, shelfMid, rainInk, rainMid, riftInk, riftMid, riftPaper;
  uniform vec3 quenchInk, quenchMid, quenchPaper;
  uniform vec3 cinnabarInk, cinnabarMid;
  varying vec4 vStroke;
  void main() {
    maskDepth();
    float u=vStroke.x, v=vStroke.y, mode=mod(vStroke.w,4.);
    float family=floor(vStroke.w/4.);
    float tooth=hash(floor(gl_FragCoord.xy));
    float warp=grain(vec2(u*22.+mode*4.,v*8.));
    float split=grain(vec2(u*37.,v*49.));
    float tip=smoothstep(0.,.057,u)*(1.-smoothstep(.92,1.,u));
    float edge=abs(v+.18*(warp-.5));
    float alpha=0., wash=0., light=0.;
    bool stone=mode>1.5;
    if (mode<.5) {
      float folded=v+.12*sin(u*24.+warp);
      float thick=1.-smoothstep(.68,1.,edge+.07*sin(u*29.));
      float flight=1.-smoothstep(.018,.10,abs(folded-.53));
      float dry=1.-smoothstep(.013,.092,abs(folded+.31-.08*sin(u*40.)));
      float filament=grain(vec2(u*17.,v*64.));
      alpha=max(thick*(.62+.38*split),flight*.95)*tip;
      wash=.13+.49*warp+.12*filament;
      light=max(flight*(.73+.27*tooth),dry*(.27+.44*filament));
    } else if(mode<1.5) {
      float torn=1.-smoothstep(.48,.98,abs(v+.29*(warp-.5)));
      alpha=torn*tip*smoothstep(.17,.79,split+.27*warp);
      wash=.32+.53*warp;
      light=(1.-smoothstep(.01,.13,abs(v-.41+.11*sin(u*19.))))*.81;
    } else if(mode<2.5) {
      float chip=1.-smoothstep(.59,1.,edge);
      float crest=1.-smoothstep(.015,.14,abs(v-.47-.19*warp));
      float fissure=1.-smoothstep(.012,.065,abs(v+.15*sin(u*87.)+.16*(split-.5)));
      float broken=.57+.43*smoothstep(.12,.72,warp);
      alpha=tip*max(chip*broken,crest*.84);
      wash=.16+.53*warp;
      light=max(crest*.79,fissure*.52)*broken;
    } else {
      float zig=abs(v+.09*sin(u*25.)+.07*sin(u*49.));
      float fracture=1.-smoothstep(.105,.30,zig);
      float dark=1.-smoothstep(.44,.84,zig);
      alpha=max(fracture,dark*.95)*(.88+.12*tooth)*tip;
      wash=.12+.40*warp;
      light=fracture*(.84+.16*split);
    }
    if(family>24.5) {
      float cut=clamp(.24+.20*floor(u*15.)/15.+.12*sin(u*29.)+.11*sin(u*53.),.09,.74);
      float rag=v+.06*(warp-.5)+.052*sin(u*67.);
      float edgeLine=1.-smoothstep(.020,.15,abs(rag-cut));
      float toothCut=smoothstep(.12,.66,split+.28*warp);
      float slab=(1.-smoothstep(.59,.98,abs(rag)))*mix(.82,1.,toothCut);
      float vein=1.-smoothstep(.016,.11,abs(rag+.20+.15*sin(u*40.)+.08*floor(u*18.)));
      if(mode<.5) {
        alpha=tip*max(slab*.81,edgeLine);
        light=max(edgeLine*.94,vein*.61*toothCut);
        wash=.06+.46*warp;
      } else if(mode<1.5) {
        alpha=tip*max(slab*.52,edgeLine*.85);
        light=max(edgeLine*.91,vein*.35)*(.74+.26*toothCut);
        wash=.15+.49*warp;
      } else if(mode<2.5) {
        alpha=tip*slab*(.23+.77*toothCut);
        light=max(edgeLine*.67,vein*.44)*toothCut;
        wash=.34+.46*warp;
      } else {
        float open=1.-smoothstep(.11,.82,abs(rag));
        alpha=tip*open*(.80+.20*toothCut);
        light=.81+.19*toothCut;
        wash=warp*.38;
      }
    } else if(family>23.5) {
      float wetGrain=smoothstep(.16,.72,split+.24*warp);
      float burr=.18*(warp-.5)+.095*sin(u*39.)+.045*sin(u*83.);
      float side=v+burr;
      float belly=1.-smoothstep(.41,.99,abs(side));
      float rim=1.-smoothstep(.030,.195,abs(side-.65+.10*sin(u*21.)));
      float breakaway=1.-smoothstep(.08,.48,abs(side+.22+.12*sin(u*18.)));
      alpha=tip*max(belly*(.71+.29*wetGrain),rim*.90);
      wash=.05+.42*warp;
      light=max(rim*.99,breakaway*(mode>2.5?.46:.38)*wetGrain);
      if(mode>1.5)light=max(light,breakaway*.73*wetGrain);
    } else if(family>22.5) {
      float fibers=smoothstep(.13,.73,split+.21*warp);
      float rag=v+.18*(warp-.5)+.065*sin(u*33.);
      float body=1.-smoothstep(.50,.98,abs(rag));
      float margin=1.-smoothstep(.018,.20,abs(rag-.66+.09*sin(u*31.)));
      float streak=1.-smoothstep(.024,.18,abs(rag+.17+.21*sin(u*16.)));
      alpha=tip*max(body*(.83+.17*fibers),margin);
      wash=.085+.30*warp;
      light=mode<.5?max(.92*margin,.64*streak):max(.89*margin,.37*streak*fibers);
      if(mode>1.5) {
        float wetEdge=1.-smoothstep(.045,.23,abs(rag-.28-.17*sin(u*18.)));
        alpha*=.65+.35*fibers;
        light=max(.95*margin,.71*wetEdge*fibers);
      }
    } else if(family>21.5) {
      // Held pigment forms one dark belly and a broken, yellowed margin.
      float clay=grain(vec2(u*13.+mode*2.,v*6.));
      float rag=v+.24*(clay-.5)+.10*sin(u*28.)+.036*sin(u*73.);
      float body=1.-smoothstep(.42,.98,abs(rag));
      float grainCut=smoothstep(.19,.71,split+.32*warp);
      float rim=1.-smoothstep(.023,.17,abs(rag-.61+.09*sin(u*27.)));
      float wax=1.-smoothstep(.031,.16,abs(rag+.19+.17*sin(u*17.)+.13*(clay-.5)));
      alpha=tip*max(body*(.71+.29*grainCut),rim*.89);
      wash=.10+.46*clay+.14*warp;
      light=max(rim*.78,wax*.31)*(.65+.35*grainCut);
      if(mode>1.5&&mode<2.5) {
        alpha*=.45+.55*grainCut;
        wash+=.25;
        light=max(rim*.64,wax*.53)*grainCut;
      } else if(mode>2.5) {
        alpha*=.65+.35*clay;
        wash*=.79;
        light=max(rim*.63,wax*.45)*grainCut;
      }
    } else if(family>20.5) {
      float rag=v+.22*(warp-.5)+.075*sin(u*56.);
      float body=1.-smoothstep(.48,1.,abs(rag));
      float toothEdge=smoothstep(.23,.77,split*.88+.15*warp);
      float seam=1.-smoothstep(.027,mode>1.5?.22:.13,
        abs(rag-.13-.11*sin(u*35.)));
      float lip=1.-smoothstep(.044,.18,abs(rag-.61+.08*sin(u*24.)));
      alpha=tip*max(body*(.76+.24*toothEdge),seam)*(.76+.24*toothEdge);
      if(mode<1.5)alpha*=.59+.41*toothEdge;
      wash=mode>1.5?.12+.43*warp:.09+.56*warp;
      light=mode<.5?max(lip*.83,seam*.38):max(seam*.96,lip*.51);
    } else if(family>19.5) {
      float rag=v+.21*(warp-.5)+.055*sin(u*42.);
      float bristle=smoothstep(.19,.78,split+.24*warp);
      float inkBody=1.-smoothstep(.54,.98,abs(rag));
      float wetRim=1.-smoothstep(.053,.28,abs(rag-.60-.12*sin(u*28.)));
      float paperTear=1.-smoothstep(.022,.15,abs(rag+.15+.10*sin(u*51.)+.19*(split-.5)));
      if(mode<.5) {
        alpha=tip*max(inkBody*(.77+.23*bristle),wetRim*.95);
        wash=.11+.54*warp;
        light=max(wetRim,paperTear*bristle*.82);
      } else if(mode<1.5) {
        alpha=tip*inkBody*(.42+.58*bristle);
        wash=.22+.61*warp;
        light=max(.56+.32*bristle,wetRim);
      } else {
        float chipped=smoothstep(.16,.75,grain(vec2(u*31.+mode,v*16.))+.30*warp);
        float d=abs(rag-.23-.22*sin(u*22.));
        float fissure=1.-smoothstep(.036,.25,d);
        alpha=tip*max(inkBody*(.61+.39*chipped),fissure)*(.57+.43*bristle);
        wash=.17+.44*warp;
        light=mode>2.5?max(.42,fissure):max(fissure*.87,wetRim*.64);
      }
    } else if(family>18.5) {
      float rag=v+.14*(warp-.5)+.05*sin(u*47.);
      float body=1.-smoothstep(.54,1.,abs(rag));
      float bristle=smoothstep(.17,.73,split*.81+warp*.29);
      float lip=1.-smoothstep(.013,.19,abs(rag-.63-.12*sin(u*31.)));
      float splitInk=1.-smoothstep(.015,.126,abs(rag+.10+.21*sin(u*27.)+.11*sin(u*76.)));
      if(mode<.5) {
        alpha=tip*max(body,splitInk)*(.91+.09*bristle);
        wash=.28+.49*warp;
        light=max(lip*.25,splitInk*.91);
      } else if(mode<1.5) {
        alpha=tip*max(body*.74,splitInk)*(.77+.23*bristle);
        wash=.55+.31*warp;
        light=max(splitInk*.89,lip*.34);
      } else if(mode<2.5) {
        float rim=rag-.54-.088*sin(u*18.);
        float steam=1.-smoothstep(.081,.37,abs(rim));
        float dry=1.-smoothstep(.014,.084,abs(rim+.23+.072*sin(u*71.)));
        alpha=tip*max(body*(.86+.14*bristle),steam);
        wash=.11+.38*warp;
        light=max(steam*(.87+.13*bristle),dry*.89*bristle);
      } else {
        float cut=rag-.38-.11*sin(u*21.)-.12*(warp-.5);
        float paperCut=1.-smoothstep(.085,.38,abs(cut));
        float skip=smoothstep(.27,.65,grain(vec2(u*24.,v*17.))+.18*warp);
        float opening=smoothstep(.04,.28,abs(rag+.25+.20*sin(u*20.)));
        alpha=tip*max(body*(.79+.21*bristle)*mix(skip,1.,opening),paperCut*.89);
        wash=.12+.59*warp*warp;
        light=max(paperCut*(.87+.13*bristle),lip*.71*skip);
      }
    } else if(family>17.5) {
      float rag=v+.13*(warp-.5)+.064*sin(u*61.);
      float fiber=smoothstep(.19,.76,split*.67+warp*.36);
      float body=1.-smoothstep(.61,.99,abs(rag));
      float opening=1.-smoothstep(.022,.134,abs(rag-.46-.13*sin(u*26.)));
      float scrape=1.-smoothstep(.018,.097,abs(rag+.25+.11*sin(u*45.)));
      if(mode<.5) {
        alpha=tip*body;
        wash=.006+.032*warp;
      } else if(mode<1.5) {
        alpha=max(body*(.69+.31*fiber),opening*.60)*tip;
        wash=.06+.23*warp;
        light=opening*(.29+.25*fiber);
      } else if(mode<2.5) {
        alpha=max(body*(.24+.76*fiber),opening)*tip;
        wash=.08+.34*warp;
        light=max(opening*.97,scrape*.64)*(.84+.16*fiber);
      } else {
        alpha=tip*max(body*.72,opening*.87)*(.61+.39*fiber);
        wash=.15+.38*warp;
        light=max(opening*.78,scrape*.52);
      }
    } else if(family>16.5) {
      float grit=smoothstep(.14,.76,split*.68+warp*.37);
      float side=v+.11*(warp-.5)+.055*sin(u*48.);
      float body=1.-smoothstep(.63,.99,abs(side));
      float cut=1.-smoothstep(.017,.12,abs(side-.23-.24*sin(u*34.)-.10*sin(u*79.)));
      float edge=1.-smoothstep(.018,.16,abs(side-.75+.10*sin(u*40.)));
      if(mode<.5) {
        alpha=tip*body*(.53+.47*grit);
        wash=.13+.26*warp;
        light=max(.36*cut,.66*edge)*grit;
      } else if(mode<1.5) {
        alpha=tip*max(.75*body,cut)*(.70+.30*grit);
        wash=.09+.26*warp;
        light=cut*(.77+.23*grit);
      } else if(mode<2.5) {
        alpha=tip*max(body*(.73+.27*grit),edge);
        wash=.10+.37*warp;
        light=max(.94*edge,.36*cut)*(.69+.31*grit);
      } else {
        alpha=tip*max(body*.68,cut)*(.78+.22*grit);
        wash=.16+.41*warp;
        light=max(.80*edge,.83*cut);
      }
    } else if(family>15.5) {
      float fibers=smoothstep(.12,.82,split*.72+warp*.32);
      float cracked=v+.055*sin(u*61.)+.10*(warp-.5);
      float rim=1.-smoothstep(.012,.10,abs(abs(cracked)-.83));
      float vein=1.-smoothstep(.014,.10,abs(v+.20*sin(u*7.)+.19*sin(u*29.)));
      float body=(1.-smoothstep(.74,.99,abs(cracked)))*tip;
      if(mode<.5) {
        alpha=tip*(1.-smoothstep(.57,1.,abs(cracked)))*(.77+.23*fibers);
        wash=.10+.26*warp;
        light=(1.-smoothstep(.03,.37,abs(cracked)))*(.61+.31*fibers);
      } else if(mode<1.5) {
        alpha=max(body*(.46+.47*fibers),rim*.82*tip);
        wash=.44+.37*warp;
        light=max(rim*.95,vein*.36)*tip;
      } else if(mode<2.5) {
        alpha=max(body*.64,vein)*(.82+.18*fibers)*tip;
        wash=.13+.29*warp;
        light=max(vein,rim*.84)*tip;
      } else {
        alpha=max(body*(.59+.41*fibers),rim*.91*tip);
        wash=.24+.48*warp;
        light=max(rim*.92,vein*.60)*tip;
      }
    } else if(family>14.5) {
      float torn=v+.20*(warp-.5)+.075*sin(u*36.)+.048*sin(u*91.);
      float edge=1.-smoothstep(.013,.16,abs(torn-.54-.13*sin(u*24.)));
      float scrape=1.-smoothstep(.021,.113,abs(torn+.28-.17*sin(u*32.)));
      float body=1.-smoothstep(.54,.98,abs(torn));
      float dry=smoothstep(.11,.71,split+.27*warp);
      wash=.20+.34*warp;
      if(mode<.5) {
        alpha=tip*max(body*(.56+.44*dry),edge)*(.69+.31*tooth);
        light=max(edge*.98,scrape*.64)*(.76+.24*split);
      } else if(mode<1.5) {
        alpha=tip*max(body*(.85+.15*tooth),edge);
        wash*=.52;
        light=edge*.71+scrape*.28*dry;
      } else if(mode<2.5) {
        float crack=1.-smoothstep(.025,.24,abs(torn+.14*sin(u*44.)));
        alpha=tip*max(body*.77,crack)*(.73+.27*dry);
        light=max(crack,edge*.91);
      } else {
        alpha=tip*max(body*.57,edge)*(.48+.52*dry);
        light=max(edge*.85,scrape*.56);
      }
    } else if(family>13.5) {
      float toothEdge=v+.15*sin(u*49.)+.084*sin(u*91.)+.18*(warp-.5);
      float burnt=1.-smoothstep(.52,.99,abs(toothEdge));
      float edge=1.-smoothstep(.024,.17,abs(toothEdge-.59-.12*sin(u*29.)));
      float fly=1.-smoothstep(.012,.090,abs(toothEdge+.32+.11*sin(u*36.)));
      float fibers=smoothstep(.17,.74,split+.14*warp);
      alpha=max(burnt*(.58+.42*fibers),.92*edge)*tip;
      wash=.17+.33*warp;
      light=(mode<.5?max(edge*.48,fly*.27):max(edge*.96,fly*.64))*(.78+.22*fibers);
    } else if(family>12.5) {
      float torn=v+.19*(warp-.5)+.075*sin(u*32.);
      float surface=1.-smoothstep(.58,.99,abs(torn));
      float crest=1.-smoothstep(.025,.15,abs(torn-.60+.16*sin(u*28.)));
      float rill=1.-smoothstep(.060,.25,abs(torn+.29+.13*sin(u*21.)));
      float fibers=smoothstep(.11,.75,split+.25*warp);
      wash=.09+.23*warp;
      if(mode<.5) {
        alpha=max(surface*(.87+.13*fibers),crest)*tip;
        light=max(crest*.97,rill*.74)*(.70+.30*fibers);
      } else if(mode<1.5) {
        alpha=max(surface*(.82+.18*fibers),crest*.86)*tip;
        light=max(crest*.63,rill*.21)*fibers;
      } else if(mode<2.5) {
        alpha=surface*(.59+.31*warp)*tip;
        wash+=.30;
        light=max(crest*.55,rill*.63)*(.49+.51*fibers);
      } else {
        alpha=max(surface*.67,crest*.86)*tip*(.67+.33*fibers);
        light=max(crest*.96,rill*.54)*fibers;
      }
    } else if(family>11.5) {
      float rough=.14*sin(u*32.)+.08*sin(u*68.)+.20*(warp-.5);
      float side=v+rough;
      float body=1.-smoothstep(.57,.98,abs(side));
      float fiber=smoothstep(.13,.77,split+.20*warp);
      float lip=1.-smoothstep(.012,.116,abs(side-.57-.12*sin(u*22.)));
      float scrape=1.-smoothstep(.020,.092,abs(side+.28-.16*sin(u*16.)-.080*sin(u*49.)));
      alpha=max(body*(.84+.16*fiber),lip*.97)*tip;
      wash=.06+.24*warp;
      light=lip*.73+scrape*.33*fiber;
      if(mode<.5){alpha*=.61+.39*fiber;light*=.46;}
      else if(mode<1.5){light*=.66;wash+=.19;}
      else if(mode>2.5){alpha*=.73+.27*fiber;light=max(lip*.63,scrape*.77);}
    } else if(family>9.5) {
      float rim=abs(v + .21*(warp-.5) + .066*sin(u*36.));
      float rag=1.-smoothstep(.51,.99,rim);
      float fracture=grain(vec2(u*35.,v*59.));
      float dry=1.-smoothstep(.025,.14,abs(v+.21+.13*sin(u*28.)-.11*(warp-.5)));
      float rimCut=1.-smoothstep(.011,.11,abs(v-.63+.19*sin(u*22.)));
      alpha=max(rag*(.79+.21*fracture),.85*rimCut)*tip;
      wash=.09+.26*warp;
      light=max(dry*.64,rimCut*.83)*(.78+.22*fracture);
      if(mode>.5&&mode<1.5){light*=.37;wash+=.26;alpha*=.58+.42*fracture;}
      if(mode>2.5){light*=.48;wash+=.16;alpha*=smoothstep(.06,.69,fracture+.25*warp);}
    } else if(family>8.5) {
      float rag=.19*(warp-.5)+.052*sin(u*72.);
      float side=v+rag;
      float body=1.-smoothstep(.59,1.03,abs(side));
      float bristle=smoothstep(.24,.68,split+.29*warp);
      float ledge=1.-smoothstep(.015,.125,abs(side-.57-.10*sin(u*26.)));
      float fault=.20*sin(u*18.)+.17*sin(u*47.)+.095*sin(u*92.);
      float fissure=1.-smoothstep(.028,.15,abs(side-fault));
      alpha=body*tip*(.84+.16*bristle);
      wash=.09+.20*warp;
      light=ledge*bristle*.30;
      if(mode>.5&&mode<1.5) {
        alpha=max(body*.76,fissure)*tip;
        light=fissure*.96;
      } else if(mode>1.5&&mode<2.5) {
        light=max(ledge*.82,fissure*.59)*(.71+.29*bristle);
        wash+=.14*smoothstep(-.9,.63,side);
      } else if(mode>2.5) {
        alpha*=.60+.40*bristle;
        light=ledge*.33;
      }
    } else if (family>7.5) {
      float cloud=1.-smoothstep(.32,.99,abs(v+.37*(warp-.5)+.17*sin(u*26.)));
      float seam=1.-smoothstep(.018,.12,abs(v+.21+.17*sin(u*27.)-.08*(split-.5)));
      float lip=1.-smoothstep(.023,.15,abs(v-.54+.14*sin(u*18.+warp)));
      float toothEdge=.58+.42*smoothstep(.12,.80,split+.22*warp);
      if(mode<.5) {
        // Dense advancing brush with one dry-brush white leading edge.
        alpha=max(cloud*(.84+.16*warp),lip*.97)*tip;
        wash=.08+.42*warp;
        light=max(seam*.40,lip*(.82+.17*split));
      } else if(mode<1.5) {
        alpha=cloud*toothEdge*tip;
        wash=.35+.32*warp;
        light=seam*.64;
      } else if(mode<2.5) {
        alpha=max(cloud*.87,lip)*tip;
        wash=.13+.36*warp;
        light=max(seam*.87,lip*.82);
      } else {
        alpha=max(cloud*.77,lip*.68)*toothEdge*tip;
        wash=.28+.36*warp;
        light=max(seam*.56,lip*.42);
      }
    } else if (family>6.5) {
      float breakage=.10*sin(u*39.)+.07*sin(u*79.)+.19*(warp-.5);
      float side=abs(v+breakage);
      float inkBody=1.-smoothstep(.63,.97,side);
      float ripped=1.-smoothstep(.014,.105,abs(side-.72));
      float fine=1.-smoothstep(.06,.22,abs(v+.09*sin(u*47.)));
      alpha=max(.96*inkBody,ripped)*tip;
      wash=.07+.21*warp+.21*ripped;
      light=ripped*(.53+.35*split);
      if(mode>2.5) { alpha=(.79*inkBody+.21*fine)*tip; light=fine*.91; }
    }
    alpha*=vStroke.z*(.93+.07*tooth);
    if(alpha<.017)discard;
    vec3 ink=mix(stone?ochre:dark,stone?sandstone:middle,clamp(wash,0.,1.));
    vec3 white=paper;
    if(family>.5&&family<1.5) { ink=mix(poisonInk,poisonMid,wash); white=poisonLight; }
    else if(family>1.5&&family<2.5) {
      ink=mix(steamInk,steamMid,wash*.85); white=steamLight;
      light*=.79;
    }
    else if(family>2.5&&family<3.5) { ink=mix(emberInk,emberMid,wash); white=emberLight; }
    else if(family>24.5) {
      bool rock=family>25.5;
      ink=rock?mix(ochre*.47,sandstone,wash*.77):mix(iceInk*.59,iceMid,wash*.82);
      white=rock?mix(steamLight,emberLight,.24):iceLight;
    }
    else if(family>23.5) {
      ink=mix(vec3(.026,.039,.014),vec3(.255,.228,.058),wash);
      white=mode>2.5?vec3(.941,.91,.66):vec3(.91,.80,.45);
    }
    else if(family>22.5) {
      ink=mode>1.5?mix(vec3(.038,.043,.019),vec3(.23,.22,.069),wash):mix(poisonInk*.18,vec3(.105,.149,.052),wash);
      white=mix(poisonLight,vec3(.75,.69,.38),mode>1.5?.44:.19);
    }
    else if(family>21.5) {
      ink=mix(poisonInk*.32,vec3(.163,.194,.072),wash);
      white=mix(poisonLight,vec3(.55,.57,.27),mode<.5?.21:.36);
    }
    else if(family>20.5) {
      ink=mode<.5?mix(cinnabarInk*.50,steamMid,wash):mix(iceInk*.61,iceMid,wash);
      white=mode<.5?steamLight:iceLight;
    }
    else if(family>19.5) {
      ink=mix(steamInk*.40,mode<1.5?steamMid:cinnabarMid,wash);
      white=steamLight;
    }
    else if(family>18.5) {
      ink=mix(cinnabarInk,mode>1.5&&mode<2.5?steamMid:cinnabarMid,wash);
      white=mode<1.5?emberLight:steamLight;
    }
    else if(family>17.5) { ink=mix(dark*.22,middle,wash); white=mix(paper,vec3(.91,.92,.83),.20); }
    else if(family>16.5) { ink=mix(ochre*.50,sandstone,wash*.71); white=mix(paper,sandstone,.37); }
    else if(family>15.5) { ink=mix(iceInk*.72,iceMid,wash); white=iceLight; }
    else if(family>14.5) {
      ink=mode<.5?mix(quenchInk*.61,quenchMid,wash):mix(riftInk*.41,riftMid,wash);
      white=mode<.5?quenchPaper:riftPaper;
    }
    else if(family>13.5) { ink=mix(emberInk*.51,emberMid,wash); white=emberLight; }
    else if(family>12.5) { ink=mix(quenchInk*.76,quenchMid,wash); white=quenchPaper; }
    else if(family>11.5) { ink=mix(riftInk*.53,riftMid,wash*.52); white=riftPaper; }
    else if(family>10.5) { ink=mix(dark*.54,middle,wash); white=paper; }
    else if(family>9.5) { ink=mix(poisonInk*.57,poisonMid,wash); white=poisonLight; }
    else if(family>8.5) { ink=mix(ochre*.45,sandstone,wash*.30); white=mix(paper,sandstone,.28); }
    else if(family>7.5) { ink=mix(quenchInk,quenchMid,wash); white=quenchPaper; }
    else if(family>6.5) { ink=mix(riftInk,riftMid,wash); white=riftPaper; }
    else if(family>4.5) { ink=family>5.5?mix(rainInk,rainMid,wash):mix(shelfInk,shelfMid,wash); white=iceLight; }
    else if(family>3.5) { ink=mix(iceInk,iceMid,wash); white=iceLight; }
    gl_FragColor=vec4(mix(ink,white,clamp(light,0.,1.)),min(alpha,1.));
    #include <colorspace_fragment>
  }
`;
const blocksVertex = /* glsl */ `
  attribute float aLoad;
  varying vec3 vNormal, vTint, vLocal;
  varying float vLoad;
  void main() {
    vLocal=position;
    vLoad=aLoad;
    vTint=instanceColor;
    vNormal=normalize(mat3(instanceMatrix)*normal);
    gl_Position=projectionMatrix*viewMatrix*instanceMatrix*vec4(position,1.);
  }
`;
const blocksFragment = /* glsl */ `
  ${depthMask}
  uniform vec3 ochre, facing;
  varying vec3 vNormal, vTint, vLocal;
  varying float vLoad;
  void main() {
    maskDepth();
    float fiber=grain(vLocal.xz*48. + vLocal.y*29.);
    float l=.42+.58*max(0.,dot(normalize(vNormal),normalize(vec3(-.7,1.,.35))));
    float fold=abs(sin(dot(vLocal,vec3(13.2,4.8,15.1))+.73*fiber));
    float ridge=(1.-smoothstep(.032,.27,fold))*smoothstep(.42,.79,l);
    float ink=.75+.25*grain(vLocal.xy*9.);
    vec3 color=mix(ochre,vTint,ink*l);
    color=mix(color,facing,ridge*.71);
    if(vLoad<.045)discard;
    gl_FragColor=vec4(color,vLoad);
    #include <colorspace_fragment>
  }
`;

class HeroGeometry {
  constructor() {
    const geometry=new THREE.BufferGeometry();
    this.positions=new THREE.BufferAttribute(new Float32Array(ROWS*6),3).setUsage(THREE.DynamicDrawUsage);
    this.strokes=new THREE.BufferAttribute(new Float32Array(ROWS*8),4).setUsage(THREE.DynamicDrawUsage);
    this.indices=new THREE.BufferAttribute(new Uint16Array(ROWS*6),1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',this.positions);
    geometry.setAttribute('stroke',this.strokes);
    geometry.setIndex(this.indices);
    const uniforms={tDepth:{value:null},resolution:{value:new THREE.Vector2()}};
    this.uniforms=uniforms;
    this.ribbonMesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
      vertexShader:ribbonVertex,fragmentShader:ribbonFragment,transparent:true,depthWrite:false,depthTest:false,
      forceSinglePass:true,side:THREE.DoubleSide,uniforms:{...uniforms,dark:{value:INK},middle:{value:MINERAL},paper:{value:PAPER},
        ochre:{value:OCHRE},sandstone:{value:HIGHLIGHT},poisonInk:{value:POISON_INK},poisonMid:{value:POISON_MID},
        poisonLight:{value:POISON_LIGHT},steamInk:{value:STEAM_INK},steamMid:{value:STEAM_MID},steamLight:{value:STEAM_LIGHT},
        emberInk:{value:EMBER_INK},emberMid:{value:EMBER_MID},emberLight:{value:EMBER_LIGHT},
        iceInk:{value:ICE_INK},iceMid:{value:ICE_MID},iceLight:{value:ICE_LIGHT},
        shelfInk:{value:SHELF_INK},shelfMid:{value:SHELF_MID},rainInk:{value:RAIN_INK},rainMid:{value:RAIN_MID},
        riftInk:{value:RIFT_INK},riftMid:{value:RIFT_MID},riftPaper:{value:RIFT_PAPER},
        quenchInk:{value:QUENCH_INK},quenchMid:{value:QUENCH_MID},quenchPaper:{value:QUENCH_PAPER},
        cinnabarInk:{value:CINNABAR_INK},cinnabarMid:{value:CINNABAR_MID}},
    }));
    const rock=new THREE.IcosahedronGeometry(1,0);
    const pos=rock.getAttribute('position');
    for (let i=0;i<pos.count;i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      pos.setXYZ(i,x*(.88+.32*hash(x*7+y*8)),y*(.78+.38*hash(y*10-z*3)),z*(.77+.31*hash(z*5+x*3)));
    }
    rock.computeVertexNormals();
    this.loads=new THREE.InstancedBufferAttribute(new Float32Array(BLOCKS),1).setUsage(THREE.DynamicDrawUsage);
    rock.setAttribute('aLoad',this.loads);
    this.blockMesh=new THREE.InstancedMesh(rock,new THREE.ShaderMaterial({
      vertexShader:blocksVertex,fragmentShader:blocksFragment,transparent:true,depthWrite:false,depthTest:false,
      uniforms:{...uniforms,ochre:{value:STONE},facing:{value:HIGHLIGHT}},
    }),BLOCKS);
    this.blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blockMesh.setColorAt(0,OCHRE);
    this.blockMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.root=new THREE.Group();
    this.root.name='Dragon arts · impact front';
    for (const mesh of [this.ribbonMesh,this.blockMesh]) {
      mesh.frustumCulled=false;
      mesh.renderOrder=87;
      this.root.add(mesh);
    }
    this.blockMesh.renderOrder=91;
    this.pose=new THREE.Object3D();
    this.color=new THREE.Color();
    this.p=new THREE.Vector3();
    this.track=new THREE.Vector3();
    this.lead=new THREE.Vector3();
    this.trail=new THREE.Vector3();
    this.side=new THREE.Vector3();
    this.eye=new THREE.Vector3();
    this.cameraRight=new THREE.Vector3();
    this.vertexCount=this.indexCount=this.blockCount=0;
  }

  begin(camera,depth,resolution) {
    this.vertexCount=this.indexCount=this.blockCount=0;
    this.uniforms.tDepth.value=depth;
    this.uniforms.resolution.value.copy(resolution);
    this.eye.setFromMatrixColumn(camera.matrixWorld,2);
    this.cameraRight.setFromMatrixColumn(camera.matrixWorld,0);
  }

  band(segments,mode,alpha,position) {
    if (alpha<.019 || this.vertexCount/2+segments+1>=ROWS) return;
    const {p,side,positions,strokes,indices}=this;
    for (let i=0;i<=segments;i++) {
      const u=i/segments;
      const coverage=position(u,p,side)??1;
      const vertex=this.vertexCount;
      positions.setXYZ(vertex,p.x-side.x,p.y-side.y,p.z-side.z);
      positions.setXYZ(vertex+1,p.x+side.x,p.y+side.y,p.z+side.z);
      strokes.setXYZW(vertex,u,-1,alpha*coverage,mode);
      strokes.setXYZW(vertex+1,u,1,alpha*coverage,mode);
      this.vertexCount+=2;
      if (!i) continue;
      const offset=this.indexCount;
      indices.array.set([vertex-2,vertex-1,vertex,vertex-1,vertex+1,vertex],offset);
      this.indexCount+=6;
    }
  }

  block(x,y,z,width,height,depth,heading,spin,alpha,seed) {
    if (this.blockCount>=BLOCKS || alpha<.046) return;
    const {blockMesh,pose}=this;
    const index=this.blockCount++;
    pose.position.set(x,y,z);
    pose.rotation.set(.28+spin*.78,heading,.35+spin*.51);
    pose.scale.set(width,height,depth);
    pose.updateMatrix();
    blockMesh.setMatrixAt(index,pose.matrix);
    blockMesh.setColorAt(index,this.color.copy(OCHRE).lerp(HIGHLIGHT,.12+.38*hash(seed)));
    this.loads.setX(index,alpha);
  }

  finish() {
    this.root.visible=Boolean(this.vertexCount||this.blockCount);
    this.ribbonMesh.visible=Boolean(this.vertexCount);
    this.blockMesh.visible=Boolean(this.blockCount);
    this.ribbonMesh.geometry.setDrawRange(0,this.indexCount);
    this.blockMesh.count=this.blockCount;
    for (const [attribute,count] of [[this.positions,this.vertexCount],[this.strokes,this.vertexCount],[this.indices,this.indexCount],
      [this.loads,this.blockCount],[this.blockMesh.instanceMatrix,this.blockCount],[this.blockMesh.instanceColor,this.blockCount]]) {
      if (!count) continue;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0,count*attribute.itemSize);
      attribute.needsUpdate=true;
    }
  }
}

function setupFront(event) {
  const {from,to}=event;
  const dx=to.x-from.x,dz=to.z-from.z;
  const length=Math.hypot(dx,dz);
  if(length<.18) return null;
  const family=event.reaction==='abyss-steamwake'?8:event.reaction==='abyss-undertow'?4:0;
  return {from,to,path:event.points,fx:dx/length,fz:dz/length,length,width:clamp(event.width??event.radius??5,2.3,14),family,
    windup:event.windup??0,travel:event.travel??.40,duration:event.duration??.91,
    transition:event.transition,condenseAt:event.condenseAt,condensedAt:event.condensedAt,steamRise:event.steamRise??0};
}

function track(front,t,out) {
  const {path,from,to}=front;
  if(!path?.length) return out.set(lerp(from.x,to.x,t),lerp(from.y,to.y,t),lerp(from.z,to.z,t));
  const pathLength=path.at(-1).along;
  if(pathLength>0) {
    const reached=clamp(t,0,1)*pathLength;
    const next=path.findIndex(p=>p.along>=reached);
    if(next<=0) {
      const p=next===0?path[0]:path.at(-1);
      return out.set(p.x,p.y,p.z);
    }
    const a=path[next-1], b=path[next];
    const mix=(reached-a.along)/Math.max(.001,b.along-a.along);
    return out.set(lerp(a.x,b.x,mix),lerp(a.y,b.y,mix),lerp(a.z,b.z,mix));
  }
  const n=t*(path.length-1);
  const a=path[Math.floor(n)], b=path[Math.ceil(n)];
  return out.set(lerp(a.x,b.x,n%1),lerp(a.y,b.y,n%1),lerp(a.z,b.z,n%1));
}

function paintDeparture(geometry,front,age,seed) {
  const {from,fx,fz,width,windup,family}=front;
  const build=smooth(age,0,Math.max(.06,windup*.80));
  const alpha=build*fade(age,windup+.02,windup+.24);
  if(alpha<.035)return;
  const drying=Math.max(0,age-windup);
  const finish=clamp(drying/.22,0,1);
  const thickness=.13 + finish*.30;
  const span=Math.min(6.1,width*(.63+.30*finish))*lerp(.46,1,build);
  for(const side of [-1,1])geometry.band(30,family+(family?1:2),alpha*.89,(u,p,brush)=>{
    const t=(u-.5)*Math.PI*.85;
    const wide=side*span*(.15+.78*Math.sin(Math.PI*u*.86));
    const ahead=span*(.21+.44*Math.cos(t+side*.29))+finish*1.58;
    const lift=(family===8?.89:.34)*Math.sin(u*Math.PI)*(.40+build*.58);
    p.set(from.x+fz*wide+fx*ahead,from.y+.22+lift+.08*sinRidge(u,seed),from.z-fx*wide+fz*ahead);
    brush.set(fx*thickness*.71,thickness*(family?1.46:.83),fz*thickness*.71);
  });
}

function paintQuarry(geometry,front,age,floorAt,seed) {
  const {fx,fz,width,travel,windup}=front;
  const t=clamp((age-windup)/travel,0,1);
  const pulse=fade(age,windup+travel*.69,windup+travel+.28);
  const gate=smooth(age,0,.052);
  const column=track(front,t,geometry.track);
  const yAt=(x,z,line)=>{
    const floor=floorAt?.(x,z);
    return Number.isFinite(floor)&&Math.abs(floor-line)<2.1?Math.max(line-.35,floor+.019):line;
  };
  const tear=(u,p,side)=>{
    const across=(u*2-1)*width;
    const angle=sinRidge(u,seed);
    const offset=-across*across/(width*width)*1.43+angle*.49;
    const x=column.x+fz*across+fx*offset;
    const z=column.z-fx*across+fz*offset;
    p.set(x,yAt(x,z,column.y)+.27+Math.abs(angle)*.39*smooth(age,windup,windup+.16),z);
    const rag=.38+.35*Math.sin(u*Math.PI)+.22*hash(Math.floor(u*14)+seed);
    side.set(fx*rag,.17+rag*.72,fz*rag);
  };
  geometry.band(64,2,gate*pulse*(.37+.62*smooth(age,windup,windup+.09)),tear);
  if(age<windup) return;
  const onward=clamp((age-windup)/(travel*.77),0,1);
  const pieces=Math.min(35,Math.max(21,Math.round(width*3.4)));
  for(let i=0;i<pieces;i++) {
    const n=seed+i*4.67;
    const across=(i/(pieces-1)*2-1)*width+(hash(n)-.5)*1.05;
    const lane=Math.pow(Math.abs(across/width),1.45);
    const delay=(.0+lane*.11+hash(n+1)*.12)*travel;
    const agePiece=age-windup-delay;
    if(agePiece<0)continue;
    const velocity=.78+.38*hash(n+2);
    const local=clamp(agePiece/(travel*velocity),0,1);
    const drift=-Math.pow(across/width,2)*1.86+(.5-hash(n+3))*1.47;
    track(front,local,column);
    const x=column.x+fz*across+fx*drift;
    const z=column.z-fx*across+fz*drift;
    const bed=yAt(x,z,column.y);
    const launch=smooth(agePiece,0,.115);
    const drop=smooth(agePiece,travel*.18,travel*.78);
    const waist=.66+.39*Math.cos(across/(width+.87)*Math.PI*.51);
    const size=(.54+1.13*hash(n+5))*waist;
    const lift=(.54+2.28*hash(n+6))*launch*(1-drop);
    const alpha=pulse*fade(agePiece,travel*.61,travel+.27)*(.74+.24*hash(n+7));
    const y=bed + size*(.34+.38*onward) + lift;
    geometry.block(x,y,z,size*(.72+.56*hash(n+8)),size*(.47+.49*hash(n+9)),size*(.59+.34*hash(n+4)),
      Math.atan2(fx,fz)+hash(n+11)*2.41,(hash(n+10)-.5)*(1-drop)*1.9,alpha,n);
  }
}

function paintMarchOrigin(geometry,site,age,windup,heading,seed) {
  const build=smooth(age,.018,windup*.72);
  const strength=build*fade(age,windup+.07,windup+.32);
  if(strength<.025)return;
  for(let i=0;i<3;i++) {
    const turn=heading+2.05*i+.21*hash(seed+i);
    const dx=Math.cos(turn),dz=Math.sin(turn);
    const length=(1.60+hash(seed+i+.7)*.71)*lerp(.56,1.06,build);
    geometry.band(15,stoneMarchBrush.fissure,strength*(i===0?1:.79),(u,p,w)=>{
      const branch=Math.sin(u*8.6+i)*(.07+.31*u);
      const step=(u-.16)*length;
      p.set(site.x+dx*step-dz*branch,site.y+.30+.35*(1-u)+.13*sinRidge(u,seed+i),
        site.z+dz*step+dx*branch);
      const thickness=.10+.23*Math.sin(u*Math.PI);
      w.set(-dz*thickness,.32-.18*u,dx*thickness);
    });
  }
}

const imprintBrush={
  stone:stoneMarchBrush.imprint, frost:22, abyss:abyssTransferBrush.residue, steam:8, rift:31, beam:34,
};

function paintDeathImprint(geometry,hit,time) {
  const age=time-hit.at;
  const strength=smooth(age,deathImpression.hold*.69,deathImpression.hold+.045)*fade(age,.43,.68);
  if(strength<.025)return;
  const density=Math.sqrt(hit.count);
  const width=clamp(hit.radius,.54,1.44);
  const press=smooth(age,deathImpression.hold,.50);
  const reach=width*(1.35+density*.64)*lerp(.72,1.07,press);
  const angle=Math.atan2(hit.z-hit.from.z,hit.x-hit.from.x);
  const dx=Math.cos(angle),dz=Math.sin(angle);
  const recoil=hit.route==='rift-recoil';
  const style=recoil?recoilBrush.mark:imprintBrush[hit.kind];
  const mild=hit.kind==='rift'?.74:1;
  for(const bank of [-1,1]) geometry.band(17,style,strength*(bank<0?.71:.93),(u,p,w)=>{
    const foot=Math.sin(u*Math.PI);
    const along=(u*2-1)*reach*(bank<0?.79:1);
    const across=bank*width*(.26+.42*foot);
    p.set(hit.x+dx*along-dz*across,hit.y+.14+width*.30*foot*(1-.76*press),
      hit.z+dz*along+dx*across);
    const edge=(.13+(recoil?.36:.22)*foot+.07*density)*width;
    w.set(-dz*edge,.11*mild+.17*foot,dx*edge);
  });
}

function paintRiftRecoil(geometry,event,age) {
  const front=setupFront(event);
  if(!front||age<0)return;
  const {from,fx,fz,length,width,windup,travel}=front;
  const lead=clamp((age-windup)/travel,0,1);
  const seed=event.id*.47;
  const press=smooth(age,0,.054)*fade(age,windup+.13,windup+.31);
  const intake=event.cutFrom;
  if(intake) {
    const span=Math.hypot(intake.x-from.x,intake.y-from.y,intake.z-from.z);
    if(span>.38) geometry.band(30,recoilBrush.bank,press*.85,(u,p,w)=>{
      const curve=Math.sin(u*Math.PI);
      p.set(lerp(intake.x,from.x,u)+fz*.47*curve,lerp(intake.y,from.y,u)+.44+curve*.72,
        lerp(intake.z,from.z,u)-fx*.47*curve);
      w.set(fz*.23,.14+.39*curve,-fx*.23);
    });
  }
  for(const side of [-1,1]) geometry.band(24,recoilBrush.cut,press*(side===1?1:.72),(u,p,w)=>{
    const t=u*2-1;
    const hollow=Math.sin(u*Math.PI);
    const shoulder=side*(.26+.90*hollow)*width;
    const draw=(.10+.42*hollow)*width;
    p.set(from.x+fz*shoulder+fx*draw,from.y+.19+2.60*u+.20*sinRidge(u,seed+side),
      from.z-fx*shoulder+fz*draw);
    w.set(fz*(.10+.39*hollow),.17*hollow,-fx*(.10+.39*hollow));
    return .58+.42*hollow;
  });
  if(lead<.012)return;

  const afterwind=smooth(age,windup,windup+.080)*fade(age,windup+travel+.095,windup+travel+.47);
  const tail=clamp(lead-Math.min(.95,20/length),0,1);
  for(const bank of [-1,1]) geometry.band(46,bank<0?recoilBrush.wake:recoilBrush.bank,
    afterwind*(bank<0?.69:.85),(u,p,w)=>{
      const fold=Math.pow(Math.sin(u*Math.PI),.64);
      const step=lerp(tail,lead,u);
      track(front,step,p);
      const shift=bank*width*(.30+.32*fold)+.20*sinRidge(u,seed+bank);
      p.x+=fz*shift;
      p.z-=fx*shift;
      p.y+=.31+fold*(bank<0?.37:1.28);
      const casing=width*(.08+(.19+.10*u)*fold);
      w.set(fz*casing*.63,casing*(bank<0?.38:.88),-fx*casing*.63);
      return .63+.37*u;
    });

  const crest=smooth(age,windup,windup+.056)*fade(age,windup+travel-.018,windup+travel+.18);
  if(crest<.022)return;
  const head=track(front,lead,geometry.track);
  geometry.band(49,recoilBrush.cut,crest,(u,p,w)=>{
    const t=2*u-1;
    const taper=Math.pow(Math.sin(u*Math.PI),.70);
    const lateral=t*width;
    const ahead=1.08*(1-t*t)+.18*sinRidge(u,seed);
    const thickness=.14+2.10*taper*(.78+.22*Math.sin(2.34*u+.46));
    p.set(head.x+fz*lateral+fx*ahead,head.y+.18+thickness*.48,head.z-fx*lateral+fz*ahead);
    w.set(fx*(.21+.46*taper),thickness*.54,fz*(.21+.46*taper));
  });
}

function paintStoneMarch(geometry,event,age,floorAt) {
  const front=setupFront(event);
  if(!front||age<0)return;
  const {windup,travel,width}=front;
  const reach=clamp((age-windup)/travel,0,1);
  const seed=event.id*.41+(event.sourceId??0)*.07;
  const head=track(front,reach,geometry.track);
  const next=track(front,Math.min(1,reach+.045),geometry.lead);
  const prior=track(front,Math.max(0,reach-.045),geometry.trail);
  const step=Math.hypot(next.x-prior.x,next.z-prior.z);
  const fx=step>.01?(next.x-prior.x)/step:front.fx;
  const fz=step>.01?(next.z-prior.z)/step:front.fz;
  const yAt=(x,z,level)=>{
    const bottom=floorAt?.(x,z);
    return Number.isFinite(bottom)&&Math.abs(level-bottom)<2.1 ? Math.max(level-.20,bottom+.031) : level;
  };

  for(const [i,site] of (event.targets??[front.from]).entries()) {
    paintMarchOrigin(geometry,site,age,windup,Math.atan2(front.fz,front.fx)+i*.61,seed+i*3.44);
  }

  if(reach>.035) {
    const soak=fade(age,windup+travel+.03,windup+travel+.49);
    // Two banks taper towards the head so the wake reads as a broad push.
    for(const bank of [-1,1]) geometry.band(34,stoneMarchBrush.wake,soak*.61,(u,p,w)=>{
      const t=lerp(Math.max(0,reach-.73),reach,u);
      track(front,t,p);
      const spread=bank*width*(.32+.25*u);
      p.x+=fz*spread;
      p.z-=fx*spread;
      p.y=yAt(p.x,p.z,p.y)+.21+.38*u;
      const thickness=width*(.10+.18*u);
      w.set(fz*thickness,.14+.18*u,-fx*thickness);
      return .43+.57*u;
    });
  }

  const lift=smooth(age,windup-.025,windup+.095);
  const live=lift*fade(age,windup+travel-.09,windup+travel+.21);
  if(live<.025)return;
  const shape=(u)=>{
    const across=u*2-1;
    return (1-across*across)*1.60+.21*sinRidge(u,seed);
  };
  // This cross-section is set at the head used for damage. Its ink face stands
  // above the water and level horizon, with a paper cut through the stone.
  geometry.band(46,stoneMarchBrush.face,live,(u,p,w)=>{
    const across=(u*2-1)*width;
    const ahead=shape(u);
    const silhouette=Math.sin(Math.PI*u);
    const notch=hash(seed+Math.floor(u*15)*1.19);
    const x=head.x+fz*across+fx*ahead;
    const z=head.z-fx*across+fz*ahead;
    const height=(.29+silhouette*(2.08+1.00*notch))*lift;
    p.set(x,yAt(x,z,head.y)+.17+height*.48,z);
    w.set(-fx*(.31+.38*silhouette),height*.53,-fz*(.31+.38*silhouette));
    return .72+.28*silhouette;
  });
  for(let i=0;i<9;i++) {
    const random=seed+i*1.69;
    const u=(i+.55)/9;
    const across=(u*2-1)*width*.96;
    const ahead=shape(u)-hash(random+1)*.41;
    const x=head.x+fz*across+fx*ahead;
    const z=head.z-fx*across+fz*ahead;
    const silhouette=Math.sin(u*Math.PI);
    const size=(.27+.51*hash(random+2))*(.64+.36*silhouette);
    const height=(.47+(1.00+1.20*hash(random+3))*silhouette)*lift;
    geometry.block(x,yAt(x,z,head.y)+height,z,size*.86,size*(.93+silhouette*.70),size*.78,
      Math.atan2(fx,fz)+hash(random+4)*2.4,(hash(random+5)-.5)*1.27,live*.90,random);
  }
}

function paintStoneContourHold(geometry,event,age) {
  const hold=event.hold??event.duration??.38;
  const still=smooth(age,.015,.10)*fade(age,Math.max(.1,hold-.06),hold+.13);
  if(still<.025)return;
  const radius=clamp(event.radius??event.width??4.4,2.2,9.0);
  const seed=event.id*.63;
  for(let slice=0;slice<4;slice++) {
    geometry.band(19,stoneContourBrush.settle,still*.70,(u,p,w)=>{
      const angle=(slice+u*.86)*Math.PI*.5+seed;
      const nick=.25*sinRidge(u,seed+slice);
      const rim=(radius+nick)*lerp(.83,1,smooth(age,0,.16));
      const dx=Math.sin(angle),dz=Math.cos(angle);
      p.set(event.x+dx*rim,event.y+.19+nick*.20,event.z+dz*rim);
      w.set(dx*.27,.10,dz*.27);
    });
  }
  // Let the existing statue meshes hold the heavy silhouette. Sparse dry hems expose
  // where a few real bodies stopped, without painting a filled disk over the group.
  for(const [index,target] of (event.targets??[]).slice(0,6).entries()) {
    const span=clamp(target.radius??.78,.48,1.45);
    for(const bank of [-1,1]) geometry.band(9,stoneContourBrush.seam,still*.74,(u,p,w)=>{
      const angle=seed+index*2.39+bank*(.29+u*1.62);
      const dx=Math.sin(angle),dz=Math.cos(angle);
      p.set(target.x+dx*span,target.y+.12+u*.18,target.z+dz*span);
      w.set(dx*.13,.13,dz*.13);
    });
  }
}

function paintStoneContour(geometry,event,time,floorAt,reducedMotion) {
  const {front,at}=event;
  const age=time-at;
  if(!front||age<0)return;
  const {from,windup,travel,width}=front;
  const timer=age-windup;
  const lead=clamp(timer/travel,0,1);
  const {fx,fz}=front;
  const seed=event.id*.337+(event.leg??1)*6.41;
  const force=reducedMotion?.57:1;
  const clean=fade(time-(event.cancelledAt??Infinity),0,.16);
  const base=(x,z,y)=>{
    const floor=floorAt?.(x,z);
    return Number.isFinite(floor)&&Math.abs(floor-y)<1.85?Math.max(y-.38,floor+.075):y;
  };

  if((event.leg??1)===1) {
    const sources=event.targets?.filter(validPoint).slice(0,9)??[];
    const tear=smooth(age,0,.037)*fade(age,windup+.04,windup+.29);
    const gathered=smooth(age,.02,windup+.09);
    const scattered=smooth(timer,0,.21)*force;
    for (const [index,source] of sources.entries()) {
      const salt=seed+index*2.911;
      const dx=source.x-from.x,dz=source.z-from.z;
      const size=.34+.73*hash(salt+1);
      const x=lerp(source.x,from.x,gathered*.81)+fx*scattered*1.5;
      const z=lerp(source.z,from.z,gathered*.81)+fz*scattered*1.5;
      const level=lerp(source.y,from.y,gathered*.69);
      geometry.block(x,base(x,z,level)+.56+(.34+1.43*hash(salt+2))*Math.sin(Math.PI*gathered*.88)*force,z,
        size*.95,size*1.36,size*.71,Math.atan2(dx,dz)+salt,scattered+.87*hash(salt+4),tear*clean,salt);
    }
  }

  if(lead>.025) {
    const wake=clean*smooth(timer,0,.092)*fade(timer,travel+.05,travel+.41);
    for(const bank of [-1,1]) geometry.band(23,stoneContourBrush.seam,wake*.77,(u,p,w)=>{
      const step=lerp(Math.max(0,lead-.56),lead,u);
      track(front,step,p);
      const sway=bank*width*(.23+.39*u)+.53*sinRidge(u,seed+bank);
      p.x+=fz*sway;
      p.z-=fx*sway;
      p.y=base(p.x,p.z,p.y)+.16;
      const thickness=.17+.44*u;
      w.set(fz*thickness,.14,-fx*thickness);
      return .46+.54*u;
    });
  }

  const drive=clean*smooth(timer,-.027,.075)*fade(timer,travel-.035,travel+.17);
  if(drive>.025) {
    const head=track(front,lead,geometry.track);
    const next=track(front,Math.min(1,lead+.06),geometry.lead);
    const prior=track(front,Math.max(0,lead-.06),geometry.trail);
    const speed=Math.hypot(next.x-prior.x,next.z-prior.z);
    const dx=speed>.016?(next.x-prior.x)/speed:fx;
    const dz=speed>.016?(next.z-prior.z)/speed:fz;
    const yaw=Math.atan2(dx,dz);
    // Leave gaps between three narrow rock banks. A wall of dust would hide the bodies.
    for(const sector of [-1,0,1]) {
      geometry.band(14,stoneContourBrush.crest,drive*(sector===0?.89:.75),(u,p,w)=>{
        const cross=(sector*.65+(u-.5)*.62)*width;
        const bevel=Math.sin(u*Math.PI);
        const nick=(hash(seed+Math.floor(u*7)*3.18+sector)-.5)*.62;
        const nose=(1-(cross/width)**2)*1.18+nick;
        const x=head.x+dz*cross+dx*nose,z=head.z-dx*cross+dz*nose;
        const face=(.18+bevel*(1.2+nick*.88))*force;
        p.set(x,base(x,z,head.y)+.14+face*.52,z);
        w.set(dx*(.26+bevel*.33),face*.53,dz*(.26+bevel*.33));
      });
    }
    for(let index=0;index<15;index++) {
      const salt=seed+index*1.793;
      const cross=((index+.45)/15*2-1)*width;
      const slope=1-(cross/width)**2;
      const kick=(.44+1.24*hash(salt))*slope;
      const jump=Math.abs(Math.sin((timer*(1.35+hash(salt+7))+.09*index)*Math.PI*2.3));
      const nose=kick-(index%3)*.72;
      const x=head.x+dz*cross+dx*nose,z=head.z-dx*cross+dz*nose;
      const size=(.39+.88*hash(salt+1))*(.59+.41*slope);
      geometry.block(x,base(x,z,head.y)+size*.50+jump*(.38+1.6*hash(salt+6))*force,z,
        size*1.22,size*(.66+.83*jump),size*.73,yaw+(hash(salt+4)-.5)*1.86,
        timer*4.8*(hash(salt+5)-.5),drive,salt);
    }
  }

  for(const [index,impact] of event.impacts.entries()) {
    const elapsed=time-impact.at;
    const cut=smooth(elapsed,0,.039)*fade(elapsed,.13,.35);
    if(cut<.021)continue;
    const salt=seed+index*2.976;
    const swell=smooth(elapsed,0,.24)*force;
    const span=clamp(impact.radius??.75,.50,1.48);
    const dirX=impact.x-impact.from.x,dirZ=impact.z-impact.from.z;
    const length=Math.hypot(dirX,dirZ);
    const tx=length>.1?dirX/length:fx,tz=length>.1?dirZ/length:fz;
    for(const bank of [-1,1]) {
      geometry.band(11,stoneContourBrush.impact,cut*(impact.killed?1:.64),(u,p,w)=>{
        const drift=(u-.5)*span*(1.32+swell*2.6);
        const spread=bank*(.19+.67*u);
        const steep=Math.sin(u*Math.PI);
        p.set(impact.x+tx*drift+tz*spread,impact.y+.27+u*(.66+swell*2.01),impact.z+tz*drift-tx*spread);
        w.set(tz*.35*steep,.16+steep*.38,-tx*.35*steep);
      });
    }
    for(let shard=0;shard<3;shard++) {
      const key=salt+shard*4.67, angle=hash(key)*Math.PI*2;
      const push=swell*(.83+1.63*hash(key+1));
      const size=(.28+.37*hash(key+2))*span;
      geometry.block(impact.x+Math.sin(angle)*push,impact.y+.39+swell*(1.03+hash(key+3)*1.35),
        impact.z+Math.cos(angle)*push,size*.76,size*1.54,size,angle,elapsed*6.3,cut,key);
    }
  }
}

function sinRidge(u,seed) {
  return Math.sin(u*20.3+seed)*.75+Math.sin(u*49.7-seed)*.25;
}

function paintUndertow(geometry,front,age,seed) {
  const {fx,fz,width,travel,windup,length}=front;
  const launch=age-windup;
  if(launch<0) return;
  const t=clamp(launch/travel,0,1);
  const push=smooth(launch,0,.083);
  const ink=push*fade(launch,travel+.08,travel+.34);
  const head=track(front,t,geometry.track);
  // Two receding banks hold a light channel. Its short front crosses the actual
  // attack width, then opens at the receiving group so dark bodies read within it.
  const broad=width*(.56+.44*smooth(t,0,.42));
  const headInk=ink*fade(launch,travel*.80,travel+.16);
  const sourceAlong=Math.max(0,t-Math.min(.75,13/length));
  for (const bank of [-1,1]) {
    geometry.band(39,4,ink*.76,(u,p,side)=>{
      const swell=Math.sin(u*Math.PI);
      const drift=sinRidge(u,seed+bank)*.29;
      const across=bank*(broad*(.48+.36*u)+swell*width*.15+drift);
      track(front,lerp(sourceAlong,t,u),p);
      p.x+=fz*across;
      p.z-=fx*across;
      p.y+=.20+(.36+.48*u)*swell;
      const brush=(.24+.48*u)*(.11+.89*swell);
      side.set(fz*brush,.46*brush,-fx*brush);
      return (.35+.65*u)*(1-.31*fade(u,.16,.39));
    });
    geometry.band(35,4,headInk*.99,(u,p,side)=>{
      const swell=Math.sin(u*Math.PI);
      const across=bank*broad*(.15+.85*u);
      const roll=sinRidge(u,seed+bank*.8)*.23;
      const lag=width*(.04+.39*u*u);
      p.set(head.x+fz*across-fx*lag,head.y+.28+swell*(1.1+width*.15)+roll,head.z-fx*across-fz*lag);
      const brush=(.39+width*.14)*(.20+.80*swell);
      side.set(fx*brush*.43,brush,fz*brush*.43);
    });
  }
}

function paintAbyssMouth(geometry,mouth,fx,fz,radius,turn,alpha,closing,brush) {
  if(alpha<.026)return;
  for(const hand of [-1,1]) geometry.band(37,brush,alpha*(hand<0?.88:1),(u,p,w)=>{
    const angle=turn+hand*Math.PI*.52+u*Math.PI*.95;
    const sweep=Math.sin(angle), across=Math.cos(angle);
    const fadeToMouth=1-u*(.31+.24*closing);
    const r=radius*fadeToMouth;
    const pulp=Math.sin(u*Math.PI);
    p.set(mouth.x+r*(fz*across+fx*sweep*.56),
      mouth.y+.29+r*(.47*sweep+.11*across)+.12*sinRidge(u,turn),
      mouth.z+r*(-fx*across+fz*sweep*.56));
    const width=(.17+r*.26)*Math.pow(pulp,.72);
    w.set((fz*across+fx*sweep*.29)*width,.47*sweep*width,(-fx*across+fz*sweep*.29)*width);
  });
}

function paintAbyssTransfer(geometry,event,age,art,selectedMouth) {
  if(age<0)return;
  const front=setupFront(event);
  if(!front)return;
  const {from,to,fx,fz,travel,length,width}=front;
  const seed=event.id*.41;
  const tint=event.carriedPoison>0?0:4;
  const transit=smooth(age,0,travel);
  const sourcePressure=smooth(age,0,.062)*fade(age,.24,.41);
  const radius=clamp(.44*width,1.7,3.40);
  paintAbyssMouth(geometry,from,fx,fz,lerp(radius*.78,.58,transit),seed+transit*2.9,sourcePressure,transit,
    abyssTransferBrush.bank+tint);

  if(transit>.022) {
    const transport=smooth(age,0,travel*.52)*fade(age,travel+.015,travel+.29);
    const tail=clamp(transit-Math.min(.91,12/length),0,1);
    // Carried ink travels between mouths, while each animal stays with its current group.
    for(const bank of [-1,0,1]) geometry.band(34,(bank?abyssTransferBrush.fold:abyssTransferBrush.carrier)+tint,
      transport*(bank?.72:1),(u,p,w)=>{
        const progress=lerp(tail,transit,u);
        track(front,progress,p);
        const envelope=Math.sin(u*Math.PI*.89);
        const lift=Math.sin(progress*Math.PI);
        const drift=bank*(.22+.98*envelope)*lift+.13*Math.sin(progress*15+seed);
        p.x+=fz*drift;
        p.z-=fx*drift;
        p.y+=.28+lift*(bank?.39:.73)+bank*.21*envelope;
        const broad=(bank?.27:.56)*(.39+.61*envelope);
        w.set(fz*broad,.83*broad,-fx*broad);
        return .37+.63*u;
    });
  }

  const pull=smooth(age,travel-.055,travel+.065);
  const closeAt=event.collapsedAt===undefined ? event.duration-.13 : event.collapsedAt-event.at;
  const squeeze=smooth(age,closeAt,closeAt+.22);
  const destination=pull*fade(age,closeAt+.25,closeAt+.50);
  const opening=lerp(radius*1.19,.42,squeeze);
  paintAbyssMouth(geometry,to,fx,fz,opening,seed-1.51*age,destination*(selectedMouth?.23:1),squeeze,abyssTransferBrush.bank+tint);
  for(const [i,bind] of event.binds.entries()) {
    const enemy=art?.id===event.id?art.captures?.get(bind.targetId)?.enemy:undefined;
    if(!enemy||enemy.hp<=0)continue;
    const life=event.at+age-bind.at;
    const intake=smooth(life,0,.066)*fade(life,bind.duration*.68,bind.duration+.02);
    if(intake<.027)continue;
    const span=Math.hypot(enemy.x-bind.to.x,enemy.y-bind.to.y,enemy.z-bind.to.z);
    if(span<.32)continue;
    const twist=i%2===0?1:-1;
    geometry.band(17,abyssTransferBrush.fold+tint,intake*(selectedMouth?.25:.80),(u,p,w)=>{
      const curl=Math.sin(u*Math.PI)*.57*twist;
      p.set(lerp(enemy.x,bind.to.x,u)+fz*curl,
        lerp(enemy.y,bind.to.y,u)+.22+.35*Math.sin(u*Math.PI),lerp(enemy.z,bind.to.z,u)-fx*curl);
      const broad=.16+.23*u;
      w.set(fz*broad,.71*broad,-fx*broad);
    });
  }

}

function belongsToAbyssMouth(mouth,position) {
  return Math.hypot(mouth.x-position.x,mouth.y-position.y,mouth.z-position.z)<1.7;
}

function abyssMouthTargets(targets) {
  return (targets??[]).filter(validPoint).slice(0,10).map(target=>({...point(target),id:target.id,
    radius:target.radius??.74}));
}

function paintCommittedMouth(geometry,event,time,art,reducedMotion) {
  const age=time-event.at;
  if(age<0)return;
  const {mouth,closedAt,cancelledAt,travel}=event;
  const closure=time-(closedAt??Infinity);
  const shrink=smooth(closure,.012,.23);
  const tail=closedAt===undefined?fade(age,travel+.24,travel+.51):fade(closure,.19,.43);
  const cancelled=cancelledAt===undefined?1:fade(time-cancelledAt,0,.14);
  const ink=smooth(age,0,.064)*tail*cancelled;
  if(ink<.020)return;
  const {eye,cameraRight}=geometry;
  const motion=reducedMotion?.58:1;
  const seed=event.id*.81+(event.leg??1)*1.87;
  const progress=smooth(age,0,travel);
  const spin=seed+(2.50*age+13.4*age*age)*motion;
  const size=event.size;
  const body=lerp(.53,1,progress)*(1-.88*shrink)*size;
  const center={x:mouth.x,y:mouth.y+.66,z:mouth.z};

  // The center is kept just behind the actual capture position. The rim has a
  // depth gradient so foreground wings and cliffs still cut the ink cleanly.
  geometry.band(20,abyssMouthBrush.pupil,ink*.98,(u,p,w)=>{
    const height=(u*2-1)*body*.72;
    const span=Math.sin(u*Math.PI)**.64*body;
    p.set(center.x,center.y+height,center.z).addScaledVector(cameraRight,.23*height)
      .addScaledVector(eye,-.26-.39*span);
    w.copy(cameraRight).multiplyScalar(span);
  });
  for(let arm=0;arm<4;arm++) {
    const hand=arm%2?1:-1;
    const offset=arm*Math.PI*.5;
    geometry.band(24,abyssMouthBrush.fold,ink*(arm%2?.74:.90),(u,p,w)=>{
      const turn=spin+offset+u*2.96;
      const sweep=.53+u*(1.35-.51*progress);
      const radius=body*sweep;
      const side=Math.cos(turn), up=Math.sin(turn);
      const taper=Math.sin(u*Math.PI);
      const ripple=.14*sinRidge(u,seed+arm)*taper;
      p.set(center.x,center.y+up*radius*.57+ripple,center.z)
        .addScaledVector(cameraRight,side*radius)
        .addScaledVector(eye,up*radius*.33+hand*.20*taper);
      const width=(.16+body*.17)*taper;
      w.copy(cameraRight).multiplyScalar(side*width);
      w.y+=up*width*.66;
    });
  }
  for(let bank=0;bank<2;bank++)geometry.band(31,abyssMouthBrush.dryRim,ink*.83,(u,p,w)=>{
    const turn=spin+(bank+u*.84)*Math.PI;
    const side=Math.cos(turn),up=Math.sin(turn);
    const r=body*(.91+.12*sinRidge(u,seed+bank));
    p.set(center.x,center.y+up*r*.71,center.z).addScaledVector(cameraRight,side*r)
      .addScaledVector(eye,up*r*.34);
    const width=.12+body*.11*Math.sin(u*Math.PI);
    w.copy(cameraRight).multiplyScalar(side*width);
    w.y+=up*width*.72;
  });

  if(closedAt===undefined&&art?.id===event.id) {
    for(const [index,source] of event.targets.entries()) {
      const capture=art.captures?.get(source.id);
      const enemy=capture?.enemy;
      if(!enemy||enemy.hp<=0)continue;
      const span=Math.hypot(enemy.x-mouth.x,enemy.y-mouth.y,enemy.z-mouth.z);
      if(span<.32)continue;
      const trail=ink*(.43+.18*progress)*smooth(span,.32,1.25);
      geometry.band(11,abyssMouthBrush.trace,trail,(u,p,w)=>{
        const start=.27+u*.73;
        const curl=Math.sin(u*Math.PI)*(index%2?-1:1)*(.38+.054*span);
        p.set(lerp(source.x,enemy.x,start),lerp(source.y,enemy.y,start)+.20+u*.08,lerp(source.z,enemy.z,start))
          .addScaledVector(cameraRight,curl);
        w.set(cameraRight.x*.19,.14+.09*u,cameraRight.z*.19);
      });
    }
  } else if(closure>=0) {
    // Each dry accent is tied to a confirmed intake, with the travel still
    // collapsing inwards rather than a false outward blast from the enemy.
    for(const [index,target] of event.intakes.entries()) {
      const burst=smooth(closure,.025,.080)*fade(closure,.11,.30)*ink;
      const angle=spin+index*2.399963;
      const side=Math.cos(angle),up=Math.sin(angle);
      const span=lerp(size*.91,.22,shrink)*(.82+.26*hash(index+seed));
      geometry.band(9,abyssMouthBrush.dryRim,burst*.86,(u,p,w)=>{
        const radius=span*(.70+.68*u);
        const height=lerp(center.y,target.y+.42,.17)+up*radius*.6;
        p.set(center.x,height,center.z).addScaledVector(cameraRight,side*radius)
          .addScaledVector(eye,up*radius*.33);
        w.set(-cameraRight.x*up*.18,side*.18,-cameraRight.z*up*.18);
      });
    }
  }
}

function paintHeatedFlow(geometry,front,age,seed) {
  const {fx,fz,width,travel,windup,length,transition,condenseAt,condensedAt,steamRise}=front;
  const launch=age-windup;
  if(launch<0) return;
  const t=clamp(launch/travel,0,1);
  const condense=Number.isFinite(condenseAt)?condenseAt:windup+travel*.53;
  const riseAt=clamp((condense-windup)/travel,0,1);
  const warmT=Math.min(t,riseAt);
  const hot=smooth(launch,0,.045)*fade(age,condense+.035,condense+.27);
  const breath=Number.isFinite(condensedAt)
    ?smooth(age,condensedAt,condensedAt+.065)*fade(age,windup+travel+.18,windup+travel+.60):0;
  const hotTail=Math.max(0,warmT-10/length);
  // The hot stroke travels along the existing route up to the real wet boundary.
  // It drops away as one rising roll of paper takes its place.
  geometry.band(54,12,hot,(u,p,side)=>{
    track(front,lerp(hotTail,warmT,u),p);
    const ebb=Math.sin(u*Math.PI);
    p.y+=.45+ebb*.63+.13*sinRidge(u,seed);
    const brush=(.36+.56*u)*(.18+.82*ebb);
    side.set(fz*brush,brush*.89,-fx*brush);
    return .37+.63*u;
  });
  if(breath<.019) return;
  const open=smooth(age,condense,condense+.30);
  const head=track(front,t,geometry.track);
  const throat=transition??front.from;
  const lift=Math.min(4.1,2.8+steamRise*.35+width*.04);
  const broaden=width*(.38+.52*open);
  const wake=Math.min(8.3,Math.hypot(head.x-throat.x,head.z-throat.z));
  for (const bank of [-1,1]) {
    geometry.band(52,8,breath*.87,(u,p,side)=>{
      const fold=Math.sin(u*Math.PI);
      const across=bank*broaden*(.15+.76*Math.sin(u*2.26));
      const lag=fold*width*.24+u*wake*.62;
      const fray=.14*sinRidge(u,seed+bank);
      p.set(head.x+fz*across-fx*lag,head.y+.17+fold*lift*(.57+.43*open)+fray,head.z-fx*across-fz*lag);
      const brush=(.58+.73*open)*(.19+.81*fold);
      side.set(fx*brush*.42,brush,fz*brush*.42);
    });
  }
  const column=breath*fade(age,condense+.27,condense+.78);
  geometry.band(47,8,column*.98,(u,p,side)=>{
    const fold=Math.sin(u*Math.PI);
    const drift=Math.sin(u*3.8+.48)*(.20+1.61*u)*open;
    const roll=(u*u*.81+.23*fold)*open*width;
    p.set(throat.x+fz*drift+fx*roll,throat.y+.13+u*lift*(.61+open*.90),throat.z-fx*drift+fz*roll);
    const brush=(.25+.89*open)*(.25+.75*fold);
    side.set(fz*brush,brush*.22,-fx*brush);
  });
}

function paintOutlet(geometry,impact,age,seed) {
  const {x,y,z,fx,fz,hot,count,kills}=impact;
  const hold=fade(age,.17,hot?.76:.57);
  const rise=smooth(age,0,hot?.23:.13);
  const span=1.35+Math.sqrt(count)*.67;
  const load=(kills?.97:.78)*hold;
  for (const bank of [-1,1]) geometry.band(27,hot?8:4,load,(u,p,side)=>{
    const curl=Math.sin(u*Math.PI);
    const sweep=bank*span*(.2+.95*u)*(.50+.55*rise);
    const step=span*(.15+(.58-rise*.18)*curl);
    const lift=hot?(1.2+rise*2.8)*u:(.55+.44*rise)*curl;
    const fray=sinRidge(u,seed+bank)*.11;
    p.set(x+fz*sweep+fx*step,y+.24+lift+fray,z-fx*sweep+fz*step);
    const brush=(hot?.88:.54)*(.24+.76*curl);
    side.set(fx*brush*.56,brush,fz*brush*.56);
  });
}

function paintRainTurn(geometry,event,age) {
  const {from,via,to,duration,windup,radius}=event;
  const dx=to.x-from.x,dz=to.z-from.z;
  const span=Math.hypot(dx,dz)||1;
  const fx=dx/span,fz=dz/span;
  const gather=smooth(age,0,.07);
  if(gather<.014) return;
  const rising=clamp(age/Math.max(.01,windup),0,1);
  const falling=clamp((age-windup)/Math.max(.01,duration-windup),0,1);
  const width=clamp(radius??3,1.65,5.8);
  const fading=fade(age,duration+.035,duration+.28);
  for (const bank of [-1,1]) {
    geometry.band(27,9,gather*fade(age,windup+.06,windup+.27)*.80,(u,p,brush)=>{
      const flow=rising*u;
      const bow=Math.sin(flow*Math.PI);
      const across=bank*(.16+.89*bow)*width*.60;
      p.set(lerp(from.x,via.x,flow)+fz*across,lerp(from.y,via.y,flow)+.23+bow*.68,
        lerp(from.z,via.z,flow)-fx*across);
      const body=(.46+.29*bow)*Math.sin(u*Math.PI);
      brush.set(fz*body,body*.45,-fx*body);
    });
  }
  if(falling<=0) return;
  const open=lerp(.29,1,smooth(falling,0,.93));
  const dropInk=smooth(age,windup,windup+.075)*fading;
  const depth=Math.hypot(to.x-via.x,to.y-via.y,to.z-via.z);
  const tailStart=Math.max(0,falling-Math.min(.86,8/(depth+.2)));
  // A folded rain curtain falls through three-dimensional space. Narrow gaps
  // leave paper between strokes even when several recipients overlap.
  for(let band=0;band<7;band++) geometry.band(23,24,dropInk*(band===3?.99:.81),(u,p,brush)=>{
    const t=lerp(tailStart,falling,u);
    const fold=sinRidge(u,event.id*.18+band*1.77);
    const lateral=(band-3)/3;
    const across=lateral*width*open*(.54+.32*t)+.17*fold;
    p.set(lerp(via.x,to.x,t)+fz*across,
      lerp(via.y,to.y,t)+.27+.38*Math.sin(band*1.72)*Math.sin(t*Math.PI),
      lerp(via.z,to.z,t)-fx*across);
    const stroke=(.24+(1-Math.abs(lateral))*.26)*(.26+.74*Math.sin(u*Math.PI));
    brush.set(fz*stroke,.14*stroke,-fx*stroke);
    return .36+.64*u;
  });
}

function paintFrostFork(geometry,event,age,sourceKnot) {
  const {from,to}=event;
  const hit=event.windup??event.duration??.21;
  const progress=smooth(age,.005,Math.max(.011,hit));
  const strength=smooth(age,0,Math.min(.089,Math.max(.026,hit*.48)))*fade(age,hit+.10,hit+.34);
  if(strength<.024)return;
  const dx=to.x-from.x, dy=to.y-from.y, dz=to.z-from.z;
  const span=Math.hypot(dx,dz)||1;
  const acrossX=dz/span, acrossZ=-dx/span;
  const grounded=event.grounded||event.branch==='surface';
  const side=event.branch==='lower'||event.lane==='left'?-1:1;
  const isShelf=event.formation==='shelf';
  const family=isShelf?20:16;
  const seed=(event.sourceId??0)*.041+(event.targetId??0)*.079;
  const eye=geometry.eye;
  const faceX=dy*eye.z-dz*eye.y,faceY=dz*eye.x-dx*eye.z,faceZ=dx*eye.y-dy*eye.x;
  const perpendicular=Math.hypot(faceX,faceY,faceZ)||1;
  const inkTravel=fade(age,hit+.035,hit+.23);
  const main=(n,p)=>{
    const arc=Math.sin(n*Math.PI);
    const zig=(Math.sin(n*28.4+seed)+.41*Math.sin(n*54.3-seed))*arc;
    const off=zig*(grounded?.30:.44)*side;
    const rise=(grounded?.27:.56)*arc;
    p.set(from.x+dx*n+acrossX*off,from.y+dy*n+.24+rise+.31*zig,from.z+dz*n+acrossZ*off);
  };
  const taper=isShelf?.91:event.depth?.79:1;
  const headStart=Math.max(0,progress-(grounded?.35:.44));
  geometry.band(29,family+3,strength*.82,(u,p,w)=>{
    main(u*progress,p);
    const width=taper*(.145+.102*inkTravel)*(.46+.54*Math.sin(u*Math.PI))/perpendicular;
    w.set(faceX*width,faceY*width,faceZ*width);
  });
  geometry.band(19,family+3,strength*inkTravel,(u,p,w)=>{
    main(lerp(headStart,progress,u),p);
    const width=taper*(.265+.105*Math.sin(u*Math.PI))/perpendicular;
    w.set(faceX*width,faceY*width,faceZ*width);
  });
  if(isShelf) {
    const local=smooth(age,0,.057)*fade(age,hit+.012,hit+.128);
    for(const [i,receiver] of (event.receivers??[to]).entries()) {
      // Each ledge is under an actually locked target. The tips leave a
      // gap between bodies and the ice stays low at the receiver's altitude.
      const ledge=.73+smooth(age,0,.16)*.62;
      const tilt=seed+i*.83;
      geometry.band(19,22,local*(i?.82:.94),(u,p,w)=>{
        const o=(u*2-1)*ledge;
        const crown=Math.sin(u*Math.PI);
        const cut=.14*sinRidge(u,tilt);
        const shift=(.31*crown+cut)*side;
        p.set(receiver.x+acrossX*o+dx/span*shift*.14,receiver.y+.095+.28*crown+cut,
          receiver.z+acrossZ*o+dz/span*shift*.14);
        const depth=.11+crown*.34;
        w.set(dx/span*depth,.075+crown*.24,dz/span*depth);
      });
    }
  }
  if(!sourceKnot)return;
  const release=smooth(age,.015,.094);
  const knot=fade(age,.075,.25)*strength;
  for(const bank of [-1,1])geometry.band(16,family+2,knot*.88,(u,p,w)=>{
    const run=u*(.49+.79*release);
    const shift=bank*(.18+Math.sin(u*Math.PI)*(.49+.44*release));
    p.set(from.x+acrossX*shift+dx/span*run,from.y+.20+Math.sin(u*Math.PI)*(.50+.57*release),
      from.z+acrossZ*shift+dz/span*run);
    const width=.25*(.30+.70*Math.sin(u*Math.PI))/perpendicular;
    w.set(faceX*width,faceY*width,faceZ*width);
  });
}

function traceRiftPrey(event, art, time) {
  const caught=art?.id===event.id ? art.riftSeam?.caught : null;
  for (const bind of event.binds) {
    const enemy=caught?.get(bind.targetId)?.enemy;
    if (!enemy || enemy.hp<=0) continue;
    const last=bind.trace.at(-1);
    if (Math.hypot(enemy.x-last.x,enemy.y-last.y,enemy.z-last.z)<.035) continue;
    bind.trace.push({...point(enemy),at:time});
    if (bind.trace.length>9) bind.trace.shift();
  }
}

function paintRiftSeam(geometry,event,time,art,floorAt) {
  const {from,to,windup=.15,travel=.56,closeAt,binds}=event;
  const live=art?.id===event.id&&art.riftSeam;
  const age=live && closeAt===undefined ? art.phaseAge : time-event.at;
  const launch=windup+travel;
  const close=closeAt===undefined?-Infinity:time-closeAt;
  const aperture=smooth(age,0,.08)*fade(close,.04,.28);
  if (age<0||aperture<.016) return;

  const front={from,to,path:event.points};
  const region=clamp((age-windup)/travel,0,1);
  const head=Math.max(.005,region);
  const span=Math.hypot(to.x-from.x,to.z-from.z)||1;
  const nx=(to.z-from.z)/span, nz=(from.x-to.x)/span;
  const wide=clamp(event.width??1.7,1.05,3.5);
  const distance=clamp((span/16),.68,1.55);
  const salt=event.id*.071;
  const traveling=fade(age,launch+.09,launch+.30);
  const crestWidth=wide*.55*(.48+.52*distance);
  const tail=clamp(head-.40,0,1);

  // Once the gate catches its prey, the long scar gives way to their motion.
  geometry.band(76,28,aperture*(.43+.40*traveling),(u,p,side)=>{
    const position=u*head;
    track(front,position,p);
    const thickness=.18+crestWidth*.36*smooth(position,tail,head+.001);
    p.y+=.21+.18*sinRidge(position,salt);
    side.set(nx*thickness*.36,thickness,nz*thickness*.36);
    return .42+.58*smooth(position,.07,head+.003)*traveling;
  });
  if (head>.024) {
    geometry.band(55,28,aperture*traveling*1.06,(u,p,side)=>{
      const position=lerp(tail,head,u);
      track(front,position,p);
      const blade=Math.pow(Math.sin(u*Math.PI),.64)*(.50+.69*u);
      const kink=sinRidge(position,salt+4.12);
      p.y+=.36+kink*.18;
      p.addScaledVector(geometry.eye,.22);
      side.set(nx*crestWidth*blade*.62,crestWidth*blade,nz*crestWidth*blade*.62);
    });
  }

  const pulled=closeAt===undefined ? (live?.caught?.size??0) : (event.delivered?.length??0);
  const filled=smooth(pulled,0,4);
  const arrival=smooth(age,launch-.19,launch+.022);
  const pinch=smooth(close,-.006,.095);
  const gate=arrival*fade(close,.03,.18);
  const snap=filled*smooth(close,-.009,.034)*fade(close,.088,.40);
  const cutHeight=clamp(1.82+wide*.83,2.65,4.45)*lerp(.94,1.23,filled);
  const waterline=event.stage<3 ? floorAt?.(to.x,to.z) : undefined;
  const gateY=Math.max(to.y+.36,Number.isFinite(waterline)?waterline+.25:-Infinity);
  if (gate>.015||snap>.015) {
    for (const bank of [-1,1]) {
      geometry.band(52,28,gate*(.58+.42*filled),(u,p,side)=>{
        const t=u*2-1;
        const taper=Math.pow(Math.sin(u*Math.PI),.64);
        const crack=.28*sinRidge(u,salt+bank*.82)*taper;
        const tilt=(1.08*t+crack)*(1-pinch*.62);
        const separation=bank*crestWidth*(.53+.53*filled)*taper*lerp(1,.16,pinch);
        const reach=cutHeight*(.72+.28*arrival)*lerp(1,.50,pinch);
        const rise=Number.isFinite(waterline)?gateY+Math.max(-.22,t*reach*1.33):gateY+t*reach;
        p.set(to.x+nx*tilt,rise,to.z+nz*tilt);
        p.addScaledVector(geometry.cameraRight,separation).addScaledVector(geometry.eye,.14);
        side.copy(geometry.cameraRight).multiplyScalar(taper*(.18+crestWidth*(.29+.13*filled))*lerp(1,.39,pinch));
        side.y=-bank*taper*.22;
      });
    }
    if (snap>.015) geometry.band(49,31,snap,(u,p,side)=>{
      const t=u*2-1;
      const taper=Math.pow(Math.sin(u*Math.PI),.65);
      const reach=cutHeight*lerp(.84,.15,pinch);
      const grain=sinRidge(u,salt+3.7)*.19*taper;
      p.set(to.x+nx*(t*.77+grain),gateY+(Number.isFinite(waterline)?Math.max(-.15,t*reach):t*reach),
        to.z+nz*(t*.77+grain)).addScaledVector(geometry.eye,.32);
      side.copy(geometry.cameraRight).multiplyScalar(taper*(.21+crestWidth*.41*snap));
    });
  }

  // Preserve observed travel behind each body and carry the fold into the close.
  // The close event supplies the last point only for prey that actually arrived.
  for (const bind of binds) {
    const trace=bind.trace;
    const tip=trace.at(-1);
    const first=trace[0];
    const extent=Math.hypot(tip.x-first.x,tip.y-first.y,tip.z-first.z);
    const intensity=fade(time-tip.at,.06,.33)*smooth(extent,.075,.56);
    if (intensity<.02||trace.length<2)continue;
    geometry.band(28,31,intensity*(.86-.24*pinch),(u,p,side)=>{
      const index=Math.min(trace.length-2,Math.floor(u*(trace.length-1)));
      const blend=u*(trace.length-1)-index;
      const a=trace[index],b=trace[index+1];
      p.set(lerp(a.x,b.x,blend),lerp(a.y,b.y,blend)+.32,lerp(a.z,b.z,blend))
        .addScaledVector(geometry.eye,.10);
      side.set(nx*.065,.10+Math.sin(u*Math.PI)*.25,nz*.065);
      return .42+.58*u;
    });
  }
}

function paintRiftClash(geometry,event,time) {
  const {from,to,windup=.07,travel=.31,impacts}=event;
  const center=event.center??event;
  const age=time-event.at;
  if(age<0)return;
  const lead=smooth(age,windup,windup+travel);
  const passage=smooth(age,.005,windup+.06)*fade(age,windup+travel,windup+travel+.17);
  const width=clamp(event.width??1.25,.72,2.75);
  const salt=event.id*.617;
  const lift=event.stage<3 ? .75 : 1;
  const dx=to.x-from.x,dz=to.z-from.z;
  const length=Math.hypot(dx,dz)||1;
  const nx=dz/length,nz=-dx/length;
  for (const [index,mouth] of [from,to].entries()) {
    if(passage<.017)break;
    const bank=index===0?-1:1;
    const tail=Math.max(0,lead-.52);
    geometry.band(48,28,passage*.97,(u,p,side)=>{
      const t=lerp(tail,Math.max(.065,lead),u);
      const taper=Math.pow(Math.sin(u*Math.PI),.57)*(.64+u*.36);
      const curl=Math.sin(t*Math.PI)*(width*.47+bank*.16*sinRidge(u,salt));
      p.set(lerp(mouth.x,center.x,t)+nx*curl,lerp(mouth.y,center.y,t)+.35+lift*.98*taper,
        lerp(mouth.z,center.z,t)+nz*curl);
      side.set(nx*.44*taper,lift*width*(.2+.40*taper),nz*.44*taper);
    });
  }

  if(!impacts.length)return;
  const impactAge=time-impacts[0].at;
  const heat=smooth(impactAge,-.015,.034)*fade(impactAge,.13,.42);
  for (const [index,contact] of impacts.entries()) {
    const elapsed=time-contact.at;
    const extent=smooth(elapsed,0,.16);
    const ink=smooth(elapsed,-.012,.048)*fade(elapsed,.12,.37);
    if(ink<.019) continue;
    geometry.band(23,31,ink*.79,(u,p,side)=>{
      const t=u*2-1;
      const bevel=t*(.62+.75*extent);
      const torsion=sinRidge(u,salt+index)*.17;
      p.set(contact.x+nx*(bevel+torsion),contact.y+.43+t*(.44+.67*extent),contact.z+nz*(bevel+torsion));
      p.addScaledVector(geometry.eye,.13);
      side.copy(geometry.cameraRight).multiplyScalar(.09+.27*ink*Math.sin(u*Math.PI));
    });
  }
  if(heat>.018)geometry.band(47,30,heat,(u,p,side)=>{
    const t=u*2-1;
    const taper=Math.sin(u*Math.PI);
    const kink=.27*sinRidge(u,salt)*taper;
    const spread=1.0+width*.7*smooth(impactAge,0,.22);
    p.set(center.x+nx*(t*spread+kink),center.y+.52+t*lift*.65,center.z+nz*(t*spread+kink));
    side.set(dx/length*.26*taper,lift*(.12+.67*heat)*taper,dz/length*.26*taper);
  });
}

function paintWindSeam(geometry,event,time) {
  const {from,to,path,windup,travel}=event.front;
  const age=time-event.at;
  if(age<0)return;
  const arrival=windup+travel;
  const close=event.closeAt ?? event.impactAt;
  const elapsed=time-(close??Infinity);
  const opened=smooth(age,arrival-.10,arrival+.04);
  const gathering=opened*fade(elapsed,-.02,.17);
  const width=clamp(event.width??event.radius??3.2,1.6,7.4);
  const salt=event.id*.071+(event.leg??0)*.39;
  const lead=smooth(age,windup,arrival);
  const passage=smooth(age,windup,windup+.06)*fade(age,arrival-.025,arrival+.15);
  const {fx,fz}=event.front;
  const ridge={from,to,path};

  // The wind carries a sharp paper edge while the broader dry wake trails it.
  for(const bank of [0,-1,1]) {
    geometry.band(bank===0?38:27,windSeamBrush.ridge,passage*(bank===0?1.12:.56),(u,p,side)=>{
      const tail=Math.max(0,lead-(bank===0?.49:.27));
      const t=lerp(tail,lead,u);
      const tip=Math.pow(Math.sin(u*Math.PI*.94),.59);
      track(ridge,t,p);
      const offset=bank*width*(.09+.15*tip)+sinRidge(t,salt+bank)*.09;
      p.x+=fz*offset;
      p.z-=fx*offset;
      p.y+=.28+.88*tip+(bank===0?.34:0);
      const load=width*(bank===0?.33:.18)*tip;
      side.set(fz*load*.54,load,-fx*load*.54);
      return .42+.58*u;
    });
  }

  if(gathering>.019) {
    const origin=event.closePoint??to;
    const tension=smooth(age,arrival,arrival+.15);
    const press=smooth(elapsed,-.010,.14);
    const reach=width*(.57+.21*tension)*lerp(1,.68,press);
    const tornHeight=clamp(width*.76,1.65,4.05);
    // Two irregular lips sit in the actual receiving plane and pinch inward.
    for(const bank of [-1,1])geometry.band(43,windSeamBrush.fold,gathering*.98,(u,p,side)=>{
      const t=u*2-1;
      const taper=Math.pow(Math.sin(u*Math.PI),.61);
      const split=bank*reach*(.43+.36*taper)*lerp(1,.20,press);
      const tilt=t*reach*.82+sinRidge(u,salt+bank)*.24*taper;
      p.set(origin.x+fz*tilt+fx*split,origin.y+.34+t*tornHeight+bank*.48*taper,origin.z-fx*tilt+fz*split);
      const thickness=reach*(.16+.13*taper)*(1-.55*press);
      side.set(fx*thickness,bank*.29*taper,fz*thickness);
      return .52+.48*taper;
    });
  }

  for(const bind of event.binds) {
    const elapsed=time-bind.at;
    const visible=smooth(elapsed,0,.047)*fade(elapsed,bind.travel-.022,bind.travel+.10);
    const lead=smooth(elapsed,0,bind.travel);
    const tail=Math.max(0,lead-.56);
    geometry.band(20,windSeamBrush.trace,visible*.82,(u,p,side)=>{
      const t=lerp(tail,lead,u);
      const brush=Math.sin(u*Math.PI);
      track(bind,t,p);
      p.y+=.22+brush*.23;
      const weight=(.13+.19*brush)*(.57+.43*u);
      side.set(fz*weight,weight*.55,-fx*weight);
    });
  }

  if(!event.impacts.length)return;
  const cutting=smooth(elapsed,-.019,.038)*fade(elapsed,.105,.42);
  const release=smooth(elapsed,0,.21);
  const center=event.closePoint??to;
  const reach=width*lerp(.67,1.23,release);
  geometry.band(45,windSeamBrush.cut,cutting*1.08,(u,p,side)=>{
    const t=u*2-1;
    const tip=Math.pow(Math.sin(u*Math.PI),.55);
    const drag=(1-t*t)*lerp(.13,1.65,release);
    const tear=sinRidge(u,salt)*.35*tip;
    p.set(center.x+fz*(reach*t+tear)+fx*drag,center.y+.54+t*width*.35+release*.88*tip,
      center.z-fx*(reach*t+tear)+fz*drag);
    const load=(.21+.41*cutting)*tip;
    side.set(fx*load*.68,load,fz*load*.68);
  });
  for(const [index,contact] of event.impacts.entries()) {
    const age=time-contact.at;
    const mark=smooth(age,-.008,.025)*fade(age,.11,.39);
    const span=clamp(contact.radius??.68,.48,1.64)*(1+smooth(age,0,.30)*.88);
    geometry.band(17,windSeamBrush.trace,mark*(contact.killed?.99:.56),(u,p,side)=>{
      const t=u*2-1;
      const tip=Math.sin(u*Math.PI);
      const kick=span*(.41+sinRidge(u,salt+index)*.15);
      p.set(contact.x+fx*kick+fz*t*span,contact.y+.34+t*span*.66+age*.66,contact.z+fz*kick-fx*t*span);
      side.set(fx*.20*tip,.23*tip,fz*.20*tip);
    });
  }
}

function paintQuenchReservoir(geometry,store,gameTime) {
  const {site,preparedAt,expiresAt,id}=store;
  const age=gameTime-preparedAt;
  const life=expiresAt-preparedAt;
  const envelope=smooth(age,0,.13)*fade(age,Math.max(.18,life-.26),life);
  if (envelope<.019) return;
  const radius=clamp(store.radius,1.25,4.1);
  const twist=age*3.8+id*.69;
  const pulse=1+.13*Math.sin(age*9.4);
  const lift=smooth(age,0,.44);

  // The wet ground draws up one local ink knot. No brush leaves the exact
  // doused footprint until the game confirms the next steam front.
  for (const [layer,strength] of [[0,.78],[1,.48]]) {
    geometry.band(31,quenchBrush.stored,envelope*strength,(u,p,side)=>{
      const taper=Math.sin(Math.PI*u);
      const angle=twist+u*6.1+layer*2.7;
      const spread=radius*(.77-u*.62)*pulse;
      const x=Math.cos(angle),z=Math.sin(angle);
      p.set(site.x+x*spread,site.y+.33+u*(.66+.89*lift)+layer*.12,site.z+z*spread);
      const brush=(.25+.32*taper)*(1-.24*layer);
      side.set(x*brush*.44,brush,z*brush*.44);
    });
  }
  const ring=smooth(age,0,.052)*fade(age,.13,.43);
  geometry.band(32,quenchBrush.wake,ring*.65,(u,p,side)=>{
    const angle=(u-.09)*Math.PI*1.82+id*.69;
    const x=Math.cos(angle),z=Math.sin(angle);
    const spread=radius*(.44+.43*smooth(age,0,.4));
    p.set(site.x+x*spread,site.y+.19+.18*Math.sin(u*Math.PI),site.z+z*spread);
    side.set(x*.26,.13,z*.26);
  });
}

function paintClimbingQuench(geometry,event,time) {
  const front=setupFront(event);
  if(!front)return;
  const age=time-event.at;
  const {from,fx,fz,travel,windup}=front;
  const width=clamp(event.width??event.radius??3.2,1.2,7.4);
  const phase=age-windup;
  const head=clamp(phase/travel,0,1);
  const lift=clamp(event.terrainRise??0,0,4.4);
  const matter=smooth(age,0,.054)*fade(age,windup+travel+.24,windup+travel+.59);
  const seed=(event.laneId??event.id)*.37;
  const floor=event.points?.[0]?.ground??from.y-.28;

  // The low inlet stays legible behind the curl, joining the wet contact to the banks.
  for(const [edge,style,opacity] of [[0,climbingSteamBrush.wet,.76],[-1,climbingSteamBrush.bank,.89],[1,climbingSteamBrush.bank,1]]) {
    geometry.band(27,style,matter*opacity,(u,p,w)=>{
      const pad=Math.sin(u*Math.PI);
      const across=(u*2-1)*width*.63;
      const stream=edge*.24+pad*.58;
      p.set(from.x+fz*across+fx*stream,floor+.21+pad*.12,from.z-fx*across+fz*stream);
      const breath=.16+.39*pad*(edge===0?1:.61);
      w.set(fx*breath,.105+.10*pad,fz*breath);
    });
  }

  if(head>.018) {
    const drying=fade(phase,travel+.13,travel+.55);
    // The two banks span only the route the wave has already crossed.
    for(const [side,style,opacity] of [[0,climbingSteamBrush.wet,.72],[-1,climbingSteamBrush.bank,.82],[1,climbingSteamBrush.bank,1]]) {
      geometry.band(42,style,matter*opacity*drying,(u,p,w)=>{
        const along=head*u;
        track(front,along,p);
        const wake=sinRidge(along,seed+side);
        const fold=Math.sin(u*Math.PI);
        const across=side*(.39+.11*wake+.04*fold)*width;
        p.x+=fz*across;
        p.z-=fx*across;
        p.y+=.14+(side===0?.15:.50+.22*wake)*fold;
        const breadth=width*(side===0?.38:.18+.08*fold);
        const thickness=side===0?.12:.32+.14*fold;
        w.set(fz*breadth,thickness,-fx*breadth);
        return .76+.24*fold;
      });
    }
    const crest=smooth(phase,-.01,.075)*fade(phase,travel+.08,travel+.26);
    const curl=smooth(phase,.02,.23);
    const headPoint=track(front,head,geometry.track);
    for(const [lip,style,ink] of [[0,climbingSteamBrush.lip,1.08],[1,climbingSteamBrush.spill,.72]]) {
      geometry.band(42,style,crest*ink,(u,p,w)=>{
        const side=u*2-1;
        const fold=Math.pow(Math.sin(u*Math.PI),.72);
        const silk=.19*sinRidge(u,seed+lip);
        const across=side*width*(lip?.78:.98);
        const setback=side*side*.92+lip*.66;
        const height=(.44+fold*(1.82+lift*.25))*(.61+.39*curl)*(1-lip*.22);
        p.set(headPoint.x+fz*across-fx*setback,headPoint.y+.18+height*.49+silk,
          headPoint.z-fx*across-fz*setback);
        w.set(-fx*(.29+.20*fold),height*.56,-fz*(.29+.20*fold));
        return .53+.47*fold;
      });
    }
  }

  for(const impact of event.impacts??[]) {
    if(!impact.killed)continue;
    const contact=time-impact.at;
    const press=smooth(contact,0,.069)*fade(contact,.142,.41);
    if(press<.023)continue;
    const release=smooth(contact,.06,.33);
    for(const side of [-1,1]) geometry.band(21,climbingSteamBrush.spill,press*.87,(u,p,w)=>{
      const bowl=Math.sin(u*Math.PI);
      const cut=(u*2-1)*(1.26+.44*release);
      const hollow=side*(.37+.46*bowl);
      p.set(impact.x+fz*cut+fx*hollow,impact.y+.14+bowl*(.44-.32*release),impact.z-fx*cut+fz*hollow);
      w.set(fx*.32,.12+.35*bowl,fz*.32);
    });
  }
}

function paintQuenchRunoff(geometry,event,time) {
  const age=time-event.at;
  const finish=event.cancelledAt??event.at+event.travel;
  const reached=clamp((Math.min(time,finish)-event.at)/event.travel,0,1);
  if(reached<.022)return;
  const flow=smooth(age,0,.075)*fade(time,finish+.025,finish+.24);
  const {fx,fz}=event.front;
  const seed=(event.laneId??event.id)*.31;
  geometry.band(35,climbingSteamBrush.wet,flow*.62,(u,p,w)=>{
    const fold=Math.sin(u*Math.PI);
    track(event.front,u*reached,p);
    const slip=.06*sinRidge(u,seed);
    p.x+=fz*slip;
    p.z-=fx*slip;
    p.y+=.055+fold*.10;
    const breadth=.10+.24*Math.pow(fold,.71);
    w.set(fz*breadth,.03,-fx*breadth);
    return .57+.43*u;
  });
}

function paintBeamIntercept(geometry,event,time) {
  const age=time-event.at;
  if(age<0)return;
  const {fx,fz,width}=event.front;
  for(const hit of event.impacts) {
    const contact=time-hit.at;
    const atSite=smooth(contact,0,.063)*fade(contact,.178,.42);
    if(atSite<.023)continue;
    const drift=smooth(contact,.06,.39);
    const radius=clamp(hit.radius??.7,.54,1.32);
    const reach=Math.min(width*.92,radius*(1.14+drift*1.48));
    const angle=(event.id+hit.targetId)*.73;
    for(const [bank,style] of [[-1,beamInterceptBrush.char],[1,beamInterceptBrush.paper]]) {
      geometry.band(22,style,atSite*(bank<0?.88:.96),(u,p,w)=>{
        const side=u*2-1;
        const curl=Math.sin(u*Math.PI);
        const spread=side*reach;
        const folded=(.16+bank*.38+curl*.45)*radius;
        const lift=.19+(.23+drift*.35)*curl+.08*sinRidge(u,angle);
        p.set(hit.x+fx*folded+fz*spread,hit.y+lift,hit.z+fz*folded-fx*spread);
        const breadth=.15+.41*curl*radius;
        w.set(fx*breadth,.12+.21*curl,fz*breadth);
      });
    }
  }
}

function paintBeamQuench(geometry,event,time) {
  if(event.climbing===true) {
    paintClimbingQuench(geometry,event,time);
    return;
  }
  const front=setupFront(event);
  if(!front)return;
  const age=time-event.at;
  const {from,fx,fz,travel,windup}=front;
  const width=clamp(event.width??event.radius??3.2,1.2,7.4);
  const phase=age-windup;
  const head=clamp(phase/travel,0,1);
  const burst=smooth(age,0,.051)*fade(age,.11,windup+.31);
  const body=smooth(phase,-.025,.055)*fade(phase,travel+.085,travel+.49);
  const rise=smooth(phase,0,.26);
  const rush=lerp(.52,1,smooth(head,0,.70));
  const tail=Math.max(0,head-.41);
  const seed=(event.laneId??event.id)*.37;
  const bank=(p,lateral)=>{p.x+=fz*lateral;p.z-=fx*lateral;};

  // The outlet briefly gathers into one low step before thrusting forward.
  for(const side of [-1,1]) geometry.band(19,quenchBrush.impact,burst*.79,(u,p,w)=>{
    const tip=Math.sin(u*Math.PI);
    const spread=(.11+.69*u)*width*side;
    p.set(from.x+fz*spread,from.y+.29+tip*(.54+1.27*rise),from.z-fx*spread);
    w.set(fx*.24,.33+.38*tip,fz*.24);
  });
  if(body<.019)return;
  const spill=track(front,head,geometry.track);
  const crown=body*fade(phase,travel+.115,travel+.39);
  // One transverse brush carries the eye at the advancing edge. The lifted
  // contour curls over the real lane and reads as rising vapour over the ink bed.
  for(const [layer,mode,opacity]of [[1,quenchBrush.wake,.68],[0,quenchBrush.face,1.18]]) {
    geometry.band(56,mode,crown*opacity,(u,p,w)=>{
      const along=2*u-1;
      const taper=Math.sin(Math.PI*u);
      const billow=taper*(.78+.22*Math.sin(u*12.7+seed+layer*.95));
      const lateral=along*width*lerp(.61,1.02,rise);
      const tip=sinRidge(u,seed+layer*3.7);
      const shoulder=(.12+billow*.89)*rise;
      const curl=.69*Math.sin(u*5.6+seed+layer*.46)*taper;
      const retreat=along*along*.95+layer*.84+curl*rise;
      p.copy(spill);
      bank(p,lateral+taper*(tip*.22-layer*.32));
      p.x-=fx*retreat;
      p.z-=fz*retreat;
      p.y+=.40+shoulder*(1.75+.33*layer)+.31*tip*taper;
      w.set(-fx*(.39+.18*curl),.37+billow*(layer?.58:1.32)*rise,-fz*(.39+.18*curl));
      return .71+.29*taper;
    });
  }
  for(const bankSide of [-1,1]) {
    for(const [index,lift,coverage] of [[0,.48,.62],[1,1.25,.40]]) {
      geometry.band(index===0?43:30,quenchBrush.wake,body*coverage,(u,p,w)=>{
        const tip=Math.sin(Math.PI*u);
        const advance=lerp(head,tail,u);
        track(front,advance,p);
        const ruffle=sinRidge(u,seed+index*.87+bankSide*2.4);
        const across=bankSide*width*rush*(.13+u*.54+.08*ruffle);
        bank(p,across);
        p.y+=.19+rise*tip*(lift+.15*ruffle);
        const vertical=(.34+.53*tip)*(index===0?1:.68);
        w.set(fx*.27,vertical,fz*.27);
        return (1-u*.72)*(.78+.22*tip);
      });
    }
  }
  for(const impact of event.impacts??[]) {
    const elapsed=time-impact.at;
    if(elapsed<0||elapsed>.48) continue;
    const weight=smooth(elapsed,-.02,.065)*fade(elapsed,.13,.48)*(impact.killed?1:.63);
    const widen=(impact.killed?.70:.46)+elapsed*4.8;
    for(const side of [-1,1]) geometry.band(17,quenchBrush.impact,weight,(u,p,w)=>{
      const tip=Math.sin(u*Math.PI);
      const lateral=side*widen*(.25+u*.8);
      const past=.11+side*.27+Math.sin(u*Math.PI)*widen*.63;
      p.set(impact.x+fz*lateral+fx*past,impact.y+.19+u*widen*.88+tip*.29,impact.z-fx*lateral+fz*past);
      w.set(fx*.21,.16+.33*tip,fz*.21);
    });
  }
}

function paintPinch(geometry,mouth,age,seed) {
  const pulse=smooth(age,0,.033)*fade(age,.16,.26);
  if(pulse<.02)return;
  const size=lerp(3.05,.24,smooth(age,.012,.22));
  const narrow=lerp(1.12,.09,smooth(age,0,.19));
  for(const hand of [-1,1]) geometry.band(41,0,pulse*.74,(u,p,side)=>{
    const turn=(u-.49)*Math.PI*1.14;
    const swing=u*1.58+hand*1.32+seed*.09;
    p.set(mouth.x+Math.cos(swing)*size*Math.sin(turn),
      mouth.y+.27+Math.cos(turn)*narrow*hand,mouth.z+Math.sin(swing)*size*Math.sin(turn));
    const width=(.12+size*.14)*Math.sin(u*Math.PI);
    side.set(Math.cos(swing)*width,.27*width,Math.sin(swing)*width);
  });
}

function paintLocalWake(geometry,center,age,seed,stone) {
  const local=age-(stone?.12:.15);
  const front=smooth(local,0,.27);
  const alpha=smooth(local,0,.072)*fade(local,.14,.45);
  if(alpha<.023)return;
  const reach=lerp(.58,stone?3.25:3.65,front);
  for(const bank of [-1,1]) geometry.band(34,stone?2:1,alpha*(stone?.62:.72),(u,p,side)=>{
    const t=bank*1.56+(u-.5)*Math.PI*.93+seed*.61;
    const nick=sinRidge(u,seed)*.11;
    const r=reach*(.75+.25*Math.sin(u*Math.PI))+nick;
    const sin=Math.sin(t), cos=Math.cos(t);
    p.set(center.x+sin*r,center.y+.13+(stone?.16:.42)*Math.sin(u*Math.PI)*(1-front*.43),center.z+cos*r);
    const width=(stone?.51:.35)*(.38+.62*Math.sin(u*Math.PI));
    side.set(sin*width,.068+width*.22,cos*width);
  });
}

function identifyClearGroups(targets) {
  const groups=[];
  for(const target of targets) {
    const group=groups.find(entry=>Math.hypot(target.x-entry.x,(target.y-entry.y)*1.5,target.z-entry.z)<5.4);
    if(!group) {
      groups.push({...point(target),targets:[target]});
      continue;
    }
    const count=group.targets.push(target);
    group.x+=(target.x-group.x)/count;
    group.y+=(target.y-group.y)/count;
    group.z+=(target.z-group.z)/count;
  }
  return groups.filter(group=>group.targets.length>1);
}

function paintClearGroup(geometry,group,age,kind,seed) {
  const frost=kind==='frost';
  const alpha=smooth(age,0,.09)*fade(age,.37,.72);
  if(alpha<.025)return;
  const {x,y,z,targets}=group;
  const farthest=targets.reduce((best,target)=>{
    const distance=Math.hypot(target.x-x,target.z-z);
    return distance>best.distance?{target,distance}:best;
  },{target:targets[0],distance:0});
  const span=Math.max(farthest.distance,.01);
  const fx=farthest.distance>.10?(farthest.target.x-x)/span:Math.cos(seed);
  const fz=farthest.distance>.10?(farthest.target.z-z)/span:Math.sin(seed);
  const length=clamp(span+1.65,2.10,5.7);
  const spreading=lerp(.78,1.12,smooth(age,.04,.48));
  for(const bank of [-1,1]) geometry.band(22,frost?22:2,alpha*(frost?.62:.53),(u,p,w)=>{
    const taper=Math.sin(u*Math.PI);
    const along=(u*2-1)*length*spreading;
    const across=bank*(.48+.52*taper)*spreading;
    p.set(x+fx*along+fz*across,y+.095+.065*sinRidge(u,seed+bank),z+fz*along-fx*across);
    const thickness=(.18+.36*taper)*spreading;
    w.set(fz*thickness,frost?.105:.083,-fx*thickness);
  });
}

function fitMassClear(event, time) {
  const targets=(event.targets??[]).filter(validPoint);
  if(targets.length<8 || !Object.hasOwn(massBrush,event.kind))return null;
  const center={x:0,y:0,z:0};
  for(const target of targets) {
    center.x+=target.x/targets.length;
    center.y+=target.y/targets.length;
    center.z+=target.z/targets.length;
  }
  let xx=0,xz=0,zz=0;
  for(const target of targets) {
    const x=target.x-center.x, z=target.z-center.z;
    xx+=x*x;
    xz+=x*z;
    zz+=z*z;
  }
  const angle=.5*Math.atan2(2*xz,xx-zz);
  const fx=Math.cos(angle),fz=Math.sin(angle);
  let min=Infinity,max=-Infinity, breadth=0, yy=0;
  const samples=[];
  for(const target of targets) {
    const x=target.x-center.x,z=target.z-center.z;
    const s=x*fx+z*fz;
    const across=x*fz-z*fx;
    min=Math.min(min,s);
    max=Math.max(max,s);
    breadth+=across*across;
    yy+=s*(target.y-center.y);
    samples.push({s,y:target.y});
  }
  const length=max-min;
  const gap=Math.sqrt(breadth/samples.length);
  if(length<3||Math.max(xx,zz)<6)return null;
  // A nearly vertical formation retains the event cluster's average
  // altitude. Long diagonal formations fit their occupied flight lane.
  const pitch=clamp(yy/Math.max(.10,xx*fx*fx+2*xz*fx*fz+zz*fz*fz),-.42,.42);
  const reach=clamp(length*.53+1.6,4.7,21);
  const offset=(min+max)*.5;
  return {id:event.id,stage:event.stage,kind:event.kind,at:time,center,fx,fz,offset,pitch,
    reach,width:clamp(gap*.91+1.5,2.35,7.65),force:clamp((event.burstKills??targets.length)/22,.64,1.15)};
}

function paintMassClear(geometry,clear,age,floorAt,reducedMotion) {
  const {id,kind,center,fx,fz,reach,width,offset,pitch,force}=clear;
  const brush=massBrush[kind],stone=kind==='stone';
  const strength=smooth(age,0,.045)*force;
  const split=smooth(age,.026,.29);
  const motion=reducedMotion?.48:1;
  const height=(x,z,s)=>Math.max(center.y+pitch*s,(floorAt?.(x,z)??-Infinity)+.065);
  const length=reach*(.76+.24*smooth(age,.02,.17));
  const core=strength*fade(age,.088,.26);
  const sweep=strength*fade(age,.15,.43);
  // The bright fissure is one short continuous strike. The two ink banks
  // pull away from it and physically leave the center vacant as they shrink.
  geometry.band(46,brush+3,core*.88,(u,p,w)=>{
    const s=offset+(2*u-1)*length;
    const ripple=.20*sinRidge(u,id)+(.15+.058*width)*Math.sin(u*23.3+id);
    const x=center.x+fx*s+fz*ripple,z=center.z+fz*s-fx*ripple;
    p.set(x,height(x,z,s)+.28,z);
    const feather=(.24+width*.19)*Math.sin(u*Math.PI);
    w.set(fz*feather,.11+feather*.11,-fx*feather);
  });
  for(const bank of [-1,1]) {
    geometry.band(43,brush,sweep*(bank>0?1.14:.93),(u,p,w)=>{
      const taper=Math.sin(u*Math.PI);
      const s=offset+(2*u-1)*length;
      const tooth=sinRidge(u,id+bank*7.1);
      const fractured=stone?.34*tooth:.13*Math.sin(u*38.2+bank);
      const slide=bank*width*(.40+.66*split*motion+.14*taper+fractured*.18);
      const x=center.x+fx*s+fz*slide,z=center.z+fz*s-fx*slide;
      p.set(x,height(x,z,s)+.17+taper*(.40+width*.12)*split*motion+fractured*.27,z);
      const thickness=width*(.46-.23*split)*(.55+.45*taper)+.17;
      w.set(fz*thickness,-bank*thickness*(stone?.64:.45),-fx*thickness);
      return .54+.46*taper;
    });
  }
  const peel=smooth(age,.069,.19)*fade(age,.19,massClearLife)*force;
  for(const bank of [-1,1])for(let i=0;i<2;i++) {
    geometry.band(24,brush+(i?2:1),peel*(i?.33:.51),(u,p,w)=>{
      const taper=Math.sin(u*Math.PI);
      const s=offset+(2*u-1)*length*(.87-i*.13);
      const across=bank*width*(.74+taper*.24+i*.27+split*.36*motion);
      const loose=.11*sinRidge(u,id+bank*2.1+i);
      const x=center.x+fx*s+fz*(across+loose),z=center.z+fz*s-fx*(across+loose);
      p.set(x,height(x,z,s)+.12+i*.09+(.18+i*.16)*taper*motion,z);
      const thin=(.16+width*.14)*(.35+.65*taper)*(1-split*.33);
      w.set(fz*thin,.24*thin,-fx*thin);
    });
  }
}

function frostSheetPath(event) {
  const path=(event.points??[]).filter(validPoint);
  const from=event.from??path[0],to=event.to??path.at(-1);
  if(!validPoint(from)||!validPoint(to))return null;
  const front=setupFront({...event,from,to,points:path.length>1?path:undefined});
  if(!front)return null;
  front.panes=clamp(Math.ceil(front.length/3.3),3,7);
  return front;
}

function frostSheetStroke(geometry,mode,alpha,from,to,width,seed) {
  const dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);
  if(length<.06)return;
  const sideX=dz/length,sideZ=-dx/length;
  geometry.band(8,mode,alpha,(u,p,w)=>{
    const fold=Math.sin(Math.PI*u);
    const jog=fold*sinRidge(u,seed)*.17;
    p.set(lerp(from.x,to.x,u)+sideX*jog,lerp(from.y,to.y,u)+.12*fold,lerp(from.z,to.z,u)+sideZ*jog);
    w.set(sideX*width,.19*width,sideZ*width);
  });
}

function paintFrostSheet(geometry,event,time,reducedMotion,temper) {
  const {front,at,breakAt,breakTargets}=event;
  const age=time-at;
  if(age<0)return;
  const moving=smooth(age,front.windup,front.windup+Math.max(.10,front.travel));
  const seeded=event.id*.73+(event.leg??0)*5.31;
  const breakAge=time-(breakAt??Infinity);
  const broken=breakAge>=0;
  const release=broken?smooth(breakAge,.015,.27):0;
  const recede=1-(temper?.gain??0)*.82;
  const strength=smooth(age,.005,.077)*(broken?fade(breakAge,.14,.49):fade(age,front.duration+.08,front.duration+.35))*recede;
  if(strength<.020)return;

  // A shallow suspended fold follows the actual strip, leaving bodies legible through the glaze.
  const {fx,fz,width,panes}=front;
  const pull=reducedMotion?.37:1;
  for(let index=0;index<panes;index++) {
    const along=index/(panes-1);
    if(along>moving+.10)continue;
    const key=seeded+index*6.71;
    const pivot=point(track(front,along,geometry.track));
    const panelFade=smooth(moving,Math.max(-.10,along-.12),Math.min(1,along+.04));
    for(const bank of [-1,1]) {
      const shoulder=(.49+.34*hash(key+bank))*width;
      const panelLength=front.length/panes*(.68+.25*hash(key+4));
      const bankLift=bank>0?.58:.19;
      const chipLift=.54+hash(key+bank+7);
      geometry.band(8,broken?frostSheetBrush.fragment:frostSheetBrush.clay,
        strength*panelFade*(broken?.87:.69),(u,p,w)=>{
          const cut=1-Math.abs(2*u-1);
          const forward=(u-.5)*panelLength*2;
          const spread=bank*(shoulder*(.34+.17*cut)+release*(3.1+hash(key+1)*1.40)*pull);
          const shear=bank*(.24+.32*hash(key+bank))*(2*u-1)+release*(hash(key)-.5)*1.23;
          p.set(pivot.x+fx*(forward+shear)+fz*spread,
            pivot.y+.54+bankLift+(.23+.51*cut)*(u>.42?1:.3)+release*(.63+chipLift*cut)*pull,
            pivot.z+fz*(forward+shear)-fx*spread);
          const span=shoulder*(.09+.77*cut)*(1-.58*release);
          w.set(fz*span,.34*span*(bank>0?1:-.55),-fx*span);
        });
    }
  }

  if(moving>.02)geometry.band(34,broken?frostSheetBrush.cut:frostSheetBrush.join,
    strength*(broken?fade(breakAge,.062,.26)*.99:.89),(u,p,w)=>{
      track(front,u*moving,p);
      const shifted=sinRidge(u,seeded)*.52;
      p.x+=fz*shifted;
      p.z-=fx*shifted;
      p.y+=.79+Math.sin(u*5.5*Math.PI)*.24;
      const weight=.25+.21*Math.sin(u*Math.PI)+.24*release;
      w.set(fz*weight,.23*weight,-fx*weight);
    });

  if(!broken) {
    for(const [index,target] of event.targets.entries()) {
      const t=clamp(((target.x-front.from.x)*fx+(target.z-front.from.z)*fz)/front.length,0,1);
      if(t>moving)continue;
      const root=point(track(front,t,geometry.track));
      frostSheetStroke(geometry,frostSheetBrush.join,strength*.56,{...root,y:root.y+.72},
        {...target,y:target.y+.64},.21,seeded+index*1.41);
    }
    return;
  }
  const throwOut=smooth(breakAge,.012,.36);
  const splinter=smooth(breakAge,0,.038)*fade(breakAge,.24,.49)*(1-(temper?.gain??0)*.56);
  for(const [index,target] of breakTargets.entries()) {
    const t=clamp(((target.x-front.from.x)*fx+(target.z-front.from.z)*fz)/front.length,0,1);
    const root=point(track(front,t,geometry.track));
    const across=Math.sign((target.x-root.x)*fz-(target.z-root.z)*fx)||(index%2?1:-1);
    const key=seeded+index*8.51;
    const spread=across*(1.95+3.10*hash(key))*throwOut*pull;
    const run=(hash(key+5)-.42)*3.25*throwOut*pull;
    const lift=(.76+hash(key+6)*2.5)*throwOut*pull;
    const a={x:target.x+spread*fz+run*fx,y:target.y+.28+lift,z:target.z-spread*fx+run*fz};
    const b={x:a.x+fz*across*(.95+hash(key+3)*1.6)+fx*.61,y:a.y+.92+hash(key+8)*1.55,
      z:a.z-fx*across*(.95+hash(key+3)*1.6)+fz*.61};
    frostSheetStroke(geometry,frostSheetBrush.fragment,splinter*(target.killed===false?.60:.89),a,b,.48+.31*hash(key+2),key);
  }
}

function frostSheetTargets(targets,maximum=12) {
  return (targets??[]).filter(validPoint).slice(0,maximum).map(target=>({...point(target),id:target.id??target.targetId,
    radius:target.radius??target.targetRadius,killed:target.killed}));
}

function paintTemperSources(geometry,event,age,tip,seed) {
  const {front,sources}=event;
  const {fx,fz,from}=front;
  const thaw=event.formation==='thaw-flank';
  const hold=smooth(age,0,.021)*fade(age,thaw?front.windup:.14,thaw?front.windup+.20:.30);
  const feed=smooth(age,.047,.13)*fade(age,thaw?front.windup+.16:.24,thaw?front.windup+.29:.37);
  const join=point(track(front,Math.min(.32,tip),geometry.track));
  for(const [index,source] of sources.slice(0,4).entries()) {
    const key=seed+index*6.19;
    const radius=clamp(source.radius??.8,.7,1.65);
    const split=smooth(age,.055,.23);
    const open=clamp(age/.128,0,1);
    geometry.band(17,frostTemperBrush.fissure,hold*(thaw?1.52:1.2),(u,p,w)=>{
      const t=u*open;
      const slant=radius*(2*t-1)*1.82;
      const fold=Math.sin(u*Math.PI);
      const cross=radius*(.38*sinRidge(t,key)+split*.12);
      p.set(source.x+fx*slant+fz*cross,source.y+.40+(thaw?1.64:.96)*u+.25*fold,source.z+fz*slant-fx*cross);
      const width=radius*(.17+(thaw?.83:.66)*fold);
      w.set(fz*width,.31*width,-fx*width);
    });
    const eye={x:source.x,y:source.y+.86,z:source.z};
    const to={x:lerp(from.x,join.x,.90),y:lerp(from.y,join.y,.90)+1.15,z:lerp(from.z,join.z,.90)};
    frostSheetStroke(geometry,frostTemperBrush.heat,feed*1.04,eye,to,.17+.10*radius,key);
  }
}

function paintTemperVapor(geometry,event,age,tip,seed,floorAt,motion,tail) {
  const {front}=event;
  const {fx,fz,width,length,windup}=front;
  const opacity=smooth(age,windup-.018,windup+.066)*tail;
  const start=Math.max(0,tip-Math.min(.75,15/length));
  if(tip-start<.02||opacity<.03)return;
  const fold=smooth(tip,.035,.42);
  const span=clamp(width*.98,2.0,6.1);
  // The receding wake stays planted along the authored 3D path below the peeling crest.
  geometry.band(28,frostTemperBrush.vapor,opacity*1.15,(u,p,w)=>{
    const lead=smooth(u,.26,.87);
    const shoulder=Math.sin(Math.PI*u*.87);
    const bend=span*(.21*shoulder-.36*lead)+.12*sinRidge(u,seed);
    track(front,lerp(start,tip,u),p);
    p.y=Math.max(p.y,(floorAt?.(p.x,p.z)??-Infinity)+.12)+.52+fold*motion*(.75*shoulder+1.78*lead);
    p.x+=fz*bend;
    p.z-=fx*bend;
    const brush=span*(.14+.34*shoulder)*(.57+.43*fold);
    w.set(fz*brush,(.19+lead*1.18)*fold*motion,-fx*brush);
    return .22+.78*lead;
  });
  const head=point(track(front,tip,geometry.track));
  const heading=point(track(front,Math.max(0,tip-.035),geometry.track));
  const headSpan=clamp(width*(.34+.66*fold),1.15,6);
  const headGround=Math.max(head.y,(floorAt?.(head.x,head.z)??-Infinity)+.12);
  const headRun=Math.hypot(head.x-heading.x,head.z-heading.z);
  const dx=headRun>.03?(head.x-heading.x)/headRun:fx;
  const dz=headRun>.03?(head.z-heading.z)/headRun:fz;
  geometry.band(30,frostTemperBrush.vapor,opacity*fold*1.20,(u,p,w)=>{
    const side=2*u-1;
    const arch=Math.sin(Math.PI*u)*(.81+.19*u);
    const across=headSpan*side;
    const drift=-1.65+1.45*arch+.24*sinRidge(u,seed*.6);
    p.set(head.x+dz*across+dx*drift,headGround+.38+arch*(.65+3.3*fold*motion),head.z-dx*across+dz*drift);
    const brush=.36+arch*(.55+1.02*fold);
    w.set(dx*brush,(.32+1.20*arch)*fold*motion,dz*brush);
  });
  for(const bank of [-1,1])geometry.band(19,frostTemperBrush.heat,opacity*.69,(u,p,w)=>{
    const curl=sinRidge(u,seed+bank*3.9);
    const spread=bank*span*(.30+.38*Math.sin(u*Math.PI))*(1-.74*u)+curl*.20;
    track(front,lerp(start,tip,u),p);
    p.y=Math.max(p.y,(floorAt?.(p.x,p.z)??-Infinity)+.08)+.29+.54*u*fold*motion;
    p.x+=spread*fz;
    p.z-=spread*fx;
    const brush=.14+.18*Math.sin(Math.PI*u);
    w.set(fz*brush,.11,-fx*brush);
  });
}

function paintTemperHitFold(geometry,hits,time,seed,floorAt,motion,fx,fz) {
  const first=hits.find(hit=>hit.killed);
  if(!first||time-first.at>.68)return;
  const caught=hits.filter(hit=>hit.killed&&hit.at-first.at<=.236&&
    Math.hypot(hit.x-first.x,hit.z-first.z)<10.5&&Math.abs(hit.y-first.y)<4.6);
  if(caught.length>=2) {
    const packetAge=time-caught[1].at;
    const opens=smooth(packetAge,.004,.086);
    const hold=opens*fade(packetAge,.145,.43);
    if(hold>.025) {
      const weights=caught.map((hit,i)=>i<2?1:smooth(time-hit.at,0,.16));
      const weight=weights.reduce((sum,w)=>sum+w,0);
      const center=caught.reduce((avg,hit,i)=>{
        const w=weights[i]/weight;
        avg.x+=hit.x*w;avg.y+=hit.y*w;avg.z+=hit.z*w;
        return avg;
      },{x:0,y:0,z:0});
      const cross=Math.max(...caught.map((hit,i)=>weights[i]*Math.abs((hit.x-center.x)*fz-(hit.z-center.z)*fx)));
      const span=clamp(cross+2.3+weight*.53,3.9,10.1);
      // Put the broad moving fold behind the struck bodies, and leave dry
      // paper openings in its face so their own imprints read on the beat.
      for(const bank of [-1,1]) geometry.band(29,frostTemperBrush.burst,hold*(bank>0?1.24:.72),(u,p,w)=>{
        const wing=2*u-1;
        const lobe=Math.sin(u*Math.PI);
        const across=wing*span*(.71+.29*opens);
        const along=-.44-bank*.48+(.8+.71*opens)*lobe+.32*sinRidge(u,seed+bank*2.2);
        const x=center.x+fz*across+fx*along;
        const z=center.z-fx*across+fz*along;
        const base=Math.max(center.y,(floorAt?.(x,z)??-Infinity)+.08);
        p.set(x,base+(bank>0?.63:1.05)+lobe*(.41+opens*(bank>0?1.83:.76))*motion,z);
        const brush=.30+lobe*(bank>0?1.57:.72);
        w.set(fx*brush,(bank>0?1.58:.75)*lobe*motion,fz*brush);
      });
    }
  }
}

function paintTemperHits(geometry,event,time,seed,floorAt,motion) {
  const {hits,front}=event;
  const {fx,fz}=front;
  paintTemperHitFold(geometry,hits,time,seed,floorAt,motion,fx,fz);
  for(const [index,hit] of hits.entries()) {
    const age=time-hit.at;
    const flash=smooth(age,-.018,.030)*fade(age,.092,.27) * (hit.killed?.92:.65);
    const vapor=smooth(age,.049,.16)*fade(age,.22,.46);
    const spread=smooth(age,0,.32);
    const radius=clamp(hit.radius??.7,.46,1.65);
    const key=seed+index*9.39;
    const ground=Math.max(hit.y,(floorAt?.(hit.x,hit.z)??-Infinity)+.10);
    geometry.band(22,frostTemperBrush.burst,flash*1.11,(u,p,w)=>{
      const wing=2*u-1;
      const lobe=Math.sin(Math.PI*u);
      const across=wing*radius*(2.3+spread*1.45*motion);
      const forward=radius*(.29-.73*wing*wing)+.13*sinRidge(u,key);
      p.set(hit.x+forward*fx+across*fz,ground+.20+radius*(.30+motion*.74*lobe),hit.z+forward*fz-across*fx);
      const brush=radius*(.22+.76*lobe);
      w.set(fx*brush,.49*lobe*brush,fz*brush);
    });
    const bias=hash(key+7)<.5?-1:1;
    geometry.band(12,frostTemperBrush.burst,flash*.75,(u,p,w)=>{
      const curl=Math.sin(Math.PI*u);
      const across=bias*radius*(.32+.78*u);
      const drift=radius*(1.72*u-.82);
      p.set(hit.x+fx*drift+fz*across,ground+.18+.43*radius*curl,
        hit.z+fz*drift-fx*across);
      const brush=radius*(.14+.43*curl);
      w.set(fz*brush,.33*brush,-fx*brush);
    });
    geometry.band(15,frostTemperBrush.vapor,vapor*.87,(u,p,w)=>{
      const crest=Math.sin(u*Math.PI);
      const sideways=radius*(2*u-1)*(1+spread*.86*motion);
      const drift=radius*(.24+.73*spread*motion)+.22*crest*sinRidge(u,key);
      p.set(hit.x+fx*drift+fz*sideways,ground+.51+radius*(1+2.17*spread*motion)*crest,
        hit.z+fz*drift-fx*sideways);
      const brush=radius*(.32+.56*crest);
      w.set(fx*brush,.52*brush,fz*brush);
    });
  }
}

function paintThawTide(geometry,front,age,tip,seed,floorAt,motion,tail) {
  const {windup,travel,settle,width,length,fx,fz}=front;
  const alpha=smooth(age,windup,windup+.065)*tail;
  if(tip<.014||alpha<.019)return;
  const landing=smooth(age,windup+travel,windup+travel+settle);
  const start=Math.max(0,tip-Math.min(.65,16/length));
  const unfurl=smooth(tip,.05,.42);
  for(const bank of [-1,1])geometry.band(29,thawBrush.vapor,alpha*.60,(u,p,w)=>{
    const sway=sinRidge(u,seed+bank*1.8);
    const stroke=lerp(start,tip,u);
    const breadth=width*smooth(stroke,0,.44)*bank*(.29+.40*u+.05*sway);
    track(front,stroke,p);
    p.x+=fz*breadth;
    p.z-=fx*breadth;
    const floor=floorAt?.(p.x,p.z)??-Infinity;
    p.y+=clamp(floor+.09-p.y,0,.65)+.22+(.28+.41*u)*motion;
    const brush=(.17+.47*u)*(.58+.42*unfurl);
    w.set(fz*brush,.51*brush,-fx*brush);
    return .23+.77*smooth(u,0,.70);
  });
  const head=point(track(front,tip,geometry.track));
  const behind=point(track(front,Math.max(0,tip-.047),geometry.track));
  const span=Math.hypot(head.x-behind.x,head.z-behind.z);
  const dx=span>.025?(head.x-behind.x)/span:fx;
  const dz=span>.025?(head.z-behind.z)/span:fz;
  const spread=width*(.30+.70*unfurl);
  geometry.band(37,thawBrush.crest,alpha*unfurl*(1-.73*landing),(u,p,w)=>{
    const wing=2*u-1;
    const roll=Math.sin(Math.PI*u);
    const sideways=wing*spread;
    const run=-(1-roll)*(1.25+.7*unfurl)+.21*sinRidge(u,seed);
    const x=head.x+dz*sideways+dx*run,z=head.z-dx*sideways+dz*run;
    const floor=floorAt?.(x,z)??-Infinity;
    p.set(x,head.y+clamp(floor+.12-head.y,0,.76)+.31+roll*(.62+.98*unfurl)*motion,z);
    const brush=.27+roll*(.81+.21*unfurl);
    w.set(dx*brush,roll*(1.34-.71*landing)*motion,dz*brush);
  });
  geometry.band(33,thawBrush.vapor,alpha*landing*.57,(u,p,w)=>{
    const wing=2*u-1;
    const side=wing*spread;
    const arch=Math.sin(Math.PI*u);
    const run=-.33-(.68+.22*landing)*wing*wing+.17*sinRidge(u,seed+.9);
    const x=head.x+dz*side+dx*run,z=head.z-dx*side+dz*run;
    p.set(x,head.y+clamp((floorAt?.(x,z)??-Infinity)+.08-head.y,0,.48)+.36+arch*.43,z);
    const brush=.14+.73*arch*landing;
    w.set(dx*brush,.46*brush,dz*brush);
  });
}

function paintThawLanding(geometry,event,time,seed,floorAt,motion) {
  const {front,hits}=event;
  const {fx,fz,width}=front;
  const recent=hits.filter(hit=>hit.killed&&time-hit.at>=0&&time-hit.at<.53);
  const first=recent[0];
  if(recent.length<2)return;
  const gathered=recent.filter(hit=>Math.abs((hit.x-first.x)*fx+(hit.z-first.z)*fz)<7.1&&Math.abs(hit.y-first.y)<5.2);
  if(gathered.length<2)return;
  const age=time-gathered[1].at;
  const opens=smooth(age,0,.096);
  const fadeOut=fade(age,.22,.49);
  const strength=opens*fadeOut;
  if(strength<.022)return;
  const weights=gathered.map((hit,index)=>index<2?1:smooth(time-hit.at,0,.16));
  const count=weights.reduce((sum,weight)=>sum+weight,0);
  const center=gathered.reduce((average,hit,index)=>{
    const weight=weights[index]/count;
    average.x+=hit.x*weight;average.y+=hit.y*weight;average.z+=hit.z*weight;
    return average;
  },{x:0,y:0,z:0});
  const extent=Math.max(...gathered.map((hit,index)=>weights[index]*Math.abs((hit.x-center.x)*fz-(hit.z-center.z)*fx)));
  const span=clamp(extent+Math.min(4.65,1.4+.63*count),2.6,Math.min(13.5,width+3.5));
  const peak=.62+.38*smooth(count,2,8);
  const stretched=Math.max(...gathered.map((hit,index)=>weights[index]*Math.abs((hit.x-center.x)*fx+(hit.z-center.z)*fz)));
  const followThrough=smooth(age,.025,.11)*fade(age,.18,.45)*peak;
  if(stretched>1.45)geometry.band(28,thawBrush.vapor,followThrough*.71,(u,p,w)=>{
    const across=(2*u-1)*span*.78;
    const bend=Math.sin(Math.PI*u);
    const root=-stretched*(.35+.72*bend)+.29*sinRidge(u,seed+5);
    const x=center.x+fz*across+fx*root,z=center.z-fx*across+fz*root;
    const floor=floorAt?.(x,z)??-Infinity;
    p.set(x,center.y+clamp(floor+.04-center.y,0,.50)+.23+motion*.37*bend,z);
    const brush=.21+bend*Math.min(2.33,stretched*.39);
    w.set(fx*brush,.31*bend*motion,fz*brush);
  });
  for(const bank of [-1,1])geometry.band(44,bank>0?thawBrush.landing:thawBrush.paper,strength*peak*(bank>0?1.17:.70),(u,p,w)=>{
    const wing=2*u-1;
    const lobe=Math.sin(Math.PI*u);
    const side=wing*span*(.65+.35*opens);
    const curl=sinRidge(u,seed+bank*1.71);
    const run=(bank>0?.58:1.16)+(1-wing*wing)*(.88+.56*opens)+curl*.42;
    const x=center.x+fz*side+fx*run,z=center.z-fx*side+fz*run;
    const floor=floorAt?.(x,z)??-Infinity;
    const lift=bank>0?.75:.31;
    p.set(x,center.y+clamp(floor+.05-center.y,0,.53)+.48+motion*lobe*(lift+opens*lift),z);
    const brush=.20+lobe*(bank>0?1.55:1.10);
    w.set(fx*brush,(bank>0?1.26:.38)*lobe*motion,fz*brush);
  });
}

function paintThawRush(geometry,event,time,floorAt,reducedMotion) {
  const {front,at,hitAt,cancelledAt}=event;
  const age=time-at;
  if(age<0)return;
  const motion=reducedMotion?.34:1;
  const seed=event.id*.41+(event.leg??0)*8.91;
  const end=at+front.windup+front.travel+front.settle;
  const stop=cancelledAt??Math.max(end,hitAt??end);
  const tip=clamp((Math.min(time,cancelledAt??time)-at-front.windup)/front.travel,0,1);
  const tail=fade(time,stop,stop+(cancelledAt===undefined?.17:.11))
    *(hitAt===undefined?1:1-.89*smooth(time-hitAt,.013,.10));
  if(cancelledAt===undefined||time-cancelledAt<.05)paintTemperSources(geometry,event,age,tip,seed);
  paintThawTide(geometry,front,age,tip,seed,floorAt,motion,tail);
  paintThawLanding(geometry,event,time,seed,floorAt,motion);
  for(const [index,hit] of event.hits.slice(0,8).entries()) {
    const elapsed=time-hit.at;
    const alpha=smooth(elapsed,0,.036)*fade(elapsed,.10,.32)*(hit.killed?1:.56);
    const side=index%2?1:-1;
    const spread=clamp(hit.radius??.8,.5,1.45);
    const above=.33+.46*smooth(elapsed,0,.27)*motion;
    const from={x:hit.x-front.fz*spread,y:hit.y+above,z:hit.z+front.fx*spread};
    const to={x:hit.x+front.fz*spread+front.fx*.37,y:hit.y+above+.34*side,z:hit.z-front.fx*spread+front.fz*.37};
    frostSheetStroke(geometry,thawBrush.landing,alpha,from,to,.19*spread,seed+index);
  }
}

function paintFrostTemperRush(geometry,event,time,floorAt,reducedMotion) {
  if(event.formation==='thaw-flank') {
    paintThawRush(geometry,event,time,floorAt,reducedMotion);
    return;
  }
  const {front,at,hitAt,cancelledAt}=event;
  const age=time-at;
  if(age<0)return;
  const motion=reducedMotion?.45:1;
  const seed=event.id*.53+(event.leg??0)*7.1;
  const end=at+front.windup+front.travel;
  const elapsed=Math.min(time,cancelledAt??time)-at;
  const tip=clamp((elapsed-front.windup)/front.travel,0,1);
  const stop=cancelledAt??Math.max(end,hitAt??end);
  const tail=fade(time,stop,stop+(cancelledAt===undefined?.20:.10))
    *(hitAt===undefined?1:1-.83*smooth(time-hitAt,.025,.14));
  if(cancelledAt===undefined||time-cancelledAt<.065)paintTemperSources(geometry,event,age,tip,seed);
  paintTemperVapor(geometry,event,age,tip,seed,floorAt,motion,tail);
  paintTemperHits(geometry,event,time,seed,floorAt,motion);
}

function rememberTemperHit(front,target,time) {
  const maximum=front.formation==='thaw-flank'?24:8;
  if(front.hits.length>=maximum||target.id===undefined||front.hits.some(hit=>hit.id===target.id))return;
  front.hitAt??=time;
  front.hits.push({...target,at:time});
}

function paintThawThunderMist(geometry,front,time,motion) {
  const {mist,at,release,cancelledAt}=front;
  const age=time-at;
  const life=front.duration??3.6;
  const exit=release?.at??cancelledAt??at+life;
  const alpha=smooth(age,0,.14)*fade(time,exit,exit+.31);
  const radius=clamp(front.radius*.53,1.3,4.2);
  const lift=release?smooth(time-release.at,0,.23)*motion:0;
  for(const bank of [-1,1]) geometry.band(26,thawThunderBrush.mist,alpha*(bank>0?.74:.49),(u,p,w)=>{
    const angle=(u-.51)*Math.PI*(1.52-.39*lift)+bank*1.54;
    const arch=Math.sin(Math.PI*u);
    const spread=radius*(.57+.39*arch+.055*sinRidge(u,front.id+bank));
    const x=Math.cos(angle), z=Math.sin(angle);
    p.set(mist.x+x*spread,mist.y+.22+arch*(.42+.95*lift),mist.z+z*spread);
    const width=(.28+.42*arch)*(1-.44*lift);
    w.set(x*width,.32*arch,z*width);
  });
}

function paintThawThunderBolt(geometry,front,head,alpha,width,seed,motion) {
  geometry.band(36,thawThunderBrush.bolt,alpha,(u,p,w)=>{
    const along=u*head;
    const fold=Math.sin(along*Math.PI);
    const step=Math.sin(along*37+seed)+.34*Math.sin(along*65+seed*1.7);
    track(front,along,p);
    p.x+=front.fz*step*fold*.72*motion;
    p.z-=front.fx*step*fold*.72*motion;
    p.y+=.30+step*fold*.25*motion;
    const edge=width*(.50+.50*Math.sin(u*Math.PI));
    w.set(front.fz*edge,.33*edge,-front.fx*edge);
  });
}

function paintThawThunderLanding(geometry,front,time,motion) {
  const first=front.hits[0];
  if(!first)return;
  const age=time-first.at;
  const {fx,fz}=front;
  const shown=front.hits.filter(hit=>hit.at<=time && Math.hypot(hit.x-first.x,hit.y-first.y,hit.z-first.z)<13);
  const mass=shown.length;
  if(!mass)return;
  const total=shown.reduce((sum,hit)=>sum+Number(Boolean(hit.killed)),0);
  const center=shown.reduce((c,hit)=>({x:c.x+hit.x/mass,y:c.y+hit.y/mass,z:c.z+hit.z/mass}),{x:0,y:0,z:0});
  const across=hit=>(hit.x-center.x)*fz-(hit.z-center.z)*fx;
  const ordered=shown.toSorted((a,b)=>across(a)-across(b));
  const kick=smooth(age,-.004,.034)*fade(age,.057,.145);
  const recoil=smooth(age,.056,.156)*fade(age,.18,.34);
  const fall=smooth(age,.06,.25)*motion;
  if(total>=2) {
    // A single raised strike gives scale to the confirmed group, then
    // extinguishes before the foreground bodies begin their shared fall.
    const flash=smooth(age,-.010,.015)*fade(age,.053,.105);
    const height=clamp(5.3+total*.74,6.7,9.8)*lerp(.62,1,motion);
    const depth=.85;
    const x=center.x-geometry.eye.x*depth;
    const z=center.z-geometry.eye.z*depth;
    geometry.band(25,thawThunderBrush.bolt,flash*1.15,(u,p,w)=>{
      const canopy=Math.sin(Math.PI*u);
      const bend=(Math.sin(u*24.2)+.62*Math.sin(u*48.3+1.7))*canopy*.63;
      const reach=.84*u+bend;
      p.set(x+fz*reach,center.y+.48+height*u,z-fx*reach);
      const width=(.37+.36*canopy)*(1-.35*u);
      w.set(fz*width,.085*width,-fx*width);
    });
    geometry.band(14,thawThunderBrush.bolt,flash*.40,(u,p,w)=>{
      const drift=.84+.64*u+.23*Math.sin(u*21.)*Math.sin(Math.PI*u);
      p.set(x+fz*drift,center.y+.48+height*(.91+.44*u),z-fx*drift);
      const width=.21*(1-.67*u);
      w.set(fz*width,.065*width,-fx*width);
    });
  }
  if(mass>=2) {
    // Connect the confirmed contact footprints. The fine line stays low while
    // the heavier wash opens behind their silhouettes and breaks away again.
    const span=clamp(Math.max(Math.abs(across(ordered[0])),Math.abs(across(ordered.at(-1))))+1.4+total*.34,2.5,9.6);
    geometry.band(31,thawThunderBrush.bolt,kick*(total>=3?1.05:.72),(u,p,w)=>{
      const step=u*(mass-1), lower=Math.floor(step), mix=step-lower;
      const a=ordered[lower], b=ordered[Math.min(mass-1,lower+1)];
      const edge=(2*u-1)**5*1.35;
      const ink=sinRidge(u,front.id)*.20*motion;
      p.set(lerp(a.x,b.x,mix)+fz*edge+fx*ink,
        lerp(a.y,b.y,mix)+.10+Math.sin(u*Math.PI)*.16+ink*.24,
        lerp(a.z,b.z,mix)-fx*edge+fz*ink);
      const brush=.14+.25*Math.sin(u*Math.PI);
      w.set(fx*brush,.27*brush,fz*brush);
    });
    const retreat=.86+fall*1.22;
    geometry.band(32,thawThunderBrush.burst,recoil*.79,(u,p,w)=>{
      const crest=Math.sin(u*Math.PI);
      const running=(2*u-1)*span*(.83+.17*fall);
      const drift=1.01+crest*.65+.26*sinRidge(u,front.id);
      p.set(center.x+fz*running+fx*drift-geometry.eye.x*retreat,
        center.y+.23+crest*(.39+.52*fall),
        center.z-fx*running+fz*drift-geometry.eye.z*retreat);
      const width=.19+crest*.72;
      w.set(fx*width,.38*crest*width,fz*width);
    });
  }
  // A raised main fork only connects to confirmed receivers. Keep its
  // terminus above the falling bodies so it cannot become a tall white mask.
  const crest=front.path?.[1];
  if(validPoint(crest)) {
    for(const hit of new Set([ordered[0],ordered.at(-1)])) {
      const elapsed=time-hit.at;
      const alpha=smooth(elapsed,-.008,.018)*fade(elapsed,.045,.145)*(hit.killed?.91:.58);
      const dx=hit.x-crest.x,dz=hit.z-crest.z;
      const length=Math.hypot(dx,dz);
      if(length<.75)continue;
      geometry.band(14,thawThunderBrush.bolt,alpha,(u,p,w)=>{
        const zig=Math.sin(u*Math.PI)*sinRidge(u,front.id+hit.id)*.60*motion;
        p.set(lerp(crest.x,hit.x,u)+dz/length*zig-geometry.eye.x*u*.39,
          lerp(crest.y,hit.y+.62,u)+zig*.26,
          lerp(crest.z,hit.z,u)-dx/length*zig-geometry.eye.z*u*.39);
        const width=lerp(.29,.12,u)/length;
        w.set(dz*width,.11,-dx*width);
      });
    }
  }
  for(const [i,hit] of ordered.slice(0,7).entries()) {
    const elapsed=time-hit.at;
    const flash=smooth(elapsed,-.012,.026)*fade(elapsed,.058,.17)*(hit.killed?.82:.50);
    const side=i%2?1:-1;
    const stroke=clamp(hit.radius??.78,.48,1.42);
    geometry.band(10,thawThunderBrush.bolt,flash,(u,p,w)=>{
      const slash=Math.sin(Math.PI*u);
      const reach=side*(u-.30)*stroke+sinRidge(u,front.id+i*2.72)*.14;
      p.set(hit.x+fz*reach-geometry.eye.x*(.38+.50*u),hit.y+.16+stroke*(1.40*u+.34*slash),
        hit.z-fx*reach-geometry.eye.z*(.38+.50*u));
      const width=.10+stroke*.13*slash;
      w.set(fz*width,.085*slash,-fx*width);
    });
  }
}

function paintThawThunder(geometry,event,time,reducedMotion) {
  const motion=reducedMotion?.49:1;
  paintThawThunderMist(geometry,event,time,motion);
  const front=event.release;
  if(!front)return;
  const {windup,travel,at,from}=front;
  const age=time-at;
  const lifetime=windup+travel;
  const hitAt=front.hits[0]?.at;
  const launch=smooth(age,0,.072)*fade(time,event.cancelledAt??at+lifetime+.22,(event.cancelledAt??at+lifetime+.22)+.13);
  const gathering=smooth(age,0,.031)*fade(age,windup+.10,windup+.25)*
    (event.cancelledAt===undefined?1:fade(time,event.cancelledAt,event.cancelledAt+.13));
  if(Math.hypot(from.x-event.mist.x,from.y-event.mist.y,from.z-event.mist.z)>.36) {
    const reach=smooth(age,0,windup*.95);
    geometry.band(24,thawThunderBrush.mist,gathering*1.16,(u,p,w)=>{
      const along=u*reach;
      const arch=Math.sin(u*Math.PI);
      const shift=arch*sinRidge(u,event.id)*.28;
      p.set(lerp(event.mist.x,from.x,along)+front.fz*shift,
        lerp(event.mist.y,from.y,along)+.30+arch*.64*motion,
        lerp(event.mist.z,from.z,along)-front.fx*shift);
      const width=.25+arch*.51;
      w.set(front.fz*width,.17*arch,-front.fx*width);
    });
  }
  for(const bank of [-1,1])geometry.band(17,thawThunderBrush.rain,launch*.74*fade(age,windup+.09,windup+.26),(u,p,w)=>{
    const arc=Math.sin(u*Math.PI);
    const shift=bank*(.62+.95*arc)*(1-u*.67);
    p.set(from.x+front.fz*shift,from.y+.24+u*(1.4+1.80*motion),from.z-front.fx*shift);
    const width=.24+.34*arc;
    w.set(front.fz*width,.27*arc,-front.fx*width);
  });
  const end=hitAt===undefined?.93:1;
  const retreat=hitAt===undefined?0:smooth(time-hitAt,.043,.20)*.21*motion;
  const progress=clamp((Math.min(time,event.cancelledAt??time)-at-windup)/travel,0,1)*end-retreat;
  const bolt=launch*smooth(age,windup,windup+.044)*
    (hitAt===undefined?fade(age,lifetime+.02,lifetime+.22):fade(time-hitAt,.031,.165));
  if(progress>.025)paintThawThunderBolt(geometry,front,progress,bolt,clamp(front.width*.082,.34,.75),event.id*.81,motion);
  paintThawThunderLanding(geometry,front,time,motion);
}

function paintGaleSporeOrigin(geometry,event,age,motion) {
  const {front,hostPath,carrierFrom}=event;
  const {from,fx,fz}=front;
  const seed=event.seedId??event.id;
  const lift=smooth(age,0,.16);
  const burst=smooth(age,-.009,.035)*fade(age,.17,.40);
  if(carrierFrom) {
    const drag={from:carrierFrom,to:from,path:hostPath};
    geometry.band(22,galeSporeBrush.capsule,burst*.79,(u,p,w)=>{
      const curl=Math.sin(Math.PI*u);
      track(drag,u,p);
      p.y+=.49+.37*curl+u*.44;
      w.copy(geometry.cameraRight).multiplyScalar(.19+.31*curl+u*.15);
      w.y+=.11*curl;
      return .40+.60*u;
    });
  }
  // Keep the bloom high enough to read over its carrier. It stays pinned to
  // the actual point and twists backward as the low poison front departs.
  const stem=burst*(1-smooth(age,.16,.36)*.32);
  for(const hand of [-1,1])geometry.band(24,galeSporeBrush.stem,stem*(hand>0?1.10:.70),(u,p,w)=>{
    const curl=Math.sin(Math.PI*u);
    const taper=1-u*.68;
    const bend=hand*(.2+1.33*curl)*lift+.13*sinRidge(u,seed+hand*2.41);
    const retreat=(lift*.74+.15)*u*u;
    p.set(from.x+fz*bend-fx*retreat-geometry.eye.x*.33,
      from.y+.25+u*(2.23+lift*2.02)*motion,
      from.z-fx*bend-fz*retreat-geometry.eye.z*.33);
    w.copy(geometry.cameraRight).multiplyScalar((.27+.42*curl)*taper);
    w.y+=.15*curl;
  });
  for(const bank of [-1,1])geometry.band(26,galeSporeBrush.seed,burst*(bank>0?1.17:.76),(u,p,w)=>{
    const angle=bank*1.63+u*4.25+seed*.055;
    const radius=(.68+lift*1.90)*(.68+.28*Math.sin(Math.PI*u)+.09*sinRidge(u,seed));
    const x=Math.cos(angle), z=Math.sin(angle);
    p.set(from.x+x*radius+fx*u*.52,from.y+.37+lift*(.17+.73*u)*motion,from.z+z*radius+fz*u*.52);
    const width=(.29+.57*Math.sin(Math.PI*u))*(.59+.41*lift);
    w.set(x*width,.47*width,z*width);
  });
}

function paintGaleSporeCarry(geometry,event,time,reducedMotion) {
  if(event.hostPath.length<2)return;
  const age=time-event.at;
  const active=fade(time,event.updatedAt+.12,event.updatedAt+.28);
  const opening=smooth(age,-.017,.027)*active;
  const from=event.hostPath[0];
  const to=event.hostPath.at(-1);
  const trail={from,to,path:event.hostPath};
  geometry.band(24,galeSporeBrush.capsule,opening*.84,(u,p,w)=>{
    track(trail,u,p);
    p.y+=.40+u*.90;
    w.copy(geometry.cameraRight).multiplyScalar(lerp(.16,.46,u));
    w.y+=u*.14;
    return .36+.64*u;
  });
  const motion=reducedMotion?.48:1;
  geometry.band(33,galeSporeBrush.capsule,opening*1.11,(u,p,w)=>{
    const theta=u*Math.PI*1.83+event.seedId*.33+age*7.3*motion;
    const x=Math.cos(theta), z=Math.sin(theta);
    const curve=Math.sin(u*Math.PI);
    const radius=1.39+.19*sinRidge(u,event.seedId);
    p.set(to.x+x*radius,to.y+.47+u*1.26+curve*.51*motion,to.z+z*radius);
    const width=.21+.36*curve;
    w.set(x*width,width*.85,z*width);
  });
  // A wax-edged seed head rises from the live collar at the recorded host,
  // giving the eye something opaque to follow before the burst.
  geometry.band(19,galeSporeBrush.stem,opening,(u,p,w)=>{
    const curve=Math.sin(Math.PI*u);
    const sway=.22*sinRidge(u,event.seedId)*motion;
    p.set(to.x+geometry.cameraRight.x*sway,to.y+.76+u*1.74,to.z+geometry.cameraRight.z*sway);
    w.copy(geometry.cameraRight).multiplyScalar(.11+.44*curve*curve);
  });
}

function paintGaleSporeHold(geometry,event,time,reducedMotion) {
  const {at,from,duration,releasedAt}=event;
  const age=time-at;
  const draw=smooth(age,.13,.36)*fade(age,duration-.26,duration)*
    (releasedAt===undefined?1:fade(time,releasedAt,releasedAt+.19));
  const motion=reducedMotion?.46:1;
  const seed=event.seedId??event.id;
  for(const side of [-1,1])geometry.band(25,galeSporeBrush.trace,draw*(side>0?.86:.53),(u,p,w)=>{
    const curve=Math.sin(u*Math.PI);
    const angle=side*2.9+u*3.65+seed*.16+age*.86*motion;
    const x=Math.cos(angle),z=Math.sin(angle);
    const radius=event.width*(.42+curve*.32+.06*sinRidge(u,seed));
    p.set(from.x+x*radius,from.y+.18+.38*u+.35*curve*motion,from.z+z*radius);
    const width=.16+.29*curve;
    w.set(x*width,.33*width,z*width);
  });
}

function paintGaleSporeDraw(geometry,event,age,motion) {
  const {front}=event;
  const {from,fx,fz,length,travel}=front;
  const extension=smooth(age,0,Math.min(.22,travel*.35));
  const draw=smooth(age,-.02,.025)*fade(age,.19,.35);
  for(const bank of [-1,1])geometry.band(25,galeSporeBrush.curl,draw*(bank>0?1.13:.74),(u,p,w)=>{
    const belly=Math.sin(u*Math.PI);
    const twist=(u-.5)*Math.PI*1.25;
    const reach=Math.min(length*.30,3.8)*extension*u*u;
    const side=bank*(.28+1.15*belly)*(1-u*.66)*Math.cos(twist);
    p.set(from.x+fx*reach+fz*side,from.y+.22+belly*(.43+.52*extension*motion),from.z+fz*reach-fx*side);
    const width=.16+.44*belly;
    w.set(fz*width,.45*width,-fx*width);
  });
}

function paintGaleSporeRoll(geometry,front,head,alpha,seed,floorAt,motion) {
  const {fx,fz,width,length}=front;
  const tail=Math.max(0,head-Math.min(.68,11.8/length));
  if(head-tail<.013)return;
  const pulse=smooth(head,.03,.42);
  for(const bank of [-1,1])geometry.band(30,galeSporeBrush.wake,alpha*(bank<0?.68:.95),(u,p,w)=>{
    const curve=Math.sin(u*Math.PI*.88);
    const side=bank*width*(.12+.34*curve)*(1-.28*u);
    track(front,lerp(tail,head,u),p);
    const x=p.x+fz*side, z=p.z-fx*side;
    p.set(x,Math.max(p.y-.65,(floorAt?.(x,z)??-Infinity)+.09)+.20+.78*u*u*motion,z);
    const spine=width*(.13+.29*curve)*(.55+.45*pulse);
    w.set(fz*spine,.38*curve*spine,-fx*spine);
    return .32+.68*u;
  });
  const top=point(track(front,head,geometry.track));
  const breadth=width*(.42+.58*pulse);
  geometry.band(44,galeSporeBrush.roll,alpha*(.87+.26*pulse),(u,p,w)=>{
    const wave=Math.sin(u*Math.PI);
    const lip=.32*sinRidge(u,seed)+.14*Math.sin(u*41.);
    const side=(2*u-1)*breadth;
    const push=width*(-.30+.41*wave)+lip;
    const x=top.x+fz*side+fx*push, z=top.z-fx*side+fz*push;
    const floor=Math.max(top.y-.52,(floorAt?.(x,z)??-Infinity)+.10);
    p.set(x,floor+.14+(.36+2.0*wave)*pulse*motion+lip*.42,z);
    const opening=.31+wave*(1.04+.62*pulse);
    w.set(fx*opening,.47*opening*motion,fz*opening);
    return .44+.56*wave;
  });
}

function paintGaleSplitRill(geometry,event,tip,alpha,floorAt) {
  const {front,id,leg}=event;
  const {fx,fz,length}=front;
  if(tip<.024)return;
  geometry.band(26,galeSplitBrush.rill,alpha,(u,p,w)=>{
    const belly=Math.sin(Math.PI*u);
    const ripple=.15*sinRidge(u,id+leg);
    const side=(leg===4 ? 1 : -1)*(.37+.74*belly)+ripple;
    track(front,u*tip,p);
    const x=p.x+fz*side,z=p.z-fx*side;
    p.set(x,Math.max(p.y,(floorAt?.(x,z)??-Infinity)+.08)+.24+.29*belly,z);
    const width=(.12+Math.min(17,length)*.012)*(1+.64*belly);
    w.set(fz*width,.24*width,-fx*width);
    return .29+.71*belly;
  });
}

function paintGaleSplitSource(geometry,event,age,motion) {
  const {front}=event;
  const {from,fx,fz}=front;
  const opening=smooth(age,-.014,.040)*fade(age,.16,.46);
  const rise=smooth(age,0,.18);
  geometry.band(26,galeSplitBrush.husk,opening,(u,p,w)=>{
    const curl=Math.sin(Math.PI*u);
    const off=.67*curl+.14*sinRidge(u,event.seedId??event.id);
    const drift=u*u*(.37+.73*rise);
    p.set(from.x+fz*off-fx*drift,from.y+.27+u*(1.42+1.76*rise)*motion,from.z-fx*off-fz*drift);
    w.copy(geometry.cameraRight).multiplyScalar(.15+.46*curl*curl);
    w.y+=.11*curl;
  });
}

function paintGaleSplitEndpoint(geometry,route,hits,age,motion) {
  const {fx,fz}=route;
  const scale=Math.min(6,hits.length);
  const middle=hits.reduce((out,hit)=>({x:out.x+hit.x/hits.length,y:out.y+hit.y/hits.length,z:out.z+hit.z/hits.length}),{x:0,y:0,z:0});
  const leftmost=hit=>(hit.x-middle.x)*fz-(hit.z-middle.z)*fx;
  const spread=clamp(Math.max(...hits.map(hit=>Math.abs(leftmost(hit))))+scale*.52+1.8,3.5,10.7);
  const kick=smooth(age,-.008,.041)*fade(age,.115,.33);
  const open=smooth(age,.02,.20);
  for(const bank of [-1,1])geometry.band(35,bank>0?galeSplitBrush.sweep:galeSplitBrush.turn,
    kick*(bank>0?1.23:.85),(u,p,w)=>{
      const arc=Math.sin(Math.PI*u);
      const side=(2*u-1)*spread*(.72+.28*open);
      const depth=.60+(1.05+open*1.62)*arc+bank*.49;
      const behind=.88+bank*.22+open*.65;
      const ear=arc*(.26+(bank>0?1.95:.73)*open)*motion;
      p.set(middle.x+fz*side+fx*depth-geometry.eye.x*behind,middle.y-.25+ear,
        middle.z-fx*side+fz*depth-geometry.eye.z*behind);
      const width=.28+arc*(bank>0?1.28:.67);
      w.set(fx*width,.41*width*motion,fz*width);
    });
}

function paintGaleSplitLanding(geometry,event,time,motion) {
  const {firstLeg,settledAt}=event;
  if(!firstLeg||settledAt===undefined||event.cancelledAt!==undefined||firstLeg.cancelledAt!==undefined)return;
  const age=time-settledAt;
  if(age<0||age>.40)return;
  const left=firstLeg.hits.filter(hit=>hit.killed&&hit.at<=time);
  const right=event.hits.filter(hit=>hit.killed&&hit.at<=time);
  if(left.length<2||right.length<2)return;
  // The earlier endpoint sheds another visible rake from its own spent ink.
  // Only the live second receipt can trigger this short two-sided finish.
  paintGaleSplitEndpoint(geometry,firstLeg.front,left,age-.058,motion);
  paintGaleSplitEndpoint(geometry,event.front,right,age,motion);
}

function paintGaleSporeContacts(geometry,event,time,motion) {
  const first=event.hits[0];
  if(!first)return;
  const age=time-first.at;
  const {fx,fz}=event.front;
  const spread=smooth(age,.018,.20);
  const pooling=smooth(age,-.019,.076)*fade(age,.16,.48);
  const contour=event.hits.filter(hit=>hit.at<=time&&Math.hypot(hit.x-first.x,hit.y-first.y,hit.z-first.z)<14);
  if(contour.length>=2&&pooling>.019) {
    const lateral=hit=>hit.x*fz-hit.z*fx;
    const ordered=contour.toSorted((left,right)=>lateral(left)-lateral(right));
    const span=clamp(lateral(ordered.at(-1))-lateral(ordered[0]),1.2,10);
    geometry.band(34,galeSporeBrush.pool,pooling*1.07,(u,p,w)=>{
      const sample=u*(ordered.length-1), a=ordered[Math.floor(sample)], b=ordered[Math.ceil(sample)];
      const t=sample%1;
      const scallop=Math.sin(Math.PI*u);
      const edge=(2*u-1)**3*(.58+.21*span*spread);
      const recoil=.26+spread*.84+.10*sinRidge(u,event.id);
      p.set(lerp(a.x,b.x,t)+edge*fz-geometry.eye.x*recoil,
        lerp(a.y,b.y,t)-.13+(.26+.58*spread)*scallop*motion,
        lerp(a.z,b.z,t)-edge*fx-geometry.eye.z*recoil);
      const width=.32+scallop*(1.42+.37*spread);
      w.set(fx*width,.45*width,fz*width);
    });
    if(event.firstLeg?.hits.filter(hit=>hit.killed).length>=2&&contour.filter(hit=>hit.killed).length>=2&&
      event.firstLeg.cancelledAt===undefined) {
      // The heavy finishing brush only belongs to a second real cluster.
      // Keep its core behind the actual silhouettes and leave the center clear.
      const burst=smooth(age,-.006,.043)*fade(age,.10,.30);
      const weight=contour.filter(hit=>hit.killed).length;
      for(const bank of [-1,1])geometry.band(23,galeSporeBrush.curl,burst*(bank>0?1.15:.72),(u,p,w)=>{
        const sample=u*(ordered.length-1), a=ordered[Math.floor(sample)], b=ordered[Math.ceil(sample)];
        const t=sample%1;
        const curl=Math.sin(Math.PI*u);
        const extension=(2*u-1)**3*(1.1+.22*span*spread);
        const recoil=1.02+.51*bank+.73*spread;
        const fold=(.73+bank*.19)*curl*(1+.26*Math.min(8,weight))*motion;
        p.set(lerp(a.x,b.x,t)+extension*fz-geometry.eye.x*recoil,
          lerp(a.y,b.y,t)-.27+fold,
          lerp(a.z,b.z,t)-extension*fx-geometry.eye.z*recoil);
        const width=.25+.58*curl;
        w.set(fx*width,.38*width,fz*width);
      });
    }
  }
  for(const hit of event.hits.slice(0,10)) {
    const elapsed=time-hit.at;
    const weight=smooth(elapsed,-.012,.040)*fade(elapsed,.12,.36)*(hit.killed?1.06:.68);
    const radius=clamp(hit.radius??.74,.42,2.1);
    const fadeOut=smooth(elapsed,.012,.27)*motion;
    geometry.band(16,galeSporeBrush.seed,weight,(u,p,w)=>{
      const curl=Math.sin(Math.PI*u);
      const twist=u*4.44+hit.id*.19;
      const push=radius*(.69+fadeOut*1.42);
      const x=Math.cos(twist), z=Math.sin(twist);
      p.set(hit.x+x*push-geometry.eye.x*.44,hit.y-.08+curl*(.22+fadeOut*.74),hit.z+z*push-geometry.eye.z*.44);
      const width=radius*(.27+.51*curl);
      w.set(x*width,.43*curl*width,z*width);
    });
  }
}

function paintGaleSpore(geometry,event,time,floorAt,reducedMotion) {
  const {at,front,settledAt,cancelledAt}=event;
  const age=time-at;
  if(age<0)return;
  const motion=reducedMotion?.56:1;
  const end=settledAt??at+front.travel;
  const elapsed=Math.min(time,cancelledAt??time)-at;
  const tip=clamp(elapsed/front.travel,0,1);
  const release=cancelledAt===undefined?fade(time,end+.02,end+.26):fade(time,cancelledAt,cancelledAt+.17);
  const alpha=smooth(age,.016,.10)*release;
  if(event.leg===4) {
    paintGaleSporeDraw(geometry,event,age,motion);
    if(event.firstLeg) {
      paintGaleSplitSource(geometry,event,age,motion);
      paintGaleSplitRill(geometry,event,tip,alpha*1.05,floorAt);
      const firstAge=time-event.firstLeg.at;
      const firstTip=clamp(firstAge/event.firstLeg.front.travel,0,1);
      const firstLife=event.firstLeg.settledAt??(event.firstLeg.at+event.firstLeg.front.travel);
      if(event.firstLeg.cancelledAt===undefined)paintGaleSplitRill(geometry,event.firstLeg,firstTip,
        smooth(age,.014,.09)*fade(time,firstLife+.05,firstLife+.31)*.93,floorAt);
    }
  }
  else paintGaleSporeOrigin(geometry,event,age,motion);
  paintGaleSporeRoll(geometry,front,tip,alpha,event.seedId??event.id,floorAt,motion);
  if(event.leg===4)paintGaleSplitLanding(geometry,event,time,motion);
  paintGaleSporeContacts(geometry,event,time,motion);
}

function recordGaleSporeHit(front,target,time) {
  const id=target.targetId??target.id;
  const at=validPoint(target.to)?target.to:target;
  if(!validPoint(at)||!Number.isFinite(id)||front.hits.length>=14||front.hits.some(hit=>hit.id===id))return;
  front.hits.push({...point(at),id,at:time,radius:target.targetRadius??target.radius,killed:target.killed===true});
}

class DragonArtHeroBeats {
  constructor() {
    this.geometry=new HeroGeometry();
    this.root=this.geometry.root;
    this.frostSources=new Set();
    this.reset();
  }

  reset() {
    this.beats=[];
    this.massClears=[];
    this.fronts=[];
    this.abyssMouths=[];
    this.outlets=[];
    this.imprints=[];
    this.rainTurns=[];
    this.root.visible=false;
  }

  event(event,time,marks) {
    const {type,kind}=event;
    if(type==='dragonArtMajorClear') {
      const clear=fitMassClear(event,time);
      if(clear) {
        this.massClears.push(clear);
        if(this.massClears.length>2)this.massClears.shift();
      }
      return;
    }
    if(type==='cascadePulse'&&event.detail==='gale-spore-carry'&&Number.isFinite(event.seedId)) {
      const samples=(event.hostPath??[event.from,event.to]).filter(validPoint);
      if(samples.length<2)return;
      const carrier=this.fronts.findLast(front=>front.reaction==='gale-spore-carry'&&front.seedId===event.seedId);
      if(carrier) {
        carrier.hostPath=samples;
        carrier.updatedAt=time;
      } else {
        this.fronts.push({...event,reaction:'gale-spore-carry',at:time,updatedAt:time,hostPath:samples});
        if(this.fronts.length>7)this.fronts.shift();
      }
      return;
    }
    if(type==='techniqueArtBloom'&&kind==='sporeseed') {
      this.fronts=this.fronts.filter(front=>front.reaction!=='gale-spore-carry'||front.seedId!==event.id);
    }
    if(type==='cascadePulse'&&event.detail==='gale-spore-hold') {
      const same=front=>front.reaction==='gale-spore-hold'&&front.id===event.id&&front.seedId===event.seedId;
      const hold=this.fronts.findLast(same);
      if(event.preparing===false&&hold)hold.releasedAt??=time;
      else if(event.preparing===true&&!hold&&validPoint(event.from??event.to)) {
        const firstLeg=this.fronts.findLast(front=>front.reaction==='gale-spore-front'&&front.id===event.id&&
          front.leg===3&&front.seedId===event.seedId);
        this.fronts.push({...event,reaction:'gale-spore-hold',from:point(event.from??event.to),at:time,
          duration:clamp(event.duration??1.55,.4,1.8),width:clamp(event.radius??2.4,1.6,3.2),firstLeg});
        if(this.fronts.length>7)this.fronts.shift();
      }
      return;
    }
    if(type==='cascadePulse'&&event.detail==='gale-spore-front') {
      const same=front=>front.reaction==='gale-spore-front'&&front.id===event.id&&front.leg===event.leg;
      if(event.preparing===false) {
        const entry=this.fronts.findLast(same);
        if(!entry)return;
        entry.settledAt=time;
        if(event.cancelled||event.canceled)entry.cancelledAt=time;
        const received=new Set(event.receiverIds??[]);
        for(const target of event.targets??[]) {
          if(received.has(target.targetId??target.id))recordGaleSporeHit(entry,target,time);
        }
      } else if(event.preparing===true&&validPoint(event.from)&&validPoint(event.to)&&!this.fronts.some(same)) {
        const front=setupFront({...event,travel:event.travelTime??event.duration});
        if(!front||!(front.travel>0))return;
        front.path=(event.points??[]).filter(validPoint);
        const hostPath=(event.hostPath??[]).filter(validPoint);
        const carrierFrom=validPoint(event.carrierFrom)?event.carrierFrom:hostPath[0];
        let firstLeg;
        if(event.leg===4) {
          const hold=this.fronts.findLast(item=>item.reaction==='gale-spore-hold'&&item.id===event.id&&item.seedId===event.seedId);
          if(hold)hold.releasedAt??=time;
          firstLeg=hold?.firstLeg??this.fronts.findLast(item=>item.reaction==='gale-spore-front'&&item.id===event.id&&
            item.leg===3&&item.seedId===event.seedId);
        }
        this.fronts.push({...event,reaction:'gale-spore-front',at:time,front,hostPath,carrierFrom,firstLeg,hits:[]});
        if(this.fronts.length>7)this.fronts.shift();
      }
      return;
    }
    if(type==='cascadeHit'&&event.detail==='gale-spore-hit') {
      const entry=this.fronts.findLast(front=>front.reaction==='gale-spore-front'&&front.id===event.id&&front.leg===event.leg);
      if(entry)recordGaleSporeHit(entry,event,time);
      return;
    }
    if(type==='dragonArtReaction'&&event.reaction==='thaw-thunder-store'&&validPoint(event.from??event)) {
      const mist=point(event.from??event);
      this.fronts.push({...event,mist,at:time});
      if(this.fronts.length>7)this.fronts.shift();
      return;
    }
    if(type==='dragonArtReaction'&&(event.reaction==='thaw-thunder-release'||event.reaction==='thaw-thunder-cancel')) {
      const mist=this.fronts.findLast(front=>front.id===event.id&&front.reaction==='thaw-thunder-store');
      if(!mist)return;
      if(event.reaction==='thaw-thunder-cancel')mist.cancelledAt=time;
      else if(validPoint(event.from)&&validPoint(event.to)) {
        const route=setupFront(event);
        if(route)mist.release={...route,id:event.id,at:time,hits:[]};
      }
      return;
    }
    if(type==='cascadeHit'&&event.detail==='thaw-thunder-hit') {
      const route=this.fronts.findLast(front=>front.id===event.artId&&front.reaction==='thaw-thunder-store')?.release;
      const target=validPoint(event.to)?event.to:event;
      if(route&&validPoint(target)&&route.hits.length<18&&event.targetId!==undefined&&!route.hits.some(hit=>hit.id===event.targetId)) {
        route.hits.push({...point(target),id:event.targetId,radius:event.targetRadius,killed:event.killed,at:time});
      }
      return;
    }
    if(type==='dragonArtReaction'&&event.reaction==='abyss-mouth-gather') {
      const mouth=event.to??event;
      const targets=abyssMouthTargets(event.targets);
      if(!validPoint(mouth)||!targets.length)return;
      const leg=event.leg??1;
      const extent=Math.max(...targets.map(target=>Math.hypot(target.x-mouth.x,target.z-mouth.z)));
      this.abyssMouths.push({id:event.id,leg,mouth:point(mouth),targets,intakes:[],at:time,
        travel:clamp(event.travel??.27,.12,.55),size:clamp(.94+targets.length*.115+extent*.16,1.42,3.40)});
      if(this.abyssMouths.length>5)this.abyssMouths.shift();
      return;
    }
    if(type==='dragonArtReaction'&&(event.reaction==='abyss-mouth-fold'||event.reaction==='abyss-mouth-cancel')) {
      const mouth=this.abyssMouths.findLast(entry=>entry.id===event.id&&entry.leg===(event.leg??1));
      if(!mouth)return;
      if(event.reaction==='abyss-mouth-cancel')mouth.cancelledAt??=time;
      else {
        mouth.closedAt??=time;
        for(const target of abyssMouthTargets(event.targets)) {
          if(mouth.intakes.length===10)break;
          if(!mouth.intakes.some(intake=>intake.id===target.id))mouth.intakes.push(target);
        }
      }
      return;
    }
    if(type==='dragonArtImpact'&&kind==='abyss'&&event.absorbed&&event.amount>0&&validPoint(event)) {
      const origin=validPoint(event.mouth)?event.mouth:event.from;
      const mouth=this.abyssMouths.findLast(entry=>entry.id===event.id&&(event.leg!==undefined
        ?entry.leg===event.leg:validPoint(origin)&&belongsToAbyssMouth(entry.mouth,origin)));
      if(mouth&&mouth.intakes.length<10&&!mouth.intakes.some(target=>target.id===event.targetId)) {
        mouth.intakes.push({...point(event),id:event.targetId,radius:event.targetRadius});
      }
    }
    if(type==='dragonArtReaction'&&event.reaction==='stone-contour-hold'&&validPoint(event)) {
      this.fronts.push({...event,at:time});
      if(this.fronts.length>7)this.fronts.shift();
      return;
    }
    if(type==='dragonArtReaction'&&event.reaction==='stone-contour-cancel') {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='stone-contour'&&
        (event.leg===undefined||entry.leg===event.leg));
      if(front)front.cancelledAt=time;
      return;
    }
    if(type==='dragonArtImpact'&&event.impact==='stone-contour'&&event.amount>0&&validPoint(event)) {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='stone-contour'&&
        (event.leg===undefined||entry.leg===event.leg));
      if(front&&front.impacts.length<9&&!front.impacts.some(hit=>hit.targetId===event.targetId)) {
        front.impacts.push({...point(event),at:time,from:validPoint(event.from)?event.from:front.from,
          radius:event.targetRadius,targetId:event.targetId,killed:event.killed});
      }
    }
    if((type==='dragonArtReaction'&&(event.reaction==='frost-temper-rush-hit'||event.reaction==='frost-temper-rush-cancel'))||
        type==='dragonArtImpact'&&event.impact==='frost-temper-rush') {
      const rush=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='frost-temper-rush'&&
        (entry.leg??0)===(event.leg??0));
      if(!rush||rush.cancelledAt!==undefined)return;
      if(event.reaction==='frost-temper-rush-cancel')rush.cancelledAt=time;
      else if(event.reaction==='frost-temper-rush-hit') {
        const received=new Set(event.receiverIds??[]);
        for(const target of frostSheetTargets(event.targets,rush.formation==='thaw-flank'?24:12)) {
          if(received.has(target.id))rememberTemperHit(rush,target,time);
        }
      } else if(event.amount>0&&validPoint(event)) {
        rememberTemperHit(rush,{...point(event),id:event.targetId,radius:event.targetRadius,killed:event.killed},time);
      }
      return;
    }
    if(type==='dragonArtReaction'&&event.reaction==='frost-sheet-shatter') {
      const sheet=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='frost-sheet'&&
        (event.leg===undefined||entry.leg===event.leg));
      const targets=frostSheetTargets(event.targets);
      if(!sheet||!targets.length&&!sheet.breakTargets.length)return;
      sheet.breakAt??=time;
      for(const target of targets) {
        if(sheet.breakTargets.length===12)break;
        if(!sheet.breakTargets.some(hit=>hit.id===target.id))sheet.breakTargets.push(target);
      }
      return;
    }
    if(type==='dragonArtImpact'&&event.impact==='frost-sheet-shatter'&&event.amount>0) {
      const sheet=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='frost-sheet'&&
        (event.leg===undefined||entry.leg===event.leg));
      if(sheet&&validPoint(event)&&sheet.breakTargets.length<12&&
        !sheet.breakTargets.some(hit=>hit.id===event.targetId)) {
        sheet.breakAt??=time;
        sheet.breakTargets.push({...point(event),id:event.targetId,radius:event.targetRadius,killed:event.killed});
      }
      return;
    }
    if(type==='dragonArtReaction'&&(event.reaction==='rift-wind-seam-bind'||event.reaction==='rift-wind-seam-close'||
        event.reaction==='rift-wind-seam-cancel')) {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='rift-wind-seam'&&
        (event.leg===undefined||entry.leg===event.leg));
      if(!front)return;
      if(event.reaction==='rift-wind-seam-bind') {
        if(front.binds.length<6&&event.from&&event.to) {
          front.binds.push({from:event.from,to:event.to,path:event.via?[event.from,event.via,event.to]:undefined,
            at:time,travel:clamp(event.travel??event.duration??.20,.08,.48)});
        }
      } else {
        front.closeAt=time;
        front.closePoint=event.to??front.to;
      }
      return;
    }
    if(type==='dragonArtReaction'&&event.reaction==='beam-quench-runoff-cancel') {
      const runoff=this.fronts.findLast(front=>front.reaction==='beam-quench-runoff'&&
        front.id===event.id&&front.carrierId===event.carrierId&&front.laneId===event.laneId);
      if(runoff)runoff.cancelledAt=time;
      return;
    }
    if(type==='dragonArtImpact'&&event.killed&&event.from&&deathImpression.routes.has(event.impact)){
      const family=event.impact==='abyss-steamwake'?'steam':kind;
      const same=this.imprints.find(hit=>hit.id===event.id&&hit.route===event.impact&&time-hit.at<.16&&
        Math.hypot(hit.x-event.x,(hit.y-event.y)*1.4,hit.z-event.z)<2.05);
      if(same) {
        const part=1/++same.count;
        same.x=lerp(same.x,event.x,part);
        same.y=lerp(same.y,event.y,part);
        same.z=lerp(same.z,event.z,part);
      } else {
        this.imprints.push({...point(event),id:event.id,route:event.impact,kind:family,from:event.from,
          radius:event.targetRadius??.73,at:time,count:1});
        if(this.imprints.length>18)this.imprints.shift();
      }
    }
    if(kind==='windkite'&&type==='techniqueArtRelease'&&event.secondary==='kite-downpour'&&event.from&&event.via&&event.to) {
      this.rainTurns.push({...event,at:time});
      if(this.rainTurns.length>4)this.rainTurns.shift();
      return;
    }
    if(type==='dragonArtReaction'&&event.reaction==='abyss-condense') {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='abyss-steamwake');
      if(front) {
        front.condensedAt=time-front.at;
        front.transition=point(event.transition??event);
      }
      return;
    }
    if(type==='dragonArtReaction'&&(event.reaction==='rift-seam-bind'||event.reaction==='rift-seam-close')) {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='rift-seam');
      if(!front) return;
      if(event.reaction==='rift-seam-close') {
        front.closeAt=time;
        front.delivered=event.capturedIds??event.receiverIds??[];
        for (const bind of front.binds) {
          if(front.delivered.includes(bind.targetId)) bind.trace.push({...point(event.to??front.to),at:time});
        }
      } else if(front.binds.length<9&&event.from) {
        front.binds.push({targetId:event.targetId,trace:[{...point(event.from),at:time}]});
      }
      return;
    }
    if(kind==='abyss'&&((type==='dragonArtReaction'&&event.reaction==='abyss-transfer')||
        (type==='dragonArtPhase'&&event.phase==='echo'&&event.echoPhase!=='collapse'))) {
      const from=event.from??event.echoFrom;
      const to=event.to??event.echoTo??event.echoCenter;
      if(!from||!to)return;
      const existing=this.fronts.find(front=>front.id===event.id&&front.reaction==='abyss-transfer');
      if(existing&&type==='dragonArtPhase')return;
      const entry={...event,from,to,reaction:'abyss-transfer',width:event.width??event.echoRadius,
        at:existing?.at??time,duration:type==='dragonArtPhase'?.58:event.duration??.58,
        travel:event.travel??.22,binds:existing?.binds??[]};
      if(existing)Object.assign(existing,entry);
      else this.fronts.push(entry);
      if(this.fronts.length>7)this.fronts.shift();
      return;
    }
    if(kind==='abyss'&&(event.reaction==='abyss-transfer-bind'||event.phase==='echo'&&event.echoPhase==='collapse'&&type==='dragonArtPhase')) {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='abyss-transfer');
      if(!front)return;
      if(event.reaction==='abyss-transfer-bind'&&front.binds.length<8) {
        front.binds.push({targetId:event.targetId,to:event.to??front.to,at:time,duration:event.travel??event.duration??.24});
      } else if(type==='dragonArtPhase') {
        front.collapsedAt=time;

      }
      return;
    }
    if(type==='dragonArtReaction'&&kinds[event.reaction]&&event.from&&event.to) {
      const entry={...event,kind:kinds[event.reaction],at:time};
      if(event.reaction==='stone-contour') {
        entry.front=setupFront(entry);
        if(!entry.front||!(entry.front.travel>0))return;
        entry.impacts=[];
      }
      if(event.reaction==='frost-sheet') {
        if(!(event.receiverIds?.length||event.targets?.length))return;
        entry.front=frostSheetPath(event);
        if(!entry.front)return;
        entry.targets=frostSheetTargets(event.targets);
        entry.breakTargets=[];
      }
      if(event.reaction==='frost-temper-rush') {
        entry.front=frostSheetPath(event);
        if(!entry.front||!(entry.front.travel>0))return;
        entry.front.settle=entry.formation==='thaw-flank'?clamp(event.settle??.17,.01,.55):0;
        const sourceIds=new Set(event.sourceIds??[]);
        entry.sources=frostSheetTargets(event.sources??event.sourcePoints??event.targets?.filter(target=>
          sourceIds.has(target.id??target.targetId))).slice(0,5);
        entry.hits=[];
      }
      if(event.reaction==='rift-seam')entry.binds=[];
      if(event.reaction==='rift-clash'||event.reaction==='beam-quench')entry.impacts=[];
      if(event.reaction==='rift-wind-seam') {
        entry.front=setupFront(entry);
        if(!entry.front)return;
        entry.binds=[];
        entry.impacts=[];
      }
      if(event.reaction==='beam-intercept') {
        entry.front=setupFront(entry);
        if(!entry.front)return;
        entry.impacts=[];
      }
      if(event.reaction==='beam-quench-runoff') {
        entry.travel=event.travel??event.duration;
        entry.front=setupFront(entry);
        if(!entry.front||!(entry.travel>0))return;
      }
      const existing=event.redirected&&Number.isFinite(event.leg)
        ?this.fronts.findIndex(front=>front.id===event.id&&front.leg===event.leg):-1;
      if(existing>=0)this.fronts[existing]=entry;
      else this.fronts.push(entry);
      if(this.fronts.length>7)this.fronts.shift();
      return;
    }
    if(type==='dragonArtImpact'&&event.impact==='rift-clash') {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='rift-clash');
      if(front&&front.impacts.length<9)front.impacts.push({...point(event),at:time});
      return;
    }
    if(type==='dragonArtImpact'&&event.impact==='rift-wind-seam'&&event.amount>0) {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='rift-wind-seam'&&
        (event.leg===undefined||entry.leg===event.leg));
      if(front) {
        front.impactAt??=time;
        if(front.impacts.length<9)front.impacts.push({...point(event),at:time,radius:event.targetRadius,killed:event.killed});
      }
      return;
    }
    if(type==='dragonArtImpact'&&event.impact==='beam-quench') {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.leg===event.leg&&entry.reaction==='beam-quench');
      if(front&&front.impacts.length<9)front.impacts.push({...point(event),at:time,killed:event.killed});
      return;
    }
    if(type==='dragonArtImpact'&&event.impact==='beam-crosscut'&&event.interception&&event.killed) {
      const front=this.fronts.findLast(entry=>entry.id===event.id&&entry.reaction==='beam-intercept');
      if(front&&front.impacts.length<10)front.impacts.push({...point(event),at:time,
        radius:event.targetRadius,targetId:event.targetId});
      return;
    }
    if(type==='dragonArtImpact'&&(event.impact==='abyss-steamwake'||event.impact==='abyss-undertow')&&event.amount>0) {
      const {x,y,z,id,from}=event;
      const hot=event.impact==='abyss-steamwake';
      const mouth=this.fronts.find(front=>front.id===id && front.reaction===event.impact)?.from??from;
      const dx=x-(mouth?.x??x),dz=z-(mouth?.z??z);
      const span=Math.hypot(dx,dz)||1;
      const pocket=this.outlets.find(impact=>impact.id===id&&hot===impact.hot&&time-impact.at<.13&&
        Math.hypot(x-impact.x,(y-impact.y)*1.55,z-impact.z)<5.0);
      if(pocket) {
        const drift=1/++pocket.count;
        pocket.x+=drift*(x-pocket.x);
        pocket.y+=drift*(y-pocket.y);
        pocket.z+=drift*(z-pocket.z);
        pocket.kills+=Number(event.killed);
      } else {
        this.outlets.push({id,x,y,z,fx:dx/span,fz:dz/span,hot,at:time,count:1,kills:Number(event.killed)});
        if(this.outlets.length>7)this.outlets.shift();
      }
      return;
    }
    if(type!=='dragonArtBreak'||!LIFE[kind]||kind==='abyss'&&!event.absorbed)return;
    const targets=event.targets?.length ? event.targets : marks.filter(mark=>
      mark.id===event.id&&mark.killed&&time-mark.at<.26&&Boolean(mark.absorbed)===Boolean(event.absorbed)).slice(-8).map(mark=>({
        ...mark,id:mark.targetId,mouth:mark.absorbed?point(mark.from):null,
      }));
    const mouths=[];
    if(kind==='abyss') {
      for (const candidate of targets.map(target=>target.mouth).filter(Boolean)) {
        if(mouths.every(mouth=>Math.hypot(mouth.x-candidate.x,mouth.y-candidate.y,mouth.z-candidate.z)>1.5)) mouths.push(candidate);
        if(mouths.length===2)break;
      }
      if(!mouths.length)mouths.push(point(event));
    }
    const followUp=target=>marks.some(mark=>mark.id===event.id&&mark.targetId===target.id&&mark.killed&&
      deathImpression.routes.has(mark.impact));
    const groups=kind==='abyss'?[]:identifyClearGroups(targets.filter(target=>!followUp(target)));
    this.beats.push({...event,at:time,targets,mouths,groups});
    if(this.beats.length>4)this.beats.shift();
  }

  prominence(art,time) {
    let weight=0;
    for(const entry of [...this.beats,...this.fronts]) {
      if(entry.id!==art?.id||entry.reaction==='frost-thunder-fork'||entry.reaction==='beam-quench-runoff'||
        entry.reaction==='beam-intercept')continue;
      const age=time-entry.at;
      if(age<0)continue;
      const end=entry.reaction==='abyss-transfer'?entry.duration+.17:entry.travel==null?(entry.kind==='abyss'?.55:.66):(entry.windup??0)+entry.travel+.14;
      weight=Math.max(weight,smooth(age,0,.049)*fade(age,end*.56,end));
    }
    for(const mouth of this.abyssMouths) {
      if(mouth.id!==art?.id)continue;
      const end=mouth.cancelledAt??mouth.closedAt??mouth.at+mouth.travel+.20;
      weight=Math.max(weight,.88*smooth(time-mouth.at,0,.075)*fade(time,end+.06,end+.29));
    }
    return weight;
  }

  massClearFocus(castId,time) {
    const clear=this.massClears.findLast(beat=>beat.id===castId);
    if(!clear)return 0;
    const age=time-clear.at;
    return smooth(age,0,.037)*fade(age,.27,.59);
  }

  frostTemperFocus(castId,time) {
    const event=this.fronts.findLast(front=>front.reaction==='frost-temper-rush'&&front.id===castId);
    if(!event||event.cancelledAt!==undefined)return null;
    const {at,front,hits}=event;
    const age=time-at;
    const end=front.windup+front.travel+front.settle;
    const thaw=event.formation==='thaw-flank';
    const sourceWeight=smooth(age,0,.025)*fade(age,front.windup*.82,front.windup+.12);
    const advancing=smooth(age,front.windup*.50,front.windup+.075)*fade(age,end+.04,end+.24);
    let hitWeight=0, weighted=0;
    const struck={x:0,y:0,z:0};
    for(const hit of hits) {
      const elapsed=time-hit.at;
      const active=smooth(elapsed,-.012,.086)*fade(elapsed,.19,.43);
      const weight=active*(hit.killed?1:.46);
      hitWeight=Math.max(hitWeight,active);
      weighted+=weight;
      struck.x+=weight*hit.x;struck.y+=weight*hit.y;struck.z+=weight*hit.z;
    }
    // The wide second beat travels while the near ice is still resolving.
    // Its confirmed impacts, rather than the lead-in, own the strongest hush.
    const gain=Math.max(sourceWeight*.54,advancing*(thaw?.63:1),hitWeight);
    if(gain<.012)return null;
    const progress=clamp((age-front.windup)/front.travel,0,1);
    const crest=track(front,progress,this.geometry.track);
    const blend=smooth(hitWeight,.08,.55);
    const center=weighted>0?{x:lerp(crest.x,struck.x/weighted,blend),y:lerp(crest.y,struck.y/weighted,blend),
      z:lerp(crest.z,struck.z/weighted,blend)}:point(crest);
    return {id:castId,point:point(center),gain,sourceWeight,hitWeight,reach:front.width*(1+(thaw?.77:.56)*hitWeight)};
  }

  update(camera,time,depth,resolution,world,stage,art,scorch,gameTime) {
    this.beats=this.beats.filter(beat=>time-beat.at<LIFE[beat.kind]);
    this.massClears=this.massClears.filter(clear=>(clear.stage===undefined||clear.stage===stage)&&time-clear.at<massClearLife);
    this.fronts=this.fronts.filter(front=>{
      if(front.reaction==='gale-spore-carry')return (front.stage===undefined||front.stage===stage)&&time<front.updatedAt+.28;
      if(front.reaction==='gale-spore-hold')return (front.stage===undefined||front.stage===stage)&&
        time<Math.min(front.at+front.duration,(front.releasedAt??Infinity)+.19);
      if(front.reaction==='gale-spore-front')return (front.stage===undefined||front.stage===stage)&&
        time<(front.cancelledAt??Math.max(front.settledAt??-Infinity,front.at+front.front.travel))+.52;
      if(front.reaction==='stone-contour-hold')return time-front.at<(front.hold??front.duration??.38)+.14;
      if(front.reaction==='stone-contour')return time<(front.cancelledAt??front.at+front.front.windup+front.front.travel+.28)+.16;
      if(front.reaction==='thaw-thunder-store') {
        if(front.stage!==stage)return false;
        if(front.cancelledAt!==undefined)return time-front.cancelledAt<.36;
        const release=front.release;
        const end=release?Math.max(release.at+release.windup+release.travel,release.hits.at(-1)?.at??-Infinity):front.at+(front.duration??3.6);
        return time<end+.48;
      }
      if(front.reaction==='frost-sheet')return time<(front.breakAt??front.at+front.front.duration+.35)+.51;
      if(front.reaction==='frost-temper-rush')return front.cancelledAt!==undefined?time-front.cancelledAt<.15:
        time<Math.max(front.hits.at(-1)?.at??-Infinity,front.at+front.front.windup+front.front.travel+front.front.settle)
          +(front.formation==='thaw-flank'?.54:.48);
      if(front.reaction==='rift-seam') {
        return front.closeAt===undefined
          ? art?.id===front.id || time-front.at<(front.duration??1)+.23
          : time-front.closeAt<.43;
      }
      if(front.reaction==='abyss-transfer')return time-front.at<front.duration+.65;
      if(front.reaction==='beam-quench-runoff')return time<(front.cancelledAt??front.at+front.travel)+.25;
      if(front.reaction==='beam-intercept')return time-front.at<(front.duration??.58)+.43;
      if(front.reaction==='rift-wind-seam')return time<(front.closeAt??front.impactAt??front.at+Math.max(front.duration??.8,front.front.windup+front.front.travel))+.46;
      const tail=front.reaction==='abyss-steamwake'||front.reaction==='beam-quench'?.60:
        front.reaction==='stone-march'?.70:front.reaction==='rift-clash'||front.reaction==='rift-recoil'?.56:.30;
      return time-front.at<Math.max(front.duration??.8,(front.windup??0)+(front.travel??.4)+tail);
    });
    this.imprints=this.imprints.filter(hit=>time-hit.at<.70);
    this.outlets=this.outlets.filter(outlet=>time-outlet.at<(outlet.hot?.76:.57));
    this.rainTurns=this.rainTurns.filter(event=>time-event.at<event.duration+.28);
    this.abyssMouths=this.abyssMouths.filter(mouth=>time<(mouth.cancelledAt??mouth.closedAt??mouth.at+mouth.travel+.20)+.46);
    const reservoirs=scorch?.reservoirs??[];
    const {geometry}=this;
    geometry.begin(camera,depth,resolution);
    if(!this.beats.length&&!this.massClears.length&&!this.fronts.length&&!this.outlets.length&&!this.imprints.length&&!this.rainTurns.length&&
      !this.abyssMouths.length&&!reservoirs.length) {
      this.root.visible=false;
      return;
    }
    const water=stage<3&&world?.water?surfaceHeightSampler(world.water,world.water.position.y):null;
    const terrain=world?.environment?.heightAt;
    const floorAt=terrain||water?(x,z)=>Math.max(terrain?.(x,z)??-Infinity,water?.(x,z)??-Infinity):null;
    this.frostSources.clear();
    const reduced=world?.reducedMotion?.matches;
    for(const clear of this.massClears)paintMassClear(geometry,clear,time-clear.at,floorAt,reduced);
    // Reserve the advancing compound effects before the ordinary impact accents consume the buffer.
    for(const event of this.abyssMouths)paintCommittedMouth(geometry,event,time,art,world?.reducedMotion?.matches);
    for(const event of this.fronts) {
      if(event.reaction==='gale-spore-carry')paintGaleSporeCarry(geometry,event,time,world?.reducedMotion?.matches);
      else if(event.reaction==='gale-spore-hold')paintGaleSporeHold(geometry,event,time,world?.reducedMotion?.matches);
      else if(event.reaction==='gale-spore-front')paintGaleSpore(geometry,event,time,floorAt,world?.reducedMotion?.matches);
      else if(event.reaction==='thaw-thunder-store')paintThawThunder(geometry,event,time,world?.reducedMotion?.matches);
      else if(event.reaction==='frost-temper-rush')paintFrostTemperRush(geometry,event,time,floorAt,world?.reducedMotion?.matches);
    }
    for(const event of this.fronts) {
      if(event.reaction==='frost-sheet') {
        const clear=this.massClears.findLast(beat=>beat.id===event.id&&Math.abs(beat.at-(event.breakAt??Infinity))<.22);
        const carry=this.frostTemperFocus(event.id,time);
        const hush=clear ? .64*smooth(time-clear.at,0,.037)*fade(time-clear.at,.27,.59):0;
        paintFrostSheet(geometry,event,time,reduced,{gain:Math.max(carry?.gain??0,hush)});
      }
      else if(event.reaction==='stone-contour')paintStoneContour(geometry,event,time,floorAt,world?.reducedMotion?.matches);
      else if(event.reaction==='stone-contour-hold')paintStoneContourHold(geometry,event,time-event.at);
    }
    for(const hit of this.imprints)paintDeathImprint(geometry,hit,time);
    for(const beat of this.beats) {
      if(beat.kind==='abyss')continue;
      if(this.massClears.some(clear=>clear.id===beat.id&&Math.abs(beat.at-clear.at)<.19))continue;
      for(const [i,group] of beat.groups.entries()) paintClearGroup(geometry,group,time-beat.at,beat.kind,beat.id*.41+i*.47);
    }
    for (const event of this.fronts) {
      const age=time-event.at;
      if(event.reaction==='gale-spore-front'||event.reaction==='gale-spore-carry'||event.reaction==='gale-spore-hold'||event.reaction==='frost-sheet'||
        event.reaction==='frost-temper-rush'||event.reaction==='thaw-thunder-store'||event.reaction==='stone-contour'||
        event.reaction==='stone-contour-hold')continue;
      if(event.reaction==='rift-seam') {
        traceRiftPrey(event,art,time);
        paintRiftSeam(geometry,event,time,art,floorAt);
        continue;
      }
      if(event.reaction==='rift-recoil') {
        paintRiftRecoil(geometry,event,age);
        continue;
      }
      if(event.reaction==='rift-wind-seam') {
        paintWindSeam(geometry,event,time);
        continue;
      }
      if(event.reaction==='rift-clash') {
        paintRiftClash(geometry,event,time);
        continue;
      }
      if(event.reaction==='beam-quench') {
        paintBeamQuench(geometry,event,time);
        continue;
      }
      if(event.reaction==='beam-quench-runoff') {
        paintQuenchRunoff(geometry,event,time);
        continue;
      }
      if(event.reaction==='beam-intercept') {
        paintBeamIntercept(geometry,event,time);
        continue;
      }
      if(event.reaction==='abyss-transfer') {
        const selectedMouth=this.abyssMouths.some(mouth=>mouth.id===event.id&&belongsToAbyssMouth(mouth.mouth,event.to));
        paintAbyssTransfer(geometry,event,age,art,selectedMouth);
        continue;
      }
      if(event.reaction==='stone-march') {
        paintStoneMarch(geometry,event,age,floorAt);
        continue;
      }
      if(event.kind==='frost') {
        if(age>=0) {
          paintFrostFork(geometry,event,age,!event.redirected&&!this.frostSources.has(event.sourceId));
          this.frostSources.add(event.sourceId);
        }
        continue;
      }
      const front=setupFront(event);
      if(!front||age<0)continue;
      const departure=front.family===8&&Number.isFinite(front.condenseAt)?{...front,family:12}:front;
      paintDeparture(geometry,departure,age,event.id*.41);
      if(event.kind==='stone')paintQuarry(geometry,front,age,floorAt,event.id*.41);
      else if(front.family===8)paintHeatedFlow(geometry,front,age,event.id*.41);
      else paintUndertow(geometry,front,age,event.id*.41);
    }
    for (const reservoir of reservoirs) paintQuenchReservoir(geometry,reservoir,gameTime);
    for (const outlet of this.outlets) paintOutlet(geometry,outlet,time-outlet.at,outlet.id*.81);
    for (const event of this.rainTurns) paintRainTurn(geometry,event,time-event.at);
    for (const beat of this.beats) {
      const age=time-beat.at;
      if(age<0)continue;
      if(beat.kind==='frost')continue;
      if(beat.kind==='abyss') for(const mouth of beat.mouths) {
        if(!this.abyssMouths.some(selected=>selected.id===beat.id&&belongsToAbyssMouth(selected.mouth,mouth))) {
          paintPinch(geometry,mouth,age,beat.id);
        }
      }
      const alreadyDelivered=this.fronts.some(event=>event.id===beat.id&&Math.abs(event.at-beat.at)<.76);
      if(alreadyDelivered)continue;
      const stone=beat.kind==='stone';
      const centers=stone?(beat.centers?.length?beat.centers:[beat]):beat.mouths;
      for(const [i,center] of centers.entries()) paintLocalWake(geometry,center,age,beat.id*.41+i*.47,stone);
    }
    geometry.finish();
  }

  inspect() {
    return {beats:this.beats.length,massClears:this.massClears.length,fronts:this.fronts.length,abyssMouths:this.abyssMouths.length,outlets:this.outlets.length,imprints:this.imprints.length,rainTurns:this.rainTurns.length,
      triangles:this.geometry.indexCount/3,blocks:this.geometry.blockCount};
  }
}

export function createDragonArtHeroBeats() {
  return new DragonArtHeroBeats();
}
