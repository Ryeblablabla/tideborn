import * as THREE from 'three';
import { dragonWashGLSL } from './dragon-shape-wash.js';

const idVertex = /* glsl */ `
  void main(){
    vec4 p=vec4(position,1.);
    #ifdef USE_INSTANCING
    p=instanceMatrix*p;
    #endif
    gl_Position=projectionMatrix*modelViewMatrix*p;
  }
`;
const idFragment = /* glsl */ `
  uniform vec4 uSurface;
  ${dragonWashGLSL}
  void main(){applyDragonWash();gl_FragColor=uSurface;}
`;

/** The same depth-tested geometry pass identifies brush owners and paper supports. */
export class MineralPalette {
  constructor(renderer, ink) {
    this.renderer = renderer;
    this.ink = ink;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.saved = [];
    this.surface = {value:new THREE.Vector4()};
    this.shapeWash = new THREE.Vector2();
    this.shapeWashAxis = new THREE.Vector3();
    this.colors = new Uint8Array(256 * 256 * 4);
    this.texture = new THREE.DataTexture(this.colors, 256, 256);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;

    this.material = this.idMaterial(false);
    this.wireMaterial = this.idMaterial(true);
    this.installPost();
  }

  idMaterial(wireframe) {
    const material = new THREE.ShaderMaterial({
      uniforms: {uSurface:this.surface,uDragonWash:{value:this.shapeWash},uDragonWashAxis:{value:this.shapeWashAxis}},
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
      wireframe, vertexShader:idVertex, fragmentShader:idFragment,
    });
    material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => {
      const id = this.id(object);
      const mineralHold=THREE.MathUtils.clamp(object.userData.inkMineralHold??0,0,1);
      const surfaceKind=object.userData.inkPaperSupport?1:.65*mineralHold;
      this.surface.value.set(id % 256 / 255, Math.floor(id / 256) / 255, surfaceKind, object.userData.inkDragonSubject ? .75 : 1);
      const wash=object.userData.dragonWash;
      if(wash){
        this.shapeWash.copy(wash);
        this.shapeWashAxis.copy(object.userData.dragonWashAxis);
      }else this.shapeWash.set(0,0);
      material.uniformsNeedUpdate = true;
    };
    return material;
  }

  installPost() {
    const post = this.ink.postMaterial;
    post.uniforms.tInkSurfaceId = {value:this.target.texture};
    post.uniforms.tMineralPalette = {value:this.texture};
    this.wetContact = {value:1};
    post.uniforms.uWetContact = this.wetContact;
    this.inkPressure = {value:.82};
    post.uniforms.uInkPressure = this.inkPressure;
    post.fragmentShader = 'uniform sampler2D tInkSurfaceId; uniform sampler2D tMineralPalette; uniform float uWetContact,uInkPressure;\n' + post.fragmentShader;
    post.fragmentShader = post.fragmentShader
      .replace('float radius = .75 + uWet * 3.7;', `
        float radius = .75 + uWet * 3.7;
        vec4 inkSupport = texture2D(tInkSurfaceId, paintUV);
        float covered = step(.25,inkSupport.a);
        float paperSupport = max(step(.9,inkSupport.b), 1.0 - covered);
        float contactStain = 0.0;
        float contactPool = 0.0;
      `)
      .replace('blurInk += composedInk(wetColor,wetStrokes)*allowed;', `
        float nearbyInk = composedInk(wetColor,wetStrokes);
        blurInk += nearbyInk*allowed;
        if (uWetContact>.01) {
          vec4 otherSupport = texture2D(tInkSurfaceId, paintUV + offset * pixel * radius);
          float crosses = step(.001, length(otherSupport.rg-inkSupport.rg));
          float otherPaper = max(step(.9,otherSupport.b), 1.0-step(.25,otherSupport.a));
          float nearEnough = step(wetDepth, depth + max(.06, depth * .018));
          contactStain += crosses * paperSupport * (1.0-otherPaper) * nearEnough
            * max(0.0, nearbyInk-ink-.065);
          contactPool += crosses * (1.0-paperSupport) * otherPaper;
        }
      `)
      .replace('ink = mix(ink, max(ink,blurInk), uWet*.12) + edgeInk + spread;', `
        float tooth = .52 + .48*smoothstep(.24,.74,fiber);
        float stain = contactStain*.125 * tooth * .44;
        float pool = contactPool*.125 * smoothstep(.16,.64,ink) * .090;
        ink = mix(ink, max(ink,blurInk), uWet*.12) + edgeInk + spread
          + (stain+pool) * uWetContact * uWet;
      `)
      .replace('vec3 color = mix(paper,uInkColor,ink);', `
        // Optical density builds where there is already a loaded brush
        // mass. Paper, thin water wash and cut bristle gaps stay light.
        float reserved = c.a>.00001 ? clamp(c.g/c.a,0.,1.) : 0.0;
        float loaded = smoothstep(.37,.85,ink);
        float mineralHold=(1.-step(.9,inkSupport.b))*clamp(inkSupport.b/.65,0.,1.);
        float pressure = uInkPressure * loaded * (1.0-.76*reserved) * (1.0-.90*paperSupport)
          * (1.-.88*mineralHold);
        float washInk = 1.0-pow(max(.0001,1.0-ink),1.0+pressure);
        // Keep intermediate mineral washes readable. Loaded dry creases can
        // still reach the same dark ink as the other surfaces.
        float knee=1.-.46*mineralHold*(1.-smoothstep(.80,.985,washInk));
        washInk=1.-pow(max(.0001,1.-washInk),knee);
        vec3 color = mix(paper,uInkColor,washInk);
        vec2 surfaceId = floor(inkSupport.rg*255.+.5);
        vec4 mineral = texture2D(tMineralPalette,(surfaceId+.5)/256.);
        float mixedInk = .33*smoothstep(.77,.99,washInk)*uInkPressure;
        vec3 pigment = mix(mineral.rgb,uInkColor,mixedInk);
        vec3 mineralWash = mix(paper,pigment,clamp(washInk*.94+.025,0.,1.));
        float pigmentAmount = mineral.a;
        if(mineralHold>.79){
          float glaze=smoothstep(.08,.92,c.b/max(c.a,.0001));
          pigmentAmount=mix(min(mineral.a,.12),mineral.a,glaze);
        }
        color = mix(color,mineralWash,pigmentAmount);
      `);
    post.needsUpdate = true;
  }

  id(mesh) { return mesh.id % 65535 + 1; }

  materialFor(object) {
    return object.userData.inkSurfaceMaterial ?? (object.material.wireframe ? this.wireMaterial : this.material);
  }

  isolateBrushes(records=this.ink.records) {
    for (const record of records) {
      if (!record.brush) continue;
      const material = record.brush.material;
      if (!material.uniforms.tInkSurfaceId) {
        material.uniforms.tInkSurfaceId = {value:this.target.texture};
        material.uniforms.uInkSurfaceId = {value:new THREE.Vector2()};
        material.fragmentShader = 'uniform sampler2D tInkSurfaceId; uniform vec2 uInkSurfaceId;\n' + material.fragmentShader;
        material.fragmentShader = material.fragmentShader.replace('void main(){', `
          void main(){
            vec2 surfaceId=texture2D(tInkSurfaceId,gl_FragCoord.xy/uViewport).rg;
            if(distance(surfaceId,uInkSurfaceId)>.001)discard;
        `);
        material.needsUpdate = true;
      }
      const id = this.id(record.mesh);
      material.uniforms.uInkSurfaceId.value.set(id % 256 / 255, Math.floor(id / 256) / 255);
    }
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.target.width !== size.x || this.target.height !== size.y) this.target.setSize(size.x, size.y);
    const old = renderer.getRenderTarget(), background = scene.background;
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    const tint = new THREE.Color();
    let paletteDirty = false;
    this.saved.length = 0;
    scene.traverseVisible(object => {
      if (!object.isMesh && !object.isLine) return;
      const source = object.material;
      const opacity = source.uniforms?.uOpacity?.value ?? source.opacity;
      if (object.userData.inkIdSuppressed || (source.transparent && opacity < .23)) {
        // A thin wash does not own the opaque surface below it.
        this.saved.push([object, source, object.layers.mask]);
        object.layers.disableAll();
        return;
      }
      this.saved.push([object, source, null]);
      let colorOwner = object;
      while (colorOwner && !colorOwner.userData.inkTint) colorOwner = colorOwner.parent;
      const id = this.id(object);
      const offset = id * 4;
      let r=this.colors[offset], g=this.colors[offset+1], b=this.colors[offset+2], opacityByte=0;
      if (colorOwner) {
        tint.set(colorOwner.userData.inkTint);
        r=Math.round(tint.r*255)&255;
        g=Math.round(tint.g*255)&255;
        b=Math.round(tint.b*255)&255;
        opacityByte=Math.round((colorOwner.userData.inkTintAmount??.6)*255)&255;
      }
      if (r!==this.colors[offset] || g!==this.colors[offset+1] || b!==this.colors[offset+2] ||
          opacityByte!==this.colors[offset+3]) {
        this.colors[offset] = r;
        this.colors[offset+1] = g;
        this.colors[offset+2] = b;
        this.colors[offset+3] = opacityByte;
        paletteDirty = true;
      }
      const surfaceMaterial = object.userData.inkSurfaceMaterial;
      if (surfaceMaterial) {
        surfaceMaterial.uniforms.uSurface.value.set(id % 256 / 255, Math.floor(id / 256) / 255, 0);
      }
      object.material = this.materialFor(object);
    });
    if (paletteDirty) this.texture.needsUpdate = true;
    try {
      scene.background = null;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0,0);
      renderer.render(scene, camera);
    } finally {
      for (const [object, material, layerMask] of this.saved) {
        object.material = material;
        if (layerMask !== null) object.layers.mask = layerMask;
      }
      scene.background = background;
      renderer.setRenderTarget(old);
      renderer.setClearColor(clear,alpha);
    }
    this.isolateBrushes();
  }
}
