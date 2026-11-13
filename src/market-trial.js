import { Game } from './simulation.js';
import { flightBand } from './rules.js';
import { attackOrigin } from './weapon-combat.js';

const habitatTargets = [[0,1,0], [0,2,4], [9,2,4], [3,10,3]];
const placements = [[0,3.1], [-2.4,4.2], [2.6,6.4]];
const lightningTargets = [[0,3.1], [0,5.8], [0,8.5], [0,11.2], [4.0,3.1]];
const closeTargets = [[0,2.45], [-1.30,2.90], [1.65,3.45]];
const pierceTargets = [[0,3.1], [0,5.6], [0,8.1], [3.0,4.5]];
const mistTargets = [[0,5.2], [-1.22,6.4], [1.39,7.1]];
const pulseTargets = [[0,2.05], [-.5,3.2], [1.05,3.35]];
const tailVortexTargets = [[-4.8,.15], [4.75,-.36], [.08,-4.34]];
const targetRotations = [0,.65,-.65,1.3,-1.3,Math.PI];

export function createMarketTrial(live, preview, name) {
  const trial = new Game({seed:0x5cf984+live.stage,meta:live.meta});
  trial.stage=live.stage;
  trial.practice=true;
  const kind=trial.cultivation.getWeapon(preview.weapon.id)?.kind;
  const stats=preview.view.slots.find(slot=>slot?.uid===preview.weapon.uid)?.stats;
  trial.marketTrial={name,weapon:preview.weapon.id,weaponUid:preview.weapon.uid,
    lightningLayout:preview.weapon.id==='spark'&&Boolean(preview.weapon.temper),
    closeLayout:kind==='pulse'||kind==='melee',pierceLayout:preview.weapon.id==='needle',
    mistLayout:preview.weapon.id==='mist'&&stats?.projectiles>=3,
    tideLayout:preview.weapon.id==='drop'&&Boolean(preview.weapon.temper),
    tailVortexReach:stats?.tailVortex?stats.range:0,
    shellTarget:live.stage===2&&preview.weapon.id==='fang'&&Boolean(preview.weapon.temper)};
  trial.trainingSpawnCD=Infinity;
  trial.foodCD=Infinity;
  trial.food=[];
  trial.obstacles=live.obstacles;
  trial.shoreHeight=live.shoreHeight;
  trial.shoreStage=live.shoreStage;
  trial.terrainHeight=live.terrainHeight;
  trial.buffs={...live.buffs};
  trial.genome=live.genome.slice();
  trial.cultivation.learned=new Map(live.cultivation.learned);
  trial.cultivation.weapons=preview.view.slots.filter(Boolean).map(({uid,id,tier,temper})=>({uid,id,tier,temper,cd:.22}));
  trial.cultivation.invalidateModifiers();
  Object.assign(trial.p,live.p,{dash:0,dashCD:0,invul:100,qi:100});
  trial.trail=live.trail.map(point=>({...point}));
  trial.syncBody();
  trial.updatePose(0);
  refreshMarketTargets(trial);
  return trial;
}

export function refreshMarketTargets(trial) {
  const {lightningLayout,closeLayout,pierceLayout,mistLayout,shellTarget,tideLayout,tailVortexReach}=trial.marketTrial;
  const origin=attackOrigin(trial,tailVortexReach?'tail':trial.marketTrial.weapon);
  const {stage,p}=trial;
  const reference=tailVortexReach?origin:p;
  if(trial.enemies.some(enemy=>enemy.hp>0&&Math.hypot(enemy.x-reference.x,enemy.y-reference.y,enemy.z-reference.z)<13))return;
  trial.enemies=[];
  const types=habitatTargets[stage];
  const [, ceiling]=flightBand(stage);
  const layoutScale=tailVortexReach?Math.min(1,tailVortexReach/4.55):1;
  const positionAt=(anchor,lateral,ahead,rotation)=>{
    const angle=p.angle+rotation;
    const x=anchor.x+(Math.cos(angle)*lateral+Math.sin(angle)*ahead)*layoutScale;
    const z=anchor.z+(Math.cos(angle)*ahead-Math.sin(angle)*lateral)*layoutScale;
    if(Math.abs(x)>66||Math.abs(z)>66||stage<2&&trial.onLand(x,z,.65))return null;
    const ground=stage===3?trial.terrainHeight?.(x,z)??-Infinity:-Infinity;
    const y=Math.max(anchor.y,ground+1.2);
    if(stage>=2&&y>ceiling)return null;
    return {x,y,z,angle};
  };
  // Keep the fan together at a bend. If no clear sector fits, use the
  // normal trial positions rather than splitting a fan across the banks.
  const fanRotation=mistLayout?targetRotations.find(rotation=>mistTargets.every(([x,z])=>positionAt(p,x,z,rotation))):undefined;
  const fan=fanRotation!==undefined;
  const layout=tailVortexReach?tailVortexTargets:lightningLayout?lightningTargets:pierceLayout?pierceTargets:
    fan?mistTargets:tideLayout?pulseTargets:closeLayout&&!shellTarget?closeTargets:placements;
  for(const [index,[lateral,ahead]] of layout.entries()){
    const anchor=tailVortexReach||index===0?origin:p;
    for(const rotation of fan?[fanRotation]:targetRotations){
      const position=positionAt(anchor,lateral,ahead,rotation);
      if(!position)continue;
      const {x,y,z,angle}=position;
      const shell=trial.marketTrial.shellTarget&&index===0;
      const target=trial.spawnEnemy(shell?7:types[index%types.length],x,z,y);
      target.speed=0;
      target.shootCD=Infinity;
      target.hp=target.maxHp=125+index*35;
      if(fan&&index===0)target.radius=Math.min(target.radius,.41);
      if(shell)Object.assign(target,{boss:true,radius:1.1,shield:true,attack:Infinity,angle:angle+Math.PI/2,hp:260,maxHp:260});
      if(trial.marketTrial.lightningLayout&&index===0)target.wet=5;
      if(tideLayout&&index>0)target.wet=5;
      break;
    }
  }
}
