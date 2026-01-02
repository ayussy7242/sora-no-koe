"use strict";

/**
 * cron/daily.js
 * - 毎朝8時配信（登録済みユーザー向け）
 * - 対象抽出 → story生成 → LINE push
 */

function ymdInTz(date = new Date(), timeZone = "Asia/Tokyo") {
  // YYYY-MM-DD (TZ)
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(date); // en-CA => 2026-01-02
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function linePush(accessToken, to, text) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (!to) throw new Error("line user id missing");
  if (!text || !String(text).trim()) throw new Error("push text empty");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: String(text).slice(0, 4800) }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }
  return true;
}

async function fetchTargets({ db }) {
  // users.natal.delivery.daily_8 === true && users.natal.enabled === true
  // ※ Firestoreの複合indexが必要になる場合あり（その時はコンソールが作成リンク出す）
  const snap = await db
    .collection("users")
    .where("natal.delivery.daily_8", "==", true)
    .where("natal.enabled", "==", true)
    .limit(500) // まずは上限（必要ならページング）
    .get();

  const out = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const lineUserId = d?.channels?.line?.line_user_id || null;
    if (!lineUserId) return;
    out.push({
      appUserId: doc.id,
      lineUserId,
      timezone: d?.profile?.timezone || d?.timezone || "Asia/Tokyo",
      displayName: d?.profile?.display_name || null,
    });
  });

  return out;
}

async function buildPersonalMessage({ storyService, appUserId, dateLocal }) {
  // あゆっさいの今の設計：LINEに返す文は storyService + renderers が握ってる前提
  // storyService.buildPersonalToday は { text } を返す想定（違ったらここだけ合わせる）
  const r = await storyService.buildPersonalToday({ appUserId, dateLocal });
  const text = r?.text || "";
  return text;
}

async function runDaily8(deps, opts = {}) {
  const {
    db,
    env = {},
    storyService,
  } = deps;

  if (!db) throw new Error("db required");
  if (!storyService?.buildPersonalToday) throw new Error("storyService.buildPersonalToday required");

  const timeZone = env.DEFAULT_TZ || "Asia/Tokyo";
  const dateLocal = opts.dateLocal || ymdInTz(new Date(), timeZone);

  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN || null;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const targets = await fetchTargets({ db });

  const result = {
    ok: true,
    date_local: dateLocal,
    timezone: timeZone,
    targets: targets.length,
    sent: 0,
    failed: 0,
    failures: [],
  };

  // レート対策：軽いスロットリング
  const CONCURRENCY = Number(env.CRON_CONCURRENCY || 5);
  const DELAY_MS = Number(env.CRON_DELAY_MS || 150);

  // simple worker pool
  let idx = 0;
  async function worker(workerId) {
    while (idx < targets.length) {
      const i = idx++;
      const t = targets[i];

      try {
        const text = await buildPersonalMessage({
          storyService,
          appUserId: t.appUserId,
          dateLocal,
        });

        if (!text || !String(text).trim()) {
          throw new Error("story text empty");
        }

        await linePush(accessToken, t.lineUserId, text);

        result.sent += 1;
      } catch (e) {
        result.failed += 1;
        result.failures.push({
          app_user_id: t.appUserId,
          line_user_id: t.lineUserId,
          error: e?.message || String(e),
        });
      }

      // small delay
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.max(1, CONCURRENCY); w++) workers.push(worker(w));
  await Promise.all(workers);

  return result;
}

module.exports = { runDaily8 };
