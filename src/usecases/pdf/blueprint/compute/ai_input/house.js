"use strict";

const { signIndexFromKey, houseNumberForSignIndex } = require("../../../../../domain/astro/compute");
const { norm360 } = require("../calc");

function buildHouseEmphasis({ rowsMain, rowsExtra, rowsAngles, dict }) {
  const ascRow = (rowsAngles || []).find((row) => row.key === "asc");
  const ascKey = ascRow?.meta?.sign_key || "";
  const ascIndex = signIndexFromKey(dict, ascKey);
  if (!ascKey || ascIndex < 0) return null;

  const counts = {};
  const placements = [];
  const rows = [...(rowsMain || []), ...(rowsExtra || [])];
  rows.forEach((row) => {
    const signKey = row?.meta?.sign_key || "";
    if (!signKey) return;
    const signIndex = signIndexFromKey(dict, signKey);
    if (signIndex < 0) return;
    const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
    if (!houseNo) return;
    counts[houseNo] = (counts[houseNo] || 0) + 1;
    placements.push({
      key: row.key,
      label: row.label,
      house_no: houseNo,
      sign_key: signKey,
      sign_ja: row.meta?.sign_ja || "",
    });
  });

  const sorted = Object.entries(counts)
    .map(([houseNo, count]) => ({ house_no: Number(houseNo), count }))
    .sort((a, b) => (b.count - a.count) || (a.house_no - b.house_no));
  const emphasis = sorted.filter((row) => row.count >= 2).map((row) => row.house_no);
  return {
    asc_sign_key: ascKey,
    asc_sign_ja: ascRow?.meta?.sign_ja || "",
    counts,
    top: sorted.slice(0, 3),
    emphasis,
    placements,
  };
}

function normalizeCuspsFromNatalCache(natalCache) {
  const hs = natalCache?.houses || natalCache?.engine?.houses || {};
  const cuspsRaw = hs.cusps || hs.house || hs.cusp || null;
  if (!Array.isArray(cuspsRaw) || cuspsRaw.length < 12) return null;
  if (cuspsRaw.length === 13) return cuspsRaw.slice(1).map((v) => Number(v));
  return cuspsRaw.slice(0, 12).map((v) => Number(v));
}

function getHouseFromCusps(lon, cusps) {
  const v = norm360(lon);
  if (!Number.isFinite(v) || !Array.isArray(cusps) || cusps.length !== 12) return null;
  for (let i = 0; i < 12; i += 1) {
    const start = norm360(cusps[i]);
    const end = norm360(cusps[(i + 1) % 12]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= end) {
      if (v >= start && v < end) return i + 1;
    } else {
      if (v >= start || v < end) return i + 1;
    }
  }
  return null;
}

function buildHouseEmphasisFromCusps({ rowsMain, rowsExtra, cusps, dict, system }) {
  if (!Array.isArray(cusps) || cusps.length !== 12) return null;
  const counts = {};
  const placements = [];
  const rows = [...(rowsMain || []), ...(rowsExtra || [])];
  rows.forEach((row) => {
    const lon = row?.meta?.lon_deg ?? row?.meta?.lon ?? null;
    const houseNo = getHouseFromCusps(lon, cusps);
    if (!houseNo) return;
    counts[houseNo] = (counts[houseNo] || 0) + 1;
    placements.push({
      key: row.key,
      label: row.label,
      house_no: houseNo,
      sign_key: row.meta?.sign_key || "",
      sign_ja: row.meta?.sign_ja || "",
    });
  });
  const sorted = Object.entries(counts)
    .map(([houseNo, count]) => ({ house_no: Number(houseNo), count }))
    .sort((a, b) => (b.count - a.count) || (a.house_no - b.house_no));
  const emphasis = sorted.filter((row) => row.count >= 2).map((row) => row.house_no);
  return {
    system: system || null,
    counts,
    top: sorted.slice(0, 3),
    emphasis,
    placements,
  };
}

module.exports = {
  buildHouseEmphasis,
  normalizeCuspsFromNatalCache,
  getHouseFromCusps,
  buildHouseEmphasisFromCusps,
};
