const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function polygonArea(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.z-q.x*p.z;}return Math.abs(a)*.5;}
export function insidePolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function sampleSpine(trail, length, spacing = .65, head = trail[0]) {
  if (!head) return [];
  const includesHead = head === trail[0];
  const point = index => index === 0 ? head : trail[index - (includesHead ? 0 : 1)];
  const count = trail.length + (includesHead ? 0 : 1);
  const spine = [];
  let cursor = 0;
  let distance = 0;
  let a = head;
  let b = point(1);
  let step = 0;
  let dx = -Math.sin(head.angle || 0), dy = 0, dz = -Math.cos(head.angle || 0);
  function readSegment() {
    if (!b) { step = 0; return; }
    const x = b.x - a.x, y = (b.y ?? .7) - (a.y ?? .7), z = b.z - a.z;
    step = Math.hypot(x, y, z);
    if (step > 1e-8) { dx = x / step; dy = y / step; dz = z / step; }
  }
  readSegment();
  for (let i = 0; i <= Math.ceil(length); i++) {
    const wanted = i * spacing;
    while (cursor < count - 1 && (step < 1e-8 || distance + step < wanted)) {
      distance += step;
      a = b;
      b = point(++cursor + 1);
      readSegment();
    }
    const offset = wanted - distance;
    spine.push({ x: a.x + dx * offset, y: (a.y ?? .7) + dy * offset, z: a.z + dz * offset });
  }
  return spine;
}
// Reads only the physics head path, never the visual swim animation.
export class MotionReader {
  constructor(){this.points=[];this.bends=[];this.heading=null;this.bend=0;this.bendTravel=0;this.lastS=-10;this.lastAngle=null;}
  reset(){this.points=[];this.bends=[];this.heading=null;this.bend=0;this.bendTravel=0;}
  update(p,time,spine){
    const last=this.points.at(-1);let sTrigger=false;
    if(!last||distance(p,last)>=.22){
      const point={x:p.x,z:p.z,y:p.y,t:time};
      if(last){const d=distance(point,last),heading=Math.atan2(point.x-last.x,point.z-last.z);
        if(this.heading!==null){const turn=wrap(heading-this.heading);point.turn=turn;
          if(Math.abs(turn)<1.8){
            if(this.bend&&Math.sign(turn)!==Math.sign(this.bend)&&Math.abs(turn)>.025){
              if(Math.abs(this.bend)>.48&&this.bendTravel>1.3&&Math.abs(this.bend)<3.6)this.bends.push({sign:Math.sign(this.bend),angle:Math.abs(this.bend),t:time});
              this.bend=turn;this.bendTravel=d;
            }else{this.bend+=turn;this.bendTravel+=d;}
          }
        }this.heading=heading;
      }
      this.points.push(point);
      this.points=this.points.filter(q=>time-q.t<6.5).slice(-180);
      this.bends=this.bends.filter(q=>time-q.t<5.5).slice(-4);
      const b=this.bends.slice(-2);
      if(b.length===2&&b[0].sign!==b[1].sign&&Math.abs(this.bend)>.5&&Math.sign(this.bend)!==b[1].sign&&time-this.lastS>3.2){sTrigger=true;this.lastS=time;this.bends=[];}
    }
    const recent=this.points.filter(q=>time-q.t<5),turn=recent.reduce((s,q)=>s+(q.turn||0),0),absolute=recent.reduce((s,q)=>s+Math.abs(q.turn||0),0);
    const dominance=absolute?Math.abs(turn)/absolute:0;
    let wind=Math.min(1,Math.abs(turn)/5.2)*(dominance>.8?1:.2);
    if(!last||time-last.t>.25)wind=0;
    let loop=null,best=0,ringProgress=0;
    // Only a physically present body segment can close the ring.
    for(let i=7;i<spine.length;i++){
      if(Math.abs((spine[i].y||0)-(p.y||0))>1.8)continue;
      const d=distance(p,spine[i]),candidateArea=polygonArea(spine.slice(0,i+1)),progress=Math.max(0,1-d/3)*Math.min(1,candidateArea/2.8);
      if(progress>ringProgress)ringProgress=progress;
      if(d>1.55)continue;
      const polygon=spine.slice(0,i+1),area=polygonArea(polygon);if(area<2.8||area>260)continue;
      const center=polygon.reduce((a,q)=>({x:a.x+q.x/polygon.length,z:a.z+q.z/polygon.length}),{x:0,z:0});
      if(area>best){best=area;loop={polygon,center,area,radius:Math.sqrt(area/Math.PI),y:p.y};}
    }
    const center=recent.length?recent.reduce((a,q)=>({x:a.x+q.x/recent.length,z:a.z+q.z/recent.length}),{x:p.x*0,z:p.z*0}):{x:p.x,z:p.z};
    return {wind,s:Math.min(1,(this.bends.length+Math.min(1,Math.abs(this.bend)/.8))/3),ring:loop?1:Math.min(.92,ringProgress),loop,center,sTrigger,moving:!!last&&time-last.t<.25};
  }
}
