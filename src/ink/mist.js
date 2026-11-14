import * as THREE from 'three';
import { mountainRiver } from './landforms.js';

const valleySlices=24;
const valleyFirstZ=-67;
const valleyLastZ=144;
const valleyStep=(valleyLastZ-valleyFirstZ)/(valleySlices-1);

/** Stage mist samples world space only up to the actual visible surface. */
export class ValleyMist {
  constructor(ink) {
    const material = ink.postMaterial;
    this.uniforms = {
      uMistStage: { value: 0 },
      uSettlementRain: { value: 0 },
      uTrialCloud: { value: 0 },
      uMistTime: { value: 0 },
      uMistCamera: { value: new THREE.Vector3() },
      uMistProjection: { value: new THREE.Matrix4() },
      uMistWorld: { value: new THREE.Matrix4() },
      uWingWake: { value: new THREE.Vector4(0, 0, 0, -1) },
      uWingBackdrop: { value: 0 },
      uChapterPaper: { value: new THREE.Vector4(0, 0, 0, -1) },
      uClearPocket: { value: new THREE.Vector4() },
      uClearSide: { value: new THREE.Vector4() },
      uValleyStart: { value: valleyFirstZ },
      uValleyBends:{value:Array.from({length:valleySlices},(_,i)=>{
        const bend=mountainRiver(valleyFirstZ+valleyStep*i);
        return new THREE.Vector2(bend.x,bend.halfWidth);
      })},
    };
    Object.assign(material.uniforms, this.uniforms);
    material.fragmentShader = `
      uniform float uMistStage,uMistTime,uTrialCloud,uSettlementRain;
      uniform vec3 uMistCamera;
      uniform vec4 uWingWake,uChapterPaper;
      uniform vec4 uClearPocket,uClearSide;
      uniform float uWingBackdrop,uValleyStart;
      uniform mat4 uMistProjection,uMistWorld;
      uniform vec2 uValleyBends[${valleySlices}];
      ` + material.fragmentShader;
    material.fragmentShader = material.fragmentShader.replace('void main() {', `
      vec2 valleySection(float z) {
        float slot=clamp((z-uValleyStart)/${valleyStep.toFixed(7)},0.,${(valleySlices-1).toFixed(1)});
        int i=min(int(slot),${valleySlices-2});
        return mix(uValleyBends[i],uValleyBends[i+1],slot-float(i));
      }
      float mistAlongBend(vec3 start,vec3 end) {
        vec3 ray=end-start;
        float lengthToSurface=length(ray);
        vec3 direction=ray/max(.001,lengthToSurface);
        float deposit=0.;
        for(int i=0;i<5;i++) {
          float stepIndex=float(i);
          float sampleDepth=13.5+stepIndex*11.9+stepIndex*stepIndex*.96;
          vec3 world=start+direction*min(sampleDepth,lengthToSurface);
          vec2 bend=valleySection(world.z);
          float across=(world.x-bend.x)/max(1.,bend.y);
          float side=abs(across);
          vec2 stroke=vec2(world.z*.067+uMistTime*.016,across*1.84);
          float cloud=noise3(vec3(stroke,4.85));
          float gap=noise3(vec3(stroke*vec2(1.9,.87)+vec2(5.9,1.7),2.53));
          float shore=smoothstep(.34,.80,side)*(1.-smoothstep(1.23,1.84,side));
          float height=2.4+shore*(2.0+cloud*5.0)+gap*.82;
          float low=1.-smoothstep(1.2,4.2+shore*2.5,abs(world.y-height));
          float wisp=smoothstep(.41,.69,cloud*.71+gap*.29);
          float visibleDepth=smoothstep(sampleDepth-3.,sampleDepth+3.6,lengthToSurface);
          deposit+=visibleDepth*low*wisp*(.13+.87*shore)*(.84+stepIndex*.12);
        }
        float pockets=1.-exp(-deposit*.34);
        vec2 distantBend=valleySection(end.z);
        float distantCross=abs(end.x-distantBend.x)/max(1.,distantBend.y);
        float middleValley=1.-smoothstep(.92,2.1,distantCross);
        float heightVeil=1.-smoothstep(12.5,29.,end.y);
        float aerial=smoothstep(22.,76.,lengthToSurface)*(.105+.43*middleValley)*heightVeil;
        // The rain shot looks down onto rinsed stone and water. Keep the
        // distant planes and let the near bank emerge from the low cloud.
        float closeRain=uSettlementRain*(1.-smoothstep(49.,96.,lengthToSurface));
        aerial*=1.-closeRain*.76;
        pockets*=1.-closeRain*.70;
        // Air settles at the feet of remote ridges. The caps carry a
        // trace of mineral color as each successive range returns to paper.
        float remote=smoothstep(67.,140.,lengthToSurface);
        float bank=smoothstep(.55,1.26,distantCross);
        float layering=noise3(vec3(end.x*.041,end.z*.026,15.72));
        float foot=1.-smoothstep(2.5,13.0,end.y+(layering-.5)*6.2);
        float planes=remote*bank*(.14+.33*foot);
        return min(.71,pockets+aerial*(1.-pockets*.54)+planes);
      }
      vec2 chapterRiverPaper(vec3 point, float age, float existingInk) {
        // Put the opening behind the creature at the river bend. A tilted,
        // irregular wash leaves a narrow run of loaded ink at both banks.
        vec3 subject=uChapterPaper.xyz;
        float start=smoothstep(4.03,4.70,age);
        float ending=1.-smoothstep(5.73,6.50,age);
        float weight=start*ending;
        vec3 ray=point-uMistCamera;
        vec3 back=uMistWorld[2].xyz;
        float sceneDepth=-dot(ray,back);
        float headDepth=-dot(subject-uMistCamera,back);
        float behind=smoothstep(headDepth+4.,headDepth+15.,sceneDepth);
        float sheetZ=subject.z+mix(8.,19.,smoothstep(4.03,5.73,age));
        float zAlong=sheetZ-uMistCamera.z;
        if(zAlong<=0. || sceneDepth<.1) return vec2(0.);
        vec3 sheet=uMistCamera+ray*(zAlong/max(ray.z,.1));
        vec3 centre=uMistCamera+(subject-uMistCamera)*(zAlong/max(subject.z-uMistCamera.z,.1));
        vec2 river=valleySection(sheetZ);

        // Start the torn edge in the lower river and draw its branches outward.
        // The paint is sampled in world units, so it doesn't follow the screen.
        vec2 p=vec2(sheet.x-mix(centre.x,river.x,.21),sheet.y-centre.y);
        float bodyWidth=clamp(headDepth*.49+6.0,12.,22.);
        float drag=p.x-.47*p.y;
        float slope=.07*drag;
        vec2 brushSpace=vec2((sheet.x-.56*sheet.y)*.15-age*.72,sheet.y*.21);
        float wash=noise3(vec3(brushSpace,7.7));
        float tooth=noise3(vec3(brushSpace*vec2(2.4,4.6)+1.2,13.));
        float edgeNoise=3.6*(wash-.5)+1.0*(tooth-.5);
        float banks=1.-smoothstep(bodyWidth*.59,bodyWidth*1.16,abs(drag)+edgeNoise);
        float height=smoothstep(-10.8,-2.5,p.y+slope+edgeNoise)*
                     (1.-smoothstep(7.4,16.0,p.y+edgeNoise));
        float leading=smoothstep(sceneDepth,sceneDepth+27.,headDepth+mix(31.,85.,start));
        float crest=smoothstep(16.7,23.6,point.y)*
                    smoothstep(48.,57.,point.z)*(1.-smoothstep(72.,83.,point.z));
        float paper=weight*behind*leading*banks*height*(1.-.78*crest);

        // The remaining wash moves behind the nape and withdrawing wing
        // tips while leaving the shore below visible through its torn edge.
        float opening=smoothstep(4.37,4.70,age)*(1.-smoothstep(5.28,5.76,age));
        if(opening>.001&&sceneDepth>headDepth){
          vec3 silhouette=uMistCamera+ray*(headDepth/sceneDepth)-subject;
          float paperRight=dot(silhouette,uMistWorld[0].xyz);
          float paperUp=dot(silhouette,uMistWorld[1].xyz);
          float fur=1.4*(wash-.5)+.43*(tooth-.5);
          float broad=1.-smoothstep(4.8,10.8,abs(paperRight-5.0+.72*paperUp+fur));
          float torn=smoothstep(-6.8,-3.1,paperUp+.20*paperRight+fur)
            *(1.-smoothstep(-.50,2.80,paperUp+.09*paperRight+fur));
          float distanceFade=smoothstep(headDepth+1.8,headDepth+7.3,sceneDepth);
          float skin=opening*broad*torn*distanceFade*(.51+.34*wash);
          paper=max(paper,skin);
        }

        vec2 foot=valleySection(point.z);
        float shore=abs(point.x-foot.x)/max(foot.y,1.);
        float side=smoothstep(.53,.93,shore)*(1.-smoothstep(1.6,2.20,shore));
        float nearWater=smoothstep(.40,1.7,point.y)*(1.-smoothstep(4.1,8.5,point.y));
        float reach=smoothstep(subject.z-17.,subject.z-6.,point.z)*
                    (1.-smoothstep(subject.z+34.,subject.z+57.,point.z));
        float bankPool=noise3(vec3((point.z+.78*point.x)*.14,point.x*.28,6.7));
        float paintLoad=smoothstep(.30,.66,bankPool+.15*existingInk);
        float ink=weight*side*nearWater*reach*paintLoad*existingInk*
                  smoothstep(headDepth+1.2,headDepth+10.,sceneDepth)*(1.-.76*paper);
        return vec2(.91*paper,ink);
      }
      vec2 wakeInRiver(vec3 point) {
        float sincePress=uWingWake.w;
        if(sincePress<=.039 || sincePress>=.56 || abs(point.y+.12)>.097) return vec2(0.);
        vec2 heading=vec2(sin(uWingWake.z),cos(uWingWake.z));
        float duration=clamp((sincePress-.04)/.52,0.,1.);
        vec2 origin=uWingWake.xy-heading*(2.0-.7*duration);
        vec2 tangent=vec2(heading.y,-heading.x);
        vec2 offset=point.xz-origin;
        vec2 local=vec2(dot(offset,tangent),dot(offset,heading));

        // The pressure spreads more across the current than along it, then
        // sheds a broken, shallower wash when it touches either bank.
        vec2 spread=mix(vec2(1.45,.83),vec2(16.2,5.6),pow(duration,.75));
        float distanceToRing=length(local/spread)-1.;
        float crest=1.-smoothstep(.040,.115,abs(distanceToRing));
        float lip=1.-smoothstep(.024,.091,abs(distanceToRing+.14));
        vec2 channel=valleySection(point.z);
        float side=sign(point.x-channel.x);
        float bank=abs(point.x-channel.x)/max(channel.y,1.);
        float actualWater=1.-smoothstep(.92,1.03,bank);

        float reachX=origin.x+side*spread.x;
        vec2 bend=valleySection(origin.y+heading.y*.9);
        float contact=smoothstep(-2.2,2.1,side*(reachX-bend.x)-bend.y);
        float shoreWalk=sincePress*8.3;
        float shoreLine=local.y+.34*shoreWalk;
        float stagger=1.-smoothstep(1.60+shoreWalk,2.65+1.72*shoreWalk,abs(shoreLine));
        float shore=contact*stagger*exp(-76.*abs(bank-.89))*actualWater;

        if(max(max(crest,lip)*actualWater,shore)<.005) return vec2(0.);
        float tooth=noise3(vec3(point.x*.31+point.z*.21,point.z*.38,6.73));
        float broken=smoothstep(.23,.71,tooth);
        float open=smoothstep(.04,.12,sincePress)*(1.-smoothstep(.35,.56,sincePress));
        float stroke=open*(crest*actualWater*(.30+.70*broken)+shore*broken*.86);
        return vec2(.29*stroke, .31*open*lip*actualWater*(.38+.62*broken));
      }
      float cloudFeet(vec3 start,vec3 end) {
        vec3 ray=end-start;
        float span=length(ray);
        float stain=0.;
        for(int i=0;i<4;i++) {
          float t=.29+float(i)*.20;
          vec3 p=start+ray*t;
          vec2 drift=p.xz*.037+vec2(uMistTime*.013,0.);
          float bank=fbm(vec3(drift,4.9));
          float height=5.0+bank*7.3;
          float vapor=1.-smoothstep(1.9,7.2,abs(p.y-height));
          stain+=vapor*smoothstep(.32,.70,bank)*smoothstep(7.,24.,span*t);
        }
        return 1.-exp(-stain*.23);
      }
      float trialCloud(vec3 start,vec3 end) {
        vec3 span=end-start;
        float depth=length(span);
        vec3 direction=span/max(.01,depth);
        if(direction.y<=0. || depth<31.)return 0.;
        float aboveHorizon=smoothstep(0.,.15,direction.y);
        float stain=0.;
        for(int i=0;i<3;i++){
          float d=43.+float(i)*25.;
          float visibleDepth=smoothstep(d-8.,d+7.,depth);
          vec3 point=start+direction*d;
          float bank=smoothstep(24.,30.,point.y)*(1.-smoothstep(39.,51.,point.y));
          vec3 p=vec3(point.x+point.z*.42,point.y*1.65,point.z-point.x*.19)*.036;
          p.x-=uMistTime*.05;
          float deposit=fbm(p+vec3(2.2,7.8,13.7));
          float dry=noise3(p*vec3(6.,12.,7.)+8.4);
          stain+=visibleDepth*bank*smoothstep(.44,.71,deposit+(dry-.5)*.084);
        }
        return aboveHorizon*(1.-exp(-stain*.63));
      }
      void main() {
    `);
    material.fragmentShader = material.fragmentShader.replace(
      '  if(uRaw > .5)',
      `  if(uMistStage>2.5&&uRaw<.5) {
        float depth=texture2D(tDepth,vUv).r;
        vec4 clip=uMistProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);
        vec3 target=(uMistWorld*vec4(clip.xyz/clip.w,1.)).xyz;
        float high=step(3.5,uMistStage);
        float opacity;
        vec2 wingWater=vec2(0.);
        if(high>.5){
          opacity=cloudFeet(uMistCamera,target);
        }else{
          opacity=mistAlongBend(uMistCamera,target);
          wingWater=wakeInRiver(target);
          vec2 incoming=vec2(0.);
          float age=uChapterPaper.w;
          // The first wing press clears a low swath up the current. Tearing
          // the edge with the same moving cloud lets the river open first.
          float parted=smoothstep(5.28,5.89,age)*(1.-smoothstep(7.28,8.75,age));
          vec2 wetBank=valleySection(target.z);
          float cross=abs(target.x-wetBank.x)/max(1.,wetBank.y);
          float range=smoothstep(18.,29.,length(target-uMistCamera))*(1.-smoothstep(112.,159.,length(target-uMistCamera)));
          float dryAir=(.66+.34*noise3(vec3(target.xz*.073,6.3)))*range;
          opacity*=1.-.55*parted*dryAir*smoothstep(.31,.73,cross);
          // A low bank of sea vapour stays behind the same rising dragon.
          // It rolls away first from a few rocky crests, then the channel.
          float passing=smoothstep(3.95,4.27,age)*(1.-smoothstep(5.21,6.16,age));
          if(passing>.001){
            vec3 subject=uChapterPaper.xyz;
            vec3 ray=target-uMistCamera;
            vec3 back=uMistWorld[2].xyz;
            float depthToObject=-dot(ray,back);
            float depthToHero=-dot(subject-uMistCamera,back);
            float behind=smoothstep(depthToHero+3.1,depthToHero+8.4,depthToObject);
            vec2 grain=vec2(target.z*.064+(age-4.20)*.65,target.x*.112+target.y*.047);
            float edge=noise3(vec3(grain,7.63));
            float thread=noise3(vec3(grain*vec2(4.4,2.5),14.2));
            float settled=uWingWake.w;
            float cutGap=0.;
            if(settled>=0.&&settled<1.1){
              vec2 course=vec2(sin(uWingWake.z),cos(uWingWake.z));
              vec2 lateral=vec2(course.y,-course.x);
              vec2 relative=target.xz-uWingWake.xy;
              float af=dot(relative,course);
              float across=abs(dot(relative,lateral));
              float expanding=clamp(settled*1.52,0.,1.);
              float spread=1.4+12.7*expanding;
              float front=3.4+9.2*expanding;
              vec2 wave=vec2((af-3.0+2.4*expanding)/front,across/spread);
              float wakeEdge=length(wave)+.18*(edge-.5);
              float openAir=smoothstep(.04,.20,settled)*(1.-smoothstep(.67,1.10,settled));
              cutGap=openAir*(1.-smoothstep(.54,1.,wakeEdge));
              float curled=(1.-smoothstep(.033,.167,abs(wakeEdge-1.)))
                *openAir*smoothstep(.28,.62,thread)*smoothstep(.45,3.7,target.y);
              opacity=mix(opacity,max(opacity,.68),.42*curled*behind);
            }
            float low=1.-smoothstep(9.2,22.1,target.y+(edge-.51)*6.2);
            float found=1.-smoothstep(.72,1.09,cross+(edge-.5)*.55);
            float fade=passing*behind*low*(.64+.36*found)*(.80+.20*thread)*(1.-.86*cutGap);
            opacity=mix(opacity,1.,.95*fade);
          }
          if(age>4.03 && age<6.50){
            float existingInk=smoothstep(.055,.32,dot(paper-color,vec3(.299,.587,.114)));
            incoming=chapterRiverPaper(target,age,existingInk);
            opacity*=1.-.58*incoming.y;
            color=mix(color,uInkColor,.22*incoming.y);
          }
          if(uWingBackdrop>.001){
            // Only distant rock faces dissolve into paper around the rising
            // dragon. Near surfaces and the dark moving silhouette stay crisp.
            float span=length(target-uMistCamera);
            float facing=smoothstep(32.,54.,span);
            float vapor=noise3(vec3(target.xz*vec2(.088,.071),5.7));
            float veil=smoothstep(3.4,11.3,target.y+3.8*(vapor-.5));
            opacity=mix(opacity,1.,uWingBackdrop*facing*veil*(.58+.23*vapor)*(1.-.52*incoming.y));
            float fringe=max(smoothstep(79.,99.,-target.x),smoothstep(36.,55.,-target.z));
            float distant=smoothstep(65.,105.,span)*fringe;
            float banks=noise3(vec3(target.xz*vec2(.031,.045),7.2));
            opacity=mix(opacity,1.,uWingBackdrop*distant*(.61+.27*banks));
          }
          opacity=mix(opacity,1.,incoming.x);
          // Preserve the warm vermilion of distant warning shapes without
          // sharpening the dark silhouettes that sit behind the fog.
          float vermilion=smoothstep(.035,.121,color.r-max(color.g,color.b));
          opacity*=1.-vermilion*.68;
        }
        if(high<.5 && uClearPocket.w>.001){
          // Momentarily part a volume of mist along the actual cluster that
          // fell. Foreground wings still occlude, and distant ridges keep fog.
          vec3 offset=target-uClearPocket.xyz;
          float pocket=1.-smoothstep(4.,16.,length(vec3(offset.x,offset.y*1.7,offset.z)));
          vec3 side=target-uClearSide.xyz;
          float flank=1.-smoothstep(3.5,13.,length(vec3(side.x,side.y*1.7,side.z)));
          opacity*=1.-max(pocket*uClearPocket.w,flank*uClearSide.w)*.89;
        }
        color=mix(color,paper,opacity);
        if(high<.5){
          color=mix(color,paper,wingWater.y);
          color=mix(color,mix(paper,uInkColor,.47),wingWater.x);
        }
        if(high<.5 && uTrialCloud>.02){
          float cloud=trialCloud(uMistCamera,target)*uTrialCloud;
          color=mix(color,mix(paper,uInkColor,.86),cloud*.68);
        }
      }
      if(uRaw > .5)`,
    );
    material.needsUpdate = true;
  }
  update(stage, time, camera, trial, dt, chapterWing, river = mountainRiver, seed = null, clearPocket = null, settlementRain = 0, clearSide = null) {
    this.uniforms.uMistStage.value = stage;
    this.uniforms.uSettlementRain.value = settlementRain;
    const pressure=this.uniforms.uTrialCloud;
    pressure.value=THREE.MathUtils.lerp(pressure.value,stage===3?(trial?.95:.29):0,1-Math.exp(-Math.max(0,dt)*2.6));
    if (stage < 3) return;
    if(clearPocket) this.uniforms.uClearPocket.value.set(clearPocket.x,clearPocket.y,clearPocket.z,clearPocket.gain);
    else this.uniforms.uClearPocket.value.w=0;
    if(clearSide)this.uniforms.uClearSide.value.set(clearSide.x,clearSide.y,clearSide.z,clearSide.gain);
    else this.uniforms.uClearSide.value.w=0;
    this.uniforms.uMistTime.value = time;
    this.uniforms.uMistCamera.value.setFromMatrixPosition(camera.matrixWorld);
    if(stage===3){
      const focus=this.uniforms.uMistCamera.value.z;
      const shift=seed===null?0:Math.floor((focus+35)/91)*10*valleyStep;
      const start=valleyFirstZ+shift;
      if(this.riverStart!==start||this.riverSeed!==seed){
        this.riverStart=start;
        this.riverSeed=seed;
        this.uniforms.uValleyStart.value=start;
        this.uniforms.uValleyBends.value.forEach((point,i)=>{
          const bend=river(start+valleyStep*i);
          point.set(bend.x,bend.halfWidth);
        });
      }
    }
    this.uniforms.uMistProjection.value.copy(camera.projectionMatrixInverse);
    this.uniforms.uMistWorld.value.copy(camera.matrixWorld);
    const wake = chapterWing?.wake;
    if (wake) this.uniforms.uWingWake.value.set(wake.x,wake.z,wake.angle,chapterWing.wakeAge);
    else this.uniforms.uWingWake.value.w = -1;
    this.uniforms.uWingBackdrop.value = chapterWing?.backdrop ?? 0;
    const sheet = chapterWing?.paper;
    if (sheet) this.uniforms.uChapterPaper.value.set(sheet.x,sheet.y,sheet.z,sheet.age);
    else this.uniforms.uChapterPaper.value.w = -1;
  }
}
