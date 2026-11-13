const clamp01 = x => Math.max(0,Math.min(1,x));
const smooth = x => { const t=clamp01(x); return t*t*(3-2*t); };
/** Preserve the equipped tail and water moves alongside the dragon's primary gesture. */
export class AttackPose {
  event(event) {
    if(event.type==='hurt'||event.type==='evolve'){
      this.action=null;
      this.tail=null;
      return;
    }
    if(event.strike==='tail'){
      if(event.cancelled){if(this.tail?.id===event.strikeId)this.tail=null;return;}
      if(event.type==='weaponWindup'||event.type==='weaponStrike')this.tail={
        id:event.strikeId,release:event.type==='weaponStrike',age:0,
        windup:event.windup,side:event.side||1,hit:event.hit,
      };
      return;
    }
    if(event.strike!=='water')return;
    if(event.type==='weaponWindup')this.action={id:event.strikeId,phase:'load',age:0,duration:event.windup};
    else if(event.type==='weaponStrike'){
      if(event.cancelled){if(this.action?.id===event.strikeId)this.action=null;return;}
      this.action={id:event.strikeId,phase:'strike',age:0,duration:.35};
    }
  }

  apply(motion,dt) {
    if(this.tail){
      this.tail.age+=dt;
      if(this.tail.release&&this.tail.age>.51)this.tail=null;
    }
    motion.tailAttack=this.tail;
    const action=this.action;
    if(!action)return;
    action.age+=dt;
    const t=clamp01(action.age/Math.max(.05,action.duration));
    if(!motion.action){
      if(action.phase==='load')motion.attackPitch-=.16*smooth(t);
      else motion.attackPitch+=.17*(1-smooth(t))*(.8+.2*smooth(t*7))+.115*Math.sin(Math.PI*t)*t;
      motion.castAge=action.phase==='load'?action.age-action.duration:action.age;
      motion.castStrength=.58;
    }
    if(t>=1&&action.phase!=='load')this.action=null;
  }
}
