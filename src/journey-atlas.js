import { FRONTIER_SIZE, frontierCell, frontierLandmark } from './world-frontier.js';

const RESOLUTION=8;
const MAX_CELLS=180;
const MAX_TRACE=260;
const CHART_CELLS=5;
const key=(column,row)=>`${column},${row}`;

export function recordJourney(game) {
  if(!game.exploring)return;
  const {p,stage}=game;
  const atlas=game.atlas??={chapters:[]};
  const chapter=atlas.chapters[stage]??={cells:new Map(),trace:[],chart:0};
  const last=chapter.trace.at(-1);
  if(!last||(p.x-last.x)**2+(p.z-last.z)**2>8) {
    chapter.trace.push({x:p.x,z:p.z});
    if(chapter.trace.length>MAX_TRACE)chapter.trace.shift();
  }
  const {column,row}=frontierCell(p.x,p.z);
  if(chapter.column===column&&chapter.row===row)return;
  const height=stage===3?game.terrainHeight:game.shoreStage===stage?game.shoreHeight:null;
  if(!height)return;
  chapter.column=column;
  chapter.row=row;
  const id=key(column,row);
  const previous=chapter.cells.get(id);
  if(previous){
    chapter.cells.delete(id);
    chapter.cells.set(id,previous);
    return;
  }
  const heights=new Uint8Array(RESOLUTION*RESOLUTION);
  const unit=FRONTIER_SIZE/RESOLUTION;
  for(let j=0;j<RESOLUTION;j++)for(let i=0;i<RESOLUTION;i++){
    const elevation=height((column-.5)*FRONTIER_SIZE+(i+.5)*unit,(row-.5)*FRONTIER_SIZE+(j+.5)*unit);
    heights[j*RESOLUTION+i]=stage===3?elevation<.6?0:elevation<8?1:elevation<15?2:3:elevation<.16?0:elevation<1.1?1:elevation<2.6?2:3;
  }
  chapter.cells.set(id,heights);
  chapter.chart++;
  if(chapter.cells.size>MAX_CELLS)chapter.cells.delete(chapter.cells.keys().next().value);
}

export function atlasSites(game) {
  const wonders=game.wonders;
  if(!wonders)return [];
  const candidates=wonders.sites.filter(site=>site.stage===game.stage&&site.phase!=='spent')
    .map(site=>({site,distance:Math.hypot(site.x-game.p.x,site.z-game.p.z)}))
    .filter(({site,distance})=>distance<=52||site.id===wonders.waypoint?.id)
    .sort((a,b)=>a.distance-b.distance).slice(0,4);
  const waypoint=wonders.waypoint;
  if(waypoint?.stage===game.stage&&!candidates.some(({site})=>site.id===waypoint.id))
    candidates.push({site:waypoint,distance:Math.hypot(waypoint.x-game.p.x,waypoint.z-game.p.z)});
  return candidates;
}

export function drawJourneyAtlas(canvas,game,sites) {
  const ctx=canvas.getContext('2d');
  const {width,height}=canvas;
  const size=Math.min(width,height),cell=size/CHART_CELLS,unit=cell/RESOLUTION;
  const {column,row}=frontierCell(game.p.x,game.p.z);
  const minX=(column-CHART_CELLS*.5)*FRONTIER_SIZE,maxZ=(row+CHART_CELLS*.5)*FRONTIER_SIZE;
  const px=x=>(x-minX)/FRONTIER_SIZE*cell;
  const py=z=>(maxZ-z)/FRONTIER_SIZE*cell;
  const chapter=game.atlas?.chapters[game.stage];
  const tones=game.stage===3?['#e6e9df','#c6d3ba','#a3b494','#839780']:['#dce8e0','#bccbb0','#a2b390','#829473'];

  ctx.fillStyle='#e9e3d6';
  ctx.fillRect(0,0,width,height);
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){
    const heights=chapter?.cells.get(key(column+i,row+j));
    const x=(i+2)*cell,y=(2-j)*cell;
    if(heights)for(let v=0;v<RESOLUTION;v++)for(let u=0;u<RESOLUTION;u++){
      ctx.fillStyle=tones[heights[v*RESOLUTION+u]];
      ctx.fillRect(x+u*unit,y+(RESOLUTION-v-1)*unit,unit+1,unit+1);
    }
    ctx.strokeStyle='#746d5740';
    ctx.strokeRect(x+.5,y+.5,cell,cell);
    const landmark=heights&&frontierLandmark(game.worldSeed,game.stage,column+i,row+j);
    if(landmark){
      ctx.font='11px serif';
      ctx.fillStyle='#475f54';
      ctx.textAlign='center';
      ctx.fillText(landmark.name,px(landmark.x),py(landmark.z)+16);
      ctx.textAlign='start';
    }
  }

  ctx.strokeStyle='#395a4f';
  ctx.lineWidth=2;
  ctx.setLineDash([2,3]);
  ctx.beginPath();
  for(const [i,point] of (chapter?.trace??[]).entries()){
    if(i===0)ctx.moveTo(px(point.x),py(point.z));
    else ctx.lineTo(px(point.x),py(point.z));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for(const [i,{site}] of sites.entries()){
    const x=px(site.x),y=py(site.z);
    const selected=site.id===game.wonders.waypoint?.id;
    ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);
    ctx.fillStyle=selected?'#873d30':'#f5ecdb';ctx.fill();
    ctx.strokeStyle='#873d30';ctx.stroke();
    ctx.fillStyle=selected?'#f5ecdb':'#873d30';
    ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText(i+1,x,y+3.5);ctx.textAlign='start';
  }
  ctx.save();
  ctx.translate(px(game.p.x),py(game.p.z));
  ctx.rotate(game.p.angle);
  ctx.fillStyle='#733d31';
  ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();
  ctx.restore();

  ctx.font='14px serif';
  ctx.fillStyle='#4c5a45';
  ctx.fillText('北 ↑',8,20);
  ctx.beginPath();ctx.moveTo(width-cell-12,height-13);ctx.lineTo(width-12,height-13);ctx.strokeStyle='#4c5a45';ctx.stroke();
  ctx.fillText('48 丈',width-cell-12,height-19);
}
