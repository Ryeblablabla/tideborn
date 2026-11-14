import * as THREE from 'three';

const CAPACITY = 112;
const FOOD_WIDTH = [.27, .24, .39, .48, .45];

const vertexShader = /* glsl */ `
  attribute vec2 aInkContact;
  varying vec2 vPoint,vContact;
  void main(){
    vPoint=uv*2.-1.;
    vContact=aInkContact;
    gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vPoint,vContact;
  float hash(vec2 p){
    return fract(sin(dot(p,vec2(23.71,97.24)))*43758.55);
  }
  void main(){
    vec2 p=vPoint;
    float fleck=hash(floor((p+vContact.y)*vec2(29.,48.)));
    p.x+=.08*sin(p.y*8.2+vContact.y*9.);
    float radius=length(p);
    float bloom=1.-smoothstep(.19,.99,radius+(fleck-.5)*.091);
    float loaded=1.-smoothstep(.04,.63,radius);
    float pigment=mix(.30,.69,loaded);
    gl_FragColor=vec4(1.-pigment,0.,fleck,vContact.x*bloom*(.74+.26*fleck));
  }
`;

/** Shallow water keeps the contact wash below the moving body or prey. */
export class ShallowContact {
  constructor(scene) {
    const geometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.paint = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2)
      .setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aInkContact', this.paint);
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = '浅水接触墨';
    this.mesh.userData.inkIdSuppressed = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.transform = new THREE.Object3D();
    scene.add(this.mesh);
  }

  write(x, z, angle, width, length, ink, seed) {
    const index = this.mesh.count;
    if (index >= CAPACITY) return;
    const transform = this.transform;
    transform.position.set(x, this.waterY, z);
    transform.rotation.y = angle;
    transform.scale.set(width, 1, length);
    transform.updateMatrix();
    this.mesh.setMatrixAt(index, transform.matrix);
    this.paint.setXY(index, ink, seed);
    this.mesh.count++;
  }

  update(game, active, surface) {
    this.mesh.count = 0;
    if (!active) return;
    this.waterY = surface + .026;
    const head = game.p, spine = game.bodyPath;
    const stageWidth = game.stage === 0 ? .57 : .86;
    const wetness = y => 1 - THREE.MathUtils.smoothstep(y - surface, 1.04, 2.02);
    const headInk = .24 * wetness(head.y);
    if (headInk > .015) this.write(head.x, head.z, head.angle, stageWidth, 1.05, headInk, 0);
    for (let i = 1; i < spine.length; i++) {
      const before = spine[i - 1], at = spine[i];
      const ink = .19 * wetness(at.y);
      if (ink <= .015) continue;
      const taper = 1 - .61 * (i / spine.length) ** 2;
      const angle = Math.atan2(before.x - at.x, before.z - at.z);
      this.write(at.x, at.z, angle, stageWidth * taper, .58, ink, i * .61);
    }

    for (const enemy of game.enemies) {
      if (enemy.hp <= 0 || Math.hypot(enemy.x-head.x, enemy.z-head.z) > 21) continue;
      const width = enemy.radius * (enemy.boss ? 1 : .82);
      this.write(enemy.x, enemy.z, enemy.angle, width, width * 1.12, enemy.boss ? .29 : .20, enemy.id * .143);
    }
    for (const food of game.food) {
      if (this.mesh.count >= CAPACITY) break;
      const distance = Math.hypot(food.x-head.x, food.z-head.z);
      if (distance > 17) continue;
      const width = food.shed ? .29 : FOOD_WIDTH[food.rank];
      this.write(food.x, food.z, food.phase, width, width * 1.52, .16 * (1 - distance / 29), food.phase);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.paint.needsUpdate = true;
  }
}
