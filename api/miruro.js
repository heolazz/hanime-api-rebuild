import { Hono } from 'hono';
import { Buffer } from 'node:buffer';

const miruro = new Hono();

const ANILIST_URL = "https://graphql.anilist.co";
const MIRURO_PIPE_URL = "https://www.miruro.tv/api/secure/pipe";

const MEDIA_LIST_FIELDS = `
    id
    title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    format
    season
    seasonYear
    episodes
    duration
    status
    averageScore
    meanScore
    popularity
    favourites
    genres
    source
    countryOfOrigin
    isAdult
    studios(isMain: true) { nodes { name isAnimationStudio } }
    nextAiringEpisode { episode airingAt timeUntilAiring }
    startDate { year month day }
    endDate { year month day }
`;

const MEDIA_FULL_FIELDS = `
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { large extraLarge color }
    bannerImage
    format
    season
    seasonYear
    episodes
    duration
    status
    averageScore
    meanScore
    popularity
    favourites
    trending
    genres
    tags { name rank isMediaSpoiler }
    source
    countryOfOrigin
    isAdult
    hashtag
    synonyms
    siteUrl
    trailer { id site thumbnail }
    studios { nodes { id name isAnimationStudio siteUrl } }
    nextAiringEpisode { episode airingAt timeUntilAiring }
    startDate { year month day }
    endDate { year month day }
    characters(sort: [ROLE, RELEVANCE], perPage: 25) {
        edges {
            role
            node { id name { full native } image { large } }
            voiceActors(language: JAPANESE) { id name { full native } image { large } languageV2 }
        }
    }
    staff(sort: RELEVANCE, perPage: 25) {
        edges {
            role
            node { id name { full native } image { large } }
        }
    }
    relations {
        edges {
            relationType(version: 2)
            node {
                id
                title { romaji english native }
                coverImage { large }
                format
                type
                status
                episodes
                meanScore
            }
        }
    }
    recommendations(sort: RATING_DESC, perPage: 10) {
        nodes {
            rating
            mediaRecommendation {
                id
                title { romaji english native }
                coverImage { large }
                format
                episodes
                status
                meanScore
                averageScore
            }
        }
    }
    externalLinks { url site type }
    streamingEpisodes { title thumbnail url site }
    stats {
        scoreDistribution { score amount }
        statusDistribution { status amount }
    }
`;

function ok(c, data) { return c.json({ success: true, data }); }
function err(c, message, status = 500) { return c.json({ success: false, error: message }, status); }

async function _anilistQuery(query, variables = null) {
  const body = { query };
  if (variables) body.variables = variables;
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("AniList query failed");
  const json = await res.json();
  return json.data || {};
}

function _toAnimeCard(m) {
  return {
    id: String(m.id || ""),
    name: m.title?.english || m.title?.romaji || "",
    jname: m.title?.native,
    poster: m.coverImage?.extraLarge || m.coverImage?.large,
    type: m.format,
    episodes: { sub: m.episodes, dub: null }
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatStatus(status) {
  if (!status) return '';
  return status.split('_').map(w => capitalize(w)).join(' ');
}

function _toSpotlightCard(m, rank) {
  const otherInfo = [];
  if (m.format) otherInfo.push(m.format);
  if (m.duration) otherInfo.push(`${m.duration}m`);
  if (m.status) otherInfo.push(formatStatus(m.status));
  if (m.season && m.seasonYear) otherInfo.push(`${capitalize(m.season)} ${m.seasonYear}`);
  
  return {
    id: String(m.id || ""),
    name: m.title?.english || m.title?.romaji || "",
    jname: m.title?.native,
    poster: m.coverImage?.extraLarge || m.coverImage?.large,
    description: m.description || "",
    rating: m.averageScore ? String(m.averageScore) : null,
    rank,
    otherInfo,
    genres: m.genres || [],
    episodes: { sub: m.episodes, dub: null }
  };
}

function _toTop10Card(m, rank) {
  return {
    id: String(m.id || ""),
    name: m.title?.english || m.title?.romaji || "",
    poster: m.coverImage?.large,
    rank,
    episodes: { sub: m.episodes, dub: null }
  };
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
miruro.get("/home", async (c) => {
  const spotlight_gql = `query { Page(page:1,perPage:10) { media(sort:[TRENDING_DESC,POPULARITY_DESC],type:ANIME) { ${MEDIA_LIST_FIELDS} } } }`;
  const latest_ep_gql = `query($p:Int,$pp:Int) { Page(page:$p,perPage:$pp) { media(type:ANIME,status:RELEASING,sort:[UPDATED_AT_DESC]) { ${MEDIA_LIST_FIELDS} } } }`;
  const new_rel_gql = `query($p:Int,$pp:Int) { Page(page:$p,perPage:$pp) { media(type:ANIME,sort:[START_DATE_DESC]) { ${MEDIA_LIST_FIELDS} } } }`;
  const upcoming_gql = `query($p:Int,$pp:Int) { Page(page:$p,perPage:$pp) { media(type:ANIME,status:NOT_YET_RELEASED,sort:[POPULARITY_DESC]) { ${MEDIA_LIST_FIELDS} } } }`;
  const top10_today_gql = `query { Page(page:1,perPage:10) { media(type:ANIME,sort:[TRENDING_DESC]) { ${MEDIA_LIST_FIELDS} } } }`;
  const top10_week_gql = `query { Page(page:1,perPage:10) { media(type:ANIME,sort:[POPULARITY_DESC]) { ${MEDIA_LIST_FIELDS} } } }`;
  const top10_month_gql = `query { Page(page:1,perPage:10) { media(type:ANIME,sort:[FAVOURITES_DESC]) { ${MEDIA_LIST_FIELDS} } } }`;
  const genres_gql = "query { GenreCollection }";

  try {
    const [
      spotlight_data, latest_data, new_rel_data, upcoming_data,
      t10_today, t10_week, t10_month, genres_data
    ] = await Promise.all([
      _anilistQuery(spotlight_gql),
      _anilistQuery(latest_ep_gql, { p: 1, pp: 14 }),
      _anilistQuery(new_rel_gql, { p: 1, pp: 14 }),
      _anilistQuery(upcoming_gql, { p: 1, pp: 10 }),
      _anilistQuery(top10_today_gql),
      _anilistQuery(top10_week_gql),
      _anilistQuery(top10_month_gql),
      _anilistQuery(genres_gql)
    ]);

    const mediaFallback = (d) => d?.Page?.media || [];

    return ok(c, {
      genres: genres_data?.GenreCollection || [],
      spotlightAnimes: mediaFallback(spotlight_data).map((m, i) => _toSpotlightCard(m, i + 1)),
      latestEpisodeAnimes: mediaFallback(latest_data).map(_toAnimeCard),
      newReleases: mediaFallback(new_rel_data).map(_toAnimeCard),
      topUpcomingAnimes: mediaFallback(upcoming_data).map(_toAnimeCard),
      top10Animes: {
        today: mediaFallback(t10_today).map((m, i) => _toTop10Card(m, i + 1)),
        week: mediaFallback(t10_week).map((m, i) => _toTop10Card(m, i + 1)),
        month: mediaFallback(t10_month).map((m, i) => _toTop10Card(m, i + 1)),
      }
    });
  } catch (e) {
    return err(c, `Failed to fetch home data: ${e.message}`);
  }
});

// ─── INDEX ────────────────────────────────────────────────────────────────
miruro.get("/index", async (c) => {
  try {
    const genres_data = await _anilistQuery("query { GenreCollection }");
    const genres = genres_data?.GenreCollection || [];
    
    const azList = [{ label: "All", href: "/az-list/" }, { label: "0-9", href: "/az-list/0-9" }];
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(ch => {
      azList.push({ label: ch, href: `/az-list/${ch}` });
    });

    const mostSearched = ["Action", "Romance", "Comedy", "Fantasy", "Adventure", "Drama", "Sci-Fi", "Slice of Life"]
      .map(g => ({ label: g, keyword: g }));

    return ok(c, {
      meta: {
        title: "Miruro — Watch Anime Online",
        description: "Watch anime online in HD with subtitles. Browse thousands of anime series and movies.",
        ogImage: "https://www.miruro.tv/og-image.png",
        canonical: "https://www.miruro.tv/"
      },
      mostSearched,
      genres,
      azList,
      footerMenu: [
        { label: "DMCA", href: "/pages/dmca" },
        { label: "Terms of Use", href: "/pages/terms" },
        { label: "Privacy Policy", href: "/pages/privacy" },
        { label: "Contact", href: "/contact" }
      ]
    });
  } catch (e) {
    return err(c, `Failed to fetch index data: ${e.message}`);
  }
});

// ─── NAV MENU ────────────────────────────────────────────────────────────────
miruro.get("/nav", async (c) => {
  try {
    const genres_data = await _anilistQuery("query { GenreCollection }");
    const raw_genres = genres_data?.GenreCollection || [];
    const genre_links = raw_genres.map(g => ({ name: g, url: `/api/v2/miruro/filter?genre=${encodeURIComponent(g)}` }));

    return ok(c, {
      header: {
        brand: { link: "https://www.miruro.tv/", logo: "https://www.miruro.tv/favicon.ico" },
        buttons: { menu: true, search: true, watch2gether: null, random: null },
        search: { action: "/api/v2/miruro/search", placeholder: "Search anime...", filter_link: "/api/v2/miruro/filter" },
        menu: {
          genres: genre_links,
          types: ["TV", "Movie", "OVA", "ONA", "Special", "Music"].map(t => ({ name: t, url: `/api/v2/miruro/filter?format=${t.toUpperCase()}` })),
          links: ["Home", "Trending", "Popular", "Upcoming", "Recent", "Schedule"].map(t => ({ name: t, url: `/api/v2/miruro/${t.toLowerCase()}` }))
        },
        browse: {
          url: "/api/v2/miruro/filter",
          sortOptions: [
            { label: "Popularity", value: "POPULARITY_DESC" },
            { label: "Trending", value: "TRENDING_DESC" },
            { label: "Score", value: "SCORE_DESC" },
            { label: "Newest First", value: "START_DATE_DESC" },
            { label: "Favourites", value: "FAVOURITES_DESC" },
            { label: "Updated", value: "UPDATED_AT_DESC" }
          ],
          filters: {
            type: ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"],
            status: ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED"],
            season: ["FALL", "SUMMER", "SPRING", "WINTER"],
            rating: ["G", "PG", "PG_13", "R", "R_PLUS", "RX"],
            language: ["sub", "dub"]
          }
        }
      }
    });
  } catch (e) {
    return err(c, `Failed to fetch nav data: ${e.message}`);
  }
});

// ─── SEARCH & SUGGESTIONS ───────────────────────────────────────────────────
miruro.get("/search", async (c) => {
  const query = c.req.query('query') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const perPage = parseInt(c.req.query('per_page') || '20', 10);
  
  const gql = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_LIST_FIELDS} }
      }
    }
  `;
  try {
    const data = await _anilistQuery(gql, { search: query, page, perPage });
    const pageInfo = data?.Page?.pageInfo || {};
    return ok(c, {
      page: pageInfo.currentPage || page,
      perPage: pageInfo.perPage || perPage,
      total: pageInfo.total || 0,
      hasNextPage: pageInfo.hasNextPage || false,
      results: data?.Page?.media || []
    });
  } catch (e) {
    return err(c, e.message);
  }
});

miruro.get("/suggestions", async (c) => {
  const query = c.req.query('query');
  if (!query) return err(c, "Missing query", 400);
  
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id title { romaji english } coverImage { large } format status startDate { year } episodes
        }
      }
    }
  `;
  try {
    const data = await _anilistQuery(gql, { search: query });
    const media = data?.Page?.media || [];
    const results = media.map(item => ({
      id: item.id,
      title: item.title?.english || item.title?.romaji,
      title_romaji: item.title?.romaji,
      poster: item.coverImage?.large,
      format: item.format,
      status: item.status,
      year: item.startDate?.year,
      episodes: item.episodes
    }));
    return ok(c, { suggestions: results });
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── FILTER ────────────────────────────────────────────────────────────────
const SORT_MAP = {
  SCORE_DESC: "SCORE_DESC",
  POPULARITY_DESC: "POPULARITY_DESC",
  TRENDING_DESC: "TRENDING_DESC",
  START_DATE_DESC: "START_DATE_DESC",
  FAVOURITES_DESC: "FAVOURITES_DESC",
  UPDATED_AT_DESC: "UPDATED_AT_DESC"
};

miruro.get("/filter", async (c) => {
  const genre = c.req.query('genre');
  const tag = c.req.query('tag');
  const year = c.req.query('year') ? parseInt(c.req.query('year'), 10) : null;
  const season = c.req.query('season');
  const format = c.req.query('format');
  const status = c.req.query('status');
  const sort = c.req.query('sort') || "POPULARITY_DESC";
  const page = parseInt(c.req.query('page') || '1', 10);
  const perPage = parseInt(c.req.query('per_page') || '20', 10);

  const args = ["type: ANIME", `sort: [${SORT_MAP[sort] || 'POPULARITY_DESC'}]`];
  const variables = { page, perPage };
  const varTypes = ["$page: Int", "$perPage: Int"];

  if (genre) { args.push("genre: $genre"); variables.genre = genre; varTypes.push("$genre: String"); }
  if (tag) { args.push("tag: $tag"); variables.tag = tag; varTypes.push("$tag: String"); }
  if (year) { args.push("seasonYear: $seasonYear"); variables.seasonYear = year; varTypes.push("$seasonYear: Int"); }
  if (season) { args.push("season: $season"); variables.season = season.toUpperCase(); varTypes.push("$season: MediaSeason"); }
  if (format) { args.push("format: $format"); variables.format = format.toUpperCase(); varTypes.push("$format: MediaFormat"); }
  if (status) { args.push("status: $status"); variables.status = status.toUpperCase(); varTypes.push("$status: MediaStatus"); }

  const gql = `
    query (${varTypes.join(', ')}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(${args.join(', ')}) { ${MEDIA_LIST_FIELDS} }
      }
    }
  `;

  try {
    const data = await _anilistQuery(gql, variables);
    const pageInfo = data?.Page?.pageInfo || {};
    return ok(c, {
      page: pageInfo.currentPage || page,
      perPage: pageInfo.perPage || perPage,
      total: pageInfo.total || 0,
      hasNextPage: pageInfo.hasNextPage || false,
      results: data?.Page?.media || []
    });
  } catch (e) {
    return err(c, e.message);
  }
});

// ─── COLLECTIONS ────────────────────────────────────────────────────────────
async function _fetchCollection(sortType, statusStr = null, page = 1, perPage = 20) {
  const statusFilter = statusStr ? `, status: ${statusStr}` : "";
  const gql = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(type: ANIME, sort: [${sortType}]${statusFilter}) { ${MEDIA_LIST_FIELDS} }
      }
    }
  `;
  const data = await _anilistQuery(gql, { page, perPage });
  const pageInfo = data?.Page?.pageInfo || {};
  return {
    page: pageInfo.currentPage || page,
    perPage: pageInfo.perPage || perPage,
    total: pageInfo.total || 0,
    hasNextPage: pageInfo.hasNextPage || false,
    results: data?.Page?.media || []
  };
}

miruro.get("/spotlight", async (c) => {
  const gql = `query { Page(page:1,perPage:10) { media(sort:[TRENDING_DESC,POPULARITY_DESC],type:ANIME) { ${MEDIA_LIST_FIELDS} } } }`;
  try {
    const data = await _anilistQuery(gql);
    const media = data?.Page?.media || [];
    return ok(c, { results: media.map((m, i) => _toSpotlightCard(m, i + 1)) });
  } catch (e) { return err(c, e.message); }
});

miruro.get("/trending", async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '20', 10);
    return ok(c, await _fetchCollection("TRENDING_DESC", null, page, perPage));
  } catch (e) { return err(c, e.message); }
});

miruro.get("/popular", async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '20', 10);
    return ok(c, await _fetchCollection("POPULARITY_DESC", null, page, perPage));
  } catch (e) { return err(c, e.message); }
});

miruro.get("/upcoming", async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '20', 10);
    return ok(c, await _fetchCollection("POPULARITY_DESC", "NOT_YET_RELEASED", page, perPage));
  } catch (e) { return err(c, e.message); }
});

miruro.get("/recent", async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '20', 10);
    return ok(c, await _fetchCollection("START_DATE_DESC", "RELEASING", page, perPage));
  } catch (e) { return err(c, e.message); }
});

miruro.get("/schedule", async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '20', 10);
    const gql = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total currentPage lastPage hasNextPage perPage }
          airingSchedules(notYetAired: true, sort: TIME) {
            episode airingAt timeUntilAiring media { ${MEDIA_LIST_FIELDS} }
          }
        }
      }
    `;
    const data = await _anilistQuery(gql, { page, perPage });
    const pageInfo = data?.Page?.pageInfo || {};
    const results = (data?.Page?.airingSchedules || []).map(item => {
      const entry = item.media || {};
      entry.next_episode = item.episode;
      entry.airingAt = item.airingAt;
      entry.timeUntilAiring = item.timeUntilAiring;
      return entry;
    });
    return ok(c, {
      page: pageInfo.currentPage || page,
      perPage: pageInfo.perPage || perPage,
      total: pageInfo.total || 0,
      hasNextPage: pageInfo.hasNextPage || false,
      results
    });
  } catch (e) { return err(c, e.message); }
});

// ─── ANIME DETAILS ──────────────────────────────────────────────────────────
miruro.get("/info/:anilist_id", async (c) => {
  try {
    const id = parseInt(c.req.param('anilist_id'), 10);
    const gql = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FULL_FIELDS} } }`;
    const data = await _anilistQuery(gql, { id });
    if (!data.Media) return err(c, "Anime not found", 404);
    return ok(c, data.Media);
  } catch (e) { return err(c, e.message); }
});

miruro.get("/anime/:anilist_id/characters", async (c) => {
  try {
    const id = parseInt(c.req.param('anilist_id'), 10);
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '25', 10);
    const gql = `
      query ($id: Int, $page: Int, $perPage: Int) {
        Media(id: $id, type: ANIME) {
          id title { romaji english }
          characters(sort: [ROLE, RELEVANCE], page: $page, perPage: $perPage) {
            pageInfo { total currentPage lastPage hasNextPage perPage }
            edges {
              role node { id name { full native userPreferred } image { large medium } description gender dateOfBirth { year month day } age favourites siteUrl }
              voiceActors { id name { full native } image { large } languageV2 }
            }
          }
        }
      }
    `;
    const data = await _anilistQuery(gql, { id, page, perPage });
    if (!data.Media) return err(c, "Anime not found", 404);
    const chars = data.Media.characters || {};
    const pageInfo = chars.pageInfo || {};
    return ok(c, {
      page: pageInfo.currentPage || page,
      perPage: pageInfo.perPage || perPage,
      total: pageInfo.total || 0,
      hasNextPage: pageInfo.hasNextPage || false,
      characters: chars.edges || []
    });
  } catch (e) { return err(c, e.message); }
});

miruro.get("/anime/:anilist_id/relations", async (c) => {
  try {
    const id = parseInt(c.req.param('anilist_id'), 10);
    const gql = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id title { romaji english }
          relations { edges { relationType(version: 2) node { id title { romaji english native } coverImage { large } bannerImage format type status episodes chapters meanScore averageScore popularity startDate { year month day } } } }
        }
      }
    `;
    const data = await _anilistQuery(gql, { id });
    if (!data.Media) return err(c, "Anime not found", 404);
    return ok(c, { id: data.Media.id, title: data.Media.title, relations: data.Media.relations?.edges || [] });
  } catch (e) { return err(c, e.message); }
});

miruro.get("/anime/:anilist_id/recommendations", async (c) => {
  try {
    const id = parseInt(c.req.param('anilist_id'), 10);
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('per_page') || '10', 10);
    const gql = `
      query ($id: Int, $page: Int, $perPage: Int) {
        Media(id: $id, type: ANIME) {
          id title { romaji english }
          recommendations(sort: RATING_DESC, page: $page, perPage: $perPage) {
            pageInfo { total currentPage lastPage hasNextPage perPage }
            nodes { rating mediaRecommendation { id title { romaji english native } coverImage { large extraLarge } bannerImage format episodes status meanScore averageScore popularity genres startDate { year } } }
          }
        }
      }
    `;
    const data = await _anilistQuery(gql, { id, page, perPage });
    if (!data.Media) return err(c, "Anime not found", 404);
    const recs = data.Media.recommendations || {};
    const pageInfo = recs.pageInfo || {};
    return ok(c, {
      page: pageInfo.currentPage || page,
      perPage: pageInfo.perPage || perPage,
      total: pageInfo.total || 0,
      hasNextPage: pageInfo.hasNextPage || false,
      recommendations: recs.nodes || []
    });
  } catch (e) { return err(c, e.message); }
});

export default miruro;
