# Response Format

Use this response shape when returning findings from `sora-observation-copy-check`.

## If Issues Exist

```md
Risk: <high|medium|low>

1. <short finding title>
Category: <truth issue|tone issue|spacing issue>
Affected: <file, function, or output section>
Why: <one short rule-based explanation>
Minimal fix: <smallest valid correction>

2. <short finding title>
Category: <truth issue|tone issue|spacing issue>
Affected: <file, function, or output section>
Why: <one short rule-based explanation>
Minimal fix: <smallest valid correction>
```

## If No Issues Exist

```md
No issues found.

Checked:
- <tone / spacing / truth boundary>

Remaining gap:
- <verification gap or "none">
```

## Guidance

- Keep findings concrete and small.
- Do not give style-only feedback unless it affects rule compliance.
- Prefer one finding per distinct rule violation.
- If spacing is the only problem, do not escalate it as tone or truth.
- If presenter code changes meaning, classify it as a `truth issue`.
