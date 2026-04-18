# X Morning Output Spacing Fix

## Goal

Improve readability of the X morning output by adjusting presentation only.

## Why This Is A Good First Trial

- it stays in presenter or renderer-adjacent code
- it does not require truth-layer changes
- architect can confirm layer ownership quickly
- validator can check ideology and tone drift easily

## Constraints

- do not change `story` generation
- do not change natal or transit truth
- do not recompute sign, house, aspect, ranking, or resonance
- do not rewrite AI prompts for this trial
- do not touch other channels in the same change

## Allowed Change Surface

- spacing between header and body
- empty-line handling
- line-break normalization
- layout order inside the already existing X morning post shape

## Not Allowed

- adding new meaning
- changing the semantic order of upstream facts
- adding CTA, instruction, or conclusion language
- introducing prediction or certainty wording

## Ownership

- `architect`: confirm this is presentation-only and stays in the correct layer
- `renderer`: implement the formatting adjustment
- `validator`: verify ideology, acceptance, and safe-output checks

## Acceptance Criteria

- the post is easier to scan than before
- the meaning of the output is unchanged
- the output remains structure-first
- the output does not drift into fortune-telling language
- verification results are recorded with the task

## Initial Implementation Hint

Start from `src/presenters/x/post.js`, especially `renderXMorningMain()`.
Only inspect `src/runners/cron/x/planning.js` if output assembly needs confirmation.
