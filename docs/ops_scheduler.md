# Cloud Scheduler Notes

Project: sora-no-koe  
Region: asia-northeast1  
Base URL: https://sora-no-koe-v2-256321662770.asia-northeast1.run.app

## Jobs
- `sora-x-resonance`
  - Schedule: `0 14 * * *` (Asia/Tokyo)
  - Method: `POST`
  - URL: `/cron/x/resonance`
  - Behavior: app-side condition (orb <= 0.5) determines skip/post
- `sora-ig-monthly`
  - Schedule: `0 7 1 * *` (Asia/Tokyo)
  - Method: `POST`
  - URL: `/cron/ig/monthly`
  - Behavior: posts monthly overview carousel for the month
- `ig-monthly-overview-reel`
  - Schedule: `0 9 1 * *` (Asia/Tokyo)
  - Method: `POST`
  - URL: `/cron/ig/monthly_overview_reel?fps=2&outroSeconds=1.5&video=1`
  - Behavior: posts the monthly overview reel video for the month

## Auth
- Use `x-cron-token` header.
- Token value is managed outside the repo (do not commit secrets).
- Monthly carousel and monthly reel are separate Scheduler jobs.
- When rotating the cron token, update both `sora-ig-monthly` and `ig-monthly-overview-reel`.

## CLI (examples)
Create:
```
gcloud scheduler jobs create http sora-x-resonance \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --schedule="0 14 * * *" \
  --time-zone="Asia/Tokyo" \
  --http-method=POST \
  --uri="https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/cron/x/resonance" \
  --headers="x-cron-token=REDACTED"
```

Create monthly IG job:
```
gcloud scheduler jobs create http sora-ig-monthly \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --schedule="0 7 1 * *" \
  --time-zone="Asia/Tokyo" \
  --http-method=POST \
  --uri="https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/cron/ig/monthly" \
  --headers="x-cron-token=REDACTED"
```

Create monthly IG reel job:
```
gcloud scheduler jobs create http ig-monthly-overview-reel \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --schedule="0 9 1 * *" \
  --time-zone="Asia/Tokyo" \
  --http-method=POST \
  --uri="https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/cron/ig/monthly_overview_reel?fps=2&outroSeconds=1.5&video=1" \
  --headers="x-cron-token=REDACTED" \
  --headers="Content-Type=application/json" \
  --message-body="{}"
```

Update header:
```
gcloud scheduler jobs update http sora-x-resonance \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --update-headers="x-cron-token=REDACTED"
```

Update monthly job headers:
```
gcloud scheduler jobs update http sora-ig-monthly \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --update-headers="x-cron-token=REDACTED"

gcloud scheduler jobs update http ig-monthly-overview-reel \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --update-headers="x-cron-token=REDACTED"
```
