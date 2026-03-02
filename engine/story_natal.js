"use strict";

const { normalizeBodyKey } = require("./domain/canonical");

function createNatalService({ db, norm360 }) {
  async function loadNatalFromcache(appUserId) {
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    return snap.exists ? snap.data() : null;
  }

  function extractNatalLongitudes(natalCacheDoc) {
    const d = natalCacheDoc || {};
    const out = {};

    const ALIASES = {
      asc: "asc",
      mc: "mc",
      vertex: "vertex",

      sun: "sun",
      moon: "moon",
      mercury: "mercury",
      venus: "venus",
      mars: "mars",
      jupiter: "jupiter",
      saturn: "saturn",
      uranus: "uranus",
      neptune: "neptune",
      pluto: "pluto",
    };

    const normalizeKey = (k) => {
      const key = normalizeBodyKey(k);
      return ALIASES[key] || key;
    };

    const put = (key, lon) => {
      const nk = normalizeKey(key);
      if (typeof lon === "number" && Number.isFinite(lon)) out[nk] = norm360(lon);
    };

    const putFromObj = (key, v) => {
      if (typeof v === "number") return put(key, v);
      if (!v || typeof v !== "object") return;
      put(key, v.lon_deg);
      put(key, v.lon);
      put(key, v.longitude);
      if (Array.isArray(v.data) && typeof v.data[0] === "number") put(key, v.data[0]);
    };

    if (d.bodies && typeof d.bodies === "object") {
      for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
    }
    if (d.points && typeof d.points === "object") {
      for (const p of ["asc", "mc", "vertex", "asc", "mc", "vertex"]) {
        if (p in d.points) putFromObj(p, d.points[p]);
      }
    }

    const bodiesMap =
      d?.min?.bodies ||
      d?.min?.natal_positions ||
      d?.natal_positions ||
      d?.positions ||
      null;
    if (bodiesMap && typeof bodiesMap === "object") {
      for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);
    }

    // angles
    put("asc", d?.engine?.houses?.asc_deg);
    put("mc", d?.engine?.houses?.mc_deg);
    put("asc", d?.houses?.angles?.asc);
    put("mc", d?.houses?.angles?.mc);
    put("vertex", d?.houses?.angles?.vertex);
    put("asc", d?.min?.angles?.asc_deg ?? d?.min?.angles?.asc ?? d?.min?.asc_deg);
    put("mc", d?.min?.angles?.mc_deg ?? d?.min?.angles?.mc ?? d?.min?.mc_deg);

    const legacySrc = (d.min && d.min.bodies) || d.bodies_min || d.natal_bodies || null;
    if (legacySrc && typeof legacySrc === "object") {
      for (const [k, v] of Object.entries(legacySrc)) putFromObj(k, v);
    }

    const ok = Object.keys(out).length > 0;
    return { ok, longitudes: out };
  }

  return { loadNatalFromcache, extractNatalLongitudes };
}

module.exports = { createNatalService };
