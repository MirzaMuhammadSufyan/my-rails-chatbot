# Chatbot

Rails 8 real-time chat app (Action Cable, Solid Cache/Queue/Cable).

## Local development

```bash
bin/setup
bin/dev
```

Visit http://localhost:3000

## Deploy on Render

This repo deploys on Render via **Docker** ([`Dockerfile`](Dockerfile) + [`render.yaml`](render.yaml)).

### 1. Push to GitHub

Commit and push this repository to GitHub (or GitLab/Bitbucket).

### 2. Create services (Blueprint)

1. Open [Render Dashboard](https://dashboard.render.com) → **Blueprints** → **New Blueprint Instance**
2. Connect the repository and approve the blueprint
3. When prompted, set **`RAILS_MASTER_KEY`** (see below)

Render creates a **Web Service** (`chatbot`) and **PostgreSQL** (`chatbot-db`) and wires `DATABASE_URL` automatically.

### 3. Required secret (fixes `Missing secret_key_base`)

Render **must** have one of these on the **chatbot** web service → **Environment**:

**Option A — `RAILS_MASTER_KEY` (recommended)**

```bash
cat config/master.key
```

Paste the full value into Render. If you don't have `config/master.key` locally:

```bash
bin/rails credentials:edit
```

**Option B — `SECRET_KEY_BASE`**

```bash
bin/rails secret
```

Paste the output as `SECRET_KEY_BASE` on Render (skip `RAILS_MASTER_KEY` if you use this).

Redeploy after saving env vars.

### 4. Media uploads (S3)

Render’s filesystem is ephemeral. For image/video/audio messages, add these environment variables on the **chatbot** web service:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | IAM secret |
| `AWS_REGION` | e.g. `us-east-1` |
| `AWS_BUCKET` | S3 bucket name |

Text-only chat works without S3; attachments require it.

### 5. Manual deploy (without Blueprint)

Create a **PostgreSQL** database and a **Docker Web Service** in the same region. Render auto-detects the `Dockerfile`.

| Setting | Value |
|---------|--------|
| `DATABASE_URL` | Internal URL from your Postgres instance |
| `RAILS_MASTER_KEY` or `SECRET_KEY_BASE` | See step 3 above |
| `RAILS_ENV` | `production` |
| `SOLID_QUEUE_IN_PUMA` | `1` |
| `WEB_CONCURRENCY` | `2` |

### 6. Open the app

After the first deploy succeeds, open your `*.onrender.com` URL. Health check: `/up`.

### Custom domain

Set `APP_HOST` to your domain (e.g. `chat.example.com`) on the web service.

## Environment reference

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes (production) | Set by Render when DB is linked |
| `RAILS_MASTER_KEY` | One of these two | Decrypts credentials; from `config/master.key` |
| `SECRET_KEY_BASE` | One of these two | Alternative: output of `bin/rails secret` |
| `RAILS_ENV` | Yes | `production` on Render |
| `SOLID_QUEUE_IN_PUMA` | Recommended | Runs Solid Queue inside Puma (single dyno) |
| `WEB_CONCURRENCY` | Recommended | `2` avoids OOM on small instances |
| `RENDER_EXTERNAL_URL` | Auto | Set by Render; used for hosts and Action Cable |
| `AWS_*` | For media | S3 Active Storage |
