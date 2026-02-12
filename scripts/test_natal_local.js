"use strict";

const { computeNatalCache } = require("../jobs/worker");

// swisseph の読み込み（Bの手順では npm swisseph がある前提）
const swisseph = require("swisseph");

function mustNum(v, name) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} invalid: ${v}`);
  return v;
}

(async () => {
  // あゆっさい例：1990-07-24 12:18 JST = 1990-07-24T03:18:00Z
  const birthUtcIso = "1990-07-24T03:18:00.000Z";

  // いったん仮（清水町近辺）。あとで正確なlat/lonに差し替えればOK
  const lat = 42.99;
  const lon = 142.90;

  const out = computeNatalCache({
    swisseph,
    birthUtcIso,
    houseSystem: "P",
    lat,
    lon,
    precisionDeg: 0.01,
  });

  console.log("✅ ok");
  console.log("jd_ut:", out.jd_ut);
  console.log("bodies keys:", Object.keys(out.bodies || {}));
  console.log("sun:", out.bodies?.sun);
  console.log("moon:", out.bodies?.moon);
  console.log("asc:", out.houses?.angles?.asc);
  console.log("mc:", out.houses?.angles?.mc);
  console.log("vertex:", out.houses?.angles?.vertex);

  // 最低ライン判定
  mustNum(out.bodies?.sun, "sun");
  mustNum(out.bodies?.moon, "moon");
  mustNum(out.houses?.angles?.asc, "asc");
  mustNum(out.houses?.angles?.mc, "mc");

  console.log("✅ PASS: bodies + houses angles");
})().catch((e) => {
  console.error("❌ FAIL:", e.message || e);
  process.exit(1);
});
