import { Group, Mesh } from 'three';

/** Compile the chapter's live ink passes before the cut. */
export async function prepareChapterInk(world, valley, incoming) {
  const { renderer, scene } = world;
  const { ink, palette } = world.inkDragon;
  const camera = world.inkCamera.flight;
  const { bridge } = incoming;
  const color = new Group();
  const normals = new Group();
  const surfaceIds = new Group();
  const strokes = new Group();
  const records = new Map(ink.records.map(record => [record.mesh, record]));
  const chapterRecords = [];

  const add = (group, source, material) => {
    // Use a separate object so prep can share the actual vertex streams and
    // shaders without changing any scene transforms, visibility or materials.
    group.add(new Mesh(source.geometry, material));
  };
  const stage = (root, growing) => root.traverse(object => {
    if (!object.isMesh) return;
    const record = records.get(object);
    const material = record?.material ?? object.material;
    const normalMaterial = material.allowOverride === false ? material : ink.normalMaterial;
    add(color, object, material);
    add(surfaceIds, object, palette.materialFor(object));
    add(normals, object, normalMaterial);
    if (growing) add(normals, object, ink.washNormals[1].material);
    if (record?.brush) {
      chapterRecords.push(record);
      add(strokes, record.brush.mesh, record.brush.material);
    }
  });
  stage(valley, false);
  stage(bridge.root, true);
  stage(world.chapterBreaker.root, false);
  stage(world.chapterFlightWake.mesh, false);
  stage(world.chapterWingGrowthInk.mesh, false);
  palette.isolateBrushes(chapterRecords);

  const compile = async (objects, target, destination = scene, passCamera = camera) => {
    const previous = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    try {
      // WebGL program keys include the current target's output color space.
      renderer.setRenderTarget(target);
      return renderer.compileAsync(objects, passCamera, destination);
    } finally {
      renderer.setRenderTarget(previous, cubeFace, mip);
    }
  };

  await Promise.all([
    compile(color, ink.target),
    compile(surfaceIds, palette.target),
    compile(normals, ink.normalTarget),
    compile(strokes, ink.strokeTarget, ink.strokeScene),
    bridge.flames?.prepare((objects,target) => compile(objects,target,objects)),
    compile(ink.postScene, null, ink.postScene, ink.postCamera),
  ]);
}
