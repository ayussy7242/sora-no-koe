"use strict";

const { pickAppUserId, resolveStoryMode, resolveAsOfISO, resolveDateLocal } = require("./request_params");
const { boolish, toNumberSafe, clamp } = require("../../utils/data/parse");
const { isValidISO } = require("../../utils/time");

const CHANNEL_ALIAS = {
  // LINE
  sora: "line_sora",
  line_sora: "line_sora",
  distribution: "line_distribution",
  line_distribution: "line_distribution",
  natal: "line_natal",
  line_natal: "line_natal",

  // optional aliases
  x: "x",
  x_morning: "x_morning",
  x_morning_main: "x_morning_main",
  x_morning_log: "x_morning_log",
  x_night: "x_night",
  x_resonance: "x_resonance",
  x_moon_event: "x_moon_event",
  x_monthly: "x_monthly",
  x_thread: "x_thread",
  xthread: "x_thread",
  x2: "x_thread",
  ig: "ig",
  threads: "threads",
  threads_app: "threads",
  line: "line",
};

const SOCIAL_FORMATS = new Set([
  "x",
  "x_thread",
  "x_thread_text",
  "thread_text",
  "x_morning",
  "x_morning_main",
  "x_morning_log",
  "x_night",
  "x_resonance",
  "x_moon_event",
  "x_monthly",
  "ig",
  "threads",
  "threads_app",
]);

const SOCIAL_CHANNELS = new Set([
  "x",
  "x_thread",
  "x_morning",
  "x_morning_main",
  "x_morning_log",
  "x_night",
  "x_resonance",
  "x_moon_event",
  "x_monthly",
  "ig",
  "threads",
]);

function normalizeChannel(raw) {
  const reqChannel = String(raw || "").trim().toLowerCase();
  return CHANNEL_ALIAS[reqChannel] || reqChannel;
}

function parseStoriesRequest(req) {
  // ① format/channel
  const format = String(req.query.format || "json").trim().toLowerCase();
  const channel = normalizeChannel(req.query.channel);

  const isSocial = SOCIAL_FORMATS.has(format) || SOCIAL_CHANNELS.has(channel);
  const isSora = channel === "line_sora";
  const isDistribution = channel === "line_distribution";
  const isNatal = channel === "line_natal";

  // ② appUserId/mode
  let appUserId = pickAppUserId(req);
  let mode = resolveStoryMode(req.query.mode, appUserId);

  // ③ save 先に初期化
  let save = boolish(req.query.save);

  // ④ public固定＆保存禁止ルール（SNS / 公開系は public固定）
  if (isSocial || isSora || isDistribution || isNatal) {
    appUserId = "public";
    mode = "public";
    save = false;
  }

  // ✅ NOW デフォルト：as_of は基本 “今”
  const dateLocal = resolveDateLocal(req);
  const asOfISO = resolveAsOfISO(req);
  const asOfSource =
    (req.query.as_of && isValidISO(req.query.as_of)) ? "as_of" :
      (req.query.datetime_local ? "datetime_local" : "server_now");

  const orbMaxDeg = clamp(toNumberSafe(req.query.orb, 6), 0.1, 12);
  const precisionDeg = clamp(toNumberSafe(req.query.precision, 0.01), 0.001, 1);

  // final/force（保存時のみ意味がある）
  const final = boolish(req.query.final);
  const force = boolish(req.query.force);

  // outputs をレスポンスに含めるか（default true）
  const includeOutputs = req.query.outputs === undefined ? true : boolish(req.query.outputs);
  const igAiParam = String(req.query.ig_ai || "").trim().toLowerCase();
  const igAiOff = igAiParam === "0" || igAiParam === "false" || igAiParam === "off";
  const igAiOn = boolish(req.query.ig_ai);
  const wantIgAi = !igAiOff && (igAiOn || save || format === "ig" || channel === "ig" || includeOutputs);
  const wantXMorning = format === "x_morning" || format === "x_morning_main" || channel === "x_morning" || channel === "x_morning_main";
  const wantXNight = format === "x_night" || channel === "x_night";
  const wantXResonance = format === "x_resonance" || channel === "x_resonance";
  const wantXMoonEvent = format === "x_moon_event" || channel === "x_moon_event";
  const wantXMonthly = format === "x_monthly" || channel === "x_monthly";
  const xAiForce = boolish(req.query.ai_force) || boolish(req.query.x_ai_force);
  const resonanceModeRaw = String(req.query.resonance_mode || req.query.resonance || req.query.deep || "").trim().toLowerCase();
  const resonanceMode = ["deep", "1", "true", "on", "yes"].includes(resonanceModeRaw)
    ? "deep"
    : ["core", "0", "false", "off", "no"].includes(resonanceModeRaw)
      ? "core"
      : null;

  // AI debug flag (per-request)
  const aiDebugOn = boolish(req.query.ai_debug) || boolish(req.query.debug);

  return {
    format,
    channel,
    isSocial,
    isSora,
    isDistribution,
    isNatal,
    appUserId,
    mode,
    save,
    dateLocal,
    asOfISO,
    asOfSource,
    orbMaxDeg,
    precisionDeg,
    final,
    force,
    includeOutputs,
    wantIgAi,
    wantXMorning,
    wantXNight,
    wantXResonance,
    wantXMoonEvent,
    wantXMonthly,
    xAiForce,
    resonanceMode,
    aiDebugOn,
  };
}

module.exports = {
  CHANNEL_ALIAS,
  normalizeChannel,
  parseStoriesRequest,
};
