"use strict";

const { clamp, hashString, mulberry32 } = require("../utils");

function buildHstWavefront({
  size = 64,
  seed = 0,
  defocus = 0.06,
  astigmatism = 0.05,
  coma = 0.04,
  spherical = 0.03,
} = {}) {
  const n = Math.max(8, size | 0);
  const phase = new Float32Array(n * n);
  const half = (n - 1) / 2;
  const rng = mulberry32(hashString(String(seed || 0)));

  const defocusK = defocus * (0.8 + rng() * 0.4);
  const astigK = astigmatism * (0.8 + rng() * 0.5);
  const comaK = coma * (0.8 + rng() * 0.5);
  const sphericalK = spherical * (0.8 + rng() * 0.5);
  const astigAngle = rng() * Math.PI * 2;
  const comaAngle = rng() * Math.PI * 2;

  for (let iy = 0; iy < n; iy++) {
    const y = (iy - half) / half;
    for (let ix = 0; ix < n; ix++) {
      const x = (ix - half) / half;
      const rho = Math.hypot(x, y);
      if (rho > 1) continue;
      const theta = Math.atan2(y, x);

      const zDefocus = 2 * rho * rho - 1;
      const zAstig = rho * rho * Math.cos(2 * (theta - astigAngle));
      const zComa = (3 * rho * rho * rho - 2 * rho) * Math.cos(theta - comaAngle);
      const zSpherical = 6 * Math.pow(rho, 4) - 6 * rho * rho + 1;

      const phaseVal =
        defocusK * zDefocus +
        astigK * zAstig +
        comaK * zComa +
        sphericalK * zSpherical;

      phase[iy * n + ix] = clamp(phaseVal, -0.6, 0.6);
    }
  }

  return phase;
}

module.exports = {
  buildHstWavefront,
};
