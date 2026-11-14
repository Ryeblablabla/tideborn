import { BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, MathUtils, Raycaster, Sphere, Vector3 } from 'three';
import { SHORE_WATER } from './shore-structure.js';
import { addValleyPine } from './valley-pines.js';
import { addValleyMass } from './valley-rock.js';

const { smoothstep } = MathUtils;
const chapterCliffs = new WeakMap();

function paintBanks(environment, root) {
  const riverAt = environment.mountainRiver;
  const banks = [];
  for (const side of [-1, 1]) {
    const centerX = side * 24;
    const centerZ = side === 1 ? 40 : 47;
    const width = 29;
    const depth = 34;
    const shoreline = z => {
      const { x, halfWidth } = riverAt(z);
      const shoulder = (z - centerZ + 7) / 15;
      const reach = 2.4 + 4.8 * Math.exp(-shoulder * shoulder)
        + 1.12 * Math.sin(z * .27 + side) + .42 * Math.sin(z * .83);
      return x + side * (halfWidth - reach);
    };
    const envelope = v => 1 - smoothstep(Math.abs(v), .60, .99);
    const inward = (u, v) => (centerX + u * width - shoreline(centerZ + v * depth)) * side;
    const bank = environment.terrain(root, centerX, 0, centerZ, [width, 8, depth], {
      distant: true, columns: 65, rows: 78, tint: side === 1 ? '#485c4e' : '#536764',
      amount: side === 1 ? .58 : .40, wash: .77, pooling: .09, gain: side === 1 ? 1.60 : 1.36,
      profile: { toneRange: [.13, .38], coherentInk: .11, reserveStrength: .16, macroInk: .13,
        geometryInfluence: 0, strokes: false },
      field(u, v) {
        const x = inward(u, v);
        const shelf = smoothstep(x, 0, 5.1);
        const fracture = .48 * Math.sin(v * 19.2 - x * .56) + .34 * Math.sin(v * 43 + x * .23);
        const ridge = smoothstep(x + fracture, 3.3, 13.2) * (2.48 + 2.76 * Math.sin(v * 4.3 + .8) ** 2);
        const toe = 1.14 * smoothstep(x + fracture, -.2, 1.8) * (1 - smoothstep(x, 3.6, 6.8));
        return -.52 + envelope(v) * (1.32 * shelf + ridge + toe)
          * (1 - smoothstep(Math.abs(u), .80, 1));
      },
      paint(u, v, h) {
        const x = inward(u, v);
        const ledge = 1 - smoothstep(Math.abs(x - 2.2 - .59 * Math.sin(v * 27)), .42, 2.24);
        const seam = 1 - smoothstep(Math.abs(Math.sin(v * 17.4 + x * .72 + .48 * Math.sin(v * 28))), .12, .56);
        const interrupted = smoothstep(Math.sin(v * 33 - x * .92) + .35 * Math.sin(v * 78 + x * 2.1), -.28, .85);
        const footing = smoothstep(h, .015, 1.30) * envelope(v);
        return [footing * Math.max(ledge * .73, seam * interrupted * .67), footing * seam * (1 - interrupted) * .33];
      },
    });
    bank.mesh.name = side === 1 ? '千山·墨岸松坪' : '千山·隔水皴岸';
    bank.mesh.userData.landscape = 1;
    bank.mesh.userData.inkMineralHold = .39;
    banks.push({ side, shoreline, heightAt: (x, z) => bank.heightAt(x - centerX, z - centerZ) });
  }
  return banks;
}

function plantBankPines(environment, root, banks) {
  for (const [side, z, offset, size, kind, facing, seed] of [
    [1, 28.5, 5.6, 1.18, 'cliff', 2.45, 818], [1, 32.2, 3.4, 1.04, 'fork', 1.87, 821],
    [1, 37.8, 4.6, .84, 'sparse', -.25, 841], [1, 46.1, 5.2, 1.00, 'cliff', 2.14, 852],
    [-1, 37.6, 6.1, 1.02, 'fork', 1.21, 871], [-1, 43.9, 5.5, .81, 'cliff', .49, 884],
    [-1, 56.1, 7.3, 1.20, 'sparse', 1.76, 895],
  ]) {
    const bank = banks.find(bank => bank.side === side);
    const x = bank.shoreline(z) + side * offset;
    const height = Math.max(environment.heightAt(x, z), bank.heightAt(x, z));
    if (height > .5) {
      const tree = addValleyPine(environment, root, x, height - .16 * size, z, size, kind, facing, seed);
      tree.name = '千山·临江松';
    }
  }
}

function plantRiverShoulderPine(environment, root, banks) {
  // This low pine sits at the left edge of the flight composition, rooted in
  // the actual east shoulder. The leaning crown leaves the river opening free.
  const shoulder = root.getObjectByName('千山·东岸墨肩');
  if (!shoulder) return;
  const x = 23.71, z = 26;
  shoulder.updateMatrixWorld(true);
  const down = new Raycaster(new Vector3(x, 40, z), new Vector3(0, -1, 0));
  const hit = down.intersectObject(shoulder, false)[0];
  const bank = banks.find(bank => bank.side === 1);
  const height = Math.max(environment.heightAt(x, z), bank.heightAt(x, z), hit?.point.y ?? -Infinity);
  if (height < .5) return;
  const pine = addValleyPine(environment, root, x, height - .27, z, 1.43, 'cliff', Math.PI * .93, 3107, { brushCrown: true });
  pine.name = '千山·岸悬松';
  pine.userData.inkTint = '#384139';
  pine.userData.inkTintAmount = .41;
}

function* paintWestBankFoot(root, positions, guides, indices) {
  const cliff = root.getObjectByName('江左石青');
  const bank = root.getObjectByName('千山·隔水皴岸');
  const ray = new Raycaster(new Vector3(10, SHORE_WATER, 0), new Vector3(-1, 0, 0), 0, 68);
  const lanes = [[-.22, 0], [.04, .84], [.28, 1], [.67, .40], [1.18, 0]];
  const hits = [];
  for (const [mesh, start, end, width, pressure] of [
    [cliff, -18, -7.2, 1.18, .28], [cliff, -2.6, 5.4, .94, .23],
    [cliff, 3.9, 17.4, 1.35, .32], [bank, 18.3, 28.1, 1.06, .24],
    [bank, 27.0, 34.4, .78, .17],
  ]) {
    if (!mesh) continue;
    mesh.updateMatrixWorld(true);
    let previous;
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      ray.ray.origin.z = MathUtils.lerp(start, end, t);
      hits.length = 0;
      // The painted shelf is visual-only. Measure both meshes where they
      // actually meet the water, including the inlet behind the cliff spur.
      ray.intersectObject(mesh, false, hits);
      const edge = hits[0]?.point;
      if ((i + 1) % 7 === 0) yield;
      if (!edge) { previous = undefined; continue; }
      const fade = smoothstep(t, 0, .23) * (1 - smoothstep(t, .69, 1));
      const spread = width * (.72 + .28 * Math.sin(t * 10.3 + start) ** 2) * (.38 + .62 * fade);
      const ink = pressure * fade * (.55 + .45 * Math.sin(edge.z * 1.23 + start) ** 2);
      const row = positions.length / 3;
      for (const [offset, load] of lanes) {
        positions.push(edge.x + spread * offset, SHORE_WATER + .025, edge.z);
        guides.push(ink * load, 0);
      }
      if (previous !== undefined) {
        for (let lane = 0; lane < lanes.length - 1; lane++) {
          const a = previous + lane, b = row + lane;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      previous = row;
    }
  }
}

function* paintCurrent(environment, root, banks) {
  const positions = [], guides = [], indices = [];
  yield* paintWestBankFoot(root, positions, guides, indices);
  const riverAt = environment.mountainRiver;
  const strokes = [
    [1, 26, 20, 1.01, .59], [1, 29, 12, 1.84, .36], [1, 44, 17, 1.18, .46],
    [-1, 27, 17, .92, .48], [-1, 43, 23, .86, .43], [-1, 49, 13, 2.18, .30],
    [0, 35, 22, .10, .23], [0, 44, 22, -.17, .21],
  ];
  for (const [side, start, reach, offset, ink] of strokes) {
    const base = positions.length / 3;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, z = start + reach * t;
      const river = riverAt(z);
      const bank = banks.find(bank => bank.side === side);
      const wobble = .25 * Math.sin(t * 6.3 + side) + .093 * Math.sin(t * 21);
      const center = bank ? bank.shoreline(z) - side * (offset + wobble) : river.x + river.halfWidth * offset + wobble;
      const fade = smoothstep(t, 0, .18) * (1 - smoothstep(t, .67, 1));
      const width = (.25 + .16 * Math.sin(t * 12.4) ** 2) * (side ? 1 : .48);
      for (let lane = 0; lane < 3; lane++) {
        positions.push(center + (lane - 1) * width * fade, -.093, z);
        guides.push(ink * fade * (lane === 1 ? .62 + .38 * Math.sin(t * 29 + start) ** 2 : .01), 0);
      }
      const row = base + i * 3;
      if (i < 24) indices.push(row, row + 3, row + 1, row + 1, row + 3, row + 4,
        row + 1, row + 4, row + 2, row + 2, row + 4, row + 5);
    }
  }
  for (const [x, z, span, lean] of [[2.7, 66.6, 6.1, .10], [16.7, 57.7, 5.3, -.19]]) {
    const base = positions.length / 3;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = t * 2 - 1;
      const px = x + span * u;
      const pz = z - 1.7 + .82 * u * u + lean * span * u + .15 * Math.sin(t * 18);
      const fade = smoothstep(t, 0, .23) * (1 - smoothstep(t, .61, 1));
      for (let lane = 0; lane < 3; lane++) {
        positions.push(px, -.094, pz + (lane - 1) * .28 * fade);
        guides.push(fade * (lane === 1 ? .24 : 0), 0);
      }
      const row = base + i * 3;
      if (i < 16) indices.push(row, row + 1, row + 3, row + 1, row + 4, row + 3,
        row + 1, row + 2, row + 4, row + 2, row + 5, row + 4);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('inkGuides', new Float32BufferAttribute(guides, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const wash = environment.add(root, geometry, [0, 0, 0], { profile: { geometryInfluence: 0, strokes: false } });
  wash.name = '千山·沿岸回水';
  wash.userData.inkSurfaceWash = true;
  wash.userData.inkIdSuppressed = true;
  wash.renderOrder = 2;
}

function rebrushBlueCliffs(root) {
  for (const mesh of root.children) {
    if (mesh.name !== '江左石青' && mesh.name !== '石青斜坡') continue;
    mesh.userData.inkTint = '#566d70';
    mesh.userData.inkTintAmount *= .69;
    const guide = mesh.geometry.getAttribute('inkGuides');
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const drag = x * .51 - y * .35 + z * .23 + .37 * Math.sin(y * 1.09 + z * .22);
      const breakline = smoothstep(Math.sin(z * .81 + y * 1.16) + .31 * Math.sin(x * 1.73), -.21, .76);
      const grain = (1 - smoothstep(Math.abs(Math.sin(drag)), .08, .43)) * breakline;
      const face = smoothstep(y, 1.55, 4.5) * (1 - .48 * smoothstep(y, 10.7, 13.5));
      guide.setXY(i, Math.max(guide.getX(i) * .70, .47 * grain * face), guide.getY(i) * .74);
    }
    guide.needsUpdate = true;
  }
}

function quietFarShoals(root) {
  for (const mesh of root.children) {
    const tanShoal = mesh.name === '赭墨横洲' && mesh.position.z > 60;
    const greenShoal = mesh.name === '青绿江岛' && mesh.position.z > 50;
    if (!tanShoal && !greenShoal) continue;
    mesh.userData.inkTint = tanShoal ? '#918778' : '#748279';
    mesh.userData.inkTintAmount *= .48;
    mesh.userData.landGain *= .73;
    mesh.userData.inkMineralHold *= .66;
  }
}

const chapterCliffStrokes = [
  { strike: 16.8, foot: 4.15, lip: 9.85, lean: .43, width: 2.35, load: .61 },
  { strike: 11.3, foot: 4.45, lip: 8.35, lean: -.48, width: 1.48, load: .44 },
  { strike: 2.55, foot: 4.75, lip: 8.75, lean: .37, width: 1.61, load: .50 },
];

function chapterCliffInk(strike, depth, height) {
  const lowFace = smoothstep(height, 1.40, 3.28) * (1 - smoothstep(height, 5.66, 7.32));
  let bone = 0, dry = 0;
  for (const stroke of chapterCliffStrokes) {
    const run = (depth - stroke.foot) / (stroke.lip - stroke.foot);
    const taper = smoothstep(run, 0, .29) * (1 - smoothstep(run, .68, 1));
    const drift = .19 * Math.sin(run * 14.1 + stroke.strike) + .10 * Math.sin(run * 31.8);
    const cross = strike - stroke.strike - stroke.lean * (depth - 7) - drift;
    const width = stroke.width * (.62 + .38 * taper);
    const pressure = .50 + .50 * smoothstep(Math.sin(depth * 1.53 + strike * .29), -.50, .77);
    const loaded = 1 - smoothstep(Math.abs(cross), width * .28, width);
    const bristle = 1 - smoothstep(Math.abs(cross - width * .56), .09, width * .44);
    bone = Math.max(bone, stroke.load * loaded * taper * pressure);
    dry = Math.max(dry, stroke.load * bristle * taper * (1 - .62 * pressure));
  }
  return [bone * lowFace, dry * lowFace];
}

function prepareChapterCliff(root) {
  const mesh = root.children.find(child => child.name === '江左石青');
  if (!mesh) return;
  const base = mesh.geometry;
  const carved = base.clone();
  const position = carved.getAttribute('position');
  const guide = carved.getAttribute('inkGuides');
  const brush = carved.getAttribute('inkValleyBrush');
  const strata = carved.getAttribute('inkStrata');
  const mineral = carved.getAttribute('inkMineralMask');
  const dampInk = new Float32Array(brush.array.length);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + mesh.position.x;
    const y = position.getY(i);
    const z = position.getZ(i) + mesh.position.z;
    const across = smoothstep(x, -42, -32) * (1 - smoothstep(x, -13, -6));
    const along = smoothstep(z, -24, -16) * (1 - smoothstep(z, 26, 35));
    const face = across * along * smoothstep(y, 3.7, 8.2);
    if (!face) continue;

    // Carve the isolated high caps into a lower, angled shoulder while the
    // dragon is shown in profile. The low terrain and pine roots stay put.
    const strike = z + .43 * (x + 20);
    const shoulder = 4.3 + .59 * Math.sin(strike * .19) + .36 * Math.sin(strike * .47 + .4);
    position.setY(i, y - shoulder * face);

    const laid = strike - .72 * y + .44 * Math.sin(x * .37 - z * .21);
    const slab = 1 - smoothstep(Math.abs(Math.sin(laid * .76)), .18, .55);
    const breakInk = smoothstep(Math.sin(strike * 1.07 + y * .58) + .41 * Math.sin(x * 2.3 + z * 2.1), -.39, .71);
    const dry = smoothstep(Math.sin(laid * 2.17 + x * 1.32), .54, .99) * (1 - breakInk);
    const wash = face * (1 - .54 * smoothstep(y, 9.6, 13.2));
    guide.setXY(i, guide.getX(i) * (1 - .48 * face) + .33 * wash * slab * breakInk,
      guide.getY(i) * (1 - .63 * face) + .28 * wash * dry);
    brush.setXY(i, brush.getX(i) * (1 - .58 * face) + .38 * wash * slab * breakInk,
      brush.getY(i) * (1 - .42 * face) + .39 * wash * dry);
    mineral.setX(i, mineral.getX(i) * (1 - .72 * face));
  }
  // Put the stronger deposits on a few downhill facets. The profile above
  // these strokes stays light behind the raised wing and trailing body.
  for (let i = 0; i < position.count; i++) {
    const [bone, dry] = chapterCliffInk(strata.getX(i), strata.getY(i), position.getY(i));
    dampInk[i * 2] = bone;
    dampInk[i * 2 + 1] = dry;
  }
  carved.computeVertexNormals();

  // The ink pass clones this mesh geometry. Keep independent data arrays
  // and update the registered clone, without touching the terrain sampler.
  const channels = ['position', 'normal', 'inkGuides', 'inkValleyBrush', 'inkMineralMask'];
  const data = channels.map(name => {
    const source = base.getAttribute(name);
    source.setUsage(DynamicDrawUsage);
    return { name, original: source.array.slice(), carved: carved.getAttribute(name).array };
  });
  base.computeBoundingBox();
  base.boundingSphere = base.boundingBox.getBoundingSphere(new Sphere());
  carved.dispose();
  const tints = [
    { mesh: root.children.find(child => child.name === '江右墨崖'),
      target: '#53645d', strength: .58, timing: [6.05, 6.48, 7.50, 8.45] },
    { mesh: root.children.find(child => child.name === '青绿江岛' && child.position.x === -6.2 && child.position.z === 21.6),
      target: '#57727b', strength: .78, timing: [4.94, 5.46, 8.02, 9.54] },
  ].filter(tint => tint.mesh).map(tint => {
    const { inkTint, inkTintAmount } = tint.mesh.userData;
    return { ...tint, inkTint, inkTintAmount, originalColor: new Color(inkTint), targetColor: new Color(tint.target),
      color: new Color(), amount: 0 };
  });
  chapterCliffs.set(root, { mesh, data, tints, dampInk, amount: 0, inkAmount: 0 });
}

export function updateChapterCliff(root, age) {
  const cliff = chapterCliffs.get(root);
  if (!cliff) return;
  // As the camera banks toward the channel, keep the near shore's dark
  // value while letting the folded wing read against more restrained colour.
  for (const tint of cliff.tints) {
    const [start, full, release, end] = tint.timing;
    const amount = age === undefined ? 0
      : MathUtils.smootherstep(age, start, full) * (1 - MathUtils.smootherstep(age, release, end));
    if (amount === tint.amount) continue;
    tint.amount = amount;
    tint.mesh.userData.inkTint = amount === 0 ? tint.inkTint : tint.color.copy(tint.originalColor).lerp(tint.targetColor, amount);
    tint.mesh.userData.inkTintAmount = amount === 0 ? tint.inkTintAmount
      : (tint.inkTintAmount ?? .6) * MathUtils.lerp(1, tint.strength, amount);
  }
  const amount = age === undefined ? 0
    : MathUtils.smootherstep(age, 3.84, 4.15) * (1 - MathUtils.smootherstep(age, 6.3, 7.55));
  const inkAmount = age === undefined ? 0
    : MathUtils.smootherstep(age, 4.8, 5.25) * (1 - MathUtils.smootherstep(age, 6.28, 6.85));
  if (amount === cliff.amount && inkAmount === cliff.inkAmount) return;
  for (const { name, original, carved } of cliff.data) {
    const inBrush = name === 'inkValleyBrush';
    if (amount === cliff.amount && !inBrush) continue;
    const attribute = cliff.mesh.geometry.getAttribute(name);
    if (inBrush && inkAmount > 0) {
      for (let i = 0; i < original.length; i++) {
        const base = MathUtils.lerp(original[i], carved[i], amount);
        attribute.array[i] = base + (1 - base) * inkAmount * cliff.dampInk[i];
      }
    } else if (amount === 0) attribute.array.set(original);
    else if (amount === 1) attribute.array.set(carved);
    else for (let i = 0; i < original.length; i++) {
      attribute.array[i] = original[i] + amount * (carved[i] - original[i]);
    }
    attribute.needsUpdate = true;
  }
  cliff.amount = amount;
  cliff.inkAmount = inkAmount;
}

function paintHeroRidge(u, v, h) {
  // The river-facing slope opens in one deliberate sweep. Keep the highest
  // ink contour and outer shoulder intact so the ridge remains recognizable.
  const sweep = .15 + .63 * (v + .20) + .028 * Math.sin(v * 14.5);
  const edge = u - sweep + .012 * Math.sin(v * 37 + u * 21);
  const band = 1 - smoothstep(Math.abs(edge), .090, .245);
  const reach = smoothstep(v, -.77, -.53) * (1 - smoothstep(v, -.045, .16));
  const lowerFace = smoothstep(h, .035, .10) * (1 - smoothstep(h, .44, .63));
  const reserve = .94 * band * reach * lowerFace;

  // One off-centre dry crease carries the eye up the shoulder. Its grain
  // cuts the edges and the wash tapers before reaching the summit.
  const creaseAt = -.34 + .36 * (v + .20) + .016 * Math.sin(v * 24);
  const distance = Math.abs(u - creaseAt);
  const crease = 1 - smoothstep(distance, .014, .092);
  const broken = .48 + .52 * smoothstep(Math.sin(v * 25 + u * 17), -.55, .84);
  const dryFace = smoothstep(h, .12, .30) * (1 - smoothstep(h, .62, .83));
  return [reserve, .72 * crease * broken * dryFace];
}

const ridges = [
  {
    name: '千山·石青主峰', x: -26, z: 65, width: 16, depth: 16, height: 32.5,
    tint: '#355664', angle: -.18, near: true, brush: 'cliff', paintFace: paintHeroRidge,
    folds: [[-.30, .37, -.31, .72, -.06], [.06, .30, -.17, 1, -.19], [.42, .45, .28, .60, .19]],
  },
  {
    name: '千山·隔岸横岭', x: 36, z: 66, width: 22, depth: 20, height: 19,
    tint: '#507663', angle: .23, near: true, brush: 'shelf',
    folds: [[-.36, .52, -.36, .83, .22], [.04, .55, .33, .60, .06], [.52, .38, -.13, .39, .35]],
  },
  {
    name: '千山·云后连脊', x: -6, z: 111, width: 31, depth: 20, height: 23,
    tint: '#748f89', angle: -.10,
    folds: [[-.50, .46, -.29, .58, .02], [-.12, .35, -.18, .82, -.13], [.34, .56, .26, .69, .07]],
  },
  {
    // A low spur joins the east bank. Its inner end passes below the camera
    // while the middle and far ridges stay in the view down the river.
    name: '千山·东岸墨肩', x: 23.7, z: 27.2, width: 7.7, depth: 9.0, height: 11.8,
    tint: '#374a41', angle: -.31, near: true, brush: 'shelf',
    folds: [[-.48, .42, -.19, .69, .14], [-.13, .55, -.29, .93, .27], [.44, .57, -.20, .77, .23]],
  },
];

/** Layer the backdrop on either bank of the open river corridor. */
export function* addChapterVista(environment, root) {
  rebrushBlueCliffs(root);
  yield;
  prepareChapterCliff(root);
  quietFarShoals(root);
  yield;
  for (const ridge of ridges) {
    addValleyMass(environment, root, ridge);
    if (ridge.brush === 'cliff') {
      const face = root.children.at(-1);
      // The hero face keeps its mineral wash at this viewing distance.
      face.userData.landscape = 1;
      face.userData.landGain = 1.85;
    }
    yield;
  }
  const banks = paintBanks(environment, root);
  yield;
  plantBankPines(environment, root, banks);
  yield;
  plantRiverShoulderPine(environment, root, banks);
  yield;
  yield* paintCurrent(environment, root, banks);
}
