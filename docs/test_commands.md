# Safe Output Test Commands

This doc lists safe, prod-like output checks. All commands avoid posting by using `dryRun=1` and/or `local=1`.

## 0) Common Setup

```bash
BASE=http://localhost:8080
DATE=$(date +%Y-%m-%d)
OUT_DIR="$(pwd)/tmp/safe_prod_outputs/$DATE"
CRON_TOKEN=sora-no-koe-daily-2025
```

## 1) One-Click (All in One)

```bash
BASE=http://localhost:8080 DATE=$(date +%Y-%m-%d) CRON_TOKEN=sora-no-koe-daily-2025 ./scripts/test/safe_prod_outputs.sh
```

## 2) Channel-by-Channel (Single Commands)

### Stories (text)

```bash
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=line&outputs=true"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=line_sora&outputs=true"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=line_distribution&outputs=true"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=line_natal&outputs=true"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=x&outputs=true"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=text&channel=threads&outputs=true"
```

### Stories (json)

```bash
curl -s "$BASE/stories?app_user_id=public&mode=public&format=json&channel=line&outputs=true" > "$OUT_DIR/stories_line.json"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=json&channel=x&outputs=true" > "$OUT_DIR/stories_x.json"
curl -s "$BASE/stories?app_user_id=public&mode=public&format=json&channel=threads&outputs=true" > "$OUT_DIR/stories_threads.json"
```

### LINE

```bash
curl -s -X POST "$BASE/cron/daily8?date_local=$DATE&dryRun=1&local=1&local_out_dir=$OUT_DIR/cron/daily8" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/rebuild8?date_local=$DATE&local=1&local_out_dir=$OUT_DIR/cron/rebuild8" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/send8?date_local=$DATE&dryRun=1&local=1&local_out_dir=$OUT_DIR/cron/send8" -H "x-cron-token: $CRON_TOKEN"
```

### IG

```bash
curl -s -X POST "$BASE/cron/ig/story/daily?date_local=$DATE&dryRun=1&local=1&local_out_dir=$OUT_DIR/cron/ig/story" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/ig/post?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/ig/post" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/ig/moon_event?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/ig/moon_event" -H "x-cron-token: $CRON_TOKEN"
```

### X

```bash
curl -s -X POST "$BASE/cron/x/morning?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/morning" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/x/night?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/night" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/x/moon_event?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/moon_event" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/x/next_30_days?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/next_30_days" -H "x-cron-token: $CRON_TOKEN"
```

### BLOG

```bash
curl -s -X POST "$BASE/cron/blog/daily?date_local=$DATE&dryRun=1&publish=0&local=1&local_out_dir=$OUT_DIR/cron/blog/daily" -H "x-cron-token: $CRON_TOKEN"
```

## 3) Purpose-Based (AI Output Checks)

These focus on AI generation outputs, saved locally.

```bash
# IG
curl -s -X POST "$BASE/cron/ig/post?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/ig/post" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/ig/moon_event?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/ig/moon_event" -H "x-cron-token: $CRON_TOKEN"

# X
curl -s -X POST "$BASE/cron/x/morning?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/morning" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/x/night?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/night" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/x/moon_event?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/moon_event" -H "x-cron-token: $CRON_TOKEN"
curl -s -X POST "$BASE/cron/x/next_30_days?date_local=$DATE&dryRun=1&ai=1&local=1&local_out_dir=$OUT_DIR/cron/x/next_30_days" -H "x-cron-token: $CRON_TOKEN"

# BLOG
curl -s -X POST "$BASE/cron/blog/daily?date_local=$DATE&dryRun=1&publish=0&local=1&local_out_dir=$OUT_DIR/cron/blog/daily" -H "x-cron-token: $CRON_TOKEN"
```

## 4) AI Prompt Raw Tests (IG)

These commands show **raw AI output** and **validation verdicts** for specific prompts.
They do not post anywhere. Requires `config/.env` to include OpenAI keys.

### 4.1 IG Moon (SORA_AI_USER_GUIDE_IG_MOON)

```bash
DATE=$(date +%Y-%m-%d)
AS_OF=$(date +"%Y-%m-%dT%H:%M:%S+09:00")

DOTENV_CONFIG_PATH=config/.env node -r dotenv/config -e '
const dict=require("./src/content/dict");
const { createChatCompletion }=require("./src/integrations/openai/openai_client");
const { buildIgMoonPrompt }=require("./src/usecases/channels/ig/ig_moon_ai");
const { runAiTextPipeline }=require("./src/usecases/ai_text");
const { PRESETS }=require("./src/usecases/ai_text/presets");
const { SORA_AI_SYSTEM_PROMPT_COMMON }=require("./src/content/prompts/sora/sora_ai_prompts");

(async()=>{
  const asOf=process.env.AS_OF || process.env.AS_OF_FALLBACK;
  const prompt=buildIgMoonPrompt({story:{}, dict, asOfISO: asOf});
  const text=await createChatCompletion({
    apiKey:process.env.OPENAI_API_KEY,
    baseUrl:process.env.OPENAI_BASE_URL,
    model:process.env.OPENAI_MODEL,
    messages:[
      {role:"system", content:SORA_AI_SYSTEM_PROMPT_COMMON},
      {role:"user", content:prompt}
    ],
    temperature:0.4,
    maxTokens:160
  });
  const verdict=runAiTextPipeline({rawText:text, preset:PRESETS.ig.moon});
  console.log("RAW:", text);
  console.log("VERDICT:", JSON.stringify(verdict, null, 2));
})().catch(e=>{ console.error(e); process.exit(1); });
' AS_OF="$AS_OF"
```

### 4.2 IG Resonance (SORA_AI_USER_GUIDE_IG_RESONANCE)

```bash
DATE=$(date +%Y-%m-%d)
AS_OF=$(date +"%Y-%m-%dT%H:%M:%S+09:00")

# 1) fetch story JSON (public)
curl -s "$BASE/stories?format=json&channel=ig&date_local=$DATE&datetime_local=$AS_OF&outputs=1" \
  > /tmp/story_ig.json

# 2) raw AI + verdict
DOTENV_CONFIG_PATH=config/.env node -r dotenv/config -e '
const fs=require("fs");
const dict=require("./src/content/dict");
const { createChatCompletion }=require("./src/integrations/openai/openai_client");
const { buildIgResonancePrompt }=require("./src/usecases/channels/ig/ig_resonance_ai");
const { ensureIgOutputs }=require("./src/usecases/story/output_helpers");
const { runAiTextPipeline }=require("./src/usecases/ai_text");
const { PRESETS }=require("./src/usecases/ai_text/presets");
const { SORA_AI_SYSTEM_PROMPT_COMMON }=require("./src/content/prompts/sora/sora_ai_prompts");

const data=JSON.parse(fs.readFileSync("/tmp/story_ig.json","utf8"));
const story=data.story || data;
const igOut=ensureIgOutputs(story);
const aspect=story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
igOut.source.resonance_aspect = aspect;

(async()=>{
  const prompt=buildIgResonancePrompt({story, dict});
  const text=await createChatCompletion({
    apiKey:process.env.OPENAI_API_KEY,
    baseUrl:process.env.OPENAI_BASE_URL,
    model:process.env.OPENAI_MODEL,
    messages:[
      {role:"system", content:SORA_AI_SYSTEM_PROMPT_COMMON},
      {role:"user", content:prompt}
    ],
    temperature:0.5,
    maxTokens:520
  });
  const verdict=runAiTextPipeline({rawText:text, preset:PRESETS.ig.resonance});
  console.log("RAW:", text);
  console.log("VERDICT:", JSON.stringify(verdict, null, 2));
})().catch(e=>{ console.error(e); process.exit(1); });
'
```

## Notes

- `local=1` saves outputs under `tmp/safe_prod_outputs/<DATE>/...` and avoids posting.
- `dryRun=1` prevents external posting (LINE/X/IG/WP) but may still read from storage/services.
- Use `scripts/test/safe_prod_outputs.sh` for the safest full run.
