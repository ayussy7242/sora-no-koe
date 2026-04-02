"use strict";

function stripQuery(url) {
  if (!url) return "";
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

function pickBearerToken(req) {
  const authz = req?.header ? req.header("authorization") : null;
  if (!authz) return null;
  if (!authz.startsWith("Bearer ")) return null;
  return String(authz.slice(7)).trim() || null;
}

module.exports = {
  stripQuery,
  pickBearerToken,
};
