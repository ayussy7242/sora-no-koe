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

const { LINE_COPY } = require("../copy");

function createLineStory({ db, storyService, renderers, natal = null, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser is required");
  if (!renderers?.renderLine) throw new Error("renderers.renderLine is required");
  // public用（なければ renderLine にフォールバックしてもいい）
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

  function safeText(s) {
    const x = s == null ? "" : String(s);
    return x.length > MAX_LINE_TEXT ? x.slice(0, MAX_LINE_TEXT) : x;
  }

  function ymdInTimeZone(date, timeZone) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date);
  }

  function asOfIsoFromDateLocal(dateLocal) {
    // JST 12:00 == UTC 03:00
    return `${dateLocal}T03:00:00.000Z`;
  }

  function computeDateLocalAndAsOfISO() {
    const now = new Date();
    const dateLocal = ymdInTimeZone(now, DEFAULT_TZ);
    const asOfISO = asOfIsoFromDateLocal(dateLocal);
    return { dateLocal, asOfISO };
  }

  async function buildStoryBase({ appUserId, mode }) {
    const { dateLocal, asOfISO } = computeDateLocalAndAsOfISO();
    const story = await storyService.buildStoryForUser({
      appUserId,
      mode, // "public" | "auto"
      dateLocal,
      asOfISO,
      orbMaxDeg: ORB_MAX_DEG,
      precisionDeg: PRECISION_DEG,
    });
    return { story, dateLocal, asOfISO };
  }

  async function renderStoryText(story, renderer) {
    const fn = typeof renderer === "function" ? renderer : renderers.renderLine;
    return safeText(await fn(story));
  }

  async function buildStory({ appUserId, mode, renderer }) {
    const { story } = await buildStoryBase({ appUserId, mode });
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

  // ---- anshin (natal-based)
  async function buildAnshin({ appUserId }) {
    const { story, dateLocal } = await buildStoryBase({ appUserId, mode: "auto" });
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    const natalCache = snap.exists ? snap.data() : null;
    const payload = {
      story,
      meta: {
        date_local: dateLocal,
        app_user_id: appUserId,
        user_id: appUserId,
      },
      natal_cache: natalCache,
    };
    const text = await renderStoryText(payload, renderers.renderAnshinLine);
    return { payload, text };
  }

  // ---- anshin (public)
  async function buildAnshinPublic() {
    return buildStory({ appUserId: "public", mode: "public", renderer: renderers.renderSoraAnshinLine });
  }
  
  async function buildSkyWithGuide({ withGuide = false } = {}) {
    const { story, text } = await buildStory({
      appUserId: "public",
      mode: "public",
      renderer: renderers.renderLine,
    });

    if (!withGuide) return { story, text };

    const guide =
      "\n\n（「今日」は登録があると personal が立ち上がりやすい🌌\n" +
      "登録は「はじめる」）";

    return { story, text: safeText(text + guide) };
  }

  function appendTail(text, tail) {
    if (!tail) return safeText(text);
    return safeText(`${text}\n\n${tail}`);
  }

  function tailSoraSilentNoPersonal() {
    return "──\nあなたの沈黙も、星の奥にあります。\n「はじめる」と送ると、あなたの星が登録できます。🌒";
  }

  function tailSoraNoPersonal() {
    return "──\nあなたの星も、静かに待っています。\n「はじめる」と送ると登録できます。🌌";
  }

  function tailAnshinNoPersonal() {
    return "──\nあなたのあんしんも、星の奥にあります。\n「はじめる」と送ると、あなたの星が登録できます。🫧";
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
    buildSkyWithGuide,
    buildToday,
    buildAnshin,
    buildAnshinPublic,
    renderFallback,
    renderWelcome,
    handleUtilities,
    appendTail,
    tailSoraSilentNoPersonal,
    tailSoraNoPersonal,
    tailAnshinNoPersonal,
  };
}

module.exports = { createLineStory };
