# St. Henry Adoration Sign Up

A simple, mobile-friendly sign-up sheet for the Adoration chapel. One public page accessed via QR code, one password-protected admin page, automatic 1-hour-ahead email reminders, and recurring sign-ups.

**Stack:** Next.js + Supabase (database) + Resend (email) + Vercel (hosting). All free tiers; total cost: $0/month.

---

## What you'll do (about 20 minutes total)

1. Set up the database (Supabase) — 5 min
2. Set up email sending (Resend) — 3 min
3. Deploy the site (Vercel) — 7 min
4. Generate and print your QR code — 2 min

You'll need a free GitHub account to deploy. If you don't have one, sign up at https://github.com first.

---

## 1. Database (Supabase)

1. Go to https://supabase.com and click **Start your project** (sign in with GitHub).
2. Click **New project**. Name it `st-henry-adoration`. Choose any region close to you. Set a database password (save it somewhere — you won't need it again unless something goes wrong).
3. Wait ~1 minute for the project to provision.
4. In the left sidebar click **SQL Editor**, then **New query**.
5. Open the file `supabase/schema.sql` from this project, copy its entire contents, paste into the editor, and click **Run**. You should see "Success. No rows returned."
6. In the left sidebar click **Project Settings** (the gear icon) → **API**. You'll need three values from this page later:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string)
   - **service_role** key (another long string — keep this one secret)

---

## 2. Email (Resend)

1. Go to https://resend.com and sign up (free).
2. Click **API Keys** in the sidebar → **Create API Key**. Name it `st-henry`, leave permissions as full access. Copy the key — you'll need it in the next step. (You won't be able to see it again, so paste it somewhere safe for now.)
3. **For testing:** that's it. Reminders will send from `onboarding@resend.dev`, which works immediately.
4. **For production (recommended later):** click **Domains** → **Add Domain** and follow the instructions to verify a domain you own (like `sthenryparish.org`). This lets emails come from `adoration@sthenryparish.org` and stops them landing in spam. Until then, the testing sender is fine.

> **Note about the `sthenryadoration@gmail.com` address you mentioned:** Resend can't send *from* a Gmail address — Gmail blocks that for security reasons. Use `onboarding@resend.dev` to start, or verify a parish domain later. Volunteers can still *reply* to a Gmail address — just put it in the email signature.

---

## 3. Deploy (Vercel)

1. **Put the code on GitHub.** The easiest way:
   - Go to https://github.com/new, create a new private repo called `st-henry-adoration`. Don't add a README.
   - On your computer, open Terminal (Mac) or Command Prompt (Windows) inside this project folder and run:
     ```
     git init
     git add .
     git commit -m "Initial"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/st-henry-adoration.git
     git push -u origin main
     ```
   - (If `git` isn't installed, install it from https://git-scm.com — or use GitHub Desktop's drag-and-drop at https://desktop.github.com.)

2. Go to https://vercel.com and click **Sign Up** (use your GitHub account).

3. Click **Add New… → Project**. Find your `st-henry-adoration` repo and click **Import**.

4. **Before clicking Deploy**, expand **Environment Variables** and add these (one row per variable):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key from Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key from Supabase |
   | `RESEND_API_KEY` | API key from Resend |
   | `FROM_EMAIL` | `St. Henry Adoration <onboarding@resend.dev>` |
   | `ADMIN_PASSWORD` | Pick something strong. Default placeholder: `StHenry2026!` |
   | `CRON_SECRET` | Generate any random string (e.g. type 30 random characters) |
   | `PARISH_TIMEZONE` | `America/New_York` (Hollywood, FL is Eastern Time) |

5. Click **Deploy**. Wait 1-2 minutes.

6. When it's done, click **Visit**. You should see the live sign-up page!

7. Your URL will be something like `https://st-henry-adoration.vercel.app`. **Save this URL — it goes in the QR code.**

---

## 4. Generate the QR code

1. Go to https://www.qr-code-generator.com (or any free QR generator).
2. Paste your Vercel URL.
3. Download as a high-resolution PNG.
4. Print it on a flyer or sign with the title **"Sign up for Adoration"** above and the URL written in small text below (in case the QR fails to scan).
5. Post outside the chapel and around the church.

> **Tip:** Test the QR with your phone before printing 100 copies.

---

## How it works for volunteers

1. They scan the QR code outside the chapel.
2. The page loads showing the next 7 days, hour by hour, with dots showing how many of the 4 spots are taken.
3. They tap an hour that has space, type their name (phone and email optional), and tap **Sign Up**.
4. If they checked "remind me," they get an email 1 hour before their slot.
5. If they checked "next 4 weeks," they're automatically signed up at that same time for the next 3 weeks. The system also keeps extending recurring sign-ups one week at a time, so as long as they're on the list this week, they'll always be on next week's list.

## How it works for the admin

1. Go to `https://your-vercel-url.vercel.app/admin`.
2. Enter the admin password you set in step 3.
3. The dashboard shows:
   - A heatmap grid: red = empty, yellow = partially filled, green = full. **Empty hours are flagged in red** so you can call regular volunteers to fill them.
   - A detailed list of every upcoming signup with names, phones, and emails.
   - A **Remove** button next to each signup (use this if someone calls to cancel).

---

## Maintenance

There is essentially nothing to maintain. The site updates automatically:

- New days roll into view each midnight (parish time).
- Past hours grey out automatically.
- Recurring sign-ups extend themselves week by week.
- Email reminders send themselves every 15 minutes.

**The only thing you'll occasionally do** is open `/admin` and either remove a cancellation or call regular volunteers about an empty hour flagged in red.

## If you need to change something

- **Change admin password:** Vercel → Project → Settings → Environment Variables → edit `ADMIN_PASSWORD` → click **Redeploy** on the latest deployment.
- **Change the guidelines text or quote:** edit `app/page.js`, save, push to GitHub. Vercel auto-deploys in 1 minute.
- **Change parish hours (currently 8 AM – 8 PM):** edit `lib/dates.js` line 5 (`HOURS = Array.from({ length: 12 }, (_, i) => i + 8)`).

## Costs

Free, with these limits:

- **Supabase free tier:** 500 MB database, way more than you'll ever use.
- **Resend free tier:** 3,000 emails/month, 100/day. At 12 hours × 4 volunteers × 30 days × 1 reminder each = ~1,440 emails/month. Comfortable.
- **Vercel free tier:** unlimited hosting for personal projects. Cron jobs included.

If volume exceeds free tiers (very unlikely), upgrades start at $5-20/month per service.
