import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const P = point => new THREE.Vector3(...point);
const mix = THREE.MathUtils.lerp;
const sides = [-1, 1];
const bellCurve = x => Math.exp(-(x * x));
export const FAUNA_REGION = Object.freeze({ body: 0, joint: 1, membrane: 2, armor: 3, bell: 4, detail: 5, tissue: 6 });

// Keep pigment masks attached to the modeled anatomy and preserve indexed geometry.
function surface(rows, columns, position, ink = () => [0, 0], region = FAUNA_REGION.joint) {
  const positions = [];
  const guides = [];
  const paintCoordinates = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const u = row / rows;
      const v = col / columns;
      const point = position(u, v);
      positions.push(...point);
      guides.push(...ink(u, v, point));
      paintCoordinates.push(u, v, region, 0);
      if (row === rows || col === columns) continue;
      const i = row * (columns + 1) + col;
      const j = i + columns + 1;
      indices.push(i, j, i + 1, i + 1, j, j + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('inkGuides', new THREE.Float32BufferAttribute(guides, 2));
  geometry.setAttribute('faunaPaint', new THREE.Float32BufferAttribute(paintCoordinates, 4));
  if (region !== FAUNA_REGION.membrane) geometry.userData.rings = [rows, columns];
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function reverse(geometry) {
  const indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geometry.computeVertexNormals();
  return geometry;
}

function paint(geometry, ink, reserve, region) {
  const uv = geometry.attributes.uv;
  geometry.deleteAttribute('uv');
  const count = geometry.attributes.position.count;
  const guides = new Float32Array(count * 2);
  const paintCoordinates = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    guides[i * 2] = ink;
    guides[i * 2 + 1] = reserve;
    paintCoordinates.set([1 - uv.getY(i), uv.getX(i), region, 0], i * 4);
  }
  geometry.setAttribute('inkGuides', new THREE.BufferAttribute(guides, 2));
  geometry.setAttribute('faunaPaint', new THREE.BufferAttribute(paintCoordinates, 4));
  return geometry;
}

function pebble(center, size, ink = 0, reserve = 0, rotation = 0, region = FAUNA_REGION.armor) {
  const geometry = new THREE.SphereGeometry(1, 10, 7);
  geometry.scale(...size);
  geometry.rotateX(rotation);
  geometry.translate(...center);
  return paint(geometry, ink, reserve, region);
}

export function smoothFaunaSeams(geometry) {
  const normals = geometry.attributes.normal.array;
  for (const [a, b] of geometry.userData.faunaSeams ?? []) {
    const x = normals[a] + normals[b];
    const y = normals[a + 1] + normals[b + 1];
    const z = normals[a + 2] + normals[b + 2];
    const length = Math.hypot(x, y, z);
    if (length < .000001) continue;
    normals[a] = normals[b] = x / length;
    normals[a + 1] = normals[b + 1] = y / length;
    normals[a + 2] = normals[b + 2] = z / length;
  }
  geometry.attributes.normal.needsUpdate = true;
}

function assemble(parts) {
  const seams = [];
  let vertex = 0;
  parts.forEach((part, index) => {
    const coordinates = part.attributes.faunaPaint;
    const seed = (index * .618034) % 1;
    for (let i = 0; i < coordinates.count; i++) coordinates.setW(i, seed);
    if (part.userData.rings) {
      const [rows, columns] = part.userData.rings;
      for (let row = 0; row <= rows; row++) {
        const start = vertex + row * (columns + 1);
        seams.push([start * 3, (start + columns) * 3]);
      }
    }
    vertex += coordinates.count;
  });
  const geometry = mergeGeometries(parts);
  geometry.userData.faunaSeams = seams;
  smoothFaunaSeams(geometry);
  for (const part of parts) part.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

// An indexed ring sweep for bodies, tapered claws, whiskers and fin ribs.
function sweep(points, radii, ringCount, radialCount, ink, aspect = 1, region = FAUNA_REGION.joint) {
  const curve = new THREE.CatmullRomCurve3(points.map(P));
  const frames = curve.computeFrenetFrames(ringCount, false);
  return reverse(surface(ringCount, radialCount, (u, v) => {
    const ring = Math.round(u * ringCount);
    const parameter = u * (radii.length - 1);
    const from = Math.min(radii.length - 2, Math.floor(parameter));
    const radius = mix(radii[from], radii[from + 1], parameter - from);
    return curve.getPointAt(u)
      .addScaledVector(frames.normals[ring], Math.cos(v * TAU) * radius)
      .addScaledVector(frames.binormals[ring], Math.sin(v * TAU) * radius * aspect)
      .toArray();
  }, ink, region));
}

function axialBody(profile, rings, radial, ink, sculpt = (x, y, z) => [x, y, z], region = FAUNA_REGION.body) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([z, y]) => new THREE.Vector3(0, y, z)));
  const geometry = surface(rings, radial, (u, v) => {
    const p = curve.getPoint(u);
    const step = u * (profile.length - 1);
    const index = Math.min(Math.floor(step), profile.length - 2);
    const from = profile[index];
    const to = profile[index + 1];
    const angle = v * TAU;
    const x = Math.cos(angle) * mix(from[2], to[2], step - index);
    const y = p.y + Math.sin(angle) * mix(from[3], to[3], step - index);
    return sculpt(x, y, p.z);
  }, ink, region);

  // Caps keep the nose and tail solid even when viewed directly along the body.
  const indices = Array.from(geometry.index.array);
  const tail = rings * (radial + 1);
  for (let col = 1; col < radial - 1; col++) {
    indices.push(0, col, col + 1, tail, tail + col + 1, tail + col);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A curved membrane between two boundary splines. The ribs and white reserves
// follow the membrane's span, so the same marks read from moving cameras.
function membrane(leading, trailing, arch, ribs = 4, load = .32, reserve = .32, compact = false, scallop = 0) {
  const front = new THREE.CatmullRomCurve3(leading.map(P));
  const back = new THREE.CatmullRomCurve3(trailing.map(P));
  return surface(compact ? 5 : 10, compact ? 3 : 7, (u, v) => {
    const taper = Math.sin(Math.PI * u);
    const edge = v ** 4 * taper * scallop;
    const fold = Math.sin(u * TAU * 3.7 + .8) + .42 * Math.sin(u * TAU * 7.2);
    const p = front.getPoint(u).lerp(back.getPoint(u), Math.min(1.03, v + edge * fold));
    p.y += taper * Math.sin(Math.PI * v) * arch + edge * fold * .29;
    return p.toArray();
  }, (u, v) => {
    const ridge = Math.max(0, Math.cos(Math.PI * (u * ribs + v * .35) * 2));
    return [load * (1 - v) ** 2, reserve * (v * .45 + ridge ** 5 * .55)];
  }, FAUNA_REGION.membrane);
}

function eye(parts, x, y, z, scale = 1) {
  for (const side of sides) {
    parts.push(pebble([side * x, y, z],
      [.034 * scale, .018 * scale, .037 * scale], .81, .23, -.24, FAUNA_REGION.detail));
    parts.push(pebble([side * (x + .017 * scale), y + .002 * scale, z + .009 * scale],
      [.018 * scale, .010 * scale, .026 * scale], .99, .035, -.21, FAUNA_REGION.detail));
  }
}

function foodFish(carp = false) {
  const length = carp ? 1.32 : 1.27;
  const width = carp ? .32 : .28;
  const height = carp ? .40 : .31;
  const pigment = (u, v) => {
    const back = Math.max(0, Math.sin(v * TAU));
    const gill = bellCurve((u - .29) / .028);
    const belly = Math.max(0, -Math.sin(v * TAU));
    return [.30 * back + .54 * gill, .57 * belly + (carp ? .25 * Math.max(0, Math.sin(u * 33 + v * 8)) : .03)];
  };
  const profile = [
    [.51, 0, .035, .025], [.44, 0, .57, .57], [.29, .03, .91, .82],
    [.12, .03, 1, 1], [-.09, 0, .85, .89], [-.30, 0, .51, .62], [-.52, .01, .15, .21], [-.57, .02, .09, .11],
  ].map(([z, y, x, h]) => [z * length, y, x * width, h * height]);
  const parts = [axialBody(profile, 9, 8, pigment)];
  const ridge = height * 1.6;
  parts.push(membrane([[0, height * .80, length * .29], [0, height, 0], [0, height * .32, -length * .53]],
    [[0, height * .81, length * .27], [0, ridge, -length * .09], [0, height * .35, -length * .53]], .015, 7, .48, .34, true));
  for (const side of sides) {
    const tailSpan = carp ? .45 : .29;
    parts.push(membrane([[0, .01, -length * .52], [side * tailSpan * .64, .07, -length * .64], [side * tailSpan, .12, -length * .81]],
      [[0, -.005, -length * .55], [side * tailSpan * .52, -.04, -length * .74], [side * tailSpan, .11, -length * .81]], .045, 3, .58, .30, true));
    parts.push(membrane([[side * width * .56, 0, length * .24], [side * width * 1.10, -.02, length * .07], [side * width * 1.83, -.07, -length * .09]],
      [[side * width * .68, -.06, length * .12], [side * width * 1.23, -.13, -length * .13], [side * width * 1.83, -.07, -length * .09]], .055, 4, .30, .37, true));
  }
  return assemble(parts).scale(.43, .43, .43);
}

const hostileFish = {
  'reed-dart': { span: 1.30, shoulder: .21, depth: .29, sail: .66, trail: .24, fringe: .08 },
  'barbed-dart': { span: 1.14, shoulder: .29, depth: .34, sail: .74, trail: .30, fringe: .14 },
  'lake-dart': { span: 1.17, shoulder: .38, depth: .36, sail: .57, trail: .42, fringe: .15 },
};

function hostileSwimmer(form) {
  const { span, shoulder, depth, sail, trail, fringe } = hostileFish[form];
  const lake = form === 'lake-dart';
  const barbed = form === 'barbed-dart';
  const profile = (lake ? [
    [.57,.01,.12,.10], [.47,.012,.65,.55], [.32,.024,1,.87], [.11,.022,.97,1],
    [-.11,-.008,.73,.79], [-.35,-.015,.40,.46], [-.51,.003,.13,.16], [-.55,.008,.09,.11],
  ] : [
    [.88,.009,.025,.034], [.75,.013,.17,.12], [.56,.013,.34,.26], [.41,.027,.76,.69],
    [.21,.034,1,.96], [.03,.011,.78,1], [-.19,-.008,.53,.69],
    [-.41,-.015,.24,.37], [-.55,.008,.08,.10],
  ]).map(([z,y,x,h]) => [z * span, y, x * shoulder, h * depth]);
  const parts = [axialBody(profile, lake ? 17 : 23, 12, (u, v) => {
    const angle = v * TAU;
    const gill = bellCurve((u - .27 + .065 * Math.sin(angle)) / .082);
    const back = Math.max(0, Math.sin(angle));
    const shoulderEdge = lake ? 0 : bellCurve((u - .46 + .05 * Math.cos(angle)) / .059);
    const blade = lake ? 0 : (1 - THREE.MathUtils.smoothstep(u, .15, .35)) * (.31 + back * .14);
    const ink = .28 + .38 * gill + .23 * back + blade;
    const lift = .28 * Math.max(0, -Math.sin(angle)) * (1 - gill * .76)
      + .39 * shoulderEdge * (1 - back * .62) + blade * .29 * Math.max(0, Math.cos(angle));
    return [ink, lift];
  })];
  eye(parts, shoulder * .65, depth * .40, span * (lake ? .44 : .39), .80);
  const crown = lake ? .24 : barbed ? .17 : .07;
  const backFin = [[0, depth * .76, span * .31], [0, depth * .77, span * .04], [0, depth * .13, -span * .56]];
  if (lake) {
    parts.push(membrane(backFin, [[0, depth * .80, span * .30], [0, sail, span * crown],
      [0, depth * .15, -span * .57]], .023, 5, .58, .36, false, fringe));
  } else {
    const slant = barbed ? .13 : -.08;
    parts.push(membrane(backFin, [[0,depth*.79,span*.31],[slant,sail,span*crown],
      [slant*.63,sail*.76,-span*.12],[0,depth*.15,-span*.57]], .043, 5, .66, .37, false, fringe));
  }
  for (const side of sides) {
    const tip = [side * trail, lake ? .13 : .14 + side * .095, -span * (lake ? .79 : .76 + side * .055)];
    parts.push(membrane([[0,.012,-span*.50], [side*trail*.59,.07,-span*.63], tip],
      [[0,-.019,-span*.55], [side*trail*.40,-.03,-span*.68], tip], .041, 4, .57, .35));
    if (lake) {
      const wingTip = [side * shoulder * 1.82, -.055, -span * .13];
      parts.push(membrane([[side*shoulder*.67,.015,span*.24], [side*shoulder*1.17,.021,span*.09], wingTip],
        [[side*shoulder*.74,-.058,span*.18], [side*shoulder*1.22,-.10,-span*.14], wingTip],
        .043, 4, .42, .43));
    } else {
      // Raked fins leave a gap to the body and to the narrow tail blade.
      const spur = [side * (barbed ? .55 : .47), .12, -span*.24];
      parts.push(membrane([[side*shoulder*.65,.01,span*.25],[side*.33,.065,span*.13],spur],
        [[side*shoulder*.71,-.07,span*.15],[side*.31,-.055,-span*.03],spur],
        .036, 4, .62, .42, false, .12));
      const hook = [side * (barbed ? .39 : .30), .17, span * .28];
      parts.push(membrane([[side*shoulder*.63,.067,span*.39],[side*.25,.105,span*.34],hook],
        [[side*shoulder*.73,.013,span*.27],[side*.25,.045,span*.24],hook],
        .017, 3, .59, .31, true));
    }
  }
  return assemble(parts);
}

function forkJawDart(barbed) {
  const profile = [
    [.94,.035,.014,.020], [.80,.045,.095,.061], [.61,.059,.29,.126], [.39,.047,.36,.205],
    [.13,.026,.29,.222], [-.20,.002,.21,.174], [-.48,-.017,.117,.113],
    [-.65,-.013,.047,.054], [-.72,-.005,.022,.025],
  ];
  const parts = [axialBody(profile, 20, 14, (u, v) => {
    const back = Math.max(0, Math.sin(v * TAU));
    const shoulder = bellCurve((u - .48 + .065 * Math.cos(v * TAU)) / .102);
    const head = 1 - THREE.MathUtils.smoothstep(u, .30, .56);
    return [.29 + .37 * head + .19 * back - .17 * shoulder, .17 + .41 * shoulder];
  })];
  eye(parts, .235, .144, .53, .75);
  parts.push(membrane([[0,.194,.38],[0,.23,.10],[0,.079,-.48]],
    [[0,.19,.38],[0,barbed ? .53 : .43,-.14],[0,.079,-.48]], .024, 4, .53, .30));
  for (const side of sides) {
    // Two swept maxillary lobes frame the forward rostrum in the water-plane silhouette.
    const bend = side * (barbed ? .68 : .62);
    const cheek = [side * (barbed ? .57 : .52), .15, barbed ? .93 : 1.00];
    parts.push(membrane([[side*.26,.051,.39],[bend,.087,.56],cheek],
      [[side*.30,.028,.23],[side*.46,.032,.49],cheek], .049, 4, .67, .38));
    const fin = [side * (barbed ? .56 : .51), .018, -.47];
    parts.push(membrane([[side*.26,.02,.12],[side*.38,.02,-.18],fin],
      [[side*.23,-.053,-.14],[side*.30,-.062,-.39],fin], .032, 4, .44, .38));
    const tail = [side * (barbed ? .30 : .24), .11 + side*.065, -1.03];
    parts.push(membrane([[0,.011,-.60],[side*.17,.03,-.80],tail],
      [[0,-.017,-.69],[side*.096,-.023,-.96],tail], .039, 3, .53, .36));
  }
  return assemble(parts);
}

function ribbonEel() {
  const parts = [axialBody([
    [1.40,.03,.029,.027], [1.24,.039,.114,.091], [.96,.027,.149,.108], [.67,.009,.083,.071],
    [.31,-.010,.135,.102], [-.23,-.024,.103,.083], [-.74,-.021,.075,.064], [-1.35,.028,.049,.042],
    [-1.94,.06,.008,.012],
  ], 25, 12, (u,v) => {
    const angle = v * TAU;
    const flank = Math.sin(angle);
    const seam = bellCurve((u-.374+.032*Math.cos(angle))/.061);
    const head = 1 - THREE.MathUtils.smoothstep(u,.24,.38);
    return [.30 + .27*Math.max(0,flank) + .21*head - .22*seam,
      .28*Math.max(0,-flank) + .47*seam*(.65+.35*Math.abs(flank))];
  })];
  eye(parts, .096, .066, 1.16, .70);
  // Continuous fins widen behind the body instead of forming a separate fork.
  for (const side of sides) {
    const tip = [side * .056, .08, -1.94];
    parts.push(membrane([[side*.119,.057,.29],[side*.071,.047,-.52],[side*.034,.05,-1.42],tip],
      [[side*.121,.05,.24],[side*.278,.084,-.53],[side*.32,.11,-1.30],tip],
      .039, 6, .38, .53, false, .086));
  }
  parts.push(membrane([[0,.09,.30],[0,.056,-.42],[0,.048,-1.52],[0,.065,-1.93]],
    [[0,.09,.29],[0,.29,-.32],[0,.217,-1.34],[0,.065,-1.93]], .026, 7, .42, .48, false, .08));
  return assemble(parts);
}

function reefEel() {
  const jaw = (x,y,z) => bellCurve((y + .084 + .20 * Math.abs(x)) / .032)
    * THREE.MathUtils.smoothstep(z, .60, 1.07);
  const parts = [axialBody([
    [1.18,.003,.154,.094], [1.07,.037,.272,.167], [.79,.026,.303,.223], [.47,.005,.196,.171],
    [.08,-.033,.227,.178], [-.39,-.056,.136,.115], [-.84,-.031,.074,.080], [-1.41,.01,.019,.030],
  ], 25, 14, (u,v,[x,y,z]) => {
    const angle = v * TAU;
    const flank = Math.sin(angle);
    const gill = bellCurve((u-.37+.036*flank)/.046);
    const collar = bellCurve((u-.449+.024*flank)/.067);
    return [.33+.32*gill+.27*Math.max(0,flank)+.38*jaw(x,y,z)-.17*collar,
      .30*Math.max(0,-flank)*(1-.69*gill)+.42*collar*(.77+.23*Math.cos(angle))];
  }, (x,y,z) => {
    const inset = jaw(x,y,z);
    return [x*(1-.086*inset),y,z-.029*inset];
  })];
  eye(parts, .227, .111, .99, .82);
  // The head-heavy reef hunter carries two low, angled crests and cheek fins.
  parts.push(membrane([[0,.17,.99],[0,.22,.62],[0,.18,.08]],
    [[0,.17,.96],[0,.49,.62],[0,.18,.08]], .021, 6, .58, .30, false, .17));
  parts.push(membrane([[0,.17,.19],[0,.105,-.36],[0,.032,-1.39]],
    [[0,.17,.19],[0,.31,-.43],[0,.032,-1.39]], .022, 5, .53, .37, false, .14));
  for (const side of sides) {
    const cheek = [side*.50,.145,.29];
    parts.push(membrane([[side*.23,.064,.75],[side*.40,.085,.49],cheek],
      [[side*.25,-.049,.56],[side*.40,-.064,.21],cheek], .05, 4, .63, .32));
    const tail = [side*.23,.093,-1.58];
    parts.push(membrane([[0,.014,-.86],[side*.14,.056,-1.26],tail],
      [[0,-.021,-1.11],[side*.11,-.043,-1.44],tail], .034, 3, .45, .35));
  }
  return assemble(parts);
}

const creekCrabProfiles = {
  standard: {
    shell: [.54, .45, .36], legRoot: .33, reach: .77, splay: .18,
    jointHeight: .06, kneeHeight: -.04, toeReach: .30, toeHeight: -.44, legWidth: 1,
    clawMass: .70, wrist: .66, clawFront: .51, clawLength: 1,
  },
  'long-leg': {
    shell: [.411, .378, .298], legRoot: .255, reach: .79, splay: .17,
    jointHeight: .185, kneeHeight: .085, toeReach: .31, toeHeight: -.44, legWidth: .66,
    clawMass: .57, wrist: .64, clawFront: .48, clawLength: 1.11,
  },
  'thick-shell': {
    shell: [.618, .464, .447], legRoot: .377, reach: .63, splay: .138,
    jointHeight: -.019, kneeHeight: -.085, toeReach: .25, toeHeight: -.372, legWidth: 1.13,
    clawMass: .85, wrist: .59, clawFront: .42, clawLength: .72,
  },
};

export const SHELL_WOUNDS = {
  5: {
    first: [[[-.53,.22],[-.38,.186],[-.28,.305],[-.12,.238],[-.015,.376],[.176,.224],[.366,.274]]],
    later: [
      [[-.28,.305],[-.215,.134],[-.094,.094],[.014,.156],[.102,.054]],
      [[.176,.224],[.24,.083],[.39,.092],[.54,-.032]],
    ],
    chip: { center: [-.438,.302], span: [.238,.207], rim: [.64,.45] },
  },
  7: {
    first: [[[-.596,.50],[-.386,.405],[-.272,.554],[-.058,.465],[.141,.615],[.33,.449],[.56,.565]]],
    later: [
      [[-.272,.554],[-.31,.72],[-.465,.768],[-.509,.647]],
      [[.33,.449],[.314,.191],[.49,.133],[.49,-.043],[.628,-.148]],
    ],
    chip: { center: [.621,.565], span: [.293,.296], rim: [.85,1] },
  },
};

function distanceToDamage(x, z, paths) {
  let distance = Infinity;
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return distance;
}

// The shell is the first merged piece. Limbs, stalks and claws retain zero
// weights so the damaged rim cannot distort an attack's pose.
function addShellWounds(geometry, shellVertices, type) {
  const { first, later, chip } = SHELL_WOUNDS[type];
  const positions = geometry.attributes.position;
  const weights = new Float32Array(positions.count * 4);
  for (let i = 0; i < shellVertices; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const radius = Math.hypot(x / chip.rim[0], z / chip.rim[1]);
    const center = Math.hypot((x - chip.center[0]) / chip.span[0], (z - chip.center[1]) / chip.span[1]);
    const rim = THREE.MathUtils.smoothstep(radius, .69, .97);
    const bite = 1 - THREE.MathUtils.smoothstep(center, .22, 1);
    weights.set([1, bellCurve(distanceToDamage(x,z,first) / .05),
      bellCurve(distanceToDamage(x,z,later) / .066), rim * bite], i * 4);
  }
  geometry.setAttribute('aShellWound', new THREE.BufferAttribute(weights, 4));
  return geometry;
}

function crab(king, form = 'standard') {
  const profile = creekCrabProfiles[king ? 'standard' : form] ?? creekCrabProfiles.standard;
  const [width, shellDepth, shellHeight] = profile.shell;
  const shellWidth = king ? .64 : width;
  const shell = surface(king ? 16 : 11, king ? 38 : 28, (u, v) => {
    const angle = v * TAU;
    const radius = Math.max(.002, Math.sin(u * Math.PI * .54));
    const serration = .04 * Math.cos(angle * 7) + .022 * Math.cos(angle * 13 + .7);
    const chine = bellCurve((u - .74 + .14 * Math.cos(angle * 2)) / .19);
    return [
      shellWidth * Math.cos(angle) * radius * (1 + serration),
      -.05 + Math.cos(u * Math.PI * .54) * shellHeight + chine * .045,
      shellDepth * Math.sin(angle) * radius * (1 + serration),
    ];
  }, (u, v) => {
    const angle = v * TAU;
    const seam = bellCurve((u - .67 + .15 * Math.cos(angle * 2 + .6)) / .083);
    const crown = bellCurve((u - .32 + .14 * Math.sin(angle + .4)) / .21);
    return [.26 + seam * .42 + .23 * u ** 5, crown * (.28 + .12 * Math.cos(angle * 2 + .8))];
  }, FAUNA_REGION.armor);
  const parts = [reverse(shell), pebble([0, -.04, 0], [shellWidth * .84, .16, .35], .24)];
  if (king) {
    parts.push(axialBody([
      [.54, -.13, .095, .028], [.49, -.106, .27, .066], [.40, -.079, .405, .098],
      [.25, -.058, .39, .114], [.10, -.054, .23, .094],
    ], 12, 14, (u, v) => {
      const fold = .5 + .5 * Math.cos(v * TAU * 3 + u * 1.4);
      return [.25 + .24 * fold, .31 * (1 - fold)];
    }, (x, y, z) => [x, y + .019 * Math.cos(x * 16 + z * 3), z], FAUNA_REGION.tissue));
  }
  for (const side of sides) {
    for (let i = 0; i < 4; i++) {
      const z = -.29 + i * .19;
      const reach = profile.reach + profile.splay * Math.sin(i * .84);
      const leg = [[side * profile.legRoot, -.10, z], [side * reach, profile.jointHeight, z - .09],
        [side * (reach + .18), profile.kneeHeight, z - .23],
        [side * (reach + profile.toeReach), profile.toeHeight, z - .26]];
      const radii = [.051, .048, .037, .006].map(radius => radius * profile.legWidth);
      parts.push(sweep(leg, radii, 10, 5, u => [.46, .27 * Math.sin(u * Math.PI * 3) ** 4]));
    }
    const large = king && side > 0 ? 1.25 : king ? 1.02 : profile.clawMass;
    const wrist = side * (king ? .73 : profile.wrist);
    const z = king ? .64 : profile.clawFront;
    const clawLength = profile.clawLength;
    const armBend = form === 'thick-shell' ? .31 : .41;
    parts.push(sweep([[side * .35, -.06, .22], [side * .62, .09, armBend], [wrist, .11, z]],
      [.084, .11, .092], 9, 7, () => [.35, .17]));
    parts.push(pebble([wrist, .12, z + .09], [.21 * large, .155 * large, .24 * large], .44, .18));
    for (const jaw of sides) {
      const outer = jaw === side;
      const palm = king ? .24 : outer ? .33 : .28;
      const finger = king ? .18 : outer ? .25 : .21;
      const point = king ? .04 : outer ? .12 : .08;
      const reach = king ? .65 : outer ? .78 : .64;
      const jawRise = king ? 0 : outer ? .085 : -.035;
      parts.push(sweep([[wrist + jaw * .095 * large, .13, z + .15 * clawLength],
        [wrist + jaw * palm * large, .18 + jawRise * .30, z + .38 * large * clawLength],
        [wrist + jaw * finger * large, .21 + jawRise, z + reach * large * clawLength],
        [wrist + jaw * point * large, .21 + jawRise, z + reach * large * clawLength]],
      [.126 * large, .11 * large, (king ? .071 : .064) * large, .005], 13, king ? 11 : 8,
      (u, v) => {
        const rim = Math.sin(v * TAU);
        const dryLip = king ? 0 : .18 * bellCurve((u-.48)/.24) * Math.max(0, rim);
        return [.36 + .35 * u + .2 * Math.max(0, -rim), .29 * Math.max(0, rim) * (1 - u) + dryLip];
      }, .92, FAUNA_REGION.armor));
    }
    parts.push(sweep([[side * .17, .14, .28], [side * .23, .23, .42]], [.035, .031], 5, 6, () => [.5, 0]));
  }
  eye(parts, .236, .232, .44, 1.3);
  if (king) {
    for (let i = -3; i <= 3; i++) {
      const x = i * .11;
      parts.push(sweep([[x, .21, -.27], [x * 1.3, .35 - Math.abs(x) * .2, -.37], [x * 1.58, .26, -.57]],
        [.072, .061, .004], 7, 6, u => [.48, .23 * (1 - u)]));
    }
  }
  const shellVertices = shell.attributes.position.count;
  const geometry = assemble(parts);
  return king ? addShellWounds(geometry, shellVertices, 5) : geometry;
}

function lakeCup() {
  const bell = surface(18, 40, (u,v) => {
    const angle = v * TAU;
    const lobe = Math.cos(angle * 5 + .26 * Math.sin(angle * 2));
    const r = .002 + .42 * Math.sin(u * Math.PI * .53) * (1 + .13 * lobe * u ** 3);
    return [Math.cos(angle) * r, .68 * (1 - u ** 1.59) - u ** 3 * (.075 - .046 * lobe), Math.sin(angle) * r];
  }, (u,v) => {
    const fold = Math.max(0, Math.cos(v * TAU * 5 + .23)) ** 5;
    const rim = bellCurve((u - .90) / .10);
    return [.24 + .30 * fold + .50 * rim, .17 + .33 * (1 - fold) * (1 - rim)];
  }, FAUNA_REGION.bell);
  const parts = [reverse(bell)];
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU;
    const x = Math.cos(angle), z = Math.sin(angle);
    const root = [x*.26,-.06,z*.26];
    const bend = [x*.44-z*.075,-.20,z*.44+x*.075];
    const tip = [x*.59+z*.18,-.51,z*.59-x*.18];
    parts.push(sweep([root, bend, [x*.55,-.36,z*.55], tip], [.058,.056,.036,.007],
      12, 6, u => [.50+.16*u,.18*(1-u)]));
  }
  parts.push(pebble([0,-.085,0], [.16,.15,.16], .43, .31, 0, FAUNA_REGION.joint));
  return assemble(parts);
}

function polyp(king, form = 'standard') {
  const veiled = !king && form === 'veil-polyp';
  const drifting = !king && (form === 'drifting-bell' || veiled);
  const spread = drifting && !veiled;
  const radius = king ? .82 : veiled ? .52 : drifting ? .65 : .49;
  const lobes = king ? 9 : veiled ? 4 : drifting ? 5 : 6;
  const length = king ? 1.13 : veiled ? 1.28 : drifting ? .98 : .74;
  const bell = surface(king ? 23 : 16, king ? 54 : 36, (u, v) => {
    const theta = v * TAU;
    const fold = theta * lobes + (king || drifting ? .25 * Math.sin(theta * 3 + .3) : 0);
    const sweep = king || drifting ? u * (.047 * Math.cos(theta + .8) + .025 * Math.sin(theta * 3 + .2)) : 0;
    const lobed = 1 + (.035 + (veiled ? .23 : .1) * u ** 3) * Math.cos(fold) + sweep;
    const r = Math.max(.002, radius * Math.sin(u * Math.PI * .53) * lobed);
    const height = Math.cos(u * Math.PI * .58) * radius * (veiled ? .93 : spread ? .39 : .85) +
      (king ? .042 * Math.sin(theta * 2 - .4) * Math.sin(u * Math.PI) : 0);
    const crownLean = king ? (1 - u) ** 2 * .055 : drifting ? (1 - u) ** 2 * -.096 : 0;
    const rearSweep = drifting ? u * u * -.086 : 0;
    const dip = drifting ? u ** 3 * ((spread ? .116 : .069) * Math.sin(theta + .7) - .038) : 0;
    const lip = king ? bellCurve((u - .897) / .100) : 0;
    return [
      Math.cos(theta) * (r + lip * .076) * (spread ? 1.13 : 1) + crownLean,
      height + (1 - u) * .08 + Math.sin(fold) * .06 * u ** 3 + dip - lip * .032,
      Math.sin(theta) * (r + lip * .076) * (spread ? .79 : 1) + rearSweep,
    ];
  }, (u, v) => {
    const theta = v * TAU;
    const phase = theta * lobes + u * .55 + (king ? .30 * Math.sin(theta * 3 + .3) : 0);
    const rib = Math.max(0, Math.cos(phase)) ** 5;
    const wetRim = king
      ? bellCurve((u - .88 + .055 * Math.sin(theta * 2 + .5)) / .133)
      : bellCurve((u - .97) / .09);
    const dome = bellCurve((u - .33 + .07 * Math.cos(v * TAU * 3)) / .21);
    return [wetRim * .83 + rib * .35, .13 + dome * .40 + (1 - rib) * .18];
  }, FAUNA_REGION.bell);
  const parts = [reverse(bell)];
  for (let i = 0; i < lobes; i++) {
    const a = i / lobes * TAU + (drifting ? .17 * Math.sin(i * 1.93) : 0);
    const s = Math.sin(a);
    const c = Math.cos(a);
    const stream = drifting ? .48 + .15 * Math.sin(i * 2.27) : 0;
    const reach = drifting ? length * (.80 + .19 * Math.sin(i * 1.73 + .8)) : length;
    const tentacle = [[c * radius * .81, -.12, s * radius * .81 - stream * .11],
      [c * radius, -.29, s * radius - stream * .27],
      [c * radius * 1.21 - s * .14, -reach * .62, s * radius * 1.21 + c * .14 - stream * .56],
      [c * radius * 1.28 + s * .09, -reach, s * radius * 1.28 - c * .09 - stream]];
    const radii = king ? [.042, .050, .033, .005] : drifting ? [.035, .041, .028, .005] : [.031, .033, .022, .003];
    parts.push(sweep(tentacle, radii, 13, 5, u => king ? [.51+.14*u,.19*u] : drifting ? [.51+.10*u,.21*u] : [.47,.25*u]));
    if ((king && i % 2 === 0) || (veiled && i % 2 === 0) || (drifting && !veiled && i === 3)) {
      const trailing = tentacle.map(([x, y, z], j) => {
        const sweep = Math.sin(j / 3 * Math.PI);
        const width = drifting ? .19 : .23 + .06 * Math.sin(i * 1.63);
        return [x + s * sweep * width, y + .06 * sweep, z - c * sweep * width];
      });
      parts.push(membrane(tentacle, trailing, .067, 4, .49, .53, false, .14));
    }
  }
  if (spread) {
    // Two trailing membranes give the shallow sea bell its current-facing skirt.
    for (const side of sides) {
      const tip = [side * .22, -.22, -1.34];
      parts.push(membrane([[side*.32,-.11,-.36],[side*.43,-.14,-.69],tip],
        [[side*.42,-.14,-.38],[side*.62,-.21,-.92],tip], .04, 5, .47, .51, false, .15));
    }
  }
  parts.push(pebble([0, -.13, 0], [radius * .38, .2, radius * .38], .45, .37));
  if (king) {
    // Folded oral arms hang inside the bell. Their shallow fluted skirt is
    // brought forward as the canopy turns up after a pulse.
    parts.push(surface(12, 44, (u, v) => {
      const theta = v * TAU;
      const petal = Math.cos(theta * 6 + u * 1.2);
      const r = .066 + u * (.48 + .049 * petal);
      return [Math.cos(theta) * r, -.21 - .12 * (1 - u) + .046 * petal * u, Math.sin(theta) * r];
    }, (u, v) => {
      const fold = .5 + .5 * Math.cos(v * TAU * 6 + u * 1.2);
      return [.30 + .35 * fold, .18 * (1 - fold)];
    }, FAUNA_REGION.tissue));
  }
  return assemble(parts);
}

function kite(forkTail = false) {
  const shoulder = forkTail ? .154 : .19;
  const parts = [axialBody([[.69, .11, .009, .014], [.57, .10, .10, .092], [.39, .04, .13, .13],
    [.10, 0, shoulder, .14], [-.23, .025, .14, .11], [-.52, .02, .045, .03]], 16, 10,
    (u, v) => [.38 + .19 * Math.sin(v * TAU), .25 * Math.max(0, -Math.sin(v * TAU))])];
  eye(parts, .083, .132, .53, .64);
  parts.push(sweep([[0, .10, .64], [0, .09, .77], [0, .035, .83]], [.044, .032, .005], 6, 6, () => [.57, .05]));
  for (const side of sides) {
    if (forkTail) {
      // Longer leading edges and a cut-away trailing edge read as a different
      // bird in the valley without extending the creature's overall span.
      const tip = [side * 1.39, .21, -.24];
      parts.push(membrane([[side * .10, .04, .27], [side * .66, .15, .22], tip],
        [[side * .11, -.025, -.115], [side * .79, .08, -.19], tip], .062, 3, .51, .36));
      for (let i = 0; i < 4; i++) {
        const x = .40 + i * .20;
        const tip = [side * (x + .32), .096 + i * .029, -.43 + i * .024];
        parts.push(membrane([[side * x, .069 + i * .022, -.12], [side * (x + .19), .10, -.22], tip],
          [[side * x, .052 + i * .021, -.25], [side * (x + .14), .078, -.35], tip], .027, 3, .59, .36));
      }
      const tailTip = [side * .48, -.065, -1.37];
      parts.push(membrane([[side * .042, .031, -.38], [side * .22, -.015, -.79], tailTip],
        [[side * .039, .016, -.43], [side * .13, -.061, -.84], tailTip], .041, 4, .45, .39));
      continue;
    }
    parts.push(membrane([[side * .11, .04, .24], [side * .53, .12, .16], [side * 1.24, .20, -.04]],
      [[side * .13, -.04, -.20], [side * .63, .03, -.29], [side * 1.24, .20, -.04]], .063, 4, .46, .30));
    for (let i = 0; i < 6; i++) {
      const x = .30 + i * .153;
      const tip = [side * (x + .36), .105 + i * .022, -.53 + i * .035];
      parts.push(membrane([[side * x, .047 + i * .016, -.16 + i * .02], [side * (x + .22), .09 + i * .018, -.32], tip],
        [[side * x, .04 + i * .015, -.30], [side * (x + .14), .07 + i * .016, -.49 + i * .028], tip], .038, 3, .62, .32));
    }
    parts.push(membrane([[side * .06, .02, -.40], [side * .19, -.01, -.68], [side * .34, -.08, -1.16]],
      [[side * .02, .02, -.42], [side * .075, -.06, -.84], [side * .34, -.08, -1.16]], .05, 4, .42, .31));
  }
  return assemble(parts);
}

function dragonTurtle() {
  const plates = [[0, -.72], [0, -.36], [0, .01], [0, .38], [0, .71]];
  for (const side of sides) {
    plates.push([side * .40, -.57], [side * .48, -.19], [side * .51, .22], [side * .36, .60]);
  }
  function plateSeam(x, z) {
    let near = Infinity;
    let next = Infinity;
    for (const [cx, cz] of plates) {
      const distance = (x - cx) ** 2 * 1.32 + (z - cz) ** 2;
      if (distance < near) {
        next = near;
        near = distance;
      } else if (distance < next) next = distance;
    }
    return 1 - THREE.MathUtils.smoothstep(next - near, .009, .078);
  }
  const shell = surface(24, 48, (u, v) => {
    const theta = v * TAU;
    const r = Math.max(.002, Math.sin(u * Math.PI * .50));
    const plate = .035 * Math.cos(theta * 8) * Math.sin(Math.PI * u);
    const x = Math.cos(theta) * (.85 + plate) * r;
    const z = Math.sin(theta) * (1.0 + plate) * r;
    const ridge = bellCurve(x / .26) * .09;
    const seam = plateSeam(x, z);
    return [x, -.11 + (.57 + ridge) * Math.cos(u * Math.PI * .50) - seam * .037, z];
  }, (u, v, [x, , z]) => {
    const seam = plateSeam(x, z);
    const brokenRidge = bellCurve((x + .09 + .10 * Math.cos(z * 3.8)) / .20);
    return [.25 + .44 * seam + .16 * u ** 4,
      (.09 + .28 * brokenRidge) * (1 - seam * .72)];
  }, FAUNA_REGION.armor);
  const parts = [reverse(shell), pebble([0, -.12, .02], [.78, .21, .93], .42, .2)];
  parts.push(sweep([[0, -.02, .65], [0, -.12, .91], [0, -.04, 1.29], [0, -.02, 1.56]],
    [.25, .23, .18, .05], 13, 12, (u, v) => [.36, .34 * Math.max(0, -Math.sin(v * TAU))],
    1, FAUNA_REGION.tissue));
  parts.push(sweep([[0, -.09, -.70], [.09, -.07, -1.16], [.22, .10, -1.38], [.19, .21, -1.56]],
    [.16, .125, .061, .004], 12, 8, u => [.39, .31 * u]));
  for (const side of sides) {
    for (const z of [-.54, .52]) {
      const toe = [side * 1.34, -.23, z - .12];
      parts.push(sweep([[side * .50, -.14, z], [side * .87, -.14, z + .16], toe], [.14, .13, .073], 9, 7,
        (u, v) => [.51, .27 * Math.max(0, Math.cos(v * TAU * 3))]));
      for (let i = 0; i < 3; i++) {
        const x = toe[0] + side * (.052 + i * .03);
        const offset = (i - 1) * .09;
        parts.push(sweep([[x, -.22, toe[2] + offset], [x + side * .12, -.24, toe[2] + offset - .04],
          [x + side * .18, -.29, toe[2] + offset - .065]], [.04, .026, .005], 6, 5, () => [.65, .21]));
      }
    }
    parts.push(sweep([[side * .13, .07, 1.20], [side * .20, .17, 1.09], [side * .26, .23, .95]],
      [.063, .043, .005], 8, 6, () => [.56, .10]));
  }
  eye(parts, .141, .044, 1.36, 1.24);
  const shellVertices = shell.attributes.position.count;
  return addShellWounds(assemble(parts), shellVertices, 7);
}

const rayWings = {
  'crescent-ray': { tip: [1.31,.20,.23], front: [.73,.085,.54], rear: [.70,-.09,-.57], arch: .091, rim: .06 },
  'needle-ray': { tip: [1.38,.12,-.37], front: [.69,.02,.27], rear: [.62,-.075,-.42], arch: .075, rim: .035 },
  'veil-ray': { tip: [1.42,.32,-.21], front: [.69,.15,.45], rear: [.78,-.12,-.83], arch: .15, rim: .18 },
  'mantle-ray': { tip: [1.37,.085,-.48], front: [.78,.115,.62], rear: [.76,-.17,-.96], arch: .16, rim: .28 },
};

function ray(inAir, form = inAir ? 'veil-ray' : 'crescent-ray') {
  const { tip, front, rear, arch, rim } = rayWings[form];
  const wide = form === 'crescent-ray' || form === 'mantle-ray';
  const parts = [axialBody([
    [.64, -.005, wide ? .17 : .045, .031], [.51, .01, wide ? .31 : .24, .092], [.25, .019, .335, .157],
    [-.03, .01, .265, .148], [-.34, -.018, .139, .089], [-.56, -.012, .056, .033],
  ], 17, 12, (u, v) => {
    const top = Math.max(0, Math.sin(v * TAU));
    const eyeLine = bellCurve((u - .24) / .065);
    return [.21 + .36 * top + .22 * eyeLine, .39 * Math.max(0, -Math.sin(v * TAU))];
  })];
  eye(parts, .223, .073, .473, .60);
  for (const side of sides) {
    const flank = ([x,y,z]) => [side * x, y, z];
    const leading = [[side * .15, .004, .51], flank(front), flank(tip)];
    const trailing = [[side * .12, -.05, -.40], flank(rear), flank(tip)];
    parts.push(membrane(leading, trailing, arch, inAir ? 5 : 4,
      inAir ? .53 : .49, inAir ? .53 : .37, false, rim));
    if (inAir) {
      const tail = [side * (wide ? .72 : .40), wide ? -.27 : .12, wide ? -1.39 : -1.65];
      parts.push(membrane([[side * .035, -.01, -.44], [side * .235, -.17, -.93], tail],
        [[side * .045, -.04, -.51], [side * .115, -.22, -1.04], tail], .061, 3, .52, .38, false, .10));
      parts.push(sweep([[side * .129, -.056, .52], [side * .273, -.094, .36], [side * .38, -.127, .21]],
        [.030, .021, .003], 7, 5, () => [.47, .13]));
    } else {
      const horn = [side * (wide ? .23 : .12), wide ? .18 : .09, wide ? .81 : .85];
      parts.push(sweep([[side * .19, .03, .48], [side * .31, .085, .65], horn],
        [.093,.066,.005], 9, 7, u => [.41, .34 * (1 - u)]));
    }
  }
  if (!inAir) {
    parts.push(sweep([[0, -.012, -.43], [.052, -.041, -.78], [.221, -.059, -1.06], [wide ? .40 : .26, .014, -1.32]],
      [.053, .036, .016, .003], 16, 6, u => [.42, .22 * u]));
  }
  return assemble(parts);
}

function ancientKun() {
  const jawHeight = (x, z) => -.133 - .115 * Math.abs(x) + .051 * (z - .95);
  const jawFade = z => THREE.MathUtils.smoothstep(z, .79, 1.20);
  const jawBand = (x, y, z, width) => bellCurve((y - jawHeight(x, z)) / width) * jawFade(z);
  const sculptJaw = (x, y, z) => {
    const crease = jawBand(x, y, z, .035);
    const shoulder = bellCurve((z - .32) / .78) * Math.max(0, y);
    const backRelief = shoulder * (.032 * Math.sin(x * 13 + z * 4) + .022 * Math.cos(z * 8 - x * 4));
    return [x * (1 - crease * .073), y + backRelief, z - crease * .034];
  };
  const body = axialBody([
    [1.40, -.078, .045, .060], [1.365, -.070, .25, .151], [1.29, -.043, .48, .24],
    [.95, .02, .67, .35], [.51, .06, .65, .44], [.09, .02, .56, .39],
    [-.40, -.03, .38, .32], [-.91, -.02, .19, .19], [-1.27, .05, .11, .097], [-1.55, .08, .078, .052],
  ], 44, 30, (u, v, [x, y, z]) => {
    const angle = v * TAU;
    const flank = Math.sin(angle);
    const dorsal = Math.max(0, flank);
    const pale = Math.max(0, -flank);
    const throat = Math.max(0, Math.cos(angle * 7 + u * 4)) ** 5;
    const mouth = jawBand(x, y, z, .047);
    const underJaw = 1 - THREE.MathUtils.smoothstep(y, jawHeight(x, z) - .095, jawHeight(x, z) - .031);
    const whiteArc = bellCurve((u - .38 - .08 * dorsal) / .043) * (1 - dorsal) * .38;
    const head = jawFade(z);
    const underbody = pale * mix(.60, .42, head) + .19 * throat * pale * (1 - u);
    return [.22 + .55 * dorsal + .85 * mouth, underbody * mix(1, underJaw * .78, head) + whiteArc];
  }, sculptJaw);
  const parts = [body];
  for (const side of sides) {
    const fluke = [side * 1.20, .18, -1.97];
    parts.push(membrane([[0, .08, -1.48], [side * .50, .12, -1.58], fluke],
      [[0, .09, -1.77], [side * .53, .02, -2.11], fluke], .12, 6, .59, .44, false, .11));
    const tip = [side * 1.62, -.20, -.91];
    parts.push(membrane([[side * .58, -.06, .65], [side * 1.10, -.08, .12], tip],
      [[side * .60, -.18, .30], [side * .93, -.26, -.61], tip], .14, 5, .44, .39, false, .12));
    parts.push(sweep([[side * .38, -.20, 1.18], [side * .71, -.21, .99], [side * .98, -.31, .62], [side * 1.13, -.14, .25]],
      [.052, .038, .023, .004], 12, 6, () => [.72, .14]));
    parts.push(sweep([[side * .47, -.19, 1.01], [side * .73, -.26, .68], [side * .89, -.29, .30]],
      [.039, .028, .003], 8, 5, () => [.54, .15]));
  }
  parts.push(membrane([[0, .28, .26], [0, .19, -.27], [0, .09, -.90]],
    [[0, .28, .26], [0, .55, -.30], [0, .59, -.47], [0, .09, -.90]], .025, 4, .70, .22, false, .15));
  for (const side of sides) {
    parts.push(pebble([side * .447, .105, 1.248], [.030, .012, .025], .94, .20, -.22, FAUNA_REGION.detail));
  }
  return assemble(parts).scale(.79, .87, .77);
}

function shrimp() {
  const parts = [];
  const spine = [[0, .045, .32], [.006, .10, .16], [.047, .075, -.02], [.084, .026, -.15], [.024, -.025, -.24], [-.09, -.018, -.21]];
  parts.push(sweep(spine, [.047, .078, .070, .058, .046, .032], 12, 6,
    (u, v) => [.28 + .39 * Math.max(0, Math.sin(u * 44)) ** 8, .22 * Math.max(0, Math.cos(v * TAU))]));
  for (const side of sides) {
    parts.push(sweep([[side * .035, .07, .29], [side * .10, .08, .39], [side * .20, .035, .51]],
      [.011, .009, .003], 5, 4, () => [.51, .05]));
    for (let i = 0; i < 3; i++) {
      const z = .15 - i * .078;
      parts.push(sweep([[side * .047, .02, z], [side * .085, -.027, z], [side * .12, -.048, z - .044]],
        [.012, .009, .002], 3, 4, () => [.52, .02]));
    }
    parts.push(membrane([[-.05, -.01, -.21], [-.13, .02, -.25], [-.23, .035, -.22 + side * .11]],
      [[-.06, -.02, -.20], [-.17, -.02, -.24 + side * .11], [-.23, .035, -.22 + side * .11]], .026, 3, .56, .21, true));
  }
  return assemble(parts);
}

function lakeShrimp() {
  const parts = [sweep([[.02,.015,.37],[.012,.075,.24],[0,.072,.04],
    [-.013,.038,-.18],[-.047,.015,-.39]], [.025,.079,.093,.074,.043], 13, 7, (u,v) => {
    const segment = Math.max(0,Math.sin(u*44)) ** 5;
    return [.30+.35*segment,.36*Math.max(0,Math.sin(v*TAU))*(1-.60*segment)];
  })];
  for(const side of sides) {
    const antenna=[side*.22,.031,.59];
    parts.push(sweep([[side*.029,.031,.32],[side*.12,.075,.48],antenna],
      [.020,.017,.003], 6, 4, () => [.53,.15]));
    const paddle=[side*.258,.022,-.48];
    parts.push(membrane([[side*.021,.018,-.35],[side*.119,.030,-.40],paddle],
      [[side*.026,-.018,-.37],[side*.15,-.015,-.57],paddle], .028, 3, .61, .24, true));
  }
  return assemble(parts).center().scale(1,1,.92);
}

function seaShoal() {
  const parts = [];
  for (const { x, y, z, size, yaw } of [
    { x: .11, y: .027, z: .10, size: 1, yaw: .05 },
    { x: -.15, y: -.031, z: -.16, size: .72, yaw: -.22 },
  ]) {
    const body = axialBody([
      [.39, .014, .006, .005], [.29, .012, .043, .038], [.10, 0, .064, .058],
      [-.09, 0, .055, .046], [-.24, 0, .031, .029], [-.36, .012, .009, .013],
    ], 9, 8, (u, v) => {
      const crest = Math.max(0, Math.sin(v * TAU));
      return [.27 + .26 * crest + .18 * bellCurve((u - .21) / .065), .34 * (1 - crest)];
    });
    const fins = sides.map(side => membrane(
      [[0,.012,-.35],[side*.073,.021,-.43],[side*.119,.025,-.52]],
      [[0,.006,-.37],[side*.045,-.017,-.47],[side*.119,.025,-.52]],
      .018, 2, .54, .17, true,
    ));
    for (const part of [body, ...fins]) {
      parts.push(part.scale(size, size, size).rotateY(yaw).translate(x, y, z));
    }
  }
  return assemble(parts).center();
}

function seaScallop() {
  const valves = sides.map(side => {
    const valve = surface(10, 16, (u, v) => {
      const angle = (v - .5) * 2.05;
      const rib = .5 + .5 * Math.cos(v * TAU * 8);
      const radius = u * (.60 - .115 * Math.abs(v - .5) ** .82 + .032 * rib);
      const dome = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) ** .55 * (.099 + rib * .031);
      return [Math.sin(angle) * radius, side * (.006 + dome), Math.cos(angle) * radius - .25];
    }, (u, v) => {
      const rib = .5 + .5 * Math.cos(v * TAU * 8);
      return [.22 + .39 * (1 - rib) * u + .21 * u ** 5, .31 * rib * u];
    }, FAUNA_REGION.membrane);
    return side < 0 ? reverse(valve) : valve;
  });
  return assemble(valves).center();
}

function seaSpiralShell() {
  const points = Array.from({ length: 13 }, (_, i) => {
    const u = i / 12, angle = .45 + u * TAU * 1.13;
    const radius = .022 + .35 * u ** 1.12;
    return [Math.cos(angle) * radius, .022 * Math.sin(angle), Math.sin(angle) * radius];
  });
  const body = sweep(points, [.033,.046,.060,.088,.12,.139], 29, 9,
    (u, v) => {
      const chamber = Math.max(0, Math.cos(u * TAU * (6 + 2 * u))) ** 5;
      const ridge = Math.max(0, Math.sin(v * TAU));
      return [.32 + .28 * chamber + .17 * u, .23 * ridge * (1 - .65 * chamber)];
    }, .79, FAUNA_REGION.armor);
  return body.center();
}

function airSeed() {
  const pearl = axialBody([
    [.34,0,.008,.008],[.21,0,.105,.104],[.04,0,.147,.137],
    [-.14,0,.12,.11],[-.27,0,.061,.06],[-.35,0,.01,.01],
  ], 10, 8, (u, v) => [
    .28 + .27 * Math.max(0, Math.cos(v * TAU * 3)), .45 * Math.max(0, Math.sin(v * TAU)),
  ]).rotateX(-Math.PI / 2);
  const parts = [pearl];
  for (let i = 0; i < 3; i++) {
    const tip = [.35, .37 + i * .056, -.14 - i * .036];
    const husk = membrane([[.028,-.25,.016],[.15,-.051,.053],[.26,.20,.029],tip],
      [[.041,-.225,.032],[.217,-.042,-.129],[.33,.18,-.139],tip],
      .049, 3, .58, .44, true);
    parts.push(husk.rotateY(i * TAU / 3 + .36));
  }
  return assemble(parts).center();
}

function airHusk() {
  // A seed wall surrounds a real opening in the upright silhouette.
  const parts = [surface(24, 10, (u,v) => {
    const angle = u * TAU;
    const tube = v * TAU;
    const asymmetry = 1 + .14 * Math.sin(angle + .56);
    const width = .057 + .024 * Math.sin(angle) ** 2;
    const radius = .278 * asymmetry + width * Math.cos(tube);
    return [Math.sin(angle) * radius, Math.cos(angle) * (radius * 1.57) - .022,
      .06 * Math.sin(angle * 2) + Math.sin(tube) * width];
  }, (u,v) => {
    const load = .5+.5*Math.sin(u*TAU+.8);
    return [.33 + .27 * load, .22 * Math.max(0,Math.sin(v*TAU)) * (1-load*.56)];
  })];
  parts.push(sweep([[.015,.40,.02],[.062,.48,-.022],[.125,.55,-.055]],
    [.043,.029,.005], 7, 5, u => [.42, .26*(1-u)]));
  return assemble(parts).center();
}

function airSpindle() {
  const core = axialBody([
    [.52,0,.007,.009],[.35,0,.071,.052],[.20,0,.12,.091],[.02,0,.155,.109],
    [-.15,0,.095,.079],[-.34,0,.049,.041],[-.49,0,.007,.008],
  ], 12, 9, (u,v) => [.34+.24*Math.max(0,Math.cos(v*TAU*3)),
    .32*Math.max(0,Math.sin(v*TAU))]).rotateX(-Math.PI/2);
  const parts=[core];
  for(const side of sides) {
    const tip=[side*.11,side*.40,-side*.075];
    parts.push(membrane([[side*.075,-.22,0],[side*.18,-.025,.035],tip],
      [[side*.11,-.20,-.08],[side*.19,.025,-.10],tip], .027, 3, .44, .42, true));
  }
  return assemble(parts).center();
}

function cloud() {
  const points = Array.from({length: 13}, (_, i) => {
    const u = i / 12;
    const angle = .25 + u * TAU * 1.23;
    const radius = .43 * (1 - u * .82);
    return [Math.cos(angle) * radius, .018 + .25 * u, Math.sin(angle) * radius];
  });
  return sweep(points, [.009, .10, .092, .063, .023, .006], 27, 8,
    (u, v) => [.28, .54 * Math.max(0, Math.sin(v * TAU))]);
}

function goldScale() {
  return surface(11, 16, (u, v) => {
    const angle = v * TAU;
    const wave = Math.max(.002, Math.sin(u * Math.PI));
    const rim = 1 + .08 * Math.cos(angle * 3);
    return [Math.cos(angle) * .23 * wave * rim, Math.sin(angle) * .10 * wave + .14 * wave, .39 - .78 * u];
  }, (u, v) => [.35 * (1 - u), .60 * Math.max(0, Math.sin(v * TAU)) ** 4]);
}

function shed() {
  return sweep([[.16, .05, .33], [-.10, .10, .21], [-.18, .04, -.02], [.035, .01, -.23], [.17, .075, -.37]],
    [.092, .081, .055, .041, .005], 19, 9,
    (u, v) => [.44 + .15 * Math.sin(u * 27) ** 4, .34 * Math.max(0, Math.sin(v * TAU))]);
}

function battleScale() {
  const main=surface(7,10,(u,v)=>{
    const edge=Math.max(.002,Math.sin(u*Math.PI))**.78;
    const angle=v*TAU;
    return [Math.cos(angle)*(.17+.036*Math.cos(angle*3))*edge,
      Math.sin(angle)*.073*edge+.093*Math.sin(u*Math.PI),.28-.54*u];
  },(u,v)=>[.43+.16*Math.cos(u*13)**4,.38*Math.max(0,Math.sin(v*TAU))],FAUNA_REGION.armor);
  return assemble([main.rotateY(-.28),main.clone().scale(.63,.64,.60).rotateY(.91).translate(.13,-.025,.19)]).center();
}

export const INK_FOOD = Object.freeze({
  fish: { name: '银鱼', tint: '#546358', strength: .21 },
  shrimp: { name: '青虾', tint: '#52765f', strength: .53 },
  'lake-shrimp': { name: '长须白虾', tint: '#52765f', strength: .53 },
  carp: { name: '灵鲤', tint: '#467487', strength: .46 },
  cloud: { name: '云鳞', tint: '#6d6482', strength: .58 },
  gold: { name: '龙髓', tint: '#a77835', strength: .85 },
  shed: { name: '断尾', tint: '#496d81', strength: .60 },
  'battle-scale': { name: '散鳞灵质', tint: '#82725b', strength: .32 },
  'sea-shoal': { name: '梭鱼群', tint: '#4f6871', strength: .22 },
  'sea-scallop': { name: '扇贝', tint: '#627c7f', strength: .36 },
  'sea-spiral': { name: '旋螺', tint: '#426975', strength: .57 },
  'air-mote': { name: '山岚灵质', tint: '#576b78', strength: .46 },
  'air-spindle': { name: '凝岚灵质', tint: '#576b78', strength: .46 },
  'air-seed': { name: '山岚灵珠', tint: '#567669', strength: .62 },
});

const foodModels = {
  fish: () => foodFish(), shrimp, carp: () => foodFish(true), cloud, gold: goldScale, shed, 'battle-scale':battleScale,
  'lake-shrimp': lakeShrimp,
  'sea-shoal': seaShoal, 'sea-scallop': seaScallop, 'sea-spiral': seaSpiralShell,
  'air-mote': airHusk, 'air-spindle': airSpindle, 'air-seed': airSeed,
};

export function createInkFoodGeometry(kind) {
  return (foodModels[kind] ?? foodModels.fish)();
}

const enemyModels = [() => hostileSwimmer('reed-dart'), () => crab(false), () => polyp(false), kite, ribbonEel,
  () => crab(true), () => polyp(true), dragonTurtle, ancientKun, () => ray(false), () => ray(true)];

export function createInkEnemyGeometry(type, { forkTail = false, form = 'standard' } = {}) {
  if (type === 0 && (form === 'fork-jaw' || form === 'hook-jaw')) return forkJawDart(form === 'hook-jaw');
  if (type === 0 && hostileFish[form]) return hostileSwimmer(form);
  if (type === 4 && form === 'reef-eel') return reefEel();
  if (type === 3 && (forkTail || form === 'fork-tail')) return kite(true);
  if (type === 1 && form !== 'standard') return crab(false, form);
  if (type === 2 && form === 'lake-cup') return lakeCup();
  if (type === 2 && form !== 'standard') return polyp(false, form);
  if ((type === 9 || type === 10) && rayWings[form]) return ray(type === 10, form);
  return (enemyModels[type] ?? enemyModels[0])();
}
