"use strict";

function toBool(v, defaultValue = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (!s) return defaultValue;
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
}

module.exports = { toBool };
