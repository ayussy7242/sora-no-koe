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
  assert.ok(Number(geometry.illum) <= 0.04);
  assert.ok(Number(geometry.illum) >= 0.02);
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

test("buildMoonGeometry keeps day-5 to day-7 on the slimmer side", () => {
  const day5 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 5,
    waxing: true,
    illumination: 0.5,
  });
  const day6 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 6,
    waxing: true,
    illumination: 0.5,
  });
  const day7 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 7,
    waxing: true,
    illumination: 0.5,
  });

  assert.ok(Number(day5.illum) < 0.24);
  assert.ok(Number(day6.illum) < 0.39);
  assert.ok(Number(day7.illum) < 0.45);
  assert.ok(Number(day6.illum) > Number(day5.illum));
  assert.ok(Number(day7.illum) > Number(day6.illum));
});

test("buildMoonGeometry keeps the post-quarter band smooth", () => {
  const day8 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 8,
    waxing: true,
    illumination: 0.5,
  });
  const day9 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 9,
    waxing: true,
    illumination: 0.5,
  });
  const day10 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 10,
    waxing: true,
    illumination: 0.5,
  });

  assert.equal(day8.meta?.family, "quarter");
  assert.equal(day9.meta?.family, "gibbous");
  assert.equal(day10.meta?.family, "gibbous");
  assert.ok(Number(day9.illum) > Number(day8.illum));
  assert.ok(Number(day10.illum) > Number(day9.illum));
  assert.ok(Number(day9.illum) >= 0.58);
  assert.ok(Number(day9.illum) <= 0.62);
});

test("buildMoonGeometry keeps day-1 and day-29 equally thin", () => {
  const day1 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 1,
    waxing: true,
    illumination: 0.5,
  });
  const day29 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 29,
    waxing: false,
    illumination: 0.5,
  });

  assert.equal(day1.meta?.family, "waxing_shadow");
  assert.equal(day29.meta?.family, "waning_shadow");
  assert.equal(Number(day1.meta?.strength), Number(day29.meta?.strength));
  assert.equal(Number(day1.illum), Number(day29.illum));
});

test("buildMoonGeometry keeps day-28 close to day-2 but slightly slimmer", () => {
  const day2 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 2,
    waxing: true,
    illumination: 0.5,
  });
  const day28 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 28,
    waxing: false,
    illumination: 0.5,
  });

  assert.equal(day2.meta?.family, "waxing_shadow");
  assert.equal(day28.meta?.family, "waning_shadow");
  assert.ok(Number(day28.meta?.strength) > Number(day2.meta?.strength));
  assert.ok(Number(day28.illum) < Number(day2.illum));
  assert.ok(Number(day28.illum) > 0.022);
});

test("buildMoonGeometry keeps waning days 24 to 27 aligned with the slimmer waxing band", () => {
  const day24 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 24,
    waxing: false,
    illumination: 0.5,
  });
  const day25 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 25,
    waxing: false,
    illumination: 0.5,
  });
  const day26 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 26,
    waxing: false,
    illumination: 0.5,
  });
  const day27 = buildMoonGeometry({
    size: 160,
    moonAgeDays: 27,
    waxing: false,
    illumination: 0.5,
  });

  assert.ok(Number(day24.illum) < 0.39);
  assert.ok(Number(day25.illum) < 0.24);
  assert.ok(Number(day26.illum) < 0.20);
  assert.ok(Number(day27.illum) < 0.03);
});
