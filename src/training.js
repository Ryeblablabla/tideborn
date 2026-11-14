export function advanceTraining(g){
  if(!g.practice)return;
  g.practiceStep??=0;
  if(g.practiceStep===0&&g.metrics.wind>0){g.practiceStep=1;g.trainingSBefore=g.metrics.serpent;g.motion.reset();}
  else if(g.practiceStep===1&&g.metrics.serpent>(g.trainingSBefore||0)){g.practiceStep=2;g.trainingBurstBefore=g.metrics.bursts;}
  else if(g.practiceStep===2&&g.metrics.bursts>(g.trainingBurstBefore||0))g.practiceStep=3;
}
export const LESSONS=[
  {name:'盘旋成风',text:'沿金色圆环持续向同一边转，蓄势后就会出现风眼。',hint:'持续向同一边转，等风眼成形。'},
  {name:'游龙引雷',text:'沿金色 S 路线左右绕行，做出三次幅度明显的交替转向。身体节点亮起后会引雷。',hint:'若识别进度不动，增加左右摆幅，并让每次弯道至少持续一小段距离。'},
  {name:'盘龙收阵',text:'持续同向转弯，让头部靠近龙身围成一圈。成阵后松开转向，直游出阵。',hint:'等龙身围住一片水面，再松手直游。'},
  {name:'三式已成',text:'你已掌握聚风、引雷和收阵。正式游历中，可将敌群、水汽、火焰和毒雾一起卷入连锁。',hint:'练招不会消耗生命，也不会结算龙玉。准备好后开始正式游历。'},
];
