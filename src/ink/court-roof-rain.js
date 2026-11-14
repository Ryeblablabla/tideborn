import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, MathUtils, Mesh, ShaderMaterial, Vector3,
} from 'three';

const { lerp, smoothstep } = MathUtils;
const inkVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const wetTileFragment = /* glsl */ `
  uniform float uAge,uBreadth;
  varying vec2 vUv;
  void main(){
    float u=vUv.x,v=vUv.y;
    float tide=.62+.42*smoothstep(.04,1.03,uAge);
    float cut=.062*sin(u*32.)+.045*sin(u*67.+5.*v);
    float belly=length(vec2((u-.53)*1.72,(v-.53+cut)*uBreadth));
    float wet=(1.-smoothstep(tide*.66,tide*.84,belly))*smoothstep(.045,.61,uAge);
    wet*=1.-smoothstep(.87,1.,u);
    float curl=.52+.48*sin(v*63.+.53*sin(19.*u)+.29*sin(27.*v));
    float draw=.49+.51*smoothstep(.4,.85,curl);
    float glaze=smoothstep(.76,.96,curl)*(.23+.77*smoothstep(.04,.57,u));
    float courses=sin(v*29.4+sin(u*3.2)*.28)*.5+.5;
    float light=glaze*smoothstep(.36,.72,courses);
    float movement=.51+.49*sin(u*26.-uAge*5.+5.*v);
    float rim=smoothstep(.63,.84,movement)*light;
    float surge=smoothstep(-.025,.115,uAge)*(1.-smoothstep(.20,.43,uAge));
    float front=.42+.43*smoothstep(.02,.45,uAge);
    float shock=1.-smoothstep(.018,.12,abs(belly-front+.086*curl));
    float pale=surge*shock*(.51+.49*draw)*(1.-smoothstep(.89,1.,u));
    float alpha=max(wet*(.46+.31*draw),pale*.88);
    if(alpha<.008)discard;
    gl_FragColor=vec4(mix(mix(.13+.13*curl,.43,rim*.56),.92,pale),.012+.20*rim+.72*pale,.57,alpha);
  }
`;

const runoffFragment = /* glsl */ `
  uniform float uAge;
  varying vec2 vUv;
  void main(){
    float age=uAge-.49;
    float t=vUv.y;
    float flow=t*24.-age*18.;
    float reach=smoothstep(0.,.82,age);
    float side=abs(vUv.x*2.-1.+.10*sin(flow*.65));
    float drop=smoothstep(.030,.14,age)*(1.-smoothstep(reach-.07,reach+.014,t));
    float pulse=.47+.53*smoothstep(.43,.73,sin(flow+sin(t*5.)*1.2)*.5+.5);
    float edge=1.-smoothstep(.29,.91,side);
    float alpha=drop*edge*pulse*(.97-.49*t);
    if(alpha<.012)discard;
    float silver=1.-smoothstep(.0,.36,side);
    gl_FragColor=vec4(.27+.33*silver,.13+.53*silver,.62,alpha);
  }
`;

function wash(age, width, source, name) {
  const geometry = new BufferGeometry();
  const material = new ShaderMaterial({
    uniforms:{uAge:age,uBreadth:width}, vertexShader:inkVertex, fragmentShader:source,
    side:DoubleSide, transparent:true, depthWrite:false, forceSinglePass:true,
  });
  material.allowOverride = false;
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.inkIdSuppressed = true;
  mesh.renderOrder = 7;
  return mesh;
}

export function mountCourtRoofRain(parent, surfaces) {
  const age = {value:0};
  const breadth = {value:1.38};
  const root = new Group();
  const views = surfaces.map(surface => buildSlope(surface,age,breadth));
  const lip = new Vector3();
  const drip = new Vector3();
  let previous;
  root.name = '司雨 · 瓦上水痕';
  root.visible = false;
  root.add(...views.map(({group})=>group));
  parent.add(root);
  return {
    root,
    runoff: { lip, drip },
    heightAt(x,z) {
      for(const {direction,point,center,halfSize} of surfaces){
        if(direction*x<0)continue;
        const u=(x-center.x)/halfSize.x;
        const v=(z-center.z)/halfSize.z;
        if(Math.abs(u)>1||Math.abs(v)>1)continue;
        // The tiny hip curl changes the XZ radius with the other coordinate.
        const exactU=(x-center.x)/(halfSize.x+.16*Math.abs(v)**6);
        const exactV=(z-center.z)/(halfSize.z+.16*Math.abs(exactU)**6);
        return point(exactU,exactV)[1];
      }
      return null;
    },
    update(finale, storm) {
      const time=storm?storm.age-(storm.arrival??.65):0;
      root.visible=finale?.phase==='blessing'&&time>0;
      if(!root.visible){previous=null;return;}
      const {localLanding,width,direction}=storm;
      const side=Math.sign(localLanding.x);
      age.value=time;
      breadth.value=lerp(1.13,1.55,smoothstep(width,4.8,3.0));
      if(!previous||previous.x!==localLanding.x||previous.z!==localLanding.z){
        previous??=new Vector3();
        previous.copy(localLanding);
        const target=views.find(view=>view.side===side);
        target?.place(localLanding,direction,lip,drip);
      }
      for(const {group,side:roofSide} of views)group.visible=roofSide===side;
    },
  };
}

function fillGrid(geometry,cols,rows,count){
  const uv=[],indices=[];
  const stride=cols+1;
  for(let strip=0;strip<count;strip++){
    const first=strip*stride*(rows+1);
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      uv.push(col/cols,row/rows);
      if(row===rows||col===cols)continue;
      const a=first+row*stride+col,b=a+stride;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(uv.length*1.5),3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
}

function buildSlope({direction:roofSide,point,center,halfSize}, age, breadth) {
  const group = new Group();
  const direction=roofSide;
  // One parameterized cloth for the curved tile film and three connected
  // falling strips. Buffers are filled once per new rain landing.
  const tile=wash(age,breadth,wetTileFragment,'铺过旧瓦的第一层水');
  fillGrid(tile.geometry,17,14,1);
  tile.frustumCulled=false;
  group.add(tile);

  const runoff=wash(age,breadth,runoffFragment,'自檐边落下的三道滴流');
  fillGrid(runoff.geometry,1,13,3);
  runoff.frustumCulled=false;
  group.add(runoff);
  return {group,side:direction,place(landing,wind,lip,drip){
    const z0=MathUtils.clamp((landing.z-center.z)/halfSize.z,-.71,.72);
    const u0=Math.abs(landing.x-center.x)/halfSize.x;
    const upper=lerp(.24,.47,1-smoothstep(u0,.28,.85));
    const uv=tile.geometry.attributes.uv;
    const p=tile.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const u=uv.getX(i),v=uv.getY(i);
      const z=MathUtils.clamp(z0+(v-.5)*.82+(1-u)*(wind?.z??0)*.055,-.985,.985);
      const next=point(-direction*lerp(.995,upper,u),z);
      p.setXYZ(i,next[0],next[1]+.034,next[2]);
    }
    p.needsUpdate=true;
    const out=runoff.geometry.attributes.position;
    for(let i=0;i<3;i++){
      const z=MathUtils.clamp(z0+(i===0?-.33:i===1?-.13:.01),-.947,.976);
      const eave=point(-direction*.996,z);
      for(let row=0;row<=13;row++){
        const t=row/13,fade=1-smoothstep(t,.71,1);
        const x=eave[0]-direction*(.055+.31*t+.13*t*t);
        const y=eave[1]-.073-t*(5.34+i*.16);
        const run=eave[2]+.18*t+.16*Math.sin(t*2.5+i*.71)*t;
        if(i===1&&row===0)lip.set(x,y,run);
        if(i===1&&row===6)drip.set(x,y,run);
        const width=(.051+.022*i)*(.72+.28*fade);
        const a=i*28+row*2;
        out.setXYZ(a,x-width*.61,y,run-width*.79);
        out.setXYZ(a+1,x+width*.61,y,run+width*.79);
      }
    }
    out.needsUpdate=true;
  }};

}
