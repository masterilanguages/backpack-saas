# Backpack

Backpack is the learning site for language schools (backpacksystems.com).

## Safety net

Three checks now sit around the app. None of them change student data, and none of them require a paid monitoring product.

### 1. A check on every change (GitHub Actions)

On every pull request, and on every update to `main`, GitHub installs the app, runs the test suite, and builds it. If the build or the tests fail, the pull request shows a red X and should not be merged. The build uses stand-in Supabase values so it can compile. It does not connect to the live database. Vercel keeps using the real values when it deploys.

Two extra checks, typecheck and lint, also run. They **do not block** the pull request. The project already has a large number of existing type and style findings, and the live site is built with those findings ignored (see `next.config.js`). The checks write the counts into the Actions log so the numbers are visible. Cleaning them up is a separate project; this one does not edit the app to chase them.

The test suite is the existing Deno tests. Tests that need a database are skipped unless `TEST_DATABASE_URL` is set, same as on a laptop. The shell scripts under `supabase/tests/` start a throwaway Postgres in Docker and are not part of this check.

### 2. A preview of a pull request (already on)

Vercel is already connected to this GitHub repo. Pushes to `main` deploy the live site. Other branches already get a **Preview** deployment (this has happened for feature branches such as `feat/watch-again`). There is no `vercel.json` in the repo; the connection lives in the Vercel dashboard, which this change cannot edit.

To confirm it is still on:

1. Open [vercel.com](https://vercel.com) and the Backpack project.
2. Go to **Settings → Git**.
3. The connected repository should be `masterilanguages/backpack-saas`, and the Production Branch should be `main`.

After you open a pull request, a comment from `vercel[bot]` should appear with a preview link. If it does not, in that same Git screen turn on pull-request comments. Nothing in this repository has to change for previews to exist.

Previews use the environment variables ticked **Preview** in **Settings → Environment Variables**. If those include the live database keys, a preview can read and change real student data. Look before clicking around in a preview. Do not change Production values as part of this.

### 3. An alarm if the live site or Claude breaks

About every 30 minutes, GitHub opens `https://www.backpacksystems.com/api/health` and, once you add a key, asks Claude for a one-token reply. This is the failure from October 2026: Claude credits ran out and student AI features broke with nobody noticing.

The check does not write anything. It does not sign in as a student. One token every half hour on the small Haiku model is a few cents a month, not a lesson.

The public health page stays exactly what it is today: `{"status":"ok", ...}`. A second, locked check (`/api/health?ai=1` plus a secret) exists for later and does nothing until you opt in. Random visitors cannot trigger a Claude call.

#### What you need to click

Do this after the pull request is merged. Until then the schedule does not run (GitHub only schedules workflows that are on `main`).

1. **Create a Claude key on the same account the app already uses.** Open [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) and create a key. You cannot view the key already stored in Supabase; a new key on that same account shares the same credit balance, so this alarm goes off when student features would break. Creating it does not change the Supabase key.
2. **Save it as a GitHub secret, not in the code.** Open the repo → **Settings → Secrets and variables → Actions → New repository secret**. Name: `ANTHROPIC_API_KEY`. Value: the key you just created. Never paste it into a file or a chat.
3. **Turn on failure email, and aim it at yourself.**
   - Open [github.com/settings/notifications](https://github.com/settings/notifications). Under **System → Actions**, turn on **Email**, and choose to be notified only when a workflow fails. Successful runs every 30 minutes will stay quiet.
   - GitHub sends that email to **one person**: whoever last turned this scheduled workflow on. After the merge, open the repo → **Actions → Production health** → the **⋯** menu → **Disable workflow**, then **Enable workflow**, while you are logged in as yourself.
4. **Optional: prove the email arrives** without touching the live site. Actions → **Production health** → **Run workflow**. In the URL box type `https://example.invalid` and run it. That run should fail, and you should get an email. The regular schedule keeps using the real site.

If the site address ever changes, add a repository **variable** (not a secret) named `PRODUCTION_URL`, value `https://www.backpacksystems.com`. Leave it unset to use that address.

#### Optional later: let the website run the Claude check itself

You do not need this for the alarm above. The GitHub secret is enough.

If you also want the deployed site to answer `/api/health?ai=1`:

1. Invent a long random password. Store it in **two** places, both as secrets, never in the repo: GitHub Actions secret `HEALTH_CHECK_TOKEN`, and Vercel → **Settings → Environment Variables** → `HEALTH_CHECK_TOKEN` for Production.
2. Add `ANTHROPIC_API_KEY` in Vercel as well (Production), same Anthropic account.
3. Redeploy so Vercel picks up new variables.

If the token is missing or wrong, the site returns "unauthorized" and does not call Claude. If the Vercel key is missing, the monitor falls back to the GitHub secret.

#### What a failure email means

- **Could not reach the site / health did not report ok.** The website is down.
- **Claude says the account is out of credits.** The October failure. Add credits at [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing). Student AI features are likely broken until you do.
- **Claude rejected the API key.** The key in GitHub (or Vercel) is wrong or was revoked. The Supabase key students use is separate; fix the one named in the log.
- **No email, and the Actions run is green with a warning.** The site is up, but `ANTHROPIC_API_KEY` is not set yet, so credits are still not being watched.

GitHub can also turn a schedule off after 60 days with no activity on a public repo, and it can start a run late. If the **Production health** workflow says it is disabled, enable it again (that also re-aims the email at you).

### Optional: Sentry, for crashes

The Claude check above is what would have caught the credit outage. It will not catch an ordinary bug (a page throws, a button fails). [Sentry](https://sentry.io/signup/) does that. It is not part of this change.

1. Create a free Sentry account and a project with platform **Next.js**.
2. Sentry shows a DSN (a URL). Treat it like a password: do not commit it.
3. Vercel → **Settings → Environment Variables** → add `SENTRY_DSN` for Production.
4. Installing Sentry in the app is a follow-up code change. This pull request does not add it. Sentry emails you when the app throws. It still would not notice an empty Claude balance unless the app reported that error, which is why the scheduled check exists.

### What merging does, and what it does not do

Merging to `main` lets the existing Vercel connection deploy, the same way every other update to `main` already does. The only live behavior change is small: `/api/health` answers on school subdomains without asking anyone to log in, and `?ai=1` stays locked until the secrets above exist. The public JSON stays the same. No database, schema, or production environment variable is changed by this pull request.
