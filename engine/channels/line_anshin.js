"use strict";

/**
 * channels/line_anshin.js
 * - 未接触ネイタル（personal command）
 * - 予言なし／評価なし／構造のみ
 */

function toDotDate(s) {
  return String(s || "").replace(/-/g, ".");
}

function safeStr(x) {
  return String(x ?? "");
}

function boolishEnv(v) {
  const s = String(v || "").toLowerCase().trim();
  return ["1", "true", "yes", "on", "enabled"].includes(s);
}

function hash32(input) {
  const s = String(input || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

function _pickMany(pool, seed, count = 1) {
  const arr = (Array.isArray(pool) ? pool.filter(Boolean) : []).slice();
  if (!arr.length || count <= 0) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (!arr.length) break;
    const idx = hash32(`${seed}|${i}`) % arr.length;
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

function _uniq(arr) {
  const seen = new Set();
  const out = [];
  (arr || []).forEach((v) => {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function _lowerKey(x) {
  return safeStr(x).toLowerCase().trim();
}

function _normalizePlanetKey(x) {
  const k = _lowerKey(x);
  const map = {
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
  return map[k] || k;
}

function _collectTransitTouchedPlanets(story, planetKeys) {
  const keys = Array.isArray(planetKeys) ? planetKeys : [];
  const keySet = new Set(keys);
  const touched = new Set();
  const touchPoints =
    story?.personal?.touch_points_all ||
    story?.personal?.touch_points ||
    story?.personal?.touch_points_top3 ||
    [];
  for (const tp of Array.isArray(touchPoints) ? touchPoints : []) {
    const raw = tp?.natal_body_or_point || tp?.natal_body || tp?.natal_point || tp?.natal || "";
    const nk = _normalizePlanetKey(raw);
    if (keySet.has(nk)) touched.add(nk);
  }
  return touched;
}

function _limitProseSentences(text, maxSent = 2, maxLen = 111) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const parts = s.split(/[。]+/).map((p) => p.trim()).filter(Boolean);
  const picked = parts.slice(0, maxSent).map((p) => `${p}。`);
  let out = picked.join("");
  if (out.length > maxLen) {
    out = out.slice(0, maxLen);
    if (!out.endsWith("。")) out = `${out}。`;
  }
  return out;
}

function _containsBannedTokens(text, banned = []) {
  const s = String(text || "");
  if (!s) return false;
  if (/\d+\s*°/.test(s)) return true;
  if (/orb|オーブ/i.test(s)) return true;
  if (/座/.test(s)) return true;
  for (const t of banned || []) {
    if (!t) continue;
    if (s.includes(t)) return true;
  }
  return false;
}

function _extractJsonBlock(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) return s;
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : "";
}

function _safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function _aspectToneCategory(aspectKey) {
  const k = String(aspectKey || "");
  if (k.includes("quincunx") || k.includes("semi_square") || k.includes("sesqui_square") || k.includes("semi_sextile")) return "adjust";
  if (k.includes("square") || k.includes("opposition")) return "tense";
  if (k.includes("trine") || k.includes("sextile")) return "smooth";
  if (k.includes("conjunction")) return "blend";
  if (k.includes("quintile") || k.includes("biquintile")) return "craft";
  return "smooth";
}

function _orbTier(orb) {
  const v = Number(orb);
  if (!Number.isFinite(v)) return "mid";
  if (v <= 0.6) return "tight";
  if (v <= 1.6) return "mid";
  return "wide";
}

function _pickOne(pool, seed) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return "";
  return _pickMany(arr, `${seed}|one`, 1)[0] || "";
}
function norm360(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return ((x % 360) + 360) % 360;
}

function signIndexFromLon(lon) {
  const v = norm360(lon);
  if (!Number.isFinite(v)) return null;
  return Math.floor(v / 30);
}

function extractNatalLongitudes(natalCacheDoc) {
  const d = natalCacheDoc || {};
  const out = {};

  const ALIASES = {
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
    asc: "asc",
    mc: "mc",
  };

  const normalizeKey = (k) => ALIASES[String(k || "").toLowerCase()] || String(k || "").toLowerCase();

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

  if (d.bodies && typeof d.bodies === "object") for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
  if (d.points && typeof d.points === "object") {
    for (const p of ["asc", "mc"]) if (p in d.points) putFromObj(p, d.points[p]);
  }

  const bodiesMap =
    d?.min?.bodies ||
    d?.min?.natal_positions ||
    d?.natal_positions ||
    d?.positions ||
    null;
  if (bodiesMap && typeof bodiesMap === "object") for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);

  const legacySrc = (d.min && d.min.bodies) || d.bodies_min || d.natal_bodies || null;
  if (legacySrc && typeof legacySrc === "object") for (const [k, v] of Object.entries(legacySrc)) putFromObj(k, v);

  return out;
}

function pickManyStable(arr, seed, count = 3, pickStable) {
  const pool = Array.isArray(arr) ? arr.filter(Boolean) : [];
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const cand = pickStable(pool, `${seed}|${i}`);
    if (!cand) break;
    if (used.has(cand)) {
      const alt = pool.find((x) => !used.has(x));
      if (!alt) break;
      out.push(alt);
      used.add(alt);
    } else {
      out.push(cand);
      used.add(cand);
    }
  }
  return out;
}

const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_ANSHIN,
} = require("../prompts/sora_ai_prompts");

function _stripSentenceEnd(str) {
  return String(str || "").trim().replace(/[。．\.]+$/g, "").trim();
}

function _normalizePiece(str, maxLen = 24) {
  let t = String(str || "").trim();
  if (!t) return "";
  t = t.replace(/[、，,]+/g, "、");
  t = t.replace(/[。\.]+/g, "。");
  t = t.replace(/\s+/g, " ").trim();
  t = _stripSentenceEnd(t);
  if (t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

function _isOkPiece(s) {
  if (!s) return false;
  if (/座/.test(s)) return false;
  if (/しつつ|しながら/.test(s)) return false;
  if (/アスペクト|角度|配置|影響|として|によって/.test(s)) return false;
  if (/現れやすい|表に出やすい|しやすい|やすい/.test(s)) return false;
  if (/場面で|の中で|中で|生まれる|手助け|見せる|訪れる|浮かび上がる|広がる|進む/.test(s)) return false;
  if (EXPLANATION_CONNECTORS_RE.test(s)) return false;
  if (/\d+\s*°/.test(s)) return false;
  return true;
}

function _buildPiecePool(list, minLen = 4, maxLen = 22) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  raw.forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const parts = s.includes("。") ? s.split(/[。\.]+/g) : [s];
    parts.forEach((p) => {
      const piece = _normalizePiece(p, maxLen);
      if (!piece) return;
      if (piece.length < minLen) return;
      if (!_isOkPiece(piece)) return;
      out.push(piece);
    });
  });
  return _uniq(out);
}

function _filterKwByCandidates(list, candidates) {
  if (!Array.isArray(list) || !list.length) return [];
  if (!Array.isArray(candidates) || !candidates.length) return list;
  const candSet = new Set(candidates.map(_normalizeKwToken).filter(Boolean));
  return list.filter((w) => candSet.has(_normalizeKwToken(w)));
}

function _labelCandidatesFromPacks(aPack, bPack, aspPack, seed) {
  const leftPool = []
    .concat(aPack?.tokens || [], aPack?.texture || [], aPack?.process || [])
    .concat(bPack?.tokens || [], bPack?.texture || [], bPack?.process || []);
  const rightPool = []
    .concat(aPack?.tokens || [], aPack?.texture || [], aPack?.process || [])
    .concat(bPack?.tokens || [], bPack?.texture || [], bPack?.process || [])
    .concat(aspPack?.tokens || [], aspPack?.touch || [], aspPack?.gap || [], aspPack?.rest || []);
  const left = _pickMany(
    _buildPiecePool(leftPool, 3, 18).filter(_isOkPiece),
    `${seed}|lblL`,
    6
  );
  const right = _pickMany(
    _buildPiecePool(rightPool, 3, 18).filter(_isOkPiece),
    `${seed}|lblR`,
    6
  );
  return { left, right };
}

function _keywordCandidatesFromPacks(aPack, bPack, aspPack, limit = 24) {
  const pool = []
    .concat(aPack?.tokens || [], aPack?.texture || [], aPack?.process || [])
    .concat(bPack?.tokens || [], bPack?.texture || [], bPack?.process || [])
    .concat(aspPack?.tokens || [], aspPack?.touch || [], aspPack?.gap || [], aspPack?.rest || []);
  return _uniq(_buildPiecePool(pool, 3, 18)).slice(0, limit);
}

function _fallbackLabelFromCandidates(candidates, seed) {
  const left = _pickMany(candidates?.left || [], `${seed}|l`, 1)[0] || "";
  const right = _pickMany(candidates?.right || [], `${seed}|r`, 1)[0] || "";
  if (left && right) return `【${left} × ${right}】`;
  if (left) return `【${left}】`;
  if (right) return `【${right}】`;
  return "";
}

function _isOkStatePiece(s) {
  if (!s) return false;
  if (s.length < 2) return false;
  if (/座/.test(s)) return false;
  if (/しつつ|しながら/.test(s)) return false;
  if (/アスペクト|角度|配置|影響|として|によって/.test(s)) return false;
  if (/現れやすい|表に出やすい|しやすい|やすい/.test(s)) return false;
  if (/場面で|の中で|中で|生まれる|手助け|見せる|訪れる|浮かび上がる|広がる|進む/.test(s)) return false;
  if (EXPLANATION_CONNECTORS_RE.test(s)) return false;
  if (/\d+\s*°/.test(s)) return false;
  return true;
}

function _buildStatePool(list, minLen = 2, maxLen = 12) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  raw.forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const parts = s.includes("。") ? s.split(/[。\.]+/g) : [s];
    parts.forEach((p) => {
      const piece = _normalizePiece(p, maxLen);
      if (!piece) return;
      if (piece.length < minLen) return;
      if (!_isOkStatePiece(piece)) return;
      out.push(piece);
    });
  });
  return _uniq(out);
}

function _normalizeKwToken(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function _isUsedKw(usedSet, word) {
  if (!usedSet) return false;
  const w = _normalizeKwToken(word);
  if (!w) return false;
  for (const u of usedSet) {
    const nu = _normalizeKwToken(u);
    if (!nu) continue;
    if (nu === w || nu.includes(w) || w.includes(nu)) return true;
  }
  return false;
}

function _pickDistinctKw(pool, seed, count, usedSet) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  const out = [];
  const usedLocal = new Set();
  for (let i = 0; i < count; i++) {
    if (!arr.length) break;
    const idx = hash32(`${seed}|${i}`) % arr.length;
    const cand = arr.splice(idx, 1)[0];
    if (!cand) continue;
    if (_isUsedKw(usedSet, cand)) continue;
    if (_isUsedKw(usedLocal, cand)) continue;
    out.push(cand);
    usedLocal.add(cand);
    if (usedSet instanceof Set) usedSet.add(cand);
  }
  if (out.length < count) {
    for (const cand of arr) {
      if (!cand) continue;
      if (_isUsedKw(usedSet, cand)) continue;
      if (_isUsedKw(usedLocal, cand)) continue;
      out.push(cand);
      usedLocal.add(cand);
      if (usedSet instanceof Set) usedSet.add(cand);
      if (out.length >= count) break;
    }
  }
  return out;
}

function _compactStateToken(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  t = t.replace(/[。．\.]+$/g, "");
  t = t.replace(/(が)?(出|残|見え|目立ち|続き|起き|入り|強まり|増え|浮かび|戻り)?やすい/g, "");
  t = t.replace(/しやすい/g, "");
  t = t.replace(/なりやすい/g, "");
  t = t.replace(/が/g, "");
  t = t.trim();
  return t;
}

const EXPLANATION_CONNECTORS_RE = /(の中|こと|ように|だから|ので|によって|の結果|ために|ため)/;

function _filterPhraseList(list) {
  const raw = Array.isArray(list) ? list : [];
  return _uniq(
    raw
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .filter((v) => !/[{}]/.test(v))
      .filter((v) => !/しつつ|しながら|の中で|場面で|生まれる|手助け|見せる|訪れる|浮かび上がる|広がる|進む/.test(v))
      .filter((v) => !EXPLANATION_CONNECTORS_RE.test(v))
  );
}

function _pickFirst(pool) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  return arr[0] || "";
}

function _fallbackProseFromTokens(input) {
  if (!input) return "";
  const a = _pickFirst([].concat(input?.A?.tokens || [], input?.A?.texture || []));
  const b = _pickFirst([].concat(input?.B?.tokens || [], input?.B?.texture || []));
  const asp = _pickFirst([].concat(input?.aspect?.tokens || [], input?.aspect?.touch || [], input?.aspect?.gap || [], input?.aspect?.rest || []));
  if (!a || !b || !asp) return "";
  const s1 = `${a}が手前にあり、${b}が重なる。`;
  const s2 = `${asp}が静かに残る。`;
  return _limitProseSentences(`${s1}${s2}`, 2, 111);
}

function _getSignFlavor(dict, signKey, planetKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const sign = sf?.signs?.[sKey] || null;
  const by = sign?.by_body?.[pKey] || null;
  return { sf, sign, by };
}

function _stateRoleKeysForLayer(layerKey) {
  const s = String(layerKey || "").toLowerCase();
  if (!s) return ["skeleton", "transition", "resonance"];
  return ["skeleton", "transition", "resonance"];
}

function _stateAxisPool(dict, layerKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const axes = sf?.state_axes || {};
  const roles = sf?.state_roles || {};
  const roleKeys = _stateRoleKeysForLayer(layerKey);
  let axisKeys = [];
  roleKeys.forEach((r) => {
    const list = roles?.[r] || [];
    if (Array.isArray(list)) axisKeys = axisKeys.concat(list);
  });
  if (!axisKeys.length) axisKeys = Object.keys(axes || {});
  const pool = [];
  axisKeys.forEach((k) => {
    const list = axes?.[k] || [];
    if (Array.isArray(list)) pool.push(...list);
  });
  return _uniq(pool);
}

function _collectSignPackAnshin(dict, signKey, planetKey, aspectKey, orb, layerKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const style = dict?.SOAR_STYLE_V1 || require("../../dict/soar_style.v1").SOAR_STYLE_V1;
  const tone = _aspectToneCategory(String(aspectKey || ""));
  const tier = _orbTier(orb);
  const fusion = by?.fusion || {};

  const aList = fusion.A || [];
  const bList = fusion.B || [];
  const exprList = fusion.expression || [];
  const tensionList = _filterPhraseList([by?.tension].concat(fusion.tension || []));
  const clarityList = _filterPhraseList(fusion.clarity || []);
  const tendencyList = _filterPhraseList(fusion.tendency || []);
  const processList = _filterPhraseList(fusion.process || []);

  let tokensPool = [].concat(aList, bList, exprList);
  if (tone === "tense" || tone === "adjust") tokensPool = tokensPool.concat(tensionList);
  if (tone === "smooth" || tone === "blend") tokensPool = tokensPool.concat(clarityList);
  if (tone === "craft") tokensPool = tokensPool.concat(tendencyList);

  if (tier === "tight") tokensPool = tokensPool.concat(tensionList);
  if (tier === "mid") tokensPool = tokensPool.concat(tendencyList);
  if (tier === "wide") tokensPool = tokensPool.concat(clarityList);

  const tokens = _buildPiecePool(tokensPool, 4, 22);
  const statePool = _buildStatePool(_stateAxisPool(dict, layerKey), 2, 12);

  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const texturePool = []
    .concat(style?.signs?.[sKey]?.touch || [])
    .concat(style?.signs?.[sKey]?.keywords || [])
    .concat(style?.planets?.[pKey]?.touch || []);
  const texture = _buildPiecePool(texturePool, 4, 22);

  const process = _buildPiecePool(processList, 4, 24);

  return {
    tokens: _uniq(tokens.concat(statePool)),
    texture: _uniq(texture),
    process: _uniq(process),
  };
}

function _collectCoreMeaningAnshin(dict, signKey, planetKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.role || [])
    .concat(by?.core || [])
    .concat(by?.fusion?.expression || []);
  const picked = pool
    .map((t) => _normalizePiece(t, 18))
    .filter(Boolean);
  return _uniq(picked);
}

function _collectKeywordAAnshin(dict, signKey, planetKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.fusion?.A || [])
    .concat(by?.fusion?.expression || []);
  const picked = pool
    .map((t) => _normalizePiece(t, 18))
    .filter(Boolean);
  return _uniq(picked);
}

function _collectCoreRoleTextAnshin(dict, signKey, planetKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const role = _normalizePiece(by?.role || "", 24);
  const core = _normalizePiece(by?.core || "", 24);
  return { role, core };
}

function _collectAspectPackAnshin(dict, aspectKey, orb) {
  const style = dict?.SOAR_STYLE_V1 || require("../../dict/soar_style.v1").SOAR_STYLE_V1;
  const key = String(aspectKey || "");
  const tone = _aspectToneCategory(key);
  const tier = _orbTier(orb);
  const stateAspect = style?.state_by_aspect?.[key] || {};
  const stateTone = style?.state_by_tone?.[tone] || [];
  const stateShort = style?.state_short_by_tone?.[tone] || [];
  const depthPool = tier === "tight"
    ? [].concat(stateAspect?.deep || [], stateAspect?.mid || [])
    : tier === "wide"
      ? [].concat(stateAspect?.light || [])
      : [].concat(stateAspect?.mid || [], stateAspect?.light || []);
  const touchPool = _filterPhraseList(depthPool.map(_compactStateToken)).concat(_filterPhraseList(stateShort.map(_compactStateToken)));
  const gapPool = _filterPhraseList(stateTone.map(_compactStateToken));
  const restPool = _filterPhraseList(stateShort.map(_compactStateToken));

  return {
    tokens: _buildPiecePool([].concat(touchPool, gapPool), 3, 18),
    touch: _buildPiecePool(touchPool, 3, 18),
    gap: _buildPiecePool(gapPool, 3, 18),
    rest: _buildPiecePool(restPool, 3, 18),
  };
}

function _buildBannedList(dict) {
  const PLANETS = dict?.PLANETS_V2?.bodies || {};
  const SIGNS = dict?.SIGNS_V2?.signs || {};
  const ASPECTS = {
    ...(dict?.ASPECTS_V2?.major || {}),
    ...(dict?.ASPECTS_V2?.deep_space || {}),
    ...(dict?.ASPECTS_V2?.craft_space || {}),
  };
  const banned = [
    "配置","現れやすい","表に出やすい","影響","によって","角度","アスペクト","として",
    "しやすい","やすい","試行錯誤","独自","更新","全体最適","意味づけ","状況","場面で","の中で","中で",
    "生まれる","手助け","観測","訪れる","浮かび上がる","広がる","進む","助ける","見せる","水脈",
    "ASC","MC","IC","DSC","アセンダント","ディセンダント","ミディアムコエリ","ノード","キロン","リリス",
  ];
  Object.values(PLANETS).forEach((p) => {
    if (p?.label_ja) banned.push(String(p.label_ja));
  });
  Object.values(SIGNS).forEach((s) => {
    if (s?.label_ja) banned.push(String(s.label_ja));
  });
  Object.values(ASPECTS).forEach((a) => {
    if (a?.label_ja) banned.push(String(a.label_ja));
  });
  return _uniq(banned);
}
function renderAnshinLineLegacy(payload, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const PLANETS = dict?.PLANETS_V2 || dict?.PLANETS || {};
  const SIGNS = dict?.SIGNS_V2 || dict?.SIGNS || {};
  const ANSHIN = dict?.ANSHIN_V1 || require("../../dict/anshin.v1").ANSHIN_V1;

  const story = payload?.story || null;
  const dateLabel = toDotDate(payload?.meta?.date_local || story?.meta?.date_local);
  const natalCache = payload?.natal_cache || payload?.natal || null;

  if (!natalCache) {
    return [
      "🫧 未接触ネイタル",
      "（ネイタルが未登録だった🙏「はじめる」で登録してね）",
    ].join("\n");
  }

  const longitudes = extractNatalLongitudes(natalCache);
  const basePlanetKeys = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];
  const excludeFromKyou = (() => {
    const top3 = Array.isArray(story?.personal?.touch_points_top3)
      ? story.personal.touch_points_top3
      : (Array.isArray(story?.personal?.touch_points_all)
        ? story.personal.touch_points_all.slice(0, 3)
        : []);
    const set = new Set();
    top3.forEach((tp) => {
      const k = String(tp?.natal_body_or_point || tp?.natal_body || "").toLowerCase();
      if (k) set.add(k);
    });
    return set;
  })();
  let planetKeys = basePlanetKeys.filter((p) => !excludeFromKyou.has(p));
  if (!planetKeys.length) planetKeys = basePlanetKeys;

  const elementWeight = { earth: 3, water: 2, air: 1, fire: 1, unknown: 0 };
  const modalityWeight = { fixed: 3, cardinal: 1, mutable: 1, unknown: 0 };
  const planetWeight = {
    saturn: 6,
    sun: 5,
    moon: 4,
    venus: 4,
    mercury: 2,
    mars: 2,
    jupiter: 2,
    uranus: 1,
    neptune: 1,
    pluto: 1,
  };
  const order = planetKeys;

  function buildAspectList() {
    const A = dict?.ASPECTS_V2 || {};
    const out = [];
    const groups = [A.major, A.deep_space, A.craft_space].filter(Boolean);
    for (const g of groups) {
      for (const [k, v] of Object.entries(g || {})) {
        const deg = Number(v?.deg ?? v?.angle_deg);
        if (!Number.isFinite(deg)) continue;
        out.push({ type: String(k), deg });
      }
    }
    return out;
  }

  const ASPECT_LIST = buildAspectList();
  const normalizeAspectType = deps?.normalizeAspectType || ((x) => String(x || ""));

  function absAngularDistance(a, b) {
    const x = Math.abs(norm360(a) - norm360(b));
    return x > 180 ? 360 - x : x;
  }

  function bestAspectForDistance(dist, list, orbMax = 6) {
    let best = null;
    for (const a of list) {
      const delta = Math.abs(dist - a.deg);
      if (delta <= orbMax && (!best || delta < best.delta)) {
        best = { type: a.type, aspect_deg: a.deg, delta };
      }
    }
    return best;
  }

  const aspectWeight = {
    conjunction: 1.2,
    trine: 1.4,
    sextile: 1.0,
    square: -1.0,
    opposition: -1.0,
    quincunx_150: -0.8,
    semi_square_45: -0.5,
    sesqui_square_135: -0.6,
    semi_sextile_30: 0.4,
    quintile_72: 0.6,
    biquintile_144: 0.7,
    novile_40: 0.5,
    binovile_80: 0.6,
    quadranovile_160: 0.6,
    decile_36: 0.5,
    tridecile_108: 0.6,
  };

  function aspectScore(type, delta, orbMax, scale = 1) {
    const t = normalizeAspectType(type);
    const w = aspectWeight[t] ?? 0;
    const closeness = Math.max(0, 1 - (delta / orbMax));
    return w * closeness * scale;
  }

  const natalAspects = [];
  for (let i = 0; i < planetKeys.length; i++) {
    const a = planetKeys[i];
    const lonA = longitudes[a];
    if (!Number.isFinite(lonA)) continue;
    for (let j = i + 1; j < planetKeys.length; j++) {
      const b = planetKeys[j];
      const lonB = longitudes[b];
      if (!Number.isFinite(lonB)) continue;
      const dist = absAngularDistance(lonA, lonB);
      const best = bestAspectForDistance(dist, ASPECT_LIST, 6);
      if (!best) continue;
      natalAspects.push({ a, b, ...best });
    }
  }

  const transitTouches = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const placements = [];
  for (const pk of planetKeys) {
    const lon = longitudes[pk];
    if (!Number.isFinite(lon)) continue;
    const idx = signIndexFromLon(lon);
    if (!Number.isFinite(idx)) continue;
    const signKey = deps?.signKeyFromIndex ? deps.signKeyFromIndex(idx) : null;
    const signJa = deps?.signJaFromIndex ? deps.signJaFromIndex(idx) : null;
    const signMeta = deps?.signMeta ? deps.signMeta(signKey) : null;

    const el = String(signMeta?.element || "unknown");
    const mo = String(signMeta?.modality || "unknown");
    const baseScore =
      (elementWeight[el] || 0) +
      (modalityWeight[mo] || 0) +
      (planetWeight[pk] || 0) +
      ((el === "earth" && mo === "fixed") ? 1 : 0);

    let aspectScoreSum = 0;
    for (const asp of natalAspects) {
      if (asp.a !== pk && asp.b !== pk) continue;
      aspectScoreSum += aspectScore(asp.type, asp.delta, 6, 1);
    }

    let transitScoreSum = 0;
    for (const tp of transitTouches) {
      const nKey = String(tp?.natal_body_or_point || "").toLowerCase();
      if (nKey !== pk) continue;
      const tType = tp?.aspect || tp?.aspect_type || tp?.type || "";
      const d = Number(tp?.orb_deg ?? 99);
      if (!Number.isFinite(d)) continue;
      transitScoreSum += aspectScore(tType, d, 6, 0.6);
    }

    placements.push({
      planetKey: pk,
      planetJa: PLANETS?.bodies?.[pk]?.label_ja || pk,
      signKey,
      signJa: signJa || signMeta?.label_ja || signKey || "",
      signCore: signMeta?.core || "",
      signFlavor: signMeta?.flavor || "",
      element: el,
      modality: mo,
      score: baseScore + aspectScoreSum + transitScoreSum,
    });
  }

  if (!placements.length) {
    return [
      "🫧 未接触ネイタル",
      "（ネイタルの位置情報が見つからなかった🙏）",
    ].join("\n");
  }

  placements.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return order.indexOf(a.planetKey) - order.indexOf(b.planetKey);
  });

  const top = placements.slice(0, 3);

  const intro = (ANSHIN?.intro_lines || [
    "🫧 未接触ネイタル｜{date}",
    "揺らされにくい領域の構造。",
    "評価せず、残り方だけを置く。",
  ])
    .map((l) => String(l || "").replace("{date}", dateLabel || ""))
    .join("\n")
    .trim() + "\n";

  const blocks = top.map((p, i) => {
    const planet = PLANETS?.bodies?.[p.planetKey] || {};
    const pCore = planet?.core || "";
    const pRole = planet?.role || planet?.core || "";
    const sCore = p.signCore || "";
    const sFlavor = p.signFlavor || "";
    const sPhrase =
      (ANSHIN?.sign_phrase && ANSHIN.sign_phrase[p.signKey]) ||
      (sFlavor ? String(sFlavor || "").replace(/[。．\.]+$/g, "") : sCore);
    const residue =
      (ANSHIN?.planet_residue && ANSHIN.planet_residue[p.planetKey]) ||
      `${pRole}が残りやすい領域`;
    const summaryMap = ANSHIN?.summary_by_sign_planet || {};
    const summaryLine = summaryMap?.[p.signKey]?.[p.planetKey] || "";

    const summary = summaryLine
      ? `${summaryLine}`
      : (sPhrase ? `${sPhrase}に、${residue}。` : `${sCore}に、${residue}。`);

    const emoji = (ANSHIN?.planet_emoji && ANSHIN.planet_emoji[p.planetKey]) || "🪐";
    const lines = [];
    lines.push(`${emoji}${p.planetJa}（${p.signJa}）`);
    lines.push(summary);
    return lines.join("\n");
  });

  const tail = (ANSHIN?.tail_lines || [
    "",
    "ここがあるから、揺れないわけでもない。",
    "ただ、崩れない理由になりやすい場所。",
    "",
    "安心とは感情ではなく、",
    "残り方の構造である。🪐✨️",
  ])
    .map((l) => String(l || ""))
    .join("\n");

  return [intro, blocks.join("\n\n"), tail].join("\n").trim();
}

async function renderAnshinLine(payload, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const PLANETS = dict?.PLANETS_V2 || dict?.PLANETS || {};
  const SIGNS = dict?.SIGNS_V2 || dict?.SIGNS || {};
  const ANSHIN = dict?.ANSHIN_V1 || require("../../dict/anshin.v1").ANSHIN_V1;

  const aiFlagSet = process.env.LINE_AI_ENABLED !== undefined;
  const aiEnabled = aiFlagSet ? boolishEnv(process.env.LINE_AI_ENABLED) : true;
  if (!aiEnabled) return renderAnshinLineLegacy(payload, deps);

  const story = payload?.story || null;
  const dateLabel = toDotDate(payload?.meta?.date_local || story?.meta?.date_local);
  const natalCache = payload?.natal_cache || payload?.natal || null;

  if (!natalCache) {
    return [
      "🫧 未接触ネイタル",
      "（ネイタルが未登録だった🙏「はじめる」で登録してね）",
    ].join("\n");
  }

  const longitudes = extractNatalLongitudes(natalCache);
  const planetKeys = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];

  const buildAspectList = () => {
    const A = dict?.ASPECTS_V2 || {};
    const out = [];
    const groups = [A.major, A.deep_space, A.craft_space].filter(Boolean);
    for (const g of groups) {
      for (const [k, v] of Object.entries(g || {})) {
        const deg = Number(v?.deg ?? v?.angle_deg);
        if (!Number.isFinite(deg)) continue;
        out.push({ type: String(k), deg });
      }
    }
    return out;
  };
  const ASPECT_LIST = buildAspectList();
  const normalizeAspectType = deps?.normalizeAspectType || ((x) => String(x || ""));

  const ASPECTS_META = {
    ...(dict?.ASPECTS_V2?.major || {}),
    ...(dict?.ASPECTS_V2?.deep_space || {}),
    ...(dict?.ASPECTS_V2?.craft_space || {}),
  };

  function absAngularDistance(a, b) {
    const x = Math.abs(norm360(a) - norm360(b));
    return x > 180 ? 360 - x : x;
  }

  function bestAspectForDistance(dist, list, orbMax = 6) {
    let best = null;
    for (const a of list) {
      const delta = Math.abs(dist - a.deg);
      if (delta <= orbMax && (!best || delta < best.delta)) {
        best = { type: a.type, aspect_deg: a.deg, delta };
      }
    }
    return best;
  }

  const majorAspectKeys = new Set(["conjunction","opposition","square","trine","sextile"]);
  const MAJOR_ASPECT_LIST = ASPECT_LIST.filter((a) =>
    majorAspectKeys.has(normalizeAspectType(a.type))
  );
  const majorOrb = 6;

  const angleLongitudes = {};
  if (Number.isFinite(longitudes.asc)) {
    angleLongitudes.asc = longitudes.asc;
    angleLongitudes.dsc = norm360(longitudes.asc + 180);
  }
  if (Number.isFinite(longitudes.mc)) {
    angleLongitudes.mc = longitudes.mc;
    angleLongitudes.ic = norm360(longitudes.mc + 180);
  }

  const majorHits = new Map();
  const addMajorHit = (p, delta) => {
    const cur = majorHits.get(p) || { count: 0, minOrb: 99 };
    cur.count += 1;
    cur.minOrb = Math.min(cur.minOrb, delta);
    majorHits.set(p, cur);
  };

  for (let i = 0; i < planetKeys.length; i++) {
    const a = planetKeys[i];
    const lonA = longitudes[a];
    if (!Number.isFinite(lonA)) continue;
    for (let j = i + 1; j < planetKeys.length; j++) {
      const b = planetKeys[j];
      const lonB = longitudes[b];
      if (!Number.isFinite(lonB)) continue;
      const dist = absAngularDistance(lonA, lonB);
      const best = bestAspectForDistance(dist, MAJOR_ASPECT_LIST, majorOrb);
      if (!best) continue;
      addMajorHit(a, best.delta);
      addMajorHit(b, best.delta);
    }
    for (const [angKey, angLon] of Object.entries(angleLongitudes)) {
      if (!Number.isFinite(angLon)) continue;
      const dist = absAngularDistance(lonA, angLon);
      const best = bestAspectForDistance(dist, MAJOR_ASPECT_LIST, majorOrb);
      if (!best) continue;
      addMajorHit(a, best.delta);
    }
  }

  const isolated = planetKeys.filter((p) => !majorHits.has(p));
  const weak = planetKeys.filter((p) => {
    if (isolated.includes(p)) return false;
    const hit = majorHits.get(p);
    if (!hit) return true;
    return hit.count <= 1 && hit.minOrb >= 4;
  });
  const transitTouched = _collectTransitTouchedPlanets(story, planetKeys);
  const isolatedQuiet = isolated.filter((p) => !transitTouched.has(p));
  const weakQuiet = weak.filter((p) => !transitTouched.has(p));
  const banned = _buildBannedList(dict);

  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || "";
  const { createChatCompletion } = require("../blog/openai_client");

  async function generateAnshinLines(input) {
    if (!input) return null;
    for (let i = 0; i < 3; i++) {
      try {
        const raw = await createChatCompletion({
          apiKey,
          baseUrl,
          model,
          temperature: 0.4,
          maxTokens: 220,
          messages: [
            { role: "system", content: SORA_AI_SYSTEM_PROMPT_COMMON },
            { role: "user", content: `${SORA_AI_USER_GUIDE_ANSHIN}\n\nINPUT:\n${JSON.stringify(input)}` },
          ],
        });
        const jsonText = _extractJsonBlock(raw);
        const parsed = _safeJsonParse(jsonText || raw);
        const lines = parsed && typeof parsed === "object" && Array.isArray(parsed.lines)
          ? parsed.lines
          : [];
        const keywords = parsed && typeof parsed === "object" && Array.isArray(parsed.keywords)
          ? parsed.keywords
          : [];
        const cleanLines = lines
          .map((v) => _limitProseSentences(String(v || ""), 1, 70).replace(/。$/, "。"))
          .filter(Boolean)
          .slice(0, 2);
        if (cleanLines.length < 2) continue;
        if (_containsBannedTokens(cleanLines.join(""), input?.banned || banned)) continue;
        return { lines: cleanLines, keywords };
      } catch (_) {
        // retry
      }
    }
    return null;
  }

  const pickSignKey = (lon) => {
    const idx = signIndexFromLon(lon);
    return Number.isFinite(idx) && deps?.signKeyFromIndex ? deps.signKeyFromIndex(idx) : null;
  };

  const renderIsolatedBlock = async (planetKey, seed) => {
    const lon = longitudes[planetKey];
    const signKey = pickSignKey(lon);
    const signJa =
      deps?.signJaFromIndex && Number.isFinite(signIndexFromLon(lon))
        ? deps.signJaFromIndex(signIndexFromLon(lon))
        : (SIGNS?.signs?.[_lowerKey(signKey)]?.label_ja || "");
    const pJa = PLANETS?.bodies?.[planetKey]?.label_ja || planetKey;
    const emoji = (ANSHIN?.planet_emoji && ANSHIN.planet_emoji[planetKey]) || "🪐";
    const signPhrase = (ANSHIN?.sign_phrase && ANSHIN.sign_phrase[_lowerKey(signKey)]) || "";
    const residue = (ANSHIN?.planet_residue && ANSHIN.planet_residue[planetKey]) || "";
    const { role: roleText, core: coreText } = _collectCoreRoleTextAnshin(dict, signKey, planetKey);
    const isoPhrase = _pickOne(ANSHIN?.isolated_phrases, `${seed}|iso`) || "絡みの薄い場所に残る。";
    const corePieces = _collectCoreMeaningAnshin(dict, signKey, planetKey);
    const keywordCandidates = _collectKeywordAAnshin(dict, signKey, planetKey);
    const input = {
      date_local: dateLabel,
      role_text: roleText,
      core_text: coreText,
      planet_simple: residue,
      sign_simple: signPhrase,
      sign_flavor: corePieces,
      phrase_pool: ANSHIN?.isolated_phrases || [],
      keyword_candidates: keywordCandidates,
      fallback_keywords: keywordCandidates,
      banned,
      seed,
    };

    const ai = await generateAnshinLines(input);
    const fallbackLine1 = roleText && coreText
      ? `${roleText}に、${coreText}。`
      : (roleText ? `${roleText}。` : (coreText ? `${coreText}。` : (residue ? `${residue}。` : "他と絡まれずに残っている。")));
    const fallbackLine2 = isoPhrase;
    const lines = ai?.lines?.length >= 2 ? ai.lines.slice(0, 2) : [fallbackLine1, fallbackLine2];
    const kwFromAi = _filterKwByCandidates(ai?.keywords || [], keywordCandidates);
    const kwFinal = (() => {
      const base = _uniq(kwFromAi);
      if (base.length >= 3) return base.slice(0, 3);
      const extra = _pickDistinctKw(keywordCandidates, `${seed}|kw`, 3 - base.length, null);
      return _uniq(base.concat(extra)).slice(0, 3);
    })();

    return [
      `${emoji}${pJa}（${signJa}）`,
      `→ ${lines[0]}`,
      lines[1],
      kwFinal.length ? `\nKeyWord：\n${kwFinal.join(" / ")}` : "",
    ].filter(Boolean).join("\n");
  };

  if (isolatedQuiet.length) {
    const picks = _pickMany(isolatedQuiet, `${dateLabel}|anshin|isolated`, Math.min(3, isolatedQuiet.length));
    const blocks = await Promise.all(picks.map((p, i) => renderIsolatedBlock(p, `${dateLabel}|isolated|${p}|${i}`)));
    return [
      `🫧 あんしんネイタル｜${dateLabel}`,
      "",
      "未接触の星",
      "",
      blocks.join("\n\n"),
      "",
      ...(ANSHIN?.tail_lines || [
        "安心とは感情ではなく、",
        "残り方の構造である。🪐✨️",
      ]),
    ].join("\n").trim();
  }

  if (weakQuiet.length) {
    const picks = _pickMany(weakQuiet, `${dateLabel}|anshin|weak`, Math.min(3, weakQuiet.length));
    const blocks = await Promise.all(picks.map((p, i) => renderIsolatedBlock(p, `${dateLabel}|weak|${p}|${i}`)));
    return [
      `🫧 あんしんネイタル｜${dateLabel}`,
      "",
      "未接触の星",
      "",
      blocks.join("\n\n"),
      "",
      ...(ANSHIN?.tail_lines || [
        "安心とは感情ではなく、",
        "残り方の構造である。🪐✨️",
      ]),
    ].join("\n").trim();
  }

  return [
    `🫧 あんしんネイタル｜${dateLabel}`,
    "",
    "未接触の星が見当たらない。",
    "",
    ...(ANSHIN?.tail_lines || [
      "安心とは感情ではなく、",
      "残り方の構造である。🪐✨️",
    ]),
  ].join("\n").trim();
}

module.exports = { renderAnshinLine };
