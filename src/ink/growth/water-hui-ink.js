import { Vector4 } from 'three';

export function paintWaterHui(material, eyes, lip) {
  material.uniforms.uHuiEyes = {
    value: [...eyes].sort((left, right) => left.modelPoint[0] - right.modelPoint[0])
      .map(({ modelPoint, radius }) => new Vector4(...modelPoint, radius)),
  };
  material.uniforms.uHuiLip = { value: lip.map(([z, y]) => new Vector4(z, y, 0, 0)) };
  material.fragmentShader = 'uniform vec4 uHuiLip[' + lip.length + '];\n'
    + 'uniform vec4 uHuiEyes[2];\nuniform vec3 uCenter;\nuniform float uObjectScale;\n'
    + material.fragmentShader.replace(
    'float reflectance=exp(-pigment*3.1);',
    `
    vec3 rest = vPaint / uObjectScale + uCenter;
    float back = smoothstep(.48, .94, formNormal.y);
    float flank = 1. - smoothstep(-.33, .39, formNormal.y);
    float belly = smoothstep(.07, .78, -formNormal.y);
    float bodyInk = mix(.14 + .07 * wash, .49 + .17 * wash, back);
    pigment = mix(pigment, bodyInk, .76) * (1. - flank * .36);
    paperReserve = max(paperReserve, flank * (.12 + .22 * belly));
    if (rest.z > uHuiLip[0].x) {
      float lipY = uHuiLip[0].y;
      for (int i = 1; i < ${lip.length}; i++) {
        vec2 a = uHuiLip[i - 1].xy;
        vec2 b = uHuiLip[i].xy;
        lipY += (b.y - a.y) * clamp((rest.z - a.x) / (b.x - a.x), 0., 1.);
      }
      float cheek = smoothstep(uHuiLip[0].x, uHuiLip[2].x, rest.z)
        * smoothstep(.18, .76, abs(formNormal.x));
      float jaw = cheek * (1. - smoothstep(.0008, .0048, rest.y - lipY));
      float seam = cheek * (1. - smoothstep(.00028, .00115, abs(rest.y - lipY)));
      pigment = mix(pigment, .07 + .05 * wash, jaw * .86);
      paperReserve = max(paperReserve, .36 * jaw);
      pigment = mix(pigment, .58, seam * .67);
      paperReserve *= 1. - .6 * seam;
    }
    if (rest.z > .39) {
      vec4 eye = rest.x < 0. ? uHuiEyes[0] : uHuiEyes[1];
      vec3 delta = (rest - eye.xyz) / eye.w;
      float edge = length(delta * vec3(.92, 1., .85));
      float iris = 1. - smoothstep(.72, 1.05, edge);
      float pupil = 1. - smoothstep(.30, .49, edge);
      float glint = 1. - smoothstep(.11, .27, length(delta - vec3(0., .32, .28)));
      pigment = mix(pigment, .25 + .82 * pupil, iris);
      paperReserve = mix(paperReserve, .10 * (1. - pupil) + .70 * glint, iris);
    }
    float reflectance=exp(-pigment*3.1);`,
  );
}
