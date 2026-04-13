"use strict";

const { resolveHouseNumber, HOUSE_BASIS, normalizeCusps, houseNumberForLonCusps } = require("../../../../../domain/astro/compute");

function buildHouseEmphasis({ rowsMain, rowsExtra, rowsAngles, dict }) {
  const ascRow = (rowsAngles || []).find((row) => row.key === "asc");
  const ascKey = ascRow?.meta?.sign_key || "";
  if (!ascKey) return null;

  const counts = {};
  const placements = [];
  const rows = [...(rowsMain || []), ...(rowsExtra || [])];
  rows.forEach((row) => {
    const signKey = row?.meta?.sign_key || "";
    if (!signKey) return;
    const houseNo = resolveHouseNumber({
      basis: HOUSE_BASIS.TRANSIT_PUBLIC,
      signKey,
      ascSignKey: ascKey,
      dict,
    });
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
  return normalizeCusps(cuspsRaw);
}

function getHouseFromCusps(lon, cusps) {
  return houseNumberForLonCusps(lon, cusps);
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
