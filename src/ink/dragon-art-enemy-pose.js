import { MathUtils } from 'three';

export function intakeDeformation(enemy, art, time) {
  const mouth = enemy.dragonArtPullCenter;
  const captured = art?.captures?.has(enemy.id);
  if (!art || !mouth || enemy.dragonArtPull !== art.id ||
      (!captured&&art.phase!=='spiral'&&art.phase!=='suction'&&art.phase!=='echo') ||
      time-enemy.dragonArtPullAt>.08) return 0;
  const distance=Math.hypot(mouth.x-enemy.x,(mouth.y-enemy.y)*.7,mouth.z-enemy.z);
  const fold=1-MathUtils.smoothstep(distance,1.08,4.4);
  return captured||art.kind==='rift'&&art.phase==='echo'
    ? Math.max(fold,MathUtils.smoothstep(enemy.dragonArtCaptureProgress??0,.1,.78)*.82) : fold;
}
