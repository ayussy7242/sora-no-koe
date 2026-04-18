"use strict";

const { safeEqual } = require("../../../../utils/data/equal");
const { createBlueprintLightService } = require("..");
const { createLineApi } = require("../../../../integrations/line/api");
const { setLineUserBlueprintPhase } = require("../../../../integrations/line/state");
const { LINE_COPY } = require("../../../../content/copy");
const dict = require("../../../../content/dict");
const { resolveDisplayNameFromLineUserDoc } = require("../../../../utils/text/display_name");
const { toBool } = require("../../../../utils/data/bool");
const { BLUEPRINT_PHASE, JOB_STATUS, normalizeCompletionStatus } = require("../../../../domain/lifecycle/enums");
const { enqueueBlueprintJob, enqueueBlueprintPdfJob } = require("./queue");
const {
  getJobRef,
  markFailed,
  getNowMillis,
  isLeaseActive,
  nextLeaseMs,
} = require("./state");

function requireTasksCaller({ env, req }) {
  const tokenExpected = env?.INTERNAL_TASKS_TOKEN || null;
  if (!tokenExpected) return { ok: false, status: 500, error: "INTERNAL_TASKS_TOKEN not set" };
  const token = String(req.header("x-internal-tasks-token") || "").trim();
  if (!token || !safeEqual(token, tokenExpected)) {
    return { ok: false, status: 403, error: "invalid token" };
  }
  return { ok: true };
}

function toNumberSafe(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function maxRetryCount(env) {
  return toNumberSafe(env?.BLUEPRINT_RETRY_MAX || process.env.BLUEPRINT_RETRY_MAX, 3);
}

function toMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickDelayedDoneText({ job, env } = {}) {
  if (!job) return null;
  const thresholdMin = toNumberSafe(
    env?.BLUEPRINT_RESEND_NOTICE_MINUTES || process.env.BLUEPRINT_RESEND_NOTICE_MINUTES,
    60
  );
  const baseMs =
    toMillis(job?.created_at) ||
    toMillis(job?.started_at) ||
    toMillis(job?.updated_at) ||
    null;
  if (!baseMs) return null;
  const elapsedMin = (Date.now() - baseMs) / 60000;
  if (elapsedMin >= thresholdMin) return LINE_COPY?.BLUEPRINT_RESEND_NOTICE || null;
  return null;
}

async function logBlueprintEvent({ db, admin, lineUserId, status, stage, error, attempts, extra } = {}) {
  if (!db || !admin || !lineUserId) return;
  try {
    const ref = db.collection("ops_logs").doc("blueprint").collection("items");
    await ref.add({
      line_user_id: lineUserId,
      status: status || null,
      stage: stage || null,
      error: error ? String(error) : null,
      attempts: Number.isFinite(attempts) ? attempts : null,
      extra: extra || null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) { }
}

async function setJobStage({ jobRef, admin, stage, extra } = {}) {
  if (!jobRef || !admin || !stage) return;
  await jobRef.set(
    {
      stage,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      ...(extra || {}),
    },
    { merge: true }
  );
}

async function resolveLineDisplayName(db, lineUserId) {
  if (!db || !lineUserId) return null;
  const snap = await db.collection("line_users").doc(lineUserId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return resolveDisplayNameFromLineUserDoc(data);
}

function formatBlueprintDoneText(text, displayName) {
  if (!text) return text;
  if (!String(text).includes("〇〇さんの")) return text;
  const raw = displayName ? String(displayName).trim() : "";
  if (!raw) return String(text).replace("〇〇さんの", "あなたの");
  const withSan = /さん$/.test(raw) ? raw : `${raw}さん`;
  return String(text).replace("〇〇さんの", `${withSan}の`);
}

async function maybeSendDelayNotice({ env, db, admin, lineUserId, job }) {
  if (!lineUserId || !job) return;
  if (toBool(env?.BLUEPRINT_SKIP_LINE_PUSH || process.env.BLUEPRINT_SKIP_LINE_PUSH || "")) return;
  const delayMinutes = toNumberSafe(env?.BLUEPRINT_DELAY_MINUTES || process.env.BLUEPRINT_DELAY_MINUTES, 30);
  const startedAtMs = toMillis(job.started_at) || toMillis(job.updated_at);
  if (!startedAtMs) return;
  const nowMs = Date.now();
  const elapsedMin = (nowMs - startedAtMs) / 60000;
  if (elapsedMin < delayMinutes) return;

  const alreadySent = job?.notify?.delay_sent_at;
  if (alreadySent) return;

  const accessToken = env?.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return;

  const lineApiClient = createLineApi({ accessToken, maxText: Number(env.MAX_LINE_TEXT || 4800) });
  const message = LINE_COPY.BLUEPRINT_DELAY_NOTICE || "設計図の生成が少し遅れています。もう少し待ってね。";
  await lineApiClient.pushMessages(lineUserId, [{ type: "text", text: message }]);

  await getJobRef(db, lineUserId).set(
    {
      notify: {
        ...(job?.notify || {}),
        delay_sent_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await logBlueprintEvent({
    db,
    admin,
    lineUserId,
    status: "running",
    stage: "delay_notice",
    attempts: toNumberSafe(job.attempts),
    extra: { elapsed_minutes: Math.round(elapsedMin) },
  });
}

async function handleGenerate(req, res, deps) {
  const { env, db, admin, storage } = deps;
  const auth = requireTasksCaller({ env, req });
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const lineUserId = String(req.body?.line_user_id || "").trim();
  if (!lineUserId) return res.status(400).json({ ok: false, error: "line_user_id required" });

  const userSnap = await db.collection("line_users").doc(lineUserId).get();
  if (!userSnap.exists) {
    return res.status(202).json({ ok: true, code: "skipped_user_not_found" });
  }

  const jobRef = getJobRef(db, lineUserId);
  const nowMs = getNowMillis();
  const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });

  const forceRegen = toBool(req.body?.forceRegen || req.body?.force);
  let shouldEnqueue = true;
  let currentStatus = JOB_STATUS.QUEUED;
  let currentSignedUrl = null;
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    const job = snap.exists ? snap.data() : null;
    if (normalizeCompletionStatus(job?.status) === JOB_STATUS.SUCCESS && !forceRegen) {
      currentStatus = JOB_STATUS.SUCCESS;
      shouldEnqueue = false;
      return;
    }
    if (normalizeCompletionStatus(job?.status) === JOB_STATUS.RUNNING && isLeaseActive(job, nowMs)) {
      currentStatus = JOB_STATUS.RUNNING;
      shouldEnqueue = false;
      return;
    }
    tx.set(
      jobRef,
      {
        status: JOB_STATUS.QUEUED,
        line_user_id: lineUserId,
        product: "blueprint_light_v1",
        error: null,
        stage: "queued",
        attempts: job?.attempts ?? 0,
        updated_at: now,
        created_at: job?.created_at || now,
        lease_until: null,
      },
      { merge: true }
    );
    currentStatus = JOB_STATUS.QUEUED;
    shouldEnqueue = true;
  });

  if (currentStatus === JOB_STATUS.SUCCESS) {
    const signed = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
    if (signed?.ok && signed?.url) currentSignedUrl = signed.url;
    return res.status(200).json({ ok: true, status: JOB_STATUS.SUCCESS, signed_url: currentSignedUrl });
  }
  if (!shouldEnqueue) {
    return res.status(202).json({ ok: true, status: currentStatus });
  }
  try {
    await enqueueBlueprintJob({ env, lineUserId, forceRegen });
    await logBlueprintEvent({
      db,
      admin,
      lineUserId,
      status: JOB_STATUS.QUEUED,
      stage: "enqueue",
      attempts: 0,
    });
    return res.status(202).json({ ok: true, status: JOB_STATUS.QUEUED, job_id: lineUserId });
  } catch (e) {
    console.log("[blueprint] enqueue failed:", e?.message || String(e));
    await jobRef.set(
      {
        status: JOB_STATUS.FAILED,
        error: e?.message || String(e),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        stage: "enqueue_failed",
      },
      { merge: true }
    );
    await logBlueprintEvent({
      db,
      admin,
      lineUserId,
      status: JOB_STATUS.FAILED,
      stage: "enqueue_failed",
      error: e?.message || String(e),
    });
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

async function handleStatus(req, res, deps) {
  const { env, db, admin, storage } = deps;
  const auth = requireTasksCaller({ env, req });
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const lineUserId = String(req.query?.line_user_id || "").trim();
  if (!lineUserId) return res.status(400).json({ ok: false, error: "line_user_id required" });

  const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });
  const jobRef = getJobRef(db, lineUserId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    return res.status(200).json({ ok: true, status: "not_ready" });
  }
  const job = snap.data() || {};
  job.status = normalizeCompletionStatus(job.status);
  const nowMs = getNowMillis();

  // Delay notice (running too long)
  if (job.status === JOB_STATUS.RUNNING) {
    await maybeSendDelayNotice({ env, db, admin, lineUserId, job }).catch(() => {});
  }

  if (job.status === JOB_STATUS.RUNNING && !isLeaseActive(job, nowMs)) {
    const exists = await blueprint.hasPdf({ lineUserId, variant: "mobile" }).catch(() => null);
    if (exists?.ok && exists.exists) {
      const signed = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
      const updates = {
        status: JOB_STATUS.SUCCESS,
        error: signed?.ok ? null : signed?.error || job.error || null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        finished_at: admin.firestore.FieldValue.serverTimestamp(),
        lease_until: null,
      };
      if (signed?.ok && signed?.url) updates.signed_url = signed.url;
      await jobRef.set(updates, { merge: true });
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: JOB_STATUS.SUCCESS,
        stage: "status_finalize",
        attempts: toNumberSafe(job.attempts),
      });
      return res.status(200).json({
        ok: true,
        status: JOB_STATUS.SUCCESS,
        signed_url: signed?.ok ? signed.url : (job.signed_url || null),
        error: signed?.ok ? null : (signed?.error || "signing_failed"),
      });
    }
    const attempts = toNumberSafe(job.attempts);
    const maxRetry = maxRetryCount(env);
    const retryable = attempts < maxRetry;
    if (retryable) {
      await enqueueBlueprintJob({ env, lineUserId, forceRegen: true });
      await jobRef.set(
        {
          status: JOB_STATUS.QUEUED,
          stage: "retry_queued",
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
          error: "stale_running",
        },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: JOB_STATUS.QUEUED,
        stage: "retry_queued",
        error: "stale_running",
        attempts,
      });
      return res.status(202).json({ ok: true, status: JOB_STATUS.QUEUED, code: "retry_stale" });
    }
    await jobRef.set(
      {
        status: JOB_STATUS.FAILED,
        stage: "failed_stale",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        finished_at: admin.firestore.FieldValue.serverTimestamp(),
        lease_until: null,
        error: job.error || "stale_running",
      },
      { merge: true }
    );
    await logBlueprintEvent({
      db,
      admin,
      lineUserId,
      status: JOB_STATUS.FAILED,
      stage: "failed_stale",
      error: job.error || "stale_running",
      attempts,
    });
    job.status = JOB_STATUS.FAILED;
  }
  if (job.status !== JOB_STATUS.SUCCESS) {
    const exists = await blueprint.hasPdf({ lineUserId, variant: "mobile" }).catch(() => null);
    if (exists?.ok && exists.exists) {
      const signed = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
      await jobRef.set(
        {
          status: JOB_STATUS.SUCCESS,
          error: signed?.ok ? null : (signed?.error || null),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
          signed_url_mobile: signed?.ok ? signed.url : (job.signed_url_mobile || null),
        },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: JOB_STATUS.SUCCESS,
        stage: "status_finalize",
        attempts: toNumberSafe(job.attempts),
      });
      return res.status(200).json({ ok: true, status: JOB_STATUS.SUCCESS, signed_url: signed?.ok ? signed.url : null });
    }
  }
  if (job.status === JOB_STATUS.SUCCESS) {
    const signed = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
    if (signed?.ok && signed?.url) {
      await jobRef.set(
        { signed_url: signed.url, updated_at: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: JOB_STATUS.SUCCESS,
        stage: "status_refresh",
        attempts: toNumberSafe(job.attempts),
      });
      return res.status(200).json({ ok: true, status: JOB_STATUS.SUCCESS, signed_url: signed.url });
    }
    if (signed?.code === "signing_failed") {
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: JOB_STATUS.SUCCESS,
        stage: "status_signing_failed",
        error: signed?.error || "signing_failed",
        attempts: toNumberSafe(job.attempts),
      });
      return res.status(200).json({
        ok: true,
        status: JOB_STATUS.SUCCESS,
        signed_url: job.signed_url || null,
        error: signed?.error || "signing_failed",
      });
    }
    await jobRef.set(
      {
        status: JOB_STATUS.QUEUED,
        error: "file_not_ready",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        stage: "queued_file_not_ready",
      },
      { merge: true }
    );
    await logBlueprintEvent({
      db,
      admin,
      lineUserId,
      status: JOB_STATUS.QUEUED,
      stage: "queued_file_not_ready",
      error: "file_not_ready",
      attempts: toNumberSafe(job.attempts),
    });
    return res.status(200).json({ ok: true, status: "not_ready" });
  }
  return res.status(200).json({
    ok: true,
    status: job.status || JOB_STATUS.QUEUED,
    signed_url: job.signed_url || null,
    error: job.status === JOB_STATUS.FAILED ? job.error || null : null,
  });
}

function createWorkerHandler({ pdfOnlyRequired = false } = {}) {
  return async (req, res, deps) => {
    const { env, db, admin, storage } = deps;
    const auth = requireTasksCaller({ env, req });
    if (!auth.ok) {
      const maybeLineUserId = String(req.body?.line_user_id || req.body?.lineUserId || "").trim();
      await markFailed({
        db,
        admin,
        lineUserId: maybeLineUserId,
        stage: "auth",
        error: auth.error || "invalid_auth",
      }).catch(() => {});
      return res.status(200).json({ ok: false, nonRetry: true, error: auth.error });
    }

    let body = req.body;
    const rawBodyText = Buffer.isBuffer(body)
      ? body.toString("utf8")
      : typeof body === "string"
        ? body
        : "";
    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(rawBodyText);
      } catch (_e) {
        body = { raw: rawBodyText };
      }
    } else if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_e) {
        body = { raw: body };
      }
    }
    const forceHint =
      typeof rawBodyText === "string" &&
      (/"forceRegen"\s*:\s*true/i.test(rawBodyText) || /"force"\s*:\s*true/i.test(rawBodyText));
  const lineUserId = String(body?.line_user_id || body?.lineUserId || "").trim();
  const forceRun = forceHint || toBool(body?.force || body?.forceRegen || body?.forcePush);
  const forceRegen = forceHint || toBool(body?.forceRegen || body?.force) || forceRun;
  const pdfOnly = pdfOnlyRequired ? true : toBool(body?.pdf_only || body?.pdfOnly);
  const pdfAttempt = Number(body?.pdf_attempt || 0);
  const maxRetry = maxRetryCount(env);
  let attemptCount = 0;
  let currentStage = "init";
  console.log("[blueprint] worker request", {
    line_user_id: lineUserId || null,
    pdf_only: !!pdfOnly,
    pdf_attempt: pdfAttempt || 0,
    force_regen: !!forceRegen,
  });
    if (!lineUserId) {
      await markFailed({
        db,
        admin,
        lineUserId: null,
        stage: "validate_input",
        error: "missing_line_user_id",
        extra: { bodyKeys: Object.keys(req.body || {}) },
      }).catch(() => {});
      return res.status(200).json({ ok: false, nonRetry: true, error: "missing_line_user_id" });
    }

    const jobRef = getJobRef(db, lineUserId);
    const nowMs = getNowMillis();
    let shouldRun = true;
    await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    const job = snap.exists ? snap.data() : null;
    if (normalizeCompletionStatus(job?.status) === JOB_STATUS.SUCCESS && !forceRun) {
      shouldRun = false;
      return;
    }
    if (normalizeCompletionStatus(job?.status) === JOB_STATUS.RUNNING && isLeaseActive(job, nowMs)) {
      shouldRun = false;
      return;
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    attemptCount = toNumberSafe(job?.attempts) + 1;
    tx.set(
      jobRef,
      {
        status: JOB_STATUS.RUNNING,
        error: null,
        stage: "running",
        attempts: attemptCount,
        started_at: now,
        updated_at: now,
        lease_until: nextLeaseMs(nowMs),
        finished_at: null,
      },
      { merge: true }
    );
  });
  if (!shouldRun) {
    return res.status(200).json({ ok: true, code: "skipped" });
  }
  await logBlueprintEvent({
    db,
    admin,
    lineUserId,
    status: JOB_STATUS.RUNNING,
    stage: "running",
    attempts: attemptCount,
  });
  await setLineUserBlueprintPhase({
    db,
    admin,
    lineUserId,
    phase: BLUEPRINT_PHASE.RUNNING_BLUEPRINT,
    eventType: "blueprint_running",
  });

    const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });
    try {
    if (pdfOnly) {
      currentStage = "pdf_render";
      await setJobStage({ jobRef, admin, stage: currentStage });
      const genPdf = await blueprint.renderPdfFromStoredJson({ lineUserId, variant: "mobile", forceRegen });
      currentStage = "signed_url";
      await setJobStage({ jobRef, admin, stage: currentStage });
      const signedMobile = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
      const allowUnsigned = (env.NODE_ENV || process.env.NODE_ENV || "development") !== "production";
      if ((!signedMobile?.ok || !signedMobile?.url) && !allowUnsigned) {
        throw new Error("signed url missing after generate");
      }
      if (signedMobile?.ok && signedMobile?.url) {
        currentStage = "line_push";
        await setJobStage({ jobRef, admin, stage: currentStage });
        const skipPush = toBool(env?.BLUEPRINT_SKIP_LINE_PUSH || process.env.BLUEPRINT_SKIP_LINE_PUSH || "");
        if (!skipPush) {
          const lineApiClient = createLineApi({
            accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
            maxText: Number(env.MAX_LINE_TEXT || 4800),
          });
          const displayName = await resolveLineDisplayName(db, lineUserId);
          const jobSnapForText = await jobRef.get().catch(() => null);
          const jobDataForText = jobSnapForText?.exists ? jobSnapForText.data() : null;
          const baseText =
            pickDelayedDoneText({ job: jobDataForText, env }) ||
            LINE_COPY?.NATAL_DONE ||
            "🌌 Blueprintが完成しました";
          const doneText = formatBlueprintDoneText(baseText, displayName);
          const templateMessage = {
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
                  uri: signedMobile.url,
                },
              ],
            },
          };
          await lineApiClient.pushMessages(lineUserId, [
            { type: "text", text: doneText },
            templateMessage,
          ]);
        } else {
          await logBlueprintEvent({
            db,
            admin,
            lineUserId,
            status: JOB_STATUS.SUCCESS,
            stage: "line_push_skipped",
            attempts: attemptCount,
          });
        }
      }
      await jobRef.set(
        {
          status: JOB_STATUS.SUCCESS,
          stage: "done",
          file_path_mobile: genPdf?.filePath || null,
          signed_url_mobile: signedMobile?.ok ? signedMobile.url : null,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
        },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: JOB_STATUS.SUCCESS,
        stage: "done",
        attempts: attemptCount,
      });
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.BLUEPRINT_DONE,
        eventType: "blueprint_done",
      });
      return res.json({ ok: true, code: "pdf_generated" });
    }

    const pdfAsync = toBool(env?.BLUEPRINT_PDF_ASYNC || process.env.BLUEPRINT_PDF_ASYNC || "");
    currentStage = "generate";
    await setJobStage({ jobRef, admin, stage: currentStage });
    const genMobile = await blueprint.generateAndStore({
      lineUserId,
      forceRegen,
      variant: "mobile",
      skipPdf: pdfAsync,
    });

    if (pdfAsync) {
      currentStage = "queued_pdf";
      await setJobStage({ jobRef, admin, stage: currentStage });
      await enqueueBlueprintPdfJob({
        env,
        lineUserId,
        forceRegen,
        extraPayload: { pdf_only: true, pdf_attempt: 0 },
      });
      await jobRef.set(
        {
          status: BLUEPRINT_PHASE.QUEUED_PDF,
          stage: "queued_pdf",
          file_path_mobile: genMobile?.filePath || null,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
        },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: BLUEPRINT_PHASE.QUEUED_PDF,
        stage: "queued_pdf",
        attempts: attemptCount,
      });
      return res.json({ ok: true, code: "queued_pdf" });
    }

    currentStage = "signed_url";
    await setJobStage({ jobRef, admin, stage: currentStage });
    const signedMobile = await blueprint.getOrCreateSignedUrl({ lineUserId, variant: "mobile" });
    const allowUnsigned = (env.NODE_ENV || process.env.NODE_ENV || "development") !== "production";
    if ((!signedMobile?.ok || !signedMobile?.url) && !allowUnsigned) {
      throw new Error("signed url missing after generate");
    }
    if (signedMobile?.ok && signedMobile?.url) {
      currentStage = "line_push";
      await setJobStage({ jobRef, admin, stage: currentStage });
      const skipPush = toBool(env?.BLUEPRINT_SKIP_LINE_PUSH || process.env.BLUEPRINT_SKIP_LINE_PUSH || "");
      if (!skipPush) {
        const lineApiClient = createLineApi({
          accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
          maxText: Number(env.MAX_LINE_TEXT || 4800),
        });
        const displayName = await resolveLineDisplayName(db, lineUserId);
        const jobSnapForText = await jobRef.get().catch(() => null);
        const jobDataForText = jobSnapForText?.exists ? jobSnapForText.data() : null;
        const baseText =
          pickDelayedDoneText({ job: jobDataForText, env }) ||
          LINE_COPY?.NATAL_DONE ||
          "🌌 Blueprintが完成しました";
        const doneText = formatBlueprintDoneText(baseText, displayName);
        const templateMessage = {
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
                uri: signedMobile.url,
              },
            ],
          },
        };
        await lineApiClient.pushMessages(lineUserId, [
          { type: "text", text: doneText },
          templateMessage,
        ]);
      } else {
        await logBlueprintEvent({
          db,
          admin,
          lineUserId,
          status: JOB_STATUS.SUCCESS,
          stage: "line_push_skipped",
          attempts: attemptCount,
        });
      }
    }
    await jobRef.set(
      {
        status: JOB_STATUS.SUCCESS,
        stage: "done",
        file_path_mobile: genMobile?.filePath || null,
        signed_url_mobile: signedMobile?.ok ? signedMobile.url : null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        finished_at: admin.firestore.FieldValue.serverTimestamp(),
        lease_until: null,
      },
      { merge: true }
    );
    await logBlueprintEvent({
      db,
      admin,
      lineUserId,
      status: JOB_STATUS.SUCCESS,
      stage: "done",
      attempts: attemptCount,
    });
    await setLineUserBlueprintPhase({
      db,
      admin,
      lineUserId,
      phase: BLUEPRINT_PHASE.BLUEPRINT_DONE,
      eventType: "blueprint_done",
    });
    return res.json({ ok: true, code: genMobile?.skipped ? "already_exists" : "generated" });
  } catch (e) {
    const message = String(e?.message || e || "");
    const code = String(e?.code || "");
      const nonRetry =
        message.includes("ai_failed:") ||
        message.includes("validation_failed:") ||
        message.includes("json_parse_failed:") ||
        message.includes("line user not found") ||
        message.includes("missing_") ||
        message.includes("token") ||
        code === "UNAUTHENTICATED" ||
        code === "PERMISSION_DENIED";

      console.log("[blueprint] worker failed:", message);

      if (pdfOnly) {
        const maxRetry = Number(env?.BLUEPRINT_PDF_RETRY_MAX || process.env.BLUEPRINT_PDF_RETRY_MAX || 3);
      if (pdfAttempt < maxRetry) {
        await enqueueBlueprintPdfJob({
          env,
          lineUserId,
          forceRegen,
          extraPayload: { pdf_only: true, pdf_attempt: pdfAttempt + 1 },
        });
        await jobRef.set(
          {
            status: BLUEPRINT_PHASE.QUEUED_PDF,
            error: message,
            stage: "queued_pdf_retry",
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            lease_until: nextLeaseMs(nowMs),
          },
          { merge: true }
        );
        await logBlueprintEvent({
          db,
          admin,
          lineUserId,
          status: BLUEPRINT_PHASE.QUEUED_PDF,
          stage: "queued_pdf_retry",
          error: message,
          attempts: attemptCount,
          extra: { pdf_attempt: pdfAttempt + 1 },
        });
        await setLineUserBlueprintPhase({
          db,
          admin,
          lineUserId,
          phase: BLUEPRINT_PHASE.QUEUED_BLUEPRINT,
          eventType: "blueprint_retry_queued",
        });
        return res.status(200).json({ ok: true, code: "queued_pdf_retry" });
      }
    }

    if (nonRetry) {
      await markFailed({ db, admin, lineUserId, stage: "worker", error: message }).catch(() => {});
      await jobRef.set(
        { finished_at: admin.firestore.FieldValue.serverTimestamp(), lease_until: null, stage: currentStage || "failed" },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: "failed",
        stage: currentStage || "failed",
        error: message,
        attempts: attemptCount,
      });
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.BLUEPRINT_FAILED,
        eventType: "blueprint_failed",
      });
      return res.status(200).json({ ok: false, nonRetry: true, error: message });
    }

    const attempts = attemptCount;
    const retryable = attempts < maxRetry;
    if (retryable) {
      await enqueueBlueprintJob({ env, lineUserId, forceRegen: true });
      await jobRef.set(
        {
          status: "queued",
          stage: "retry_queued",
          error: message,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
        },
        { merge: true }
      );
      await logBlueprintEvent({
        db,
        admin,
        lineUserId,
        status: "queued",
        stage: "retry_queued",
        error: message,
        attempts,
      });
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.QUEUED_BLUEPRINT,
        eventType: "blueprint_retry_queued",
      });
      return res.status(202).json({ ok: true, code: "retry_queued" });
    }

    await markFailed({ db, admin, lineUserId, stage: "worker_unhandled", error: message }).catch(() => {});
    await jobRef.set(
      { finished_at: admin.firestore.FieldValue.serverTimestamp(), lease_until: null, stage: "failed" },
      { merge: true }
    );
    await logBlueprintEvent({
      db,
      admin,
      lineUserId,
      status: "failed",
      stage: "failed",
      error: message,
      attempts,
    });
    await setLineUserBlueprintPhase({
      db,
      admin,
      lineUserId,
      phase: BLUEPRINT_PHASE.BLUEPRINT_FAILED,
      eventType: "blueprint_failed",
    });
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
  };
}

function createBlueprintHandlers(deps) {
  const worker = createWorkerHandler({ pdfOnlyRequired: false });
  const pdfWorker = createWorkerHandler({ pdfOnlyRequired: true });
  return {
    handleGenerate: (req, res) => handleGenerate(req, res, deps),
    handleStatus: (req, res) => handleStatus(req, res, deps),
    handleWorker: (req, res) => worker(req, res, deps),
    handlePdfWorker: (req, res) => pdfWorker(req, res, deps),
  };
}

module.exports = {
  createBlueprintHandlers,
};
