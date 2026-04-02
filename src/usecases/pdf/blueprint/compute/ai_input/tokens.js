"use strict";

function asArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function normalizeTraitTokens(list) {
  const out = [];
  for (const raw of asArray(list)) {
    const t = String(raw || "").trim();
    if (!t) continue;
    // 文っぽい長文を除外（例文に寄せる）
    if (t.length > 12) continue;
    if (/ながら|つつ|しつつ|しながら/.test(t)) continue;
    out.push(t);
  }
  return Array.from(new Set(out));
}

function normalizeCoreTokens(list, { maxLen = 24 } = {}) {
  const out = [];
  for (const raw of asArray(list)) {
    const t = String(raw || "").trim();
    if (!t) continue;
    if (t.length > maxLen) continue;
    if (/ながら|つつ|しつつ|しながら/.test(t)) continue;
    out.push(t);
  }
  return Array.from(new Set(out));
}

function getSoraCore(dict) {
  return dict?.SORA_CORE_V2 || dict?.SORA_CORE_V1 || dict?.sora_core || null;
}

function getSoraPlanetSlotTokens(dict, key, slot) {
  const core = getSoraCore(dict)?.meaning?.planets?.[key] || null;
  const bucket = core?.[slot] || null;
  if (!bucket) return [];
  if (Array.isArray(bucket)) {
    return normalizeCoreTokens(bucket);
  }
  if (typeof bucket === "object") {
    return normalizeCoreTokens([
      ...asArray(bucket.cores),
      ...asArray(bucket.seeds),
      ...asArray(bucket.phrases),
      ...asArray(bucket.verbs),
    ]);
  }
  return normalizeCoreTokens(asArray(bucket));
}

function getSoraPlanetCoreTokens(dict, key) {
  const core = getSoraCore(dict)?.meaning?.planets?.[key] || null;
  if (!core) return [];
  if (Array.isArray(core.role)) {
    return normalizeCoreTokens(core.role);
  }
  if (core.role) {
    return normalizeCoreTokens([
      ...asArray(core.role?.cores),
      ...asArray(core.role?.seeds),
    ]);
  }
  return normalizeCoreTokens([
    ...asArray(core.cores),
    ...asArray(core.phrases),
    ...asArray(core.verbs),
  ]);
}

function getSoraSignCoreTokens(dict, signKey) {
  const k = String(signKey || "").toLowerCase();
  const core = getSoraCore(dict)?.meaning?.signs?.[k] || null;
  if (!core) return [];
  if (core.cores || core.seeds || core.color || core.verbs) {
    return normalizeCoreTokens([
      ...asArray(core.cores),
      ...asArray(core.seeds),
      ...asArray(core.color),
      ...asArray(core.verbs),
    ]);
  }
  return normalizeCoreTokens([...asArray(core.cores), ...asArray(core.phrases)]);
}

function getSoraDegreePhase(dict, deg) {
  const phases = getSoraCore(dict)?.facts?.degree_phase || [];
  const bias = getSoraCore(dict)?.facts?.phase_bias || null;
  const d = typeof deg === "number" ? deg : Number(deg);
  for (const p of phases) {
    if (typeof p?.min !== "number" || typeof p?.max !== "number") continue;
    if (d >= p.min && d <= p.max) {
      return {
        name: p.name || null,
        fact: p.fact || null,
        bias: bias?.[p.name] || null,
      };
    }
  }
  return { name: null, fact: null, bias: null };
}

function splitFlavorText(text) {
  if (!text) return [];
  const s = String(text).replace(/[。．]/g, " ");
  const parts = s
    .split(/[・、,\s/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.includes("と") ? p.split("と") : [p]))
    .map((p) => p.trim())
    .filter(Boolean);
  return parts;
}

function getSignFlavorTokens(dict, signKey, bodyKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  if (!sf || !signKey) return [];
  const s = sf.signs?.[String(signKey || "").toLowerCase()] || null;
  if (!s) return [];

  const baseKeywords = asArray(s.base?.keywords || []);
  const body = s.by_body?.[bodyKey] || null;
  const fusion = body?.fusion || {};
  const a = asArray(fusion.A || []);
  const expr = asArray(fusion.expression || []);
  const process = asArray(fusion.process || []);

  return normalizeTraitTokens([...baseKeywords, ...a, ...expr, ...process]);
}

function getSignFlavorRoleCoreTokens(dict, signKey, bodyKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  if (!sf || !signKey) return [];
  const s = sf.signs?.[String(signKey || "").toLowerCase()] || null;
  if (!s) return [];
  const body = s.by_body?.[bodyKey] || null;
  if (!body) return [];
  const role = splitFlavorText(body.role || "");
  const core = splitFlavorText(body.core || "");
  return normalizeTraitTokens([...role, ...core]);
}

module.exports = {
  asArray,
  normalizeTraitTokens,
  normalizeCoreTokens,
  getSoraCore,
  getSoraPlanetSlotTokens,
  getSoraPlanetCoreTokens,
  getSoraSignCoreTokens,
  getSoraDegreePhase,
  splitFlavorText,
  getSignFlavorTokens,
  getSignFlavorRoleCoreTokens,
};
