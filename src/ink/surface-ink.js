import * as THREE from 'three';
import { GrowthInkRenderer } from './growth/growth-ink-renderer.js';
import { clawHoldSeconds } from './claw-surface.js';

/** Keep the material and surface brush attachments registered throughout growth. */
export class SurfaceInkBridge {
  constructor(ink, owner) {
    this.ink = ink;
    this.owner = owner;
    this.entries = [];
    this.p = new THREE.Vector3();
    this.n = new THREE.Vector3();
  }

  initialize() {
    for (const { mesh } of this.owner.meshes) {
      this.ink.register(mesh, {
        reserveDirection: new THREE.Vector3(0, -1, 0),
        reserveStrength: .58,
        flow: new THREE.Vector3(0, 0, 1),
        toneRange: [.10, .43],
        geometryInfluence: .55,
        coherentInk: .19,
        strokeProfile: { frequency: .72, lengthRange: [.028, .095], widthRange: [.16, .34] },
      });
      const record = this.ink.records.find(candidate => candidate.mesh === mesh);
      const material = record.material;
      material.uniforms.uCenter.value.set(0, 0, 0);
      material.uniforms.uObjectScale.value = 1;
      material.uniforms.uBaseWash = { value: .86 };
      material.vertexShader = 'attribute vec3 inkRestPosition;\nattribute vec3 inkRestNormal;\n' + material.vertexShader;
      material.vertexShader = material.vertexShader
        .replace('vPaint = (position - uCenter) * uObjectScale;', 'vPaint = (inkRestPosition - uCenter) * uObjectScale;')
        .replace('vFormNormal=normal;', 'vFormNormal=inkRestNormal;');
      material.fragmentShader = material.fragmentShader.replace(
        'pigment*=.94+.12*pooling;',
        `// Along-spine stroke fields provide loaded and broken passages
          // even where the original contour has gained length.
          float spread = movingInkFbm(p,paintNormal,vec3(0,0,1),
                                       vec3(30.,31.,3.2),vec3(4.2,6.1,7.7));
          float brokenWash = smoothstep(.38,.69,spread);
          float back = .30+.70*smoothstep(-.45,.45,formNormal.y);
          pigment *= (.72+.27*pooling)+brokenWash*.55;
          pigment += smoothstep(.49,.74,wash)*brokenWash*back*.20;
          float whiteBristles = smoothstep(.56,.70,fbm(p*vec3(180.,175.,12.)+vec3(7.,4.,2.)));
          pigment *= 1.-whiteBristles*smoothstep(.48,.78,spread)*.30;`,
      );
      if (this.owner.stage === 1) {
        // The lake form carries a denser ink backbone and a quiet, pale
        // flank. Use the sculpt normals so the wash follows a turning body.
        material.fragmentShader = material.fragmentShader.replace(
          'float reflectance=exp(-pigment*3.1);',
          `float flank=(1.-smoothstep(.28,.74,abs(formNormal.y)))
             * smoothstep(.025,.115,.5-p.z);
           float pale=flank*(.30+.21*brokenWash);
           pigment*=1.-pale;
           paperReserve=max(paperReserve,pale*.29);
           float reflectance=exp(-pigment*3.1);`,
        );
      }
      if (record.brush) {
        const brush = record.brush.material;
        brush.uniforms.uCenter.value.set(0, 0, 0);
        brush.uniforms.uObjectScale.value = 1;
        brush.uniforms.uStrokeStrength = { value: .66 };
      }
      // The existing bridge uses this kind to update the brush's paint anchors
      // from the mesh's inkRestPosition. Every anchor keeps its source face.
      const forearmWash = mesh.geometry.attributes.aForearmInk ? new THREE.Vector2() : null;
      if (forearmWash) {
        material.uniforms.uForearmWash = { value: forearmWash };
        material.vertexShader = 'attribute vec2 aForearmInk;varying vec2 vForearmInk;\n' +
          material.vertexShader.replace('void main() {', 'void main() {vForearmInk=aForearmInk;');
        material.fragmentShader = 'uniform vec2 uForearmWash;varying vec2 vForearmInk;\n' +
          material.fragmentShader.replace('float reflectance=exp(-pigment*3.1);', `
            float forearmWash=dot(vForearmInk,uForearmWash);
            pigment*=1.-.56*forearmWash;
            paperReserve=max(paperReserve,.17*forearmWash);
            float reflectance=exp(-pigment*3.1);`);
        material.needsUpdate = true;
      }
      const entry = { mesh, record, kind: 'loft', stableProjection: this.owner.stage === 3, forearmWash };
      GrowthInkRenderer.prototype.bindBrush.call(this, entry);
      if (entry.stableProjection && record.brush) {
        const brush = record.brush.material;
        // A mark fades as it leaves its tangent plane. The regular
        // projection volume should never leave a hard edge in the wash.
        brush.fragmentShader = brush.fragmentShader
          .replace('if(vDynamicVisible<.5)discard;', 'if(vDynamicVisible<.003)discard;')
          .replace('if(abs(dot(delta,vSurfaceNormal))>width*.85)discard;', `
            float gap=abs(dot(delta,vSurfaceNormal))/max(width,.0001);
            float attachment=(1.-smoothstep(.47,.85,gap))*vDynamicVisible;
            if(attachment<.001)discard;`)
          .replace('vec4(deposit*uInkStorageScale,lift*uInkStorageScale,0.0,1.0)',
            'vec4(deposit*uInkStorageScale*attachment,lift*uInkStorageScale*attachment,0.0,1.0)');
        brush.needsUpdate = true;
      }
      this.entries.push(entry);
    }
  }

  update() {
    const motion = this.owner.motion;
    const age = motion?.contactAge ?? -1;
    const smooth = THREE.MathUtils.smoothstep;
    const fadeStart = motion?.action?.hooked ? clawHoldSeconds + .03 : .17;
    const wash = motion?.attackKind === 'claw' && age >= 0
      ? (.68 + .32 * smooth(age, 0, .05)) * (1 - smooth(age, fadeStart, fadeStart + .10)) : 0;
    const right = (motion?.clawSide ?? this.owner.limbs?.leadSide) > 0;
    for (const entry of this.entries) {
      entry.forearmWash?.set(right ? 0 : wash, right ? wash : 0);
      GrowthInkRenderer.prototype.updateBrush.call(this, entry);
    }
  }
}
