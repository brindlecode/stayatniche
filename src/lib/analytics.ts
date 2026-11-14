/**
 * Analytics setup from src/content/settings/analytics.json.
 *
 *  - gtmId  (GTM-…): the Google tag Google issued for the site. When set, it is the ONLY Google
 *    script loaded: https://www.googletagmanager.com/gtm.js?id=GTM-…, in the form Google issued.
 *    The GA4 stream inside it (ga4Id) sends its own page_view, so no gtag('config') is added.
 *  - ga4Id  (G-…): used on its own (gtag.js + config) only when there is no gtmId. With a gtmId it
 *    is kept for reference and for Google's opt-out flag (window['ga-disable-G-…']).
 *  - consentEverywhere: true asks every visitor for consent; false (default) asks visitors where
 *    consent is legally required (EEA, UK, Switzerland, or location unknown) and visitors who send
 *    Global Privacy Control.
 *
 * Empty or malformed IDs load nothing. IDs are validated so they can be written into inline scripts.
 */

export interface AnalyticsSetup {
  /** Script URL to load after consent, or null when analytics is off. */
  tagUrl: string | null;
  /** 'gtm': Google-issued tag (gtm.js); 'gtag': GA4 measurement ID only; null: off. */
  mode: 'gtm' | 'gtag' | null;
  gtmId: string | null;
  measurementId: string | null;
  consentEverywhere: boolean;
}

const GTM_RE = /^GTM-[A-Z0-9]{4,12}$/;
const GA4_RE = /^G-[A-Z0-9]{4,14}$/;

export function analyticsSetup(settings: Record<string, unknown> | null | undefined): AnalyticsSetup {
  const s = settings ?? {};
  const gtm = String(s.gtmId ?? '').trim();
  const ga4 = String(s.ga4Id ?? '').trim();
  const gtmId = GTM_RE.test(gtm) ? gtm : null;
  const measurementId = GA4_RE.test(ga4) ? ga4 : null;
  const consentEverywhere = s.consentEverywhere === true;
  if (gtmId) return { tagUrl: `https://www.googletagmanager.com/gtm.js?id=${gtmId}`, mode: 'gtm', gtmId, measurementId, consentEverywhere };
  if (measurementId) return { tagUrl: `https://www.googletagmanager.com/gtag/js?id=${measurementId}`, mode: 'gtag', gtmId: null, measurementId, consentEverywhere };
  return { tagUrl: null, mode: null, gtmId: null, measurementId: null, consentEverywhere };
}

/** Event names the site sends. Mark affiliate_click, booking_cta_click and newsletter_signup as key events in GA4. */
export const EVENTS = ['hotel_view', 'affiliate_click', 'booking_cta_click', 'partner_click', 'newsletter_signup', 'filter_use', 'search_use'] as const;
