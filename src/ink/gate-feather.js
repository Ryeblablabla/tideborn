import { BufferGeometry, DoubleSide, Float32BufferAttribute, MathUtils, Mesh, MeshStandardMaterial } from 'three';
import { finaleToWorld } from '../heaven-finale.js';

function featherGeometry() {
  const vertices = [], cells = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = .96 * t;
    const shaft = .17 * t ** 1.8;
    const width = .18 * Math.sin(Math.PI * t) ** .78;
    const nick = i === 10 || i === 17 ? .69 : 1;
    vertices.push(shaft - width * nick, -.08 * Math.sin(Math.PI * t), z,
      shaft, .035 * Math.sin(Math.PI * t), z,
      shaft + width * .71 * nick, -.045 * Math.sin(Math.PI * t), z);
    if (i < steps) for (let j = 0; j < 2; j++) {
      const a = i * 3 + j, b = a + 3;
      cells.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(cells);
  geometry.computeVertexNormals();
  return geometry;
}

export class GateFeather {
  constructor(scene, ink) {
    this.mesh = new Mesh(featherGeometry(), new MeshStandardMaterial({ color: '#a9a595', side: DoubleSide }));
    this.mesh.name = '阶前坠羽';
    this.mesh.userData.inkTint = '#5c6260';
    this.mesh.userData.inkTintAmount = .34;
    this.mesh.visible = false;
    this.source = null;
    this.finale = null;
    scene.add(this.mesh);
    ink.register(this.mesh, { geometryInfluence: .4, toneRange: [.17, .72], reserveStrength: .21, strokes: false });
  }

  update(game, finale, shoulder) {
    const elapsed = finale?.elapsed ?? finale?.age ?? 0;
    const release = 13.39;
    this.mesh.visible = finale?.ending === 'locked' && elapsed >= release;
    if (!this.mesh.visible) return this.hide();
    if (this.finale !== finale) {
      this.finale = finale;
      this.source = shoulder?.clone() ?? finaleToWorld(game.ascentOrigin,{x:-3.72,y:21.39,z:35.47});
    }
    const t = MathUtils.clamp((elapsed - release) / 4.72, 0, 1);
    const settle = MathUtils.smoothstep(t, .83, 1);
    const glide = Math.sin(t * Math.PI * 3.55);
    const bed = finaleToWorld(game.ascentOrigin,{x:-.29,y:13.34,z:34.45});
    const drift = finaleToWorld({x:0,z:0,angle:game.ascentOrigin.angle},{
      x:.72*glide*(1-settle),y:.31*glide*(1-settle),z:.70*Math.sin(t*9)*(1-settle),
    });
    this.mesh.position.set(
      MathUtils.lerp(this.source.x,bed.x,t)+drift.x,
      MathUtils.lerp(this.source.y,bed.y,1-Math.pow(1-t,1.32))+drift.y,
      MathUtils.lerp(this.source.z,bed.z,t)+drift.z,
    );
    this.mesh.rotation.set(.46 * glide * (1 - settle), game.ascentOrigin.angle + t * 2.2,
      1.05 * Math.sin(t * 13) * (1 - settle));
  }

  hide() {
    this.mesh.visible = false;
    this.source = null;
    this.finale = null;
  }
}
