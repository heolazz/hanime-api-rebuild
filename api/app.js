// api/app.js
import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { getProvider, getProviderWithFallback } from '../core/providerManager.js';
import { withCache, TTL, cacheStats } from '../utils/cache.js';

const app = new Hono();

// ─── Root ────────────────────────────────────────────────────────────────────
app.get('/', (c) => c.json({
  status: 'ok',
  message: 'Anime API',
  providers: ['anikai', 'anikoto', 'miruro'],
  defaultProvider: 'anikoto',
  docs: 'See README.md for endpoint documentation',
  endpoints: {
    anime: '/api/v2/{provider}/anime/{id}',
    episodes: '/api/v2/{provider}/anime/{id}/episodes',
    episode: '/api/v2/{provider}/anime/{id}/ep/{number}',
    search: '/api/v2/{provider}/search?q=',
    browse: '/api/v2/{provider}/browse',
    home: '/api/v2/{provider}/home',
    index: '/api/v2/{provider}/index',
    genre: '/api/v2/{provider}/genre/{name}',
    category: '/api/v2/{provider}/category/{name}',
    type: '/api/v2/{provider}/type/{name}',
    azlist: '/api/v2/{provider}/azlist/{sort}',
    nav: '/api/v2/{provider}/nav',
    miruro: {
      note: 'Miruro routes served by the Python runtime — all responses use { success, data } format',
      home: '/api/v2/miruro/home',
      index: '/api/v2/miruro/index',
      nav: '/api/v2/miruro/nav',
      search: '/api/v2/miruro/search?query=',
      suggestions: '/api/v2/miruro/suggestions?query=',
      filter: '/api/v2/miruro/filter',
      spotlight: '/api/v2/miruro/spotlight',
      trending: '/api/v2/miruro/trending',
      popular: '/api/v2/miruro/popular',
      upcoming: '/api/v2/miruro/upcoming',
      recent: '/api/v2/miruro/recent',
      schedule: '/api/v2/miruro/schedule',
      info: '/api/v2/miruro/info/{anilist_id}',
      characters: '/api/v2/miruro/anime/{anilist_id}/characters',
      relations: '/api/v2/miruro/anime/{anilist_id}/relations',
      recommendations: '/api/v2/miruro/anime/{anilist_id}/recommendations',
      episodes: '/api/v2/miruro/episodes/{anilist_id}',
      sources: '/api/v2/miruro/sources',
      watch: '/api/v2/miruro/watch/{provider}/{anilist_id}/{category}/{slug}',
    }
  }
}));

// ─── Cache stats (optional debug endpoint) ───────────────────────────────────
app.get('/api/cache/stats', (c) => c.json({ success: true, data: cacheStats() }));

// ─── Helper ──────────────────────────────────────────────────────────────────

function ok(c, data) {
  return c.json({ success: true, data });
}

function err(c, message, status = 500) {
  console.error(`[ERROR] ${message}`);
  return c.json({ success: false, error: message }, status);
}

// ─── Home ─────────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/home', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    return withCache(c, TTL.HOME, () => p.anime.getHome());
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Index / landing page ─────────────────────────────────────────────────────
app.get('/api/v2/:provider/index', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    return withCache(c, TTL.HOME, () => p.anime.getIndex());
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Anime detail ─────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/anime/:animeId', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    return withCache(c, TTL.ANIME, () => p.anime.getById(c.req.param('animeId')));
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Episode list ─────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/anime/:animeId/episodes', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    return withCache(c, TTL.EPISODES, () => p.anime.getEpisodes(c.req.param('animeId')));
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Single episode ───────────────────────────────────────────────────────────
app.get('/api/v2/:provider/anime/:animeId/ep/:number', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    return withCache(c, TTL.EPISODE, () =>
      p.anime.getEpisode(c.req.param('animeId'), c.req.param('number'))
    );
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/search', async (c) => {
  try {
    const q = c.req.query('q');
    if (!q) return err(c, 'Missing query parameter: q', 400);
    
    const p = await getProvider(c.req.param('provider'));
    const page = parseInt(c.req.query('page') || '1', 10);
    
    // Extract all filters except q, page, provider
    const { q: _q, page: _p, provider: _pr, ...filters } = Object.fromEntries(
      Object.entries(c.req.query()).filter(([k]) => !['q', 'page', 'provider'].includes(k))
    );
    
    return withCache(c, TTL.SEARCH, () => p.search.query(q, page, filters));
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Browse ───────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/browse', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    const page = parseInt(c.req.query('page') || '1', 10);
    
    const { page: _p, provider: _pr, ...filters } = Object.fromEntries(
      Object.entries(c.req.query()).filter(([k]) => !['page', 'provider'].includes(k))
    );
    
    return withCache(c, TTL.BROWSE, () => p.search.browse(filters, page));
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── AZ List ──────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/azlist/:sortOption', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    const sort = c.req.param('sortOption');
    const page = parseInt(c.req.query('page') || '1', 10);
    return withCache(c, TTL.AZLIST, () => p.anime.getAzList(sort, page));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/v2/:provider/azlist', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    const page = parseInt(c.req.query('page') || '1', 10);
    return withCache(c, TTL.AZLIST, () => p.anime.getAzList('all', page));
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Genre ────────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/genre/:name', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    const name = c.req.param('name');
    const page = parseInt(c.req.query('page') || '1', 10);
    const sort = c.req.query('sort') || null;
    return withCache(c, TTL.GENRE, async () => {
      const data = await p.anime.getGenre(name, page, sort);
      return { 
        genreName: data.title || name, 
        animes: data.animes, 
        currentPage: data.currentPage, 
        totalPages: data.totalPages, 
        hasNextPage: data.hasNextPage 
      };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Category ─────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/category/:name', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    const name = c.req.param('name');
    const page = parseInt(c.req.query('page') || '1', 10);
    const sort = c.req.query('sort') || null;
    return withCache(c, TTL.GENRE, async () => {
      const data = await p.anime.getCategory(name, page, sort);
      return { 
        category: data.title || name, 
        animes: data.animes, 
        currentPage: data.currentPage, 
        totalPages: data.totalPages, 
        hasNextPage: data.hasNextPage 
      };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Type ──────────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/type/:name', async (c) => {
  try {
    const p = await getProvider(c.req.param('provider'));
    const name = c.req.param('name');
    const page = parseInt(c.req.query('page') || '1', 10);
    const sort = c.req.query('sort') || null;
    return withCache(c, TTL.GENRE, async () => {
      const data = await p.anime.getType(name, page, sort);
      return { 
        type: data.title || name, 
        animes: data.animes, 
        currentPage: data.currentPage, 
        totalPages: data.totalPages, 
        hasNextPage: data.hasNextPage 
      };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Nav menu ─────────────────────────────────────────────────────────────────
app.get('/api/v2/:provider/nav', async (c) => {
  try {
    const providerName = c.req.param('provider');
    const p = await getProvider(providerName);
    return withCache(c, TTL.NAV, async () => {
      const data = await p.anime.getNavMenu(providerName);
      return { header: data };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Shorthand routes (no provider prefix → uses defaultProvider) ────────────
app.get('/api/home', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    return withCache(c, TTL.HOME, async () => ({
      provider: name,
      ...(await p.anime.getHome()),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/index', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    return withCache(c, TTL.HOME, async () => ({
      provider: name,
      ...(await p.anime.getIndex()),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return err(c, 'Missing q', 400);
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    const page = parseInt(c.req.query('page') || '1', 10);
    return withCache(c, TTL.SEARCH, async () => ({
      provider: name,
      ...(await p.search.query(q, page)),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/browse', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    const page = parseInt(c.req.query('page') || '1', 10);
    const { page: _p, provider: _pr, ...filters } = Object.fromEntries(
      Object.entries(c.req.query()).filter(([k]) => !['page', 'provider'].includes(k))
    );
    return withCache(c, TTL.BROWSE, async () => ({
      provider: name,
      ...(await p.search.browse(filters, page)),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/anime/:id', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    return withCache(c, TTL.ANIME, async () => ({
      provider: name,
      ...(await p.anime.getById(c.req.param('id'))),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/anime/:id/episodes', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    return withCache(c, TTL.EPISODES, async () => ({
      provider: name,
      ...(await p.anime.getEpisodes(c.req.param('id'))),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/anime/:id/ep/:number', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    return withCache(c, TTL.EPISODE, async () => ({
      provider: name,
      ...(await p.anime.getEpisode(c.req.param('id'), c.req.param('number'))),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/genre/:name', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    const pg = parseInt(c.req.query('page') || '1', 10);
    const sort = c.req.query('sort') || null;
    return withCache(c, TTL.GENRE, async () => {
      const d = await p.anime.getGenre(c.req.param('name'), pg, sort);
      return { provider: name, ...d };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/category/:name', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    const pg = parseInt(c.req.query('page') || '1', 10);
    const sort = c.req.query('sort') || null;
    return withCache(c, TTL.GENRE, async () => {
      const d = await p.anime.getCategory(c.req.param('name'), pg, sort);
      return { provider: name, ...d };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/type/:name', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    const pg = parseInt(c.req.query('page') || '1', 10);
    const sort = c.req.query('sort') || null;
    return withCache(c, TTL.GENRE, async () => {
      const d = await p.anime.getType(c.req.param('name'), pg, sort);
      return { provider: name, type: d.title, animes: d.animes, currentPage: d.currentPage, totalPages: d.totalPages, hasNextPage: d.hasNextPage };
    });
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/azlist/:sort', async (c) => {
  try {
    const { name, provider: p } = await getProviderWithFallback(c.req.query('provider'));
    const pg = parseInt(c.req.query('page') || '1', 10);
    return withCache(c, TTL.AZLIST, async () => ({
      provider: name,
      ...(await p.anime.getAzList(c.req.param('sort'), pg)),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

app.get('/api/nav', async (c) => {
  const providerName = c.req.query('provider') || 'anikoto';
  try {
    const p = await getProvider(providerName);
    return withCache(c, TTL.NAV, async () => ({
      provider: providerName,
      header: await p.anime.getNavMenu(providerName),
    }));
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── Miruro Watch Route (JS Implementation for Cloudflare) ─────────────────────
const MIRURO_PIPE_URL = "https://www.miruro.tv/api/secure/pipe";
const MIRURO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Referer": "https://www.miruro.tv/"
};

function _encodePipeRequest(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function _decodePipeResponse(encodedStr) {
  let padded = encodedStr;
  while (padded.length % 4) padded += '=';
  padded = padded.replace(/-/g, '+').replace(/_/g, '/');
  
  const compressedBuffer = Buffer.from(padded, 'base64');
  
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(compressedBuffer);
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
    const decompressedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    const text = new TextDecoder('utf-8').decode(decompressedBuffer);
    return JSON.parse(text);
  } else {
    // Fallback if DecompressionStream is missing
    const zlib = await import('node:zlib');
    return new Promise((resolve, reject) => {
      zlib.unzip(compressedBuffer, (err, buffer) => {
        if (err) reject(err);
        else resolve(JSON.parse(buffer.toString('utf-8')));
      });
    });
  }
}

function _translateId(encodedId) {
  try {
    let padded = encodedId;
    while (padded.length % 4) padded += '=';
    padded = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    if (decoded.includes(':')) return decoded;
    return encodedId;
  } catch (e) {
    return encodedId;
  }
}

function _deepTranslate(obj) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) _deepTranslate(item);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      if (key === 'id' && typeof obj[key] === 'string') {
        obj[key] = _translateId(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        _deepTranslate(obj[key]);
      }
    }
  }
}

async function _fetchRawEpisodes(anilistId) {
  const payload = {
    path: "episodes",
    method: "GET",
    query: { anilistId: parseInt(anilistId) },
    body: null,
    version: "0.1.0"
  };
  const encodedReq = _encodePipeRequest(payload);
  const res = await fetch(`${MIRURO_PIPE_URL}?e=${encodedReq}`, { headers: MIRURO_HEADERS });
  if (!res.ok) throw new Error("Pipe request failed");
  const text = await res.text();
  const data = await _decodePipeResponse(text.trim());
  _deepTranslate(data);
  return data;
}

async function getSources(episodeId, provider, anilistId, category = "sub") {
  const encId = Buffer.from(episodeId).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = {
    path: "sources",
    method: "GET",
    query: {
      episodeId: encId,
      provider: provider,
      category: category,
      anilistId: parseInt(anilistId)
    },
    body: null,
    version: "0.1.0"
  };
  const encodedReq = _encodePipeRequest(payload);
  const res = await fetch(`${MIRURO_PIPE_URL}?e=${encodedReq}`, { headers: MIRURO_HEADERS });
  if (!res.ok) throw new Error("Pipe request failed");
  const text = await res.text();
  return await _decodePipeResponse(text.trim());
}

app.get('/api/v2/miruro/watch/:provider/:anilist_id/:category/:slug', async (c) => {
  try {
    const provider = c.req.param('provider');
    const anilist_id = parseInt(c.req.param('anilist_id'));
    const category = c.req.param('category');
    const slug = c.req.param('slug');
    
    const data = await _fetchRawEpisodes(anilist_id);
    const provData = (data.providers || {})[provider] || {};
    
    // In python API, episodes dict can either have categories directly or be an array (defaults to 'sub')
    let episodesRaw = provData.episodes || {};
    if (Array.isArray(episodesRaw)) {
      episodesRaw = { sub: episodesRaw };
    }
    const epList = episodesRaw[category] || [];
    
    let targetId = null;
    for (const ep of epList) {
      if (typeof ep !== 'object') continue;
      const origId = ep.id || "";
      const prefix = origId.includes(":") ? origId.split(":")[0] : origId;
      const generated = `${prefix}-${ep.number}`;
      if (generated === slug) {
        targetId = origId;
        break;
      }
    }
    
    if (!targetId) {
      return c.json({ success: false, error: `Episode slug '${slug}' not found for provider ${provider}` }, 404);
    }
    
    const sources = await getSources(targetId, provider, anilist_id, category);
    return c.json({
      success: true,
      data: sources
    });
  } catch (e) {
    console.error("Miruro Watch Error:", e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Route not found',
    method: c.req.method,
    path: c.req.path
  }, 404);
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.onError((error, c) => {
  console.error('[FATAL]', error);
  return err(c, error.message);
});

export default app;
