# Newsletter Setup Guide

The site uses **Netlify Forms** to capture email signups, with an optional serverless function to sync subscribers to an email marketing platform.

## How It Works

1. A visitor fills in the form in the footer (every page) or on `/newsletter`
2. The form posts to `netlify/functions/newsletter-subscribe.cjs`
3. The function sends the address to the provider set in `NEWSLETTER_PROVIDER`
4. Only when the provider accepts it does the visitor go to `/newsletter-success/`.
   If no provider is configured, or the provider refuses, the visitor sees an error
   ("your address was not saved") and nothing is stored.

Check the setup any time by opening `https://stayatniche.com/.netlify/functions/newsletter-subscribe`
in a browser: it shows `{"provider": ..., "configured": true|false}` (no keys are shown).

## Step 1: Choose a Free Provider

| Provider | Free Tier | Best For |
|----------|-----------|----------|
| **Beehiiv** ⭐ | 2,500 subscribers, unlimited emails | Newsletter-first platform, beautiful |
| **Mailchimp** | 500 contacts, 1,000 emails/month | Industry standard, drag-drop editor |
| **Brevo** | 300 emails/day, unlimited contacts | High volume, transactional too |
| **None (Netlify only)** | Unlimited, manual export | Just getting started |

**Recommendation: Beehiiv** — best newsletter UX, 2,500 free subs, growing fast.

---

## Step 2: Set Up Your Provider

### Option A — Beehiiv (Recommended)
1. Sign up at [beehiiv.com](https://www.beehiiv.com) — free up to 2,500 subs
2. Create a publication called "StayAtNiche"
3. Go to **Settings → API** → Generate API key
4. Note your **Publication ID** (looks like `pub_xxxxxxxxxx`)

### Option B — Mailchimp
1. Sign up at [mailchimp.com](https://mailchimp.com) — free up to 500 contacts
2. Create an Audience
3. Go to **Account → Extras → API keys** → Create key
4. Note your **List/Audience ID** from Audience → Settings → Audience name
5. Note your **server prefix** (last part of API key after `-`, e.g. `us14`)

### Option C — Brevo
1. Sign up at [brevo.com](https://brevo.com) — 300 emails/day free
2. Create a contact list
3. Go to **Settings → API keys** → Generate
4. Note your **List ID** from Contacts → Lists

---

## Step 3: Configure Netlify Environment Variables

In your **Netlify dashboard → Site settings → Environment variables**, add:

```
NEWSLETTER_PROVIDER = beehiiv   (or: mailchimp, brevo)
```

**For Beehiiv:**
```
BEEHIIV_API_KEY = your_api_key_here
BEEHIIV_PUB_ID  = pub_xxxxxxxxxx
```

**For Mailchimp:**
```
MAILCHIMP_API_KEY = your_api_key-us14
MAILCHIMP_LIST_ID = xxxxxxxxxx
MAILCHIMP_SERVER  = us14
```

**For Brevo:**
```
BREVO_API_KEY = your_api_key_here
BREVO_LIST_ID = 1   (your list's integer ID)
```

---

## Step 4: Test It

1. After setting the variables, trigger a new deploy (Netlify → Deploys → Trigger deploy)
2. Open the check URL above: it should say `"configured": true`
3. Sign up with your own address and confirm it appears in the provider's dashboard

No Netlify Forms webhook is needed any more. Older sign-ups collected before this change
are still in **Netlify dashboard → Forms** (`newsletter`, `footer-newsletter`); export them
as CSV and import them into the provider.

## Form Locations

- **Footer** — on every page
- **/newsletter** — full dedicated signup page
- **/newsletter-success** — shown only after the provider accepted the address
