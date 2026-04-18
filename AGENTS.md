# AGENTS.md

This repository is a structure-first system for `sora-no-koe`.

## Mission

- Treat `sora-no-koe` as an observation system, not fortune telling.
- Preserve structure, not persuasion.
- Keep interpretation and final judgment with humans.

## Repo Priorities

- Read `README.md` first for architecture and operating constraints.
- Treat `docs/astro_ssot.md` as the astronomical SSOT.
- Treat `docs/sora_shiso_v3_1.md` as the language and ideology SSOT.
- Treat `docs/testing.md` and `docs/test_commands.md` as the verification baseline.

## Non-Negotiable Product Rules

- Do not turn outputs into fortune telling.
- Do not introduce future certainty, destiny claims, or absolute wording.
- Do not introduce action commands or rescue language.
- Keep the subject on configuration, structure, angle, overlap, pressure, or resonance.
- Do not over-personalize with fixed statements about the user.
- Do not add meaning that is not grounded in existing specs or data.

## Engineering Rules

- SSOT for transit truth is the `story` pipeline.
- SSOT for natal truth is `natal_cache`.
- Renderers and presenters must not recompute astronomical truth.
- Prefer extending shared domain and usecase layers over channel-specific logic.
- Keep routes thin.
- Keep rendering separate from calculation and selection logic.
- Do not reintroduce duplicated aspect or sign logic in channel code.

## Change Rules

- Make the smallest change that satisfies the approved spec.
- If a spec is unclear or unapproved, stop implementation and ask for approval.
- Do not invent scope outside the requested change.
- Preserve existing channel behavior unless the task explicitly changes it.
- Prefer fixing the shared source over patching multiple outputs independently.

## Output Rules

- Observation copy must not close with a conclusion or instruction.
- Avoid causal wording such as "because", "therefore", or direct predictions unless the spec explicitly requires it.
- Avoid frequent body-name or sign-name repetition in prose outside approved formats.
- Channel formatting may change presentation, but must not change truth.

## Verification

- Run the narrowest relevant test first, then broader checks if needed.
- For text-output changes, use the safe output commands in `docs/test_commands.md` when possible.
- For behavior changes, prefer targeted tests near the touched modules.
- Call out any verification you could not run.

## Preferred Workflow

1. Confirm the relevant SSOT docs.
2. Identify the narrowest layer that owns the change.
3. Implement with scope discipline.
4. Verify with targeted tests or safe output checks.
5. Report assumptions, risks, and verification status.
