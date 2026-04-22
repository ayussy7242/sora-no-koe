"use strict";

const { clamp } = require("../../../utils/data/math");
const { MODELS, DEFAULT_GEOMETRY_OPTIONS } = require("./constants");
const { KEYFRAMES, SYNODIC_MONTH } = require("./keyframes");
const { interpolateKeyframes, accelerateNearNewMoon } = require("./interpolate");

const AGE_SPECS = Object.freeze([
  { family: "new", strength: 0, side: "none" },               // 0
  { family: "waxing_shadow", strength: 0.95, side: "right" }, // 1
  { family: "waxing_shadow", strength: 0.76, side: "right" }, // 2
  { family: "waxing_shadow", strength: 0.64, side: "right" }, // 3
  { family: "waxing_shadow", strength: 0.46, side: "right" }, // 4
  { family: "waxing_shadow", strength: 0.36, side: "right" }, // 5
  { family: "waxing_shadow", strength: 0.14, side: "right" }, // 6
  { family: "waxing_shadow", strength: 0.07, side: "right" }, // 7
  { family: "quarter", strength: 1, side: "right" },          // 8
  { family: "gibbous", strength: 0.12, side: "right" },       // 9
  { family: "gibbous", strength: 0.40, side: "right" },       // 10
  { family: "gibbous", strength: 0.56, side: "right" },       // 11
  { family: "gibbous", strength: 0.70, side: "right" },       // 12
  { family: "gibbous", strength: 0.82, side: "right" },       // 13
  { family: "gibbous", strength: 0.92, side: "right" },       // 14
  { family: "full", strength: 1, side: "none" },              // 15
  { family: "gibbous", strength: 0.92, side: "left" },        // 16
  { family: "gibbous", strength: 0.82, side: "left" },        // 17
  { family: "gibbous", strength: 0.70, side: "left" },        // 18
  { family: "gibbous", strength: 0.56, side: "left" },        // 19
  { family: "gibbous", strength: 0.40, side: "left" },        // 20
  { family: "gibbous", strength: 0.12, side: "left" },        // 21
  { family: "quarter", strength: 1, side: "left" },           // 22
  { family: "waning_shadow", strength: 0.07, side: "left" },  // 23
  { family: "waning_shadow", strength: 0.14, side: "left" },  // 24
  { family: "waning_shadow", strength: 0.36, side: "left" },  // 25
  { family: "waning_shadow", strength: 0.46, side: "left" },  // 26
  { family: "waning_shadow", strength: 0.80, side: "left" },  // 27
  { family: "waning_shadow", strength: 0.82, side: "left" },  // 28
  { family: "waning_shadow", strength: 0.95, side: "left" },  // 29
]);

function resolveAgeStrengthInterpolated(ageDays) {
  const clamped = clamp(Number.isFinite(Number(ageDays)) ? Number(ageDays) : 0, 0, 29);
  const ageFloor = Math.floor(clamped);
  const ageCeil = Math.min(ageFloor + 1, 29);
  const t = clamp(clamped - ageFloor, 0, 1);

  const specA = AGE_SPECS[ageFloor] || AGE_SPECS[0];
  const specB = AGE_SPECS[ageCeil] || specA;
  const strengthA = clamp(Number(specA?.strength ?? 0), 0, 1);
  const strengthB = clamp(Number(specB?.strength ?? 0), 0, 1);
  const familyA = specA?.family || "new";
  const familyB = specB?.family || familyA;
  const sideA = specA?.side || "none";
  const sideB = specB?.side || "none";

  const isShadowFamily = (family) =>
    family === "waxing_shadow" || family === "waning_shadow";

  if (familyA === "new" && isShadowFamily(familyB)) {
    const acceleratedT = accelerateNearNewMoon(t);
    return {
      ageFloor,
      ageCeil,
      t,
      strength: strengthB * acceleratedT,
      strengthA,
      strengthB,
      family: acceleratedT <= 0 ? familyA : familyB,
      side: acceleratedT <= 0 ? sideA : sideB,
    };
  }
  if (isShadowFamily(familyA) && familyB === "new") {
    const acceleratedT = accelerateNearNewMoon(1 - t);
    return {
      ageFloor,
      ageCeil,
      t,
      strength: strengthA * acceleratedT,
      strengthA,
      strengthB,
      family: acceleratedT <= 0 ? familyB : familyA,
      side: acceleratedT <= 0 ? sideB : sideA,
    };
  }

  // Special-case quarter <-> shadow transitions so strength maps to "shadow depth"
  // rather than averaging across different family meanings.
  if (familyA === "quarter" && isShadowFamily(familyB)) {
    return {
      ageFloor,
      ageCeil,
      t,
      strength: strengthB * t,
      strengthA,
      strengthB,
      family: t === 0 ? "quarter" : familyB,
      side: t === 0 ? sideA : sideB,
    };
  }
  if (isShadowFamily(familyA) && familyB === "quarter") {
    const strength = strengthA * (1 - t);
    return {
      ageFloor,
      ageCeil,
      t,
      strength,
      strengthA,
      strengthB,
      family: t === 1 ? "quarter" : familyA,
      side: t === 1 ? sideB : sideA,
    };
  }

  const strength = strengthA + (strengthB - strengthA) * t;

  return {
    ageFloor,
    ageCeil,
    t,
    strength,
    strengthA,
    strengthB,
    family: familyA === familyB ? familyA : (t < 0.5 ? familyA : familyB),
    side: sideA === sideB ? sideA : (t < 0.5 ? sideA : sideB),
  };
}

function resolveIllumFromFamily(family, strength) {
  const t = clamp(Number(strength || 0), 0, 1);
  switch (family) {
    case "new":
      return 0.0;
    case "full":
      return 1.0;
    case "quarter":
      return 0.5;
    case "crescent":
      return 0.02 + t * 0.45;
    case "gibbous":
      return 0.55 + t * 0.45;
    case "waxing_shadow":
      return clamp(0.5 * Math.pow(1 - t, 1.8), 0.022, 0.5);
    case "waning_shadow":
      return clamp(0.5 * Math.pow(1 - t, 1.8), 0.022, 0.5);
    default:
      return 0.0;
  }
}

function buildMoonPathFromSpec({ r, family, strength, side }) {
  if (family === "new") return { path: "", meta: { family } };
  if (family === "full") {
    return {
      path: [
        `M ${r - r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r + r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r - r} ${r}`,
        `Z`,
      ].join(" "),
      meta: { family },
    };
  }
  if (family === "quarter") {
    const sweepOuter = side === "right" ? 1 : 0;
    return {
      path: [
        `M ${r} 0`,
        `A ${r} ${r} 0 0 ${sweepOuter} ${r} ${2 * r}`,
        `L ${r} 0`,
        `Z`,
      ].join(" "),
      meta: { family },
    };
  }

  if (family === "gibbous") {
    const t = clamp(Number(strength || 0), 0, 1);
    const rx = r * (0.25 + 0.75 * t);
    const ry = r;
    const sign = side === "right" ? -1 : 1;
    const k = 0.5522847498;
    const cx = r;
    const cy = r;
    const edgeX = cx + sign * rx;
    const ctrlX = cx + sign * rx * k;
    const topY = cy - ry;
    const bottomY = cy + ry;
    const sweepOuter = side === "right" ? 1 : 0;
    return {
      path: [
        `M ${cx.toFixed(2)} ${topY.toFixed(2)}`,
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweepOuter} ${cx.toFixed(2)} ${bottomY.toFixed(2)}`,
        `C ${ctrlX.toFixed(2)} ${bottomY.toFixed(2)} ${edgeX.toFixed(2)} ${(cy + ry * k).toFixed(2)} ${edgeX.toFixed(2)} ${cy.toFixed(2)}`,
        `C ${edgeX.toFixed(2)} ${(cy - ry * k).toFixed(2)} ${ctrlX.toFixed(2)} ${topY.toFixed(2)} ${cx.toFixed(2)} ${topY.toFixed(2)}`,
        `Z`,
      ].join(" "),
      meta: { family },
    };
  }

  if (family === "waning_shadow") {
    const t = clamp(Number(strength || 0), 0, 1);
    const rx = r * (0.05 + 0.95 * t);
    const ry = r;
    const sign = side === "right" ? 1 : -1;
    const k = 0.5522847498;
    const cx = r;
    const cy = r;
    const edgeX = cx + sign * rx;
    const ctrlX = cx + sign * rx * k;
    const topY = cy - ry;
    const bottomY = cy + ry;
    const sweepOuter = side === "right" ? 1 : 0;
    return {
      path: [
        `M ${cx.toFixed(2)} ${topY.toFixed(2)}`,
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweepOuter} ${cx.toFixed(2)} ${bottomY.toFixed(2)}`,
        `C ${ctrlX.toFixed(2)} ${bottomY.toFixed(2)} ${edgeX.toFixed(2)} ${(cy + ry * k).toFixed(2)} ${edgeX.toFixed(2)} ${cy.toFixed(2)}`,
        `C ${edgeX.toFixed(2)} ${(cy - ry * k).toFixed(2)} ${ctrlX.toFixed(2)} ${topY.toFixed(2)} ${cx.toFixed(2)} ${topY.toFixed(2)}`,
        `Z`,
      ].join(" "),
      meta: { family },
    };
  }

  if (family === "waxing_shadow") {
    const t = clamp(Number(strength || 0), 0, 1);
    const rx = r * (0.05 + 0.95 * t);
    const ry = r;
    const sign = side === "right" ? 1 : -1;
    const k = 0.5522847498;
    const cx = r;
    const cy = r;
    const edgeX = cx + sign * rx;
    const ctrlX = cx + sign * rx * k;
    const topY = cy - ry;
    const bottomY = cy + ry;
    const sweepOuter = side === "right" ? 1 : 0;
    return {
      path: [
        `M ${cx.toFixed(2)} ${topY.toFixed(2)}`,
        `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweepOuter} ${cx.toFixed(2)} ${bottomY.toFixed(2)}`,
        `C ${ctrlX.toFixed(2)} ${bottomY.toFixed(2)} ${edgeX.toFixed(2)} ${(cy + ry * k).toFixed(2)} ${edgeX.toFixed(2)} ${cy.toFixed(2)}`,
        `C ${edgeX.toFixed(2)} ${(cy - ry * k).toFixed(2)} ${ctrlX.toFixed(2)} ${topY.toFixed(2)} ${cx.toFixed(2)} ${topY.toFixed(2)}`,
        `Z`,
      ].join(" "),
      meta: { family },
    };
  }



  if (family === "crescent") {
    const t = clamp(Number(strength || 0), 0, 1);
    const illum = resolveIllumFromFamily("crescent", t);
    const shadowRadius = r;
    const dx = offsetForIllumination(illum, r, shadowRadius);
    const shift = (side === "right" ? -1 : 1) * dx;
    return buildLitPathFromCircles({
      r,
      illum,
      waxing: side === "right",
      shift,
      shadowRadius,
      halfEps: DEFAULT_GEOMETRY_OPTIONS.halfEps,
      fullEps: DEFAULT_GEOMETRY_OPTIONS.fullEps,
      newEps: DEFAULT_GEOMETRY_OPTIONS.newEps,
    });
  }

  const sideSign = side === "right" ? -1 : 1;
  const wantRight = side === "right";
  const t = clamp(Number(strength || 0), 0, 1);
  const r1 = r;
  const r2 = family === "gibbous" ? r * 1.35 : r;
  const sepRaw = family === "gibbous"
    ? r * (0.9 + 1.0 * t)
    : r * (0.05 + 1.9 * t);
  const minSep = Math.abs(r1 - r2) + 1e-3;
  const maxSep = r1 + r2 - 1e-3;
  const sep = clamp(sepRaw, minSep, maxSep);
  const shift = sideSign * sep;

  const a = (r1 * r1 - r2 * r2 + sep * sep) / (2 * sep);
  const h2 = r1 * r1 - a * a;
  if (h2 <= 0 || !Number.isFinite(h2)) {
    return { path: "", meta: { family, degenerate: true } };
  }
  const h = Math.sqrt(h2);
  const sign = shift >= 0 ? 1 : -1;
  const x0 = r + sign * a;
  const yTop = r - h;
  const yBottom = r + h;

  const TAU = Math.PI * 2;
  const normalizeAngle = (angle) => {
    let a = angle % TAU;
    if (a < 0) a += TAU;
    return a;
  };
  const arcDelta = (start, end, sweep, largeArc) => {
    let delta = end - start;
    if (sweep === 1 && delta < 0) delta += TAU;
    if (sweep === 0 && delta > 0) delta -= TAU;
    if (largeArc === 0 && Math.abs(delta) > Math.PI) delta -= Math.sign(delta) * TAU;
    if (largeArc === 1 && Math.abs(delta) < Math.PI) delta += Math.sign(delta) * TAU;
    return delta;
  };
  const angleAt = (px, py, cx, cy, rad) =>
    normalizeAngle(Math.atan2(py - cy, px - cx));

  const outerStart = angleAt(x0, yTop, r, r, r);
  const outerEnd = angleAt(x0, yBottom, r, r, r);
  const shadowCx = r + shift;
  const shadowCy = r;
  const innerStart = angleAt(x0, yBottom, shadowCx, shadowCy, r2);
  const innerEnd = angleAt(x0, yTop, shadowCx, shadowCy, r2);

  const sampleArc = (start, end, sweep, largeArc, cx, cy, rad, outerCx, outerCy, shadowCx, shadowCy, shadowR) => {
    const delta = arcDelta(start, end, sweep, largeArc);
    const midAngle = start + delta * 0.5;
    const mid = { x: cx + rad * Math.cos(midAngle), y: cy + rad * Math.sin(midAngle) };
    let maxDist = 0;
    const samples = 7;
    let rightHits = 0;
    let outsideShadowHits = 0;
    for (let i = 0; i < samples; i++) {
      const t = samples === 1 ? 0.5 : i / (samples - 1);
      const angle = start + delta * t;
      const px = cx + rad * Math.cos(angle);
      const py = cy + rad * Math.sin(angle);
      const dist = Math.hypot(px - outerCx, py - outerCy);
      if (dist > maxDist) maxDist = dist;
      if (px >= outerCx) rightHits += 1;
      if (shadowR && Math.hypot(px - shadowCx, py - shadowCy) >= shadowR - 1e-4) {
        outsideShadowHits += 1;
      }
    }
    const rightRatio = rightHits / samples;
    const outsideShadowRatio = shadowR ? outsideShadowHits / samples : 0;
    return { sweep, largeArc, mid, delta, maxDist, rightRatio, outsideShadowRatio };
  };

  const arcPoints = (start, end, cand, cx, cy, rad, count = 16) => {
    const delta = arcDelta(start, end, cand.sweep, cand.largeArc);
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const angle = start + delta * t;
      pts.push({ x: cx + rad * Math.cos(angle), y: cy + rad * Math.sin(angle) });
    }
    return pts;
  };

  const polygonArea = (pts) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      area += p.x * q.y - q.x * p.y;
    }
    return area / 2;
  };

  const outerCandidates = [];
  const innerCandidates = [];
  for (const sweep of [0, 1]) {
    for (const largeArc of [0, 1]) {
      outerCandidates.push(
        sampleArc(outerStart, outerEnd, sweep, largeArc, r, r, r, r, r, shadowCx, shadowCy, r2)
      );
      innerCandidates.push(
        sampleArc(innerStart, innerEnd, sweep, largeArc, shadowCx, shadowCy, r2, r, r, 0, 0, 0)
      );
    }
  }

  const preferLarge = family === "gibbous";
  const outerPick = outerCandidates.reduce((best, cand) => {
    const candSide = wantRight ? cand.rightRatio : 1 - cand.rightRatio;
    const bestSide = wantRight ? best.rightRatio : 1 - best.rightRatio;
    const candOutside = cand.outsideShadowRatio;
    const bestOutside = best.outsideShadowRatio;
    if (candSide > bestSide + 1e-6) return cand;
    if (bestSide > candSide + 1e-6) return best;
    if (candOutside > bestOutside + 1e-6) return cand;
    if (bestOutside > candOutside + 1e-6) return best;
    const bestSize = Math.abs(best.delta);
    const candSize = Math.abs(cand.delta);
    if (preferLarge) return candSize > bestSize ? cand : best;
    return candSize < bestSize ? cand : best;
  });

  const innerInside = innerCandidates.filter((cand) => cand.maxDist <= r + 1e-4);
  const wantInnerRight = family === "gibbous" ? !wantRight : wantRight;
  const innerPool = innerInside.length ? innerInside : innerCandidates;
  const innerPick = innerPool.reduce((best, cand) => {
    const candScore = wantInnerRight ? cand.rightRatio : 1 - cand.rightRatio;
    const bestScore = wantInnerRight ? best.rightRatio : 1 - best.rightRatio;
    if (candScore > bestScore + 1e-6) return cand;
    if (bestScore > candScore + 1e-6) return best;
    if (cand.maxDist < best.maxDist - 1e-6) return cand;
    if (best.maxDist < cand.maxDist - 1e-6) return best;
    const bestSize = Math.abs(best.delta);
    const candSize = Math.abs(cand.delta);
    if (family === "gibbous") return candSize > bestSize ? cand : best;
    return candSize < bestSize ? cand : best;
  });

  // Crescent should never choose the long way around (prevents "full moon" look)
  let outerFinal = outerPick;
  let innerFinal = innerPick;
  if (family === "crescent") {
    const outerPool = outerCandidates.filter((cand) => (wantRight ? cand.rightRatio : 1 - cand.rightRatio) > 0.5);
    const innerPoolC = innerInside.length ? innerInside : innerCandidates;
    let bestCombo = null;
    for (const o of (outerPool.length ? outerPool : outerCandidates)) {
      for (const i of innerPoolC) {
        const oPts = arcPoints(outerStart, outerEnd, o, r, r, r, 18);
        const iPts = arcPoints(innerStart, innerEnd, i, shadowCx, shadowCy, r2, 18);
        const poly = oPts.concat(iPts);
        const area = Math.abs(polygonArea(poly));
        if (!bestCombo || area < bestCombo.area) {
          bestCombo = { area, o, i };
        }
      }
    }
    if (bestCombo) {
      outerFinal = bestCombo.o;
      innerFinal = bestCombo.i;
    }
  }

  return {
    path: [
      `M ${x0.toFixed(2)} ${yTop.toFixed(2)}`,
      `A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${outerFinal.largeArc} ${outerFinal.sweep} ${x0.toFixed(2)} ${yBottom.toFixed(2)}`,
      `A ${r2.toFixed(2)} ${r2.toFixed(2)} 0 ${innerFinal.largeArc} ${innerFinal.sweep} ${x0.toFixed(2)} ${yTop.toFixed(2)}`,
      `Z`,
    ].join(" "),
    meta: { family },
  };
}

function overlapArea(dist, r1, r2) {
  const d = Math.max(0, dist);
  const rr1 = Math.max(0, r1);
  const rr2 = Math.max(0, r2);
  if (d >= rr1 + rr2) return 0;
  if (d <= Math.abs(rr1 - rr2)) {
    const minR = Math.min(rr1, rr2);
    return Math.PI * minR * minR;
  }
  const r1Sq = rr1 * rr1;
  const r2Sq = rr2 * rr2;
  const alpha = Math.acos((d * d + r1Sq - r2Sq) / (2 * d * rr1));
  const beta = Math.acos((d * d + r2Sq - r1Sq) / (2 * d * rr2));
  const area1 = r1Sq * alpha;
  const area2 = r2Sq * beta;
  const area3 = 0.5 * Math.sqrt(
    Math.max(0, (-d + rr1 + rr2) * (d + rr1 - rr2) * (d - rr1 + rr2) * (d + rr1 + rr2))
  );
  return area1 + area2 - area3;
}

function offsetForIllumination(target, r, shadowRadius) {
  const circleArea = Math.PI * r * r;
  const t = clamp(Number(target), 0, 1);
  let lo = 0;
  let hi = r + shadowRadius;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const bright = 1 - overlapArea(mid, r, shadowRadius) / circleArea;
    if (bright < t) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function resolveShadowRadius({ r, illum, model, halfRange, maxBoost }) {
  if (model !== MODELS.VARIABLE_SHADOW_RADIUS) return r;
  const halfDelta = Math.abs(illum - 0.5);
  const t = clamp(halfDelta / halfRange, 0, 1);
  const s = t * t * (3 - 2 * t);
  const radiusFactor = 1 + maxBoost * (1 - s);
  return r * radiusFactor;
}

function buildLitPathFromCircles({
  r,
  illum,
  waxing,
  shift,
  shadowRadius,
  halfEps,
  fullEps,
  newEps,
}) {
  const isFull = illum >= 1 - fullEps;
  const isNew = illum <= newEps;
  const isHalf = Math.abs(illum - 0.5) <= halfEps;
  const isThin = illum < 0.5;

  if (isFull) {
    return {
      path: [
        `M ${r - r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r + r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r - r} ${r}`,
        `Z`,
      ].join(" "),
      meta: { isFull, isNew, isHalf, isThin },
    };
  }

  if (isNew) {
    return { path: "", meta: { isFull, isNew, isHalf, isThin } };
  }

  if (isHalf) {
    const sweepOuter = waxing ? 1 : 0;
    return {
      path: [
        `M ${r} 0`,
        `A ${r} ${r} 0 0 ${sweepOuter} ${r} ${2 * r}`,
        `L ${r} 0`,
        `Z`,
      ].join(" "),
      meta: { isFull, isNew, isHalf, isThin },
    };
  }

  const d = Math.abs(shift);
  const r1 = r;
  const r2 = shadowRadius;
  const a = d > 0 ? (r1 * r1 - r2 * r2 + d * d) / (2 * d) : 0;
  const h2 = r1 * r1 - a * a;
  if (h2 <= 0 || !Number.isFinite(h2)) {
    return {
      path: illum > 0.5
        ? [
          `M ${r - r} ${r}`,
          `A ${r} ${r} 0 1 1 ${r + r} ${r}`,
          `A ${r} ${r} 0 1 1 ${r - r} ${r}`,
          `Z`,
        ].join(" ")
        : "",
      meta: { isFull, isNew, isHalf, isThin, degenerate: true },
    };
  }

  const h = Math.sqrt(h2);
  const sign = shift >= 0 ? 1 : -1;
  const x0 = r + sign * a;
  const yTop = r - h;
  const yBottom = r + h;
  const outerSweep = waxing ? 1 : 0;
  const termSweep = waxing ? 0 : 1;
  const outerLarge = isThin ? 0 : 1;
  const termLarge = isThin ? 1 : 0;

  return {
    path: [
      `M ${x0.toFixed(2)} ${yTop.toFixed(2)}`,
      `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${outerLarge} ${outerSweep} ${x0.toFixed(2)} ${yBottom.toFixed(2)}`,
      `A ${r2.toFixed(2)} ${r2.toFixed(2)} 0 ${termLarge} ${termSweep} ${x0.toFixed(2)} ${yTop.toFixed(2)}`,
      `Z`,
    ].join(" "),
    meta: {
      isFull,
      isNew,
      isHalf,
      isThin,
      x0,
      yTop,
      yBottom,
      outerSweep,
      termSweep,
      outerLarge,
      termLarge,
    },
  };
}

function buildLitPathCustomTerminator({
  r,
  illum,
  waxing,
  bendMax,
  bendEasePower,
  c1,
  c2,
  halfEps,
  fullEps,
  newEps,
}) {
  const isFull = illum >= 1 - fullEps;
  const isNew = illum <= newEps;
  const isHalf = Math.abs(illum - 0.5) <= halfEps;
  const isThin = illum < 0.5 || isHalf;

  if (isFull) {
    return {
      path: [
        `M ${r - r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r + r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r - r} ${r}`,
        `Z`,
      ].join(" "),
      meta: { isFull, isNew, isThin },
    };
  }

  if (isNew) {
    return { path: "", meta: { isFull, isNew, isThin } };
  }

  const phase = clamp(Math.abs(2 * illum - 1), 0, 1);
  const easeBase = phase * phase * (3 - 2 * phase);
  const ease = Math.pow(easeBase, bendEasePower);
  const bend = r * bendMax * ease;
  const bendSigned = bend * (waxing ? 1 : -1);

  const outerSweep = waxing ? 1 : 0;
  const termSweep = waxing ? 0 : 1;
  const outerLarge = isThin ? 0 : 1;
  const termLarge = isThin ? 1 : 0;

  const xCtrl = (r + bendSigned).toFixed(2);
  const yCtrl1 = (r * c1).toFixed(2);
  const yCtrl2 = (r * c2).toFixed(2);

  return {
    path: [
      `M ${r} 0`,
      `A ${r} ${r} 0 ${outerLarge} ${outerSweep} ${r} ${2 * r}`,
      `C ${xCtrl} ${yCtrl2} ${xCtrl} ${yCtrl1} ${r} 0`,
      `Z`,
    ].join(" "),
    meta: {
      isFull,
      isNew,
      isHalf,
      isThin,
      bend,
      bendSigned,
      outerSweep,
      termSweep,
      outerLarge,
      termLarge,
      c1,
      c2,
    },
  };
}

function resolveAgeInputs({ moonAgeDays, moonAgeNormalized, illumination, waxing }) {
  const hasNumber = (value) =>
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

  if (hasNumber(moonAgeDays)) {
    const days = Math.max(0, Number(moonAgeDays));
    return {
      ageDays: days,
      ageNorm: clamp(days / SYNODIC_MONTH, 0, 1),
      source: "days",
    };
  }
  if (hasNumber(moonAgeNormalized)) {
    const norm = clamp(Number(moonAgeNormalized), 0, 1);
    return {
      ageDays: norm * SYNODIC_MONTH,
      ageNorm: norm,
      source: "normalized",
    };
  }
  const illum = clamp(Number(illumination), 0, 1);
  const norm = waxing ? illum * 0.5 : 0.5 + (1 - illum) * 0.5;
  return {
    ageDays: norm * SYNODIC_MONTH,
    ageNorm: clamp(norm, 0, 1),
    source: "illumination",
  };
}

function buildLitPathKeyframed({
  r,
  ageDays,
  ageNorm,
  fullEps,
  newEps,
  debugArc,
}) {
  const keyframeEps = 1e-6;
  const exactKeyframe = KEYFRAMES.find((frame) => Math.abs(frame.age - ageDays) <= keyframeEps);
  const exactKind = exactKeyframe?.kind || null;
  const isFull = Math.abs(ageNorm - 0.5) <= fullEps;
  const isNew = exactKind === "new" || ageNorm <= newEps || ageNorm >= 1 - newEps;

  if (isFull) {
    return {
      path: [
        `M ${r - r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r + r} ${r}`,
        `A ${r} ${r} 0 1 1 ${r - r} ${r}`,
        `Z`,
      ].join(" "),
      meta: { isFull, isNew, kind: "full", exactKind },
    };
  }

  if (isNew) {
    return { path: "", meta: { isFull, isNew, kind: "new", exactKind } };
  }

  const params = interpolateKeyframes(KEYFRAMES, ageDays);
  const offsetX = clamp(Math.max(0, Number(params.offsetX || 0)), 0, 0.999);
  const curvature = Math.max(0.1, Number(params.radiusX || 1));

  const phaseWaxing = ageNorm <= 0.5;
  const phaseIllum = ageNorm <= 0.5 ? ageNorm * 2 : (1 - ageNorm) * 2;
  const isThin = phaseIllum < 0.5;

  const litSide = phaseWaxing ? 1 : -1;
  const shadowSide = -litSide;
  const terminatorSide = phaseIllum < 0.5 ? litSide : -litSide;
  const minFactor = 0.6;
  const maxFactor = 6.0;
  const base = minFactor + (maxFactor - minFactor) * (1 - offsetX);
  const terminatorRadius = r * base * curvature;
  let rx = terminatorRadius;
  let ry = terminatorRadius;
  const x0 = r + terminatorSide * r * offsetX;
  const xMid = x0;
  const dxCircle = x0 - r;
  const y2 = r * r - dxCircle * dxCircle;
  if (y2 <= 0 || !Number.isFinite(y2)) {
    return {
      path: phaseIllum > 0.5
        ? [
          `M ${r - r} ${r}`,
          `A ${r} ${r} 0 1 1 ${r + r} ${r}`,
          `A ${r} ${r} 0 1 1 ${r - r} ${r}`,
          `Z`,
        ].join(" ")
        : "",
      meta: { isFull, isNew, phaseIllum, degenerate: true },
    };
  }

  const y = Math.sqrt(y2);
  const yTop = r - y;
  const yBottom = r + y;

  const minRadius = y + 1e-6;
  const radius = Math.max(terminatorRadius, minRadius);
  rx = radius;
  ry = radius;
  const deltaX = Math.sqrt(Math.max(0, radius * radius - y * y));
  const cx = x0 + shadowSide * deltaX;
  const cy = r;
  const TAU = Math.PI * 2;
  const normalizeAngle = (angle) => {
    let a = angle % TAU;
    if (a < 0) a += TAU;
    return a;
  };
  const arcDelta = (start, end, sweep, largeArc) => {
    let delta = end - start;
    if (sweep === 1 && delta < 0) delta += TAU;
    if (sweep === 0 && delta > 0) delta -= TAU;
    if (largeArc === 0 && Math.abs(delta) > Math.PI) delta -= Math.sign(delta) * TAU;
    if (largeArc === 1 && Math.abs(delta) < Math.PI) delta += Math.sign(delta) * TAU;
    return delta;
  };

  const ellipseAngle = (px, py) =>
    normalizeAngle(Math.atan2((py - cy) / ry, (px - cx) / rx));
  const circleAngle = (px, py) =>
    normalizeAngle(Math.atan2(py - r, px - r));

  const sideIsRight = (pt) => pt.x >= r;
  const wantRight = phaseWaxing;
  const wantTermRight = terminatorSide === 1;

  const startEllipse = ellipseAngle(x0, yBottom);
  const endEllipse = ellipseAngle(x0, yTop);
  const startCircle = circleAngle(x0, yTop);
  const endCircle = circleAngle(x0, yBottom);

  const sampleEllipse = (sweep, largeArc) => {
    const delta = arcDelta(startEllipse, endEllipse, sweep, largeArc);
    const midAngle = startEllipse + delta * 0.5;
    const mid = {
      x: cx + rx * Math.cos(midAngle),
      y: cy + ry * Math.sin(midAngle),
    };
    const dist = Math.hypot(mid.x - r, mid.y - r);
    return { sweep, largeArc, delta, midAngle, mid, dist };
  };

  const sampleCircle = (sweep, largeArc) => {
    const delta = arcDelta(startCircle, endCircle, sweep, largeArc);
    const midAngle = startCircle + delta * 0.5;
    const mid = {
      x: r + r * Math.cos(midAngle),
      y: r + r * Math.sin(midAngle),
    };
    return { sweep, largeArc, delta, midAngle, mid };
  };

  const ellipseCandidates = [];
  const circleCandidates = [];
  for (const sweep of [0, 1]) {
    for (const largeArc of [0, 1]) {
      ellipseCandidates.push(sampleEllipse(sweep, largeArc));
      circleCandidates.push(sampleCircle(sweep, largeArc));
    }
  }

  const ellipseInside = ellipseCandidates
    .map((cand) => ({
      ...cand,
      inside: cand.dist <= r + 1e-4,
      sideOk: sideIsRight(cand.mid) === wantTermRight,
    }))
    .filter((cand) => cand.inside);

  const ellipseInsidePreferred = ellipseInside.filter((cand) => cand.sideOk);
  const preferLarge = phaseIllum >= 0.5;
  const pickBySize = (list) =>
    list.reduce((best, cand) => {
      const bestSize = Math.abs(best.delta);
      const candSize = Math.abs(cand.delta);
      if (preferLarge) return candSize > bestSize ? cand : best;
      return candSize < bestSize ? cand : best;
    });
  const pickOpposite = (list) =>
    list.reduce((best, cand) => {
      const bestSize = Math.abs(best.delta);
      const candSize = Math.abs(cand.delta);
      if (preferLarge) return candSize < bestSize ? cand : best;
      return candSize > bestSize ? cand : best;
    });
  const chosenEllipse = ellipseInsidePreferred.length
    ? pickOpposite(ellipseInsidePreferred)
    : ellipseInside.length
      ? pickOpposite(ellipseInside)
      : pickOpposite(ellipseCandidates);

  const circleSide = circleCandidates
    .map((cand) => ({
      ...cand,
      sideOk: sideIsRight(cand.mid) === wantRight,
    }))
    .filter((cand) => cand.sideOk);

  const chosenCircle = circleSide.length
    ? pickBySize(circleSide)
    : pickBySize(circleCandidates);

  const outerSweep = chosenCircle.sweep;
  const outerLarge = chosenCircle.largeArc;
  const termSweep = chosenEllipse.sweep;
  const termLarge = chosenEllipse.largeArc;

  if (debugArc) {
    const debugPayload = {
      ageDays,
      ageNorm,
      intersection: {
        top: { x: x0, y: yTop },
        bottom: { x: x0, y: yBottom },
      },
      chosenEllipse: {
        sweep: termSweep,
        largeArc: termLarge,
        mid: chosenEllipse.mid,
        dist: chosenEllipse.dist,
        inside: chosenEllipse.dist <= r + 1e-4,
        sideOk: sideIsRight(chosenEllipse.mid) === wantTermRight,
      },
      chosenCircle: {
        sweep: outerSweep,
        largeArc: outerLarge,
        mid: chosenCircle.mid,
        sideOk: sideIsRight(chosenCircle.mid) === wantRight,
      },
    };
    console.log(`[elliptical] ${JSON.stringify(debugPayload)}`);
  }

  return {
    path: [
      `M ${x0.toFixed(2)} ${yTop.toFixed(2)}`,
      `A ${r} ${r} 0 ${outerLarge} ${outerSweep} ${x0.toFixed(2)} ${yBottom.toFixed(2)}`,
      `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 ${termLarge} ${termSweep} ${x0.toFixed(2)} ${yTop.toFixed(2)}`,
      `Z`,
    ].join(" "),
    meta: {
      isFull,
      isNew,
      offsetX,
      terminatorSide,
      curvature,
      radiusX: curvature,
      radiusY: 1,
      terminatorRadius: radius,
      x0,
      yTop,
      yBottom,
      xMid,
      circleCenter: { x: r, y: r },
      ellipseCenter: { x: cx, y: cy },
      phaseWaxing,
      outerSweep,
      termSweep,
      outerLarge,
      termLarge,
      ellipseCandidates: ellipseCandidates.map((cand) => ({
        sweep: cand.sweep,
        largeArc: cand.largeArc,
        mid: cand.mid,
        dist: cand.dist,
        inside: cand.dist <= r + 1e-4,
        sideOk: sideIsRight(cand.mid) === wantTermRight,
      })),
      circleCandidates: circleCandidates.map((cand) => ({
        sweep: cand.sweep,
        largeArc: cand.largeArc,
        mid: cand.mid,
        sideOk: sideIsRight(cand.mid) === wantRight,
      })),
      chosenEllipse,
      chosenCircle,
      keyframe: params.meta,
      exactKind,
    },
  };
}

function buildMoonGeometry({
  size = 160,
  illumination = 0.5,
  waxing = true,
  model = DEFAULT_GEOMETRY_OPTIONS.model,
  halfRange = DEFAULT_GEOMETRY_OPTIONS.halfRange,
  maxBoost = DEFAULT_GEOMETRY_OPTIONS.maxBoost,
  bendMax = DEFAULT_GEOMETRY_OPTIONS.bendMax,
  bendEasePower = DEFAULT_GEOMETRY_OPTIONS.bendEasePower,
  c1 = DEFAULT_GEOMETRY_OPTIONS.c1,
  c2 = DEFAULT_GEOMETRY_OPTIONS.c2,
  moonAgeDays = null,
  moonAgeNormalized = null,
  halfEps = DEFAULT_GEOMETRY_OPTIONS.halfEps,
  fullEps = DEFAULT_GEOMETRY_OPTIONS.fullEps,
  newEps = DEFAULT_GEOMETRY_OPTIONS.newEps,
  debugArc = false,
} = {}) {
  const r = Number(size) / 2;
  const illum = clamp(Number(illumination), 0, 1);
  const modelUsed = model;

  if (modelUsed === MODELS.AGE_BUCKETS) {
    const { ageDays, ageNorm, source } = resolveAgeInputs({
      moonAgeDays,
      moonAgeNormalized,
      illumination: illum,
      waxing,
    });
    const interp = resolveAgeStrengthInterpolated(ageDays);
    const family = interp.family || "new";
    const side = interp.side || "none";
    const strength = interp.strength;
    const visualIllum = resolveIllumFromFamily(family, strength);
    const waxingResolved = side === "right" ? true : side === "left" ? false : waxing;
    const { path, meta } = buildMoonPathFromSpec({
      r,
      family,
      strength,
      side,
    });
    return {
      r,
      illum: visualIllum,
      waxing: waxingResolved,
      modelRequested: model,
      modelUsed,
      shadowRadius: r,
      dx: 0,
      shift: 0,
      litPath: path,
      ageDays,
      ageNorm,
      meta: {
        ...meta,
        ageSource: source,
        ageFloor: interp.ageFloor,
        ageCeil: interp.ageCeil,
        ageT: interp.t,
        family,
        strength,
        strengthA: interp.strengthA,
        strengthB: interp.strengthB,
        side,
      },
    };
  }

  if (
    modelUsed === MODELS.KEYFRAMED_MOON ||
    modelUsed === MODELS.ELLIPTICAL_TERMINATOR ||
    modelUsed === MODELS.INTERSECTION_FIXED
  ) {
    const { ageDays, ageNorm, source } = resolveAgeInputs({
      moonAgeDays,
      moonAgeNormalized,
      illumination: illum,
      waxing,
    });
    const { path, meta } = buildLitPathKeyframed({
      r,
      ageDays,
      ageNorm,
      fullEps,
      newEps,
      debugArc,
    });
    return {
      r,
      illum,
      waxing,
      modelRequested: model,
      modelUsed,
      shadowRadius: r,
      dx: 0,
      shift: 0,
      litPath: path,
      ageDays,
      ageNorm,
      meta: { ...meta, ageSource: source },
    };
  }

  if (modelUsed === MODELS.CUSTOM_TERMINATOR) {
    const { path, meta } = buildLitPathCustomTerminator({
      r,
      illum,
      waxing,
      bendMax,
      bendEasePower,
      c1,
      c2,
      halfEps,
      fullEps,
      newEps,
    });
    return {
      r,
      illum,
      waxing,
      modelRequested: model,
      modelUsed,
      shadowRadius: r,
      dx: 0,
      shift: 0,
      litPath: path,
      meta,
    };
  }

  const shadowRadius = resolveShadowRadius({
    r,
    illum,
    model: modelUsed,
    halfRange,
    maxBoost,
  });
  const dx = offsetForIllumination(illum, r, shadowRadius);
  const shift = waxing ? -dx : dx;

  const { path, meta } = buildLitPathFromCircles({
    r,
    illum,
    waxing,
    shift,
    shadowRadius,
    halfEps,
    fullEps,
    newEps,
  });

  return {
    r,
    illum,
    waxing,
    modelRequested: model,
    modelUsed,
    shadowRadius,
    dx,
    shift,
    litPath: path,
    meta,
  };
}

module.exports = {
  buildMoonGeometry,
  offsetForIllumination,
  overlapArea,
};
