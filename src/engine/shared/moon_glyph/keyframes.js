"use strict";

const SYNODIC_MONTH = 29.530588;

const KEYFRAMES = Object.freeze([
  { age: 0, offsetX: 0.98, radiusX: 1.00, radiusY: 1.00, kind: "new" },
  { age: 1, offsetX: 0.96, radiusX: 1.00, radiusY: 1.00 },
  { age: 3, offsetX: 0.92, radiusX: 1.00, radiusY: 1.00 },
  { age: 5, offsetX: 0.86, radiusX: 1.00, radiusY: 1.00 },
  { age: 6, offsetX: 0.80, radiusX: 1.00, radiusY: 1.00 },
  { age: 7, offsetX: 0.74, radiusX: 1.00, radiusY: 1.00 },
  { age: 8, offsetX: 0.66, radiusX: 1.00, radiusY: 1.00 },
  { age: 10, offsetX: 0.50, radiusX: 1.00, radiusY: 1.00 },
  { age: 12, offsetX: 0.36, radiusX: 1.00, radiusY: 1.00 },
  { age: 13, offsetX: 0.28, radiusX: 1.00, radiusY: 1.00 },
  { age: 14, offsetX: 0.20, radiusX: 1.00, radiusY: 1.00 },
  { age: 15, offsetX: 0.12, radiusX: 1.00, radiusY: 1.00, kind: "full" },
  { age: 16, offsetX: 0.18, radiusX: 1.00, radiusY: 1.00 },
  { age: 17, offsetX: 0.26, radiusX: 1.00, radiusY: 1.00 },
  { age: 18, offsetX: 0.36, radiusX: 1.00, radiusY: 1.00 },
  { age: 19, offsetX: 0.46, radiusX: 1.00, radiusY: 1.00 },
  { age: 20, offsetX: 0.58, radiusX: 1.00, radiusY: 1.00 },
  { age: 21, offsetX: 0.68, radiusX: 1.00, radiusY: 1.00 },
  { age: 22, offsetX: 0.78, radiusX: 1.00, radiusY: 1.00 },
  { age: 23, offsetX: 0.88, radiusX: 1.00, radiusY: 1.00 },
  { age: 24, offsetX: 0.94, radiusX: 1.00, radiusY: 1.00 },
  { age: 26, offsetX: 0.96, radiusX: 1.00, radiusY: 1.00 },
  { age: 29, offsetX: 0.98, radiusX: 1.00, radiusY: 1.00, kind: "new" },
]);

module.exports = {
  SYNODIC_MONTH,
  KEYFRAMES,
};
