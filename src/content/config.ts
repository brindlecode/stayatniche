import { defineCollection, z } from 'astro:content';
import { NICHE_SCOPES, nicheProblems } from '../lib/niche.mjs';

// ── Shared schemas ────────────────────────────────────────────
const seoSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImage: z.string().optional(),
  noIndex: z.boolean().default(false),
}).optional();

// ── Hotels ────────────────────────────────────────────────────
// Which part of the stay is the niche (docs/NICHE-AUDIT.md). Every published hotel must have one.

// Structured place. The legacy `destination` + `country` strings stay (URLs, country pages, search).
const locationSchema = z.object({
  country: z.string(),                                  // official English name, e.g. "United Kingdom"
  countryCode: z.string().regex(/^[A-Z]{2}$/),          // ISO 3166-1 alpha-2, e.g. "GB"
  region: z.string().optional(),                        // state / province / county / governorate / UK nation
  city: z.string().optional(),                          // nearest city, town or municipality
  locality: z.string().optional(),                      // village, island, estate, neighbourhood
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

const hotelShape = z.object({
    name: z.string(),
    category: z.string(),
    destination: z.string(),
    country: z.string(),
    location: locationSchema.optional(),
    continent: z.string().optional(),
    address: z.string().optional(),
    description: z.string(),
    coverImage: z.string().optional(),
    gallery: z.array(z.string()).default([]),

    priceRange: z.string(),
    pricePerNight: z.number().optional(),
    priceIndicator: z.number().min(1).max(5).optional(),

    highlights: z.array(z.string()).default([]),
    amenities: z.array(z.string()).default([]),
    bestFor: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),

    prosAndCons: z.object({
      pros: z.array(z.string()).default([]),
      cons: z.array(z.string()).default([]),
    }).optional(),

    bookingUrl: z.string(),
    affiliateLinks: z.array(z.object({
      partner: z.string(),
      url: z.string(),
      label: z.string().default('Check Rates'),
    })).default([]),

    // EDITORIAL score (docs/EDITORIAL-SCORE.md), not a guest rating. We collect no guest reviews, so
    // reviewCount is only allowed together with the source of that number (reviewCountSource).
    rating: z.number().min(1).max(10),
    reviewCount: z.number().optional(),
    reviewCountSource: z.string().optional(),

    checkInOut: z.object({
      checkIn: z.string().default('15:00'),
      checkOut: z.string().default('11:00'),
    }).optional(),

    seasonalInfo: z.object({
      bestTime: z.string(),
      peakSeason: z.string().optional(),
      lowSeason: z.string().optional(),
      notes: z.string().optional(),
    }).optional(),

    nearbyAttractions: z.array(z.object({
      name: z.string(),
      distance: z.string(),
    })).default([]),

    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),

    featured: z.boolean().default(false),
    editorsPick: z.boolean().default(false),
    trending: z.boolean().default(false),
    status: z.enum(['published', 'draft', 'archived']).default('published'),
    publishedDate: z.date().optional(),
    updatedDate: z.date().optional(),

    // Provenance for pipeline-added stays
    sourceId: z.string().optional(),
    officialWebsite: z.string().optional(),
    verifiedAt: z.date().optional(),

    // Niche audit: what exactly is the category feature, and where was it verified?
    niche_scope: z.enum(NICHE_SCOPES as [string, ...string[]]).optional(),
    niche_feature: z.string().optional(),          // the verified feature, one factual sentence
    niche_source_url: z.string().url().optional(), // the page that supports it (official site preferred)
    niche_verified_at: z.date().optional(),        // the day the source was read

    seo: seoSchema,
  });

const hotels = defineCollection({
  type: 'content',
  schema: hotelShape.superRefine((h, ctx) => {
    for (const { path, message } of nicheProblems(h)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  }),
});

// ── Categories ────────────────────────────────────────────────
const categories = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    description: z.string(),
    icon: z.string(),
    coverImage: z.string().optional(),
    heroImage: z.string().optional(),
    stats: z.object({
      hotelCount: z.number(),
      avgPrice: z.number(),
      topDestination: z.string(),
    }),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    // Legacy flat SEO fields (existing content)
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    // Nested SEO object (new content)
    seo: z.object({
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      ogImage: z.string().optional(),
    }).optional(),
  }),
});

// ── Blog ──────────────────────────────────────────────────────
const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: z.string().default('StayAtNiche Team'),
    category: z.string(),
    excerpt: z.string(),
    coverImage: z.string().optional(),
    publishedDate: z.date(),
    updatedDate: z.date().optional(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    affiliateDisclosure: z.boolean().default(true),
    sponsored: z.boolean().default(false),
    relatedHotels: z.array(z.string()).default([]),
    status: z.enum(['published', 'draft']).default('published'),
    seo: seoSchema,
  }),
});

// ── Destinations ──────────────────────────────────────────────
const destinations = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    type: z.enum(['country', 'city', 'region', 'island']),
    continent: z.string(),
    country: z.string().optional(),
    description: z.string(),
    coverImage: z.string().optional(),
    heroImage: z.string().optional(),
    essentials: z.object({
      currency: z.string().optional(),
      language: z.string().optional(),
      timezone: z.string().optional(),
      visaInfo: z.string().optional(),
      plugType: z.string().optional(),
    }).optional(),
    bestTimeToVisit: z.object({
      summary: z.string(),
      details: z.string().optional(),
    }).optional(),
    mustSee: z.array(z.string()).default([]),
    travelTips: z.array(z.string()).default([]),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    seo: seoSchema,
  }),
});

// ── Experiences ───────────────────────────────────────────────
const experiences = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    type: z.string(),
    destination: z.string(),
    country: z.string(),
    description: z.string(),
    coverImage: z.string().optional(),
    booking: z.object({
      provider: z.string(),
      url: z.string(),
      price: z.string(),
      duration: z.string(),
    }),
    highlights: z.array(z.string()).default([]),
    included: z.array(z.string()).default([]),
    notIncluded: z.array(z.string()).default([]),
    rating: z.number().min(1).max(10).optional(), // editorial score (docs/EDITORIAL-SCORE.md)
    reviewCount: z.number().optional(),            // only with its source
    reviewCountSource: z.string().optional(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    seo: z.object({
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
    }).optional(),
  }),
});

// ── Translations ──────────────────────────────────────────────
// src/content/translations/<lang>/<collection>/<slug>.md — translatable fields only
// (see docs/i18n/TRANSLATING.md); merged over the English entry at build time.
const translations = defineCollection({
  type: 'content',
  schema: z.object({ source: z.string() }).passthrough(),
});

// ── Static pages (about, disclosure, privacy) ─────────────────
// src/content/pages/<lang>/<name>.md — one full file per language.
const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    metaTitle: z.string(),
    metaDescription: z.string(),
    lead: z.string().optional(),
    updated: z.date().optional(),
  }),
});

// ── Settings ──────────────────────────────────────────────────
const settings = defineCollection({
  type: 'data',
  schema: z.record(z.unknown()),
});

export const collections = {
  hotels,
  categories,
  blog,
  destinations,
  experiences,
  settings,
  translations,
  pages,
};
