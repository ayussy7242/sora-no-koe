# Cron Shared Boundaries

This note captures the current shared boundaries for cron refactoring.

## Shared policy

- `src/runners/cron/shared/policy/execution.js`
  - Decides execution policy.
  - Owns lock enablement, lock key, dry-run lock behavior, and failure persistence intent.
- `src/runners/cron/shared/policy/x_result.js`
  - Defines X result vocabulary.
  - Owns `status`, `reason`, `persistFailure`, and `markAsSuccess`.

## Shared gates

- `src/runners/cron/shared/lock.js`
  - Reads execution policy lock settings.
  - Acquires or skips.
- `src/runners/cron/shared/marking.js`
  - Reads `markAsSuccess`.
  - Marks success or failed.
  - Does not mark skipped runs.
- `src/runners/cron/shared/failure.js`
  - Reads `persistFailure`.
  - Gates persistence only.

## Result meanings

External result vocabulary should stay small.

- `success`
  - Completed with no retained anomaly.
- `partial_success`
  - Completed, but should still retain failure context.
- `failed`
  - Did not complete and should retain failure context.
- `skipped_lock`
  - Not executed because lock was not acquired.
- `skipped_duplicate`
  - Intentionally not executed because duplicate content was detected.

`partial_success` is treated as:

- `markAsSuccess: true`
- `persistFailure: true`

Skip reasons are not treated as operational anomalies by default.

`partial_success` is a completed run, but it can still be a failure-persistence target.

## Internal reasons

Internal reasons may stay more specific than external result status.

- Examples:
  - `all_excluded`
  - `orb_too_wide`
  - `no_candidates`
  - `ai_generation_failed`
  - `build_failed`
  - `publish_failed`

These reasons are inputs to result selection, not a requirement to expand external status vocabulary.
