import { MathUtils, Vector2, Vector3, Vector4 } from 'three';
import { GATE_BIND, STOMP_LOAD } from '../heaven-finale.js';

const { smoothstep } = MathUtils;

const heavenWeather = /* glsl */ `
  uniform vec3 uEndingWeather;
  uniform vec4 uEndingGate,uEndingSubject,uEndingFocus;
  uniform vec2 uRoofWake;

  vec2 courtPlan(vec3 point,vec2 axis){
    return vec2(dot(point.xz,vec2(axis.y,-axis.x)),dot(point.xz,axis));
  }

  vec3 gradeLock(vec3 color,vec3 paper,vec3 eye,vec3 sight,vec2 axis,float reach,
    vec3 surface,vec2 plan,float ink,float fiber,float silhouette,float subjectSurface,float coverage,float mineral){
    float approach=dot(sight.xz,axis);
    if(approach<.025)return color;
    float ahead=dot(eye.xz,axis);
    float open=uEndingFocus.y;
    float age=uEndingFocus.z;

    // The light belongs to the passage between the leaves. Foreground
    // door edges and the bronze latch cut through it at their true depth.
    float seamDepth=(3.15+5.3*sin(open*1.37)-ahead)/approach;
    vec3 seamPoint=eye+sight*seamDepth;
    float across=courtPlan(seamPoint,axis).x;
    float height=smoothstep(-14.3,-13.75,seamPoint.y)*(1.-smoothstep(-4.65,-3.95,seamPoint.y));
    float width=.112+2.65*open*open;
    float seam=1.-smoothstep(width*.30,width,abs(across)+(fiber-.5)*.029);
    float through=step(.0,seamDepth)*smoothstep(seamDepth-.38,seamDepth+.12,reach);
    float shut=1.-smoothstep(.012,.075,open);
    float light=smoothstep(.018,.225,open)*seam*height*through;
    color=mix(color,paper*vec3(1.05,1.016,.944),light*.90);
    color=mix(color,paper*vec3(.28,.249,.216),shut*seam*height*through*.84);

    // Closing pressure pushes a wet brush mass across the sill. Its two
    // broken edges part around the foreground dragon and taut iron links.
    float roll=smoothstep(-.15,.23,age);
    float remain=1.-smoothstep(.56,1.74,age);
    float plumeDepth=(1.15-.96*roll-ahead)/approach;
    vec3 plume=eye+sight*plumeDepth;
    float x=courtPlan(plume,axis).x;
    float skew=x+.67*roll;
    float span=2.8+12.4*roll;
    float torn=noise3(vec3(skew*.22+age*.48,plume.y*.45,8.19));
    float drag=fbm(vec3(skew*.13+age*.65,plume.y*.51,3.21));
    float edge=plume.y+13.10+.08*x+1.9*(drag-.48)+.53*(torn-.5);
    float footprint=1.-smoothstep(span*.46,span,abs(skew)+2.0*(torn-.5));
    float loaded=smoothstep(-1.65,-.55,edge)*(1.-smoothstep(.50,1.78,edge));
    float pulled=smoothstep(1.05,1.62,edge)*(1.-smoothstep(1.7,2.77,edge))
      *smoothstep(.31,.67,torn)*.42;
    float depth=smoothstep(plumeDepth-.72,plumeDepth+.19,reach)*step(0.,plumeDepth);
    float clear=(1.-.74*silhouette)*(1.-.92*subjectSurface);
    float pigment=1.-.86*coverage*max(mineral,smoothstep(.29,.76,ink));
    float air=depth*footprint*(loaded+pulled)*(.36+.58*smoothstep(.24,.67,drag));
    float stain=noise3(vec3(plan.x*.23+age*.50,plan.y*.48,14.26));
    float sweep=plan.y-(1.85-1.65*roll)+.039*plan.x+(stain-.46)*1.24;
    float floorWash=(1.-smoothstep(.34,2.26,abs(sweep)))
      *(1.-smoothstep(1.2,13.8*roll+2.1,abs(plan.x)))
      *(1.-smoothstep(.31,1.06,abs(surface.y+14.45)))*coverage;
    float grounded=floorWash*(.34+.61*smoothstep(.30,.72,stain));
    float deposit=roll*remain*max(air,grounded)*clear*pigment;
    return mix(color,paper*vec3(.20,.221,.211),deposit*.93);
  }

  vec3 gradeRoof(vec3 color,vec3 paper,vec3 eye,vec3 sight,vec2 axis,vec3 surface,vec2 plan,
    float reach,float ink,float coverage,float reserved,float mineral,float subjectSurface){
    // Keep the load-bearing face and its existing ochre separate from the
    // black eave. The dry exit opens behind the line of movement.
    float upper=smoothstep(1.5,5.6,surface.y);
    float nearGate=(1.-smoothstep(12.,24.,abs(plan.y)))*(1.-smoothstep(16.,31.,abs(plan.x)));
    float body=smoothstep(.19,.65,ink)*(1.-.76*reserved);
    float press=fbm(vec3(plan*vec2(.092,.18),surface.y*.31+2.45));
    float loaded=upper*nearGate*body*coverage*(1.-.83*mineral)*(1.-.96*subjectSurface);
    color*=1.-uEndingFocus.w*loaded*(.24+.39*smoothstep(.26,.70,press));

    float bankDepth=clamp(length(eye)*.64+23.,30.,57.);
    vec3 rear=eye+sight*bankDepth;
    vec2 bank=courtPlan(rear,axis);
    float windswept=fbm(vec3(bank.x*.046-uMistTime*.062,bank.y*.025,6.8));
    float fold=rear.y-4.4+.14*bank.x+9.2*(windswept-.46);
    float highInk=smoothstep(.25,3.6,fold)*(1.-smoothstep(12.,29.,fold));
    float breath=smoothstep(bankDepth-4.,bankDepth+7.,reach);
    float brush=highInk*smoothstep(.27,.63,windswept)*breath*(1.-.84*coverage);
    float clear=(1.-smoothstep(.025,.23,ink))*breath*(1.-highInk);
    color=mix(color,paper*vec3(.31,.34,.33),uEndingFocus.w*brush*.42);
    return mix(color,paper*vec3(1.015,1.00,.953),uEndingFocus.w*clear*.34);
  }

  vec3 gradeRoofWake(vec3 color,vec3 paper,vec3 eye,vec3 sight,vec2 axis,float reach,float fiber,
    float ink,float coverage,float creature,float mineral){
    if(creature>.5)return color;
    float direction=dot(sight.xz,axis);
    if(direction<.02)return color;
    float life=uRoofWake.y;
    float plane=(1.8+1.52*life-dot(eye.xz,axis))/direction;
    vec3 point=eye+sight*plane;
    float x=courtPlan(point,axis).x;
    float center=.88-.62*life+.10*x;
    float span=10.6+2.8*life;
    float plume=fbm(vec3(x*.19-.16*life,point.y*.28-life*.57,8.43));
    float tooth=noise3(vec3(x*.44,point.y*.58+life*.85,2.37));
    float altitude=point.y-center+3.2*(plume-.43)+.72*(tooth-.50);
    float fold=smoothstep(-3.9,-1.24,altitude)*(1.-smoothstep(1.5,5.1,altitude));
    float side=1.-smoothstep(span*.46,span,abs(x+1.87-1.20*life)+1.5*(tooth-.48));
    float brush=.43+.57*smoothstep(.23,.70,plume);
    // The near chipped lip stays solid. The release is strongest where the
    // breath crosses the broken bay and cast behind the rising dragon.
    float depth=smoothstep(plane-1.25,plane+1.12,reach)*step(0.,plane);
    float edge=smoothstep(.03,.61,ink)*coverage;
    float reserve=1.-.86*mineral;
    float lay=depth*side*fold*brush*(.86+.14*fiber);
    float dryBank=(1.-smoothstep(.36,2.15,abs(altitude-1.95)))
      *side*smoothstep(.35,.76,tooth)*depth;
    float amount=uRoofWake.x*(lay*.51+dryBank*.15)*mix(.14,1.,edge)*reserve;
    return mix(color,paper*vec3(.61,.64,.62),amount);
  }

  // Resolve the same world-space depth used by the valley mist. Foreground
  // ink stays sharp while the pale court and the sky take different washes.
  vec3 heavenWeatherColor(vec3 color,vec3 paper,float ink,float depth,float fiber,
    float coverage,float reserved,float mineralHold,vec4 mineral,float creature){
    float storm=uEndingWeather.x, clearing=uEndingWeather.y, warmth=uEndingWeather.z;
    float time=uMistTime;
    vec4 clip=uMistProjection*vec4(vUv*2.-1.,1.,1.);
    vec3 view=clip.xyz/clip.w;
    vec3 sight=normalize(mat3(uMistWorld)*view);
    float reach=depth*length(view)/max(.01,-view.z);
    vec3 eye=uMistCamera-uEndingGate.xyz;
    vec2 axis=vec2(sin(uEndingGate.w),cos(uEndingGate.w));
    vec3 subject=uEndingSubject.xyz-uMistCamera;
    float subjectDepth=max(0.,dot(subject,sight));
    float gap=length(subject-sight*subjectDepth);
    float silhouette=(1.-smoothstep(4.6,12.3,gap))*uEndingSubject.w;
    float subjectSurface=silhouette*(1.-smoothstep(2.8,12.,abs(reach-subjectDepth)));
    float mineralStrength=max(mineralHold,mineral.a*smoothstep(.02,.22,
      max(mineral.r,max(mineral.g,mineral.b))-min(mineral.r,min(mineral.g,mineral.b))));

    vec3 surface=eye+sight*reach;
    vec2 plan=courtPlan(surface,axis);
    float hazeDepth=smoothstep(25.,78.,reach);
    float courtDepth=smoothstep(10.,32.,plan.y);
    float sideCourt=smoothstep(25.,59.,abs(plan.x))*(.53+.47*hazeDepth);
    float distant=max(courtDepth*hazeDepth,sideCourt);
    float paperGrain=.72+.28*smoothstep(.26,.73,fiber);
    vec3 warmPaper=paper*vec3(1.009,.995,.947);
    float edgeTint=smoothstep(.09,.36,ink)*(1.-smoothstep(.63,.94,ink));
    color=mix(color,warmPaper,distant*coverage*paperGrain*(.32+.09*warmth)
      *(1.-.68*mineralStrength)*(1.-subjectSurface*.89));

    // A broad charcoal shoulder builds in the already loaded eaves. The
    // beam's mineral and fly-white in the wings keep their local contrast.
    float gateNear=(1.-smoothstep(10.,22.,abs(plan.y+2.)))
      *(1.-smoothstep(18.,32.,abs(plan.x)))*coverage;
    float roofInk=gateNear*edgeTint*(1.-.83*reserved)*(1.-.83*mineralStrength)*(1.-subjectSurface*.97);
    float pressure=fbm(vec3(plan*vec2(.079,.133),surface.y*.20+9.31));
    color*=1.-roofInk*(.12+.17*smoothstep(.28,.65,pressure));

    float bankDepth=clamp(length(eye)*.78+19.,34.,66.);
    vec3 low=eye+sight*bankDepth;
    vec3 high=eye+sight*(bankDepth+28.);
    vec2 lowPlan=courtPlan(low,axis),highPlan=courtPlan(high,axis);
    float swelling=sin(time*.77+lowPlan.y*.042);
    float flow=time*.094;
    float swell=fbm(vec3(lowPlan.x*.043-flow,lowPlan.y*.028,3.48));
    float trailing=noise3(vec3(lowPlan.x*.112-flow*1.49,low.y*.20+lowPlan.y*.029,8.74));
    float sweep=3.3*sin(lowPlan.x*.096+lowPlan.y*.024-time*.36);
    float edge=low.y+.23*lowPlan.x+16.5*(swell-.47)+2.5*swelling+sweep;
    float wetEdge=edge+2.9*(trailing-.5)+.88*(fiber-.5);
    float shoulder=smoothstep(-1.6,2.1,wetEdge)*(1.-smoothstep(8.,23.,edge));
    float ragged=smoothstep(.22,.67,swell+.24*(trailing-.5));
    float dryTail=smoothstep(-10.9,-7.1,wetEdge)*(1.-smoothstep(-6.0,-3.9,wetEdge));
    float lowVisible=smoothstep(bankDepth-5.,bankDepth+6.,reach);
    float highVisible=smoothstep(bankDepth+17.,bankDepth+34.,reach);
    float highBody=fbm(vec3(highPlan.x*.026-time*.053,highPlan.y*.019,11.3));
    float highEdge=high.y+9.+.13*highPlan.x+18.*(highBody-.46);
    float upper=smoothstep(-4.,8.,highEdge)*(1.-smoothstep(20.,38.,highEdge));

    float reserve=(1.-.83*silhouette)*(1.-.71*mineralStrength*coverage);
    float airy=1.-.63*coverage*smoothstep(.21,.72,ink);
    float highDeposit=highVisible*upper*(.11+.39*smoothstep(.34,.69,highBody));
    float darkFold=lowVisible*(shoulder*ragged*.98+dryTail*ragged*trailing*.44);
    color=mix(color,paper*vec3(.54,.60,.59),storm*highDeposit*reserve*airy);
    color=mix(color,paper*vec3(.25,.31,.31),storm*darkFold*reserve*airy);

    // Clear air reads as warmer paper beyond the audience table. Only the
    // far bank responds to the split beam's recoil.
    float blank=(1.-smoothstep(.03,.29,ink))*(1.-subjectSurface*.88);
    color=mix(color,warmPaper,blank*(.13+.26*warmth)*smoothstep(9.,31.,reach));
    float ringDistance=length(vec2(lowPlan.x*.73,low.y*1.4));
    float displaced=1.-smoothstep(1.8,6.4,abs(ringDistance-(6.+clearing*34.)+5.*(swell-.5)));
    float recoil=smoothstep(.015,.15,clearing)*(1.-smoothstep(.55,1.,clearing));
    float airBank=lowVisible*displaced*smoothstep(.28,.78,trailing+(fiber-.5)*.13);
    color=mix(color,warmPaper,recoil*airBank*.19*blank);
    if(uEndingFocus.x>.5)color=gradeLock(color,paper,eye,sight,axis,reach,surface,plan,ink,fiber,
      silhouette,subjectSurface,coverage,mineralStrength);
    if(uEndingFocus.w>.002)color=gradeRoof(color,paper,eye,sight,axis,surface,plan,reach,
      ink,coverage,reserved,mineralStrength,subjectSurface);
    if(uRoofWake.x>.002)color=gradeRoofWake(color,paper,eye,sight,axis,reach,fiber,ink,coverage,creature,mineralStrength);
    return color;
  }
`;

/** Leave contact and UI readable by painting air only along visible depth. */
export class EndingGrade {
  constructor(ink) {
    const material = ink.postMaterial;
    this.weather = new Vector3();
    this.gate = new Vector4();
    this.subject = new Vector4();
    this.focus = new Vector4();
    this.roofWake = new Vector2();
    Object.assign(material.uniforms, {
      uEndingWeather: { value: this.weather },
      uEndingGate: { value: this.gate },
      uEndingSubject: { value: this.subject },
      uEndingFocus: { value: this.focus },
      uRoofWake: { value: this.roofWake },
    });
    material.fragmentShader = material.fragmentShader.replace('void main() {', `${heavenWeather}
      void main() {`);
    material.fragmentShader = material.fragmentShader.replace('  gl_FragColor=vec4(color,1.0);', `
      if(uRaw<.5&&uCompare<.5&&uMistStage>3.5&&uEndingSubject.w>.5){
        color=heavenWeatherColor(color,paper,ink,depth,fiber,covered,reserved,mineralHold,mineral,
          covered*(1.-step(.88,inkSupport.a)));
      }
      gl_FragColor=vec4(color,1.0);`);
    material.needsUpdate = true;
  }

  update(finale, dragon) {
    if (!finale) {
      this.weather.set(0, 0, 0);
      this.subject.w = 0;
      this.roofWake.set(0, 0);
      return;
    }
    const { phase, age, impact, threshold, ending } = finale;
    const lock = phase === 'lock' || phase === 'complete' && ending === 'locked';
    let storm = 0;
    if (phase === 'approach') storm = .75 * smoothstep(age, .2, 1.8);
    else if (phase === 'trial') storm = finale.warning?.kind === 'lock'
      ? .42 + .32 * smoothstep(finale.warning.age, 0, .82)
      : .38 + .20 * smoothstep(finale.warning?.age ?? 0, 0, .88);
    else if (phase === 'choice') storm = .75 * (1 - smoothstep(age, .16, 1.9));
    else if (lock) storm = .83 + .17 * smoothstep(age, .10, 1.5);

    const release = phase === 'stomp' ? Math.max(0, age - finale.impactAt - STOMP_LOAD) : 0;
    const clearing = Math.min(1, release / 2.25);
    const warmth = phase === 'audience' ? smoothstep(age, .18, 1.65) : phase === 'blessing' ? 1 : 0;
    const roof = phase === 'stomp' ? 1 - smoothstep(release, .39, 1.95)
      : phase === 'choice' && finale.secret ? smoothstep(dragon?.y ?? 0, impact.y - 2, impact.y + 4.5) : 0;
    this.weather.set(storm, clearing, warmth);
    this.gate.set(impact.x, impact.y, impact.z, Math.atan2(threshold.x - impact.x, threshold.z - impact.z));
    this.subject.set(dragon?.x ?? 0, (dragon?.y ?? 0) - .8, dragon?.z ?? 0, Number(Boolean(dragon)));
    this.roofWake.set(phase==='stomp' ? smoothstep(release,.32,.66)*(1-smoothstep(release,1.16,1.65)) : 0, release);
    this.focus.set(Number(lock), finale.gateOpen ?? 0, age - GATE_BIND.latch, roof);
  }
}
