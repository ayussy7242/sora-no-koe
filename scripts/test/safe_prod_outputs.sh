#!/usr/bin/env bash
set -euo pipefail

# Safe, prod-like output checks (no posting)
# Usage:
#   CRON_TOKEN=... BASE=http://localhost:8080 DATE=2026-03-31 ./scripts/test/safe_prod_outputs.sh

BASE="${BASE:-http://localhost:8080}"
DATE="${DATE:-$(date +%Y-%m-%d)}"
CRON_TOKEN="${CRON_TOKEN:-}"
LOCAL="${LOCAL:-1}"
OUT_DIR="${OUT_DIR:-$(pwd)/tmp/safe_prod_outputs/${DATE}}"
ENV_FILE="${ENV_FILE:-env-vars.yaml}"
ENV_DOTENV="${ENV_DOTENV:-config/.env}"

load_dotenv() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  . "$file"
  set +a
}

load_env_yaml() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  # Simple KEY: "VALUE" loader (no nested YAML)
  while IFS= read -r line; do
    # skip comments/blank
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    # only parse KEY: VALUE lines
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*:[[:space:]]*(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      # strip quotes
      val="${val%\"}"; val="${val#\"}"
      val="${val%\'}"; val="${val#\'}"
      export "$key"="$val"
    fi
  done < "$file"
}

# Load config/.env first (local dev), then env-vars.yaml as fallback/override
load_dotenv "$ENV_DOTENV"
load_env_yaml "$ENV_FILE"
# Allow explicit CRON_TOKEN override after loading env file
CRON_TOKEN="${CRON_TOKEN:-}"

if [ -z "$CRON_TOKEN" ]; then
  echo "CRON_TOKEN is required for /cron endpoints" >&2
  echo "Set CRON_TOKEN=... and retry" >&2
  exit 1
fi

if [ -z "${IG_USER_ID:-}" ]; then
  if [ "$LOCAL" != "1" ]; then
    echo "WARN: IG_USER_ID is not set. /cron/ig/post may fail even in dryRun." >&2
    echo "Set IG_USER_ID in env-vars.yaml or export it before running." >&2
  fi
fi

hdr=("-H" "x-cron-token: ${CRON_TOKEN}")
mkdir -p "$OUT_DIR"

local_qs() {
  if [ "$LOCAL" = "1" ]; then
    echo "local=1&local_out_dir=$1"
  else
    echo ""
  fi
}

run() {
  echo "+ $*" >&2
  "$@"
}

# -------------------- story outputs (safe GET) --------------------
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=text&channel=line&outputs=true" | head -n 5
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=text&channel=line_sora&outputs=true" | head -n 5
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=text&channel=line_distribution&outputs=true" | head -n 5
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=text&channel=line_natal&outputs=true" | head -n 5
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=text&channel=x&outputs=true" | head -n 5
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=text&channel=threads&outputs=true" | head -n 5

run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=json&channel=line&outputs=true" > "${OUT_DIR}/stories_line.json"
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=json&channel=x&outputs=true" > "${OUT_DIR}/stories_x.json"
run curl -s "${BASE}/stories?app_user_id=public&mode=public&format=json&channel=threads&outputs=true" > "${OUT_DIR}/stories_threads.json"

# -------------------- LINE daily (safe: dryRun) --------------------
run curl -s -X POST "${BASE}/cron/daily8?date_local=${DATE}&dryRun=1&$(local_qs "${OUT_DIR}/cron/daily8")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/rebuild8?date_local=${DATE}&$(local_qs "${OUT_DIR}/cron/rebuild8")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/send8?date_local=${DATE}&dryRun=1&$(local_qs "${OUT_DIR}/cron/send8")" "${hdr[@]}"

# -------------------- IG (safe: dryRun) --------------------
run curl -s -X POST "${BASE}/cron/ig/story/daily?date_local=${DATE}&dryRun=1&$(local_qs "${OUT_DIR}/cron/ig/story")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/ig/post?date_local=${DATE}&dryRun=1&ai=1&$(local_qs "${OUT_DIR}/cron/ig/post")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/ig/moon_event?date_local=${DATE}&dryRun=1&ai=1&$(local_qs "${OUT_DIR}/cron/ig/moon_event")" "${hdr[@]}"

# -------------------- X (safe: dryRun) --------------------
run curl -s -X POST "${BASE}/cron/x/morning?date_local=${DATE}&dryRun=1&ai=1&$(local_qs "${OUT_DIR}/cron/x/morning")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/x/night?date_local=${DATE}&dryRun=1&ai=1&$(local_qs "${OUT_DIR}/cron/x/night")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/x/moon_event?date_local=${DATE}&dryRun=1&ai=1&$(local_qs "${OUT_DIR}/cron/x/moon_event")" "${hdr[@]}"
run curl -s -X POST "${BASE}/cron/x/next_30_days?date_local=${DATE}&dryRun=1&ai=1&$(local_qs "${OUT_DIR}/cron/x/next_30_days")" "${hdr[@]}"

# -------------------- Blog (safe: dryRun) --------------------
run curl -s -X POST "${BASE}/cron/blog/daily?date_local=${DATE}&dryRun=1&publish=0&$(local_qs "${OUT_DIR}/cron/blog/daily")" "${hdr[@]}"

echo "[safe_prod_outputs] done" >&2
