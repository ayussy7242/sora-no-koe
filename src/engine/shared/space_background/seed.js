"use strict";

function normalizeSeedPart(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  return str;
}

function buildSpaceSeedLabel({
  seedVersion,
  channel,
  date,
  userId,
  pairId,
  variant,
  natalHash,
  prefixChannel = false,
} = {}) {
  const parts = [];
  const ver = normalizeSeedPart(seedVersion);
  if (ver) parts.push(ver);
  const ch = normalizeSeedPart(channel);
  if (prefixChannel && ch) parts.push(ch);
  const datePart = normalizeSeedPart(date);
  if (datePart) parts.push(datePart);
  const userPart = normalizeSeedPart(userId);
  if (userPart) parts.push(userPart);
  const pairPart = normalizeSeedPart(pairId);
  if (pairPart) parts.push(pairPart);
  const variantPart = normalizeSeedPart(variant);
  if (variantPart) parts.push(variantPart);
  const natalPart = normalizeSeedPart(natalHash);
  if (natalPart) parts.push(natalPart);
  return parts.join(":");
}

module.exports = {
  buildSpaceSeedLabel,
};
