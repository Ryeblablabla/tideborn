import * as THREE from 'three';

export async function loadSharedInkResources(){
  if(window.__TIDEBORN_SHARED_INK__)return await window.__TIDEBORN_SHARED_INK__;
  const loader=new THREE.TextureLoader();
  async function load(data,kind){
    if(!data)return null;
    const texture=await loader.loadAsync('data:image/png;base64,'+data);
    texture.colorSpace=THREE.NoColorSpace;texture.flipY=false;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;
    texture.userData.inkResourceKind=kind;texture.userData.license='CC0-1.0';texture.userData.source='David Revoy, Krita 2023-01 bundle';
    return texture;
  }
  const [brushAtlas,flowNoise]=await Promise.all([
    load(window.__INK_BRUSH_ATLAS__,'shared-generic-brush-mask'),load(window.__INK_FLOW_NOISE__,'shared-paper-and-generated-flow-noise'),
  ]);
  if(brushAtlas){brushAtlas.wrapS=brushAtlas.wrapT=THREE.ClampToEdgeWrapping;}
  if(flowNoise){flowNoise.wrapS=flowNoise.wrapT=THREE.RepeatWrapping;}
  return{brushAtlas,flowNoise,atlasGrid:new THREE.Vector2(4,2)};
}
