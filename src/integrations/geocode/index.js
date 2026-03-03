"use strict";

/**
 * engine/geocode.js — Unified STABLE (v2025.12)
 *
 * What it does:
 * - Google Geocoding APIで「住所/地名 → 緯度経度」を解決
 * - Firestoreにキャッシュ（geo_cache）してAPI呼びすぎを防ぐ
 * - 失敗時も扱いやすい戻り値（ok=false + status/reason/candidates）
 *
 * Usage:
 *   const { createGeocoder } = require("../integrations/geocode");
 *   const geocoder = createGeocoder({ apiKey: env.GOOGLE_MAPS_API_KEY, db, project: env.PROJECT });
 *   const r = await geocoder.geocodePlace("北海道 上川郡 清水町", { language: "ja" });
 */

const crypto = require("crypto");

// --------------------
// utils
// --------------------
function normalizePlaceKey(place) {
    return String(place || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[　]+/g, " ")
        .toLowerCase();
}

function sha1(s) {
    return crypto.createHash("sha1").update(String(s || ""), "utf8").digest("hex");
}

function pickCandidates(results, max = 3) {
    if (!Array.isArray(results)) return [];
    return results.slice(0, max).map((r) => ({
        formatted_address: r?.formatted_address ?? null,
        place_id: r?.place_id ?? null,
        location_type: r?.geometry?.location_type ?? null,
        lat: r?.geometry?.location?.lat ?? null,
        lon: r?.geometry?.location?.lng ?? null,
        types: r?.types ?? null,
    }));
}

function clampLatLon(lat, lon) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    if (la < -90 || la > 90) return null;
    if (lo < -180 || lo > 180) return null;
    return { lat: la, lon: lo };
}

function isLatLonString(s) {
    // "43.123,142.456" みたいなやつ
    if (typeof s !== "string") return false;
    return /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(s);
}

function parseLatLonString(s) {
    if (!isLatLonString(s)) return null;
    const [a, b] = s.split(",").map((x) => x.trim());
    return clampLatLon(a, b);
}

// --------------------
// main factory
// --------------------
function createGeocoder({
    apiKey,
    db = null,
    project = "sora-no-koe",
    cacheCollection = "geo_cache",
    defaultLanguage = "ja",
    defaultRegion = "jp",
    cacheTtlDays = 180, // 半年キャッシュで十分（地名は変わりにくい）
    strict = false, // trueだとエラー投げる（基本false推奨）
} = {}) {
    async function geocodePlace(place, opts = {}) {
        const placeRaw = String(place || "").trim();
        if (!placeRaw) {
            return { ok: false, status: "INVALID_REQUEST", reason: "place is empty", candidates: [] };
        }

        // 直接 "lat,lon" で来た場合はAPI不要
        const direct = parseLatLonString(placeRaw);
        if (direct) {
            return {
                ok: true,
                source: "direct",
                lat: direct.lat,
                lon: direct.lon,
                formatted: placeRaw,
                place_id: null,
                raw: null,
            };
        }

        const language = opts.language || defaultLanguage;
        const region = opts.region || defaultRegion;
        const useCache = opts.useCache !== false;

        // --------------------
        // cache (Firestore)
        // --------------------
        const key = normalizePlaceKey(placeRaw);
        const cacheId = sha1(`${project}|${language}|${region}|${key}`);

        if (db && useCache) {
            try {
                const ref = db.collection(cacheCollection).doc(cacheId);
                const snap = await ref.get();
                if (snap.exists) {
                    const data = snap.data() || {};
                    const cached = data?.result || null;

                    // TTL check
                    const updatedAt = data?.updated_at?.toDate ? data.updated_at.toDate() : null;
                    if (cached?.ok && updatedAt) {
                        const ageMs = Date.now() - updatedAt.getTime();
                        const ttlMs = Number(cacheTtlDays) * 24 * 60 * 60 * 1000;
                        if (ageMs <= ttlMs) {
                            return { ...cached, source: "cache" };
                        }
                    }

                    // ok=falseもキャッシュしてる場合：短期で再試行したいならここ調整
                    if (cached && cached.ok === false && updatedAt) {
                        const noCacheStatuses = new Set(["NO_API_KEY", "REQUEST_DENIED"]);
                        if (!noCacheStatuses.has(cached.status)) {
                            const ageMs = Date.now() - updatedAt.getTime();
                            const ttlMs = 7 * 24 * 60 * 60 * 1000;
                            if (ageMs <= ttlMs) return { ...cached, source: "cache" };
                        }
                    }
                }
            } catch (_) {
                // cacheは落ちても続行
            }
        }

        // --------------------
        // call Google Geocoding API
        // --------------------
        if (!apiKey) {
            const out = { ok: false, status: "NO_API_KEY", reason: "GOOGLE_MAPS_API_KEY missing", candidates: [] };
            if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
            if (strict) throw new Error(out.reason);
            return out;
        }

        if (typeof fetch !== "function") {
            const out = { ok: false, status: "NO_FETCH", reason: "global fetch is not available (Node 18+ required)", candidates: [] };
            if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
            if (strict) throw new Error(out.reason);
            return out;
        }

        const url =
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(placeRaw)}` +
            `&key=${encodeURIComponent(apiKey)}` +
            `&language=${encodeURIComponent(language)}` +
            (region ? `&region=${encodeURIComponent(region)}` : "");

        let json = null;
        try {
            const res = await fetch(url);
            const text = await res.text();
            try {
                json = text ? JSON.parse(text) : null;
            } catch (e) {
                const out = { ok: false, status: "BAD_RESPONSE", reason: "non-json response from google", candidates: [] };
                if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
                if (strict) throw new Error(out.reason);
                return out;
            }
        } catch (e) {
            const out = { ok: false, status: "NETWORK_ERROR", reason: e?.message || "network error", candidates: [] };
            if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
            if (strict) throw new Error(out.reason);
            return out;
        }

        const status = json?.status || "UNKNOWN";
        const results = json?.results || [];

        if (status !== "OK" || !results.length) {
            const out = {
                ok: false,
                status,
                reason: json?.error_message || "geocode not ok",
                candidates: pickCandidates(results, 3),
            };
            if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
            if (strict) throw new Error(out.reason);
            return out;
        }

        const top = results[0];
        const lat = top?.geometry?.location?.lat ?? null;
        const lon = top?.geometry?.location?.lng ?? null;

        const ll = clampLatLon(lat, lon);
        if (!ll) {
            const out = {
                ok: false,
                status: "INVALID_GEOMETRY",
                reason: "lat/lon missing or invalid",
                candidates: pickCandidates(results, 3),
            };
            if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
            if (strict) throw new Error(out.reason);
            return out;
        }

        const out = {
            ok: true,
            source: "google",
            lat: ll.lat,
            lon: ll.lon,
            formatted: top?.formatted_address ?? null,
            place_id: top?.place_id ?? null,
            raw: {
                types: top?.types ?? null,
                location_type: top?.geometry?.location_type ?? null,
            },
        };

        if (db && useCache) await safeCache(db, cacheCollection, cacheId, placeRaw, out);
        return out;
    }

    async function safeCache(db, col, id, placeRaw, result) {
        try {
            const ref = db.collection(col).doc(id);
            const now = db.constructor?.FieldValue?.serverTimestamp
                ? db.constructor.FieldValue.serverTimestamp()
                : null;

            // admin SDK FieldValue を外から渡してないので、serverTimestampは使えない場合あり
            // その場合でも壊れないように Date を入れておく
            await ref.set(
                {
                    key: id,
                    place: placeRaw,
                    result,
                    updated_at: new Date(),
                },
                { merge: true }
            );
        } catch (_) { }
    }

    return { geocodePlace };
}

// --- convenience wrapper (no cache, no db) ---
async function geocodePlace(place, apiKey, opts = {}) {
    const geocoder = createGeocoder({
        apiKey,
        db: null,
        strict: false,
        defaultLanguage: opts.language || "ja",
        defaultRegion: opts.region || "jp",
    });
    return geocoder.geocodePlace(place, opts);
}

module.exports = { createGeocoder, geocodePlace };
