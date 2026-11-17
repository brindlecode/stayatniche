// Search Console verification is driven by src/content/settings/seo.json (BaseLayout.astro).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verificationCode } from '../src/lib/site';

const ROOT = resolve(__dirname, '..');
const seo = JSON.parse(readFileSync(resolve(ROOT, 'src/content/settings/seo.json'), 'utf8'));

describe('Search Console verification', () => {
  it('has a googleVerification field in seo.json (empty until the owner adds the code)', () => {
    expect(seo).toHaveProperty('googleVerification');
    expect(typeof seo.googleVerification).toBe('string');
  });
  it('is editable in the CMS', () => {
    expect(readFileSync(resolve(ROOT, 'public/admin/config.yml'), 'utf8')).toMatch(/name: "googleVerification"/);
  });
  it('accepts the bare code or the whole meta tag Search Console shows', () => {
    expect(verificationCode('')).toBe('');
    expect(verificationCode(undefined)).toBe('');
    expect(verificationCode('  aBc-123_XyZ  ')).toBe('aBc-123_XyZ');
    expect(verificationCode('<meta name="google-site-verification" content="aBc-123_XyZ" />')).toBe('aBc-123_XyZ');
  });
  it('rejects text that is not a code (no broken tag in the page head)', () => {
    expect(verificationCode('paste the code here')).toBe('');
    expect(verificationCode('"><script>')).toBe('');
  });
  it('is rendered by the layout from the setting', () => {
    const layout = readFileSync(resolve(ROOT, 'src/layouts/BaseLayout.astro'), 'utf8');
    expect(layout).toMatch(/verificationCode\(seo\.googleVerification\)/);
    expect(layout).toMatch(/name="google-site-verification" content=\{googleVerif\}/);
  });
});
