import { Vector3 } from 'three';
import { surfaceHeightSampler } from './ink/warnings.js';

const unitCircle=Array.from({length:41},(_,i)=>{
  const angle=i*Math.PI/20;
  return [Math.cos(angle),Math.sin(angle)];
});
const projected=new Vector3();

/** Trace the tide strike's waterline over the crowd so its hit radius stays readable. */
export function drawDrillStrike(ctx,world,game) {
  const strike=game.drill?.strike;
  if(!world.isInk||!strike||game.status!=='playing')return;
  const remaining=strike.resolveAt-game.time;
  if(remaining<=0)return;

  const {width,height,camera,water}=world;
  const ratio=height/window.innerHeight;
  const heightAt=surfaceHeightSampler(water,.16);
  let connected=false,visible=false,minX=Infinity,maxX=-Infinity,minY=Infinity;
  ctx.beginPath();
  for(const [dx,dz] of unitCircle){
    const x=strike.x+dx*strike.radius,z=strike.z+dz*strike.radius;
    projected.set(x,heightAt(x,z)+.062,z).project(camera);
    if(projected.z<-1||projected.z>1){connected=false;continue;}
    const sx=(projected.x+1)*width/2,sy=(1-projected.y)*height/2;
    if(connected)ctx.lineTo(sx,sy);
    else ctx.moveTo(sx,sy);
    connected=true;
    visible||=sx>=0&&sx<=width&&sy>=0&&sy<=height;
    minX=Math.min(minX,sx);
    maxX=Math.max(maxX,sx);
    minY=Math.min(minY,sy);
  }
  if(!visible)return;

  ctx.save();
  ctx.lineJoin='round';
  ctx.strokeStyle='#f5ebdc';
  ctx.lineWidth=4.8*ratio;
  ctx.stroke();
  ctx.strokeStyle=remaining<.55?'#842b22':'#9b4633';
  ctx.lineWidth=(remaining<.55?2.55:1.9)*ratio;
  ctx.stroke();

  const x=(minX+maxX)/2,y=minY-12*ratio;
  if(x>38*ratio&&x<width-38*ratio&&y>16*ratio&&y<height-16*ratio){
    const text=`潮雷 ${remaining.toFixed(1)}`;
    ctx.font=`600 ${12*ratio}px "Songti SC", serif`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    const labelWidth=ctx.measureText(text).width+10*ratio;
    ctx.fillStyle='#f5ebdcee';
    ctx.fillRect(x-labelWidth/2,y-8*ratio,labelWidth,16*ratio);
    ctx.fillStyle='#842b22';
    ctx.fillText(text,x,y+.5*ratio);
  }
  ctx.restore();
}
