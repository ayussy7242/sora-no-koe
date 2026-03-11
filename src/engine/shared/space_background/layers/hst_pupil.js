"use strict";

function buildHstPupilMask({
  size = 64,
  centralObscuration = 0.33,
  spiderWidth = 0.018,
  padRadius = 0.055,
  padOffset = 0.62,
} = {}) {
  const n = Math.max(8, size | 0);
  const mask = new Float32Array(n * n);
  const half = (n - 1) / 2;
  const padAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

  for (let iy = 0; iy < n; iy++) {
    const y = (iy - half) / half;
    for (let ix = 0; ix < n; ix++) {
      const x = (ix - half) / half;
      const r = Math.hypot(x, y);
      if (r > 1 || r < centralObscuration) continue;

      // primary aperture
      let v = 1;

      // support spiders (cross)
      if (Math.abs(x) < spiderWidth || Math.abs(y) < spiderWidth) {
        v = 0;
      }

      // pad obscurations
      for (let i = 0; i < padAngles.length; i++) {
        const a = padAngles[i];
        const px = Math.cos(a) * padOffset;
        const py = Math.sin(a) * padOffset;
        if (Math.hypot(x - px, y - py) < padRadius) {
          v = 0;
          break;
        }
      }

      mask[iy * n + ix] = v;
    }
  }
  return mask;
}

module.exports = {
  buildHstPupilMask,
};
