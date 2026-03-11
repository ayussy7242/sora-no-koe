"use strict";

const { clamp, hashString, mulberry32 } = require("../utils");
const { mixColor } = require("./star_temperature");
const { buildHstPupilMask } = require("./hst_pupil");
const { buildHstWavefront } = require("./hst_wavefront");

function fft1d(re, im, inverse = false) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        const nextIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
        wIm = nextIm;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fft2d(re, im, n, inverse = false) {
  const rowRe = new Float32Array(n);
  const rowIm = new Float32Array(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      rowRe[x] = re[y * n + x];
      rowIm[x] = im[y * n + x];
    }
    fft1d(rowRe, rowIm, inverse);
    for (let x = 0; x < n; x++) {
      re[y * n + x] = rowRe[x];
      im[y * n + x] = rowIm[x];
    }
  }
  const colRe = new Float32Array(n);
  const colIm = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      colRe[y] = re[y * n + x];
      colIm[y] = im[y * n + x];
    }
    fft1d(colRe, colIm, inverse);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = colRe[y];
      im[y * n + x] = colIm[y];
    }
  }
}

function fftShift(intensity, n) {
  const out = new Float32Array(n * n);
  const half = n >> 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const nx = (x + half) % n;
      const ny = (y + half) % n;
      out[ny * n + nx] = intensity[y * n + x];
    }
  }
  return out;
}

function downsample(input, n, out) {
  if (out >= n) return input;
  const outArr = new Float32Array(out * out);
  const step = n / out;
  for (let oy = 0; oy < out; oy++) {
    for (let ox = 0; ox < out; ox++) {
      const sx = Math.floor(ox * step);
      const sy = Math.floor(oy * step);
      const ex = Math.min(n, Math.floor((ox + 1) * step));
      const ey = Math.min(n, Math.floor((oy + 1) * step));
      let sum = 0;
      let count = 0;
      for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
          sum += input[y * n + x];
          count += 1;
        }
      }
      outArr[oy * out + ox] = count ? sum / count : 0;
    }
  }
  return outArr;
}

function renderStarPSF({
  x,
  y,
  radius = 2,
  brightness = 0.8,
  color = "#FFFFFF",
  haloColor = "#FFFFFF",
  outerHaloColor = "#FFFFFF",
  seed = 0,
  quality = "bright",
} = {}) {
  const grid = quality === "medium" ? 32 : 64;
  const pupil = buildHstPupilMask({ size: grid });
  const wave = buildHstWavefront({ size: grid, seed });

  const re = new Float32Array(grid * grid);
  const im = new Float32Array(grid * grid);
  for (let i = 0; i < pupil.length; i++) {
    if (pupil[i] <= 0) continue;
    const phase = wave[i];
    re[i] = Math.cos(phase);
    im[i] = Math.sin(phase);
  }

  fft2d(re, im, grid, false);

  const intensity = new Float32Array(grid * grid);
  let max = 1e-6;
  for (let i = 0; i < intensity.length; i++) {
    const v = re[i] * re[i] + im[i] * im[i];
    intensity[i] = v;
    if (v > max) max = v;
  }
  const gamma = quality === "medium" ? 0.9 : 0.82;
  for (let i = 0; i < intensity.length; i++) {
    intensity[i] = Math.pow(intensity[i] / max, gamma);
  }
  const shifted = fftShift(intensity, grid);
  const outSize = 17;
  const binned = downsample(shifted, grid, outSize);

  const psfSize = radius * (quality === "medium" ? 6.2 : 8.5);
  const pixel = psfSize / outSize;
  const startX = x - psfSize / 2;
  const startY = y - psfSize / 2;
  const rng = mulberry32(hashString(`${seed}-psf`));
  const offsetX = (rng() - 0.5) * pixel * 0.35;
  const offsetY = (rng() - 0.5) * pixel * 0.35;

  const coreColor = mixColor(color, "#FFFFFF", 0.45);
  const haloMix = mixColor(haloColor || color, "#FFFFFF", 0.25);
  const outerMix = mixColor(outerHaloColor || color, "#FFFFFF", 0.1);

  const pieces = [];
  for (let oy = 0; oy < outSize; oy++) {
    for (let ox = 0; ox < outSize; ox++) {
      const v = binned[oy * outSize + ox];
      if (v < 0.02) continue;
      const t = clamp(Math.pow((v - 0.02) / 0.98, 1.15), 0, 1);
      const fill = t > 0.6 ? coreColor : t > 0.25 ? haloMix : outerMix;
      const opacity = clamp(brightness * t * 1.02, 0.01, 0.98);
      pieces.push(
        `<rect x="${(startX + ox * pixel + offsetX).toFixed(2)}" y="${(startY + oy * pixel + offsetY).toFixed(2)}" width="${pixel.toFixed(2)}" height="${pixel.toFixed(2)}" fill="${fill}" opacity="${opacity.toFixed(3)}"/>`
      );
    }
  }
  return `<g>${pieces.join("")}</g>`;
}

module.exports = {
  renderStarPSF,
};
