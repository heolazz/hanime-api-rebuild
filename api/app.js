// api/app.js
import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { serveStatic } from '@hono/node-server/serve-static';
import { getProvider, getProviderWithFallback } from '../core/providerManager.js';
import { withCache, TTL, cacheStats } from '../utils/cache.js';
import miruroRouter from './miruro.js';

const app = new Hono();

app.use('/public/*', serveStatic({ root: './' }));
app.use('/logo.png', serveStatic({ path: './public/logo.png' }));
app.use('/logo.ico', serveStatic({ path: './public/logo.ico' }));

// // ─── Root (API Playground UI) ────────────────────────────────────────────────
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KinoHarth API Playground</title>
  <link rel="icon" href="/logo.ico" type="image/x-icon">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; border: 2px solid transparent; background-clip: padding-box; }
    
    /* Dark mode scrollbar for JSON output */
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border: 2px solid #111827; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; border: 2px solid #111827; }
    
    .string { color: #a7f3d0; } /* emerald-200 */
    .number { color: #93c5fd; } /* blue-300 */
    .boolean { color: #fcd34d; } /* amber-300 */
    .null { color: #fca5a5; } /* red-300 */
    .key { color: #c4b5fd; font-weight: 500; } /* violet-300 */
    
    .mesh-bg {
      background-color: #f8fafc;
      background-image: 
        radial-gradient(at 80% 0%, hsla(289, 40%, 94%, 1) 0px, transparent 50%),
        radial-gradient(at 0% 50%, hsla(210, 40%, 94%, 1) 0px, transparent 50%);
    }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 h-screen w-screen overflow-hidden flex">

  <!-- SIDEBAR -->
  <aside class="w-[260px] flex-shrink-0 flex flex-col bg-white border-r border-gray-100 z-10 h-full shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
    <!-- Logo -->
    <div class="px-5 py-6 flex items-center gap-3">
      <img src="/logo.png" alt="KinoHarth Logo" class="w-8 h-8 rounded-lg shadow-sm object-cover">
      <span class="font-bold text-gray-900 text-lg tracking-tight">KinoHarth API</span>
    </div>
    
    <div class="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
      <div class="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-2 px-3 mt-2">API Playground</div>
      <div id="endpoint-list" class="space-y-0.5"></div>
    </div>
    
    <!-- Bottom Widget -->
    <div class="p-4">
      <div class="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm relative overflow-hidden">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-80"></div>
        <h3 class="font-bold text-gray-900 text-sm mt-1">KinoHarth API</h3>
        <p class="text-xs text-gray-500 mt-1">AniList metadata proxy</p>
        <button class="w-full bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold py-2.5 rounded-xl transition-all shadow-md mt-4 active:scale-95">
          View API Health
        </button>
      </div>
      <div class="text-center mt-4 text-[11px] text-gray-400 font-medium mb-2">
        © 2026 KinoHarth HQ
      </div>
    </div>
  </aside>

  <!-- MAIN CONTENT -->
  <main class="flex-1 flex flex-col min-w-0 mesh-bg h-full overflow-hidden relative">
    
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto px-6 py-12 lg:px-10">
        <!-- Header -->
        <div class="mb-12">
          <h1 class="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mb-3">
            Web Data Infrastructure for Anime Applications
          </h1>
          <p class="text-gray-500 text-lg max-w-3xl">
            A highly reliable and high-performance serverless AniList proxy interface optimized for KinoHarth.
          </p>
        </div>

        <!-- Query Console -->
        <div class="mb-10">
          <div class="text-[11px] font-bold text-gray-400 tracking-widest uppercase mb-4">Query Console</div>
          
          <div class="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8 sm:p-10 relative overflow-hidden">
            <!-- Decorative gradient -->
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-gradient-to-br from-indigo-200 to-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 pointer-events-none"></div>
            
            <h2 class="text-2xl font-bold text-gray-900 mb-8 text-center relative z-10">What do you want to build or query?</h2>
            
            <div class="flex flex-col sm:flex-row gap-3 max-w-3xl mx-auto relative z-10">
              <div class="flex-shrink-0 bg-indigo-50/80 text-indigo-600 font-bold px-4 py-3.5 rounded-2xl text-sm flex items-center justify-center border border-indigo-100/50 hidden sm:flex">
                GET
              </div>
              <div class="flex-1 relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                  </svg>
                </div>
                <input type="text" id="url-input" class="w-full bg-gray-50/50 backdrop-blur-sm border border-gray-200 rounded-2xl pl-12 pr-4 py-3.5 text-gray-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition font-mono text-sm shadow-sm" value="/api/v2/anikoto/home" placeholder="Enter endpoint URL...">
              </div>
              <button id="send-btn" class="flex-shrink-0 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
                <span>Send</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Response Area -->
        <div class="pb-12">
          <div class="flex justify-between items-center mb-4">
             <div class="text-[11px] font-bold text-gray-400 tracking-widest uppercase">Response Output</div>
             <div id="status-badge" class="px-3 py-1 rounded-full text-[11px] font-bold hidden transition-all border tracking-wide uppercase shadow-sm"></div>
          </div>
          
          <div class="bg-[#111827] rounded-3xl shadow-xl border border-gray-800 relative overflow-hidden flex flex-col min-h-[450px]">
            <!-- Window controls (Mac style dots) -->
            <div class="h-12 bg-[#1f2937] border-b border-gray-800/80 flex items-center px-5 gap-2 relative">
              <div class="flex gap-2">
                <div class="w-3 h-3 rounded-full bg-[#ef4444] border border-[#dc2626]"></div>
                <div class="w-3 h-3 rounded-full bg-[#f59e0b] border border-[#d97706]"></div>
                <div class="w-3 h-3 rounded-full bg-[#10b981] border border-[#059669]"></div>
              </div>
              <div class="absolute left-1/2 -translate-x-1/2 text-xs font-mono text-gray-400 px-4 py-1.5 bg-gray-900/50 rounded-md border border-gray-700/50 max-w-[50%] truncate" id="response-url">Waiting for request...</div>
            </div>

            <div id="loading" class="absolute inset-0 bg-[#111827]/80 backdrop-blur-sm flex items-center justify-center hidden z-10 mt-12">
               <svg class="animate-spin h-10 w-10 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            
            <pre id="json-output" class="p-6 sm:p-8 text-[13.5px] font-mono leading-relaxed text-gray-300 overflow-auto flex-1 custom-scrollbar"></pre>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    const endpoints = [
      { name: "Home Page", url: "/api/v2/anikoto/home", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>' },
      { name: "Search Anime", url: "/api/v2/anikoto/search?q=classroom", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>' },
      { name: "Anime Details", url: "/api/v2/anikoto/anime/6957", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
      { name: "Episodes List", url: "/api/v2/anikoto/anime/6957/episodes", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>' },
      { name: "Single Episode", url: "/api/v2/anikoto/anime/6957/ep/1", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
      { name: "Watch (Miruro)", url: "/api/v2/miruro/watch/kiwi/113415/sub/animepahe-2", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>' },
      { name: "Nav Menu", url: "/api/v2/anikoto/nav", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h7"/>' },
      { name: "Browse/Filter", url: "/api/v2/anikoto/browse?type[]=TV&sort=score", icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>' }
    ];

    const list = document.getElementById('endpoint-list');
    const input = document.getElementById('url-input');
    const out = document.getElementById('json-output');
    const stat = document.getElementById('status-badge');
    const load = document.getElementById('loading');
    const urlDisplay = document.getElementById('response-url');

    endpoints.forEach(ep => {
      const btn = document.createElement('button');
      btn.className = "endpoint-btn w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-100/50 transition focus:outline-none group mb-1 flex items-center gap-3";
      btn.innerHTML = \`
        <div class="text-gray-400 group-hover:text-indigo-500 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">\${ep.icon}</svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-gray-700 group-hover:text-indigo-600 transition text-[13px]">\${ep.name}</div>
        </div>\`;
      
      btn.onclick = () => { 
        input.value = ep.url;
        document.querySelectorAll('.endpoint-btn').forEach(b => {
          b.classList.remove('bg-indigo-50', 'text-indigo-900');
          b.querySelector('div:first-child')?.classList.remove('text-indigo-600');
          b.querySelector('div:first-child')?.classList.add('text-gray-400');
        });
        btn.classList.add('bg-indigo-50');
        btn.querySelector('div:first-child').classList.remove('text-gray-400');
        btn.querySelector('div:first-child').classList.add('text-indigo-600');
        
        fetchData(); 
      };
      list.appendChild(btn);
    });

    // Make the first button active initially
    if (list.firstChild) {
      list.firstChild.classList.add('bg-indigo-50');
      list.firstChild.querySelector('div:first-child').classList.remove('text-gray-400');
      list.firstChild.querySelector('div:first-child').classList.add('text-indigo-600');
    }

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
      urlDisplay.textContent = url;
      
      try {
        const start = performance.now();
        const res = await fetch(url);
        const time = Math.round(performance.now() - start);
        
        stat.textContent = \`\${res.status} \${res.statusText} • \${time}ms\`;
        stat.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-700', 'border-emerald-200', 'bg-red-100', 'text-red-700', 'border-red-200', 'bg-amber-100', 'text-amber-700', 'border-amber-200');
        
        if (res.ok) stat.classList.add('bg-emerald-100', 'text-emerald-700', 'border-emerald-200');
        else if (res.status >= 500) stat.classList.add('bg-red-100', 'text-red-700', 'border-red-200');
        else stat.classList.add('bg-amber-100', 'text-amber-700', 'border-amber-200');

        const isJson = res.headers.get('content-type')?.includes('application/json');
        if (isJson) {
          out.innerHTML = syntaxHighlight(await res.json());
        } else {
          out.textContent = await res.text();
        }
      } catch (err) {
        stat.textContent = 'Network Error';
        stat.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-700', 'border-emerald-200', 'bg-amber-100', 'text-amber-700', 'border-amber-200');
        stat.classList.add('bg-red-100', 'text-red-700', 'border-red-200');
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

function _injectSourceSlugs(data, anilistId) {
  const providers = data.providers || {};
  for (const [providerName, providerData] of Object.entries(providers)) {
    if (typeof providerData !== 'object' || providerData === null) continue;

    let episodes = providerData.episodes || {};
    if (typeof episodes !== 'object' || episodes === null) {
      if (Array.isArray(episodes)) {
        providerData.episodes = { sub: episodes };
        episodes = providerData.episodes;
      } else {
        continue;
      }
    }

    for (const [category, epList] of Object.entries(episodes)) {
      if (!Array.isArray(epList)) continue;

      for (const ep of epList) {
        if (typeof ep !== 'object' || ep === null) continue;

        if (ep.id && ep.number) {
          const origId = ep.id;
          const prefix = origId.includes(':') ? origId.split(':')[0] : origId;
          ep.id = `watch/${providerName}/${anilistId}/${category}/${prefix}-${ep.number}`;
        }
      }
    }
  }
  return data;
}

app.get('/api/v2/miruro/episodes/:anilist_id', async (c) => {
  try {
    const anilist_id = parseInt(c.req.param('anilist_id'));
    const data = await _fetchRawEpisodes(anilist_id);
    return c.json({
      success: true,
      data: _injectSourceSlugs(data, anilist_id)
    });
  } catch (e) {
    console.error("Miruro Episodes Error:", e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

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

// Mount the rest of Miruro routes from api/miruro.js
app.route('/api/v2/miruro', miruroRouter);

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