export const gateStoneInk = /* glsl */ `
  vec3 stone=vPaint/uObjectScale+uCenter;
  float across=stone.x;
  float depth=stone.z;
  float slope=1.-smoothstep(.15,.78,abs(vFormNormal.y));
  float mantle=abs(across+.12*(depth+13.));
  float sides=smoothstep(2.38,6.94,mantle);
  float face=smoothstep(.10,.94,abs(vFormNormal.z));
  vec3 plane=vec3(across*.31+stone.y*.67,depth*.46+stone.y*.58,9.11);
  float stain=fbm(plane);
  float cut=noise3(plane*vec3(3.1,2.3,.77)+ vec3(7.32,1.69,5.12));
  float grit=noise3(plane*vec3(12.5,8.3,1.1)+ vec3(3.93,23.51,19.4));
  float band=across+2.8*(stain-.47)+.91*(cut-.5)+.19*depth;
  float shoulder=1.-smoothstep(.44,2.38,abs(abs(band)-5.64));
  float exposed=1.-smoothstep(.055,.47,abs(abs(band)-4.02+.42*(cut-.48)));
  float flank=smoothstep(.37,.74,stain+.16*cut)*sides;
  float load=clamp(.69*shoulder+.52*flank,0.,1.)*(.46+.54*face);
  float torn=exposed*smoothstep(.29,.75,cut+.13*grit)*sides;
  float teeth=shoulder*smoothstep(.42,.76,grit)*(.20+.80*cut)*(.72+.28*slope);
  float effect=uPalaceSurfaceInk;
  pigment+=effect*(.79*load+.21*teeth+.13*slope*flank);
  pigment*=1.-effect*torn*(.34+.23*grit);
  paperReserve*=1.-effect*.53*load;
  paperReserve=max(paperReserve,effect*(.39*torn+.09*teeth));
`;

export const forgedGateVertex = /* glsl */ `
  varying vec3 vPosition,vLocalNormal,vNormal;
  void main(){
    vPosition=position;
    vLocalNormal=normal;
    vNormal=normalize(normalMatrix*normal);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

export const forgedGateFragment = /* glsl */ `
  uniform float uGlint,uJaw;
  varying vec3 vPosition,vLocalNormal,vNormal;
  float hash2(vec2 cell){
    return fract(sin(dot(cell,vec2(12.716,47.571)))*43758.5453);
  }
  float inkNoise(vec2 p) {
    vec2 cell=floor(p),uv=fract(p);
    uv=uv*uv*(3.-2.*uv);
    return mix(mix(hash2(cell),hash2(cell+vec2(1.,0.)),uv.x),
      mix(hash2(cell+vec2(0.,1.)),hash2(cell+1.),uv.x),uv.y);
  }
  float pressStamp(vec2 p,float size){
    vec2 cell=floor(p);
    vec2 local=fract(p)-.5;
    float seed=hash2(cell);
    local+=.32*vec2(seed-.5,hash2(cell+3.64)-.5);
    float profile=length(local*vec2(1.14,.84))+.07*sin(local.x*13.+local.y*23.+seed*6.3);
    return (1.-smoothstep(size*.51,size,profile))*smoothstep(.12,.45,seed);
  }
  void main(){
    vec3 normal=normalize(vNormal),rest=normalize(vLocalNormal);
    float edge=1.-smoothstep(.56,.98,abs(rest.z));
    float lift=max(0.,dot(normal,normalize(vec3(-.43,.66,.62))));
    vec2 plate=vPosition.xy+vec2(vPosition.z*.37,vPosition.z*.74);
    float iron=pressStamp(plate*vec2(4.3,5.5)+vec2(1.81,4.64),.50);
    float knocks=pressStamp(plate*vec2(16.9,14.3)+vec2(5.25,3.14),.25);
    float grit=pressStamp(plate*vec2(44.5,33.4)+vec2(18.71,17.2),.26);
    float scale=inkNoise(plate*vec2(3.6,1.94)+vec2(2.1,9.7));
    float aged=smoothstep(.29,.72,scale);
    float tooth=smoothstep(.28,.77,sin(plate.y*31.4+plate.x*23.6+knocks*2.4)*.5+.5);
    float burnish=edge*(.21+.79*lift)*(.29+.71*tooth);
    float pale=burnish*(.34+.35*uGlint);
    float body=.085+.11*iron+.095*knocks+.06*lift+.03*grit+.21*aged-.056*uJaw;
    float reserve=.013+.12*iron*grit+.11*knocks*tooth+.33*pale;
    gl_FragColor=vec4(body+pale,reserve,.45+.45*grit,1.);
  }
`;
