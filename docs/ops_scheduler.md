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

## Auth
- Use `x-cron-token` header.
- Token value is managed outside the repo (do not commit secrets).

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

Update header:
```
gcloud scheduler jobs update http sora-x-resonance \
  --project=sora-no-koe \
  --location=asia-northeast1 \
  --update-headers="x-cron-token=REDACTED"
```
