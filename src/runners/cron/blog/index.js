"use strict";

const path = require("path");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { acquireCronLock, markCronLock } = require("../shared/locks");
const { writeTextFile, writeJsonFile } = require("../shared/io");
const { buildDailyPlan } = require("./planning");
const { publishDailyPost } = require("./publish");

const BLOG_LOCK_TTL_MS = 20 * 60 * 1000;

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function writeLocalBlogOutput({ outDir, dateLocal, title, content }) {
  const dir = outDir || path.join(process.cwd(), "tmp", "blog", "daily", dateLocal || "unknown");
  const htmlPath = writeTextFile({
    outDir: dir,
    filename: `daily_${dateLocal || "unknown"}.html`,
    content: content || "",
    encoding: "utf8",
  });
  const jsonPath = writeJsonFile({
    outDir: dir,
    filename: `daily_${dateLocal || "unknown"}.json`,
    data: { date_local: dateLocal || null, title: title || "", content: content || "" },
    space: 2,
  });
  return { dir, html_path: htmlPath, json_path: jsonPath };
}

async function runDailyBlog(
  { env, storyService, db },
  {
    dateLocal,
    asOfISO,
    dryRun = false,
    publish = undefined,
    force = false,
    local = false,
    local_only = false,
    localOnly = false,
    local_out_dir = null,
    localOutDir: localOutDirOpt = null,
  }
) {
  const t0 = Date.now();
  const mark = (label, meta = null) => {
    const ms = Date.now() - t0;
    if (meta) {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`, meta);
    } else {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`);
    }
  };

  const env2 = resolveEnv(env);
  const localOnlyFlag = toBool(local ?? local_only ?? localOnly ?? env2.BLOG_DAILY_LOCAL_ONLY, false);
  const localOutDir = String(
    localOutDirOpt ||
    local_out_dir ||
    env2.BLOG_DAILY_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "blog", "daily", dateLocal || "unknown")
  );
  const runDry = !!dryRun || localOnlyFlag;

  mark("start", { dateLocal, dryRun: !!dryRun, force: !!force });
  mark("eyecatch_config", {
    enabled: !!env2.BLOG_EYECATCH_ENABLED,
    mode: env2.BLOG_EYECATCH_BG_MODE || "image",
    preset: env2.BLOG_EYECATCH_PRESET || "C",
    force: !!env2.BLOG_EYECATCH_FORCE,
    bgPath: env2.BLOG_EYECATCH_BG_PATH || null,
  });

  requiredEnv("OPENAI_API_KEY", env2.OPENAI_API_KEY);
  if (!localOnlyFlag) {
    requiredEnv("WP_BASE_URL", env2.WP_BASE_URL);
    requiredEnv("WP_USER", env2.WP_USER);
    requiredEnv("WP_APP_PASSWORD", env2.WP_APP_PASSWORD);
    requiredEnv("WP_CATEGORY_DAILY", env2.WP_CATEGORY_DAILY);
  }

  if (!db && !localOnlyFlag) throw new Error("db is required for blog daily lock");

  const slug = String(dateLocal);

  let lockId = null;
  let lockRunId = null;
  if (!runDry) {
    const id = `blog_daily_${slug}`;
    const lock = await acquireCronLock(db, id, {
      force,
      ttlMs: BLOG_LOCK_TTL_MS,
      meta: { slug },
    });
    if (!lock.ok) {
      mark("lock_skip", { reason: lock.reason, slug });
      mark("end", { ok: true, skipped: true, reason: lock.reason, slug });
      return { ok: true, skipped: true, reason: lock.reason, slug };
    }
    lockRunId = lock.runId;
    lockId = id;
    mark("lock_acquired", { slug, runId: lockRunId });
  }

  try {
    const plan = await buildDailyPlan({
      env: env2,
      storyService,
      dateLocal,
      asOfISO,
      runDry,
      mark,
    });

    if (runDry) {
      mark("end", { ok: true, dryRun: true, slug: plan.slug });
      if (localOnlyFlag) {
        const local = writeLocalBlogOutput({
          outDir: localOutDir,
          dateLocal,
          title: plan.title,
          content: plan.content,
        });
        return {
          ok: true,
          dryRun: true,
          local_only: true,
          slug: plan.slug,
          title: plan.title,
          content: plan.content,
          local_dir: local.dir,
          local_html_path: local.html_path,
          local_json_path: local.json_path,
        };
      }
      return {
        ok: true,
        dryRun: true,
        slug: plan.slug,
        title: plan.title,
        content: plan.content,
      };
    }

    const result = await publishDailyPost({
      env: env2,
      plan,
      publish,
      mark,
    });
    if (lockId) {
      await markCronLock(db, lockId, { status: "done", runId: lockRunId, wpPostId: result?.id || null });
    }
    mark("end", { ok: true, ...(result?.updated ? { updated: true } : {}), ...(result?.created ? { created: true } : {}) });
    return result;
  } catch (e) {
    console.error("[cron/blog/daily] failed:", e?.message || String(e));
    if (e?.stack) console.error(e.stack);
    if (lockId) {
      await markCronLock(db, lockId, { status: "failed", runId: lockRunId, error: e?.message || String(e) });
    }
    throw e;
  }
}

module.exports = { runDailyBlog };
