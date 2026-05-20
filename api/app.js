// api/app.js
import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { getProvider, getProviderWithFallback } from '../core/providerManager.js';
import { withCache, TTL, cacheStats } from '../utils/cache.js';

const app = new Hono();

// ─── Root (API Playground UI) ────────────────────────────────────────────────
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Anime API Playground</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1f2937; }
    ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    .string { color: #a5d6ff; }
    .number { color: #79c0ff; }
    .boolean { color: #ff7b72; }
    .null { color: #ff7b72; }
    .key { color: #7ee787; font-weight: 500; }
  </style>
</head>
<body class="bg-gray-900 text-gray-100 h-screen flex overflow-hidden font-sans">
  
  <div class="w-1/3 flex flex-col border-r border-gray-700 bg-gray-800 max-w-sm">
    <div class="p-5 border-b border-gray-700">
      <h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Anime API</h1>
      <p class="text-sm text-gray-400 mt-1">Interactive Playground</p>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-2" id="endpoint-list"></div>
  </div>

  <div class="flex-1 flex flex-col bg-gray-900">
    <div class="p-4 bg-gray-800 border-b border-gray-700 flex gap-3 items-center">
      <div class="bg-emerald-600/20 text-emerald-400 font-bold px-4 py-2 rounded">GET</div>
      <input type="text" id="url-input" class="flex-1 bg-gray-950 border border-gray-600 rounded-lg px-4 py-2 text-gray-100 focus:outline-none focus:border-blue-500 transition font-mono text-sm" value="/api/v2/anikoto/home">
      <button id="send-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-2 rounded-lg transition shadow-lg shadow-blue-900/20">Send</button>
    </div>

    <div class="flex-1 p-4 overflow-hidden flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <h2 class="font-semibold text-gray-400 flex items-center gap-2">
          Response Body
        </h2>
        <div id="status-badge" class="px-3 py-1 rounded-full text-xs font-bold hidden transition-all"></div>
      </div>
      <div class="flex-1 bg-gray-950 border border-gray-800 rounded-xl overflow-auto relative shadow-inner">
        <div id="loading" class="absolute inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center hidden z-10">
           <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </div>
        <pre id="json-output" class="p-6 text-sm font-mono leading-relaxed"></pre>
      </div>
    </div>
  </div>

  <script>
    const endpoints = [
      { name: "Home Page", url: "/api/v2/anikoto/home", desc: "Get trending & latest anime" },
      { name: "Search Anime", url: "/api/v2/anikoto/search?q=classroom", desc: "Search by keyword" },
      { name: "Anime Details", url: "/api/v2/anikoto/anime/6957", desc: "Get info by ID" },
      { name: "Episodes List", url: "/api/v2/anikoto/anime/6957/episodes", desc: "Get all episodes" },
      { name: "Single Episode (Anikoto)", url: "/api/v2/anikoto/anime/6957/ep/1", desc: "Get streaming sources" },
      { name: "Watch (Miruro)", url: "/api/v2/miruro/watch/kiwi/113415/sub/animepahe-2", desc: "Get sources from Miruro" },
      { name: "Nav Menu", url: "/api/v2/anikoto/nav", desc: "Get navigation links" },
      { name: "Browse/Filter", url: "/api/v2/anikoto/browse?type[]=TV&sort=score", desc: "Filter by genre, type, etc" }
    ];

    const list = document.getElementById('endpoint-list');
    const input = document.getElementById('url-input');
    const out = document.getElementById('json-output');
    const stat = document.getElementById('status-badge');
    const load = document.getElementById('loading');

    endpoints.forEach(ep => {
      const btn = document.createElement('button');
      btn.className = "w-full text-left p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition border border-transparent hover:border-blue-500/50 focus:outline-none group";
      btn.innerHTML = \`<div class="font-bold text-gray-200 group-hover:text-blue-400 transition">\${ep.name}</div>
                       <div class="text-xs text-gray-500 mt-1 truncate">\${ep.url}</div>\`;
      btn.onclick = () => { input.value = ep.url; fetchData(); };
      list.appendChild(btn);
    });

    function syntaxHighlight(json) {
      if (typeof json != 'string') json = JSON.stringify(json, undefined, 2);
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        let cls = 'number';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'key' : 'string';
        } else if (/true|false/.test(match)) cls = 'boolean';
        else if (/null/.test(match)) cls = 'null';
        return \`<span class="\${cls}">\${match}</span>\`;
      });
    }

    async function fetchData() {
      const url = input.value.trim();
      if (!url) return;
      load.classList.remove('hidden');
      out.innerHTML = '';
      stat.classList.add('hidden');
      
      try {
        const start = performance.now();
        const res = await fetch(url);
        const time = Math.round(performance.now() - start);
        
        stat.textContent = \`\${res.status} \${res.statusText} • \${time}ms\`;
        stat.classList.remove('hidden', 'bg-emerald-600', 'bg-red-600', 'bg-yellow-600');
        stat.classList.add(res.ok ? 'bg-emerald-600' : (res.status >= 500 ? 'bg-red-600' : 'bg-yellow-600'));

        const isJson = res.headers.get('content-type')?.includes('application/json');
        if (isJson) {
          out.innerHTML = syntaxHighlight(await res.json());
        } else {
          out.textContent = await res.text();
        }
      } catch (err) {
        stat.textContent = 'Network Error';
        stat.classList.remove('hidden', 'bg-emerald-600', 'bg-yellow-600');
        stat.classList.add('bg-red-600');
        out.innerHTML = \`<span class="text-red-400">\${err.message}</span>\`;
      } finally {
        load.classList.add('hidden');
      }
    }

    document.getElementById('send-btn').onclick = fetchData;
    input.onkeypress = (e) => { if (e.key === 'Enter') fetchData(); };
    fetchData(); // run on load
  </script>
</body>
</html>`;
  return c.html(html);
});

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
