import * as THREE from 'three';

const {lerp, smoothstep} = THREE.MathUtils;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, 1);
const rings = 76;
const sides = 14;
const frontStation = 9;
const rearStation = 29;
const forms = [
  {radius:.44, width:.44, height:.27, muzzle:.48, tint:'#4a6253'},
  {radius:.72, width:.64, height:.39, muzzle:.63, tint:'#384e43'},
  {radius:.72, width:.61, height:.48, muzzle:.66, tint:'#415866'},
  {radius:.77, width:.64, height:.51, muzzle:.73, tint:'#35494a'},
  {radius:.72, width:.59, height:.47, muzzle:.68, tint:'#5c5542'},
];

function brushMesh(geometry, tint, amount=.30) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData.inkTint = tint;
  mesh.userData.inkTintAmount = amount;
  return mesh;
}

function oval(parent, tint, position, scale) {
  const mesh = brushMesh(new THREE.SphereGeometry(1, 16, 10), tint);
  mesh.position.fromArray(position);
  mesh.scale.fromArray(scale);
  parent.add(mesh);
  return mesh;
}

function tube(parent, points, radius, tint) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const mesh = brushMesh(new THREE.TubeGeometry(curve, 10, radius, 5), tint);
  parent.add(mesh);
  return mesh;
}

function skinGeometry(radius) {
  const geometry = new THREE.BufferGeometry();
  const points = new Float32Array((rings + 1) * sides * 3);
  const indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const u = ring / rings;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const index = ring * sides + side;
      points.set([Math.cos(angle) * radius, Math.sin(angle) * radius, -u * 8], index * 3);
      if (ring < rings) {
        const next = ring * sides + (side + 1) % sides;
        indices.push(index, index + sides, next, next, index + sides, next + sides);
      }
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('inkRestPosition', new THREE.Float32BufferAttribute(points.slice(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function feather(parent, start, end, width) {
  const direction = new THREE.Vector3().fromArray(end).sub(new THREE.Vector3().fromArray(start));
  const origin = new THREE.Vector3().fromArray(start);
  const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const points = [];
  for (const [fraction, edge, relief] of [[0,0,0],[.40,-.65,0],[1,0,0],[.59,1,0],[.42,0,.11]]) {
    const point = origin.clone().addScaledVector(direction, fraction).addScaledVector(normal, edge * width);
    points.push(point.x, point.y + relief, point.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);
  geometry.computeVertexNormals();
  parent.add(brushMesh(geometry, '#69604b', .44));
}

function contactNode(parent, x, y, z) {
  const node = new THREE.Object3D();
  node.position.set(x, y, z);
  parent.add(node);
  return node;
}

function wingContacts(group, side) {
  return [
    [0, 0, 0], [.45, .21, .12], [.93, .40, .22],
    [2.42, .48, -.31], [3.19, .31, -.74], [3.67, .22, -.98],
  ].map(([x, y, z]) => ({ bone: contactNode(group, side*x, y, z) }));
}

/** Open-source character made from mathematical profiles and mesh primitives. */
export class PublicDragon {
  constructor(stage, ink) {
    this.stage = stage;
    this.form = forms[stage];
    this.root = new THREE.Group();
    this.root.name = `Procedural dragon ${stage + 1}`;
    this.body = brushMesh(skinGeometry(this.form.radius), this.form.tint, .41);
    this.body.frustumCulled = false;
    this.root.add(this.body);
    this.head = new THREE.Group();
    this.jaw = new THREE.Group();
    this.root.add(this.head);
    this.head.add(this.jaw);
    this.limbs = stage >= 2 ? { legs: [] } : null;
    this.feet = this.limbs?.legs ?? [];
    this.wings = [];
    if (stage === 4) this.flightLimbs = { wings: this.wings };
    this.dorsal = [];
    this.centers = Array.from({length:rings + 1}, () => new THREE.Vector3());
    this.pathPoints = this.centers;
    this.tangent = new THREE.Vector3();
    this.lateral = new THREE.Vector3();
    this.vertical = new THREE.Vector3();
    this.pawShift = new THREE.Vector3();
    const {width, height, muzzle, tint} = this.form;
    oval(this.head, tint, [0,.07,.10], [width,height,.62 + stage*.045]);
    oval(this.head, tint, [0,-.03,.50], [width*.74,height*.65,muzzle]);
    oval(this.jaw, '#8b8a72', [0,-height*.48,.52], [width*.71,height*.33,muzzle*.90]);
    for (const side of [-1,1]) {
      oval(this.head, '#8a7851', [side*width*.82,height*.37,.42], [.083,.065,.077]);
      oval(this.head, '#211f19', [side*width*.94,height*.37,.43], [.027,.057,.024]);
      oval(this.head, '#302c22', [side*width*.46,.10,.94], [.061,.028,.046]);
      if (stage >= 2) {
        tube(this.head, [[side*.39,-.13,.68],[side*.68,-.21,.90],[side*1.02,-.12,.74],[side*1.22,.14,.29]], .024, '#5c5b4c');
        tube(this.head, [[side*.28,.31,-.02],[side*.55,.49,-.31],[side*.63,.55,-.82]], .096, tint);
      }
      if (stage >= 3) {
        tube(this.head, [[side*.32,.39,-.17],[side*.45,.73,-.45],[side*.62,1.07,-.61]], .083, '#8b7651');
        tube(this.head, [[side*.42,.68,-.41],[side*.68,.82,-.52],[side*.83,.97,-.69]], .045, '#8b7651');
      }
      if (stage < 2) continue;
      for (const rear of [false,true]) {
        const group = new THREE.Group();
        const digits = [];
        tube(group, [[0,.04,0],[side*.42,-.24,-.23],[side*.61,-.51,.12]], .15, tint);
        oval(group, tint, [side*.65,-.53,.19], [.24,.13,.29]);
        for (let digit=0;digit<3;digit++) {
          const x=side*.65+(digit-1)*.13;
          tube(group, [[x,-.52,.27],[x,-.58,.48],[x,-.68,.55]], .034, '#786d54');
          digits.push(contactNode(group,x,-.68,.55));
        }
        if (stage===4) {
          tube(group, [[side*.66,-.52,.06],[side*.68,-.62,-.11],[side*.69,-.66,-.17]], .034, '#786d54');
          digits.push(contactNode(group, side*.69, -.66, -.17));
        }
        this.root.add(group);
        this.feet.push({group,rear,side,digits,palm:contactNode(group,side*.65,-.53,.42),
          ankle:contactNode(group,side*.61,-.51,.12),knee:contactNode(group,side*.42,-.24,-.23)});
      }
      if (stage===4) {
        const wing = new THREE.Group();
        wing.userData.proceduralWing = true;
        tube(wing, [[0,0,0],[side*.93,.40,.22],[side*2.42,.48,-.31],[side*3.67,.22,-.98]], .13, tint);
        for (let index=0;index<8;index++) {
          const u=index/7;
          feather(wing, [side*(.45+2.70*u),.31+.18*u,.15-.81*u],
            [side*(.68+3.28*u),-.12+.25*u,-1.76-.93*u], .40-.12*u);
        }
        this.root.add(wing);
        this.wings.push({wing,side,joints:wingContacts(wing,side)});
      }
    }
    if (stage >= 2) {
      for (let index=0;index<10;index++) {
        const fin = new THREE.Group();
        tube(fin, [[0,0,0],[.08,.38,-.17],[.15,.52,-.65]], .058, tint);
        this.root.add(fin);
        this.dorsal.push(fin);
      }
    }
    ink.register(this.root, {strokes:false, geometryInfluence:0, occlusionProxy:false, reserveStrength:.33,
      toneRange:[.13,.51], coherentInk:.14});
    this.bridge={owner:this,root:this.root,entries:[]};
    for (const record of ink.records) {
      const {mesh}=record;
      if (!this.root.getObjectById(mesh.id)) continue;
      const inkRole=mesh===this.body ? 'body' : mesh.parent?.userData.proceduralWing ? 'wing' : 'detail';
      this.bridge.entries.push({mesh,record,inkRole,variant:'cap'});
      if (record.mesh !== this.body) continue;
      record.material.vertexShader = 'attribute vec3 inkRestPosition;\n' + record.material.vertexShader
        .replace('vPaint = (position - uCenter) * uObjectScale;', 'vPaint = (inkRestPosition - uCenter) * uObjectScale;');
    }
  }

  update(spine, motion, length) {
    this.motion=motion;
    const {centers,tangent,lateral,vertical} = this;
    for (let ring=0;ring<=rings;ring++) spine.atDistance(ring / rings * length / spine.scale, centers[ring]).multiplyScalar(spine.scale);
    const position = this.body.geometry.attributes.position;
    for (let ring=0;ring<=rings;ring++) {
      const u = ring / rings;
      const center=centers[ring];
      tangent.subVectors(centers[Math.max(0,ring-1)],centers[Math.min(rings,ring+1)]).normalize();
      lateral.crossVectors(up,tangent).normalize();
      vertical.crossVectors(tangent,lateral).normalize();
      const neck = lerp(.61,1,smoothstep(u,0,.18));
      const taper = Math.max(.004,(1-u)**.59);
      const radius = this.form.radius * neck * taper * (1 + .15 * Math.sin(Math.PI*u));
      for (let side=0;side<sides;side++) {
        const angle = side / sides * Math.PI * 2;
        const x = Math.cos(angle)*radius;
        const y = Math.sin(angle)*radius*(this.stage < 2 ? .68 : .80);
        position.setXYZ(ring*sides+side,center.x+lateral.x*x+vertical.x*y,center.y+lateral.y*x+vertical.y*y,center.z+lateral.z*x+vertical.z*y);
      }
    }
    position.needsUpdate=true;
    this.body.geometry.computeVertexNormals();
    this.head.position.copy(centers[0]);
    this.head.quaternion.setFromUnitVectors(forward,tangent.subVectors(centers[0],centers[2]).normalize());
    this.jaw.rotation.x=.40*motion.jaw;
    const gate=motion.gatePose;
    for (const {group,rear,side} of this.feet) {
      const station = rear ? rearStation : frontStation;
      this.posePart(group,station,side*.32);
      group.rotateX(.20 * Math.sin(motion.phase+side+(rear?2:0))-.34*motion.strike);
    }
    this.chapterWingGrowth=motion.chapterWing ? this.chapterWingGrowth ?? [0,0] : undefined;
    for (const {wing,side} of this.wings) {
      const chapter=motion.chapterWing;
      const opening=chapter ? smoothstep(chapter.opening,side<0?0:.12,side<0?.88:1) : 1;
      if (this.chapterWingGrowth) this.chapterWingGrowth[Number(side>0)]=opening;
      this.posePart(wing,frontStation,side*.29);
      wing.visible=opening>.005;
      wing.scale.setScalar(Math.max(.005,opening));
      const flap=.52*Math.sin(motion.wingPhase*Math.PI*2)*(1-.8*motion.arrival);
      wing.rotateZ(side*(.23+flap-.53*(gate?.rainPress??0)+.37*(gate?.tuck??0)));
    }
    this.dorsal.forEach((fin,index) => {
      this.posePart(fin,4+index*3,0);
      fin.position.y+=this.form.radius*.57;
      fin.scale.setScalar(1-index*.043);
      fin.rotateZ(.17*Math.sin(motion.phase-index*.57));
    });
    this.root.updateMatrixWorld(true);
    this.courtContacts=null;
    if (this.stage===4 && gate?.targets) this.plantPaws(gate);
    this.lengthScale=length/spine.scale;
  }

  posePart(part, station, lateralOffset) {
    this.tangent.subVectors(this.centers[station-1],this.centers[station+1]).normalize();
    this.lateral.crossVectors(up,this.tangent).normalize();
    part.position.copy(this.centers[station]).addScaledVector(this.lateral,lateralOffset);
    part.quaternion.setFromUnitVectors(forward,this.tangent);
  }

  muzzle(target, inset=0) {
    return this.head.localToWorld(target.set(0,-this.form.height*.19,.50+this.form.muzzle-inset));
  }

  frontPalm(target, side) {
    const foot=this.feet.find(item=>!item.rear&&item.side===side);
    return foot?.palm.getWorldPosition(target);
  }

  clawTip(target, digit) {
    const side=this.motion?.clawSide ?? this.motion?.action?.side;
    const foot=this.feet.find(item=>!item.rear&&item.side===(side>0?1:-1));
    return foot?.digits[digit]?.getWorldPosition(target);
  }

  // The procedural model already poses its sockets in world space.
  contactWorld(point, _parameters, out) {
    return out.copy(point);
  }

  plantPaws(gate) {
    for (const foot of this.feet) {
      const side=Number(foot.side>0);
      const target=gate.targets[side];
      if (foot.rear || !target || !gate.pawWeight[side]) continue;
      foot.digits[1].getWorldPosition(this.pawShift);
      this.pawShift.subVectors(target.pawWorld,this.pawShift)
        .clampLength(0,target.reach??1.55).multiplyScalar(gate.pawWeight[side]);
      foot.group.position.add(this.pawShift);
      foot.group.updateMatrixWorld(true);
    }
    if (gate.courtLandmark) this.courtContacts=this.pawPoints(false);
  }

  pawPoints(rear, part) {
    return this.feet.filter(foot=>foot.rear===rear).map(foot=>
      (part ? foot[part] : foot.digits[1]).getWorldPosition(new THREE.Vector3()));
  }

  finaleContacts() {
    if (this.stage!==4) return null;
    const wingPoints=joint=>this.wings.map(({joints})=>joints[joint].bone.getWorldPosition(new THREE.Vector3()));
    return {
      front:this.pawPoints(false), rear:this.pawPoints(true),
      ankle:this.pawPoints(true,'ankle'), ankleAxis:this.pawPoints(true,'knee'),
      wing:wingPoints(0), wingSeat:wingPoints(2), wingAxis:wingPoints(3),
    };
  }

  lockedClawPoint(_landmark, target) {
    const foot=this.feet.find(item=>!item.rear&&item.side>0);
    return foot?.digits[1].getWorldPosition(target);
  }

  stats() {
    return {totalLength:this.lengthScale ?? 1};
  }
}
