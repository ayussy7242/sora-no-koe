"use strict";

function makeToken(label, emoji) {
  const safeLabel = label || "";
  const safeEmoji = emoji || "";
  return {
    label: safeLabel,
    emoji: safeEmoji,
    toString() {
      return safeEmoji ? `${safeEmoji} ${safeLabel}` : safeLabel;
    },
  };
}

const PLANET_MAP = {
  sun: makeToken("太陽", "☀️"),
  moon: makeToken("月", "🌙"),
  mercury: makeToken("水星", "☿️"),
  venus: makeToken("金星", "♀️"),
  mars: makeToken("火星", "♂️"),
  jupiter: makeToken("木星", "♃"),
  saturn: makeToken("土星", "♄"),
  uranus: makeToken("天王星", "♅"),
  neptune: makeToken("海王星", "♆"),
  pluto: makeToken("冥王星", "♇"),
  chiron: makeToken("キロン", "⚷"),
  lilith: makeToken("リリス", "⚸"),
  asc: makeToken("ASC", ""),
  mc: makeToken("MC", ""),
  ic: makeToken("IC", ""),
  dsc: makeToken("DSC", ""),
};

const SIGN_MAP = {
  aries: "牡羊座",
  taurus: "牡牛座",
  gemini: "双子座",
  cancer: "蟹座",
  leo: "獅子座",
  virgo: "乙女座",
  libra: "天秤座",
  scorpio: "蠍座",
  sagittarius: "射手座",
  capricorn: "山羊座",
  aquarius: "水瓶座",
  pisces: "魚座",
};

function planetJa(key) {
  const k = (key || "").toLowerCase();
  return PLANET_MAP[k] || makeToken(String(key || ""), "");
}

function signJa(key) {
  const k = (key || "").toLowerCase();
  const label = SIGN_MAP[k] || String(key || "");
  return makeToken(label, "");
}

function fmtDeg(value) {
  if (value == null || value === "") return "";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return `${String(value)}°`;
  const rounded = Math.round(num * 10) / 10;
  const str = Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
  return `${str}°`;
}

module.exports = { fmtDeg, planetJa, signJa };
