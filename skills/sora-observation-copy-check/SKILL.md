---
name: sora-observation-copy-check
description: Use this skill when reviewing sora-no-koe X or Instagram output text for observation-tone safety, unsupported certainty, presenter-side truth drift, or channel spacing-profile issues. It checks for fortune-telling drift without changing source truth.
---

# sora-observation-copy-check

Use this skill for review tasks on `sora-no-koe` output copy, especially for X and Instagram.

Read these repo rules first when they are relevant:

- `AGENTS.md`
- `docs/sora_shiso_v3_1.md`
- `docs/astro_ssot.md`
- `docs/testing.md`
- `docs/test_commands.md`

For reusable review scaffolds:

- prompt template: `references/review-prompt.md`
- response shape: `references/response-format.md`
- first real run: `references/x-morning-first-review.md`

## What This Skill Checks

- observation-first tone is preserved
- future certainty or absolute claims are absent
- instruction tone or rescue language is absent
- unsupported personalization is absent
- presenter or formatter layers are not patching truth locally
- X spacing follows the tighter profile
- IG spacing follows the wider profile

## Review Categories

Use these categories in findings:

- `truth issue`: local recomputation, hidden reinterpretation, or presenter-side truth patching
- `tone issue`: prediction, destiny framing, action instruction, rescue language, or over-personalization
- `spacing issue`: X or IG output drifting away from the intended blank-line rhythm

## Check Procedure

1. Identify the layer being changed.
2. If the change is in `domain`, `story`, or astronomical computation, treat it as a potential truth issue first.
3. If the change is in `presenters`, `format`, or channel output assembly, verify it does not alter meaning.
4. Read the output as observation text, not as marketing copy.
5. Separate truth issues from tone issues from spacing issues.
6. Recommend the smallest valid fix.

## Do

- report concrete rule violations
- quote or point to the exact risky phrase when possible
- distinguish meaning drift from presentation drift
- prefer local fixes when the issue is local
- keep upstream `story` and astronomical truth untouched

## Do Not

- recompute signs, houses, aspects, rankings, or resonance
- rewrite the output unless the user explicitly asks for a rewrite
- approve based on taste alone
- ask for broad rewrites when a small formatter or presenter fix is enough

## X / IG Spacing Rules

- `x`: keep blank-line rhythm tight; allow at most one blank line between content blocks
- `ig`: allow more breathing room; up to two blank lines is acceptable when the structure is still clear
- if spacing is messy but meaning is intact, classify it as a spacing issue, not a truth issue

## Output Shape

Return findings in this order:

1. risk level
2. category: `truth issue`, `tone issue`, or `spacing issue`
3. affected section or file
4. why it violates the rule
5. minimal suggested fix

If no issues are found, say that explicitly and mention any remaining verification gap.
