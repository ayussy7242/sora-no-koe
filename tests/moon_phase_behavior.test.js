"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeMoonPhaseByIllumination } = require("../src/domain/moon/phase");
const { resolveMoonCycleLabel, resolveMoonDisplayName } = require("../src/domain/moon/phase");
const { buildMoonAppearance } = require("../src/engine/shared/moon_glyph/appearance");
const { buildMoonGeometry } = require("../src/engine/shared/moon_glyph/geometry");

test("normalizeMoonPhaseByIllumination keeps post-new-moon phases on the waxing side", () => {
  const normalized = normalizeMoonPhaseByIllumination(
    { key: "new", name: "新月", symbol: "🌑" },
    0.03
  );

  assert.equal(normalized?.key, "waxing_crescent");
  assert.equal(normalized?.name, "三日月");
});

test("resolveMoonCycleLabel maps all lunar families into the shared six labels", () => {
  assert.equal(resolveMoonCycleLabel({ phaseName: "新月", moonAge: 0.1, illumination: 0.001 }), "新月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "新月", moonAge: 0.7, illumination: 0.006 }), "満ちゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "三日月" }), "満ちゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "満ちゆく月" }), "満ちゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "上弦" }), "上弦の月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "満月", moonAge: 14.8, illumination: 0.999 }), "満月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "満月", moonAge: 15.5, illumination: 0.98 }), "欠けゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "欠けゆく月" }), "欠けゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "残月" }), "欠けゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "下弦" }), "下弦の月");
});

test("resolveMoonDisplayName prefers wa-name except for new/full moon", () => {
  assert.equal(resolveMoonDisplayName({ phaseName: "新月", waName: "", moonAge: 0.1, illumination: 0.001, allowCycleName: false }), "新月");
  assert.equal(resolveMoonDisplayName({ phaseName: "新月", waName: "二日月", moonAge: 0.7, illumination: 0.006, allowCycleName: false }), "二日月");
  assert.equal(resolveMoonDisplayName({ phaseName: "三日月", waName: "二日月", moonAge: 1.1, illumination: 0.01, allowCycleName: false }), "二日月");
  assert.equal(resolveMoonDisplayName({ phaseName: "上弦", waName: "", moonAge: 7.2, illumination: 0.5, allowCycleName: false }), "上弦の月");
});

test("buildMoonAppearance renders near-new moon as a dark disc at 2% illumination", () => {
  const appearance = buildMoonAppearance({
    id: "test",
    geometry: { r: 80, illum: 0.02, litPath: "M 0 0 Z" },
    lightColor: "#fff",
    darkColor: "#000",
    withRim: true,
  });

  assert.equal(appearance.body.length, 2);
  assert.match(appearance.body[0], /<circle/);
  assert.match(appearance.body[1], /stroke=/);
});

test("buildMoonGeometry keeps the waxing sliver almost invisible right after new moon", () => {
  const geometry = buildMoonGeometry({
    size: 160,
    illumination: 0.01,
    moonAgeDays: 0.7,
    waxing: true,
  });

  assert.equal(geometry.meta?.family, "waxing_shadow");
  assert.ok(Number(geometry.illum) <= 0.04);
  assert.ok(Number(geometry.illum) >= 0.02);
});
