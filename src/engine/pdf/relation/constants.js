"use strict";

const COLOR_A = "#F59E0B"; // orange
const COLOR_B = "#14B8A6"; // greenish blue
const ELEMENT_COLORS = {
  fire: "#FF6B6B",
  earth: "#E6C36D",
  air: "#7FBF8F",
  water: "#7AA7FF",
};
const ELEMENT_HUES = {
  fire: 0,
  earth: 40,
  air: 120,
  water: 200,
};
const BAND_TITLE = "RELATION BLUEPRINT";

const ASPECT_COLORS = {
  conjunction: "#E5E7EB",
  opposition: "#F43F5E",
  square: "#F97316",
  trine: "#3B82F6",
  sextile: "#22D3EE",
};

const ELEMENT_LABELS = {
  fire: "火",
  earth: "地",
  air: "風",
  water: "水",
};

const MODALITY_LABELS = {
  cardinal: "活動",
  fixed: "固定",
  mutable: "柔軟",
};

const SIGN_MODALITY = {
  aries: "cardinal",
  taurus: "fixed",
  gemini: "mutable",
  cancer: "cardinal",
  leo: "fixed",
  virgo: "mutable",
  libra: "cardinal",
  scorpio: "fixed",
  sagittarius: "mutable",
  capricorn: "cardinal",
  aquarius: "fixed",
  pisces: "mutable",
};

const SAME_BODY_KEYS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

const ASPECT_DISPLAY = {
  conjunction: { symbol: "☌", ja: "コンジャンクション" },
  opposition: { symbol: "☍", ja: "オポジション" },
  square: { symbol: "□", ja: "スクエア" },
  trine: { symbol: "△", ja: "トライン" },
  sextile: { symbol: "✶", ja: "セクスタイル" },
  quincunx: { symbol: "◇", ja: "クインカンクス" },
  semisextile: { symbol: "∿", ja: "セミセクスタイル" },
  semisquare: { symbol: "⌒", ja: "セミスクエア" },
  sesquiquadrate: { symbol: "⌒̶", ja: "セスキスクエア" },
  quintile: { symbol: "☆", ja: "クインタイル" },
  biquintile: { symbol: "✦", ja: "バイクインタイル" },
  novile: { symbol: "○", ja: "ノヴィル" },
  binovile: { symbol: "◎", ja: "バイノヴィル" },
  quadnovile: { symbol: "◉", ja: "クアドラノヴィル" },
  septile: { symbol: "※", ja: "セプタイル系" },
  biseptile: { symbol: "※", ja: "セプタイル系" },
  triseptile: { symbol: "※", ja: "セプタイル系" },
  decile: { symbol: "▽", ja: "デシル" },
  tridecile: { symbol: "△̶", ja: "トリデシル" },
};

const SIGN_ELEMENT = {
  aries: "fire",
  taurus: "earth",
  gemini: "air",
  cancer: "water",
  leo: "fire",
  virgo: "earth",
  libra: "air",
  scorpio: "water",
  sagittarius: "fire",
  capricorn: "earth",
  aquarius: "air",
  pisces: "water",
};

const SIGN_ORDER = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

const SIGN_RELATION_LABELS = {
  same_sign: "同サイン",
  opposite_sign: "対向",
  same_element: "同元素",
  square_element: "スクエア帯",
  quincunx_like: "噛み合いにくさ",
  adjacent: "隣接",
  other: "非接続",
};

const SIGN_RELATION_SYMBOLS = {
  same_sign: "☌",
  opposite_sign: "☍",
  same_element: "△",
  square_element: "□",
  quincunx_like: "◇",
  adjacent: "∿",
  other: "",
};

const RELATION_GLYPHS = [
  "☉", "☽", "☿", "♀", "♂", "♃", "♄", "♅", "♆", "♇",
  "☊", "☋", "⚷", "⚸",
  "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓",
];

const OPPOSITE_SIGN = {
  aries: "libra",
  taurus: "scorpio",
  gemini: "sagittarius",
  cancer: "capricorn",
  leo: "aquarius",
  virgo: "pisces",
  libra: "aries",
  scorpio: "taurus",
  sagittarius: "gemini",
  capricorn: "cancer",
  aquarius: "leo",
  pisces: "virgo",
};

const HOUSE_BANDS = [
  { key: "inner", label: "内側帯", houses: [1, 2, 3, 4] },
  { key: "relation", label: "対人帯", houses: [5, 6, 7, 8] },
  { key: "outer", label: "社会帯", houses: [9, 10, 11, 12] },
];

const WHEEL_BODIES = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const BODY_SHORT_LABELS = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dc: "DC",
  north_node: "☊",
  south_node: "☋",
  chiron: "⚷",
  lilith: "⚸",
};

const AXIS_SYMBOLS = {
  asc: "▲",
  dc: "▼",
  mc: "◆",
  ic: "◇",
};

const RELATION_TYPE_LABELS = {
  mirror: "鏡",
  merge: "同調",
  flow: "流れ",
  tension: "張力",
  mismatch: "噛み合い",
  layered: "層",
  house_binding: "流入",
};

const HOUSE_LABELS = {
  1: "自己・起点",
  2: "価値・感覚",
  3: "思考・言語",
  4: "基盤・安心",
  5: "表現・創造",
  6: "習慣・調整",
  7: "対面・関係",
  8: "共有・結束",
  9: "信念・拡張",
  10: "役割・社会",
  11: "交流・共同",
  12: "無意識・背景",
};

const HOUSE_BODY_WEIGHT = {
  sun: 3,
  moon: 3,
  asc: 3,
  mercury: 2,
  venus: 2,
  mars: 2,
  jupiter: 1.5,
  saturn: 1.5,
  uranus: 1,
  neptune: 1,
  pluto: 1,
  north_node: 0.8,
  south_node: 0.8,
  chiron: 0.8,
  lilith: 0.8,
};

const AXIS_BODIES = new Set(["asc", "mc", "ic", "dc"]);
const DEEP_BODIES = new Set(["north_node", "south_node", "chiron", "lilith"]);
const CORE_BODIES = new Set([
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
]);

const BODY_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "asc",
  "dc",
  "mc",
  "ic",
  "north_node",
  "south_node",
  "chiron",
  "lilith",
];

const BODY_ORDER_MAP = new Map(BODY_ORDER.map((key, idx) => [key, idx]));

const MAX_ROWS_PER_COL = 18;

const CORE_PAIR_KEYS = new Set([
  "sun_moon",
  "moon_moon",
  "moon_venus",
  "venus_mars",
  "mercury_moon",
  "sun_asc",
  "moon_asc",
]);

const COMM_PAIR_KEYS = new Set([
  "mercury_mercury",
  "mercury_moon",
  "sun_mercury",
  "moon_moon",
  "moon_venus",
  "mercury_jupiter",
  "moon_jupiter",
]);

const ATTRACTION_PAIR_KEYS = new Set([
  "venus_mars",
  "venus_venus",
  "mars_mars",
  "sun_venus",
  "moon_mars",
  "venus_jupiter",
  "mars_jupiter",
  "sun_jupiter",
]);

const FRICTION_PAIR_KEYS = new Set([
  "moon_saturn",
  "venus_saturn",
  "mercury_mars",
  "moon_pluto",
  "mars_mars",
  "jupiter_jupiter",
]);

const SOFT_ASPECTS = new Set(["conjunction", "trine", "sextile"]);
const HARD_ASPECTS = new Set(["square", "opposition", "quincunx"]);

const PAIR_PRIORITY = {
  sun_moon: 10,
  moon_moon: 8,
  moon_venus: 7,
  venus_mars: 7,
  mercury_moon: 6,
  sun_asc: 6,
  moon_asc: 6,
  sun_north_node: 7,
  moon_north_node: 7,
  asc_north_node: 7,
  sun_south_node: 6,
  moon_south_node: 6,
  asc_south_node: 6,
  sun_jupiter: 6,
  moon_jupiter: 6,
  venus_jupiter: 6,
  mercury_jupiter: 5,
};

const BODY_PRIORITY = {
  sun: 6,
  moon: 6,
  mercury: 4,
  venus: 4,
  mars: 4,
  asc: 4,
  dc: 3,
  mc: 3,
  ic: 3,
  north_node: 4,
  south_node: 4,
  jupiter: 3,
  saturn: 3,
  pluto: 2,
  uranus: 1,
  neptune: 1,
  chiron: 2,
  lilith: 2,
};

const ASPECT_WEIGHT = {
  conjunction: 6,
  trine: 4,
  sextile: 3,
  square: 2,
  opposition: 2,
  quincunx: 1,
  same_sign: 4,
  same_element: 2,
};

module.exports = {
  COLOR_A,
  COLOR_B,
  ELEMENT_COLORS,
  ELEMENT_HUES,
  BAND_TITLE,
  ASPECT_COLORS,
  ELEMENT_LABELS,
  MODALITY_LABELS,
  SIGN_MODALITY,
  SAME_BODY_KEYS,
  ASPECT_DISPLAY,
  SIGN_ELEMENT,
  SIGN_ORDER,
  SIGN_RELATION_LABELS,
  SIGN_RELATION_SYMBOLS,
  RELATION_GLYPHS,
  OPPOSITE_SIGN,
  HOUSE_BANDS,
  WHEEL_BODIES,
  BODY_SHORT_LABELS,
  AXIS_SYMBOLS,
  RELATION_TYPE_LABELS,
  HOUSE_LABELS,
  HOUSE_BODY_WEIGHT,
  AXIS_BODIES,
  DEEP_BODIES,
  CORE_BODIES,
  BODY_ORDER,
  BODY_ORDER_MAP,
  MAX_ROWS_PER_COL,
  CORE_PAIR_KEYS,
  COMM_PAIR_KEYS,
  ATTRACTION_PAIR_KEYS,
  FRICTION_PAIR_KEYS,
  SOFT_ASPECTS,
  HARD_ASPECTS,
  PAIR_PRIORITY,
  BODY_PRIORITY,
  ASPECT_WEIGHT,
};
