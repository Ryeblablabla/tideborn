import { Euler, MathUtils, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

const { clamp, lerp, smoothstep } = MathUtils;

// Reference points are measured on the actual growth mesh in its normalized
// rest coordinates. Lip heights follow the mouth slit in the skull's own
// longitudinal plane, including the two dragons' off-axis head sculpts.
const anatomy = [
  {
    neck: [.012, .035, .327], muzzle: [.012, .011, .495], hinge: [.013, .022, .384], facing: -.03,
    lipOrigin: [.013, .437], lip: [[-.050, .019], [-.018, .020], [.016, .017], [.042, .009], [.065, .012]],
    jawWidth: .047, maxGape: .67, reach: .036, withdrawal: .025,
  },
  {
    neck: [.008, .041, .323], muzzle: [.014, .008, .498], hinge: [.008, .020, .369], facing: .08,
    lipOrigin: [.008, .437], lip: [[-.082, .019], [-.050, .006], [-.027, -.001], [.006, .006], [.039, -.004], [.064, .010]],
    jawWidth: .062, maxGape: .59, reach: .044, withdrawal: .032,
  },
  {
    neck: [.066, .101, .306], muzzle: [.149, .047, .490], hinge: [.119, .070, .379], facing: .29,
    lipOrigin: [.137, .438], lip: [[-.071, .073], [-.040, .073], [-.023, .069], [.008, .063], [.033, .050], [.052, .047], [.064, .048]],
    jawWidth: .051, maxGape: .58, reach: .047, withdrawal: .030,
  },
  {
    neck: [-.062, .141, .332], muzzle: [-.222, .033, .489], hinge: [-.114, .087, .387], facing: -.78,
    lipOrigin: [-.162, .435], lip: [[-.072, .089], [-.047, .081], [-.021, .071], [.017, .058], [.050, .031], [.093, .029]],
    jawWidth: .060, maxGape: .49, reach: .048, withdrawal: .028,
  },
];

// A short, light skull snaps up. The longer python neck takes the hit
// through its jaw and dips; the dragons load a side of the chest.
const hurtPose = [
  { pitch: -.32, yaw: .29, roll: .055, retreat: .029, lift: .036, side: .037 },
  { pitch: .43, yaw: .23, roll: .075, retreat: .061, lift: -.033, side: .046 },
  { pitch: .35, yaw: .25, roll: .10, retreat: .057, lift: -.026, side: .053 },
  { pitch: -.30, yaw: .30, roll: .13, retreat: .041, lift: .012, side: .054 },
];

function lipHeight(stops, u) {
  let index = 1;
  while (index < stops.length - 1 && u > stops[index][0]) index++;
  const [u0, y0] = stops[index - 1];
  const [u1, y1] = stops[index];
  return lerp(y0, y1, clamp((u - u0) / (u1 - u0), 0, 1));
}

function smoothSlope(x, a, b) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return 6 * t * (1 - t) / (b - a);
}

const snakeCenter = { x: .012, y: .015 };

function snakeSection(z) {
  // Give the cheek its own mass, then run the nape into the first growth cut.
  const cheekFront = smoothstep(z, .331, .392);
  const cheekBack = 1 - smoothstep(z, .418, .493);
  const cheek = cheekFront * cheekBack;
  const cheekSlope = smoothSlope(z, .331, .392) * cheekBack - cheekFront * smoothSlope(z, .418, .493);
  const collarFront = smoothstep(z, .104, .177);
  const collarBack = 1 - smoothstep(z, .300, .359);
  const collar = collarFront * collarBack;
  const collarSlope = smoothSlope(z, .104, .177) * collarBack - collarFront * smoothSlope(z, .300, .359);
  return {
    width: 1 + .19 * cheek - .39 * collar,
    height: 1 + .185 * cheek - .50 * collar,
    widthSlope: .19 * cheekSlope - .39 * collarSlope,
    heightSlope: .185 * cheekSlope - .50 * collarSlope,
  };
}

function fitSnakePoint(point, sectionZ = point.z) {
  const { width, height } = snakeSection(sectionZ);
  point.x = snakeCenter.x + (point.x - snakeCenter.x) * width;
  point.y = snakeCenter.y + (point.y - snakeCenter.y) * height;
  return point;
}

function shapeSnakeHead(positions, normals, growth) {
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    if (z <= .104 || z >= .493) continue;
    const { width, height, widthSlope, heightSlope } = snakeSection(z);
    const x = positions[i] - snakeCenter.x;
    const y = positions[i + 1] - snakeCenter.y;
    positions[i] = snakeCenter.x + x * width;
    positions[i + 1] = snakeCenter.y + y * height;
    const nx = normals[i] / width;
    const ny = normals[i + 1] / height;
    const nz = normals[i + 2] - nx * x * widthSlope - ny * y * heightSlope;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / length;
    normals[i + 1] = ny / length;
    normals[i + 2] = nz / length;
    if (z > .120 && z < .456) growth.setY(i / 3, smoothstep(z, .170, .345));
  }
}

export function shapeSurfaceHead(stage, positions, normals, growth) {
  if (stage === 0) {
    shapeSnakeHead(positions, normals, growth);
    return;
  }
  const widthChange = .24;
  const crownDrop = .034;
  const shoulderStart = .302;
  const shoulderEnd = .356;
  const muzzleStart = .399;
  const napeStart = .200;
  const napeFull = .278;
  const crownTop = .114;
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    if (z <= napeStart || z >= .456) continue;
    const y = positions[i + 1];
    const x = positions[i] - anatomy[stage].neck[0];
    const front = smoothstep(z, shoulderStart, shoulderEnd);
    const back = 1 - smoothstep(z, muzzleStart, .456);
    const shape = front * back;
    const slope = smoothSlope(z, shoulderStart, shoulderEnd) * back - front * smoothSlope(z, muzzleStart, .456);
    const width = 1 + widthChange * shape;
    const collar = 1 - smoothstep(z, .302, .424);
    const above = smoothstep(y, .012, crownTop);
    const rise = smoothstep(z, napeStart, napeFull);
    const crown = crownDrop * rise * collar;
    const crownSlope = crownDrop * (smoothSlope(z, napeStart, napeFull) * collar - rise * smoothSlope(z, .302, .424));
    // The python's flatter crown and broader jaw hinge leave a longer,
    // angular skull above the collar.
    positions[i] += x * (width - 1);
    positions[i + 1] -= crown * above;
    const nx = normals[i] / width;
    const ny = normals[i + 1] / (1 - crown * smoothSlope(y, .012, crownTop));
    const nz = normals[i + 2] - nx * x * widthChange * slope + ny * crownSlope * above;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / length;
    normals[i + 1] = ny / length;
    normals[i + 2] = nz / length;
  }
}

/** A stable skull and a mandibular hinge layered over the curved neck skin. */
export class FormHead {
  constructor(stage) {
    this.stage = stage;
    this.data = anatomy[stage];
    this.neck = new Vector3(...this.data.neck);
    this.hinge = new Vector3(...this.data.hinge);
    this.muzzleRest = new Vector3(...this.data.muzzle);
    if (stage === 0) {
      fitSnakePoint(this.neck);
      fitSnakePoint(this.hinge);
    }
    this.forwardX = Math.sin(this.data.facing);
    this.forwardZ = Math.cos(this.data.facing);
    this.jawAxis = new Vector3(this.forwardZ, 0, -this.forwardX);
    this.euler = new Euler(0, 0, 0, 'YXZ');
    this.rotation = new Quaternion();
    this.matrix = new Matrix4();
    this.skull = new Matrix3();
    this.mandible = new Matrix3();
    this.shift = new Vector3();
    this.jawShift = new Vector3();
    this.point = new Vector3();
    this.normal = new Vector3();
    this.scratch = new Vector3();
  }

  lipCoordinates(x, y, z) {
    const { lip, lipOrigin, hinge } = this.data;
    const along = (x - hinge[0]) * this.forwardX + (z - hinge[2]) * this.forwardZ;
    const across = (x - hinge[0]) * this.forwardZ - (z - hinge[2]) * this.forwardX;
    const u = (x - lipOrigin[0]) * this.forwardX + (z - lipOrigin[1]) * this.forwardZ;
    return { along, across, height: y - lipHeight(lip, u) };
  }

  jawRegion(x, y, z) {
    const { jawWidth } = this.data;
    const { along, across, height } = this.lipCoordinates(x, y, z);
    const cheekFalloff = 1 - smoothstep(Math.abs(across), jawWidth * .77, jawWidth);
    return cheekFalloff * smoothstep(along, -.020, .034) *
      smoothstep(height, -.12, -.093) * (1 - smoothstep(height, .04, .073));
  }

  update(motion, time) {
    const {
      drive = 0, phase = time * 2.8, turn = 0, lift = 0, recoil = 0,
      anticipate = 0, strike = 0, grip = 0, jaw = 0, aimYaw = 0, aimPitch = 0,
      contactTarget = null, targetDistance = Infinity, flinch = 0, flinchSide = 0, attackKind = null,
      clawSide = 0, feedSide = 0, feedReady = 0, morph = 1,
    } = motion ?? {};
    const response = hurtPose[this.stage];
    const load = Math.max(flinch, 0);
    const settle = Math.max(-flinch, 0);
    const retreat = flinchSide * flinch;
    const dragon = this.stage >= 2;
    const breath = Math.sin(time * (dragon ? 2.35 : 2.95) - this.stage);
    const glide = Math.sin(phase - .58) * drive;
    // The shoulders carry a claw strike. Brace the skull away from the
    // striking side so the wrist can pass under the jaw in profile.
    const claw = attackKind === 'claw' ? strike : 0;
    const waterClaw = this.stage === 2 ? claw : 0;
    const feed = attackKind === 'eat' ? strike : 0;
    const clawLift = claw * (this.stage === 2 ? .31 : .19);
    const feedYaw = this.stage === 0 ? (.46 * feed + .14 * feedReady) * feedSide : 0;
    const feedRoll = this.stage === 0 ? (.23 * feed + .12 * feedReady) * feedSide : 0;
    const feedPitch = this.stage === 1 ? .31 * feed - .26 * feedReady : .13 * feed - .19 * feedReady;
    this.crestFold = this.stage === 2 ? 1 - smoothstep(morph, .13, .83) : 0;
    const emerge = this.stage === 1
      ? smoothstep(morph, .07, .31) * (1 - smoothstep(morph, .35, .80)) : 0;
    const headReach = strike - 1.12 * waterClaw;
    const yaw = clamp(.75 * aimYaw + .028 * glide + .074 * turn + response.yaw * retreat
      + feedYaw + .26 * emerge - .18 * waterClaw * clawSide, -.43 - .06 * load, .43 + .06 * load);
    const pitch = clamp(-.72 * aimPitch - .015 * breath - .019 * glide - .035 * lift
      - .17 * anticipate + .087 * headReach + feedPitch - clawLift + .14 * recoil * (1 - load) + response.pitch * flinch - .18 * emerge,
      -.41 - .15 * load, .41 + .15 * load);
    const roll = -.026 * turn + .013 * glide - response.roll * retreat + feedRoll - .10 * emerge;
    this.rotation.setFromEuler(this.euler.set(pitch, yaw, roll));
    this.skull.setFromMatrix4(this.matrix.makeRotationFromQuaternion(this.rotation));
    const snap = contactTarget ? Math.max(0, headReach) * (1 - smoothstep(targetDistance, 2.7, 4.0)) : 0;
    const feedingReach = this.stage === 1 ? .052 * feed : 0;
    const advance = headReach * this.data.reach + .024 * snap + feedingReach - anticipate * this.data.withdrawal -
      (this.stage === 1 ? .040 : .012) * feedReady -
      .020 * recoil - response.retreat * flinch;
    this.shift.copy(this.neck).sub(this.scratch.copy(this.neck).applyMatrix3(this.skull));
    this.shift.x += advance * (.42 * Math.sin(yaw) + .32 * this.forwardX) + response.side * retreat
      - .018 * waterClaw * clawSide;
    this.shift.y += .025 * anticipate - .012 * strike - .011 * snap + .021 * claw + .006 * breath * (1 - drive) +
      .009 * recoil + response.lift * flinch + (this.stage === 1 ? .024 : .042) * feedReady + .055 * emerge;
    this.shift.z += advance;

    // Load opens the jaw. It closes as the head meets the target, before
    // the cervical and hyoid response settles through the rest of the neck.
    this.open = clamp(jaw * (1 - grip * .33) * (1 - .88 * load) * (1 - .55 * claw) +
      .012 * (1 - drive) * Math.max(0, breath) + .13 * settle, 0, 1);
    this.rotation.setFromAxisAngle(this.jawAxis, this.open * this.data.maxGape);
    this.mandible.setFromMatrix4(this.matrix.makeRotationFromQuaternion(this.rotation));
    this.jawShift.copy(this.hinge).sub(this.scratch.copy(this.hinge).applyMatrix3(this.mandible));
  }

  muzzle(out, inset = 0) {
    // Discharge from the front of the gap between the posed lips.
    out.copy(this.muzzleRest);
    const reach = .012 - inset;
    if (this.stage === 0) fitSnakePoint(out, out.z + this.forwardZ * reach);
    if (this.open > .001) {
      out.lerp(this.scratch.copy(out).applyMatrix3(this.mandible).add(this.jawShift), .31);
    }
    out.x += this.forwardX * reach;
    out.z += this.forwardZ * reach;
    return out.applyMatrix3(this.skull).add(this.shift);
  }

  pose(weight, x, y, z, nx, ny, nz) {
    this.point.set(x, y, z);
    this.normal.set(nx, ny, nz);
    if (this.crestFold > 0 && y > .108) {
      // Keep the wet roots at the brow while the tall locks rise and stream out.
      const height = y - .108;
      const falloff = height + .042;
      const folded = this.crestFold * height * height / falloff;
      const slope = this.crestFold * height * (height + .084) / (falloff * falloff);
      this.point.y -= .80 * folded;
      this.point.z -= .40 * folded;
      this.normal.y = (ny + .40 * slope * nz) / (1 - .80 * slope);
    }
    if (weight > 0 && this.open > .001) {
      this.point.lerp(this.scratch.copy(this.point).applyMatrix3(this.mandible).add(this.jawShift), weight);
      this.normal.lerp(this.scratch.copy(this.normal).applyMatrix3(this.mandible), weight);
    }
    this.point.applyMatrix3(this.skull).add(this.shift);
    this.normal.applyMatrix3(this.skull);
  }
}
