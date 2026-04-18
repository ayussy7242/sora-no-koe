"use strict";

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, Number(t)));
  return x * x * (3 - 2 * x);
}

function accelerateNearNewMoon(t, factor = 1.55) {
  return smoothstep01(Math.max(0, Math.min(1, Number(t) * Number(factor))));
}

function interpolateKeyframes(frames, age) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return {
      offsetX: 0,
      radiusX: 1,
      radiusY: 1,
      meta: { kind: "empty" },
    };
  }

  const sorted = frames.slice().sort((a, b) => a.age - b.age);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const target = Number(age);

  if (target <= first.age) {
    return { ...first, meta: { kind: first.kind || "frame" } };
  }
  if (target >= last.age) {
    return { ...last, meta: { kind: last.kind || "frame" } };
  }

  let left = first;
  let right = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (target >= a.age && target <= b.age) {
      left = a;
      right = b;
      break;
    }
  }

  const span = right.age - left.age;
  const rawT = span > 0 ? (target - left.age) / span : 0;
  const t = smoothstep01(rawT);
  const lerp = (a, b) => Number(a) + (Number(b) - Number(a)) * t;

  const val = (obj, key, fallback) => {
    const v = Number(obj?.[key]);
    return Number.isFinite(v) ? v : fallback;
  };

  const leftOffset = val(left, "offsetX", 0);
  const rightOffset = val(right, "offsetX", 0);
  const leftRadiusX = val(left, "radiusX", 1);
  const rightRadiusX = val(right, "radiusX", 1);
  const leftRadiusY = val(left, "radiusY", 1);
  const rightRadiusY = val(right, "radiusY", 1);

  return {
    age: target,
    offsetX: lerp(leftOffset, rightOffset),
    radiusX: lerp(leftRadiusX, rightRadiusX),
    radiusY: lerp(leftRadiusY, rightRadiusY),
    meta: {
      leftAge: left.age,
      rightAge: right.age,
      t,
    },
  };
}

module.exports = {
  smoothstep01,
  accelerateNearNewMoon,
  interpolateKeyframes,
};
