# Chatbot

Rails 8 real-time chat app (Action Cable, Solid Cache/Queue/Cable).

## Local development

```bash
bin/setup
bin/dev
```

Visit http://localhost:3000

## Deploy on Render

This repo includes [`render.yaml`](render.yaml) and [`bin/render-build.sh`](bin/render-build.sh) for [Render Blueprint](https://render.com/docs/blueprint-spec) deployment.

### 1. Push to GitHub

Commit and push this repository to GitHub (or GitLab/Bitbucket).

### 2. Create services (Blueprint)

1. Open [Render Dashboard](https://dashboard.render.com) → **Blueprints** → **New Blueprint Instance**
2. Connect the repository and approve the blueprint
3. When prompted, set **`RAILS_MASTER_KEY`** to the contents of `config/master.key` (local file, not in git)

Render creates a **Web Service** (`chatbot`) and **PostgreSQL** (`chatbot-db`) and wires `DATABASE_URL` automatically.

### 3. Media uploads (S3)

Render’s filesystem is ephemeral. For image/video/audio messages, add these environment variables on the **chatbot** web service:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | IAM secret |
| `AWS_REGION` | e.g. `us-east-1` |
| `AWS_BUCKET` | S3 bucket name |

Text-only chat works without S3; attachments require it.

### 4. Manual deploy (without Blueprint)

Create a **PostgreSQL** database and a **Ruby Web Service** in the same region:

| Setting | Value |
|---------|--------|
| Build Command | `./bin/render-build.sh` |
| Start Command | `bundle exec puma -C config/puma.rb` |
| `DATABASE_URL` | Internal URL from your Postgres instance |
| `RAILS_MASTER_KEY` | From `config/master.key` |
| `RAILS_ENV` | `production` |
| `SOLID_QUEUE_IN_PUMA` | `1` |
| `WEB_CONCURRENCY` | `2` |

### 5. Open the app

After the first deploy succeeds, open your `*.onrender.com` URL. Health check: `/up`.

### Custom domain

Set `APP_HOST` to your domain (e.g. `chat.example.com`) on the web service.

## Environment reference

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes (production) | Set by Render when DB is linked |
| `RAILS_MASTER_KEY` | Yes | Decrypts `config/credentials.yml.enc` |
| `RAILS_ENV` | Yes | `production` on Render |
| `SOLID_QUEUE_IN_PUMA` | Recommended | Runs Solid Queue inside Puma (single dyno) |
| `WEB_CONCURRENCY` | Recommended | `2` avoids OOM on small instances |
| `RENDER_EXTERNAL_URL` | Auto | Set by Render; used for hosts and Action Cable |
| `AWS_*` | For media | S3 Active Storage |
