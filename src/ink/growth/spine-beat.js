import { MathUtils } from 'three';
import { flightStroke } from './flight-stroke.js';

const { clamp, smoothstep } = MathUtils;
const phase = (time, start, peak, release, end) =>
  smoothstep(time, start, peak) * (1 - smoothstep(time, release, end));

// Pose in world units at the moving flank, with a separate profile for each
// form. The head still lies on the simulation trail.
const profiles = [
  { sweep: .70, rise: .12, twist: .17, delay: .33 },
  { sweep: .94, rise: .15, twist: .22, delay: .48 },
  { sweep: 1.06, rise: .43, twist: .29, delay: .47 },
  { sweep: 1.04, rise: .73, twist: .32, delay: .42 },
  { sweep: .72, rise: .53, twist: .21, delay: .49 },
];

/** The strike leaves the shoulders first. Its energy is held as it crosses
 * the longer trunk and released in the tail while the face returns to idle. */
export function spineBeat(motion, stage, station, collar, hip, length, out) {
  const style = profiles[stage];
  const flank = clamp((station - collar) / Math.max(1, hip - collar), 0, 1);
  const tail = clamp((station - hip) / Math.max(1, length - hip), 0, 1);
  const gate = smoothstep(station, Math.max(.25, collar - 1.2), collar + .55);
  const long = smoothstep(length, 11, 31);
  const body = gate * (.60 + .40 * flank) * (1 - .42 * tail) * (.73 + .27 * long);
  const lag = style.delay * (.58 * flank + .42 * tail) * (.76 + .40 * long);
  const load = motion.chestLoad * body * (1 - .58 * tail);
  const trunk = smoothstep(flank + .55 * tail, .23, 1.23);
  let sideways = -.34 * load * motion.poseSide;
  let lift = -style.rise * .52 * load;
  let advance = -.18 * load;
  let roll = -.33 * style.twist * load * motion.poseSide;
  let swim = 0;
  for (const beat of motion.bodyBeats) {
    const age = beat.age - lag;
    const drive = phase(age, -.01, .105, .169, .350);
    const release = phase(age, .15, .267, .329, .59);
    const power = beat.power * body;
    const wing = stage >= 2 ? 1 : .33;
    sideways += beat.side * style.sweep * power * (drive - .49 * release);
    lift += style.rise * power * (.89 * drive - .54 * release);
    advance += wing * power * (.37 * drive - .24 * release);
    roll += beat.side * style.twist * power * (drive - .59 * release);
    if (stage < 4) {
      // Reuse the swimming wave behind the shoulders. An isolated strike
      // first loads the long body, then the existing curve carries its kick.
      const arriving = beat.age - lag * .72;
      const push = phase(arriving, -.02, .075, .145, .34);
      swim += beat.power * trunk * (.26 + .74 * long) * push;
    }
  }
  if (stage === 4) {
    const terminal = motion.arrivalStroke;
    const flightLag = .21 * flank + .095 * tail;
    const stroke = flightStroke(motion.wingPhase - flightLag, out.flight ??= {});
    const current = .44 * stroke.rise - .21 * stroke.recover;
    const ending = flightStroke(terminal.phase - flightLag, out.terminalFlight ??= {});
    const liftFromWing = MathUtils.lerp(current, .44 * ending.rise - .21 * ending.recover, terminal.blend) * body;
    lift += liftFromWing * (.41 + .59 * motion.wingPower) * (1 - .89 * terminal.hold);
  }
  out.side = clamp(sideways, -1.15, 1.15);
  out.lift = clamp(lift, -.78, .78);
  out.advance = clamp(advance, -.46, .46);
  out.roll = clamp(roll, -.42, .42);
  out.swim = clamp(swim, 0, 1);
  return out;
}
