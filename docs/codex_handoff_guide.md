# Codex Handoff Guide

This project uses a small handoff JSON to make Codex execution explicit.

## Purpose

- keep implementation scoped
- declare which subagents should participate
- anchor every change to spec and verification
- prevent unapproved work from moving forward

## Default Flow

1. Fill `.codex/handoff.template.json` for the requested change.
2. Keep `approval.approved` as `false` until the change is actually approved.
3. Run `architect` first to confirm layer ownership and scope.
4. Run `renderer` only when the change is presentation-only.
5. Run `validator` before closing the task.

## Recommended First Use

Use this template first for:

- X, IG, LINE, Threads, BLOG, or PDF presentation tweaks
- observation copy adjustments
- formatting fixes that should not alter truth

Avoid using the first trial for:

- astronomical truth changes
- multi-channel redesigns
- large state-machine changes
- simultaneous workflow and architecture refactors

## Minimal Example

```json
{
  "version": "1.0",
  "project": "sora-no-koe",
  "status": "approved",
  "execution": {
    "executor": "codex",
    "sandbox_mode": "workspace-write",
    "subagents": ["architect", "validator", "renderer"]
  },
  "request": {
    "goal": "Tighten spacing in IG caption output without changing meaning.",
    "change_type": "presentation-only",
    "channel": "instagram",
    "summary": "Adjust formatting only."
  },
  "scope": {
    "in_scope": ["caption spacing", "line breaks"],
    "out_of_scope": ["story truth", "ranking logic", "prompt redesign"],
    "affected_paths": ["src/engine/renderers", "src/presenters"]
  },
  "spec_refs": [
    "README.md",
    "docs/astro_ssot.md",
    "docs/sora_shiso_v3_1.md",
    "docs/testing.md",
    "docs/test_commands.md"
  ],
  "approval": {
    "required": true,
    "approved": true,
    "approved_by": "human",
    "approved_at": "2026-04-18T00:00:00+09:00"
  }
}
```

## Notes

- `architect` protects boundaries and SSOT.
- `renderer` is optional; use it only for presentation-layer work.
- `validator` should always confirm spec and verification coverage.
