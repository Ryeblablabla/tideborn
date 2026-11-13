export function supportInstancing(material) {
  material.vertexShader = material.vertexShader
    .replace('vNormal = normalize(normalMatrix * normal);', `vec3 surfaceNormal=normal;
#ifdef USE_INSTANCING
surfaceNormal=mat3(instanceMatrix)*normal;
#endif
vNormal = normalize(normalMatrix * surfaceNormal);`)
    .replace('gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', `vec4 surfacePosition=vec4(position,1.);
#ifdef USE_INSTANCING
surfacePosition=instanceMatrix*surfacePosition;
#endif
gl_Position=projectionMatrix*modelViewMatrix*surfacePosition;`);
  material.needsUpdate = true;
}
