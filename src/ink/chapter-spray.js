import { Camera, Color, MathUtils, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from 'three';

const washStart = 2.10;
const washEnd = 4.95;
const imprintIdLimit = 24;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0., 1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uAspect;
  uniform vec2 uHead;
  uniform sampler2D tChapterSurface;
  uniform vec2 uImprintHead;
  uniform vec2 uImprintIds[${imprintIdLimit}];
  uniform float uImprint, uAcrossCut;
  uniform vec3 uPaper, uMist, uInk;

  // The same soft value noise used for the ocean's pooled washes.
  float inkHash(vec2 p) {
    p = fract(p * vec2(.1031, .11369));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
  }
  float inkNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(inkHash(i), inkHash(i + vec2(1., 0.)), f.x),
      mix(inkHash(i + vec2(0., 1.)), inkHash(i + vec2(1., 1.)), f.x), f.y);
  }
  float washNoise(vec2 p) {
    return .58 * inkNoise(p) + .27 * inkNoise(p * 2.07 + 7.9) + .15 * inkNoise(p * 4.31 - 8.6);
  }

  vec2 dragonImprint(vec2 uv, float billow, float tooth) {
    if (uImprint <= .001 && uAcrossCut <= .001) return vec2(0.);
    vec2 delta = uv - uImprintHead;
    delta.x *= clamp(uAspect, .54, 1.8);
    // A longer, torn window preserves the same head and upper neck. It
    // still samples actual actor ownership, so reefs cannot punch holes.
    delta.x -= .19 * delta.y;
    float head = 1. - smoothstep(.46, 1., length((delta + vec2(-.034,.035)) / vec2(.30,.23)));
    if (head <= .001 && uAcrossCut < .001) return vec2(0.);
    vec4 surface = texture2D(tChapterSurface, uv);
    if (surface.a <= .5) return vec2(0.);
    vec2 id = floor(surface.rg * 255. + .5);
    for (int i = 0; i < ${imprintIdLimit}; i++) {
      if (all(equal(id, uImprintIds[i]))) {
        float passing = .71 + .29 * smoothstep(.30, .63, billow * .65 + tooth * .35);
        return vec2(head * uImprint * passing, uAcrossCut);
      }
    }
    return vec2(0.);
  }

  void main() {
    float x = vUv.x - .5;
    float flow = (uTime - 3.05) * .74;
    vec2 p = vec2(x * clamp(uAspect, .63, 1.8), vUv.y);
    float curl = .28 * x - .19 * x * x + .11 * sin(4.7 * x - flow * 1.6);
    vec2 current = vec2(p.x + .23 * flow, p.y + curl - flow);
    float billow = washNoise(current * vec2(3.3, 8.0) + vec2(1.6, 4.));
    float tooth = inkNoise(current * vec2(12., 72.) + vec2(4.3, 8.1));
    float brokenEdge = .16 * (billow - .5) + .033 * (tooth - .5);
    float arch = vUv.y + curl + brokenEdge;

    // The same slanted wet edge that arrives with the wave peels away in
    // the valley. Carry its dark belly past the lens instead of fading it.
    float swell = pow(smoothstep(2.70, 3.82, uTime), 3.05);
    float lip = mix(-.31, 1.29, swell);
    float depth = lip - arch;
    float incoming = smoothstep(-.04, .16, depth);
    float spray = smoothstep(2.10, 3.03, uTime)
      * (1. - smoothstep(.015, .24, vUv.y))
      * smoothstep(.15, .53, abs(x)) * smoothstep(.36, .76, billow) * .49;
    incoming = max(incoming, spray);

    float ebb = smoothstep(3.85, 4.68, uTime);
    float tail = mix(1.44, -.28, ebb);
    float outgoing = smoothstep(-.12, .095, tail - arch);
    // A torn diagonal edge follows the same headward direction as the wave.
    // It opens across the sheet so the dragon stays attached to the landscape.
    vec2 nearHead = vUv - uHead;
    float sweep = -nearHead.x + .35 * nearHead.y + brokenEdge * .72;
    float front = mix(.95, -.86, smoothstep(3.85, 4.41, uTime));
    float peel = smoothstep(-.09, .15, sweep - front);
    outgoing *= 1. - peel;
    float residual = (1. - smoothstep(.04, .24, vUv.y)) * smoothstep(.20, .54, abs(x))
      * smoothstep(4.31, 4.92, uTime) * (1. - smoothstep(5.12, 6.10, uTime))
      * (.20 + .20 * billow);
    // The crest still passes over the trailing body as the emerging
    // shoulder picks up the first dark stroke. Keep gaps in its wet edge.
    float trailingMist = smoothstep(3.89, 4.12, uTime) * (1.-smoothstep(4.34, 4.79, uTime));
    float shoulderFold = smoothstep(.12,.38,nearHead.x-.21*nearHead.y+.16*(billow-.5))
      * (1.-smoothstep(.04,.31,abs(nearHead.y + .095)));
    float alpha = incoming * max(max(outgoing, residual), .58 * trailingMist * shoulderFold);

    // Let a single shoulder of the breaking wave sweep over the eye.
    // The leading white edge and the heavy underside share one moving stroke.
    float pass = smoothstep(3.16, 4.28, uTime);
    float quill = arch + .34*x - .13*sin(2.9*x+pass*3.6);
    float spine = mix(-.22,1.46,pass);
    float rag = .072*(billow-.5) + .026*(tooth-.5);
    float distance = quill-spine+rag;
    float across = x - mix(-.46,.58,pass);
    float charge = (1.-smoothstep(.23,.72,abs(across))) * (.80+.20*billow);
    float belly = smoothstep(-.37,-.24,distance)*(1.-smoothstep(-.05,.028,distance))*charge;
    float foamLip = (1.-smoothstep(.019,.069+tooth*.021,abs(distance-.019)))
      * (.70+.30*smoothstep(.2,.65,billow));
    float rip = inkNoise(vec2(current.x*11.+current.y*5.,current.y*111.));
    float bristle = (1.-smoothstep(.003,.015,abs(distance+.097+.045*rip)))
      * smoothstep(.37,.78,billow*.48+tooth*.28+rip*.24) * charge;
    float film = .19 + .26*billow + .035*tooth + .025*rip;
    vec3 fog = mix(uPaper,uMist,film);
    fog = mix(fog,uInk,.85*belly);
    fog = mix(fog,uPaper,.83*foamLip+.61*bristle);
    vec2 protection=dragonImprint(vUv,billow,tooth);
    alpha *= 1. - protection.x;
    float broken=abs(vUv.y-uHead.y+.40*(vUv.x-uHead.x));
    alpha*=.55+.45*smoothstep(.025,.24,broken+brokenEdge);
    // The striking crest still crosses the head. Its wet tail rides below
    // the shoulder so the short plume forms against the same sea surface.
    float shoulders=smoothstep(3.79,4.11,uTime)*(1.-smoothstep(4.34,4.55,uTime));
    float shoulderBand=1.-smoothstep(.11,.44,abs(nearHead.y+.04+.33*nearHead.x));
    alpha*=1.-.43*shoulders*shoulderBand;

    // The same breaker crosses both maps behind the emerging outline.
    // It peels along the riverbed rather than re-obscuring the new wings.
    float join=smoothstep(3.57,3.83,uTime)*(1.-smoothstep(3.89,4.29,uTime));
    float frontShape=1.-smoothstep(-.32,.52,nearHead.x+.79*nearHead.y+.42*(billow-.5));
    float trace=join*mix(.43,1.,frontShape);
    if(uTime>=3.82&&uTime<3.90)trace=1.;
    vec3 sheet=mix(uPaper,uMist,.14+.30*billow+.025*tooth);
    sheet=mix(sheet,uInk,.23*belly);
    trace*=1.-protection.y*(.87+.10*smoothstep(.31,.65,billow));
    fog=mix(fog,sheet,trace);
    alpha=max(alpha,trace);
    if(alpha<.001)discard;
    gl_FragColor = vec4(fog, alpha);
    #include <colorspace_fragment>
  }
`;

/** Foreground wash drawn over the live scene during the sea-to-valley cut. */
export class ChapterSpray {
  constructor() {
    this.scene = new Scene();
    this.camera = new Camera();
    this.size = new Vector2();
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uHead: { value: new Vector2(.60, .43) },
        tChapterSurface: { value: null },
        uImprintHead: { value: new Vector2() },
        uImprintIds: { value: Array.from({length:imprintIdLimit}, () => new Vector2(-1,-1)) },
        uImprint: { value: 0 },
        uAcrossCut: { value: 0 },
        uPaper: { value: new Color('#f3f0e6') },
        uMist: { value: new Color('#a7b5b3') },
        uInk: { value: new Color('#314c50') },
      },
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  prepare(renderer) {
    return renderer.compileAsync(this.scene, this.camera);
  }

  render(renderer, elapsed, screenX = .60, screenY = .43, dragon, switched = false) {
    if (elapsed <= washStart || elapsed >= washEnd) return;
    const { x, y } = renderer.getDrawingBufferSize(this.size);
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uAspect.value = x / Math.max(1, y);
    this.material.uniforms.uHead.value.set(
      MathUtils.clamp(Number.isFinite(screenX) ? screenX : .60, .22, .78),
      MathUtils.clamp(Number.isFinite(screenY) ? screenY : .43, .24, .73),
    );
    this.updateImprint(elapsed,screenX,screenY,dragon,switched,x<y);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  updateImprint(age, screenX, screenY, dragon, switched, portrait) {
    const u = this.material.uniforms, {clamp,smootherstep} = MathUtils;
    const peak = portrait ? .46 : .49;
    const weight = !switched ? smootherstep(age,3.37,3.59)*(1-smootherstep(age,4.04,4.32)) : 0;
    const across = smootherstep(age,3.54,3.79)*(1-smootherstep(age,4.07,4.33));
    u.uImprint.value = 0;
    u.uAcrossCut.value = 0;
    const active = dragon?.active;
    if (!active || !dragon.palette || Math.max(weight,across) <= .001 || !Number.isFinite(screenX+screenY) ||
        screenX < -.12 || screenX > 1.12 || screenY < -.12 || screenY > 1.12) return;
    const entries = dragon.shapeChange ? [active,dragon.shapeChange.from] : [active];
    const ids = u.uImprintIds.value;
    for (const id of ids) id.set(-1,-1);
    let count = 0;
    for (const entry of entries) {
      if (!entry?.bridge.root.visible) continue;
      for (const surface of entry.bridge.entries) {
        if (count === imprintIdLimit) break;
        if (!surface.mesh.visible) continue;
        if (across <= .001 && (surface.variant !== 'cap' ||
            (surface.inkRole !== 'body' && surface.inkRole !== 'wing'))) continue;
        const id = dragon.palette.id(surface.mesh);
        ids[count++].set(id % 256,Math.floor(id / 256));
      }
    }
    if (!count) return;
    u.tChapterSurface.value = dragon.palette.target.texture;
    u.uImprintHead.value.set(clamp(screenX,0,1),clamp(screenY,0,1));
    u.uImprint.value = weight*peak;
    u.uAcrossCut.value = across;
  }
}
