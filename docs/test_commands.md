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

## Notes

- `local=1` saves outputs under `tmp/safe_prod_outputs/<DATE>/...` and avoids posting.
- `dryRun=1` prevents external posting (LINE/X/IG/WP) but may still read from storage/services.
- Use `scripts/test/safe_prod_outputs.sh` for the safest full run.
