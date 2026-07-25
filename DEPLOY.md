# Hosting NeuroBridge Academy

The app is a standard Next.js 16 server app plus Postgres. `npm run build` passes,
and every page is server-rendered on demand, so any Node host works. Uploaded
documents live in Postgres (not on disk), so no file storage is needed.

## This project's database: Supabase

Your project ref appears in your Supabase dashboard URL. Substitute it below.

That `supabase.co` URL is the **API** endpoint — Prisma can't use it. You need the
**Postgres connection string**, from
*Dashboard → Project Settings → Database → Connection string → URI*:

```
postgresql://postgres:<YOUR-DB-PASSWORD>@db.<project-ref>.supabase.co:5432/postgres
```

Put it in `.env` (gitignored — never paste a password into chat or a commit):

```bash
DATABASE_URL="postgresql://postgres:<YOUR-DB-PASSWORD>@db.<project-ref>.supabase.co:5432/postgres"
```

### ⚠️ The direct host is IPv6-only — use the pooler

`db.<project-ref>.supabase.co` publishes **no A record** (IPv4); it resolves only
to IPv6. On a network without IPv6 — which includes this development machine —
every connection fails with `EHOSTUNREACH`, and Prisma just reports that it
"can't reach the database server". Verified:

```
resolve4 db.<project-ref>.supabase.co -> ENODATA        (no IPv4)
resolve6 db.<project-ref>.supabase.co -> 2600:1f18:...  (IPv6 only)
tcp      [2600:1f18:...]:5432                -> EHOSTUNREACH
```

Use the **Supavisor pooler** instead — it has IPv4. Copy it from
*Project Settings → Database → Connection pooling*; note the username becomes
`postgres.<project-ref>`:

```
# Session mode (port 5432) — use for `prisma db push`, seeds, and the crawler
postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Transaction mode (port 6543) — use for DATABASE_URL on Vercel at runtime
postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Take `<region>` from the dashboard string (e.g. `us-east-1`, `ap-south-1`) — it
must match your project. Session mode handles schema changes; transaction mode is
the one that survives serverless connection churn. (Supabase also sells an IPv4
add-on for the direct host if you'd rather not use the pooler.)

Supabase's own `anon`/`service_role` keys aren't used: the app talks to Postgres
directly through Prisma and does its own auth.

## Recommended: Vercel + Supabase

Vercel runs Next.js natively; the database is separate because Vercel's own
storage is ephemeral.

1. **Database** — the Supabase project above (or [Neon](https://neon.tech),
   Railway…). Copy the connection string.
2. **Push the code** — the repo already has a remote:
   ```bash
   git push origin phases-1-3-multi-tenant
   ```
3. **Import the repo** into Vercel and set the environment variables from
   [`.env.example`](.env.example):
   - `DATABASE_URL` — from step 1 (include `?sslmode=require`)
   - `ANTHROPIC_API_KEY`
   - `SESSION_SECRET` — `openssl rand -base64 32`
   - `DEMO_SWITCH=1` — only while you're demoing (see **Demo mode** below)
4. **Create the schema** on the new database, from your machine:
   ```bash
   DATABASE_URL="<the hosted url>" npx prisma db push
   DATABASE_URL="<the hosted url>" node prisma/seed.mjs
   DATABASE_URL="<the hosted url>" node prisma/seed-passwords.mjs
   DATABASE_URL="<the hosted url>" node prisma/seed-index.mjs
   ```
5. **Fill the content index** (the IXL standards → skill deep links). Either
   restore from your local database, or re-crawl:
   ```bash
   DATABASE_URL="<the hosted url>" GRADES=K,1,2,3,4,5,6,7,8 \
     SUBJECTS=math,ela,science npm run crawl:index
   ```
   Without this, lesson generation has nothing to link to.

## Demo mode (the account "Switch")

The password-free switcher is what makes a demo quick, and it is a wide-open door
on a public URL. It is therefore opt-in per deployment:

| Where | Switch |
|---|---|
| Local dev | always on |
| Hosted, no `DEMO_SWITCH` | **off** — `/login` is the only door |
| Hosted, `DEMO_SWITCH=1` | on, with a warning banner on the page |

While demo mode is on, treat the site as public: **seeded demo children only, no
real IEPs or MAP scores.** Turning it off later is an env-var change, not a code
change.

## Before real families use it

- [ ] **Baseline the migrations.** `prisma/migrations/` stops at
      `20260722124607_child_access_code`; everything after that (specialists,
      interests, content index, provider completions, assessment imports, IEP
      reviews, assessment plans, `Child.gradeLevel`, `Child.dayStartMin`,
      `ScheduleSlot.subject`…) was applied with `db push`. A fresh database is
      fine via `db push`, but before you have data worth protecting, capture the
      current schema as a migration and use `prisma migrate deploy` in CI.
- [ ] **`DEMO_SWITCH` unset**, and real passwords set for every operator.
- [ ] **Encrypt the sensitive columns.** `ChildDocument.data` holds IEPs and
      evaluations, and `IepReview.result` holds their analysis. They are stored
      as-is today. At minimum, ensure the database is encrypted at rest and
      access is restricted; ideally encrypt these columns in the app.
- [ ] **Rate-limit the child code endpoint** (`/api/child-access`) — an 8-digit
      code is guessable at scale.
- [ ] **Back up the database** on a schedule.
- [ ] **Daily index refresh** — run `npm run crawl:index` on a cron (a Vercel
      Cron route or a scheduled job on the DB host).

## Other hosts

- **Railway / Render / Fly.io** — run the app and Postgres side by side; simplest
  single-vendor setup. Build `npm run build`, start `npm start`.
- **Self-hosted / VPS** — `npm ci && npm run build && npm start` behind a
  reverse proxy with TLS.
