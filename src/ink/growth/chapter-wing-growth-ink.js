import { MathUtils, Vector2 } from 'three';

const { clamp } = MathUtils;

/** A small dry edge opening around a wet, skinned feather socket. */
export class ChapterWingGrowthInk {
  constructor() {
    this.stroke = {value:new Vector2()};
  }

  update(chapterWing) {
    this.stroke.value.set(clamp(chapterWing?.socketTravel??0,0,1),clamp(chapterWing?.socketInk??0,0,1));
  }

  install(material, outgoing) {
    material.uniforms.uChapterWingSocket=this.stroke;
    material.fragmentShader='uniform vec2 uChapterWingSocket;\n'+material.fragmentShader;
    const root=outgoing?'.215':'.248';
    const inner=outgoing?'.019':'.025';
    const outer=outgoing?'.059':'.102';
    const anatomy=outgoing?'.41':'.34';
    material.fragmentShader=material.fragmentShader.replace('float reflectance=exp(-pigment*3.1);',/* glsl */`
      if(uChapterWingSocket.y>.001){
        vec3 inkSocket=vChapterShoulderRest;
        float socketSpan=abs(inkSocket.x);
        float socketTravel=uChapterWingSocket.x;
        float socketWake=${inner};
        float socketTip=mix(.037,${outer},socketTravel);
        float socketAlong=(socketSpan-socketWake)/max(.012,socketTip-socketWake);
        float socketAxis=inkSocket.z-${root}+${anatomy}*(socketSpan-socketWake);
        socketAxis-=.009*sin(clamp(socketAlong,0.,1.)*3.1416);
        float socketGrain=.61*wash+.39*pooling;
        float socketTeeth=(socketGrain-.5)*.023;
        float socketContour=sin(clamp(socketAlong,0.,1.)*3.1416);
        float socketWidth=.017+.030*socketContour;
        float socketMask=smoothstep(-.29,.04,socketAlong)*(1.-smoothstep(.86,1.13,socketAlong));
        socketMask*=1.-smoothstep(.032,.083,abs(inkSocket.y+.006));
        float socketInk=(1.-smoothstep(.23,1.,abs(socketAxis+socketTeeth)/socketWidth))*socketMask;
        float socketRim=(1.-smoothstep(.006,.017,abs(socketAxis+socketWidth*.76+socketTeeth)))*socketMask;
        socketRim*=smoothstep(.34,.69,socketGrain)*smoothstep(.09,.36,socketTravel);
        float socketGain=uChapterWingSocket.y;
        pigment+=socketInk*socketGain*(.33+.14*pooling);
        paperReserve*=1.-.52*socketInk*socketGain;
        paperReserve=max(paperReserve,socketRim*socketGain*.50);
      }
      float reflectance=exp(-pigment*3.1);
    `);
  }
}
