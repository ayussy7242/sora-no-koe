"use strict";

// lifecycle vocabulary:
// - status: machine execution result or processing status
// - state: user-facing flow position
// - phase: internal multi-step progress inside a feature

const JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
});

const CRON_STATUS = Object.freeze({
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
});

const DELIVERY_STATUS = Object.freeze({
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped",
});

const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  // Transitional compatibility value. Prefer moving queued work into status/phase fields.
  QUEUED: "queued",
});

const USER_FLOW_STATE = Object.freeze({
  PENDING_BIRTH_DATE: "pending_birth_date",
  PENDING_BIRTH_TIME: "pending_birth_time",
  PENDING_BIRTH_PLACE: "pending_birth_place",
  AWAITING_RELATION_CHOICE: "awaiting_relation_choice",
  RELATION_REGISTER_NAME: "relation_register_name",
  RELATION_REGISTER_BIRTH_DATE: "relation_register_birth_date",
  RELATION_REGISTER_BIRTH_TIME: "relation_register_birth_time",
  RELATION_REGISTER_BIRTH_PLACE: "relation_register_birth_place",
  READY: "ready",
});

const BLUEPRINT_PHASE = Object.freeze({
  NOT_READY: "not_ready",
  QUEUED_PDF: "queued_pdf",
  QUEUED_BLUEPRINT: "queued_blueprint",
  RUNNING_BLUEPRINT: "running_blueprint",
  BLUEPRINT_DONE: "blueprint_done",
  BLUEPRINT_FAILED: "blueprint_failed",
});

const NATAL_PHASE = Object.freeze({
  QUEUED_NATAL_CALC: "queued_natal_calc",
  RUNNING_NATAL_CALC: "running_natal_calc",
  NATAL_DONE: "natal_done",
  NATAL_FAILED: "natal_failed",
});

const BLUEPRINT_PHASE_VALUES = new Set(Object.values(BLUEPRINT_PHASE));
const NATAL_PHASE_VALUES = new Set(Object.values(NATAL_PHASE));

function isBlueprintPhaseValue(value) {
  return BLUEPRINT_PHASE_VALUES.has(String(value || ""));
}

function isNatalPhaseValue(value) {
  return NATAL_PHASE_VALUES.has(String(value || ""));
}

function normalizeCompletionStatus(status) {
  const value = String(status || "").toLowerCase();
  if (!value) return value;
  if (value === "done") return JOB_STATUS.SUCCESS;
  return value;
}

module.exports = {
  BLUEPRINT_PHASE,
  CRON_STATUS,
  DELIVERY_STATUS,
  isBlueprintPhaseValue,
  isNatalPhaseValue,
  JOB_STATUS,
  NATAL_PHASE,
  USER_FLOW_STATE,
  USER_STATUS,
  normalizeCompletionStatus,
};
