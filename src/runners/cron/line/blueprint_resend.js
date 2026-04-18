"use strict";

const { resolveEnv } = require("../../../utils/env");
const { toBool } = require("../../../utils/data/bool");
const { isYYYYMMDD, toDateLocalJST } = require("../../../utils/time");
const { getLineUserIdFromUserDoc, pickTarget } = require("../cron_utils");
const { createLineApi } = require("../../../integrations/line/api");
const { createBlueprintLightService } = require("../../../usecases/pdf/blueprint");
const { enqueueBlueprintGenerate } = require("../../../integrations/cloudtasks/tasks_queue");
const { getLineUserBlueprintPhase, setLineUserBlueprintPhase } = require("../../../integrations/line/state");
const { LINE_COPY } = require("../../../content/copy");
const { BLUEPRINT_PHASE, JOB_STATUS, normalizeCompletionStatus } = require("../../../domain/lifecycle/enums");

function isNatalCacheComplete(cache) {
  if (!cache || typeof cache !== "object") return false;

  const bodies = cache?.min?.bodies || cache?.min?.natal_positions;
  const hasBodies = !!bodies && typeof bodies === "object" && Object.keys(bodies).length > 0;

  const a = cache?.houses?.angles;
  let asc = Number(a?.asc);
  let mc = Number(a?.mc);

  if (!Number.isFinite(asc)) asc = Number(cache?.["1"] ?? cache?.[1]);
  if (!Number.isFinite(mc)) mc = Number(cache?.["10"] ?? cache?.[10]);

  const hasAngles =
    Number.isFinite(asc) && asc >= 0 && asc < 360 &&
    Number.isFinite(mc) && mc >= 0 && mc < 360 &&
    Math.abs(asc - mc) > 1e-9;

  return hasBodies && hasAngles;
}

function buildNatalJobFromUser({ user, appUserId, admin, defaultTz }) {
  const b = user?.natal?.birth || {};
  return {
    status: JOB_STATUS.QUEUED,
    attempts: 0,
    created_at: admin.firestore.Timestamp.now(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    app_user_id: appUserId,
    birth: {
      date_local: b.date_local || null,
      time_hm: b.time_hm || null,
      timezone: b.timezone || defaultTz || "Asia/Tokyo",
      lat: typeof b.lat === "number" ? b.lat : null,
      lon: typeof b.lon === "number" ? b.lon : null,
      place_text: b.place_text || null,
      place_formatted: b.place_formatted || null,
      place_id: b.place_id || null,
    },
  };
}

function birthHasMinimum(birth) {
  const hasDate = !!birth?.date_local;
  const hasLatLon = Number.isFinite(birth?.lat) && Number.isFinite(birth?.lon);
  return hasDate && hasLatLon;
}

function buildBlueprintTemplate(url) {
  return {
    type: "template",
    altText: "星の設計図（Blueprint v25）",
    template: {
      type: "buttons",
      title: "星の設計図（Blueprint v25）",
      text: "設計図を開く",
      actions: [
        {
          type: "uri",
          label: "設計図を開く",
          uri: url,
        },
      ],
    },
  };
}

async function runBlueprintResend(deps = {}, opts = {}) {
  const { db, admin, storage, env, dict } = deps;
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");

  const env2 = resolveEnv(env);
  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const target = pickTarget(opts.target);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run, false);
  const includeInactive = toBool(opts.includeInactive ?? opts.include_inactive, false);
  const includeDone = toBool(opts.includeDone ?? opts.include_done, false);
  const forceRegen = toBool(opts.forceRegen ?? opts.force_regen ?? opts.force, false);
  const limit = Number(opts.limit || 0) || null;
  const lineUserIdOpt = String(opts.line_user_id || opts.lineUserId || "").trim();
  const appUserIdOpt = String(opts.app_user_id || opts.appUserId || "").trim();

  const lineEnabled = toBool(env2.LINE_ENABLED, true);
  const skipPush = toBool(env2.BLUEPRINT_SKIP_LINE_PUSH || process.env.BLUEPRINT_SKIP_LINE_PUSH || "");
  const allowPush = lineEnabled && !skipPush;
  const lineToken = env2.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineToken && allowPush && !dryRun) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  }
  const lineApi = lineToken ? createLineApi({ accessToken: lineToken, maxText: Number(env2.MAX_LINE_TEXT || 4800) }) : null;

  const blueprint =
    storage && env2.GCS_BUCKET_BLUEPRINTS
      ? createBlueprintLightService({ db, admin, storage, env: env2, dict })
      : null;

  const results = [];
  let scanned = 0;
  let attempted = 0;
  let resent = 0;
  let queuedNatal = 0;
  let queuedBlueprint = 0;
  let skipped = 0;
  let failed = 0;
  let lastError = null;

  const pushResult = (item) => results.push(item);

  async function maybeEnqueueNatal({ appUserId, user }) {
    const birth = user?.natal?.birth || {};
    if (!birthHasMinimum(birth)) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, reason: "birth_incomplete" });
      return { ok: false, reason: "birth_incomplete" };
    }
    const jobRef = db.collection("jobs_natal_calc").doc(appUserId);
    const jobSnap = await jobRef.get();
    if (jobSnap.exists) {
      const job = jobSnap.data() || {};
      const jobStatus = normalizeCompletionStatus(job?.status);
      if (jobStatus === JOB_STATUS.QUEUED || jobStatus === JOB_STATUS.RUNNING) {
        skipped += 1;
        pushResult({ app_user_id: appUserId, reason: "natal_job_already_queued" });
        return { ok: false, reason: "natal_job_already_queued" };
      }
    }
    const job = buildNatalJobFromUser({
      user,
      appUserId,
      admin,
      defaultTz: env2.DEFAULT_TZ || "Asia/Tokyo",
    });
    await jobRef.set(job, { merge: true });
    queuedNatal += 1;
    pushResult({ app_user_id: appUserId, reason: "natal_job_queued" });
    return { ok: true };
  }

  async function maybeEnqueueBlueprint({ lineUserId }) {
    try {
      await enqueueBlueprintGenerate({
        env: env2,
        lineUserId,
        blueprintType: "light",
        forceRegen,
        extraPayload: { forcePush: true },
      });
      queuedBlueprint += 1;
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.QUEUED_BLUEPRINT,
        eventType: "blueprint_retry_queued",
      });
      pushResult({ line_user_id: lineUserId, reason: "blueprint_queued" });
      return { ok: true };
    } catch (e) {
      failed += 1;
      lastError = e?.message || String(e);
      pushResult({ line_user_id: lineUserId, reason: "blueprint_enqueue_failed", error: lastError });
      return { ok: false, error: lastError };
    }
  }

  async function processOne({ appUserId, lineUserId, user }) {
    scanned += 1;
    if (limit && attempted >= limit) return false;
    if (!lineUserId) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, reason: "line_user_id_missing" });
      return true;
    }

    const lineSnap = await db.collection("line_users").doc(lineUserId).get();
    if (!lineSnap.exists) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "line_user_not_found" });
      return true;
    }
    const lineUser = lineSnap.data() || {};
    const isActive = lineUser?.is_active !== false;
    if (!includeInactive && !isActive) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "line_inactive" });
      return true;
    }

    const blueprintPhase = String((await getLineUserBlueprintPhase({ db, lineUserId })) || "");
    if (!includeDone && blueprintPhase === BLUEPRINT_PHASE.BLUEPRINT_DONE) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "already_done" });
      return true;
    }
    if (blueprintPhase === BLUEPRINT_PHASE.QUEUED_BLUEPRINT || blueprintPhase === BLUEPRINT_PHASE.RUNNING_BLUEPRINT) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "already_queued" });
      return true;
    }

    const lastSentDate = lineUser?.notify?.blueprint_resend?.last_sent_date || null;
    if (lastSentDate === dateLocal) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "resent_today" });
      return true;
    }

    attempted += 1;

    const cacheSnap = await db.collection("natal_cache").doc(appUserId).get();
    const cache = cacheSnap.exists ? cacheSnap.data() || {} : null;
    const needsNatal =
      !cache ||
      cache?.needs_compute === true ||
      !isNatalCacheComplete(cache);
    if (needsNatal) {
      await maybeEnqueueNatal({ appUserId, user });
      return true;
    }

    if (!blueprint) {
      skipped += 1;
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "blueprint_service_missing" });
      return true;
    }

    let has = null;
    try {
      has = await blueprint.hasPdf({ lineUserId, variant: "mobile" });
    } catch (e) {
      failed += 1;
      lastError = e?.message || String(e);
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "has_pdf_failed", error: lastError });
      return true;
    }

    if (!has?.ok) {
      failed += 1;
      lastError = has?.error || has?.code || "has_pdf_failed";
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "has_pdf_failed", error: lastError });
      return true;
    }

    if (!has.exists) {
      await maybeEnqueueBlueprint({ lineUserId });
      return true;
    }

    const signed = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
    if (!signed?.ok || !signed?.url) {
      failed += 1;
      lastError = signed?.error || signed?.code || "signed_url_failed";
      pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: "signed_url_failed", error: lastError });
      return true;
    }

    if (!dryRun && allowPush && lineApi) {
      const notice = LINE_COPY.BLUEPRINT_RESEND_NOTICE || "システムの都合でお届けが遅れました。";
      const template = buildBlueprintTemplate(signed.url);
      await lineApi.pushMessages(lineUserId, [
        { type: "text", text: notice },
        template,
      ]);
      await db.collection("line_users").doc(lineUserId).set(
        {
          notify: {
            ...(lineUser.notify || {}),
            blueprint_resend: {
              last_sent_date: dateLocal,
              last_sent_at: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.BLUEPRINT_DONE,
        eventType: "blueprint_resend_done",
      });
    }

    resent += 1;
    pushResult({ app_user_id: appUserId, line_user_id: lineUserId, reason: dryRun ? "dry_run" : "resent" });
    return true;
  }

  if (lineUserIdOpt) {
    const lineSnap = await db.collection("line_users").doc(lineUserIdOpt).get();
    if (!lineSnap.exists) {
      return {
        ok: false,
        error: "line_user_not_found",
        date_local: dateLocal,
        target,
        scanned,
        attempted,
        resent,
        queued_natal: queuedNatal,
        queued_blueprint: queuedBlueprint,
        skipped,
        failed,
        last_error: "line_user_not_found",
      };
    }
    const lineUser = lineSnap.data() || {};
    const appUserId = lineUser?.app_user_id || null;
    const userSnap = appUserId ? await db.collection("users").doc(appUserId).get() : null;
    const user = userSnap?.exists ? userSnap.data() || {} : {};
    await processOne({ appUserId, lineUserId: lineUserIdOpt, user });
  } else if (appUserIdOpt) {
    const userSnap = await db.collection("users").doc(appUserIdOpt).get();
    if (!userSnap.exists) {
      return {
        ok: false,
        error: "app_user_not_found",
        date_local: dateLocal,
        target,
        scanned,
        attempted,
        resent,
        queued_natal: queuedNatal,
        queued_blueprint: queuedBlueprint,
        skipped,
        failed,
        last_error: "app_user_not_found",
      };
    }
    const user = userSnap.data() || {};
    const lineUserId = getLineUserIdFromUserDoc(user);
    await processOne({ appUserId: appUserIdOpt, lineUserId, user });
  } else if (target === "owner") {
    const ownerAppUserId = env2.OWNER_APP_USER_ID;
    if (!ownerAppUserId) throw new Error("OWNER_APP_USER_ID not set");
    const userSnap = await db.collection("users").doc(ownerAppUserId).get();
    const user = userSnap.exists ? userSnap.data() || {} : {};
    const lineUserId = getLineUserIdFromUserDoc(user);
    await processOne({ appUserId: ownerAppUserId, lineUserId, user });
  } else {
    const qsnap = await db
      .collection("users")
      .where("status", "==", "active")
      .where("natal.enabled", "==", true)
      .get();

    for (const doc of qsnap.docs) {
      if (limit && attempted >= limit) break;
      const appUserId = doc.id;
      const user = doc.data() || {};
      const lineUserId = getLineUserIdFromUserDoc(user);
      await processOne({ appUserId, lineUserId, user });
    }
  }

  return {
    ok: failed === 0,
    date_local: dateLocal,
    target,
    dry_run: dryRun,
    scanned,
    attempted,
    resent,
    queued_natal: queuedNatal,
    queued_blueprint: queuedBlueprint,
    skipped,
    failed,
    last_error: lastError,
    items: results,
  };
}

module.exports = { runBlueprintResend };
