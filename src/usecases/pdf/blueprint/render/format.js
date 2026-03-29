"use strict";

const { norm360 } = require("../compute/calc");
const {
  SIGN_KEYS,
  BODY_ORDER_MAIN,
  BODY_ORDER_EXTRA,
  BODY_LABEL,
  BODY_GLYPH,
} = require("../../../../engine/pdf/blueprint_light/shared");

function toSignMeta(dict, lon) {
  const v = norm360(lon);
  if (!Number.isFinite(v)) return null;
  const idx = Math.floor(v / 30);
  const within = v - idx * 30;
  const deg = Math.floor(within);
  const min = Math.floor((within - deg) * 60 + 1e-9);
  const key = SIGN_KEYS[idx] || null;
  const sign = dict?.SIGNS_V2?.signs?.[key] || {};
  return {
    lon_deg: v,
    sign_key: key,
    sign_ja: sign?.label_ja || key || "（不明）",
    element: sign?.element || null,
    modality: sign?.modality || null,
    deg,
    min,
    flavor: sign?.flavor || sign?.sora_short || "",
  };
}

function formatSignText(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja} ${meta.deg}°${mm}’`;
}

function formatSignPipe(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja}｜${meta.deg}°${mm}’`;
}

function buildBlueprintLightRows({ longitudes, dict }) {
  const rowsMain = [];
  const rowsAngles = [];
  const rowsExtra = [];
  const element = { fire: 0, earth: 0, air: 0, water: 0 };
  const modality = { cardinal: 0, fixed: 0, mutable: 0 };

  const pushRow = (rows, key, lon, { count = false } = {}) => {
    const meta = toSignMeta(dict, lon);
    if (!meta) return;
    rows.push({
      key,
      glyph: BODY_GLYPH[key] || "",
      label: BODY_LABEL[key] || key,
      value: formatSignText(meta),
      meta,
    });
    if (count) {
      if (meta.element && element[meta.element] !== undefined) element[meta.element] += 1;
      if (meta.modality && modality[meta.modality] !== undefined) modality[meta.modality] += 1;
    }
  };

  BODY_ORDER_MAIN.forEach((k) => {
    const lon = longitudes?.[k];
    if (Number.isFinite(Number(lon))) pushRow(rowsMain, k, lon, { count: true });
  });

  const asc = longitudes?.asc;
  const mc = longitudes?.mc;
  const ic = Number.isFinite(Number(mc)) ? norm360(Number(mc) + 180) : null;
  const dc = Number.isFinite(Number(asc)) ? norm360(Number(asc) + 180) : null;
  if (Number.isFinite(Number(asc))) pushRow(rowsAngles, "asc", asc);
  if (Number.isFinite(Number(mc))) pushRow(rowsAngles, "mc", mc);
  if (Number.isFinite(Number(ic))) pushRow(rowsAngles, "ic", ic);
  if (Number.isFinite(Number(dc))) pushRow(rowsAngles, "dc", dc);

  BODY_ORDER_EXTRA.forEach((k) => {
    const lon = longitudes?.[k];
    if (!Number.isFinite(Number(lon))) return;
    const count = k === "chiron" || k === "lilith";
    pushRow(rowsExtra, k, lon, { count });
  });

  return { rowsMain, rowsAngles, rowsExtra, element, modality };
}

function buildBirthText(birth) {
  if (!birth) return "";
  const date = birth.date_local ? String(birth.date_local) : "";
  const time = birth.time_hm ? String(birth.time_hm) : "";
  const place = birth.place_text || birth.place_formatted || "";
  const parts = [];
  if (date) parts.push(date);
  if (time) parts.push(time);
  if (place) parts.push(place);
  return parts.length ? `出生: ${parts.join(" / ")}` : "";
}

module.exports = {
  formatSignText,
  formatSignPipe,
  buildBlueprintLightRows,
  buildBirthText,
};
