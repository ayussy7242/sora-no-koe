"use strict";

function normalizeDisplayName(value) {
  const v = value == null ? "" : String(value);
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function resolveDisplayNameFromUserDoc(userDoc, { preferProfile = false } = {}) {
  if (!userDoc || typeof userDoc !== "object") return null;

  const profileName = normalizeDisplayName(userDoc?.profile?.display_name);
  const topLevelName = normalizeDisplayName(userDoc?.display_name);
  const lineProfileName = normalizeDisplayName(userDoc?.channels?.line?.profile?.display_name);

  if (preferProfile) return profileName || topLevelName || lineProfileName || null;
  return topLevelName || profileName || lineProfileName || null;
}

function resolveDisplayNameFromLineUserDoc(lineUserDoc, { preferProfile = false } = {}) {
  if (!lineUserDoc || typeof lineUserDoc !== "object") return null;

  const lineProfileName = normalizeDisplayName(lineUserDoc?.line_profile?.display_name);
  const profileName = normalizeDisplayName(lineUserDoc?.profile?.display_name);
  const topLevelName = normalizeDisplayName(lineUserDoc?.display_name);

  if (preferProfile) return profileName || lineProfileName || topLevelName || null;
  return lineProfileName || profileName || topLevelName || null;
}

module.exports = {
  normalizeDisplayName,
  resolveDisplayNameFromUserDoc,
  resolveDisplayNameFromLineUserDoc,
};
