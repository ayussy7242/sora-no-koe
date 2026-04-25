"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeMoonPhaseByIllumination } = require("../src/domain/moon/phase");
const { resolveMoonCycleLabel, resolveMoonDisplayName } = require("../src/domain/moon/phase");
const { buildMoonAppearance } = require("../src/engine/shared/moon_glyph/appearance");
const { buildMoonGeometry } = require("../src/engine/shared/moon_glyph/geometry");
const { MODELS } = require("../src/engine/shared/moon_glyph/constants");

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
  assert.equal(resolveMoonCycleLabel({ phaseName: "新月", moonAge: 28.0, illumination: 0.03 }), "欠けゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "新月", moonAge: 28.7, illumination: 0.003 }), "欠けゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "三日月" }), "満ちゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "満ちゆく月" }), "満ちゆく月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "上弦" }), "上弦の月");
  assert.equal(resolveMoonCycleLabel({ phaseName: "満月", moonAge: 13.8, illumination: 0.97 }), "満ちゆく月");
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
  assert.equal(resolveMoonDisplayName({ phaseName: "三日月", waName: "", moonAge: 3.0, illumination: 0.1, allowCycleName: false }), "満ちゆく月");
  assert.equal(resolveMoonDisplayName({ phaseName: "三日月", waName: "", moonAge: 3.4, illumination: 0.13, allowCycleName: true }), "満ちゆく月");
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
  assert.ok(Number(geometry.illum) >= 0.05);
  assert.ok(Number(geometry.illum) <= 0.06);
  assert.equal(Number(geometry.meta?.actualIllumination), 0.01);
});

test("buildMoonGeometry renders day-3 and day-4 moons with a fuller body", () => {
  const day3 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 3,
    waxing: true,
    illumination: 0.1,
  });
  const day4 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 4,
    waxing: true,
    illumination: 0.17,
  });

  assert.equal(day3.meta?.family, "waxing_shadow");
  assert.equal(day4.meta?.family, "waxing_shadow");
  assert.ok(Number(day3.illum) >= 0.07);
  assert.ok(Number(day3.illum) <= 0.11);
  assert.ok(Number(day4.illum) >= 0.14);
  assert.ok(Number(day4.illum) <= 0.20);
});

test("buildMoonGeometry respects provided illumination within the post-quarter waxing band", () => {
  const geometry = buildMoonGeometry({
    size: 160,
    moonAgeDays: 8.8,
    waxing: true,
    illumination: 0.65,
  });

  assert.equal(geometry.meta?.family, "gibbous");
  assert.ok(Number(geometry.illum) >= 0.64);
  assert.ok(Number(geometry.illum) <= 0.66);
});

test("buildMoonGeometry applies a perceptual floor only in the ultra-thin band", () => {
  const exactNewMoon = buildMoonGeometry({
    size: 160,
    moonAgeDays: 0,
    waxing: true,
    illumination: 0,
  });
  const preNewMoon = buildMoonGeometry({
    size: 160,
    moonAgeDays: 29.0,
    waxing: false,
    illumination: 0.003,
  });
  const postNewMoon = buildMoonGeometry({
    size: 160,
    moonAgeDays: 1.0,
    waxing: true,
    illumination: 0.011,
  });

  assert.equal(Number(exactNewMoon.illum), 0);
  assert.equal(exactNewMoon.meta?.family, "new");
  assert.equal(preNewMoon.meta?.family, "waning_shadow");
  assert.equal(postNewMoon.meta?.family, "waxing_shadow");
  assert.ok(Number(preNewMoon.illum) > Number(preNewMoon.meta?.actualIllumination));
  assert.ok(Number(postNewMoon.illum) > Number(postNewMoon.meta?.actualIllumination));
  assert.ok(Number(preNewMoon.illum) >= 0.04);
  assert.ok(Number(postNewMoon.illum) > Number(preNewMoon.illum));
});

test("buildMoonGeometry uses the same illumination-driven shape across shared models", () => {
  const models = [
    MODELS.AGE_BUCKETS,
    MODELS.KEYFRAMED_MOON,
    MODELS.ELLIPTICAL_TERMINATOR,
    MODELS.INTERSECTION_FIXED,
  ];
  const results = models.map((model) =>
    buildMoonGeometry({
      size: 160,
      model,
      moonAgeDays: 8.8,
      waxing: true,
      illumination: 0.65,
    })
  );

  for (const result of results) {
    assert.equal(result.meta?.family, "gibbous");
    assert.equal(result.meta?.illuminationDriven, true);
    assert.ok(Number(result.illum) >= 0.64);
    assert.ok(Number(result.illum) <= 0.66);
  }
  assert.deepEqual(
    results.map((result) => Number(result.meta?.strength)),
    [Number(results[0].meta?.strength), Number(results[0].meta?.strength), Number(results[0].meta?.strength), Number(results[0].meta?.strength)]
  );
});

test("buildMoonGeometry keeps identical illumination stable across nearby waxing ages", () => {
  const day8_8 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 8.8,
    waxing: true,
    illumination: 0.65,
  });
  const day9 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 9,
    waxing: true,
    illumination: 0.65,
  });

  assert.equal(day8_8.meta?.family, "gibbous");
  assert.equal(day9.meta?.family, "gibbous");
  assert.equal(Number(day8_8.meta?.strength), Number(day9.meta?.strength));
  assert.equal(Number(day8_8.illum), Number(day9.illum));
});

test("buildMoonGeometry stays continuous across nearby waxing ages when illumination changes smoothly", () => {
  const day8_8 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 8.8,
    waxing: true,
    illumination: 0.64,
  });
  const day9_0 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 9.0,
    waxing: true,
    illumination: 0.65,
  });
  const day9_1 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 9.1,
    waxing: true,
    illumination: 0.66,
  });

  assert.ok(Number(day8_8.illum) < Number(day9_0.illum));
  assert.ok(Number(day9_0.illum) < Number(day9_1.illum));
  assert.ok(Number(day8_8.meta?.strength) < Number(day9_0.meta?.strength));
  assert.ok(Number(day9_0.meta?.strength) < Number(day9_1.meta?.strength));
});

test("buildMoonGeometry uses illumination to distinguish quarter, gibbous, and thin phases", () => {
  const thin = buildMoonGeometry({
    size: 160,
    moonAgeDays: 5,
    waxing: true,
    illumination: 0.24,
  });
  const quarter = buildMoonGeometry({
    size: 160,
    moonAgeDays: 8,
    waxing: true,
    illumination: 0.5,
  });
  const gibbous = buildMoonGeometry({
    size: 160,
    moonAgeDays: 10,
    waxing: true,
    illumination: 0.76,
  });

  assert.equal(thin.meta?.family, "waxing_shadow");
  assert.equal(quarter.meta?.family, "quarter");
  assert.equal(gibbous.meta?.family, "gibbous");
  assert.ok(Number(thin.illum) < Number(quarter.illum));
  assert.ok(Number(gibbous.illum) > Number(quarter.illum));
});

test("buildMoonGeometry mirrors waxing and waning sides from illumination plus direction", () => {
  const waxing = buildMoonGeometry({
    size: 160,
    moonAgeDays: 8.8,
    waxing: true,
    illumination: 0.65,
  });
  const waning = buildMoonGeometry({
    size: 160,
    moonAgeDays: 20.2,
    waxing: false,
    illumination: 0.65,
  });

  assert.equal(waxing.meta?.family, "gibbous");
  assert.equal(waning.meta?.family, "gibbous");
  assert.equal(waxing.waxing, true);
  assert.equal(waning.waxing, false);
  assert.equal(Number(waxing.illum), Number(waning.illum));
});
