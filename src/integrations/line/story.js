"use strict";

/**
 * line/story.js — Unified STABLE (v2026.01 cleaned)
 *
 * 役割：
 * - LINE向け story の入口
 * - 「操作系（help/start/reset等）」のみ utilities で処理
 * - 「きょう / そら / わたしのほし」は intent → routes に完全委譲
 *
 * ❌ ここではコマンド意味判定しない
 */

const { LINE_COPY } = require("../../content/copy");
const { normalizeStoryArgs } = require("../../usecases/story/story_args");
const { ymdInTimeZone } = require("../../utils/time_utils");
const { buildPublicStorySnapshot } = require("../../usecases/story/store");
const { safeLineText } = require("./line_utils");

function createLineStory({ db, storyService, renderers, natal = null, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser is required");
  if (!renderers?.renderLine) throw new Error("renderers.renderLine is required");
  const renderSky =
    typeof renderers?.renderSoraLine === "function"
      ? renderers.renderSoraLine
      : renderers.renderLine;

  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const ORB_MAX_DEG = Number(config.ORB_MAX_DEG ?? 6);
  const PRECISION_DEG = Number(config.PRECISION_DEG ?? 0.01);
  const MAX_LINE_TEXT = Number(config.MAX_LINE_TEXT ?? 4800);

  const BOT_NAME =
    config.LINE_ACCOUNT_NAME ||
    config.BOT_NAME ||
    "ソラのこえ。｜今日の星を置く🌌";

  function computeDateLocalAndAsOfISO() {
    const now = new Date();
    const dateLocal = ymdInTimeZone(now, DEFAULT_TZ);
    const asOfISO = now.toISOString();
    return { dateLocal, asOfISO };
  }

  async function buildStoryBase({ appUserId, mode }) {
    const { dateLocal, asOfISO } = computeDateLocalAndAsOfISO();
    const story = await storyService.buildStoryForUser(
      normalizeStoryArgs({
        appUserId,
        mode, // "public" | "auto"
        dateLocal,
        asOfISO,
        orbMaxDeg: ORB_MAX_DEG,
        precisionDeg: PRECISION_DEG,
      })
    );
    return { story, dateLocal, asOfISO };
  }

  async function renderStoryText(story, renderer) {
    const fn = typeof renderer === "function" ? renderer : renderers.renderLine;
    return safeLineText(await fn(story), MAX_LINE_TEXT);
  }

  async function buildStory({ appUserId, mode, renderer }) {
    let story = null;
    if (mode === "public" && appUserId === "public") {
      const { dateLocal, asOfISO } = computeDateLocalAndAsOfISO();
      story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
    } else {
      const built = await buildStoryBase({ appUserId, mode });
      story = built.story;
    }
    const text = await renderStoryText(story, renderer);
    return { story, text };
  }

  // ---- public sky only
  async function buildSky() {
    return buildStory({ appUserId: "public", mode: "public", renderer: renderSky });
  }

  // ---- today (auto)
  async function buildToday({ appUserId }) {
    return buildStory({ appUserId, mode: "auto", renderer: renderers.renderLine });
  }

  function appendTail(text, tail) {
    if (!tail) return safeLineText(text, MAX_LINE_TEXT);
    return safeLineText(`${text}\n\n${tail}`, MAX_LINE_TEXT);
  }

  function tailSoraSilentNoPersonal() {
    return "──\nあなたの沈黙も、星の奥にあります。\n「はじめる」と送ると、あなたの星が登録できます。🌒";
  }

  function tailSoraNoPersonal() {
    return "──\nあなたの星も、静かに待っています。\n「はじめる」と送ると登録できます。🌌";
  }
  function renderFallback() {
    return LINE_COPY.FALLBACK;
  }

  function renderWelcome(profile) {
    const nickname = profile?.displayName || "あなた";
    return LINE_COPY.WELCOME({
      nickname,
      botName: BOT_NAME,
    });
  }

  // ---- utilities（操作系だけ）
  async function handleUtilities({ cmd, appUserId, lineUserId }) {
    const c = String(cmd || "").trim();

    if (/^(ping)$/i.test(c)) return { text: "pong" };
    if (/^(test|てすと|テスト)$/i.test(c)) return { text: LINE_COPY.TEST_ACK };
    if (/^(help|使い方|へるぷ)$/i.test(c)) return { text: LINE_COPY.HELP };

    if (/^(やめる|中止|cancel|stop)$/i.test(c)) {
      if (lineUserId && natal?.setLineState) {
        await natal.setLineState(lineUserId, natal.FLOW_STATE.READY);
      }
      return { text: LINE_COPY.CANCELLED };
    }

    if (/^(リセット|reset|最初から|はじめから)/.test(c)) {
      if (natal?.resetNatal) {
        await natal.resetNatal(appUserId, lineUserId);
      }
      return { text: LINE_COPY.RESET_DONE };
    }

    if (/^(はじめる|始める|start|begin)$/i.test(c)) {
      if (lineUserId && natal?.setLineState) {
        await natal.setLineState(
          lineUserId,
          natal.FLOW_STATE.PENDING_BIRTH_DATE
        );
      }
      return { text: LINE_COPY.START_NATAL };
    }

    return null;
  }

  return {
    buildSky,
    buildToday,
    renderFallback,
    renderWelcome,
    handleUtilities,
    appendTail,
    tailSoraSilentNoPersonal,
    tailSoraNoPersonal,
  };
}

module.exports = { createLineStory };
