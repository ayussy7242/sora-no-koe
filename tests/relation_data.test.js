"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveRelationData } = require("../src/usecases/pdf/relation/build_relation_data");
const { ELEMENT_LABELS, MODALITY_LABELS } = require("../src/engine/pdf/relation/constants");

const planet = (body_key, sign_key, sign_ja, lon_deg, house, body_ja) => ({
  body_key,
  sign_key,
  sign_ja,
  lon_deg,
  house,
  body_ja: body_ja || body_key,
});

test("deriveRelationData builds relation view model", () => {
  const view = {
    people: { a: { name: "A" }, b: { name: "B" } },
    planet_matrix: {
      a: [
        planet("sun", "aries", "牡羊座", 10, 1, "太陽"),
        planet("moon", "taurus", "牡牛座", 40, 2, "月"),
        planet("mercury", "gemini", "双子座", 70, 3, "水星"),
        planet("venus", "cancer", "蟹座", 100, 4, "金星"),
        planet("mars", "leo", "獅子座", 130, 5, "火星"),
        planet("jupiter", "virgo", "乙女座", 160, 6, "木星"),
        planet("saturn", "libra", "天秤座", 190, 7, "土星"),
        planet("asc", "aries", "牡羊座", 5, 1, "ASC"),
      ],
      b: [
        planet("sun", "aries", "牡羊座", 15, 7, "太陽"),
        planet("moon", "scorpio", "蠍座", 220, 2, "月"),
        planet("mercury", "gemini", "双子座", 80, 3, "水星"),
        planet("venus", "cancer", "蟹座", 110, 4, "金星"),
        planet("mars", "leo", "獅子座", 140, 5, "火星"),
        planet("jupiter", "virgo", "乙女座", 170, 6, "木星"),
        planet("saturn", "libra", "天秤座", 200, 7, "土星"),
        planet("asc", "libra", "天秤座", 185, 7, "ASC"),
      ],
    },
    deep_points: {
      a: [planet("north_node", "aries", "牡羊座", 12, 1, "ドラゴンヘッド")],
      b: [planet("north_node", "libra", "天秤座", 192, 7, "ドラゴンヘッド")],
    },
    element_balance: {
      a: { element_count: { fire: 3, earth: 1, air: 0, water: 0 }, top_element: "fire" },
      b: { element_count: { water: 3, earth: 1, air: 0, fire: 0 }, top_element: "water" },
    },
    modality_balance: {
      a: { modality_count: { cardinal: 2, fixed: 1, mutable: 0 }, top_modality: "cardinal" },
      b: { modality_count: { cardinal: 1, fixed: 2, mutable: 0 }, top_modality: "fixed" },
    },
    connections: [
      { a: { body_key: "sun", body_ja: "太陽" }, b: { body_key: "moon", body_ja: "月" }, aspect: "trine", orb: 1.0 },
      { a: { body_key: "sun", body_ja: "太陽" }, b: { body_key: "saturn", body_ja: "土星" }, aspect: "square", orb: 2.0 },
      { a: { body_key: "venus", body_ja: "金星" }, b: { body_key: "mars", body_ja: "火星" }, aspect: "conjunction", orb: 0.5 },
      { a: { body_key: "mercury", body_ja: "水星" }, b: { body_key: "mercury", body_ja: "水星" }, aspect: "sextile", orb: 1.2 },
      { a: { body_key: "asc", body_ja: "ASC" }, b: { body_key: "sun", body_ja: "太陽" }, aspect: "conjunction", orb: 0.8 },
      { a: { body_key: "moon", body_ja: "月" }, b: { body_key: "moon", body_ja: "月" }, aspect: "conjunction", orb: 0.4 },
    ],
  };

  const derived = deriveRelationData(view);

  assert.equal(derived.topElementA, ELEMENT_LABELS.fire);
  assert.equal(derived.topElementB, ELEMENT_LABELS.water);
  assert.equal(derived.topModalityB, MODALITY_LABELS.fixed);
  assert.ok(Array.isArray(derived.coreList));
  assert.ok(Array.isArray(derived.flowList));
  assert.ok(Array.isArray(derived.frictionList));
  assert.ok(Array.isArray(derived.houseSections));
  assert.equal(derived.houseSections.length, 2);

  const compareKeys = new Set((derived.comparePairsEnsured || []).map((row) => row?.body_key));
  assert.equal(compareKeys.has("sun"), true);
  assert.equal(compareKeys.has("moon"), true);

  assert.ok(derived.relationCenter && typeof derived.relationCenter === "object");
  assert.ok(derived.relationPattern && typeof derived.relationPattern === "object");
  assert.ok(derived.relationPatternText.includes(derived.relationPattern.name));
});
