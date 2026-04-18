# Review Prompt

Use this prompt when you want to run `sora-observation-copy-check` against a real X or Instagram output.

## Template

```md
Use the `sora-observation-copy-check` skill.

Review this `sora-no-koe` output as a validator.

Channel: <x|ig>
Context:
- change id: <change-id or none>
- layer under review: <presenter|formatter|output|copy>
- file or section: <path or label>

Review goals:
- detect `truth issue`, `tone issue`, and `spacing issue`
- keep upstream story and astronomical truth untouched
- prefer the smallest valid fix

What to review:
```text
<paste rendered output here>
```

Optional source snippet:
```text
<paste relevant presenter/formatter snippet here>
```

Return:
- findings ordered by risk
- category for each finding
- affected section or file
- minimal suggested fix
- say explicitly if no issues are found
```

## First Recommended Use

Start with `X morning`.

Why:

- it usually exposes tone drift clearly
- spacing problems are easy to spot
- it stays close to the presenter layer

## Notes

- Use `ig` when reviewing caption rhythm or section breathing.
- Use `x` when reviewing tighter line-break rhythm.
- If a problem changes meaning or truth, escalate it as a `truth issue`.
