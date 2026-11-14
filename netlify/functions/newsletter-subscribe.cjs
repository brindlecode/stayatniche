/**
 * Netlify Function: newsletter-subscribe
 *
 * The newsletter forms (footer + /newsletter page) post straight here.
 * The visitor only sees "You're in" when an email provider actually accepted
 * the address. If no provider is configured, or the provider rejects the call,
 * the visitor gets an honest error instead of a fake success.
 *
 *   GET  → { configured, provider }   (no secrets; used to check the setup)
 *   POST → JSON or form-encoded { email, name?, language?, success?, back?, bot-field? }
 *          JSON callers get { ok: true, subscribed: true } (200) when the provider accepted the
 *          address, or { ok: false, error } (4xx/5xx). The site's newsletter_signup analytics
 *          event fires only on subscribed: true (the honeypot answer has no subscribed flag).
 *          Plain HTML form posts (no JavaScript) get a 303 to the success page
 *          or a small error page.
 *
 * ENV VARS (Netlify → Project configuration → Environment variables):
 *   NEWSLETTER_PROVIDER = "beehiiv" | "mailchimp" | "brevo"
 *   Beehiiv:   BEEHIIV_API_KEY, BEEHIIV_PUB_ID
 *   Mailchimp: MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, MAILCHIMP_SERVER (e.g. "us14")
 *   Brevo:     BREVO_API_KEY, BREVO_LIST_ID
 * See NEWSLETTER_SETUP.md.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const REQUIRED = {
  beehiiv: ["BEEHIIV_API_KEY", "BEEHIIV_PUB_ID"],
  mailchimp: ["MAILCHIMP_API_KEY", "MAILCHIMP_LIST_ID", "MAILCHIMP_SERVER"],
  brevo: ["BREVO_API_KEY", "BREVO_LIST_ID"],
};

const ERRORS = {
  invalid_email: "Please enter a valid email address.",
  not_configured: "Sorry, newsletter sign-up is not available right now. Your address was not saved. Please try again later.",
  provider_error: "Sorry, we could not sign you up right now. Your address was not saved. Please try again later.",
  bad_request: "Sorry, something went wrong with the form. Please try again.",
};

function providerStatus() {
  const provider = (process.env.NEWSLETTER_PROVIDER || "").trim().toLowerCase();
  const needed = REQUIRED[provider];
  const configured = !!needed && needed.every((k) => !!process.env[k]);
  return { provider: needed ? provider : null, configured };
}

// Only same-site relative paths are allowed as redirect targets.
const safePath = (p, fallback) =>
  typeof p === "string" && /^\/(?!\/)[\w\-./]*$/.test(p) ? p : fallback;

function parseBody(event) {
  let raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  const type = String(event.headers?.["content-type"] || "").toLowerCase();
  if (type.includes("application/x-www-form-urlencoded")) {
    return { form: true, data: Object.fromEntries(new URLSearchParams(raw)) };
  }
  const json = JSON.parse(raw);
  // Also accept the Netlify Forms webhook shape: { payload: { data: {...} } }
  return { form: false, data: json?.payload?.data || json?.data || json };
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function respond(isForm, data, statusCode, result) {
  if (!isForm) return json(statusCode, result);
  if (result.ok) {
    return { statusCode: 303, headers: { Location: safePath(data?.success, "/newsletter-success/") }, body: "" };
  }
  const back = safePath(data?.back, "/newsletter/");
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Newsletter sign-up</title><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>Not subscribed</h1><p>${esc(ERRORS[result.error] || ERRORS.provider_error)}</p><p><a href="${esc(back)}">Go back</a></p></body></html>`,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET") return json(200, providerStatus());
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  if (event.body && event.body.length > 10_000) return json(413, { ok: false, error: "bad_request" });

  let parsed;
  try {
    parsed = parseBody(event);
  } catch {
    return json(400, { ok: false, error: "bad_request" });
  }
  const { form, data } = parsed;

  // Honeypot: bots that fill the hidden field are dropped silently.
  if (data?.["bot-field"]) return respond(form, data, 200, { ok: true });

  const email = String(data?.email || "").trim().toLowerCase();
  const firstName = String(data?.name || "").trim().split(/\s+/)[0] || "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email) || firstName.length > 80) {
    return respond(form, data, 400, { ok: false, error: "invalid_email" });
  }

  const { provider, configured } = providerStatus();
  if (!configured) {
    console.warn("Newsletter sign-up refused: no email provider configured (NEWSLETTER_PROVIDER and its keys).");
    return respond(form, data, 503, { ok: false, error: "not_configured" });
  }

  try {
    if (provider === "beehiiv") await subscribeBeehiiv(email, firstName);
    else if (provider === "mailchimp") await subscribeMailchimp(email, firstName);
    else if (provider === "brevo") await subscribeBrevo(email, firstName);
    return respond(form, data, 200, { ok: true, subscribed: true });
  } catch (err) {
    console.error("Newsletter provider error:", err.message);
    return respond(form, data, 502, { ok: false, error: "provider_error" });
  }
};

// ── Beehiiv ──────────────────────────────────────────────────────────────────
async function subscribeBeehiiv(email, firstName) {
  const res = await fetch(
    `https://api.beehiiv.com/v2/publications/${encodeURIComponent(process.env.BEEHIIV_PUB_ID)}/subscriptions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        first_name: firstName || undefined,
        reactivate_existing: false,
        send_welcome_email: true,
        utm_source: "website",
        utm_medium: "organic",
        utm_campaign: "newsletter_form",
      }),
    }
  );
  if (!res.ok) throw new Error(`Beehiiv API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// ── Mailchimp ─────────────────────────────────────────────────────────────────
async function subscribeMailchimp(email, firstName) {
  const server = process.env.MAILCHIMP_SERVER;
  if (!/^[a-z]{2}\d{1,3}$/.test(server)) throw new Error("MAILCHIMP_SERVER must look like us14");
  const res = await fetch(
    `https://${server}.api.mailchimp.com/3.0/lists/${encodeURIComponent(process.env.MAILCHIMP_LIST_ID)}/members`,
    {
      method: "POST",
      headers: { Authorization: `apikey ${process.env.MAILCHIMP_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email_address: email, status: "subscribed", merge_fields: { FNAME: firstName } }),
    }
  );
  if (res.ok) return;
  const body = await res.text();
  let title = "";
  try { title = JSON.parse(body)?.title || ""; } catch { /* not JSON */ }
  if (title === "Member Exists") return; // already on the list: the address is accepted
  throw new Error(`Mailchimp API error ${res.status}: ${body.slice(0, 300)}`);
}

// ── Brevo ─────────────────────────────────────────────────────────────────────
async function subscribeBrevo(email, firstName) {
  const listId = parseInt(process.env.BREVO_LIST_ID, 10);
  if (!listId) throw new Error("BREVO_LIST_ID must be a number");
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, attributes: { FIRSTNAME: firstName }, listIds: [listId], updateEnabled: true }),
  });
  if (!res.ok) throw new Error(`Brevo API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
