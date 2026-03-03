"use strict";

const swisseph = require("../src/config/swisseph"); // ←あなたの構成に合わせてここは要調整
// もし config/swisseph.js が「初期化済 swisseph」を export してるならOK

function jdUtFromIso(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
}

const birthUtcIso = "1990-07-24T03:18:00.000Z"; // 12:18 JST
const jdUt = jdUtFromIso(birthUtcIso);

const lat = 39.3306618;
const lon = 141.5314512;
const houseSystem = "P";

const hs = swisseph.swe_houses(jdUt, lat, lon, houseSystem);

console.log("keys:", Object.keys(hs || {}));
console.log("hs.ascmc:", hs?.ascmc);
console.log("Array.isArray(ascmc):", Array.isArray(hs?.ascmc));
console.log("typeof ascmc[0]:", Array.isArray(hs?.ascmc) ? typeof hs.ascmc[0] : null);
console.log("hs.house / hs.cusps:", hs?.house || hs?.cusps);
