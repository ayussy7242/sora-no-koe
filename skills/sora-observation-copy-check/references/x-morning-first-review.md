# X Morning First Review

Use this for the first real run of `sora-observation-copy-check`.

## 1. Fetch A Safe Review Target

Use one of these:

```bash
BASE=http://localhost:8080
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=x_morning&outputs=true"
```

or

```bash
BASE=http://localhost:8080
DATE=$(date +%Y-%m-%d)
OUT_DIR="$(pwd)/tmp/safe_prod_outputs/$DATE"
CRON_TOKEN=sora-no-koe-daily-2025

curl -s -X POST "$BASE/cron/x/morning?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/morning" \
  -H "x-cron-token: $CRON_TOKEN"
```

## 2. Review Input

Paste the rendered output into this prompt:

```md
Use the `sora-observation-copy-check` skill.

Review this `sora-no-koe` output as a validator.

Channel: x
Context:
- change id: 2026-04-18-x-morning-spacing-fix
- layer under review: presenter
- file or section: src/presenters/x/post.js :: renderXMorningMain()

Review goals:
- detect `truth issue`, `tone issue`, and `spacing issue`
- keep upstream story and astronomical truth untouched
- prefer the smallest valid fix

What to review:
```text
<paste x morning rendered output here>
```

Optional source snippet:
```text
function renderXMorningMain(story, deps = {}) {
  const { formatXAiText } = require("../../usecases/channels/x/ai/common");
  const rawAi = String(story?.meta?.x_ai?.morning || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const asOfISO = story?.meta?.as_of || null;
  const dateLocal = story?.meta?.date_local || story?.public?.date_local ||
    (asOfISO ? toDateLocalJST(new Date(asOfISO)) : "");
  const dateLabel = formatDateLabel(dateLocal);
  const timeLabel = formatJstTimeLabel(asOfISO);
  const header = `🌌 今日の空｜${[dateLabel, timeLabel].filter(Boolean).join(" ")}`.trim();

  const baseLines = [header];
  if (ai) baseLines.push("", ai);
  return normalizeSpacing(joinLines(baseLines, { trim: true, collapseBlank: true }), "x");
}
```

Return:
- findings ordered by risk
- category for each finding
- affected section or file
- minimal suggested fix
- say explicitly if no issues are found
```

## 3. What To Look For

On the first run, focus only on:

- are findings too fine-grained or too broad
- does `truth / tone / spacing` feel balanced
- is the response temperature too strong or too weak

## 4. Good First Outcome

A good first outcome is one of these:

- no issues found, with a small verification gap note
- one small `spacing issue`
- one small `tone issue`

If the review starts surfacing many `truth issue` findings for this target, the skill is probably too aggressive for a presenter-only review.
