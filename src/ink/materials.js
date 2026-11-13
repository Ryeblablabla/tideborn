import * as THREE from 'three';
export { inkWater } from './ocean.js';

// Brush texture lives on the surface, so it does not swim when the camera moves.
const noise = `
float ihash(vec3 p){p=fract(p*.3183099+vec3(.11,.37,.23));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float inoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(ihash(i),ihash(i+vec3(1,0,0)),f.x),mix(ihash(i+vec3(0,1,0)),ihash(i+vec3(1,1,0)),f.x),f.y),mix(mix(ihash(i+vec3(0,0,1)),ihash(i+vec3(1,0,1)),f.x),mix(ihash(i+vec3(0,1,1)),ihash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

export function inkMaterial({color='#292d2a',belly=false,strength=1}={}){
  return new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uInk:{value:new THREE.Color(color)},uPaper:{value:new THREE.Color('#f5f2e9')},uBelly:{value:belly?1:0},uStrength:{value:strength}}]),
    vertexShader:`
      varying vec3 vP;varying vec3 vN;varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vP=position;vUv=uv;vec4 p=vec4(position,1.);vec3 n=normal;
        #ifdef USE_INSTANCING
          p=instanceMatrix*p;n=mat3(instanceMatrix)*n;
        #endif
        vN=normalize(mat3(modelMatrix)*n);vec4 mvPosition=modelViewMatrix*p;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      varying vec3 vP;varying vec3 vN;varying vec2 vUv;
      uniform vec3 uInk;uniform vec3 uPaper;uniform float uBelly;uniform float uStrength;
      #include <fog_pars_fragment>
      ${noise}
      void main(){
        float grain=inoise(vP*vec3(3.7,5.1,1.5));
        float brush=inoise(vec3(vUv.x*11.,vUv.y*19.,2.9));
        float light=dot(normalize(vN),normalize(vec3(-.45,1.,.3)));
        float wash=.025+.21*smoothstep(-.2,.86,light);
        // The belly is tied to the tube's circumferential UV, independent of pose.
        float underside=1.-smoothstep(-.38,.08,sin(vUv.y*6.2831853));
        wash=mix(wash,mix(.018,.94,underside),uBelly*.97);
        wash+=mix(-.025,.035,grain)+(.5-brush)*.035;
        float dry=smoothstep(.83,.96,inoise(vec3(vUv.x*5.,vUv.y*94.,8.)))*smoothstep(.45,.8,grain);
        wash=mix(wash,.90,dry*.60);
        wash=clamp(wash,0.,.98);
        vec3 c=mix(uInk,uPaper,wash);c=mix(uPaper,c,uStrength);
        gl_FragColor=vec4(c,1.);
        #include <fog_fragment>
      }`,fog:true,
  });
}

export const InkPaperShader={
  uniforms:{tDiffuse:{value:null},uResolution:{value:new THREE.Vector2(1200,800)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 uResolution;varying vec2 vUv;
    float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
    void main(){vec2 px=1./uResolution;vec3 c=texture2D(tDiffuse,vUv).rgb;
      float edge=abs(lum(texture2D(tDiffuse,vUv+vec2(px.x,0.)).rgb)-lum(texture2D(tDiffuse,vUv-vec2(px.x,0.)).rgb));
      edge+=abs(lum(texture2D(tDiffuse,vUv+vec2(0.,px.y)).rgb)-lum(texture2D(tDiffuse,vUv-vec2(0.,px.y)).rgb));
      // Only the very edge gets a touch of pooled ink, not a uniform grey veil.
      c-=min(.1,edge*.16);
      vec2 p=floor(vUv*uResolution);float tooth=fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453)-.5;
      c+=tooth*.006;gl_FragColor=vec4(c,1.);
    }`,
};
