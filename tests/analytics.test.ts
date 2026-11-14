import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyticsSetup } from '../src/lib/analytics';

describe('analyticsSetup', () => {
  test('empty settings load nothing', () => {
    expect(analyticsSetup({})).toMatchObject({ tagUrl: null, mode: null });
    expect(analyticsSetup(null)).toMatchObject({ tagUrl: null, mode: null });
    expect(analyticsSetup({ ga4Id: '', gtmId: '' })).toMatchObject({ tagUrl: null, mode: null });
  });
  test('Google tag ID wins and is the only script: gtm.js in the form Google issued', () => {
    expect(analyticsSetup({ ga4Id: 'G-9V9HCEXTZ7', gtmId: 'GTM-N2VRCNK6' })).toEqual({
      tagUrl: 'https://www.googletagmanager.com/gtm.js?id=GTM-N2VRCNK6', mode: 'gtm', gtmId: 'GTM-N2VRCNK6', measurementId: 'G-9V9HCEXTZ7', consentEverywhere: false,
    });
  });
  test('GA4 ID alone uses gtag.js', () => {
    expect(analyticsSetup({ ga4Id: 'G-ABC1234' })).toMatchObject({ tagUrl: 'https://www.googletagmanager.com/gtag/js?id=G-ABC1234', mode: 'gtag' });
  });
  test('malformed IDs are ignored (they are written into an inline script)', () => {
    expect(analyticsSetup({ gtmId: "GTM-X');alert(1)//", ga4Id: 'UA-123' })).toMatchObject({ tagUrl: null, mode: null });
  });
  test('the site settings hold the IDs Google issued', () => {
    const s = JSON.parse(readFileSync(join(__dirname, '../src/content/settings/analytics.json'), 'utf8'));
    expect(analyticsSetup(s)).toMatchObject({ mode: 'gtm', gtmId: 'GTM-N2VRCNK6', measurementId: 'G-9V9HCEXTZ7' });
    expect(s.adsenseClient).toBe('');
  });
});
