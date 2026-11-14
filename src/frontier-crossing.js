import { frontierCell, frontierLandmark, frontierPassage } from './world-frontier.js';

export function updateFrontierCrossing(game) {
  if(!game.exploring||game.stage<2)return;
  const {p,stage,worldSeed}=game;
  const {column,row}=frontierCell(p.x,p.z);
  const crossing=game.crossing?.stage===stage?game.crossing:(game.crossing={stage,seen:new Set()});
  if(crossing.column!==column||crossing.row!==row){
    crossing.column=column;
    crossing.row=row;
    crossing.nearby=[];
    for(let j=row-1;j<=row+1;j++)for(let i=column-1;i<=column+1;i++){
      const landmark=frontierLandmark(worldSeed,stage,i,j);
      const key=`${i}:${j}`;
      if(landmark&&!crossing.seen.has(key))crossing.nearby.push({landmark,key});
    }
  }
  const target=crossing.nearby.find(({landmark})=>Math.hypot(p.x-landmark.x,p.z-landmark.z)<landmark.length+27);
  if(!target){crossing.current=null;crossing.notice=null;return;}
  if(crossing.current?.key!==target.key)crossing.current={key:target.key,direction:null,entry:null};
  const route=crossing.current;
  const {landmark}=target;
  const passage=frontierPassage(landmark,p,route.direction);
  route.direction=passage.direction;
  if(passage.stage==='exit'){crossing.current=null;crossing.notice=null;return;}
  const next=passage.target;
  crossing.notice={name:landmark.name,stage:passage.stage,...next,aligned:passage.aligned,
    height:passage.atHeight?'level':p.y>passage.limits.maxHeight?'down':'up',
    distance:Math.hypot(p.x-next.x,p.z-next.z)};
  if(!passage.inside||!passage.atHeight||!passage.aligned){route.entry=null;return;}
  if(route.entry===null&&passage.progress<-7)route.entry=passage.progress;
  if(route.entry===null||passage.progress<8||passage.progress-route.entry<18)return;
  crossing.seen.add(target.key);
  crossing.nearby=crossing.nearby.filter(candidate=>candidate!==target);
  crossing.current=null;
  crossing.notice=null;
  p.dashCD=Math.min(p.dashCD,.3);
  p.qi=Math.min(100,p.qi+24);
  game.gainMass(p.density*1.4);
  game.emit('frontierCrossing',{x:p.x,y:p.y,z:p.z,title:landmark.name});
}
