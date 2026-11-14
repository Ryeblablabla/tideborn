import { MathUtils } from 'three';

const { euclideanModulo, lerp, smoothstep } = MathUtils;

/** The spread wing presses down quickly, then rises more slowly. */
export function wingElevation(wingPhase) {
  const phase = euclideanModulo(wingPhase - .08, 1);
  const downstroke = .38;
  const arc = phase < downstroke ? phase / downstroke : 1 + (phase - downstroke) / (1 - downstroke);
  return Math.cos(Math.PI * arc);
}

export function wingFold(wingPhase) {
  const phase = euclideanModulo(wingPhase, 1);
  return smoothstep(phase, .40, .68) * (1 - smoothstep(phase, .71, .99));
}

/** The load pulses are shared by the live stroke and the baked arrival. */
export function flightStroke(wingPhase, target = {}) {
  const phase = euclideanModulo(wingPhase, 1);
  target.load = smoothstep(phase, .11, .24) * (1 - smoothstep(phase, .28, .43));
  target.rise = smoothstep(phase, .17, .34) * (1 - smoothstep(phase, .46, .72));
  target.recover = smoothstep(phase, .43, .58) * (1 - smoothstep(phase, .87, 1));
  return target;
}

/** One final stroke resolves into the open pinion pose at the gate. */
export function flightArrival(progress, target = {}, brake = 0) {
  const resolve = smoothstep(progress, 0, .24);
  target.blend = 1 - (1 - resolve) * (1 - .91 * brake);
  const crest = .083 + .337 * smoothstep(progress, .16, .61) + .074 * smoothstep(progress, .61, .9);
  // Let the open brake pose continue across the victory boundary.
  const fan = .33 + .086 * brake + .078 * smoothstep(progress, .23, .9);
  target.phase = lerp(crest, fan, brake);
  target.flare = smoothstep(brake, .25, .91) * (1 - smoothstep(progress, .19, .65));
  target.letDown = brake * smoothstep(progress, .09, .35) * (1 - smoothstep(progress, .47, .73));
  target.hold = smoothstep(progress, .58, .92);
  target.gather = smoothstep(progress, .32, .69);
  target.release = smoothstep(progress, .72, .98);
  return flightStroke(target.phase, target);
}
