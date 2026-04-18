# Tasks

## 1. Architect Check

- confirm the owning layer for the change
- confirm the change can stay inside `src/presenters/x/post.js`
- confirm no SSOT or truth-layer edits are needed

## 2. Renderer Implementation

- inspect `renderXMorningMain()`
- apply the minimum formatting-only change
- avoid touching AI prompt generation or upstream data assembly

## 3. Validator Review

- check for instruction tone, future certainty, and fortune-telling drift
- check that the output remains observation-first
- check that no truth recomputation was introduced

## 4. Verification

- run the narrowest relevant output check first
- if available, run the safe X morning dry-run command from `docs/test_commands.md`
- record what was run and what was not run

## 5. Closeout

- summarize which layer changed
- summarize verification status
- note any residual risk, especially if AI-generated spacing still varies by content
