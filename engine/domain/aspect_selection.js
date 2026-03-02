"use strict";

function listWithOrb(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((r) => Number.isFinite(Number(r?.orb_deg)));
}

function filterWithinOrb(items, orbLimit) {
  if (!Array.isArray(items)) return [];
  const limit = Number(orbLimit);
  return items.filter((r) => Number(r?.orb_deg) <= limit);
}

function sortByOrb(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg));
}

function minByOrb(items) {
  const sorted = sortByOrb(items);
  return sorted[0] || null;
}

module.exports = {
  listWithOrb,
  filterWithinOrb,
  sortByOrb,
  minByOrb,
};
