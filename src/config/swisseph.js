"use strict";

/**
 * config/swisseph.js
 * - Swiss Ephemeris wrapper for sora-no-koe
 * - Cloud Run / local どっちでも落ちない
 * - epheファイルが無くても swe_calc_ut は動く（ただし精度/参照が変わる場合あり）
 *
 * env:
 * - SWISSEPH_EPH_PATH: ephe ディレクトリの絶対パス or 相対パス
 *   例) /workspace/ephe  or  ./ephe
 */

const path = require("path");

let swisseph = null;
try {
  // npm package: swisseph (node bindings)
  // eslint-disable-next-line global-require
  swisseph = require("swisseph");
} catch (e) {
  // ここで落とすと全API死ぬので、後段で分かりやすくエラーにする
  console.error("[swisseph] load failed:", e?.message || String(e));
  swisseph = null;
}

function resolveEphePath() {
  const envPath = process.env.SWISSEPH_EPH_PATH;
  if (envPath && typeof envPath === "string" && envPath.trim()) {
    // 絶対/相対どっちでもOK
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }

  // Prefer bundled ephemeris inside node_modules (if exists)
  const bundled = path.resolve(process.cwd(), "node_modules", "swisseph", "ephe");
  try {
    if (require("fs").existsSync(bundled)) return bundled;
  } catch (_) {}

  // よくある配置：プロジェクト直下に ephe/ を置く
  // (同梱してないなら存在しないけど、それでも問題ないようにする)
  return path.resolve(process.cwd(), "ephe");
}

function setupSwissEphemeris() {
  if (!swisseph) {
    return {
      ok: false,
      error: "swisseph module is not installed or failed to load",
      ephe_path: null,
    };
  }

  const ephePath = resolveEphePath();

  // epheパス設定：失敗しても落とさない
  // (epheファイルが無い環境でも calc が動くことがあるため)
  try {
    if (typeof swisseph.swe_set_ephe_path === "function") {
      swisseph.swe_set_ephe_path(ephePath);
    }
  } catch (_) {}

  return { ok: true, ephe_path: ephePath };
}

// 初期化（1回だけ）
const setup = setupSwissEphemeris();

module.exports = {
  swisseph,
  swisseph_setup: setup,
};
