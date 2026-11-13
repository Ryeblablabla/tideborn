import * as THREE from 'three';
import { CLOUD_PASS, CRAB_PINCER, DART_RUSH, RANGED_SHOT_RANGE } from '../encounters.js';
import { addOccludedLaneTrace, brushMaterial, FlightTraceOcclusion, laneBrush, placeOccludedLaneTrace } from './charge-warning.js';
import { createInkEnemyGeometry, FAUNA_REGION, SHELL_WOUNDS, smoothFaunaSeams } from './fauna-geometry.js';

export { INK_FOOD, createInkFoodGeometry } from './fauna-geometry.js';

export const INK_SPECIES = [
  '墨鲫', '溪蟹', '烟水螅', '墨鸢', '长鳍鳗', '巨钳蟹王', '幽灯水母', '玄甲龙龟', '噬星古鲲', '逐浪海鳐', '拂云鳐',
];

const pigments = [
  ['#405449', .23], ['#6a5342', .30], ['#66746a', .31], ['#3d4641', .20], ['#415359', .29],
  ['#814735', .43], ['#46586a', .34], ['#3b594d', .40], ['#435668', .26],
  ['#45595e', .29], ['#59677a', .37],
];

const mountainVisuals = { 0: 3, 1: 10, 2: 10, 4: 3, 9: 10 };
const creekCrabForms = ['standard', 'long-leg', 'thick-shell'];
const habitatForms = [
  { 0: ['fork-jaw', 'hook-jaw'], 1: creekCrabForms },
  { 0: ['lake-dart'], 2: ['lake-cup'], 4: ['ribbon-eel'] },
  { 2: ['drifting-bell', 'veil-polyp'], 4: ['reef-eel'], 9: ['crescent-ray', 'needle-ray'] },
  { 3: ['standard', 'fork-tail'], 10: ['veil-ray', 'mantle-ray'] },
];
const baseMotion = { rate: 1, legLift: .11, stride: .11, bellPulse: .115, tentacleSway: .15, tentacleTrail: .12 };
const motionByForm = {
  'reed-dart': { ...baseMotion, rate: 1.22, swim: .124, flutter: .054 },
  'fork-jaw': { ...baseMotion, rate: 1.13, swim: .107, flutter: .048 },
  'hook-jaw': { ...baseMotion, rate: 1.02, swim: .081, flutter: .055 },
  'lake-dart': { ...baseMotion, rate: .87, swim: .142, flutter: .073 },
  'long-leg': { ...baseMotion, rate: 1.14, legLift: .164, stride: .135 },
  'thick-shell': { ...baseMotion, rate: .79, legLift: .069, stride: .089 },
  'lake-cup': { ...baseMotion, rate: 1.11, bellPulse: .094, tentacleSway: .124, tentacleTrail: .085 },
  'drifting-bell': { ...baseMotion, rate: .77, bellPulse: .162, tentacleSway: .192, tentacleTrail: .16 },
  'veil-polyp': { ...baseMotion, rate: .91, bellPulse: .093, tentacleSway: .232, tentacleTrail: .20 },
  'ribbon-eel': { ...baseMotion, rate: .83, swim: .231, flutter: .069 },
  'reef-eel': { ...baseMotion, rate: 1.08, swim: .128, flutter: .105 },
  'crescent-ray': { ...baseMotion, rate: .94, wing: .155, tail: .21 },
  'needle-ray': { ...baseMotion, rate: 1.15, wing: .212, tail: .14 },
  'veil-ray': { ...baseMotion, rate: .84, wing: .262, tail: .20 },
  'mantle-ray': { ...baseMotion, rate: .71, wing: .365, tail: .26 },
  'fork-tail': { ...baseMotion, rate: .81 },
};
const pigmentByForm = {
  'reed-dart': ['#39483b', .41],
  'fork-jaw': ['#39483b', .41],
  'hook-jaw': ['#535c43', .37],
  'lake-dart': ['#354e4e', .43],
  'long-leg': ['#5c5b50', .29],
  'thick-shell': ['#715545', .37],
  'drifting-bell': ['#536e73', .29],
  'veil-polyp': ['#57666e', .38],
  'ribbon-eel': ['#465c50', .38],
  'reef-eel': ['#445264', .40],
  'crescent-ray': ['#475854', .34],
  'needle-ray': ['#455d64', .39],
  'veil-ray': ['#647084', .36],
  'mantle-ray': ['#46586e', .37],
};

function formForEnemy(enemy, stage, type) {
  if (enemy.boss) return 'standard';
  if (stage === 0 && type === 0 && enemy.dartRushReadyAt != null) return 'reed-dart';
  const forms = habitatForms[stage]?.[type];
  const index = enemy.id + Math.floor(enemy.id / 2);
  return forms ? forms[index % forms.length] : 'standard';
}

const animationFrequency = [5.4, 5.2, 2.7, 4.7, 4.9, 4.1, 2.2, 2.6, 1.9, 3.4, 2.8];
const rangedPoses = {
  2: { windup: .58, opening: .10, settle: .52 },
  9: { windup: .54, opening: .15, settle: .61 },
};
const brushResponse = [
  // Ink load, broken white and grazing stroke strength.
  [.75, .57, .49], [.84, .58, .68], [.65, .58, .46], [.84, .62, .54], [.73, .58, .53],
  [1.04, .78, .85], [.83, .77, .67], [1.01, .72, .87], [1.00, .78, .74],
  [.78, .61, .64], [.83, .73, .65],
];

const faunaVaryings = 'varying vec4 vFaunaPaint; varying vec3 vFaunaView;\n';
const faunaInk = /* glsl */`
  uniform vec3 uFaunaBrush;
  #if FAUNA_BOSS_INK > 0
  uniform sampler2D uFaunaAtlas;
  uniform vec2 uFaunaAtlasGrid;
  uniform float uBossRecovery;

  // Stamp the shared brush in the deformed surface's rest chart. Along and
  // across identify anatomical regions rather than a projected image plane.
  float landmarkStroke(vec2 chart,vec2 center,vec2 radius,float slant,float slot,bool wrap) {
    vec2 distance=chart-center;
    if(wrap)distance.y=fract(distance.y+.5)-.5;
    distance.y+=distance.x*slant;
    vec2 q=distance/radius;
    if(any(greaterThan(abs(q),vec2(1.))))return 0.;
    vec2 tile=vec2(mod(slot,uFaunaAtlasGrid.x),floor(slot/uFaunaAtlasGrid.x));
    float tip=texture2D(uFaunaAtlas,(tile+clamp(q*.5+.5,vec2(.015),vec2(.985)))/uFaunaAtlasGrid).r;
    return tip*(1.-smoothstep(.72,1.,max(abs(q.x),abs(q.y))));
  }

  void paintBossLandmarks(inout float pigment,inout float paper,float along,float across,
    float region,float seed,float wet,float details) {
    vec2 chart=vec2(along,across);
    float load=0.,lift=0.;
    if(region>1.5&&region<2.5){
      // Loaded fin base, lighter swept edges and broken white along the ribs.
      load=landmarkStroke(chart,vec2(.44,.28),vec2(.52,.43),.31,1.+floor(seed*2.),false);
      lift=landmarkStroke(chart,vec2(.55,.67),vec2(.48,.34),-.21,2.,false);
      pigment=pigment*(.65+.26*wet)+load*.36;
      paper=max(paper*.83,lift*details*.54*(1.-load*.47));
    }
    #if FAUNA_BOSS_INK == 6
    else if(region>3.5){
      // Uneven folds collect ink below the crown and across the scalloped rim.
      load=max(
        landmarkStroke(chart,vec2(.66,.13),vec2(.44,.22),.23,4.,true),
        landmarkStroke(chart,vec2(.58,.53),vec2(.47,.24),-.29,5.,true)
      );
      load=max(load,landmarkStroke(chart,vec2(.69,.83),vec2(.37,.16),.19,6.,true));
      lift=max(
        landmarkStroke(chart,vec2(.38,.01),vec2(.33,.17),.24,0.,true),
        landmarkStroke(chart,vec2(.47,.48),vec2(.46,.14),-.21,2.,true)
      );
      float curl=.052*sin(across*12.5664+.8)+.026*cos(across*31.4159);
      float rim=smoothstep(.60,.91,along+curl+(wet-.5)*.12);
      float backwash=smoothstep(.20,.53,along)*(1.-smoothstep(.57,.76,along+curl));
      pigment=pigment*(.48+.17*wet)+load*(.26+.22*details)+rim*(.22+.37*wet);
      paper=max(paper*.79,lift*(.25+.34*details)*(1.-load*.50));
      paper=max(paper,backwash*(.16+.19*wet))*(1.-rim*.73);
    }
    #elif FAUNA_BOSS_INK == 8
    else if(region<.5){
      // The shoulder and back are laid in broad, overlapping wet strokes.
      load=max(
        landmarkStroke(chart,vec2(.31,.11),vec2(.38,.17),-.12,4.,true),
        landmarkStroke(chart,vec2(.55,.33),vec2(.47,.20),.11,5.,true)
      );
      load=max(load,landmarkStroke(chart,vec2(.56,.06),vec2(.43,.09),.04,1.,true));
      lift=max(
        landmarkStroke(chart,vec2(.47,.23),vec2(.43,.064),.04,0.,true),
        landmarkStroke(chart,vec2(.42,.47),vec2(.37,.073),.20,2.,true)
      );
      lift=max(lift,landmarkStroke(chart,vec2(.63,.91),vec2(.29,.086),.24,3.,true));
      pigment=pigment*(.62+.22*wet)+load*(.34+.23*details);
      paper=max(paper*.91,lift*(.25+.45*details)*(1.-load*.57));
      // The exposed gill wash follows the underside of the actual head.
      float angle=across*6.2831853;
      float gill=(1.-smoothstep(-.71,-.16,sin(angle)))
        *smoothstep(.16,.25,along)*(1.-smoothstep(.41,.53,along));
      float opening=gill*uBossRecovery;
      pigment=mix(pigment,.25+.26*wet,opening*.75);
      paper=max(paper,opening*(.25+.24*wet));
    }
    #endif
  }
  #endif

  void paintAnatomy(inout float pigment, inout float paper, vec2 guides, float wash, vec3 n) {
    float along = vFaunaPaint.x;
    float across = vFaunaPaint.y;
    float region = vFaunaPaint.z;
    float seed = vFaunaPaint.w;
    #if FAUNA_BOSS_INK == 6
    if(region>5.5){
      float ribs=.5+.5*cos(across*37.6991+along*1.2);
      float fiber=noise3(vec3(along*11.,cos(across*6.2832)*5.,sin(across*6.2832)*5.));
      pigment=mix(pigment*.62+.07,pigment*.38+ribs*.15,uBossRecovery);
      paper=max(paper*.58,(.19+.34*fiber)*(1.-.63*ribs)*(.48+.52*uBossRecovery));
      return;
    }
    #endif
    if (region > 4.5) return;

    float angle = across * 6.2831853;
    vec3 sweep = vec3(along * 4.1, cos(angle) * 1.25, sin(angle) * 1.25);
    // The radial chart uses periodic coordinates at wrapped tube seams.
    vec3 fibers = vec3(along * 8.0, cos(angle) * 5.0, sin(angle) * 5.0);
    if (region > 1.5 && region < 2.5) {
      sweep = vec3(across * 2.8, along * 4.5, .3);
      fibers = vec3(across * 5.1, along * 16.0, 1.3);
    }
    float wet = noise3(sweep + vec3(seed * 23.0, 5.4, 12.8));
    // Attenuate small bristles into the far wash. Preserve the broad mass and
    // silhouette, especially for small airborne creatures against paper.
    float details = 1.-.72*smoothstep(18.,46.,-vFaunaView.z);
    float dry = mix(.49,noise3(fibers + vec3(seed * 31.0, 12.1, 8.7)),details);
    float mass = smoothstep(.31, .71, .67 * wet + .33 * wash);
    float lightPass = smoothstep(.31, .76, dry) * (1.0 - mass);
    float structure = smoothstep(.27, .76, guides.x);
    float wetLine = smoothstep(.49, .82, wet + .22 * dry);

    if (region < .5) {
      // The back takes the wet wash and the long belly keeps the lighter strokes.
      pigment = pigment * (.59 + mass * .43) + uFaunaBrush.x * (.25 * mass + .21 * structure);
      paper = max(paper * (.79 + .19 * dry), uFaunaBrush.y * lightPass * .33);
    } else if (region < 1.5) {
      // Limb joints pool ink while their tips carry fine brush grain.
      pigment = pigment * (.62 + mass * .34) + uFaunaBrush.x * (.20 * mass + .20 * structure);
      paper = max(paper * .85, uFaunaBrush.y * lightPass * .26);
    } else if (region < 2.5) {
      float leading = 1.0 - smoothstep(.13, .76, across + (wet - .5) * .14);
      pigment = pigment * (.47 + .55 * leading) + uFaunaBrush.x * (.28 * leading * mass + .07 * mass);
      paper = max(paper * .77, uFaunaBrush.y * (.14 + .30 * lightPass) * (1.0 - leading));
    } else if (region < 3.5) {
      // Dark seams and irregular lifted patches separate the rigid plates.
      pigment = pigment * (.56 + mass * .45) + uFaunaBrush.x * (.31 * mass + .30 * structure);
      paper = max(paper * (.49 + .43 * dry), uFaunaBrush.y * lightPass * .37 * (1.0 - structure));
    } else {
      float rim = smoothstep(.62, .98, along + (wet - .5) * .08);
      pigment = pigment * (.55 + .32 * mass) + uFaunaBrush.x * (.16 * mass + .28 * rim);
      paper = max(paper * (.72 + .23 * dry), uFaunaBrush.y * lightPass * .31 * (1.0 - rim));
    }

    #if FAUNA_BOSS_INK > 0
    paintBossLandmarks(pigment,paper,along,across,region,seed,wet,details);
    #endif
    vec3 viewer = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vFaunaView);
    float grazing = pow(1.0 - abs(dot(n, viewer)), 3.3);
    // The soft inner edge breaks where the actual surface loses its wet ink.
    pigment += grazing * uFaunaBrush.z * (.07 + .20 * wetLine) * (.55 + .45 * mass);
  }
`;

function damagePathSource(name, paths) {
  const coordinate = point => `vec2(${point.map(value => value.toFixed(3)).join(',')})`;
  const spans = paths.flatMap(path => path.slice(1).map((end, index) =>
    `nearest=min(nearest,shellSegment(p,${coordinate(path[index])},${coordinate(end)}));`));
  return `float ${name}(vec2 p){float nearest=2.;${spans.join('\n')}return nearest;}`;
}

function attachShellWear(material, type) {
  const { first, later } = SHELL_WOUNDS[type];
  const varyings = 'varying vec3 vShellRest; varying vec2 vShellEdge;\n';
  material.uniforms.uShellWear = { value: 0 };
  material.uniforms.uShellOpen = { value: 0 };
  material.uniforms.uOpeningStroke = { value: 0 };
  material.vertexShader = varyings + 'attribute vec4 aShellWound;\n' + material.vertexShader.replace(
    'void main() {',
    'void main() { vShellRest=inkRestPosition; vShellEdge=aShellWound.xw;',
  );
  material.fragmentShader = varyings
    + 'uniform float uShellWear; uniform float uShellOpen; uniform float uOpeningStroke;\n'
    + material.fragmentShader
    .replace('void main() {', /* glsl */`
      float openingPaper(float grain){
        if(uOpeningStroke<.02)return 0.;
        vec3 p=vShellRest;
        float distant=smoothstep(23.,43.,-vFaunaView.z);
        ${type === 5 ? `
          float arched=.431-.33*p.x*p.x+.013*sin(p.x*13.);
          float distance=abs(p.z-arched);
          float width=mix(.073,.108,distant);
          float taper=1.-smoothstep(.25,.38,abs(p.x+.025));
          float facing=smoothstep(-.18,-.067,p.y);
        ` : `
          float along=p.z-.98;
          float distance=abs(p.x+.21*along+.019*sin(p.z*9.));
          float width=mix(.100,.142,distant);
          float taper=smoothstep(.75,.91,p.z)*(1.-smoothstep(1.21,1.42,p.z));
          float facing=smoothstep(-.11,.036,p.y);
        `}
        float paper=1.-smoothstep(width*.37,width,distance+(grain-.5)*width*.45);
        float dry=mix(${type === 5 ? '.56' : '.36'},1.,smoothstep(.31,.68,grain));
        return paper*taper*facing*mix(dry,.80,distant)*uOpeningStroke;
      }
      void paintSoftTissue(inout float pigment,inout float paper){
        if(vFaunaPaint.z<5.5)return;
        float tip=${type === 5 ? '1.' : '1.-smoothstep(.58,.86,vFaunaPaint.x)'};
        float open=uShellOpen*tip;
        float grain=noise3(vec3(vShellRest.xz*17.,3.6));
        float fold=.5+.5*cos(vFaunaPaint.y*18.8496+vFaunaPaint.x*1.4);
        float ridge=smoothstep(.29,.70,grain+.17*(1.-fold));
        float lift=${type === 5 ? '.92' : '.66'};
        pigment=mix(pigment,pigment*.50+.085,open*lift);
        paper=max(paper,ridge*open*lift*.56);
        float brush=clamp(openingPaper(grain),0.,1.);
        pigment=mix(pigment,min(pigment,.09+grain*.10),brush*.92);
        paper=max(paper,brush*.91);
      }
      float shellSegment(vec2 p,vec2 a,vec2 b){
        vec2 v=b-a;
        return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));
      }
      ${damagePathSource('firstShellCrack', first)}
      ${damagePathSource('laterShellCrack', later)}
      void paintShellWear(inout float pigment,inout float paper){
        if(vShellEdge.x<.5||uShellWear<.025)return;
        float first=smoothstep(.06,.92,uShellWear);
        float later=smoothstep(1.04,1.92,uShellWear);
        vec2 p=vShellRest.xz;
        float teeth=(noise3(vec3(p*72.,2.7))-.5)*.016;
        float rough=noise3(vec3(p*26.,5.2));
        float d1=firstShellCrack(p);
        float d2=laterShellCrack(p);
        float split=max(first*(1.-smoothstep(.012,.035,d1+teeth)),
                        later*(1.-smoothstep(.011,.041,d2+teeth)));
        float halo=max(first*(1.-smoothstep(.034,.092,d1+teeth)),
                       later*(1.-smoothstep(.031,.090,d2+teeth)));
        vec2 offset=vec2(.024,-.021);
        float lifted=max(first*(1.-smoothstep(.015,.044,firstShellCrack(p+offset)+teeth)),
                         later*(1.-smoothstep(.015,.046,laterShellCrack(p+offset)+teeth)));
        float chipped=smoothstep(.16,.71,vShellEdge.y)*later;
        // The fractured lip lifts to paper in broken strokes. Its inset and
        // the crack's center retain dense, wet-looking ink.
        pigment=mix(pigment,.94,max(split*.94,halo*.43));
        pigment=mix(pigment,.77,chipped*.48);
        float bristle=.25+.75*smoothstep(.25,.70,rough);
        float edge=lifted*(1.-split*.81)*bristle*.83;
        paper=max(paper*(1.-split*.96),max(edge,chipped*(1.-split)*rough*.58));
      }
      void main() {`)
    .replace('paintAnatomy(pigment,reserveMask,guides,wash,n);',
      'paintAnatomy(pigment,reserveMask,guides,wash,n); paintSoftTissue(pigment,reserveMask); paintShellWear(pigment,reserveMask);');
}

function shellWearLevel(enemy) {
  const remaining = enemy.hp / Math.max(1, enemy.maxHp);
  return remaining <= .33 ? 2 : remaining <= .67 ? 1 : 0;
}

function openingStroke(enemy, recovery, game) {
  const plan = enemy.bossPlan;
  if (plan?.phase !== 'recovery') return 0;
  const smooth = THREE.MathUtils.smoothstep;
  const elapsed = plan.definition.recovery - plan.remaining;
  const age = game ? game.time - (enemy.lastOpeningHitAt ?? -Infinity) : Infinity;
  const hit = age >= 0 ? 1 - smooth(age, .012, .16) : 0;
  const stroke = .86 + .14 * (1 - smooth(elapsed, .24, .65));
  return smooth(recovery, .38, .9) * (stroke + hit * .24);
}

const threatLandmarks = {
  1: /* glsl */`
    float claw=smoothstep(.33,.53,abs(p.x))*smoothstep(.37,.59,p.z);
    float lead=smoothstep(-.02,.33,p.x*uThreatCue.y);
    float ink=claw*(.18+.82*engaged*lead);
    float lift=claw*lead*smoothstep(.19,.30,p.y)*engaged;
  `,
  2: /* glsl */`
    float bell=step(3.5,region)*(1.-step(4.5,region));
    float rim=smoothstep(.49,.86,chart.x);
    float folds=.72+.28*cos(chart.y*31.4159+chart.x*2.6);
    float ink=bell*rim*folds*(.20+.80*engaged);
    float lift=bell*(1.-smoothstep(.10,.24,abs(chart.x-.41)))*engaged;
  `,
  9: /* glsl */`
    float fin=step(1.5,region)*(1.-step(2.5,region));
    float leading=1.-smoothstep(.38,.75,chart.y);
    float shoulder=smoothstep(.27,.61,abs(p.x))*(1.-smoothstep(.99,1.30,abs(p.x)));
    float wing=fin*leading*shoulder*smoothstep(-.31,.16,p.z);
    float gill=step(region,.5)*smoothstep(.21,.39,abs(p.x))
      *smoothstep(.17,.35,p.z)*(1.-smoothstep(.51,.66,p.z));
    float ink=max(wing,gill*.72)*(.22+.78*engaged);
    float lift=fin*shoulder*(1.-smoothstep(.08,.23,abs(chart.y-.78)))*engaged;
  `,
};
const ordinaryTypes = new Set([0, 1, 2, 3, 4, 9, 10]);

function attachThreatInk(material, type) {
  const landmarks = threatLandmarks[type];
  if (!ordinaryTypes.has(type)) return;
  const cue = { value: new THREE.Vector2() };
  const contact = { value: new THREE.Vector3() };
  const varyings = 'varying vec3 vThreatRest;\n';
  material.uniforms.uThreatCue = cue;
  material.uniforms.uFaunaContact = contact;
  material.vertexShader = varyings + material.vertexShader.replace(
    'void main() {', 'void main() { vThreatRest=inkRestPosition;',
  );
  material.fragmentShader = varyings + 'uniform vec2 uThreatCue; uniform vec3 uFaunaContact;\n' + material.fragmentShader
    .replace('void main() {', /* glsl */`
      void paintThreat(inout float pigment,inout float paper){
        vec3 p=vThreatRest;
        vec2 chart=vFaunaPaint.xy;
        float region=vFaunaPaint.z;
        float engaged=uThreatCue.x;
        float distance=smoothstep(29.,48.,-vFaunaView.z);
        ${landmarks ?? 'float ink=0.; float lift=0.;'}
        float fiber=noise3(p*vec3(16.,27.,11.)+vec3(3.,1.,4.));
        float grain=.71+.29*smoothstep(.24,.62,fiber);
        float load=ink*(1.-distance)*grain;
        ${landmarks || type === 4 ? 'pigment=mix(pigment,pigment*.82,distance);' : ''}
        pigment+=load*.57;
        paper=max(paper*(1.-load*.73),lift*(1.-distance)*grain*.45);
        if(uFaunaContact.z>.01){
          vec2 side=vec2(uFaunaContact.x,uFaunaContact.y);
          float facing=smoothstep(.48,.91,dot(p.xz,side)/max(.19,length(p.xz)));
          float reach=smoothstep(.15,.32,length(p.xz));
          float body=1.-step(4.5,region);
          float strike=facing*reach*body*grain*uFaunaContact.z*(1.-distance*.72);
          pigment=mix(pigment,min(pigment,.22),strike*.78);
          paper=max(paper,strike*.60);
        }
      }
      void main() {`)
    .replace('paintAnatomy(pigment,reserveMask,guides,wash,n);',
      'paintAnatomy(pigment,reserveMask,guides,wash,n); paintThreat(pigment,reserveMask);');
  material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => {
    const state = object.userData.threatCue;
    if (state) cue.value.copy(state);
    else cue.value.set(0, 0);
    const strike = object.userData.faunaContact;
    if (strike) contact.value.copy(strike);
    else contact.value.set(0, 0, 0);
    material.uniformsNeedUpdate = true;
  };
}

function attachFaunaInk(material, geometry, type, ink) {
  geometry.setAttribute('inkRestPosition', geometry.attributes.position.clone());
  geometry.setAttribute('inkRestNormal', geometry.attributes.normal.clone());
  material.uniforms.uFaunaBrush = { value: new THREE.Vector3(...(brushResponse[type] ?? brushResponse[0])) };
  material.defines.FAUNA_BOSS_INK = type === 6 || type === 8 ? type : 0;
  if (material.defines.FAUNA_BOSS_INK) {
    material.uniforms.uFaunaAtlas = ink.brushUniforms.uBrushAtlas;
    material.uniforms.uFaunaAtlasGrid = ink.brushUniforms.uAtlasGrid;
    material.uniforms.uBossRecovery = { value: 0 };
  }
  material.vertexShader = faunaVaryings
    + 'attribute vec3 inkRestPosition; attribute vec3 inkRestNormal; attribute vec4 faunaPaint;\n'
    + material.vertexShader
      .replace('vPaint = (position - uCenter) * uObjectScale;', 'vPaint = (inkRestPosition - uCenter) * uObjectScale;')
      .replace('vFormNormal=normal;', 'vFormNormal=inkRestNormal;')
      .replace(
        'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        'vFaunaPaint=faunaPaint; vFaunaView=(modelViewMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*vec4(vFaunaView,1.0);',
      );
  material.fragmentShader = faunaVaryings + material.fragmentShader
    .replace('void main() {', faunaInk + 'void main() {')
    .replace(
      'float reserveMask=clamp(guides.y,0.0,1.0);',
      'float reserveMask=clamp(guides.y,0.0,1.0); paintAnatomy(pigment,reserveMask,guides,wash,n);',
    );
  if (SHELL_WOUNDS[type]) attachShellWear(material, type);
  attachThreatInk(material, type);
  material.needsUpdate = true;
}

function swimmer(type, x, y, z, t, fin, u, v, motion, out) {
  const tail = Math.max(0, .15 - z);
  const sway = Math.sin(t + z * 3.8);
  out[0] = x + sway * tail * (motion.swim ?? (type === 4 ? .16 : .09));
  const flutter = fin ? Math.sin(u * Math.PI) * v * v * Math.sin(t * 1.9 - u * 3.7 + z * 2.4) * (motion.flutter ?? .046) : 0;
  out[1] = y + flutter + (type === 8 ? Math.cos(t + z * 2.4) * tail * .08 : 0);
  out[2] = z;
}

function contactRecoil(x, y, z, type, cue, out) {
  const strength = cue.z;
  const across = x * cue.x + z * cue.y;
  const struck = Math.max(0, across);
  const squash = struck * strength * (type === 1 ? .18 : .25);
  const roll = strength * (type === 1 ? .23 : .36);
  out[0] -= cue.x * (squash + y * roll);
  out[2] -= cue.y * (squash + y * roll);
  out[1] += across * roll;
}

function clawFollowThrough(out, cue, yawCos, yawSin, tiltCos, tiltSin) {
  // Turn about the original mesh origin. The body is still at the simulated
  // position, while the strike-facing side briefly yields to the claw.
  const x = out[0] * yawCos + out[2] * yawSin;
  const z = out[2] * yawCos - out[0] * yawSin;
  const y = out[1];
  const facing = x * cue.x + z * cue.y;
  const bend = facing * (tiltCos - 1) - y * tiltSin;
  out[0] = x + cue.x * bend;
  out[1] = y * tiltCos + facing * tiltSin;
  out[2] = z + cue.y * bend;
}

function contactDirection(cue, angle, dx, dz) {
  const length = Math.hypot(dx, dz);
  if (length < .03) return false;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  cue.x = (dx * cosine - dz * sine) / length;
  cue.y = (dx * sine + dz * cosine) / length;
  return true;
}

function dartStroke(x, y, z, pursuit, brace, thrust, relax, out) {
  const tail = Math.max(0, -.27 - z);
  const fin = THREE.MathUtils.smoothstep(Math.abs(x), .16, .43);
  const nose = THREE.MathUtils.smoothstep(z, .18, .95);
  out[0] -= x * tail * pursuit * .46;
  out[0] += x * fin * (brace * .23 - thrust * .46 + relax * .10);
  out[1] += z * (brace * .27 - pursuit * .19 - thrust * .06) + fin * brace * .15;
  out[2] += (y * .15 + tail * .15) * pursuit + nose * (thrust * .12 - brace * .11);
  out[2] -= fin * thrust * .13;
}

function crustacean(enemy, recovery, x, y, z, t, motion, out) {
  const side = Math.sign(x);
  const leg = Math.max(0, Math.abs(x) - .44);
  const step = t + z * 9.8 + side * Math.PI * .5;
  const claw = Math.max(0, z - .52);
  const preparing = THREE.MathUtils.clamp((enemy.lungeWindup ?? 0) * 3, 0, 1);
  const sag = claw * recovery;
  const walk = 1 - recovery * .78;
  out[0] = x + side * (claw * (.09 * Math.sin(t * .72) * walk + preparing * .28) + sag * .30);
  out[1] = y + Math.sin(step) * leg * motion.legLift * walk + preparing * claw * .31
    - sag * (side > 0 ? .55 : .44);
  out[2] = z + Math.cos(step) * leg * motion.stride * walk - sag * .24;
}

function crabForebody(x, z, region, shell, recovery, out) {
  if (shell) {
    const brow = THREE.MathUtils.smoothstep(z, .075, .435);
    out[1] += brow * (-.080 + recovery * .34);
    out[2] += brow * (.09 - recovery * .305);
  } else if (region === FAUNA_REGION.tissue) {
    const mouth = THREE.MathUtils.smoothstep(z, .12, .52);
    out[0] += x * mouth * (-.18 + recovery * .34);
    out[1] += mouth * (-.035 + recovery * .202);
    out[2] += mouth * (-.13 + recovery * .29);
  } else {
    const foreclaw = THREE.MathUtils.smoothstep(Math.abs(x), .35, .58) * Math.max(0, z - .43);
    out[0] -= Math.sign(x) * foreclaw * (1 - recovery) * .16;
  }
}

function rangedGesture(profile, enemy, game) {
  if (!profile || !game) return 0;
  const age = game.time - (enemy.lastRangedShotAt ?? -Infinity);
  const smooth = THREE.MathUtils.smoothstep;
  if (age >= 0 && age < profile.settle) {
    const release = smooth(age, 0, profile.opening);
    const settle = 1 - smooth(age, profile.opening, profile.settle);
    return (2 * release - 1) * settle;
  }
  const separation = Math.hypot(game.p.x - enemy.x, game.p.z - enemy.z);
  const crossing = enemy.crossing?.until > game.time && separation > 4.6;
  if (crossing || separation >= RANGED_SHOT_RANGE) return 0;
  return smooth(enemy.shootCD, 0, profile.windup) - 1;
}

function medusa(x, y, z, t, waterDepth, u, seed, motion, fold, spread, out) {
  const below = Math.max(0, -y);
  // The bell closes on the shot; the distal arms follow in their own arcs.
  const armFold = fold * (1 - .72 * THREE.MathUtils.smoothstep(below, .12, .43));
  const pulse = Math.sin(t) * motion.bellPulse * (1 - (fold + spread) * .86);
  // Near the water surface the long tips drift sideways as the bell pulses.
  const drift = Math.max(0, below - waterDepth);
  const contraction = 1 + pulse * (1 - Math.min(.7, below * .35)) + drift * .54;
  const rim = contraction * (1 - armFold * .46 + spread * .21);
  const lift = 1 + fold * .60 - spread * .27;
  const tentacleSwing = below * (1 - armFold * .80);
  const delay = y * 3.1 - u * 1.5 + seed * 1.9;
  out[0] = x * rim + Math.sin(t + delay + z * 2.3) * tentacleSwing * motion.tentacleSway;
  const relaxedHeight = drift ? -waterDepth - drift * .12 / (.18 + drift) : y;
  out[1] = relaxedHeight * (1 - pulse * .48) * (y >= 0 ? lift : 1 - armFold * .40);
  out[2] = z * rim + Math.cos(t + y * 3.7 + x * 2) * tentacleSwing * motion.tentacleTrail;
}

function lakePolypPose(x, y, z, fold, spread, out) {
  // Point the small bell's release along its real firing direction.
  const crown = Math.max(0, y);
  const arms = THREE.MathUtils.smoothstep(-y, .12, .42);
  out[0] += x * arms * fold * .31;
  out[1] += arms * fold * (.10 + Math.max(0, z) * .19) - crown * spread * .16;
  out[2] += crown * (spread * .59 - fold * .36) + Math.max(0, z) * arms * spread * .32;
}

function lakeEelSurge(enemy, game) {
  if (!game || enemy.speed <= 0 || enemy.weaponPush) return 0;
  const distance = Math.hypot(game.p.x - enemy.x, game.p.z - enemy.z);
  if (distance <= .60 || distance >= 7.2 || (enemy.crossing?.until > game.time && distance > 4.6)) return 0;
  // Match the rising flank of the ordinary surge speed in updateRegular.
  const phase = game.time * 1.58 + enemy.phase;
  const rise = Math.max(0, Math.sin(phase));
  const coil = rise * Math.max(0, Math.cos(phase));
  return (Math.cos(phase * .5) < 0 ? -1 : 1) * coil * 2;
}

function lakeEelPose(x, y, z, coil, out) {
  const tail = THREE.MathUtils.smoothstep(-z, -.40, 1.87);
  const shoulder = THREE.MathUtils.smoothstep(z, .25, 1.15);
  const strength = Math.abs(coil);
  const bend = tail * tail * strength;
  const arch = Math.sign(coil) * (Math.sin(tail * Math.PI * .86) * .95 - shoulder * .16);
  out[0] = THREE.MathUtils.lerp(out[0], x + arch, strength);
  out[1] += y * bend * .34 + bend * .16;
  out[2] += tail * bend * .36;
}

function lanternOpening(x, y, z, region, brace, recovery, seed, out) {
  if (region === FAUNA_REGION.tissue) {
    const front = THREE.MathUtils.smoothstep(z, 0, .43);
    out[0] = x * (.81 + recovery * .81);
    out[1] = y + recovery * (.135 + z * .50 + front * .085);
    out[2] = z * (.81 + recovery * .71) + recovery * (.38 + front * .095);
    return;
  }
  const soft = Math.min(1, Math.max(0, -y) * 1.6);
  out[0] *= 1 - brace * .16 + recovery * (.34 + soft * .08);
  out[1] += y * (brace * .12 - recovery * (y > 0 ? .48 : .23)) + z * recovery * .49;
  out[2] *= 1 - brace * .15 + recovery * (z > 0 ? .04 : .37);
  if (region === FAUNA_REGION.joint || region === FAUNA_REGION.membrane) {
    const reach = THREE.MathUtils.smoothstep(-y, .15, .77) * brace;
    const twist = Math.sin(seed * Math.PI * 2) * reach * .17;
    out[0] += (x * .29 - z * twist) * reach;
    out[1] += reach * (.058 + .09 * Math.cos(seed * Math.PI * 2));
    out[2] += (z * .28 + x * twist) * reach;
  }
}

function kunOpening(x, y, z, region, brace, recovery, leanSide, out) {
  const wing = region === FAUNA_REGION.membrane
    ? Math.max(0, Math.abs(x) - .38) * THREE.MathUtils.smoothstep(z, -1.30, -.67) : 0;
  out[0] += Math.sign(x) * wing * (recovery * .34 - brace * .28);
  out[1] += wing * (brace * .32 - recovery * .31);
  out[2] += wing * (recovery * .54 - brace * .34);
  const gill = region === FAUNA_REGION.body
    ? (1 - THREE.MathUtils.smoothstep(y, -.28, -.095)) * THREE.MathUtils.smoothstep(z, .11, .82) : 0;
  const lean = recovery * leanSide * .20;
  out[0] -= y * lean;
  out[1] += x * lean + z * recovery * .16 - gill * recovery * .22;
  out[2] += gill * recovery * .06;
}

function crossStroke(age) {
  const smooth = THREE.MathUtils.smoothstep;
  return smooth(age, -.14, 0) * (1 - smooth(age, .085, .32));
}

function skyCrossGesture(data, enemy, game) {
  const plan = enemy.bossPlan;
  if (!game || plan?.definition.name !== 'sky-cross') {
    data.crossTiming = null;
    return null;
  }
  if (data.crossTiming?.plan !== plan) {
    const times = { plan, lowAt: null, highAt: null, preload: 0, low: 0, high: 0, release: 0 };
    for (const hazard of game.hazards) {
      if (hazard.attack !== 'sky-cross' || hazard.bossId !== enemy.id) continue;
      if (hazard.layer === 'low') times.lowAt = hazard.resolveAt;
      if (hazard.layer === 'high') times.highAt = hazard.resolveAt;
    }
    data.crossTiming = times;
  }
  const gesture = data.crossTiming;
  const smooth = THREE.MathUtils.smoothstep;
  gesture.preload = plan.phase === 'windup'
    ? smooth(1 - plan.remaining / plan.definition.windup, .04, .60) : 0;
  gesture.low = gesture.lowAt == null ? 0 : crossStroke(game.time - gesture.lowAt);
  gesture.high = gesture.highAt == null ? 0 : crossStroke(game.time - gesture.highAt);
  gesture.release = plan.phase === 'recovery'
    ? 1 - smooth(1 - plan.remaining / plan.definition.recovery, .43, .91) : 0;
  return gesture;
}

function kunCross(x, y, z, region, gesture, side, recovery, out) {
  const { preload, low, high, release } = gesture;
  const sign = Math.sign(x) * side;
  const flex = region === FAUNA_REGION.membrane
    ? Math.max(0, Math.abs(x) - .40) * THREE.MathUtils.smoothstep(z, -1.27, -.67) : 0;
  const downstroke = sign > 0 ? low : 0;
  const upstroke = sign < 0 ? high : 0;
  out[0] += Math.sign(x) * flex * (downstroke*.11 + upstroke*.18 + release*recovery*.22);
  out[1] += flex * ((sign > 0 ? -.47 : .38)*preload - downstroke*.92 + upstroke*.91
    - release*recovery*.14);
  out[2] += flex * (downstroke*.34 + upstroke*.43 + release*recovery*.12);
  const roll = side * (-.17*preload - .33*low - .31*high);
  const pitch = -.075*preload - .22*low + .27*high;
  out[0] -= y * roll;
  out[1] += x * roll + z * pitch;
  out[2] -= y * pitch;
}

function raptor(x, y, z, t, fin, u, v, tuck, preparing, pitchCos, pitchSin, out) {
  const span = Math.max(0, Math.abs(x) - .14);
  const featherDelay = span * .49 + Math.max(0, -z) * .56;
  const stroke = Math.sin(t - featherDelay);
  out[0] = x - Math.sign(x) * span * (tuck * .66 + (1 - tuck) * stroke * stroke * .06 + preparing * .31);
  const featherTwist = fin ? Math.sin(t * 1.75 - u * 2.3 - v * .8) * v * v * span * .048 : 0;
  const rise = y + span * (stroke * (.37 - tuck * .29) + tuck * .24 + preparing * .41) + featherTwist;
  const rake = z + span * (Math.cos(t - featherDelay) * .045 - tuck * .62 - preparing * .28);
  out[1] = rise * pitchCos - rake * pitchSin;
  out[2] = rake * pitchCos + rise * pitchSin;
}

function glideRay(type, x, y, z, t, motion, fold, spread, pass, out) {
  const span = Math.max(0, Math.abs(x) - .13);
  const wave = Math.sin(t - span * 1.26 - z * 1.7);
  const tail = Math.max(0, -.42 - z);
  const wing = span * wave * (motion.wing ?? (type === 10 ? .31 : .19));
  const glide = 1 - pass;
  out[0] = x + Math.sin(t + z * 2.6) * tail * (motion.tail ?? .16) * (1 - pass * .72)
    + Math.sign(x) * span * (spread * .13 - fold * .48 + pass * .25);
  out[1] = y * (1 - pass * .74) + wing * (1 - fold * .86) * (1 - pass * .92)
    + tail * Math.cos(t * .66 + z * 2.4) * .12 * glide
    + span * (spread * .25 - fold * .23 - pass * .038);
  out[2] = z + span * (Math.cos(t - span) * .036 - fold * .57 + spread * .095 + pass * .29);
}

function turtle(retract, recovery, pressure, recoil, shell, x, y, z, t, out) {
  const limb = Math.max(0, Math.abs(x) - .54);
  const head = shell ? 0 : Math.max(0, z - .70);
  const tail = Math.max(0, -.72 - z);
  const side = Math.sign(x);
  const stroke = t + z * 5 + side;
  const swim = 1 - recovery * .81;
  const looseFin = limb * THREE.MathUtils.smoothstep(Math.abs(x), .76, 1.25) * recovery;
  out[0] = x + Math.sin(t + z * 3) * tail * .12 * swim
    - side * limb * (retract + pressure * .32) + side * looseFin * .11;
  out[1] = y + Math.sin(stroke) * limb * .14 * swim - head * (recovery * .34 + retract * .28) - looseFin * .17;
  out[2] = z + Math.cos(stroke) * limb * .13 * swim + head * (recovery * .69 - retract * 2.28 - pressure * .37);
  out[1] -= limb * pressure * .11;
  if (shell) {
    const collar = THREE.MathUtils.smoothstep(z, .28, .99);
    const ridge = THREE.MathUtils.smoothstep(y, -.10, .45);
    out[1] += collar * (recovery * .188 - retract * .37) - pressure * (.06 + ridge * .17) + recoil * .13;
    out[2] -= collar * recovery * .11;
  }
}

function createAttackLane(name, tint, strength, style = 0) {
  const progress = { value: 0 }, sweep = { value: -1 }, player = { value: new THREE.Vector2() };
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), brushMaterial(progress, sweep, player, false, style));
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.userData.inkTint = tint;
  mesh.userData.inkTintAmount = strength;
  mesh.renderOrder = 16;
  return { mesh, progress, sweep, player, style, plan: null };
}

function placeAttackLane(lane, group, plan, from, to, width) {
  if (lane.plan !== plan) {
    lane.mesh.geometry.dispose();
    const geometry = laneBrush(from, to, width, lane.style);
    if (from.y !== to.y) {
      const { position, aAlong } = geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        const t = THREE.MathUtils.clamp(aAlong.getX(i), 0, 1);
        position.setY(i, THREE.MathUtils.lerp(from.y, to.y, t));
      }
    }
    lane.mesh.geometry = geometry;
    group.add(lane.mesh);
    lane.plan = plan;
  }
  group.updateWorldMatrix(true, false);
  lane.mesh.matrix.copy(group.matrixWorld).invert();
  lane.mesh.matrixWorldNeedsUpdate = true;
  lane.mesh.visible = true;
}

export class InkFauna {
  constructor(scene, ink) {
    this.scene = scene;
    this.ink = ink;
    this.cache = new Map();
    this.variants = new Map();
    this.live = new Set();
    this.deformed = new Float64Array(3);
    this.lastTime = 0;
    this.pincerLane = null;
    this.dartLane = null;
    this.flightLanes = {};
  }

  contact(event, group) {
    const data = group?.userData;
    const cue = data?.creature?.userData.faunaContact;
    if (!cue || event.amount <= 0 || data.enemy.hp <= 0) return;
    if (!event.from && data.surfaceRecoil) {
      cue.set(0, 0, 0);
    }
    if (!event.from) return;
    const dx = event.from.x - event.x, dz = event.from.z - event.z;
    if (!contactDirection(cue, data.enemy.angle, dx, dz)) return;
    if (event.source === 'claw' && event.strikeId != null) {
      const claw = data.clawContact ??= { direction: new THREE.Vector3(), at: null, id: null };
      if (claw.id === event.strikeId) return;
      claw.id = event.strikeId;
      claw.at = null;
      claw.direction.copy(cue);
      data.animatedFrame = -1;
    }
  }

  syncShallowLane(game, group, kind, config) {
    const dart = kind === 'dartRush';
    const key = dart ? 'dartLane' : 'pincerLane';
    if (!group) {
      if (this[key]) this[key].mesh.visible = false;
      return;
    }
    const plan = group.userData.enemy[kind];
    const { windup, active, width } = config;
    const lane = this[key] ??= createAttackLane(dart ? '苇鱼直刺' : '岸蟹夹进', '#8e3c2c', dart ? .81 : .83);
    placeAttackLane(lane, group, plan, { ...plan.from, y: .15 }, { ...plan.to, y: .15 }, width);
    lane.player.value.set(game.p.x, game.p.z);
    const elapsed = game.time - plan.releaseAt;
    const clamp = THREE.MathUtils.clamp;
    lane.progress.value = clamp(1 + elapsed / windup, 0, 1);
    lane.sweep.value = plan.phase === 'windup' ? -1 : clamp(elapsed / active, 0, 1);
  }

  syncFlightLane(kind, group, game) {
    if (!group) {
      if (this.flightLanes[kind]) this.flightLanes[kind].mesh.visible = false;
      return;
    }
    const bird = kind === 'dive';
    const plan = group.userData.enemy[kind];
    const lane = this.flightLanes[kind] ??= createAttackLane(
      bird ? '墨鸢俯冲' : '云鳐穿掠', bird ? '#83352a' : '#995137', bird ? .89 : .82, bird ? 1 : 2,
    );
    placeAttackLane(lane, group, plan, plan.from, plan.to, bird ? plan.width : CLOUD_PASS.width);
    lane.trace ??= addOccludedLaneTrace(lane.mesh, lane.progress, lane.sweep, lane.player, lane.style);
    placeOccludedLaneTrace(lane.trace, lane.mesh, plan.from, plan.to, bird ? plan.width : CLOUD_PASS.width, game.p);
    lane.player.value.set(game.p.x, game.p.z);
    const elapsed = game.time - plan.releaseAt;
    const clamp = THREE.MathUtils.clamp;
    lane.progress.value = clamp(1 + elapsed / (bird ? .66 : CLOUD_PASS.windup), 0, 1);
    lane.sweep.value = elapsed < 0 ? -1 : clamp(elapsed / (bird ? plan.duration : CLOUD_PASS.active), 0, 1);
  }

  setFlightTraceOccluders(palette, bridge, actor) {
    if (!Object.values(this.flightLanes).some(lane => lane.trace)) return;
    this.flightTraceOcclusion ??= new FlightTraceOcclusion();
    this.flightTraceOcclusion.set(palette, [bridge, actor], this.flightLanes);
  }

  prototype(type, form = 'standard') {
    const variant = form !== 'standard';
    const cached = variant ? this.variants.get(form) : this.cache.get(type);
    if (cached) return cached;
    const geometry = createInkEnemyGeometry(type, { form });
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#afb3b3' }));
    mesh.visible = false;
    this.ink.register(mesh, {
      strokes: false,
      geometryInfluence: type >= 5 ? .48 : .35,
      reserveStrength: .29,
      toneRange: type === 2 || type === 6 ? [.11, .38] : [.14, .47],
      coherentInk: .19,
    });
    const { material } = this.ink.records.find(record => record.mesh === mesh);
    const { geometry: painted } = mesh;
    painted.computeBoundingSphere();
    painted.boundingSphere.radius *= 1.23;
    attachFaunaInk(material, painted, type, this.ink);
    const result = { geometry: painted, material, type };
    if (variant) this.variants.set(form, result);
    else this.cache.set(type, result);
    return result;
  }

  make(enemy, stage = 0) {
    const airborne = stage === 3 && !enemy.boss;
    const visualType = airborne ? (mountainVisuals[enemy.type] ?? enemy.type) : enemy.type;
    const form = formForEnemy(enemy, stage, visualType);
    const forkTail = form === 'fork-tail';
    const source = this.prototype(visualType, form);
    const geometry = source.geometry.clone();
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    if (enemy.boss) geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    const shellWear = enemy.boss && SHELL_WOUNDS[visualType] ? { value: shellWearLevel(enemy) } : null;
    const softOpening = enemy.boss && (visualType === 6 || visualType === 8);
    const bossPhase = enemy.bossPlan?.phase;
    const recovery = Number(bossPhase === 'recovery');
    const material = shellWear || softOpening ? source.material.clone() : source.material;
    if (shellWear) {
      material.uniforms = {
        ...source.material.uniforms,
        uShellWear: shellWear,
        uShellOpen: { value: recovery },
        uOpeningStroke: { value: openingStroke(enemy, recovery) },
      };
    }
    if (softOpening) {
      material.uniforms = { ...source.material.uniforms, uBossRecovery: { value: recovery } };
    }
    const creature = new THREE.Mesh(geometry, material);
    if (threatLandmarks[visualType]) creature.userData.threatCue = new THREE.Vector2();
    const surfaceRecoil = (stage === 0 && visualType === 1) ||
      (stage === 2 && (visualType === 2 || visualType === 4 || visualType === 9));
    if (!enemy.boss && ordinaryTypes.has(visualType)) {
      creature.userData.faunaContact = new THREE.Vector3();
    }
    const group = new THREE.Group();
    creature.name = INK_SPECIES[visualType];
    group.add(new THREE.Group(), creature);
    const [tint, strength] = pigmentByForm[form] ?? pigments[visualType] ?? pigments[0];
    Object.assign(group.userData, {
      creature,
      inkFauna: true,
      species: creature.name,
      enemy,
      visualType,
      surfaceRecoil,
      form,
      forkTail,
      motion: motionByForm[form] ?? baseMotion,
      shellWear,
      softOpening,
      recovery,
      brace: softOpening && (bossPhase === 'windup' || bossPhase === 'active') ? 1 : 0,
      leanSide: Math.sin(enemy.phase) < 0 ? -1 : 1,
      retract: enemy.shield ? .20 : 0,
      visualScale: forkTail ? .88 : 1,
      inkTint: tint,
      inkTintAmount: strength,
      animatedFrame: -1,
    });
    this.live.add(group);
    this.scene.add(group);
    return group;
  }

  update(time, game) {
    const out = this.deformed;
    const delta = Math.min(.08, Math.abs(time - this.lastTime));
    this.lastTime = time;
    let pincerGroup = null, dartGroup = null, diveGroup = null, passGroup = null;
    for (const group of this.live) {
      const data = group.userData;
      const { enemy, creature, motion } = data;
      const { phase, boss } = enemy;
      const type = data.visualType;
      const contact = creature.userData.faunaContact;
      const claw = data.clawContact;
      let clawTwist = 0, clawTilt = 0;
      if (contact) {
        const push = data.surfaceRecoil ? enemy.weaponPush : null;
        if (push) contactDirection(contact, enemy.angle, -push.x, -push.z);
        const force = push ? push.remaining / push.duration : 0;
        if (claw && enemy.hp > 0) {
          const now = game?.time ?? time;
          claw.at ??= now;
          const age = Math.max(0, now - claw.at);
          const smooth = THREE.MathUtils.smoothstep;
          const turn = smooth(age, -.035, .062) * (1 - smooth(age, .10, .27));
          const pressure = 1 - smooth(age, .055, .164);
          const side = Math.abs(claw.direction.x) > .13 ? Math.sign(claw.direction.x) : data.leanSide;
          clawTwist = side * turn * .49;
          clawTilt = turn * .34;
          contact.set(claw.direction.x, claw.direction.y, pressure);
          if (age >= .27) data.clawContact = null;
        } else if (data.surfaceRecoil && enemy.hp > 0 && (enemy.hit > 0 || force > 0)) {
          contact.z = Math.min(1, Math.max(enemy.hit / .12, force * .55)) *
            Math.min(1, Math.hypot(contact.x, contact.y));
        } else contact.set(0, 0, 0);
      }
      const scale = data.visualScale;
      const pincer = game && enemy.pincer;
      if (pincer && !pincer.hit && pincer.phase !== 'recovery') pincerGroup = group;
      const rush = game && enemy.dartRush;
      if (rush && !rush.hit && rush.phase !== 'recovery') dartGroup = group;
      const dive = game && enemy.dive;
      const pass = game && enemy.cloudPass;
      if (dive?.paired && !dive.hit) diveGroup = group;
      if (pass && !pass.hit && (pass.phase === 'windup' || pass.phase === 'active')) passGroup = group;
      const frame = Math.floor(time * (boss || claw ? 60 : 30) + phase);
      if (data.animatedFrame === frame) continue;
      data.animatedFrame = frame;
      const gesture = rangedGesture(rangedPoses[type], enemy, game);
      const fold = Math.max(0, -gesture);
      const spread = Math.max(0, gesture);
      const lakeCup = data.form === 'lake-cup';
      const lakeEel = data.form === 'ribbon-eel';
      const eelCoil = lakeEel ? lakeEelSurge(enemy, game) : 0;
      let dartPursuit = 0;
      let dartBrace = 0, dartThrust = 0, dartRelax = 0;
      if (game && type === 0 && data.form !== 'lake-dart') {
        const dx = game.p.x - enemy.x;
        const dz = game.p.z - enemy.z;
        const distance = Math.hypot(dx, dz);
        const front = (dx * Math.sin(enemy.angle) + dz * Math.cos(enemy.angle)) / Math.max(.01, distance);
        const smooth = THREE.MathUtils.smoothstep;
        dartPursuit = smooth(front, .36, .92) * (1 - smooth(distance, 4.4, 11.6));
        if (rush) {
          const elapsed = game.time - rush.releaseAt;
          const { windup, active, recovery } = DART_RUSH;
          dartBrace = smooth(elapsed, -windup, -.23) * (1 - smooth(elapsed, -.07, .07));
          dartThrust = smooth(elapsed, -.06, .06) * (1 - smooth(elapsed, active - .03, active + .13));
          dartRelax = smooth(elapsed, active, active + .13) * (1 - smooth(elapsed, active + .16, active + recovery));
          dartPursuit *= 1 - Math.max(dartBrace, dartThrust, dartRelax);
        }
      }
      const smooth = THREE.MathUtils.smoothstep;
      const diveAge = dive ? game.time - dive.releaseAt : -Infinity;
      const diveBrace = smooth(diveAge, -.66, -.36) * (1 - smooth(diveAge, -.16, .04));
      const diveTuck = smooth(diveAge, -.24, .07);
      const divePitch = dive ? diveTuck * Math.atan2(dive.from.y - dive.to.y,
        Math.hypot(dive.from.x - dive.to.x, dive.from.z - dive.to.z)) : 0;
      const divePitchCos = Math.cos(divePitch), divePitchSin = Math.sin(divePitch);
      const lowGlide = pass
        ? THREE.MathUtils.smoothstep(game.time - pass.releaseAt, -CLOUD_PASS.windup, -.20)
          * (1 - THREE.MathUtils.smoothstep(game.time - pass.releaseAt, CLOUD_PASS.active, CLOUD_PASS.active + CLOUD_PASS.recovery))
        : 0;
      const threatCue = creature.userData.threatCue;
      let cock = 0, snap = 0;
      if (pincer) {
        const elapsed = game.time - pincer.releaseAt;
        const smooth = THREE.MathUtils.smoothstep;
        const { windup, active, recovery } = CRAB_PINCER;
        cock = smooth(elapsed, -windup, -windup + .24) * (1 - smooth(elapsed, 0, .13));
        snap = smooth(elapsed, .01, .13) * (1 - smooth(elapsed, active, active + recovery * .65));
      }
      if (threatCue && game) {
        const smooth = THREE.MathUtils.smoothstep;
        if (enemy.role === 'flanker') {
          const distance = Math.hypot(game.p.x - enemy.x, game.p.z - enemy.z);
          const side = enemy.flankSide ?? (Math.sin(phase) < 0 ? -1 : 1);
          const approach = 1 - smooth(distance, 4.5, 11.8);
          threatCue.set(pincer?.phase === 'recovery' ? approach * .18 : approach, side);
        } else {
          const age = game.time - (enemy.lastRangedShotAt ?? -Infinity);
          const firing = age >= 0 ? 1 - smooth(age, .14, .43) : 0;
          threatCue.x = Math.max(fold, firing);
        }
      }
      const t = time * (animationFrequency[type] ?? 3) * motion.rate + phase;
      const waterDepth = Math.max(.17, (enemy.y + (boss ? .44 : -.11)) / creature.scale.y - .10);
      const { position, inkRestPosition, faunaPaint } = creature.geometry.attributes;
      const wound = creature.geometry.attributes.aShellWound?.array;
      let firstWound = 0, laterWound = 0;
      if (data.shellWear || data.softOpening) {
        const bossPhase = enemy.bossPlan?.phase;
        const recovering = bossPhase === 'recovery';
        data.recovery = THREE.MathUtils.lerp(data.recovery, Number(recovering),
          1 - Math.exp(-delta * (recovering ? 13 : 20)));
        if (data.softOpening) {
          const bracing = bossPhase === 'windup' || bossPhase === 'active';
          data.brace = THREE.MathUtils.lerp(data.brace, Number(bracing), 1 - Math.exp(-delta * 14));
          creature.material.uniforms.uBossRecovery.value = data.recovery;
        }
      }
      if (data.shellWear) {
        const level = shellWearLevel(enemy);
        data.shellWear.value = THREE.MathUtils.lerp(data.shellWear.value, level, 1 - Math.exp(-delta * 8.6));
        firstWound = THREE.MathUtils.smoothstep(data.shellWear.value, .06, .92);
        laterWound = THREE.MathUtils.smoothstep(data.shellWear.value, 1.04, 1.92);
        creature.material.uniforms.uShellOpen.value = data.recovery;
        creature.material.uniforms.uOpeningStroke.value = openingStroke(enemy, data.recovery, game);
      }
      const paint = faunaPaint.array;
      const cross = type === 8 ? skyCrossGesture(data, enemy, game) : null;
      let shellPressure = 0, shellRecoil = 0;
      if (type === 7) {
        const target = enemy.shield ? .20 : 0;
        data.retract = THREE.MathUtils.lerp(data.retract, target, 1 - Math.exp(-delta * 8.5));
        const plan = enemy.bossPlan;
        if (plan?.definition.name === 'shell-backwash') {
          const smooth = THREE.MathUtils.smoothstep;
          if (plan.phase === 'windup') {
            shellPressure = smooth(1 - plan.remaining / plan.definition.windup, .02, .72);
          } else if (plan.phase === 'active') {
            const age = plan.definition.active - plan.remaining;
            shellPressure = 1 - smooth(age, 0, .22);
            shellRecoil = smooth(age, 0, .065) * (1 - smooth(age, .065, .32));
          }
        }
      }
      const p = position.array;
      const rest = inkRestPosition.array;
      const yawCos = Math.cos(clawTwist), yawSin = Math.sin(clawTwist);
      const tiltCos = Math.cos(clawTilt), tiltSin = Math.sin(clawTilt);
      for (let i = 0, j = 0; i < p.length; i += 3, j += 4) {
        const x = rest[i];
        const y = rest[i + 1];
        const z = rest[i + 2];
        const region = paint[j + 2];
        const fin = region === FAUNA_REGION.membrane;
        const shell = wound?.[j] === 1;
        switch (type) {
          case 0:
            swimmer(type, x, y, z, t, fin, paint[j], paint[j + 1], motion, out);
            dartStroke(x, y, z, dartPursuit, dartBrace, dartThrust, dartRelax, out);
            break;
          case 1:
            crustacean(enemy, 0, x, y, z, t, motion, out);
            if (threatCue) {
              const lead = THREE.MathUtils.smoothstep(x * threatCue.y, .31, .55);
              const tip = Math.max(0, z - .40);
              const claw = tip * THREE.MathUtils.smoothstep(Math.abs(x), .30, .56);
              out[0] += Math.sign(x) * claw * (cock * .32 - snap * .48);
              out[0] += threatCue.y * lead * claw * threatCue.x * .30;
              out[1] += lead * tip * threatCue.x * .64 + claw * (cock * (.24 + lead * .75) - snap * .21);
              out[2] += claw * (snap * .23 - cock * .17 + lead * threatCue.x * .14);
            }
            break;
          case 5:
            crustacean(enemy, data.recovery, x, y, z, t, motion, out);
            crabForebody(x, z, region, shell, data.recovery, out);
            break;
          case 2:
            medusa(x, y, z, t, waterDepth, paint[j], paint[j + 3], motion, fold, spread, out);
            if (lakeCup) lakePolypPose(x, y, z, fold, spread, out);
            break;
          case 4:
            swimmer(type, x, y, z, t, fin, paint[j], paint[j + 1], motion, out);
            if (lakeEel) lakeEelPose(x, y, z, eelCoil, out);
            break;
          case 6:
            medusa(x, y, z, t, waterDepth, paint[j], paint[j + 3], motion, 0, 0, out);
            lanternOpening(x, y, z, region, data.brace, data.recovery, paint[j + 3], out);
            break;
          case 3: raptor(x, y, z, t, fin, paint[j], paint[j + 1], diveTuck, diveBrace,
            divePitchCos, divePitchSin, out); break;
          case 7: turtle(data.retract, data.recovery, shellPressure, shellRecoil, shell, x, y, z, t, out); break;
          case 8:
            swimmer(type, x, y, z, t, fin, paint[j], paint[j + 1], motion, out);
            kunOpening(x, y, z, region, data.brace, data.recovery, data.leanSide, out);
            if (cross) kunCross(x, y, z, region, cross, data.leanSide, data.recovery, out);
            break;
          case 9: case 10: glideRay(type, x, y, z, t, motion, fold, spread, lowGlide, out); break;
          default: swimmer(type, x, y, z, t, fin, paint[j], paint[j + 1], motion, out);
        }
        if (shell) {
          const chip = wound[j + 3] * laterWound;
          out[0] -= x * chip * .39;
          out[1] -= wound[j + 1] * firstWound * .039 + wound[j + 2] * laterWound * .049 + chip * .103;
          out[2] -= z * chip * .39;
        }
        if (contact?.z > .01) contactRecoil(x, y, z, type, contact, out);
        if (clawTilt > .01) clawFollowThrough(out, contact, yawCos, yawSin, tiltCos, tiltSin);
        p[i] = out[0] * scale;
        p[i + 1] = out[1] * scale;
        p[i + 2] = out[2] * scale;
      }
      position.needsUpdate = true;
      if (boss) {
        creature.geometry.computeVertexNormals();
        smoothFaunaSeams(creature.geometry);
      }
    }
    if (game) {
      this.syncShallowLane(game, pincerGroup, 'pincer', CRAB_PINCER);
      this.syncShallowLane(game, dartGroup, 'dartRush', DART_RUSH);
      this.syncFlightLane('dive', diveGroup, game);
      this.syncFlightLane('cloudPass', passGroup, game);
    }
  }

  remove(group) {
    this.live.delete(group);
    group.userData.creature.geometry.dispose();
    if (group.userData.shellWear || group.userData.softOpening) group.userData.creature.material.dispose();
    this.scene.remove(group);
  }

  inspect() {
    const models = new Map(this.cache);
    for (const model of this.variants.values()) if (!models.has(model.type)) models.set(model.type, model);
    const variants = Object.fromEntries([...this.variants].map(([name, model]) => [name, model.geometry.index.count / 3]));
    return {
      species: INK_SPECIES,
      models: [...models.keys()],
      live: this.live.size,
      geometry: 'original procedural 3D anatomy',
      triangles: Object.fromEntries([...models].map(([type, model]) => [type, model.geometry.index.count / 3])),
      forkTailTriangles: variants['fork-tail'] ?? 0,
      variants,
      sourceAlbedo: false,
    };
  }
}
