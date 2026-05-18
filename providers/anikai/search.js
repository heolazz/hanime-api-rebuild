import { get } from '../../utils/http.js';
import { parseSearch } from './parser.js';
import { BASE_URLS } from '../../constants/baseurl.js';

const BASE = BASE_URLS.anikai;

// ─── Genre slug → numeric ID map ─────────────────────────────────────────────
// The /browser endpoint requires numeric genre IDs (e.g. genre[]=47).
// This map allows callers to pass either the slug (?genre=action) or the
// numeric ID (?genre=47) — both are resolved to the ID before the request.
// Slugs match the kebab-case used in /genres/:slug nav hrefs.

const GENRE_IDS = {
  'action':        47,
  'adventure':     1,
  'avant-garde':   235,
  'boys-love':     184,
  'comedy':        7,
  'demons':        127,
  'drama':         66,
  'ecchi':         8,
  'fantasy':       34,
  'girls-love':    926,
  'gourmet':       436,
  'harem':         196,
  'horror':        421,
  'isekai':        77,
  'iyashikei':     225,
  'josei':         555,
  'kids':          35,
  'magic':         78,
  'mahou-shoujo':  857,
  'martial-arts':  92,
  'mecha':         219,
  'military':      134,
  'music':         27,
  'mystery':       48,
  'parody':        356,
  'psychological': 240,
  'reverse-harem': 798,
  'romance':       145,
  'school':        9,
  'sci-fi':        36,
  'seinen':        189,
  'shoujo':        183,
  'shounen':       37,
  'slice-of-life': 125,
  'space':         220,
  'sports':        10,
  'super-power':   350,
  'supernatural':  49,
  'suspense':      322,
  'thriller':      241,
  'vampire':       126,
};

// Accepts a single genre value (slug or numeric string/number) and returns
// the numeric ID. Returns the original value unchanged if not recognised.
function resolveGenreId(value) {
  if (!value) return value;
  const str = String(value).trim().toLowerCase();
  // Already numeric — pass through as-is
  if (/^\d+$/.test(str)) return str;
  // Slug lookup
  return GENRE_IDS[str] !== undefined ? String(GENRE_IDS[str]) : str;
}

// Normalises the genre[] filter in a params object in-place.
// Handles both single values and arrays.
function resolveGenres(params) {
  const key = 'genre[]';
  if (!params[key]) return;
  if (Array.isArray(params[key])) {
    params[key] = params[key].map(resolveGenreId);
  } else {
    params[key] = resolveGenreId(params[key]);
  }
}

export async function query(q, page = 1, filters = {}) {
  const params = { keyword: q, page, ...filters };
  resolveGenres(params);
  const html = await get(`${BASE}/browser`, { params });
  const result = parseSearch(html);
  return {
    ...result,
    searchQuery: q,
    searchFilters: filters,
  };
}

// ─── Browse ───────────────────────────────────────────────────────────────────
// Hits /browser with any combination of filter params — keyword is optional.
// Supported filters (all optional, can be combined freely):
//   keyword  → text search
//   sort     → updated_date | release_date | end_date | added_date | trending
//              | title_az | avg_score | mal_score | most_viewed | most_followed | episode_count
//   type[]   → movie | tv | ova | ona | special | music
//   genre[]  → numeric ID (47) OR slug (action) — both accepted, resolved to ID
//   status[] → info | releasing | completed
//   season[] → fall | summer | spring | winter | unknown
//   year[]   → 2026 | 2025 | ... | 1900s
//   rating[] → g | pg | pg_13 | r | r+ | rx
//   country[]→ 2 (China) | 11 (Japan)
//   language[]→ sub | softsub | dub | subdub

export async function browse(filters = {}, page = 1) {
  const { keyword, ...rest } = filters;
  const params = {
    keyword: keyword || ' ',
    page,
    ...rest,
  };
  resolveGenres(params);
  const html = await get(`${BASE}/browser`, { params });
  const result = parseSearch(html);
  return {
    ...result,
    filters: { keyword: keyword || null, ...rest },
  };
}
