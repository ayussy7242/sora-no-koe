# Lifecycle Vocabulary

This document defines the canonical meaning of lifecycle fields.

## Field Roles

- `status`
  - Machine execution result or processing status.
  - Examples: `queued`, `running`, `success`, `failed`, `skipped`, `sent`, `pending`
- `state`
  - User-facing flow position in onboarding or conversation flow.
  - Examples: `pending_birth_date`, `awaiting_relation_choice`, `ready`
- `phase`
  - Internal multi-step progress inside one feature.
  - Examples: `queued_blueprint`, `running_blueprint`, `blueprint_done`, `queued_natal_calc`

Do not mix these roles in one field when a more specific field is available.

## Canonical Rule

- New implementations must not introduce `done` as a completion value.
- Existing inputs may still contain `done`.
- Read-time normalization should convert `done` to `success`.
- Save-time values, comparisons, and branching should use `success` as the only canonical completion value.

## Canonical Enums

- `JOB_STATUS`
  - `queued`, `running`, `success`, `failed`, `skipped`
- `CRON_STATUS`
  - `running`, `success`, `failed`, `skipped`
- `DELIVERY_STATUS`
  - `pending`, `sent`, `failed`, `skipped`
- `USER_STATUS`
  - `active`, `inactive`
  - `queued` is transitional compatibility vocabulary and should be phased out from account-style status
- `USER_FLOW_STATE`
  - `pending_birth_date`
  - `pending_birth_time`
  - `pending_birth_place`
  - `awaiting_relation_choice`
  - `relation_register_name`
  - `relation_register_birth_date`
  - `relation_register_birth_time`
  - `relation_register_birth_place`
  - `ready`
- `BLUEPRINT_PHASE`
  - `not_ready`
  - `queued_pdf`
  - `queued_blueprint`
  - `running_blueprint`
  - `blueprint_done`
  - `blueprint_failed`
- `NATAL_PHASE`
  - `queued_natal_calc`
  - `running_natal_calc`
  - `natal_done`
  - `natal_failed`

## LINE Field Split

- `users.status`
  - Use `USER_STATUS`
- `line_users.state`
  - Use `USER_FLOW_STATE`
- `line_users.blueprint_phase`
  - Use `BLUEPRINT_PHASE`
- `line_users.natal_phase`
  - Use `NATAL_PHASE`
- `line_users.relation_state`
  - Relation-specific flow state. Keep it aligned with `USER_FLOW_STATE` semantics.

Rules:

- Do not store phase values in `state`
- Do not store flow/state values in `status`
- One field should carry one lifecycle responsibility
- `queued_blueprint`, `running_blueprint`, `blueprint_done`, `blueprint_failed` belong to `BLUEPRINT_PHASE`
- `queued_natal_calc`, `running_natal_calc`, `natal_done`, `natal_failed` belong to `NATAL_PHASE`
- `pending_birth_date` and similar values belong to `USER_FLOW_STATE`

## Migration Notes

- Treat `done` as deprecated vocabulary.
- Prefer classification names such as `USER_STATUS` and `USER_FLOW_STATE` over overloaded `status/state` usage.
- Prefer purpose-based phase names such as `BLUEPRINT_PHASE` and `NATAL_PHASE` for internal multi-step progress.
- `status: "pending_birth_date"` is a field-role mismatch and should be migrated to `state: "pending_birth_date"`.

## Legacy LINE Phase Migration Policy

This policy applies to old `line_users` documents that still store phase values in `state`.

### Legacy Source

- `line_users.state`
  - legacy blueprint phase values:
    - `queued_blueprint`
    - `running_blueprint`
    - `blueprint_done`
    - `blueprint_failed`
  - legacy natal phase values:
    - `queued_natal_calc`
    - `running_natal_calc`

### Target Fields

- blueprint phase values
  - move to `line_users.blueprint_phase`
- natal phase values
  - move to `line_users.natal_phase`

### Migration Rules

- If `state` contains a legacy blueprint phase value:
  - copy that value into `blueprint_phase`
- If `state` contains a legacy natal phase value:
  - copy that value into `natal_phase`
- Do not invent or infer a `USER_FLOW_STATE` value during migration unless it is already known from another source
- Do not overwrite an existing `blueprint_phase` or `natal_phase` value with a weaker inferred value from legacy `state`
- Prefer preserving unknown flow context over guessing

### Source Cleanup

- If `state` contains only a legacy phase value and no known flow value:
  - do not replace it with a guessed flow value during the same migration step
- Clear legacy phase values from `state` only after:
  - the dedicated phase field has been populated, and
  - a safe flow value is already present or separately migrated

### Fallback Removal Condition

Keep `fallbackToLegacyState` enabled only until all of the following are true:

- no live `line_users` documents rely on legacy phase values in `state`
- dedicated phase fields are populated for migrated records
- no application read path still depends on legacy `state` phase values

After those conditions are met:

- disable `fallbackToLegacyState`
- remove legacy fallback logic from phase readers
