#!/usr/bin/env node
"use strict";

require("../_load_env");

const { getDb } = require("../../src/integrations/firebase/firebase");
const {
  isBlueprintPhaseValue,
  isNatalPhaseValue,
} = require("../../src/domain/lifecycle/enums");

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

function detectLegacyKind(stateValue) {
  if (isBlueprintPhaseValue(stateValue)) return "blueprint";
  if (isNatalPhaseValue(stateValue)) return "natal";
  return "none";
}

function buildAuditRow(doc) {
  const data = doc.data() || {};
  const state = data?.state ?? null;
  const blueprintPhase = data?.blueprint_phase ?? null;
  const natalPhase = data?.natal_phase ?? null;
  const detectedLegacyKind = detectLegacyKind(state);

  let proposedAction = "skip";
  let notes = "";

  if (detectedLegacyKind === "blueprint") {
    if (blueprintPhase && blueprintPhase !== state) {
      proposedAction = "manual_review";
      notes = "state has legacy blueprint phase but blueprint_phase already has a different value";
    } else if (blueprintPhase === state) {
      proposedAction = "skip";
      notes = "already duplicated in blueprint_phase";
    } else {
      proposedAction = "move_to_blueprint_phase";
      notes = "copy legacy state value into blueprint_phase";
    }
  } else if (detectedLegacyKind === "natal") {
    if (natalPhase && natalPhase !== state) {
      proposedAction = "manual_review";
      notes = "state has legacy natal phase but natal_phase already has a different value";
    } else if (natalPhase === state) {
      proposedAction = "skip";
      notes = "already duplicated in natal_phase";
    } else {
      proposedAction = "move_to_natal_phase";
      notes = "copy legacy state value into natal_phase";
    }
  }

  return {
    line_user_id: doc.id,
    current_state: state,
    blueprint_phase: blueprintPhase,
    natal_phase: natalPhase,
    detected_legacy_kind: detectedLegacyKind,
    proposed_action: proposedAction,
    notes,
  };
}

async function main() {
  const db = getDb();
  const lineUserId = String(getArg("line_user_id") || "").trim() || null;
  const limit = toPositiveInt(getArg("limit"), null);
  const format = String(getArg("format", "table")).trim().toLowerCase();

  const rows = [];

  if (lineUserId) {
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (snap.exists) {
      rows.push(buildAuditRow(snap));
    }
  } else {
    const snap = await db.collection("line_users").get();
    for (const doc of snap.docs) {
      const row = buildAuditRow(doc);
      if (row.detected_legacy_kind === "none") continue;
      rows.push(row);
      if (limit && rows.length >= limit) break;
    }
  }

  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.detected_legacy_kind] = (acc[row.detected_legacy_kind] || 0) + 1;
    acc[row.proposed_action] = (acc[row.proposed_action] || 0) + 1;
    return acc;
  }, {
    total: 0,
    blueprint: 0,
    natal: 0,
    skip: 0,
    move_to_blueprint_phase: 0,
    move_to_natal_phase: 0,
    manual_review: 0,
  });

  if (format === "json") {
    console.log(JSON.stringify({ summary, rows }, null, 2));
    return;
  }

  console.log("LEGACY LINE PHASE AUDIT");
  console.log(JSON.stringify(summary, null, 2));
  if (!rows.length) {
    console.log("No legacy line_users.state phase values found.");
    return;
  }

  console.table(rows.map((row) => ({
    line_user_id: row.line_user_id,
    current_state: row.current_state,
    blueprint_phase: row.blueprint_phase,
    natal_phase: row.natal_phase,
    detected_legacy_kind: row.detected_legacy_kind,
    proposed_action: row.proposed_action,
  })));

  const manualReviewRows = rows.filter((row) => row.proposed_action === "manual_review");
  if (manualReviewRows.length) {
    console.log("MANUAL REVIEW");
    for (const row of manualReviewRows) {
      console.log(JSON.stringify(row));
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
