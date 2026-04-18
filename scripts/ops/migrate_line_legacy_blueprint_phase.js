#!/usr/bin/env node
"use strict";

require("../_load_env");

const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const { isBlueprintPhaseValue } = require("../../src/domain/lifecycle/enums");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function toPositiveInt(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid positive number: ${value}`);
  return Math.floor(n);
}

function toBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return fallback;
}

function inspectDoc(doc) {
  const data = doc.data() || {};
  const state = data?.state ?? null;
  const blueprintPhase = data?.blueprint_phase ?? null;

  if (!isBlueprintPhaseValue(state)) {
    return {
      line_user_id: doc.id,
      current_state: state,
      blueprint_phase: blueprintPhase,
      eligible: false,
      action: "skip",
      notes: "state is not a legacy blueprint phase value",
    };
  }

  if (blueprintPhase && blueprintPhase !== state) {
    return {
      line_user_id: doc.id,
      current_state: state,
      blueprint_phase: blueprintPhase,
      eligible: false,
      action: "manual_review",
      notes: "blueprint_phase already has a different value",
    };
  }

  if (blueprintPhase === state) {
    return {
      line_user_id: doc.id,
      current_state: state,
      blueprint_phase: blueprintPhase,
      eligible: false,
      action: "skip",
      notes: "blueprint_phase already matches legacy state",
    };
  }

  return {
    line_user_id: doc.id,
    current_state: state,
    blueprint_phase: blueprintPhase,
    eligible: true,
    action: "copy_state_to_blueprint_phase",
    notes: "safe to copy legacy state value into blueprint_phase",
  };
}

async function main() {
  const db = getDb();
  const apply = toBool(getArg("apply"), false);
  const lineUserId = String(getArg("line_user_id") || "").trim() || null;
  const limit = toPositiveInt(getArg("limit"), null);
  const format = String(getArg("format", "table")).trim().toLowerCase();

  const inspected = [];
  const candidates = [];

  if (lineUserId) {
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (snap.exists) {
      const row = inspectDoc(snap);
      inspected.push(row);
      if (row.eligible) candidates.push(row);
    }
  } else {
    const snap = await db.collection("line_users").get();
    for (const doc of snap.docs) {
      const row = inspectDoc(doc);
      if (row.action === "skip" && row.notes === "state is not a legacy blueprint phase value") continue;
      inspected.push(row);
      if (row.eligible) candidates.push(row);
      if (limit && inspected.length >= limit) break;
    }
  }

  let applied = 0;
  if (apply) {
    for (const row of candidates) {
      await db.collection("line_users").doc(row.line_user_id).set(
        {
          blueprint_phase: row.current_state,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          meta: {
            last_event_type: "legacy_blueprint_phase_migration",
            last_seen_at: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
      applied += 1;
    }
  }

  const summary = {
    apply,
    inspected: inspected.length,
    eligible: candidates.length,
    applied,
    skipped: inspected.filter((row) => row.action === "skip").length,
    manual_review: inspected.filter((row) => row.action === "manual_review").length,
  };

  if (format === "json") {
    console.log(JSON.stringify({ summary, rows: inspected }, null, 2));
    return;
  }

  console.log("LEGACY LINE BLUEPRINT PHASE MIGRATION");
  console.log(JSON.stringify(summary, null, 2));
  if (!inspected.length) {
    console.log("No legacy blueprint phase records found.");
    return;
  }

  console.table(inspected.map((row) => ({
    line_user_id: row.line_user_id,
    current_state: row.current_state,
    blueprint_phase: row.blueprint_phase,
    eligible: row.eligible,
    action: row.action,
  })));

  const reviewRows = inspected.filter((row) => row.action === "manual_review");
  if (reviewRows.length) {
    console.log("MANUAL REVIEW");
    for (const row of reviewRows) {
      console.log(JSON.stringify(row));
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
