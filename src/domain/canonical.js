"use strict";

const normToken = (input) => {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/[.\u3000]/g, " ")
    .replace(/[\s/]+/g, "_")
    .replace(/[()]/g, "")
    .trim();
};

const buildAliasMap = (entries) => {
  const map = new Map();
  entries.forEach(({ key, aliases }) => {
    const canon = normToken(key);
    map.set(canon, canon);
    (aliases || []).forEach((alias) => {
      const k = normToken(alias);
      if (k) map.set(k, canon);
    });
  });
  return map;
};

const BODY_ALIAS_MAP = buildAliasMap([
  { key: "sun", aliases: ["sol", "☉", "太陽"] },
  { key: "moon", aliases: ["luna", "☽", "月"] },
  { key: "mercury", aliases: ["☿", "水星"] },
  { key: "venus", aliases: ["♀", "金星"] },
  { key: "mars", aliases: ["♂", "火星"] },
  { key: "jupiter", aliases: ["♃", "木星"] },
  { key: "saturn", aliases: ["♄", "土星"] },
  { key: "uranus", aliases: ["♅", "天王星"] },
  { key: "neptune", aliases: ["♆", "海王星"] },
  { key: "pluto", aliases: ["♇", "冥王星"] },
  { key: "chiron", aliases: ["⚷", "キロン"] },
  { key: "lilith", aliases: ["⚸", "ブラックムーン", "黒い月", "black_moon", "mean_apog", "meanapog"] },
  {
    key: "north_node",
    aliases: ["☊", "true_node", "mean_node", "ascending_node", "northnode", "nnode", "ドラゴンヘッド", "龍頭"],
  },
  {
    key: "south_node",
    aliases: ["☋", "descending_node", "southnode", "snode", "ドラゴンテイル", "龍尾"],
  },
  { key: "asc", aliases: ["ascendant", "ascn", "ac"] },
  { key: "mc", aliases: ["midheaven", "medium_coeli", "medium coeli", "m.c."] },
  { key: "ic", aliases: ["imum_coeli", "imum coeli", "i.c."] },
  { key: "dc", aliases: ["desc", "descendant", "dsc"] },
  { key: "vertex", aliases: ["vert"] },
  { key: "anti_vertex", aliases: ["antivertex", "anti-vertex", "anti vertex", "anti_vert", "antivert", "anti-vert"] },
  {
    key: "part_of_fortune",
    aliases: [
      "part of fortune",
      "partoffortune",
      "fortune",
      "pof",
      "pars_fortunae",
      "pars fortunae",
      "pars_fortuna",
      "lot of fortune",
      "lot_of_fortune",
    ],
  },
  { key: "east_point", aliases: ["eastpoint", "east point", "ep"] },
]);

const SIGN_ALIAS_MAP = buildAliasMap([
  { key: "aries", aliases: ["♈", "おひつじ座", "牡羊座", "ari"] },
  { key: "taurus", aliases: ["♉", "おうし座", "牡牛座", "tau"] },
  { key: "gemini", aliases: ["♊", "ふたご座", "双子座", "gem"] },
  { key: "cancer", aliases: ["♋", "かに座", "蟹座", "can"] },
  { key: "leo", aliases: ["♌", "しし座", "獅子座", "leo"] },
  { key: "virgo", aliases: ["♍", "おとめ座", "乙女座", "vir"] },
  { key: "libra", aliases: ["♎", "てんびん座", "天秤座", "lib"] },
  { key: "scorpio", aliases: ["♏", "さそり座", "蠍座", "sco"] },
  { key: "sagittarius", aliases: ["♐", "いて座", "射手座", "sag"] },
  { key: "capricorn", aliases: ["♑", "やぎ座", "山羊座", "cap"] },
  { key: "aquarius", aliases: ["♒", "みずがめ座", "水瓶座", "aqu"] },
  { key: "pisces", aliases: ["♓", "うお座", "魚座", "pis"] },
]);

const ASPECT_ALIAS_MAP = buildAliasMap([
  { key: "conjunction", aliases: ["conj", "合", "コンジャンクション", "0", "0°"] },
  { key: "sextile", aliases: ["sext", "セクスタイル", "60", "60°"] },
  { key: "square", aliases: ["sqr", "スクエア", "90", "90°"] },
  { key: "trine", aliases: ["tri", "トライン", "120", "120°"] },
  { key: "opposition", aliases: ["oppo", "オポジション", "180", "180°"] },
  { key: "semi_sextile_30", aliases: ["semi_sextile", "セミセクスタイル", "30", "30°"] },
  { key: "semi_square_45", aliases: ["semi_square", "セミスクエア", "45", "45°"] },
  { key: "sesqui_square_135", aliases: ["sesqui_square", "sesquiquadrate", "セスキスクエア", "135", "135°"] },
  { key: "quincunx_150", aliases: ["quincunx", "inconjunct", "インコンジャンクト", "150", "150°"] },
  { key: "quintile_72", aliases: ["quintile", "クインタイル", "72", "72°"] },
  { key: "biquintile_144", aliases: ["biquintile", "バイクインタイル", "144", "144°"] },
  { key: "novile_40", aliases: ["novile", "ノヴィル", "40", "40°"] },
  { key: "binovile_80", aliases: ["binovile", "ビノヴィル", "80", "80°"] },
  { key: "quadranovile_160", aliases: ["quadranovile", "クアドラノヴィル", "160", "160°"] },
  { key: "decile_36", aliases: ["decile", "デサイル", "36", "36°"] },
  { key: "tridecile_108", aliases: ["tridecile", "トライデサイル", "108", "108°"] },
]);

const ASPECT_DEG_MAP = new Map([
  [0, "conjunction"],
  [60, "sextile"],
  [90, "square"],
  [120, "trine"],
  [180, "opposition"],
  [30, "semi_sextile_30"],
  [45, "semi_square_45"],
  [135, "sesqui_square_135"],
  [150, "quincunx_150"],
  [72, "quintile_72"],
  [144, "biquintile_144"],
  [40, "novile_40"],
  [80, "binovile_80"],
  [160, "quadranovile_160"],
  [36, "decile_36"],
  [108, "tridecile_108"],
]);

function normalizeAngleDeg(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function normalizeBodyKey(input) {
  const norm = normToken(input);
  return BODY_ALIAS_MAP.get(norm) || norm;
}

function normalizeSignKey(input) {
  const norm = normToken(input);
  return SIGN_ALIAS_MAP.get(norm) || norm;
}

function normalizeAspectKey(input, aspectDeg = null) {
  const deg = Number.isFinite(Number(aspectDeg)) ? Math.round(Number(aspectDeg)) : null;
  if (deg != null && ASPECT_DEG_MAP.has(deg)) return ASPECT_DEG_MAP.get(deg);
  const norm = normToken(input);
  if (!norm && deg != null && ASPECT_DEG_MAP.has(deg)) return ASPECT_DEG_MAP.get(deg);
  return ASPECT_ALIAS_MAP.get(norm) || norm;
}

function normalizeHouse(input) {
  if (input === null || input === undefined) return null;
  if (Number.isFinite(Number(input))) {
    const n = Number(input);
    return n >= 1 && n <= 12 ? n : null;
  }
  const raw = String(input || "");
  const m = raw.match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

function normalizeRetro(input) {
  if (input === true) return true;
  if (input === false || input === null || input === undefined) return false;
  const norm = normToken(input);
  return norm === "r" || norm === "retro" || norm === "retrograde" || norm === "rx" || norm === "逆行";
}

function canonicalizeTouchPoint(tp = {}) {
  const out = { ...tp };
  const aspectDeg = Number.isFinite(Number(tp?.aspect_deg)) ? Number(tp.aspect_deg) : null;

  out.transit_body = normalizeBodyKey(tp?.transit_body || tp?.b || tp?.transit || tp?.body_transit || "");
  out.natal_body_or_point = normalizeBodyKey(tp?.natal_body_or_point || tp?.natal_body || tp?.a || tp?.natal || "");

  out.a = normalizeBodyKey(tp?.a || tp?.natal_body_or_point || tp?.natal_body || "");
  out.b = normalizeBodyKey(tp?.b || tp?.transit_body || tp?.transit || "");

  out.transit_sign_key = normalizeSignKey(tp?.transit_sign_key || tp?.transit_sign || "");
  out.natal_sign_key = normalizeSignKey(tp?.natal_sign_key || tp?.natal_sign || "");

  out.aspect = normalizeAspectKey(tp?.aspect || tp?.type || tp?.aspectType || tp?.aspect_label_ja || "", aspectDeg);
  out.aspect_deg = aspectDeg != null ? aspectDeg : tp?.aspect_deg;

  out.house_focus = normalizeHouse(tp?.house_focus ?? tp?.house ?? tp?.house_no ?? tp?.house_num ?? null);

  return out;
}

module.exports = {
  normalizeBodyKey,
  normalizeSignKey,
  normalizeAspectKey,
  normalizeHouse,
  normalizeRetro,
  normalizeAngleDeg,
  canonicalizeTouchPoint,
};
