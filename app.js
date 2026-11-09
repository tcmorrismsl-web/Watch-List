/* Watch List — runs on GitHub Pages.
   Show data: TMDB (search, seasons, categories, US streaming providers, recommendations).
   Sync + sharing: Firebase Auth + Firestore (optional; without it the list stays in this browser). */
(() => {
"use strict";

/* ---------- constants ---------- */
const CFG = window.WATCHLIST_CONFIG || {};
const FB_CFG = CFG.firebase || {};
const HAS_FB = !!(FB_CFG.apiKey && FB_CFG.projectId && FB_CFG.authDomain);
const APP_VERSION = "19"; // keep in sync with version.txt
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";

const GENRES = ["Drama","Comedy","Reality TV","Docuseries","Documentary","Crime","Thriller","Mystery","Sci-Fi","Fantasy","Action",
  "Horror","Animation","Anime","Romance","Family","History","War","Western","Music","Talk show","News","Stand-up"];
const TMDB_GENRE = {"Action & Adventure":["Action"],"Adventure":["Action"],"Science Fiction":["Sci-Fi"],"Sci-Fi & Fantasy":["Sci-Fi","Fantasy"],
  "War & Politics":["War"],"Reality":["Reality TV"],"Kids":["Family"],"Talk":["Talk show"],"Soap":["Drama"],"TV Movie":[]};
const PLATFORMS = [
  ["Netflix","#E50914"],["HBO Max","#3B4BDB"],["Hulu","#1CE783"],["Disney+","#113CCF"],["Prime Video","#00A8E1"],
  ["Apple TV","#9A9AA0"],["Peacock","#F2B807"],["Paramount+","#0064FF"],["Starz","#6E6E73"],["AMC+","#D7A20E"],
  ["MGM+","#B8954A"],["Discovery+","#2175D9"],["Crunchyroll","#F47521"],["BritBox","#2B4C9B"],["Acorn TV","#3E7B3E"],
  ["Shudder","#C8102E"],["BET+","#7E57C2"],["Tubi","#7A2CF5"],["Pluto TV","#E6D000"],["Roku Channel","#6C3C97"],["YouTube","#FF0033"],
  ["Cable / live TV","#4F7A99"],["Rent or buy","#8A8F9C"],["In theaters","#B5651D"]
];
const PLAT_COLOR = Object.fromEntries(PLATFORMS);
const SERVICE_CHOICES = PLATFORMS.slice(0, 21).map(p => p[0]);
const PROV_RULES = [
  [/^netflix/i,"Netflix"],[/^(hbo )?max\b|^hbo max|^hbo now/i,"HBO Max"],[/^hulu/i,"Hulu"],[/^disney/i,"Disney+"],
  [/^(amazon )?prime video( with ads)?$|^amazon freevee|^freevee/i,"Prime Video"],[/^apple tv(\s?(\+|plus))?( amazon channel)?$/i,"Apple TV"],[/^peacock/i,"Peacock"],
  [/^paramount|^showtime/i,"Paramount+"],[/^starz/i,"Starz"],[/^amc\s?(\+|plus)/i,"AMC+"],[/^mgm/i,"MGM+"],
  [/^discovery\s?(\+|plus)/i,"Discovery+"],[/^crunchyroll/i,"Crunchyroll"],[/^britbox/i,"BritBox"],[/^acorn/i,"Acorn TV"],
  [/^shudder/i,"Shudder"],[/^bet\s?(\+|plus)/i,"BET+"],[/^tubi/i,"Tubi"],[/^pluto/i,"Pluto TV"],[/^the roku channel|^roku channel/i,"Roku Channel"],
  [/^youtube tv|^fubo|^sling|^directv|^philo|^spectrum|^xfinity|^frndly/i,"Cable / live TV"],[/^youtube( premium| free)?$/i,"YouTube"]
];
const TABS = [["watching","Watching"],["want","Up next"],["caught","Caught up"],["watched","Watched"],["foryou","For you"]];
const RATINGS = [[2,"Loved"],[1,"Liked"],[0,"Meh"],[-1,"Not for me"]];
const STATUS_LABEL = {want:"Up next",watching:"Watching",watched:"Watched",dropped:"Dropped"};
const LIST_NAME = {mine:"My list", ours:"Our list"};
const DEF_PROFILE = {genres:[],services:[],onlyMine:false,kind:"both",recent:false,dismissed:[]};
const DAY = 864e5;

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
const main = $("main"), sheet = $("sheet"), sheetWrap = $("sheetWrap");
function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k,v){ try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k,v); } catch(e){} }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function str(v,n){ return v == null ? "" : String(v).slice(0,n); }
function norm(s){ return String(s||"").toLowerCase().replace(/^the\s+/,"").replace(/[^a-z0-9]+/g,""); }
function key(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,""); }
function newId(){ return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function clean(o){ return JSON.parse(JSON.stringify(o)); }
function pad(n){ return String(n).padStart(2,"0"); }
function code(s,e){ return "S" + pad(s) + "E" + pad(e); }
function hash(s){ let h = 7; for (const c of String(s)) h = (h*31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function fmtDate(iso){
  if (!iso) return ""; const d = new Date(iso + "T12:00:00"); if (isNaN(d)) return "";
  const o = {month:"short", day:"numeric"}; if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return d.toLocaleDateString(undefined, o);
}
function ymd(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function todayISO(){ return ymd(new Date()); }
function dayDiff(iso){ const t = new Date(iso + "T12:00:00"), n = new Date(); n.setHours(12,0,0,0); return Math.round((t - n) / DAY); }
function relDay(iso){
  const k = dayDiff(iso);
  if (k===0) return "today"; if (k===1) return "tomorrow"; if (k===-1) return "yesterday";
  if (k>1 && k<7) return new Date(iso + "T12:00:00").toLocaleDateString(undefined,{weekday:"long"});
  return fmtDate(iso);
}
function fmtRun(m){ if(!m) return ""; const h = Math.floor(m/60), r = m%60; return h ? `${h}h ${pad(r)}m` : `${m}m`; }
async function pool(arr, n, fn){
  const out = new Array(arr.length); let i = 0;
  await Promise.all(Array.from({length:Math.min(n, arr.length)}, async () => { while (i < arr.length){ const j = i++; out[j] = await fn(arr[j], j); } }));
  return out;
}
let toastTimer;
function toast(msg){ const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ t.hidden = true; }, 2800); }

/* ---------- state ---------- */
const st = {
  mode:null,               // "cloud" | "local"
  authReady:false,
  user:null, authErr:"", authBusy:false,
  ready:false,
  lists:{mine:{}, ours:{}},
  list: lsGet("wl.list")==="ours" ? "ours" : "mine",
  household:null, hhErr:"", hhBusy:false,
  userDoc:{}, profile:{...DEF_PROFILE},
  tab: TABS.some(t => t[0]===lsGet("wl.tab")) ? lsGet("wl.tab") : "watching",
  cat: lsGet("wl.cat") || "", plat: lsGet("wl.plat") || "", filter:"",
  sheet:null,
  picks:{mine:null, ours:null}, picksBusy:false, picksErr:"",
  fresh:null, freshBusy:false, freshErr:"", freshFor:"",
  fillBusy:false, updBusy:false
};
Object.defineProperty(st, "items", {get(){ return st.lists[st.list]; }});
try { const p = JSON.parse(lsGet("wl.picks")||"null"); if (p) st.picks = {mine:p.mine||null, ours:p.ours||null}; } catch(e){}
function tmdbKey(){ return (lsGet("wl.tmdb") || st.userDoc.tmdbKey || (st.household && st.household.tmdbKey) || CFG.tmdbKey || "").trim(); }
function uid(){ return st.user && st.user.uid; }
function listOf(id){ return st.lists.ours[id] ? "ours" : st.lists.mine[id] ? "mine" : st.list; }

/* ---------- categories & services ---------- */
function normGenre(g, type){
  if (!g) return "";
  const k = key(g);
  let out = GENRES.find(x => key(x)===k) || ({reality:"Reality TV",realitytv:"Reality TV",scifi:"Sci-Fi",sciencefiction:"Sci-Fi",standup:"Stand-up",talk:"Talk show",kids:"Family"})[k] || String(g).trim().slice(0,30);
  if (out==="Documentary" && type==="tv") out = "Docuseries";
  if (out==="Docuseries" && type==="movie") out = "Documentary";
  return out;
}
function mapTmdbGenres(names, type, lang){
  const out = [];
  names.forEach(n => (TMDB_GENRE[n] || [n]).forEach(g => out.push(normGenre(g, type))));
  if (lang==="ja" && out.includes("Animation")) out.push("Anime");
  return [...new Set(out.filter(Boolean))];
}
function genresOf(it){ return [...new Set((it.genres||[]).map(g => normGenre(g, it.type)).filter(Boolean))]; }
function normProvider(name){
  const n = String(name||"").trim();
  for (const [re, out] of PROV_RULES) if (re.test(n)) return out;
  return n.replace(/\s+(with ads|amazon channel|apple tv channel|roku premium channel|standard with ads|basic with ads)$/i,"").slice(0,40);
}
function platsOf(x){ return [...new Set((Array.isArray(x.platforms)?x.platforms:[]).filter(Boolean))]; }
function svcBadges(x, max){
  const ps = platsOf(x); if (!ps.length) return "";
  const shown = max ? ps.slice(0,max) : ps;
  return `<div class="svcs">${shown.map(p=>`<span class="svc" style="--c:${PLAT_COLOR[p]||"#8A8F9C"}"><i></i>${esc(p)}</span>`).join("")}${ps.length>shown.length?`<span class="svc more">+${ps.length-shown.length}</span>`:""}</div>`;
}

/* ---------- episodes ---------- */
function totalEps(it){ return (it.seasons||[]).reduce((a,b)=>a+(+b||0),0); }
function watchedEps(it){
  const S = it.seasons||[], p = it.progress||{s:1,e:0};
  let n = 0; for (let i=0;i<p.s-1 && i<S.length;i++) n += S[i];
  return n + (p.e||0);
}
function after(a, b){ return a.s > b.s || (a.s===b.s && a.e > b.e); }
// Latest episode that has actually aired, or null when there's no air-date data (hand-added shows).
// When an aired episode can actually be streamed in the US. Streaming originals and premium channels
// (Netflix, Max/HBO, Apple TV, Starz…) stream the day they air. Broadcast and cable shows reach
// Hulu, Peacock and the like the next day.
const SAME_DAY = /netflix|hulu|prime video|amazon|apple tv|disney\+|\bmax\b|hbo|peacock|paramount\+|showtime|starz|amc\+|mgm\+|discovery\+|bet\+|britbox|acorn|shudder|crunchyroll|youtube|tubi|roku/i;
function streamsSameDay(it){ return SAME_DAY.test(it.network || "") || platsOf(it).some(p => (it.network||"").toLowerCase().includes(p.toLowerCase())); }
function availOn(date, it){
  if (!date) return "";
  if (streamsSameDay(it)) return date;
  const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); return ymd(d);
}
function prevEp(x, it){
  if (x.e > 1) return {s:x.s, e:x.e-1};
  if (x.s > 1){ const S = it.seasons||[]; return {s:x.s-1, e:S[x.s-2] || 0}; }
  return {s:1, e:0};
}
function airedLimit(it){
  if (it.type!=="tv") return null;
  const T = todayISO();
  let lim = null;
  const known = [it.lastAir, it.nextAir].filter(x => x && x.date && x.s && x.e);
  const ready = known.filter(x => availOn(x.date, it) <= T);
  if (ready.length) lim = ready.sort((a,b) => b.s-a.s || b.e-a.e).map(x => ({s:x.s, e:x.e}))[0];
  else if (known.length){
    // The latest episode isn't streamable yet: everything before it is.
    const first = known.sort((a,b) => a.s-b.s || a.e-b.e)[0]; lim = prevEp(first, it);
  }
  else if (it.showStatus==="upcoming" || (it.firstAir && it.firstAir > T)) lim = {s:1, e:0};
  const us = it.usSeasons;
  if (us != null){
    const S = it.seasons || [];
    const usLim = us === 0 ? {s:1, e:0} : {s:us, e:S[us-1] || 0};
    if (!lim || after(lim, usLim)) lim = usLim;
  }
  return lim;
}
function notInUS(it){ return it.type==="tv" && it.usSeasons != null && it.usSeasons < (it.seasons||[]).length; }
function capProgress(p, it){ const L = airedLimit(it); return L && after(p, L) ? {s:L.s, e:L.e} : p; }
function airedEps(it){
  const L = airedLimit(it); if (!L) return totalEps(it);
  const S = it.seasons||[]; let n = 0; for (let i=0;i<L.s-1 && i<S.length;i++) n += S[i];
  return n + L.e;
}
function isOut(it){
  const T = todayISO();
  if (it.type==="tv"){ const L = airedLimit(it); return !(L && L.s===1 && L.e===0); }
  const th = it.releaseDate, dg = it.digitalDate;
  if (th && th <= T) return true;
  if (dg && dg <= T) return true;
  if (th || dg) return false;
  return it.showStatus !== "upcoming";
}
function outDate(it){
  const T = todayISO();
  const ds = it.type==="tv" ? [it.nextAir && it.nextAir.date, it.firstAir] : [it.releaseDate, it.digitalDate];
  return ds.filter(d => d && d > T).sort()[0] || "";
}
function notOutMsg(it){
  if (it.type==="tv" && it.usSeasons===0) return `${it.title} isn't available in the US yet, so it's on Up next`;
  const d = outDate(it); return `${it.title} isn't out yet${d ? ` (${relDay(d)})` : ""}, so it's on Up next`;
}
function nextEp(it){
  const n = rawNextEp(it); if (!n) return null;
  const L = airedLimit(it); return L && after(n, L) ? null : n;
}
// Move progress to the latest aired episode. Returns false when there's no episode data to go on.
function catchUp(it){
  const S = it.seasons||[], L = airedLimit(it);
  const target = L || (S.length ? {s:S.length, e:S[S.length-1]} : null);
  if (!target || (target.s===1 && target.e===0)) return false;
  it.progress = {s:target.s, e:target.e}; it.status = "watching"; delete it.newAt;
  if (it.showStatus==="ended" && !rawNextEp(it)){ it.status = "watched"; it.finishedAt = Date.now(); }
  return true;
}
function caughtUpToast(it){
  if (it.status==="watched"){ if (it.rating==null) askRating(it); else toast(`Finished ${it.title}`); return; }
  toast(`Caught up on ${it.title} through ${code(it.progress.s, it.progress.e)}`);
}
function rawNextEp(it){
  const S = it.seasons||[]; const p = it.progress||{s:1,e:0};
  if (!S.length) return {s:p.s||1, e:(p.e||0)+1};
  if ((p.e||0) < (S[p.s-1]||0)) return {s:p.s, e:(p.e||0)+1};
  if (p.s < S.length) return {s:p.s+1, e:1};
  return null;
}
function seasonsLabel(it){ const n = (it.seasons||[]).length; return n ? `${n} season${n>1?"s":""}` : "Series"; }
function years(it){
  if (!it.year) return "";
  if (it.type==="tv" && it.endYear && it.endYear!==it.year) return `${it.year}–${it.endYear}`;
  if (it.type==="tv" && it.showStatus==="returning") return `${it.year}–`;
  return String(it.year);
}
function metaLine(it){
  return [years(it), it.type==="movie" ? (it.runtimeMin ? fmtRun(it.runtimeMin) : "Film") : seasonsLabel(it), genresOf(it).slice(0,2).join(" / ")].filter(Boolean).join(" · ");
}
function poster(it, size){
  const h = hash(it.title||""), h1 = h % 360, h2 = (h1 + 30 + (h>>9) % 90) % 360;
  const img = it.poster ? `<img src="${IMG}${size==="lg"?"w342":"w185"}${esc(it.poster)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<div class="poster ${size||""}" style="--h1:${h1};--h2:${h2}" aria-hidden="true">${img}<i>${it.type==="movie"?"FILM":"TV"}</i><span>${esc(it.title)}</span></div>`;
}

/* ---------- TMDB ---------- */
const cache = new Map();
async function tmdb(path, params, fresh){
  const k = tmdbKey(); if (!k) throw {code:"nokey"};
  const u = new URL(TMDB + path);
  Object.entries(params||{}).forEach(([a,b]) => { if (b != null && b !== "") u.searchParams.set(a, b); });
  const headers = {accept:"application/json"};
  if (k.length > 60) headers.Authorization = "Bearer " + k; else u.searchParams.set("api_key", k);
  const ck = u.toString() + (headers.Authorization ? "#b" : "");
  if (!fresh && cache.has(ck)) return cache.get(ck);
  let r;
  try { r = await fetch(u, {headers}); } catch(e){ throw {code:"offline"}; }
  if (r.status===401) throw {code:"badkey"};
  if (r.status===429) throw {code:"busy"};
  if (!r.ok) throw {code:"http", status:r.status};
  const d = await r.json(); cache.set(ck, d); return d;
}
function tmdbErr(e){
  const c = e && e.code;
  if (c==="nokey") return "Add your TMDB key in Settings to look up titles.";
  if (c==="badkey") return "TMDB didn't accept that key. Check it in Settings.";
  if (c==="offline") return "You're offline. Try again when you're connected.";
  if (c==="busy") return "TMDB is busy. Wait a few seconds and try again.";
  return "Couldn't reach TMDB. Try again.";
}
let genreIdx = null;
async function genreNames(){
  if (!genreIdx){
    const [a,b] = await Promise.all([tmdb("/genre/tv/list"), tmdb("/genre/movie/list")]);
    genreIdx = {tv:{}, movie:{}};
    (a.genres||[]).forEach(g => genreIdx.tv[g.id] = g.name);
    (b.genres||[]).forEach(g => genreIdx.movie[g.id] = g.name);
  }
  return genreIdx;
}
let provIdx = null;
// TMDB provider ids for rent/buy storefronts: Apple TV store, Google Play, Fandango at Home, Amazon Video,
// Microsoft Store, YouTube (store), Rakuten, Redbox, Spectrum On Demand.
const STORE_IDS = new Set([2, 3, 7, 10, 68, 192, 35, 279, 486]);
const STORE_RE = /^(apple tv store|itunes|amazon video|google play|fandango|vudu|microsoft store|redbox|rakuten)/i;
function isStore(p){ return STORE_IDS.has(p.provider_id) || STORE_RE.test(p.provider_name||""); }
function streamable(x){ return platsOf(x).some(p => !["Rent or buy","In theaters"].includes(p)); }
async function providerIds(names){
  if (!provIdx){
    const [a,b] = await Promise.all([tmdb("/watch/providers/tv",{watch_region:"US"}), tmdb("/watch/providers/movie",{watch_region:"US"})]);
    provIdx = {};
    [...(a.results||[]), ...(b.results||[])].filter(p => !isStore(p)).forEach(p => { const n = normProvider(p.provider_name); (provIdx[n] = provIdx[n] || new Set()).add(p.provider_id); });
  }
  const ids = new Set(); names.forEach(n => (provIdx[n]||[]).forEach(i => ids.add(i)));
  return [...ids];
}
function toMeta(type, d){
  const tv = type==="tv";
  const date = (tv ? d.first_air_date : d.release_date) || "";
  const seasons = [];
  if (tv){
    (d.seasons||[]).filter(s => s.season_number > 0).sort((a,b) => a.season_number - b.season_number).forEach(s => { seasons[s.season_number-1] = s.episode_count || 0; });
    for (let i=0;i<seasons.length;i++) if (seasons[i]==null) seasons[i] = 0;
    while (seasons.length && !seasons[seasons.length-1]) seasons.pop();
  }
  const wp = ((d["watch/providers"]||{}).results||{}).US || {};
  const order = [...(wp.flatrate||[]), ...(wp.free||[]), ...(wp.ads||[])].filter(p => !isStore(p)).sort((a,b)=>(a.display_priority||99)-(b.display_priority||99));
  let platforms = [...new Set(order.map(p => normProvider(p.provider_name)).filter(Boolean))];
  if (!platforms.length && (wp.rent || wp.buy)) platforms = ["Rent or buy"];
  if (!tv && !platforms.length && date && (Date.now() - new Date(date).getTime()) < 75*DAY && Date.now() > new Date(date).getTime()) platforms = ["In theaters"];
  const st8 = tv ? ({"Returning Series":"returning","Ended":"ended","Canceled":"ended","In Production":"upcoming","Planned":"upcoming","Pilot":"upcoming"}[d.status] || "returning")
                 : (d.status==="Released" ? "released" : "upcoming");
  const cast = ((d.credits||{}).cast||[]).slice(0,2).map(c=>c.name);
  const lead = tv ? (d.created_by||[]).slice(0,2).map(c=>c.name) : [((d.credits||{}).crew||[]).find(c=>c.job==="Director")].filter(Boolean).map(c=>c.name);
  const nx = tv && d.next_episode_to_air;
  return {
    tmdbId:d.id, type, title: tv ? d.name : d.title, year: +date.slice(0,4) || null,
    endYear: tv && st8==="ended" && d.last_air_date ? +d.last_air_date.slice(0,4) : null,
    genres: mapTmdbGenres((d.genres||[]).map(g=>g.name), type, d.original_language),
    platforms, providerLink: wp.link || "", subIds: order.map(p => p.provider_id),
    network: tv ? (d.networks||[]).map(n=>n.name).slice(0,2).join(", ") : ((d.production_companies||[])[0]||{}).name || "",
    people: [...lead, ...cast].join(", "),
    overview: str(d.overview, 600), showStatus: st8,
    runtimeMin: tv ? ((d.episode_run_time||[])[0] || (d.last_episode_to_air||{}).runtime || null) : (d.runtime || null),
    seasons, poster: d.poster_path || "",
    nextAir: nx ? {date:nx.air_date||"", s:nx.season_number, e:nx.episode_number} : null,
    lastAir: tv && d.last_episode_to_air ? {date:d.last_episode_to_air.air_date||"", s:d.last_episode_to_air.season_number, e:d.last_episode_to_air.episode_number} : null,
    firstAir: tv ? (d.first_air_date||"") : "",
    ...(tv ? {} : usDates(d)),
    mv: 3
  };
}
function usDates(d){
  // US release dates by type: 2/3 theatrical, 4 digital (includes streaming premieres).
  const us = ((d.release_dates||{}).results||[]).find(r => r.iso_3166_1==="US");
  const rows = ((us && us.release_dates)||[]).map(r => ({t:r.type, d:String(r.release_date||"").slice(0,10)})).filter(r => r.d);
  const first = t => rows.filter(r => t.includes(r.t)).map(r => r.d).sort()[0] || "";
  return {releaseDate: first([2,3]) || d.release_date || "", digitalDate: first([4])};
}
async function details(type, id, fresh){
  const d = await tmdb(`/${type}/${id}`, {append_to_response: type==="movie" ? "watch/providers,credits,release_dates" : "watch/providers,credits"}, fresh);
  const m = toMeta(type, d);
  if (type==="tv"){ m.origin = (d.origin_country||[]).includes("US") ? "US" : ((d.origin_country||[])[0] || ""); m.usSeasons = await usSeasonCount(d, m, fresh); }
  return m;
}
// For shows made outside the US: how many seasons can be watched in the US (any US service, rent or buy included).
// null = no limit (US show, or TMDB has no season-level data to go on). 0 = nothing available in the US.
function hasUS(us){ return !!us && ["flatrate","free","ads","rent","buy"].some(k => (us[k]||[]).length); }
async function usSeasonCount(d, m, fresh){
  const origin = d.origin_country || [];
  if (!origin.length || origin.includes("US") || !m.seasons.length) return null;
  if (!hasUS((((d["watch/providers"]||{}).results)||{}).US)) return 0;
  for (let n = m.seasons.length; n >= 1; n--){
    try {
      const r = await tmdb(`/tv/${d.id}/season/${n}/watch/providers`, {}, fresh);
      if (hasUS((r.results||{}).US)) return n;
    } catch(e){ if (e.code==="badkey" || e.code==="offline" || e.code==="nokey") throw e; return null; }
  }
  return null;
}
async function searchTitles(q){
  const d = await tmdb("/search/multi", {query:q, include_adult:"false", language:"en-US"});
  return (d.results||[]).filter(r => r.media_type==="tv" || r.media_type==="movie").slice(0,8).map(r => ({
    tmdbId:r.id, type:r.media_type, title: r.media_type==="tv" ? r.name : r.title,
    year: +((r.first_air_date||r.release_date||"").slice(0,4)) || null, poster:r.poster_path||"", overview:str(r.overview,400), popularity:r.popularity||0
  }));
}

/* ---------- items ---------- */
function makeItem(m, status, L){
  const type = m.type==="movie" ? "movie" : "tv";
  const it = {
    id:newId(), tmdbId:m.tmdbId||null, title:str(m.title||"Untitled",200), type, year:+m.year||null, endYear:+m.endYear||null,
    genres: genresOf({genres:m.genres||[], type}).slice(0,4), platforms: platsOf(m), providerLink:str(m.providerLink,300),
    network:str(m.network,120), people:str(m.people,200), overview:str(m.overview,600), showStatus:str(m.showStatus,20),
    runtimeMin:Math.round(+m.runtimeMin)||null, seasons: type==="tv" && Array.isArray(m.seasons) ? m.seasons.map(n=>Math.max(0,Math.round(+n||0))).slice(0,80) : [],
    poster:str(m.poster,120), nextAir:m.nextAir||null, lastAir:m.lastAir||null,
    firstAir:str(m.firstAir,10), releaseDate:str(m.releaseDate,10), digitalDate:str(m.digitalDate,10), mv:m.mv||1,
    origin:str(m.origin,4), usSeasons: m.usSeasons==null ? null : m.usSeasons,
    status:"want", rating:null, progress:{s:1,e:0}, notes:"",
    addedAt:Date.now(), updatedAt:Date.now(), finishedAt:null, checkedAt: m.tmdbId ? Date.now() : null,
    addedBy: L==="ours" ? uid() : null
  };
  applyStatus(it, status); return it;
}
function applyStatus(it, status){
  if ((status==="watched" || status==="watching") && !isOut(it)) status = "want";
  it.status = status;
  if (status!=="want"){ delete it.paused; delete it.pausedAt; }
  if (!it.progress) it.progress = {s:1,e:0};
  if (status==="watched"){
    it.finishedAt = Date.now();
    if (it.type==="tv" && it.seasons.length) it.progress = capProgress({s:it.seasons.length, e:it.seasons[it.seasons.length-1]}, it);
  }
  return status;
}
function findIn(L, m){
  const t = m.type==="movie" ? "movie" : "tv", n = norm(m.title);
  return Object.values(st.lists[L]).find(x => x.type===t && ((m.tmdbId && x.tmdbId===m.tmdbId) || (!m.tmdbId || !x.tmdbId) && norm(x.title)===n));
}
function findExisting(m){ return findIn(st.list, m); }
function inAnyList(type, tmdbId){
  return [...Object.values(st.lists.mine), ...Object.values(st.lists.ours)].some(x => x.type===type && x.tmdbId===tmdbId);
}
function upsert(it, L){
  L = L || listOf(it.id);
  if (it.type==="tv" && it.progress) it.progress = capProgress(it.progress, it);
  it.updatedAt = Date.now(); st.lists[L][it.id] = it; backend.saveItem(it, L); render(true);
}
function addFromMeta(m, status){
  const ex = findExisting(m); if (ex) return ex;
  const it = makeItem(m, status, st.list); upsert(it, st.list); return it;
}
function mergeMeta(it, m){
  const out = {...it};
  ["tmdbId","title","year","network","people","overview","showStatus","runtimeMin","poster","providerLink"].forEach(k => { if (m[k] != null && m[k] !== "") out[k] = m[k]; });
  out.endYear = m.endYear || null;
  out.nextAir = m.nextAir || null;
  out.lastAir = m.lastAir || null;
  if ("usSeasons" in m){ out.usSeasons = m.usSeasons==null ? null : m.usSeasons; out.origin = m.origin || ""; }
  ["firstAir","releaseDate","digitalDate"].forEach(k => { out[k] = m[k] || ""; });
  if (m.mv) out.mv = m.mv;
  if (!it.genresManual && m.genres && m.genres.length) out.genres = m.genres;
  if (!it.platformsManual) out.platforms = m.platforms || [];
  if (it.type==="tv" && m.seasons && m.seasons.length){
    const before = airedEps(it); out.seasons = m.seasons;
    if (before > 0 && airedEps(out) > before && it.mv===3) out.newAt = Date.now();
  }
  out.checkedAt = Date.now();
  return out;
}
function markNext(id){
  const L = listOf(id); const it = clean(st.lists[L][id]); const n = nextEp(it); if (!n) return;
  it.progress = n; it.status = "watching"; let msg = `Watched ${code(n.s,n.e)}`;
  const S = it.seasons;
  if (S.length && n.e === S[n.s-1]){
    if (n.s === S.length){
      if (it.showStatus==="ended"){ it.status = "watched"; it.finishedAt = Date.now(); msg = ""; }
      else msg = it.nextAir && it.nextAir.date ? `Caught up. Next episode ${fmtDate(it.nextAir.date)}.` : `Caught up on ${it.title}`;
      delete it.newAt;
    } else msg = `Finished season ${n.s}`;
  }
  upsert(it, L);
  if (msg) toast(msg); else askRating(it);
}

/* ---------- storage backends ---------- */
let backend = null, fs = null, auth = null, FBX = null;
let fbReady = null; // resolves once fb.js has loaded and Firebase is started
const whenFB = fn => (fbReady || Promise.reject(new Error("no firebase"))).then(fn);
function onWriteErr(e){
  const c = e && e.code;
  toast(c==="permission-denied" ? "You don't have access to change that list." : "Couldn't save that change. It will retry when you're back online.");
}
function localBackend(){
  let d = null; try { d = JSON.parse(lsGet("wl.data")||"null"); } catch(e){}
  d = d || {};
  st.list = "mine"; st.lists.mine = d.items || {}; st.profile = {...DEF_PROFILE, ...(d.profile||{})}; st.ready = true;
  const persist = () => lsSet("wl.data", JSON.stringify({items:st.lists.mine, profile:st.profile}));
  return {saveItem:persist, deleteItem:persist, saveProfile:persist, saveUser:()=>{}};
}
function cloudBackend(){
  const col = (L, hid) => L==="ours" ? fs.collection(`households/${hid}/items`) : fs.collection(`users/${uid()}/items`);
  return {
    saveItem(it, L){ L = L || st.list; if (L==="ours" && !st.household) return; const hid = st.household && st.household.id, data = clean(it); whenFB(() => col(L, hid).doc(data.id).set(data)).catch(onWriteErr); saveSnapSoon(); },
    deleteItem(id, L){ L = L || st.list; if (L==="ours" && !st.household) return; const hid = st.household && st.household.id; whenFB(() => col(L, hid).doc(id).delete()).catch(onWriteErr); saveSnapSoon(); },
    saveProfile(){ const data = {profile:clean(st.profile)}; whenFB(() => fs.doc(`users/${uid()}`).set(data, {merge:true})).catch(onWriteErr); saveSnapSoon(); },
    saveUser(data){ return whenFB(() => fs.doc(`users/${uid()}`).set(data, {merge:true})); }
  };
}
// A copy of the signed-in view kept on the phone, so the list shows the instant the app opens.
// Firebase then catches it up in the background.
const SNAP_KEY = "wl.snap";
let snapTimer = null;
function saveSnapSoon(){ clearTimeout(snapTimer); snapTimer = setTimeout(saveSnap, 800); }
function saveSnap(){
  if (st.mode!=="cloud" || !st.user) return;
  const hh = st.household && !st.household.loading ? st.household : null;
  try { localStorage.setItem(SNAP_KEY, JSON.stringify({v:1, at:Date.now(), user:st.user, household:hh, userDoc:{household:st.userDoc.household||null},
    profile:st.profile, lists:{mine:st.lists.mine, ours: hh ? st.lists.ours : {}}})); }
  catch(e){ try { localStorage.removeItem(SNAP_KEY); } catch(e2){} }
}
function readSnap(){ try { const d = JSON.parse(localStorage.getItem(SNAP_KEY)||"null"); return d && d.v===1 && d.user && d.user.uid ? d : null; } catch(e){ return null; } }
function clearSnap(){ clearTimeout(snapTimer); lsSet(SNAP_KEY, null); }
function toMap(snap){ const m = {}; snap.forEach(d => { m[d.id] = {...d.data(), id:d.id}; }); return m; }
let unsubs = [], hUnsubs = [];
function stopAll(){ unsubs.forEach(f=>f()); hUnsubs.forEach(f=>f()); unsubs = []; hUnsubs = []; }
let hWatching = undefined;
function startCloud(u){
  stopAll(); hWatching = undefined;
  const same = st.user && st.user.uid===u.uid && st.ready;
  st.user = {uid:u.uid, name: (u.displayName || (u.email||"").split("@")[0] || "Someone").split(" ")[0], email:u.email||""};
  if (!same){ st.ready = false; st.lists = {mine:{}, ours:{}}; st.household = null; }
  mineLoaded = false; oursLoaded = false;
  backend = cloudBackend();
  const timer = setTimeout(() => { if (!st.ready){ st.ready = true; st.slow = true; render(); } }, 10000);
  unsubs.push(fs.doc(`users/${u.uid}`).onSnapshot(s => {
    const d = s.data() || {}; st.userDoc = d; st.profile = {...DEF_PROFILE, ...(d.profile||{})};
    const hid = d.household || null;
    if (hid !== hWatching) watchHousehold(hid);
    saveSnapSoon(); render();
  }, () => {}));
  let imported = false;
  unsubs.push(fs.collection(`users/${u.uid}/items`).onSnapshot(snap => {
    if (snap.metadata.fromCache && !snap.size && st.ready && Object.keys(st.lists.mine).length) return; // keep the saved view until real data arrives
    st.lists.mine = toMap(snap); st.ready = true; st.slow = false; clearTimeout(timer);
    if (!imported && !snap.metadata.fromCache){ imported = true; importLocal(u.uid); mineLoaded = true; syncOursToMine(); }
    saveSnapSoon(); render(); scheduleRefresh();
  }, () => { st.ready = true; st.slow = true; render(); }, {includeMetadataChanges:true}));
}
// Titles saved on this device before signing in move into the account once, skipping any already there.
// Copy a title into the other list as its own record (progress, rating and notes come along).
function copyItem(it, to){
  if (findIn(to, it)) return null;
  const c = clean(it); c.id = newId(); c.updatedAt = Date.now();
  c.addedBy = to==="ours" ? uid() : null;
  st.lists[to][c.id] = c; backend.saveItem(c, to); return c;
}
// Our list -> My list. Progress and Watching/Watched carry over, never moving My list backwards.
// My own rating and notes stay mine; a shared rating only fills in an unrated title.
// Titles started or finished on Our list are added to My list so they count in my history.
let mineLoaded = false, oursLoaded = false;
const STATUS_RANK = {want:0, watching:1, watched:2};
function syncOursToMine(){
  if (st.mode!=="cloud" || !st.household || !mineLoaded || !oursLoaded) return;
  Object.values(st.lists.ours).forEach(o => {
    if (!o || !(o.status in STATUS_RANK)) return;
    const mine = findIn("mine", o);
    if (!mine){
      if (o.status==="want") return;
      const c = clean(o); c.id = newId(); c.addedBy = null; c.notes = ""; c.fromOurs = true; c.updatedAt = Date.now();
      st.lists.mine[c.id] = c; backend.saveItem(c, "mine"); return;
    }
    if (mine.status==="dropped") return;
    const it = clean(mine); let changed = false;
    if (o.type==="tv" && o.progress && (!it.progress || after(o.progress, it.progress))){ it.progress = capProgress({s:o.progress.s, e:o.progress.e}, it); changed = it.progress.s!==mine.progress?.s || it.progress.e!==mine.progress?.e; }
    if (!it.paused && (STATUS_RANK[o.status]||0) > (STATUS_RANK[it.status]||0)){
      it.status = o.status; if (o.status==="watched") it.finishedAt = o.finishedAt || Date.now(); changed = true;
    }
    if (it.rating==null && o.rating!=null){ it.rating = o.rating; changed = true; }
    if (!it.paused && it.type==="tv" && it.status==="watched" && o.status==="watching" && nextEp(it)){ it.status = "watching"; changed = true; }
    if (changed){ it.updatedAt = Date.now(); st.lists.mine[it.id] = it; backend.saveItem(it, "mine"); }
  });
}
function importLocal(id){
  let d = null; try { d = JSON.parse(lsGet("wl.data")||"null"); } catch(e){}
  if (!d || lsGet("wl.imported." + id)) return;
  const items = Object.values(d.items||{});
  let n = 0;
  items.forEach(x => {
    if (!x || !x.id || findIn("mine", x)) return;
    const it = clean(x); st.lists.mine[it.id] = it; backend.saveItem(it, "mine"); n++;
  });
  const p = d.profile || {};
  const cloudEmpty = !st.profile.genres.length && !(st.profile.services||[]).length;
  if (cloudEmpty && ((p.genres||[]).length || (p.services||[]).length)){ st.profile = {...DEF_PROFILE, ...p}; backend.saveProfile(); }
  lsSet("wl.imported." + id, "1");
  if (n) toast(`Moved ${n} title${n>1?"s":""} from this phone into your account`);
}
function watchHousehold(hid){
  hUnsubs.forEach(f=>f()); hUnsubs = []; oursLoaded = false; hWatching = hid;
  if (!hid){ st.household = null; st.lists.ours = {}; saveSnapSoon(); if (st.list==="ours") render(true); return; }
  const keep = st.household && st.household.id===hid && !st.household.loading;
  if (!keep){ st.lists.ours = {}; st.household = {id:hid, members:[], names:{}, tmdbKey:"", loading:true}; }
  hUnsubs.push(fs.doc(`households/${hid}`).onSnapshot(s => {
    if (!s.exists){ st.household = null; st.lists.ours = {}; saveSnapSoon(); render(true); return; }
    const d = s.data(); st.household = {id:hid, members:d.members||[], names:d.names||{}, tmdbKey:d.tmdbKey||"", loading:false};
    saveSnapSoon(); render();
  }, () => { st.household = null; render(true); }));
  hUnsubs.push(fs.collection(`households/${hid}/items`).onSnapshot(snap => {
    if (snap.metadata.fromCache && !snap.size && Object.keys(st.lists.ours).length) return;
    st.lists.ours = toMap(snap); oursLoaded = !snap.metadata.fromCache || oursLoaded; syncOursToMine(); saveSnapSoon(); render(); scheduleRefresh();
  }, () => {}, {includeMetadataChanges:true}));
}

/* ---------- sharing ---------- */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(){ const a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, n => CODE_CHARS[n % CODE_CHARS.length]).join(""); }
function fmtCode(c){ return c ? c.slice(0,5) + "-" + c.slice(5) : ""; }
function normCode(c){ return String(c||"").toUpperCase().replace(/[^A-Z0-9]/g,""); }
async function createHousehold(){
  const hid = newCode();
  await whenFB(() => fs.doc(`households/${hid}`).set({members:[uid()], names:{[uid()]:st.user.name}, tmdbKey:tmdbKey(), createdAt:Date.now()}));
  await backend.saveUser({household:hid});
}
async function joinHousehold(raw){
  const hid = normCode(raw);
  if (hid.length !== 10) throw {code:"badcode"};
  await whenFB(() => fs.doc(`households/${hid}`).update({members:FBX.FieldValue.arrayUnion(uid()), [`names.${uid()}`]:st.user.name}));
  await backend.saveUser({household:hid});
}
async function leaveHousehold(){
  const hid = st.household && st.household.id; if (!hid) return;
  try { await whenFB(() => fs.doc(`households/${hid}`).update({members:FBX.FieldValue.arrayRemove(uid()), [`names.${uid()}`]:FBX.FieldValue.delete()})); } catch(e){}
  await backend.saveUser({household:null});
}
function hhErrCopy(e){
  const c = e && e.code;
  if (c==="badcode") return "Invite codes are 10 letters and numbers, like ABCDE-FGH23.";
  if (c==="not-found" || c==="permission-denied") return "No shared list matches that code. Check it and try again.";
  if (c==="unavailable") return "You're offline. Try again when you're connected.";
  return "That didn't work. Try again.";
}
function memberName(id){
  if (!id) return "";
  if (id===uid()) return "you";
  return (st.household && st.household.names && st.household.names[id]) || "";
}

/* ---------- auth ---------- */
function authCopy(e){
  const c = e && e.code;
  if (["auth/wrong-password","auth/invalid-credential","auth/invalid-login-credentials","auth/user-not-found"].includes(c)) return "That email and password don't match. Try again or create an account.";
  if (c==="auth/email-already-in-use") return "There's already an account with that email. Sign in instead.";
  if (c==="auth/weak-password") return "Use a password of at least 6 characters.";
  if (c==="auth/invalid-email") return "That email address doesn't look right.";
  if (c==="auth/unauthorized-domain") return `Firebase hasn't approved this site yet. Add ${location.hostname} under Authentication, Settings, Authorized domains.`;
  if (c==="auth/operation-not-allowed") return "Turn on this sign-in method in Firebase under Authentication, Sign-in method.";
  if (c==="auth/popup-closed-by-user" || c==="auth/cancelled-popup-request") return "";
  if (c==="auth/network-request-failed") return "You're offline. Try again when you're connected.";
  return "Sign-in didn't work. Try again.";
}
async function googleSignIn(){
  await fbReady;
  const p = new FBX.GoogleAuthProvider();
  st.authErr = ""; st.authBusy = true; render(true);
  try { await auth.signInWithPopup(p); }
  catch(e){
    if (["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code)){ try { lsSet("wl.redirect","1"); await auth.signInWithRedirect(p); return; } catch(e2){ lsSet("wl.redirect",null); e = e2; } }
    st.authErr = authCopy(e);
  }
  st.authBusy = false; render(true);
}
async function emailAuth(create){
  const email = ($("authEmail")||{}).value || "", pw = ($("authPw")||{}).value || "";
  if (!email.trim() || !pw){ st.authErr = "Enter your email and a password."; render(true); return; }
  st.authErr = ""; st.authBusy = true; render(true);
  try { await fbReady; if (create) await auth.createUserWithEmailAndPassword(email.trim(), pw); else await auth.signInWithEmailAndPassword(email.trim(), pw); }
  catch(e){ st.authErr = authCopy(e); }
  st.authBusy = false; render(true);
}

/* ---------- background refresh of shows ---------- */
let refreshTimer = null, refreshing = false; const refreshedThisVisit = new Set();
// When each title was last checked against TMDB, kept on this device so an unchanged title is never re-saved.
let checkedLocal = {}; try { checkedLocal = JSON.parse(lsGet("wl.checked")||"{}") || {}; } catch(e){}
function markChecked(id){ checkedLocal[id] = Date.now(); }
function saveChecked(){ const cut = Date.now() - 30*DAY; Object.keys(checkedLocal).forEach(k => { if (checkedLocal[k] < cut) delete checkedLocal[k]; }); lsSet("wl.checked", JSON.stringify(checkedLocal)); }
// Start a few seconds after the app opens, once it's idle, so it never competes with showing your list.
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (document.visibilityState !== "visible") return;
    (window.requestIdleCallback || (f => setTimeout(f, 0)))(runRefresh, {timeout: 3000});
  }, 6000);
}
const IGNORE = new Set(["checkedAt","updatedAt"]);
function sameData(a, b){
  const ka = Object.keys(a).filter(k => !IGNORE.has(k)), kb = Object.keys(b).filter(k => !IGNORE.has(k));
  if (ka.length !== kb.length) return false;
  return ka.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
async function runRefresh(){
  if (refreshing || !tmdbKey()) return;
  const due = [];
  ["mine","ours"].forEach(L => Object.values(st.lists[L]).forEach(x => {
    if (!x.tmdbId || refreshedThisVisit.has(x.id)) return;
    const active = x.type==="tv" && (x.status==="watching" || x.status==="want" || (x.status==="watched" && x.showStatus!=="ended"));
    const last = Math.max(x.checkedAt || 0, checkedLocal[x.id] || 0);
    const stale = !last || x.mv !== 3 || Date.now() - last > (active ? 0.5 : 14) * DAY;
    if (stale) due.push([L, x.id]);
  }));
  if (!due.length) return;
  due.sort((a,b) => (st.lists[a[0]][a[1]].mv===3) - (st.lists[b[0]][b[1]].mv===3));
  refreshing = true;
  const fetched = new Map(); // one TMDB lookup per show, even when it's on both lists
  let changed = 0;
  try {
    await pool(due.slice(0,30), 3, async ([L,id]) => {
      refreshedThisVisit.add(id);
      const cur = st.lists[L][id]; if (!cur) return;
      try {
        const k = cur.type + ":" + cur.tmdbId;
        if (!fetched.has(k)) fetched.set(k, details(cur.type, cur.tmdbId, true));
        const m = await fetched.get(k);
        const now = st.lists[L][id]; if (!now) return;
        const merged = mergeMeta(now, m); merged.updatedAt = now.updatedAt;
        markChecked(id);
        if (sameData(merged, now) && now.mv === merged.mv) return; // nothing new: no save, no redraw
        merged.checkedAt = Date.now(); st.lists[L][id] = merged; backend.saveItem(merged, L); changed++;
      } catch(e){ if (e.code==="badkey" || e.code==="nokey") throw e; }
    });
  } catch(e){}
  refreshing = false; saveChecked(); if (changed) render();
}

/* ---------- picks ---------- */
function weight(x){
  if (x.rating===2) return 3; if (x.rating===1) return 2; if (x.rating===0) return 0.3; if (x.rating===-1 || x.status==="dropped") return 0;
  if (x.status==="watching") return 1.6; if (x.status==="watched") return 1; return 0.6;
}
function verb(x){ return x.rating===2 ? "loved" : x.rating===1 ? "liked" : x.status==="watching" ? "are watching" : x.status==="want" ? "saved" : "watched"; }
// TMDB genre ids for the app's categories, per type. Anime is Animation made in Japan.
async function genreQuery(type, wanted){
  const G = await genreNames();
  const names = wanted.map(g => g==="Anime" ? "Animation" : g);
  const ids = Object.entries(G[type]).filter(([,n]) => mapTmdbGenres([n], type, "").some(g => names.includes(g))).map(([id]) => id);
  return ids.length ? {with_genres: ids.join("|")} : null;
}
function genresOfResult(r, type, G){ return mapTmdbGenres((r.genre_ids||[]).map(id => G[type][id]).filter(Boolean), type, r.original_language); }
function matchesGenres(names, wanted){ return !wanted.length || names.some(g => wanted.includes(g)); }
async function buildPicks(){
  const p = st.profile, nowY = new Date().getFullYear();
  const dis = new Set(p.dismissed||[]);
  const seeds = Object.values(st.items).filter(x => x.tmdbId && weight(x) > 0.5)
    .sort((a,b) => weight(b)-weight(a) || (b.updatedAt||0)-(a.updatedAt||0)).slice(0,10);
  const G = await genreNames();
  const cands = new Map();
  const wanted = p.genres || [];
  const add = (r, type, score, because, label) => {
    if (!r || !r.id) return;
    const t = r.media_type==="tv" || r.media_type==="movie" ? r.media_type : type;
    if (t!=="tv" && t!=="movie") return;
    const k = t + ":" + r.id;
    if (inAnyList(t, r.id) || dis.has(k)) return;
    if (p.kind!=="both" && p.kind!==t) return;
    if (!matchesGenres(genresOfResult(r, t, G), wanted)) return;
    let c = cands.get(k); if (!c){ c = {k, type:t, r, score:0, because:[], label}; cands.set(k, c); }
    c.score += score; if (because && !c.because.includes(because)) c.because.push(because);
  };
  // With genres chosen, also pull the best titles in those genres directly (on your services when you've picked some).
  const svcNames = (p.services||[]).filter(x => !["Cable / live TV","Rent or buy","In theaters"].includes(x));
  const svcIds = svcNames.length ? await providerIds(svcNames) : [];
  async function discoverGenres(pages){
    if (!wanted.length) return;
    const kinds = p.kind==="both" ? ["tv","movie"] : [p.kind];
    await pool(kinds, 2, async t => {
      const gq = await genreQuery(t, wanted); if (!gq) return;
      const base = {...gq, language:"en-US", "vote_count.gte": t==="tv" ? 15 : 60};
      if (wanted.length===1 && wanted[0]==="Anime") base.with_original_language = "ja";
      if (svcIds.length){ base.watch_region = "US"; base.with_watch_providers = svcIds.join("|"); base.with_watch_monetization_types = "flatrate|free|ads"; }
      for (const sort of ["popularity.desc","vote_average.desc"]) for (const pg of pages){
        try {
          const d = await tmdb(`/discover/${t}`, {...base, sort_by:sort, page:pg});
          (d.results||[]).forEach((r,i) => add({...r, media_type:t}, t, (sort==="popularity.desc" ? 0.9 : 0.7) * (1 - i/40), null, "genre"));
        } catch(e){ if (e.code==="badkey") throw e; }
      }
    });
  }
  await discoverGenres([1]);
  if (seeds.length){
    const res = await pool(seeds, 4, async s => { try { return [s, await tmdb(`/${s.type}/${s.tmdbId}/recommendations`)]; } catch(e){ if (e.code==="badkey") throw e; return [s, null]; } });
    res.forEach(([s,d]) => ((d && d.results) || []).slice(0,20).forEach((r,i) => add(r, s.type, weight(s) * (1 - i/30), s)));
  }
  if (cands.size < 20) await discoverGenres([2,3]);
  if (cands.size < 14 && !wanted.length){
    const t = await tmdb("/trending/all/week");
    (t.results||[]).forEach((r,i) => add(r, r.media_type, 0.5 * (1 - i/40), null));
  }
  for (const c of cands.values()){
    const names = genresOfResult(c.r, c.type, G); c.names = names;
    const y = +((c.r.first_air_date||c.r.release_date||"").slice(0,4)) || 0;
    if (p.recent && y && y < nowY - 2) c.score *= 0.35;
    c.score += Math.min((c.r.vote_average||0)/10, 1) * 0.4;
    if ((c.r.vote_count||0) < 30) c.score *= 0.6;
  }
  const top = [...cands.values()].sort((a,b) => b.score-a.score).slice(0,30);
  await pool(top, 5, async c => { try { c.meta = await details(c.type, c.r.id); } catch(e){} });
  let out = top.filter(c => c.meta && streamable(c.meta) && matchesGenres(c.meta.genres||[], wanted));
  const svc = p.services || [];
  if (svc.length){
    out.forEach(c => { if (c.meta.platforms.some(x => svc.includes(x))) c.score += 1; });
    if (p.onlyMine) out = out.filter(c => c.meta.platforms.some(x => svc.includes(x)));
    out.sort((a,b) => b.score-a.score);
  }
  // With several genres chosen, take turns so each one shows up.
  if (wanted.length > 1){
    const groups = wanted.map(g => out.filter(c => (c.meta.genres||[]).includes(g)));
    const mixed = [], seen = new Set();
    for (let i=0; mixed.length < out.length && i < out.length; i++) groups.forEach(gr => { const c = gr[i]; if (c && !seen.has(c.k)){ seen.add(c.k); mixed.push(c); } });
    out = mixed;
  }
  return out.slice(0,12).map(c => {
    const b = c.because.slice(0,2);
    const g = (c.meta.genres||[]).find(x => wanted.includes(x));
    const on = svc.length ? (c.meta.platforms||[]).find(x => svc.includes(x)) : "";
    const why = b.length ? `Because you ${verb(b[0])} ${b[0].title}${b[1] ? ` and ${b[1].title}` : ""}`
      : g ? `Highly rated ${g.toLowerCase()}${on ? ` on ${on}` : ""}` : "Popular this week";
    return {...c.meta, why};
  });
}
async function buildFresh(){
  const p = st.profile;
  const svc = (p.services||[]).filter(s => !["Cable / live TV","Rent or buy","In theaters"].includes(s));
  const ids = await providerIds(svc); if (!ids.length) return [];
  const since = new Date(Date.now() - 150*DAY).toISOString().slice(0,10);
  const kinds = p.kind==="both" ? ["tv","movie"] : [p.kind];
  const wanted = p.genres || [];
  const lists = await Promise.all(kinds.map(async t => {
    const gq = wanted.length ? await genreQuery(t, wanted) : {};
    if (!gq) return [];
    const d = await tmdb(`/discover/${t}`, {...gq,
      watch_region:"US", with_watch_providers:ids.join("|"), with_watch_monetization_types:"flatrate|free|ads",
      sort_by:"popularity.desc", [t==="tv" ? "first_air_date.gte" : "primary_release_date.gte"]:since, "vote_count.gte": t==="movie" ? 15 : 3, language:"en-US"});
    return (d.results||[]).map(r => ({...r, media_type:t}));
  }));
  const merged = []; for (let i=0;i<20;i++) lists.forEach(l => { if (l[i]) merged.push(l[i]); });
  const dis = new Set(p.dismissed||[]);
  const pick = merged.filter(r => !inAnyList(r.media_type, r.id) && !dis.has(r.media_type + ":" + r.id)).slice(0,16);
  const metas = await pool(pick, 5, async r => { try { return await details(r.media_type, r.id); } catch(e){ return null; } });
  return metas.filter(m => m && platsOf(m).some(x => svc.includes(x)) && matchesGenres(m.genres||[], wanted)).slice(0,10);
}
let tasteTimer = null;
function tasteChanged(){

  clearTimeout(tasteTimer);
  tasteTimer = setTimeout(() => {
    if (st.tab!=="foryou") return;
    if (st.picks[st.list] && !st.picksBusy) A.picks();
    if ((st.profile.services||[]).length && st.fresh && !st.freshBusy) A.fresh();
  }, 900);
}
function savePicksLocal(){ lsSet("wl.picks", JSON.stringify(st.picks)); }

/* ---------- rendering ---------- */
let pendingMain = false, pendingSheet = false;
function typingIn(root){ const a = document.activeElement; return !!a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
let renderQueued = false;
function render(force){
  if (force){ doRender(true); return; }
  if (!renderQueued){ renderQueued = true; requestAnimationFrame(() => { renderQueued = false; doRender(false); }); }
}
function doRender(force){
  renderHeader();
  if (!force && typingIn(main)) pendingMain = true; else { pendingMain = false; renderMain(); }
  if (st.sheet){ if (!force && typingIn(sheet)) pendingSheet = true; else { pendingSheet = false; renderSheet(); } }
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (pendingMain && !typingIn(main)){ pendingMain = false; renderMain(); }
  if (pendingSheet && st.sheet && !typingIn(sheet)){ pendingSheet = false; renderSheet(); }
}, 0));

function signedIn(){ return st.mode==="local" || (st.mode==="cloud" && !!st.user); }
function oursBlocked(){ return st.list==="ours" && (!st.household || st.household.loading); }
// Which tab a title belongs on, from where it actually stands rather than the last button tapped.
//  watching: aired episodes left to watch     caught: mid-season, next episode scheduled
//  want: queued, or a new season has a date    watched: done, or caught up with nothing announced
function upcomingUS(x){
  const nx = x.nextAir, us = x.usSeasons;
  if (!nx || !nx.date || nx.date <= todayISO()) return null;
  if (us != null && nx.s > us) return null;
  return nx;
}
function place(x){
  if (x.status==="want") return "want";
  if (x.status==="dropped") return "watched";
  if (x.type!=="tv" || !(x.seasons||[]).length) return x.status==="watching" ? "watching" : "watched";
  if (nextEp(x)) return "watching";
  const nx = upcomingUS(x);
  if (nx) return nx.e===1 ? "want" : "caught";
  return "watched";
}
function counts(L){
  const c = {want:0,watching:0,watched:0,dropped:0}; let min = 0;
  for (const it of Object.values(st.lists[L||st.list])){
    c[it.status] = (c[it.status]||0) + 1;
    if (it.type==="movie" && it.status==="watched") min += it.runtimeMin||0;
    if (it.type==="tv") min += watchedEps(it) * (it.runtimeMin||0);
  }
  return {c, hrs:Math.round(min/60)};
}
function renderHeader(){
  const ok = signedIn();
  const total = Object.keys(st.items).length;
  const {c, hrs} = counts();
  $("gear").hidden = !st.mode;
  $("stats").textContent = !ok || !st.ready ? "" : total ? `${total} titles · ${hrs.toLocaleString()} hrs watched` : "No titles yet";
  const sw = $("listsw");
  sw.hidden = !(st.mode==="cloud" && st.user);
  if (!sw.hidden) sw.innerHTML = ["mine","ours"].map(L => {
    const n = L==="ours" && !st.household ? "" : Object.keys(st.lists[L]).length;
    return `<button data-action="list" data-l="${L}" aria-pressed="${st.list===L}">${LIST_NAME[L]}${n!=="" ? `<span class="n">${n}</span>` : ""}</button>`;
  }).join("");
  $("tabs").hidden = !ok;
  const n = {watching:0, want:0, caught:0, watched:0};
  Object.values(st.items).forEach(x => { n[place(x)]++; });
  $("tabs").innerHTML = TABS.map(([k,l]) => `<button class="tab" role="tab" data-action="tab" data-tab="${k}" aria-selected="${st.tab===k}">${l}${n[k]!=null && st.ready && !oursBlocked() ? `<span class="n">${n[k]}</span>` : ""}</button>`).join("");
  $("fab").hidden = !ok || !st.ready || oursBlocked();
  $("filterbar").hidden = !ok || st.tab==="foryou" || !total || oursBlocked();
  $("filter").hidden = total < 8;
  renderFacets();
}
function inTab(x){ return place(x)===st.tab; }
function renderFacets(){
  if ($("filterbar").hidden){ $("facets").innerHTML = ""; return; }
  const tabItems = Object.values(st.items).filter(inTab);
  const byPlat = st.plat ? tabItems.filter(x => st.plat==="__none" ? !platsOf(x).length : platsOf(x).includes(st.plat)) : tabItems;
  const byCat = st.cat ? tabItems.filter(x => genresOf(x).includes(st.cat)) : tabItems;
  // Each row's counts respect the other row's choice, so a number always matches what a tap shows.
  const cc = {}; byPlat.forEach(x => genresOf(x).forEach(g => cc[g] = (cc[g]||0) + 1));
  const pc = {}; let none = 0; byCat.forEach(x => { const ps = platsOf(x); if (!ps.length) none++; ps.forEach(p => pc[p] = (pc[p]||0) + 1); });
  const cats = Object.keys(cc).sort((a,b) => (cc[b]-cc[a]) || a.localeCompare(b));
  if (st.cat && !cats.includes(st.cat)) cats.unshift(st.cat);
  const plats = Object.keys(pc).sort((a,b) => (pc[b]-pc[a]) || a.localeCompare(b));
  if (st.plat && st.plat!=="__none" && !plats.includes(st.plat)) plats.unshift(st.plat);
  const chip = (act, v, label, n) => `<button class="chipbtn" data-action="${act}" data-v="${esc(v)}" aria-pressed="${(act==="cat" ? st.cat : st.plat)===v}">${v && act==="plat" && v!=="__none" ? `<i class="sw" style="--c:${PLAT_COLOR[v]||"#8A8F9C"}"></i>` : ""}${esc(label)}${n!=null ? `<span class="n">${n}</span>` : ""}</button>`;
  let h = "";
  if (cats.length) h += `<div class="facet" role="group" aria-label="Category"><span class="lbl">Type</span><div class="scroller">${chip("cat","","All",byPlat.length)}${cats.map(c=>chip("cat",c,c,cc[c]||0)).join("")}</div></div>`;
  if (plats.length || none || st.plat) h += `<div class="facet" role="group" aria-label="Where to watch"><span class="lbl">Where</span><div class="scroller">${chip("plat","","Anywhere",byCat.length)}${plats.map(p=>chip("plat",p,p,pc[p]||0)).join("")}${none || st.plat==="__none" ? chip("plat","__none","Not listed",none) : ""}</div></div>`;
  $("facets").innerHTML = h;
}
function emptyBlock(title, text, buttons){
  return `<div class="empty"><h2>${title}</h2><p class="lede">${text}</p>${buttons ? `<div class="row">${buttons}</div>` : ""}</div>`;
}
function loading(t){ return `<div class="thinking"><span class="pulse"></span>${t}</div>`; }

function renderMain(){
  if (!st.mode) { main.innerHTML = loading("Opening your list…"); return; }
  if (st.mode==="cloud" && !st.authReady){ main.innerHTML = loading("Signing in…"); return; }
  if (st.mode==="cloud" && !st.user){ main.innerHTML = signInHTML(); return; }
  if (!st.ready){ main.innerHTML = loading("Opening your list…"); return; }
  if (st.list==="ours" && !st.household){ main.innerHTML = shareSetupHTML(true); return; }
  if (st.list==="ours" && st.household.loading){ main.innerHTML = loading("Opening Our list…"); return; }
  if (st.tab==="foryou"){ main.innerHTML = forYouHTML() + footHTML(); return; }
  const f = norm(st.filter);
  let all = Object.values(st.items);
  if (f) all = all.filter(x => norm(x.title).includes(f));
  if (st.cat) all = all.filter(x => genresOf(x).includes(st.cat));
  if (st.plat) all = all.filter(x => st.plat==="__none" ? !platsOf(x).length : platsOf(x).includes(st.plat));
  const filtered = !!(f || st.cat || st.plat);
  const none = !Object.keys(st.items).length;
  let html = "";
  if (st.slow && none) html += `<p class="note">Your list can't be reached yet. It will appear when the connection comes back.</p>`;
  if (!tmdbKey()) html += `<div class="row banner"><p class="note">Add a free TMDB key to search titles and see posters, seasons and where to stream.</p><button class="btn" data-action="settings">Open Settings</button></div>`;
  else {
    const missing = Object.values(st.items).filter(x => !x.tmdbId && !x.lookedUp).length;
    if (missing) html += `<div class="row banner"><p class="note">${missing} title${missing>1?"s aren't":" isn't"} matched to TMDB yet, so ${missing>1?"they don't":"it doesn't"} show posters or where to watch.</p>
      <button class="btn" data-action="match-all" ${st.fillBusy?"disabled":""}>${st.fillBusy ? "Matching…" : "Match them"}</button></div>`;
  }
  const list = arr => `<div class="list">${arr.map(cardHTML).join("")}</div>`;
  const filt = "Nothing here matches those filters. Tap All or Anywhere to clear them.";
  if (st.tab==="watching"){
    const fresh = x => { const s = schedule(x); return s && s.tone==="new" ? 1 : 0; };
    const arr = all.filter(x=>place(x)==="watching").sort((a,b) => fresh(b)-fresh(a) || (b.newAt||0)-(a.newAt||0) || (b.updatedAt||0)-(a.updatedAt||0));
    if (arr.length) html += list(arr);
    else if (none && st.list==="ours") html += emptyBlock("Our list is empty",
      "Everything here is shared with everyone who joined with your invite code: titles, progress, ratings and notes. Copy titles over from My list, or add new ones.",
      `<button class="btn primary" data-action="open-copy">Copy from My list</button><button class="btn" data-action="open-add">Add a title</button>`);
    else if (none) html += emptyBlock("Start with what you've seen",
      "Paste a list of shows and movies you've already watched and Watch List fills in posters, seasons, categories and where each one streams. The more you log and rate, the better the picks under For you.",
      `<button class="btn primary" data-action="open-add" data-mode="browse">Browse a service</button><button class="btn" data-action="open-add" data-mode="bulk">Paste a list</button><button class="btn" data-action="open-add" data-mode="search">Search a title</button>`);
    else html += emptyBlock("Nothing in progress", filtered ? filt : "Start something from Up next, or add a show you're partway through.",
      `<button class="btn" data-action="tab" data-tab="want">See Up next</button><button class="btn" data-action="open-add">Add a title</button>`);
  } else if (st.tab==="want"){
    const q = all.filter(x=>place(x)==="want");
    const paused = q.filter(x=>x.status==="want" && x.paused).sort((a,b)=>(b.pausedAt||0)-(a.pausedAt||0));
    const queue = q.filter(x=>x.status==="want" && !x.paused).sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
    if (paused.length) html += `<section><p class="sub">Paused</p>${list(paused)}</section>`;
    const seasons = q.filter(x=>x.status!=="want").sort((a,b)=>(upcomingUS(a).date).localeCompare(upcomingUS(b).date));
    if (seasons.length) html += `<section><p class="sub">New seasons coming</p>${list(seasons)}</section>`;
    if (queue.length) html += seasons.length || paused.length ? `<section><p class="sub">Your queue</p>${list(queue)}</section>` : list(queue);
    if (!q.length) html += emptyBlock("Your queue is empty", filtered ? filt : "Add things you mean to get to, or let For you suggest a few. Shows you've finished show up here when a new season gets a date.",
      `<button class="btn" data-action="tab" data-tab="foryou">Get picks</button><button class="btn" data-action="open-add">Add a title</button>`);
  } else if (st.tab==="caught"){
    const arr = all.filter(x=>place(x)==="caught").sort((a,b)=>(upcomingUS(a).date).localeCompare(upcomingUS(b).date));
    html += arr.length ? list(arr) : emptyBlock("Nothing waiting on new episodes", filtered ? filt : "Shows you're caught up on land here while the season is still airing, in order of the next episode.", "");
  } else {
    const arr = all.filter(x=>place(x)==="watched" && x.status!=="dropped").sort((a,b)=>(b.finishedAt||b.updatedAt||0)-(a.finishedAt||a.updatedAt||0));
    const dr = all.filter(x=>x.status==="dropped").sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    const unrated = arr.filter(x=>x.rating==null).length;
    if (arr.length){
      if (unrated) html += `<p class="note">${unrated} unrated. Ratings are what For you learns from most.</p>`;
      html += list(arr);
    } else html += emptyBlock("Nothing logged yet", filtered ? filt : "Log what you've already seen, a whole list at a time.",
      filtered ? "" : `<button class="btn primary" data-action="open-add" data-mode="browse">Browse a service</button><button class="btn" data-action="open-add" data-mode="bulk">Paste a list</button>`);
    if (dr.length) html += `<section><p class="sub">Dropped</p>${list(dr)}</section>`;
  }
  main.innerHTML = html + footHTML();
}
function footHTML(){
  const bits = [];
  if (st.mode==="local") bits.push(HAS_FB ? "Saved in this browser only. Sign in under Settings to sync and share." : "Saved in this browser only. Set up sync (see SETUP.md in the repo) to use it on every device and share a list.");
  if (st.list==="ours") bits.push("Our list is shared. Progress, ratings and notes here are the same for everyone on it.");
  bits.push("Show data from TMDB. Streaming availability from JustWatch, for the US.");
  return `<footer class="foot">${bits.map(b=>`<p class="note">${b}</p>`).join("")}</footer>`;
}
function rateRow(it){
  return `<div class="rate" role="group" aria-label="Rate ${esc(it.title)}">${RATINGS.map(([v,l])=>`<button class="chipbtn" data-action="rate" data-id="${it.id}" data-v="${v}" aria-pressed="${it.rating===v}">${l}</button>`).join("")}</div>`;
}
function ratingChip(it){
  const r = RATINGS.find(q=>q[0]===it.rating);
  return r ? `<span class="chip r-${r[0]}">${r[1]}</span>` : rateRow(it);
}
function schedule(it){
  const T = todayISO();
  if (it.type==="tv"){
    const us = it.usSeasons;
    if (us === 0) return {tone:"info", text:"Not available in the US yet"};
    const inUS = x => x && (us == null || x.s <= us);
    const nx = inUS(it.nextAir) ? it.nextAir : null, la = inUS(it.lastAir) ? it.lastAir : null;
    if (notInUS(it)) {
      if (nx && nx.date && nx.date > T) return {tone:"soon", text:`Next: ${code(nx.s,nx.e)} · ${relDay(nx.date)}`};
      return {tone:"info", text:`Season ${us+1} isn't in the US yet`};
    }
    if (it.showStatus==="upcoming" && (!it.firstAir || it.firstAir > T)){
      const d = (nx && nx.date) || it.firstAir;
      return d ? {tone:"soon", text:`Premieres ${relDay(d)}`} : {tone:"info", text:"Premiere date not announced"};
    }
    if (la && la.date && availOn(la.date, it) > T) return {tone:"soon", text:`${code(la.s,la.e)} aired ${relDay(la.date)} · streams ${relDay(availOn(la.date, it))}`};
    if (nx && nx.date){
      const av = availOn(nx.date, it);
      if (av <= T) return {tone:"new", text:`${code(nx.s,nx.e)} out ${relDay(av)==="today" ? "today" : "now"}`};
      if (nx.date <= T) return {tone:"soon", text:`${code(nx.s,nx.e)} airs ${relDay(nx.date)} · streams ${relDay(av)}`};
      if (nx.e===1) return {tone:"soon", text:`Season ${nx.s} premieres ${relDay(nx.date)}`};
      return {tone:"soon", text:`Next: ${code(nx.s,nx.e)} · ${relDay(nx.date)}`};
    }
    if (la && la.date && dayDiff(la.date) >= -7 && dayDiff(la.date) <= 0) return {tone:"new", text:`${code(la.s,la.e)} aired ${relDay(la.date)}`};
    if (it.showStatus==="returning" && it.status==="watching") return {tone:"info", text:"Next episode date not announced"};
    if (it.showStatus==="ended" && it.status==="watching" && la && la.date) return {tone:"info", text:`Series ended ${fmtDate(la.date)}`};
    return null;
  }
  const th = it.releaseDate, dg = it.digitalDate;
  const streamFirst = dg && (!th || th >= dg);
  if (th && th > T && !streamFirst) return {tone:"soon", text:`In theaters ${relDay(th)}`};
  if (dg && dg > T) return {tone:"soon", text:`${streamFirst ? "Drops" : "On digital"} ${relDay(dg)}`};
  const svc = platsOf(it).find(p => !["In theaters","Rent or buy","Cable / live TV"].includes(p));
  if (dg && dayDiff(dg) >= -21) return {tone:"new", text: svc ? `New on ${svc} · ${relDay(dg)}` : `${streamFirst ? "Dropped" : "Out on digital"} ${relDay(dg)}`};
  if (th && dayDiff(th) >= -60 && dayDiff(th) <= 0 && !platsOf(it).some(p => p!=="In theaters" && p!=="Rent or buy")) return {tone:"info", text:`In theaters since ${fmtDate(th)}`};
  return null;
}
function schedHTML(it){
  if (it.status==="dropped") return "";
  const s = schedule(it); return s ? `<p class="sched ${s.tone}">${esc(s.text)}</p>` : "";
}
function cardHTML(it){
  let prog = "", acts = "";
  const isNew = it.newAt && Date.now() - it.newAt < 14*DAY && nextEp(it);
  const pl = place(it);
  const caughtChip = `<span class="chip c-watched"><span class="dot"></span>Caught up</span>`;
  const rated = RATINGS.find(q=>q[0]===it.rating);
  if (it.type==="tv" && it.status!=="dropped" && (pl==="caught" || (pl==="want" && it.status!=="want"))){
    acts = caughtChip + (rated ? `<span class="chip r-${rated[0]}">${rated[1]}</span>` : "");
  } else if (it.type==="tv" && it.status!=="dropped" && pl==="watching"){
    const tot = airedEps(it), done = Math.min(watchedEps(it), tot || Infinity), n = nextEp(it);
    prog = `<div class="prog"><div class="bar"><i style="width:${tot ? Math.min(100, done/tot*100).toFixed(1) : 0}%"></i></div><span class="mono">${done}${tot ? " / " + tot : ""} eps</span></div>`;
    acts = n ? `${isNew ? `<span class="chip new">New episodes</span>` : ""}<button class="btn primary" data-action="next" data-id="${it.id}">Watched <span class="mono">${code(n.s,n.e)}</span></button>`
             : `<span class="chip c-watched"><span class="dot"></span>Caught up</span>`;
    if (n) acts += `<button class="btn" data-action="caught-up" data-id="${it.id}">Caught up</button>`;
    acts += `<button class="btn ghost" data-action="finish" data-id="${it.id}">Finished</button>`;
    acts += `<button class="btn ghost" data-action="stash" data-id="${it.id}">Pause</button>`;
  } else if (it.status==="watching"){
    acts = `<button class="btn primary" data-action="finish" data-id="${it.id}">Finished it</button><button class="btn ghost" data-action="stash" data-id="${it.id}">Pause</button>`;
  } else if (it.status==="want" && it.paused){
    const at = it.type==="tv" && it.progress && it.progress.e ? ` at ${code(it.progress.s, it.progress.e)}` : "";
    acts = `<span class="chip">Paused${at}</span><button class="btn primary" data-action="resume" data-id="${it.id}">Resume watching</button>`;
  } else if (it.status==="want"){
    if (!isOut(it)) acts = "";
    else if (it.type==="tv") acts = `<button class="btn" data-action="start" data-id="${it.id}">Start watching</button>${it.showStatus==="returning" ? `<button class="btn" data-action="caught-up" data-id="${it.id}">Caught up</button>` : ""}<button class="btn ghost" data-action="finish" data-id="${it.id}">Seen it</button>`;
    else acts = `<button class="btn" data-action="finish" data-id="${it.id}">Watched it</button>`;
  } else if (it.status==="watched" || (it.status==="watching" && pl==="watched")){
    acts = ratingChip(it);
  } else {
    acts = `<span class="chip c-dropped">Dropped${it.type==="tv" && watchedEps(it) ? ` at ${code(it.progress.s,it.progress.e)}` : ""}</span>`;
  }
  const by = st.list==="ours" && it.addedBy && it.addedBy!==uid() && memberName(it.addedBy) ? `<p class="by">Added by ${esc(memberName(it.addedBy))}</p>` : "";
  return `<article class="card" data-action="open" data-id="${it.id}" tabindex="0" aria-label="${esc(it.title)}">
    ${poster(it)}
    <div class="body"><h3>${esc(it.title)}</h3><p class="meta">${esc(metaLine(it))}</p>${schedHTML(it)}${svcBadges(it,3)}${by}${prog}<div class="acts">${acts}</div></div>
  </article>`;
}

function recCard(r, i, src){
  const ex = findExisting(r);
  return `<div class="res">${poster(r)}<div class="body">
    <h3>${esc(r.title)}</h3><p class="meta">${esc(metaLine(r))}</p>
    ${svcBadges(r)}
    ${r.overview ? `<p class="overview clamp">${esc(r.overview)}</p>` : ""}
    ${r.why ? `<p class="why"><b>Why</b>${esc(r.why)}</p>` : ""}
    <div class="acts">${ex ? `<button class="btn ghost" data-action="open" data-id="${ex.id}">On ${LIST_NAME[st.list]} · ${STATUS_LABEL[ex.status]}</button>`
      : `<button class="btn primary" data-action="rec-add" data-src="${src}" data-idx="${i}" data-status="want">Add to Up next</button>
         <button class="btn" data-action="rec-add" data-src="${src}" data-idx="${i}" data-status="watched">Seen it</button>
         <button class="btn ghost" data-action="rec-dismiss" data-src="${src}" data-idx="${i}">Not for me</button>`}</div>
  </div></div>`;
}
function forYouHTML(){
  const p = st.profile;
  const kinds = [["both","Both"],["tv","Shows"],["movie","Movies"]];
  let html = `<section class="panel" aria-labelledby="tasteH">
    <div><h2 id="tasteH">Your taste</h2><p class="lede">Picks start from what you loved, liked and are watching${st.list==="ours" ? " on Our list" : ""}, then lean toward these.</p></div>
    <div><span class="lbl">Services you have</span><div class="chips">${SERVICE_CHOICES.map(s=>`<button class="chipbtn" data-action="service" data-s="${esc(s)}" aria-pressed="${p.services.includes(s)}"><i class="sw" style="--c:${PLAT_COLOR[s]}"></i>${esc(s)}</button>`).join("")}</div>
      ${p.services.length ? `<label class="check" for="onlyMine" style="margin-top:10px"><input type="checkbox" id="onlyMine" ${p.onlyMine?"checked":""}>Only pick things on my services</label>` : ""}</div>
    <div><span class="lbl">Only show these genres</span><p class="note" style="margin:-2px 0 8px">Leave them all off to see every genre.</p><div class="chips">${GENRES.map(g=>`<button class="chipbtn" data-action="genre" data-g="${esc(g)}" aria-pressed="${p.genres.includes(g)}">${esc(g)}</button>`).join("")}</div></div>
    <div class="row"><div class="seg" role="group" aria-label="Show me">${kinds.map(([k,l])=>`<button class="chipbtn" data-action="kind" data-k="${k}" aria-pressed="${p.kind===k}">${l}</button>`).join("")}</div>
    <label class="check" for="recent"><input type="checkbox" id="recent" ${p.recent?"checked":""}>Favor recent releases</label></div>
  </section>`;
  if (!tmdbKey()){
    return html + `<section class="panel"><h2>Picks for you</h2><p class="lede">Picks need a TMDB key. Add one in Settings.</p><div><button class="btn primary" data-action="settings">Open Settings</button></div></section>`;
  }
  const pk = st.picks[st.list];
  html += `<section class="panel" aria-labelledby="picksH"><div class="row" style="justify-content:space-between"><h2 id="picksH">Picks for you</h2>
    <button class="btn ${pk ? "" : "primary"}" data-action="picks" ${st.picksBusy?"disabled":""}>${st.picksBusy ? "Finding…" : pk ? "Refresh picks" : "Get picks"}</button></div>`;
  if (st.picksErr) html += `<p class="err">${esc(st.picksErr)}</p>`;
  if (st.picksBusy) html += loading("Looking at what you've watched…");
  else if (pk && pk.items && pk.items.length){
    html += `<p class="sub">${pk.items.length} picks · ${new Date(pk.at).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</p><div>${pk.items.map((r,i)=>recCard(r,i,"picks")).join("")}</div>`;
  } else if (pk) html += `<p class="note">No picks matched. Try turning off "Only pick things on my services".</p>`;
  else html += `<p class="note">${Object.keys(st.items).length ? "Rate a few things under Watched first for sharper picks." : "Add and rate a few titles first, or tap Get picks to start from what's popular."}</p>`;
  html += `</section>`;
  html += `<section class="panel" aria-labelledby="freshH"><div class="row" style="justify-content:space-between"><h2 id="freshH">New on your services</h2>
    ${p.services.length ? `<button class="btn" data-action="fresh" ${st.freshBusy?"disabled":""}>${st.freshBusy ? "Loading…" : st.fresh ? "Refresh" : "Show me"}</button>` : ""}</div>`;
  if (!p.services.length) html += `<p class="note">Pick the services you have above to see what's new on them from the last five months.</p>`;
  else {
    if (st.freshErr) html += `<p class="err">${esc(st.freshErr)}</p>`;
    if (st.freshBusy) html += loading("Checking your services…");
    else if (st.fresh && st.fresh.length) html += `<div>${st.fresh.map((r,i)=>recCard(r,i,"fresh")).join("")}</div>`;
    else if (st.fresh) html += `<p class="note">Nothing new on those services that isn't already on your list.</p>`;
  }
  return html + `</section>`;
}
function signInHTML(){
  return `<section class="panel signin" aria-labelledby="siH">
    <div><h2 id="siH">Sign in to sync</h2><p class="lede">Your lists follow you to every device, and you can share one list with someone else.</p></div>
    <button class="btn primary" data-action="google" ${st.authBusy?"disabled":""}>Continue with Google</button>
    <div class="or">or use email</div>
    <form id="emailForm" class="panel" style="padding:0;border:0" autocomplete="on">
      <div class="field"><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" inputmode="email"></div>
      <div class="field"><label for="authPw">Password</label><input id="authPw" type="password" autocomplete="current-password" minlength="6"></div>
      <div class="row"><button class="btn primary" type="submit" ${st.authBusy?"disabled":""}>Sign in</button><button class="btn" type="button" data-action="email-create" ${st.authBusy?"disabled":""}>Create account</button></div>
    </form>
    ${st.authErr ? `<p class="err">${esc(st.authErr)}</p>` : ""}
    <hr><button class="btn ghost" data-action="go-local">Use on this device only</button>
  </section>`;
}
function shareSetupHTML(inMain){
  return `<section class="panel" aria-labelledby="shH">
    <div><h2 id="shH">Share a list</h2><p class="lede">Our list is one list you both see and edit, with shared progress, ratings and notes. My list stays private to you.</p></div>
    <div><button class="btn primary" data-action="hh-create" ${st.hhBusy?"disabled":""}>Start a shared list</button></div>
    <div class="field"><label for="joinCode">Have an invite code?</label>
      <div class="row"><div class="grow"><input id="joinCode" placeholder="ABCDE-FGH23" autocapitalize="characters" autocomplete="off" spellcheck="false"></div>
      <button class="btn" data-action="hh-join" ${st.hhBusy?"disabled":""}>Join</button></div></div>
    ${st.hhErr ? `<p class="err">${esc(st.hhErr)}</p>` : ""}
  </section>${inMain ? footHTML() : ""}`;
}

/* ---------- sheets ---------- */
function openSheet(s){ st.sheet = s; sheetWrap.hidden = false; document.body.classList.add("locked"); renderSheet(); }
function closeSheet(){ st.sheet = null; sheetWrap.hidden = true; document.body.classList.remove("locked"); }
function renderSheet(){
  const s = st.sheet; if (!s) return;
  if (s.kind==="detail"){
    const L = listOf(s.id); const it = st.lists[L][s.id]; if (!it){ closeSheet(); return; }
    sheet.setAttribute("aria-label", it.title); sheet.innerHTML = detailHTML(it, s, L);
  } else if (s.kind==="rate"){
    const it = st.lists[listOf(s.id)][s.id]; if (!it){ closeSheet(); return; }
    sheet.setAttribute("aria-label", "Rate " + it.title); sheet.innerHTML = rateSheetHTML(it);
  } else if (s.kind==="copy"){ sheet.setAttribute("aria-label", "Copy to Our list"); sheet.innerHTML = copySheetHTML(s);
  } else if (s.kind==="settings"){ sheet.setAttribute("aria-label", "Settings"); sheet.innerHTML = settingsHTML(s); }
  else { sheet.setAttribute("aria-label", "Add a title"); sheet.innerHTML = addHTML(s); }
}
function resultsHTML(s, hideListed){
  const touched = s.touched || new Set();
  let shown = 0;
  const rows = s.results.map((r,i) => {
    const ex = findExisting(r);
    if (hideListed && ex && !touched.has(r.type + ":" + r.tmdbId)) return "";
    shown++;
    return `<div class="res">${poster(r)}<div class="body"><h3>${esc(r.title)}</h3>
      <p class="meta">${[r.year, r.type==="movie" ? "Film" : "TV series"].filter(Boolean).join(" · ")}</p>
      ${r.overview ? `<p class="overview clamp">${esc(r.overview)}</p>` : ""}
      <div class="acts">${ex ? `<button class="btn ghost" data-action="open" data-id="${ex.id}">On ${LIST_NAME[st.list]} · ${STATUS_LABEL[ex.status]}</button>${ex.status!=="want" ? rateRow(ex) : ""}`
        : s.adding===i ? loading("Adding…")
        : `<span class="lbl" style="margin:0;width:100%">Add as</span>` + (r.type==="tv" ? ["watched","caughtup","watching","want"] : ["watched","watching","want"]).map(k=>`<button class="btn" data-action="add-result" data-idx="${i}" data-status="${k}">${k==="watched" ? "Seen it" : k==="caughtup" ? "Caught up" : STATUS_LABEL[k]}</button>`).join("")}</div>
    </div></div>`;
  }).join("");
  return `<div>${rows}</div>` + (hideListed && !shown && s.results.length ? `<p class="note">Everything here is already on your list. Tap Load more.</p>` : "");
}
const BROWSE_CATS = {
  tv:["Drama","Comedy","Reality TV","Docuseries","Crime","Mystery","Sci-Fi","Fantasy","Action","Animation","Anime","Family","Talk show","War","Western"],
  movie:["Drama","Comedy","Documentary","Crime","Thriller","Mystery","Sci-Fi","Fantasy","Action","Horror","Animation","Anime","Romance","Family","History","Music","War","Western"]
};
function browseHTML(s){
  const svcs = [...new Set([...(st.profile.services||[]), ...SERVICE_CHOICES])].filter(x => !["Cable / live TV","Rent or buy","In theaters","YouTube"].includes(x));
  s.bsvc = s.bsvc || svcs[0]; s.btype = s.btype || "tv"; s.bsort = s.bsort || "pop"; if (s.bhide == null) s.bhide = true;
  const cats = BROWSE_CATS[s.btype];
  let h = `<div class="field"><span class="lbl">Service</span><div class="scroller">${svcs.map(v=>`<button class="chipbtn" data-action="b-svc" data-v="${esc(v)}" aria-pressed="${s.bsvc===v}"><i class="sw" style="--c:${PLAT_COLOR[v]||"#8A8F9C"}"></i>${esc(v)}</button>`).join("")}</div></div>
    <div class="row">
      <div class="seg" role="group" aria-label="Shows or movies">${[["tv","Shows"],["movie","Movies"]].map(([k,l])=>`<button class="chipbtn" data-action="b-type" data-v="${k}" aria-pressed="${s.btype===k}">${l}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Sort">${[["pop","Popular"],["top","Top rated"],["new","Newest"]].map(([k,l])=>`<button class="chipbtn" data-action="b-sort" data-v="${k}" aria-pressed="${s.bsort===k}">${l}</button>`).join("")}</div>
    </div>
    <div class="row"><div class="grow"><select id="bCat" aria-label="Category"><option value="">All categories</option>${cats.map(c=>`<option value="${esc(c)}" ${s.bcat===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <label class="check" for="bHide"><input type="checkbox" id="bHide" ${s.bhide?"checked":""}>Hide what's on my list</label></div>`;
  if (s.err) h += `<p class="err">${esc(s.err)}</p>`;
  if (s.results) {
    if (!s.results.length && !s.loading) h += `<p class="note">Nothing on ${esc(s.bsvc)} matches that. Try another category.</p>`;
    else h += resultsHTML(s, s.bhide);
  }
  if (s.loading) h += loading(s.results ? "Loading more…" : `Loading ${esc(s.bsvc)}…`);
  else if (s.results && s.more) h += `<button class="btn" style="align-self:flex-start" data-action="b-more">Load more</button>`;
  return h;
}
async function browse(s, append){
  const page = append ? (s.page||1) + 1 : 1;
  s.loading = true; s.err = ""; if (!append){ s.results = null; s.page = 0; } renderSheet();
  const reqId = s.reqId = (s.reqId||0) + 1;
  try {
    const ids = await providerIds([s.bsvc]); s.bids = ids;
    if (!ids.length) throw {code:"noprov"};
    const tv = s.btype==="tv", T = todayISO();
    const params = {watch_region:"US", with_watch_providers:ids.join("|"), with_watch_monetization_types:"flatrate|free|ads", language:"en-US", page};
    if (s.bsort==="top"){ params.sort_by = "vote_average.desc"; params["vote_count.gte"] = tv ? 150 : 500; }
    else if (s.bsort==="new"){ params.sort_by = tv ? "first_air_date.desc" : "primary_release_date.desc"; params[tv ? "first_air_date.lte" : "primary_release_date.lte"] = T; params["vote_count.gte"] = tv ? 5 : 20; }
    else { params.sort_by = "popularity.desc"; params["vote_count.gte"] = tv ? 20 : 50; }
    if (s.bcat){
      const G = await genreNames();
      const want = s.bcat==="Anime" ? "Animation" : s.bcat;
      const gids = Object.entries(G[s.btype]).filter(([,name]) => mapTmdbGenres([name], s.btype, "").includes(want)).map(([id]) => id);
      if (!gids.length){ s.results = []; s.more = false; throw {code:"skip"}; }
      params.with_genres = gids.join("|");
      if (s.bcat==="Anime") params.with_original_language = "ja";
      if (s.bcat==="Animation") params.without_keywords = "210024"; // TMDB's "anime" keyword
    }
    // TMDB's service filter also lets through titles that are only for rent, so check each one.
    const prev = append ? (s.results||[]) : [];
    const kept = [];
    let pg = page, total = 1;
    do {
      const d = await tmdb(`/discover/${s.btype}`, {...params, page:pg});
      if (reqId !== s.reqId) return;
      total = Math.min(d.total_pages||1, 40);
      const fresh = (d.results||[]).filter(r => !prev.some(y => y.tmdbId===r.id) && !kept.some(y => y.tmdbId===r.id));
      const metas = await pool(fresh, 6, async r => { try { return await details(s.btype, r.id); } catch(e){ if (e.code==="badkey"||e.code==="offline") throw e; return null; } });
      if (reqId !== s.reqId) return;
      metas.forEach(m => { if (m && (m.subIds||[]).some(id => ids.includes(id))) kept.push(m); });
      s.page = pg; pg++;
    } while (kept.length < 10 && pg <= total && pg < page + 4);
    s.results = [...prev, ...kept];
    s.more = s.page < total;
  } catch(e){ if (e.code!=="skip") s.err = e.code==="noprov" ? `TMDB doesn't list ${s.bsvc} in the US.` : tmdbErr(e); }
  if (reqId === s.reqId){ s.loading = false; if (st.sheet===s) renderSheet(); }
}
function addHTML(s){
  const hasKey = !!tmdbKey();
  const modes = hasKey ? [["search","Search"],["browse","Browse services"],["bulk","Paste a list"],["manual","By hand"]] : [["manual","By hand"]];
  if (!hasKey) s.mode = "manual";
  let h = `<div class="sheet-head"><h2>Add to ${LIST_NAME[st.list]}</h2><button class="x" data-action="close-sheet" aria-label="Close">×</button></div>
    <div class="seg" role="group" aria-label="How to add">${modes.map(([k,l])=>`<button class="chipbtn" data-action="add-mode" data-mode="${k}" aria-pressed="${s.mode===k}">${l}</button>`).join("")}</div>`;
  if (!hasKey) h += `<p class="note">Add a TMDB key in Settings to search titles and fill in posters, seasons and services automatically.</p>`;
  if (s.mode==="search"){
    h += `<form class="row" id="searchForm" autocomplete="off"><div class="grow"><input id="q" type="search" enterkeyhint="search" placeholder="Show or movie title" value="${esc(s.q||"")}" aria-label="Title to search"></div><button class="btn primary" type="submit" ${s.loading?"disabled":""}>Search</button></form>`;
    if (s.err) h += `<p class="err">${esc(s.err)}</p>`;
    if (s.loading) h += loading("Searching…");
    if (s.results && !s.loading){
      if (!s.results.length) h += `<p class="note">No matches. Try another spelling, or add it by hand.</p>`;
      h += resultsHTML(s, false);
    }
  } else if (s.mode==="browse"){
    h += browseHTML(s);
  } else if (s.mode==="bulk"){
    s.bulkStatus = s.bulkStatus || "watched";
    h += `<div class="field"><label for="bulk">One title per line</label><textarea id="bulk" rows="7" placeholder="Breaking Bad&#10;The Bear&#10;Dune: Part Two&#10;Love Is Blind">${esc(s.bulk||"")}</textarea></div>
      <div><span class="lbl">Add them as</span><div class="seg" role="group" aria-label="Add them as">${["watched","want","watching"].map(k=>`<button class="chipbtn" data-action="bulk-status" data-s="${k}" aria-pressed="${s.bulkStatus===k}">${STATUS_LABEL[k]}</button>`).join("")}</div></div>
      <div class="row"><button class="btn primary" data-action="bulk-go" ${s.loading?"disabled":""}>Add all</button><span class="note">Up to 60 at a time. Add a year to pick the right one, like "Shogun 2024".</span></div>`;
    if (s.loading) h += loading(`Looking up ${s.done||0} of ${s.count||0}…`);
    if (s.err) h += `<p class="err">${esc(s.err)}</p>`;
    if (s.result) h += `<p class="note">${esc(s.result)}</p>`;
  } else {
    const m = s.m || (s.m = {title:"",type:"tv",year:"",seasons:"",status:"want"});
    h += `<form id="manualForm" class="panel" style="padding:0;border:0" autocomplete="off">
      <div class="field"><label for="mTitle">Title</label><input id="mTitle" value="${esc(m.title)}"></div>
      <div class="seg" role="group" aria-label="Type">${[["tv","TV show"],["movie","Movie"]].map(([k,l])=>`<button type="button" class="chipbtn" data-action="m-type" data-t="${k}" aria-pressed="${m.type===k}">${l}</button>`).join("")}</div>
      <div class="selrow"><div class="field"><label for="mYear">Year</label><input id="mYear" inputmode="numeric" value="${esc(m.year)}"></div>
      <div class="field"><label for="mStatus">Add to</label><select id="mStatus">${["want","watching","watched"].map(k=>`<option value="${k}" ${m.status===k?"selected":""}>${STATUS_LABEL[k]}</option>`).join("")}</select></div></div>
      ${m.type==="tv" ? `<div class="field"><label for="mSeasons">Episodes per season</label><input id="mSeasons" placeholder="10, 10, 8" value="${esc(m.seasons)}"></div>` : ""}
      <div><button class="btn primary" type="submit">Add</button></div></form>`;
  }
  return h;
}
function detailHTML(it, s, L){
  const kv = [];
  if (it.network) kv.push([it.type==="movie" ? "Studio" : "Network", it.network]);
  if (it.people) kv.push([it.type==="movie" ? "Credits" : "People", it.people]);
  if (it.type==="tv" && it.seasons.length) kv.push(["Episodes", `${totalEps(it)} across ${seasonsLabel(it).toLowerCase()} (${it.seasons.join(" / ")})`]);
  if (notInUS(it)) kv.push(["In the US", it.usSeasons===0 ? "Not available yet" : `Season${it.usSeasons>1?"s":""} 1${it.usSeasons>1?`–${it.usSeasons}`:""} only. Season ${it.usSeasons+1} isn't on a US service yet.`]);
  if (it.runtimeMin) kv.push([it.type==="movie" ? "Runtime" : "Episode", fmtRun(it.runtimeMin)]);
  if (it.showStatus) kv.push(["Status", {returning:"Still airing",ended:"Ended",upcoming:"Coming soon",released:"Released"}[it.showStatus] || it.showStatus]);
  const where = it.origin && it.origin!=="US" ? ` (${it.origin==="GB" ? "UK" : it.origin})` : "";
  if (it.nextAir && it.nextAir.date) kv.push([`Next${where}`, `${code(it.nextAir.s,it.nextAir.e)} on ${fmtDate(it.nextAir.date)}`]);
  if (it.lastAir && it.lastAir.date) kv.push([`Last aired${where}`, `${code(it.lastAir.s,it.lastAir.e)} on ${fmtDate(it.lastAir.date)}`]);
  if (it.type==="movie" && it.releaseDate) kv.push(["In theaters", fmtDate(it.releaseDate)]);
  if (it.type==="movie" && it.digitalDate) kv.push(["Streaming / digital", fmtDate(it.digitalDate)]);
  if (L==="ours" && it.addedBy && memberName(it.addedBy)) kv.push(["Added by", memberName(it.addedBy)]);
  const ps = platsOf(it), gs = genresOf(it);
  let h = `<div class="sheet-head"><span class="lbl" style="margin:0">${it.type==="movie"?"Movie":"TV show"} · ${LIST_NAME[L]}</span><button class="x" data-action="close-sheet" aria-label="Close">×</button></div>
    <div class="detail-top">${poster(it,"lg")}<div class="body"><h3>${esc(it.title)}</h3><p class="meta">${esc(metaLine(it))}</p>
    ${it.overview ? `<p class="overview">${esc(it.overview)}</p>` : ""}</div></div>
    ${kv.length ? `<dl class="kv">${kv.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
    <hr>
    <div><span class="lbl">List</span><div class="seg" role="group" aria-label="List">${["want","watching","watched","dropped"].map(k=>`<button class="chipbtn" data-action="set-status" data-id="${it.id}" data-status="${k}" aria-pressed="${it.status===k}" ${!isOut(it) && (k==="watching"||k==="watched") ? "disabled" : ""}>${STATUS_LABEL[k]}</button>`).join("")}</div>${!isOut(it) ? `<p class="note" style="margin-top:6px">Not out yet${outDate(it) ? `. Out ${relDay(outDate(it))}` : ""}. You can mark it once it's released.</p>` : ""}</div>
    <div><span class="lbl">Your rating${L==="ours" ? " (shared)" : ""}</span>${rateRow(it)}</div>`;
  if (it.type==="tv" && it.status!=="want"){
    const S = it.seasons, p = it.progress||{s:1,e:0}, n = nextEp(it);
    const lim = airedLimit(it);
    const sCount = lim ? Math.max(lim.s, 1) : Math.max(S.length, p.s, 1);
    const eMax = lim && p.s===lim.s ? lim.e : (S[p.s-1] || Math.max(p.e+5, 10));
    h += `<div><span class="lbl">Episode progress · optional</span>
      <div class="selrow"><select id="pS" data-id="${it.id}" aria-label="Season">${Array.from({length:sCount},(_,i)=>`<option value="${i+1}" ${p.s===i+1?"selected":""}>Season ${i+1}</option>`).join("")}</select>
      <select id="pE" data-id="${it.id}" aria-label="Episode">${Array.from({length:eMax+1},(_,i)=>`<option value="${i}" ${p.e===i?"selected":""}>${i===0?"Not started":"Episode "+i}</option>`).join("")}</select></div>
      <div class="row" style="margin-top:10px">${n ? `<button class="btn" data-action="next" data-id="${it.id}">Watched <span class="mono">${code(n.s,n.e)}</span></button>${S[n.s-1] && n.e < S[n.s-1] ? `<button class="btn" data-action="season-done" data-id="${it.id}">Finished season ${n.s}</button>` : ""}<button class="btn" data-action="caught-up" data-id="${it.id}">Caught up</button>` : `<span class="chip c-watched"><span class="dot"></span>Caught up</span>`}
      <span class="mono note">${watchedEps(it)}${totalEps(it) ? " / " + totalEps(it) : ""} episodes</span></div></div>`;
  }
  h += `<div><span class="lbl">Where to watch</span>${s.editWhere || !ps.length
      ? `${!ps.length && it.tmdbId ? `<p class="note" style="margin-bottom:8px">Not streaming in the US right now. Pick a service if you know one.</p>` : ""}<div class="chips">${PLATFORMS.map(([p,c])=>`<button class="chipbtn" data-action="edit-plat" data-id="${it.id}" data-v="${esc(p)}" aria-pressed="${ps.includes(p)}"><i class="sw" style="--c:${c}"></i>${esc(p)}</button>`).join("")}</div>${ps.length ? `<button class="btn ghost" style="margin-top:8px" data-action="edit-where-done">Done</button>` : ""}`
      : `<div class="row">${svcBadges(it)}<button class="btn ghost" data-action="edit-where">Change</button>${it.providerLink ? `<a class="btn ghost" href="${esc(it.providerLink)}" target="_blank" rel="noopener">All options ↗</a>` : ""}</div>`}</div>
    <div><span class="lbl">Type</span>${s.editType
      ? `<div class="chips">${GENRES.map(g=>`<button class="chipbtn" data-action="edit-genre" data-id="${it.id}" data-v="${esc(g)}" aria-pressed="${gs.includes(g)}">${esc(g)}</button>`).join("")}</div><button class="btn ghost" style="margin-top:8px" data-action="edit-type-done">Done</button>`
      : `<div class="row"><span class="meta">${esc(gs.join(" / ") || "Not set")}</span><button class="btn ghost" data-action="edit-type">Change</button></div>`}</div>
    <div class="field"><label for="notes">Notes</label><textarea id="notes" data-id="${it.id}" placeholder="Where you left off, who recommended it…">${esc(it.notes||"")}</textarea></div>`;
  if (s.err) h += `<p class="err">${esc(s.err)}</p>`;
  const canMove = st.mode==="cloud" && st.household;
  h += `<div class="row">
    ${tmdbKey() ? `<button class="btn" data-action="refresh" data-id="${it.id}" ${s.loading?"disabled":""}>${s.loading ? "Checking…" : it.tmdbId ? "Refresh details" : "Match on TMDB"}</button>` : ""}
    ${canMove ? (findIn(L==="ours"?"mine":"ours", it) ? `<span class="note">Also on ${LIST_NAME[L==="ours"?"mine":"ours"]}</span>`
      : `<button class="btn" data-action="copy" data-id="${it.id}">Copy to ${LIST_NAME[L==="ours"?"mine":"ours"]}</button><button class="btn ghost" data-action="move" data-id="${it.id}">Move</button>`) : ""}
    ${s.confirm ? `<span class="note">Remove ${esc(it.title)}?</span><button class="btn danger" data-action="remove-yes" data-id="${it.id}">Remove</button><button class="btn ghost" data-action="remove-no">Keep</button>`
      : `<button class="btn ghost danger" data-action="remove" data-id="${it.id}">Remove</button>`}</div>`;
  return h;
}
function rateSheetHTML(it){
  return `<div class="sheet-head"><h2>How was it?</h2><button class="x" data-action="close-sheet" aria-label="Close">×</button></div>
    <div class="detail-top">${poster(it,"lg")}<div class="body"><h3>${esc(it.title)}</h3><p class="meta">${esc(metaLine(it))}</p></div></div>
    <div class="ratebig" role="group" aria-label="Rate ${esc(it.title)}">${RATINGS.map(([v,l])=>`<button class="chipbtn" data-action="rate" data-id="${it.id}" data-v="${v}" aria-pressed="${it.rating===v}">${l}</button>`).join("")}</div>
    <button class="btn ghost" style="align-self:flex-start" data-action="close-sheet">Skip for now</button>`;
}
function askRating(it){ if (it && it.rating==null) openSheet({kind:"rate", id:it.id}); }
function copyCandidates(s){
  return Object.values(st.lists.mine).filter(x => !findIn("ours", x))
    .filter(x => s.tab==="all" || (s.tab==="watched" ? (x.status==="watched"||x.status==="dropped") : x.status===s.tab))
    .sort((a,b) => (a.title||"").localeCompare(b.title||""));
}
function copySheetHTML(s){
  const list = copyCandidates(s);
  const allOn = list.length && list.every(x => s.sel.has(x.id));
  const tabs = [["all","All"],["watching","Watching"],["want","Up next"],["watched","Watched"]];
  let h = `<div class="sheet-head"><h2>Copy to Our list</h2><button class="x" data-action="close-sheet" aria-label="Close">×</button></div>
    <p class="lede">Pick titles from My list. Each copy keeps your progress and rating, and from then on Our list's copy is shared.</p>
    <div class="seg" role="group" aria-label="Show">${tabs.map(([k,l])=>`<button class="chipbtn" data-action="copy-tab" data-v="${k}" aria-pressed="${s.tab===k}">${l}</button>`).join("")}</div>`;
  if (!list.length) return h + `<p class="note">${Object.keys(st.lists.mine).length ? "Everything here is already on Our list." : "My list is empty."}</p>`;
  h += `<div class="row" style="justify-content:space-between"><button class="btn ghost" data-action="copy-all">${allOn ? "Clear" : "Select all"}</button>
    <button class="btn primary" data-action="copy-go" ${s.sel.size ? "" : "disabled"}>Copy ${s.sel.size || ""} to Our list</button></div><div>`;
  h += list.map(x => `<button class="pick" data-action="copy-pick" data-id="${x.id}" aria-pressed="${s.sel.has(x.id)}">
      <span class="box" aria-hidden="true">${s.sel.has(x.id) ? "✓" : ""}</span>${poster(x)}
      <span class="body"><b>${esc(x.title)}</b><span class="meta">${esc(STATUS_LABEL[x.status])}${x.rating!=null ? " · " + (RATINGS.find(r=>r[0]===x.rating)||[,""])[1] : ""}</span></span>
    </button>`).join("");
  return h + `</div>`;
}
function settingsHTML(s){
  let h = `<div class="sheet-head"><h2>Settings</h2><button class="x" data-action="close-sheet" aria-label="Close">×</button></div>`;
  // Account
  h += `<section class="field"><span class="lbl">Account</span>`;
  if (st.mode==="cloud" && st.user) h += `<div class="row"><span>Signed in as <b>${esc(st.user.email || st.user.name)}</b></span><button class="btn ghost" data-action="sign-out">Sign out</button></div>`;
  else if (HAS_FB) h += `<div class="row"><span class="note">This device only. Sign in to sync your list and share one.</span><button class="btn" data-action="go-cloud">Sign in</button></div>`;
  else h += `<p class="note">This device only. To sync across phones and share a list, set up Firebase using SETUP.md in the GitHub repo.</p>`;
  h += `</section><hr>`;
  // Sharing
  if (st.mode==="cloud" && st.user){
    h += `<section class="field"><span class="lbl">Shared list</span>`;
    if (st.household && !st.household.loading){
      const names = (st.household.members||[]).map(m => m===uid() ? "You" : (st.household.names||{})[m] || "Someone");
      h += `<p class="note" style="margin-bottom:8px">Invite code. Whoever enters it under Our list joins your shared list.</p>
        <div class="row"><span class="code" id="inviteCode">${fmtCode(st.household.id)}</span><button class="btn" data-action="copy-code">Copy</button></div>
        <p class="note" style="margin-top:8px">On it: ${esc(names.join(", "))}</p>
        <div style="margin-top:8px"><button class="btn" data-action="open-copy">Copy titles from My list</button></div>
        <div class="row" style="margin-top:8px">${s.leave ? `<span class="note">Leave Our list? Titles stay with the others.</span><button class="btn danger" data-action="hh-leave-yes">Leave</button><button class="btn ghost" data-action="hh-leave-no">Stay</button>` : `<button class="btn ghost danger" data-action="hh-leave">Leave shared list</button>`}</div>`;
    } else h += shareSetupHTML(false);
    h += `</section><hr>`;
  }
  // TMDB
  const k = tmdbKey();
  h += `<section class="field"><span class="lbl">TMDB key</span>
    <p class="note" style="margin-bottom:8px">${k ? "Connected. Posters, seasons, categories and services come from TMDB." : `Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a>, then paste the API Key or the Read Access Token here.`}
    ${st.household ? " Saving it here also shares it with everyone on Our list." : ""}</p>
    <form id="keyForm" class="row" autocomplete="off"><div class="grow"><input id="tmdbKeyIn" type="password" placeholder="${k ? "••••••••  (saved)" : "Paste key"}" spellcheck="false" aria-label="TMDB key"></div><button class="btn primary" type="submit">Save</button></form>
    ${s.keyMsg ? `<p class="${s.keyOk ? "note" : "err"}" style="margin-top:6px">${esc(s.keyMsg)}</p>` : ""}
  </section><hr>`;
  // Maintenance
  if (k){
    h += `<section class="field"><span class="lbl">Keep it current</span>
      <p class="note" style="margin-bottom:8px">Shows you're watching update on their own about twice a day. This updates everything on ${LIST_NAME[st.list]} now: new seasons, air dates and where each title streams.</p>
      <div><button class="btn" data-action="update-all" ${st.updBusy?"disabled":""}>${st.updBusy ? "Updating…" : "Update all titles"}</button></div></section><hr>`;
  }
  h += `<p class="note">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability is provided by JustWatch.</p>`;
  return h;
}

/* ---------- actions ---------- */
async function lookupOne(line){
  const m = line.match(/^(.*?)[\s(]+((?:19|20)\d{2})\)?\s*$/);
  const q = (m ? m[1] : line).trim(), y = m ? +m[2] : null;
  const res = await searchTitles(q);
  if (!res.length) return null;
  let best = y ? res.find(r => r.year===y) : null;
  if (!best){
    const exact = res.filter(r => norm(r.title)===norm(q));
    best = (exact.length ? exact : res).sort((a,b) => b.popularity-a.popularity)[0];
  }
  return details(best.type, best.tmdbId);
}
const A = {
  "tab": el => { st.tab = el.dataset.tab; lsSet("wl.tab", st.tab); if (st.sheet) closeSheet(); render(true); window.scrollTo({top:0}); },
  "list": el => { st.list = el.dataset.l; lsSet("wl.list", st.list); st.cat = ""; st.plat = ""; lsSet("wl.cat",""); lsSet("wl.plat",""); render(true); window.scrollTo({top:0}); },
  "settings": () => openSheet({kind:"settings"}),
  "open-add": el => {
    openSheet({kind:"add", mode: tmdbKey() ? (el.dataset.mode||"search") : "manual"});
    if (st.sheet.mode==="browse"){ browseHTML(st.sheet); browse(st.sheet); } else focusFirst();
  },
  "close-sheet": () => closeSheet(),
  "add-mode": el => {
    const s = st.sheet; const m = el.dataset.mode; if (s.mode===m) return;
    s.mode = m; s.err = ""; s.results = null; s.loading = false; s.reqId = (s.reqId||0) + 1;
    if (m==="browse"){ browseHTML(s); browse(s); } else { renderSheet(); focusFirst(); }
  },
  "b-svc": el => { st.sheet.bsvc = el.dataset.v; browse(st.sheet); },
  "b-type": el => { st.sheet.btype = el.dataset.v; st.sheet.bcat = ""; browse(st.sheet); },
  "b-sort": el => { st.sheet.bsort = el.dataset.v; browse(st.sheet); },
  "b-more": () => browse(st.sheet, true),
  "open": (el,id) => openSheet({kind:"detail", id}),
  "next": (el,id) => markNext(id),
  "stash": (el,id) => {
    const L = listOf(id), it = clean(st.lists[L][id]);
    it.status = "want"; it.paused = true; it.pausedAt = Date.now(); upsert(it, L);
    toast(`Paused ${it.title}. It's in Up next until you resume it.`);
  },
  "resume": (el,id) => {
    const L = listOf(id), it = clean(st.lists[L][id]);
    if (applyStatus(it,"watching")!=="watching"){ toast(notOutMsg(it)); return; }
    upsert(it, L); toast(`Back to watching ${it.title}`);
  },
  "start": (el,id) => { const L = listOf(id), it = clean(st.lists[L][id]); if (applyStatus(it,"watching")!=="watching"){ toast(notOutMsg(it)); return; } upsert(it, L); toast(`Started ${it.title}`); },
  "finish": (el,id) => { const L = listOf(id), it = clean(st.lists[L][id]); if (applyStatus(it,"watched")!=="watched"){ toast(notOutMsg(it)); return; } delete it.newAt; upsert(it, L); if (it.rating==null) askRating(it); else toast(`Marked ${it.title} watched`); },
  "caught-up": (el,id) => {
    const L = listOf(id), it = clean(st.lists[L][id]);
    if (!isOut(it)){ toast(notOutMsg(it)); return; }
    if (!catchUp(it)){ toast("No episode info for this show yet. Open it and tap Refresh details."); return; }
    upsert(it, L); caughtUpToast(it);
  },
  "season-done": (el,id) => {
    const L = listOf(id), it = clean(st.lists[L][id]); const n = nextEp(it); if (!n || !it.seasons[n.s-1]) return;
    it.progress = capProgress({s:n.s, e:it.seasons[n.s-1]}, it); it.status = "watching"; upsert(it, L);
    toast(it.progress.e===it.seasons[n.s-1] ? `Finished season ${n.s}` : `Caught up through ${code(it.progress.s,it.progress.e)}`);
  },
  "set-status": (el,id) => { const L = listOf(id), it = clean(st.lists[L][id]); const k = el.dataset.status; if (it.status===k) return; if (applyStatus(it,k)!==k){ toast(notOutMsg(it)); return; } upsert(it, L); },
  "rate": (el,id) => {
    const L = listOf(id), it = clean(st.lists[L][id]); const v = +el.dataset.v;
    const fromPrompt = st.sheet && st.sheet.kind==="rate";
    it.rating = it.rating===v && !fromPrompt ? null : v; upsert(it, L);
    if (fromPrompt) closeSheet();
    const r = RATINGS.find(q => q[0]===it.rating); if (r && (fromPrompt || !st.sheet)) toast(`${it.title}: ${r[1]}`);
  },
  "remove": () => { st.sheet.confirm = true; renderSheet(); },
  "remove-no": () => { st.sheet.confirm = false; renderSheet(); },
  "remove-yes": (el,id) => { const L = listOf(id); const t = st.lists[L][id] && st.lists[L][id].title; closeSheet(); delete st.lists[L][id]; backend.deleteItem(id, L); render(true); toast(`Removed ${t}`); },
  "copy": (el,id) => {
    const from = listOf(id), to = from==="ours" ? "mine" : "ours";
    const c = copyItem(st.lists[from][id], to);
    toast(c ? `Copied ${c.title} to ${LIST_NAME[to]}` : `Already on ${LIST_NAME[to]}`); renderSheet();
  },
  "open-copy": () => openSheet({kind:"copy", sel:new Set(), tab:"all"}),
  "copy-tab": el => { st.sheet.tab = el.dataset.v; renderSheet(); },
  "copy-pick": el => { const s = st.sheet, id = el.dataset.id; if (s.sel.has(id)) s.sel.delete(id); else s.sel.add(id); renderSheet(); },
  "copy-all": () => { const s = st.sheet; const ids = copyCandidates(s).map(x => x.id); const allOn = ids.every(i => s.sel.has(i)); ids.forEach(i => allOn ? s.sel.delete(i) : s.sel.add(i)); renderSheet(); },
  "copy-go": () => {
    const s = st.sheet; let n = 0;
    [...s.sel].forEach(id => { const it = st.lists.mine[id]; if (it && copyItem(it, "ours")) n++; });
    closeSheet(); st.list = "ours"; lsSet("wl.list","ours"); render(true);
    toast(`Copied ${n} title${n===1?"":"s"} to Our list`);
  },
  "move": (el,id) => {
    const from = listOf(id), to = from==="ours" ? "mine" : "ours";
    const it = clean(st.lists[from][id]);
    const dup = findIn(to, it);
    if (dup){ toast(`${it.title} is already on ${LIST_NAME[to]}`); return; }
    if (to==="ours" && !it.addedBy) it.addedBy = uid();
    delete st.lists[from][id]; backend.deleteItem(id, from);
    it.updatedAt = Date.now(); st.lists[to][id] = it; backend.saveItem(it, to);
    closeSheet(); render(true); toast(`Moved ${it.title} to ${LIST_NAME[to]}`);
  },
  "edit-where": () => { st.sheet.editWhere = true; renderSheet(); },
  "edit-where-done": () => { st.sheet.editWhere = false; renderSheet(); },
  "edit-type": () => { st.sheet.editType = true; renderSheet(); },
  "edit-type-done": () => { st.sheet.editType = false; renderSheet(); },
  "edit-plat": (el,id) => { const L = listOf(id), it = clean(st.lists[L][id]); const v = el.dataset.v, a = platsOf(it); it.platforms = a.includes(v) ? a.filter(x=>x!==v) : [...a,v]; it.platformsManual = true; st.sheet.editWhere = true; upsert(it, L); },
  "edit-genre": (el,id) => { const L = listOf(id), it = clean(st.lists[L][id]); const v = el.dataset.v, a = genresOf(it); it.genres = a.includes(v) ? a.filter(x=>x!==v) : [...a,v].slice(-4); it.genresManual = true; upsert(it, L); },
  "refresh": async (el,id) => {
    const s = st.sheet; const L = listOf(id); const it0 = st.lists[L][id];
    s.loading = true; s.err = ""; renderSheet();
    try {
      let m;
      if (it0.tmdbId) m = await details(it0.type, it0.tmdbId, true);
      else {
        const res = (await searchTitles(it0.title)).filter(r => r.type===it0.type);
        const best = (it0.year && res.find(r => r.year===it0.year)) || res[0];
        if (!best) throw {code:"nomatch"};
        m = await details(best.type, best.tmdbId);
      }
      const cur = st.lists[L][id]; if (!cur) return;
      const before = (cur.seasons||[]).length;
      const merged = mergeMeta(cur, m); upsert(merged, L);
      toast(merged.type==="tv" && before && merged.seasons.length > before ? `New season found: Season ${merged.seasons.length}` : "Details updated");
    } catch(e){ s.err = e.code==="nomatch" ? "Couldn't find this title on TMDB. Check the spelling of the title." : tmdbErr(e); }
    s.loading = false; if (st.sheet===s) renderSheet();
  },
  "add-result": async el => {
    const s = st.sheet; const i = +el.dataset.idx; const r = s.results[i]; const k = el.dataset.status;
    s.adding = i; (s.touched = s.touched || new Set()).add(r.type + ":" + r.tmdbId); renderSheet();
    try { const m = await details(r.type, r.tmdbId); if (k==="caughtup"){
        if (!isOut(m)){ const it = addFromMeta(m, "want"); toast(notOutMsg(it)); }
        else { const ex = findExisting(m); const it = clean(ex || makeItem(m, "watching", st.list)); if (catchUp(it)){ upsert(it, ex ? listOf(it.id) : st.list); caughtUpToast(it); } else { upsert(it, ex ? listOf(it.id) : st.list); toast(`${it.title} added to Watching`); } }
      } else { const it = addFromMeta(m, k); toast(it.status!==k && k!=="want" && !isOut(it) ? notOutMsg(it) : `${it.title} added to ${STATUS_LABEL[it.status]}`); } }
    catch(e){ s.err = tmdbErr(e); }
    s.adding = null; if (st.sheet===s) renderSheet();
  },
  "bulk-status": el => { st.sheet.bulkStatus = el.dataset.s; renderSheet(); },
  "bulk-go": async () => {
    const s = st.sheet; const L = st.list;
    const lines = (s.bulk||"").split(/\n|;/).map(x=>x.trim()).filter(Boolean);
    if (!lines.length){ s.err = "Add at least one title, one per line."; renderSheet(); return; }
    const batch = lines.slice(0,60); s.loading = true; s.err = ""; s.result = ""; s.count = batch.length; s.done = 0; renderSheet();
    let added = 0, dup = 0, early = 0; const miss = [];
    try {
      await pool(batch, 3, async line => {
        let m = null;
        try { m = await lookupOne(line); } catch(e){ if (e.code==="badkey" || e.code==="nokey" || e.code==="offline") throw e; }
        s.done++; if (st.sheet===s) renderSheet();
        if (!m){ miss.push(line); return; }
        if (findIn(L, m)){ dup++; return; }
        const it = makeItem(m, s.bulkStatus, L); if (it.status!==s.bulkStatus) early++; st.lists[L][it.id] = it; backend.saveItem(it, L); added++;
      });
      s.bulk = lines.slice(60).join("\n");
      s.result = `Added ${added}.` + (dup ? ` Skipped ${dup} already on your list.` : "") + (early ? ` ${early} not out yet went to Up next.` : "") + (miss.length ? ` Couldn't find: ${miss.join(", ")}.` : "") + (lines.length > 60 ? ` ${lines.length-60} lines left to add.` : "");
      if (added && s.bulkStatus!=="watching"){ st.tab = s.bulkStatus; lsSet("wl.tab", st.tab); }
    } catch(e){ s.err = tmdbErr(e); }
    s.loading = false; render(true);
  },
  "m-type": el => { readManual(); st.sheet.m.type = el.dataset.t; renderSheet(); },
  "match-all": async () => {
    if (st.fillBusy) return; const L = st.list;
    const list = Object.values(st.lists[L]).filter(x => !x.tmdbId && !x.lookedUp).slice(0,60); if (!list.length) return;
    st.fillBusy = true; render(true); let n = 0;
    try {
      await pool(list, 3, async x => {
        let m = null; try { m = await lookupOne(x.title + (x.year ? " " + x.year : "")); } catch(e){ if (e.code==="badkey"||e.code==="nokey"||e.code==="offline") throw e; }
        const cur = st.lists[L][x.id]; if (!cur) return;
        let it = clean(cur);
        if (m && m.type===cur.type){ it = mergeMeta(it, m); n++; } else it.lookedUp = true;
        it.updatedAt = cur.updatedAt; st.lists[L][it.id] = it; backend.saveItem(it, L);
      });
      toast(`Matched ${n} of ${list.length}`);
    } catch(e){ toast(tmdbErr(e)); }
    st.fillBusy = false; render(true);
  },
  "update-all": async () => {
    if (st.updBusy) return; const L = st.list;
    const list = Object.values(st.lists[L]).filter(x => x.tmdbId);
    st.updBusy = true; renderSheet(); let newS = 0;
    try {
      await pool(list, 4, async x => {
        const m = await details(x.type, x.tmdbId, true).catch(e => { if (e.code==="badkey"||e.code==="offline") throw e; return null; });
        const cur = st.lists[L][x.id]; if (!m || !cur) return;
        const merged = mergeMeta(cur, m); if (merged.newAt && merged.newAt !== cur.newAt) newS++;
        merged.updatedAt = cur.updatedAt; st.lists[L][x.id] = merged; backend.saveItem(merged, L);
      });
      toast(newS ? `Updated. ${newS} show${newS>1?"s have":" has"} new episodes.` : `Updated ${list.length} titles`);
    } catch(e){ toast(tmdbErr(e)); }
    st.updBusy = false; render(true);
  },
  "genre": el => { const g = el.dataset.g, a = st.profile.genres; st.profile.genres = a.includes(g) ? a.filter(x=>x!==g) : [...a,g]; backend.saveProfile(); tasteChanged(); render(true); },
  "service": el => { const v = el.dataset.s, a = st.profile.services||[]; st.profile.services = a.includes(v) ? a.filter(x=>x!==v) : [...a,v]; backend.saveProfile(); tasteChanged(); render(true); },
  "kind": el => { st.profile.kind = el.dataset.k; backend.saveProfile(); tasteChanged(); render(true); },
  "cat": el => { st.cat = el.dataset.v; lsSet("wl.cat", st.cat); render(true); },
  "plat": el => { st.plat = el.dataset.v; lsSet("wl.plat", st.plat); render(true); },
  "picks": async () => {
    if (st.picksBusy) return; const L = st.list; st.picksBusy = true; st.picksErr = ""; render(true);
    try { const items = await buildPicks(); st.picks[L] = {items, at:Date.now()}; savePicksLocal(); }
    catch(e){ st.picksErr = tmdbErr(e); }
    st.picksBusy = false; render(true);
  },
  "fresh": async () => {
    if (st.freshBusy) return; st.freshBusy = true; st.freshErr = ""; render(true);
    try { st.fresh = await buildFresh(); } catch(e){ st.freshErr = tmdbErr(e); }
    st.freshBusy = false; render(true);
  },
  "rec-add": el => {
    const src = el.dataset.src === "fresh" ? st.fresh : (st.picks[st.list]||{}).items; const r = src && src[+el.dataset.idx]; if (!r) return;
    const k = el.dataset.status; const it = addFromMeta(r, k); toast(it.status!==k && !isOut(it) ? notOutMsg(it) : `${it.title} added to ${STATUS_LABEL[it.status]}`);
  },
  "rec-dismiss": el => {
    const fresh = el.dataset.src==="fresh"; const arr = fresh ? st.fresh : (st.picks[st.list]||{}).items; const i = +el.dataset.idx; const r = arr && arr[i]; if (!r) return;
    const k = r.type + ":" + r.tmdbId;
    st.profile.dismissed = [...(st.profile.dismissed||[]).filter(x => x!==k), k].slice(-400);
    arr.splice(i,1); if (!fresh) savePicksLocal();
    backend.saveProfile(); render(true); toast(`Won't suggest ${r.title} again`);
  },
  "google": () => googleSignIn(),
  "email-create": () => emailAuth(true),
  "go-local": () => { lsSet("wl.local","1"); startLocal(); },
  "go-cloud": () => { lsSet("wl.local", null); location.reload(); },
  "sign-out": async () => { closeSheet(); stopAll(); clearSnap(); await whenFB(() => auth.signOut()).catch(()=>{}); },
  "hh-create": async () => {
    st.hhBusy = true; st.hhErr = ""; render(true);
    try { await createHousehold(); st.list = "ours"; lsSet("wl.list","ours"); toast("Shared list started. Send your invite code from Settings."); }
    catch(e){ st.hhErr = hhErrCopy(e); }
    st.hhBusy = false; render(true);
  },
  "hh-join": async () => {
    const v = ($("joinCode")||{}).value || "";
    st.hhBusy = true; st.hhErr = ""; render(true);
    try { await joinHousehold(v); st.list = "ours"; lsSet("wl.list","ours"); toast("You're on the shared list"); }
    catch(e){ st.hhErr = hhErrCopy(e); }
    st.hhBusy = false; render(true);
  },
  "hh-leave": () => { st.sheet.leave = true; renderSheet(); },
  "hh-leave-no": () => { st.sheet.leave = false; renderSheet(); },
  "hh-leave-yes": async () => { await leaveHousehold(); st.list = "mine"; lsSet("wl.list","mine"); closeSheet(); render(true); toast("You left the shared list"); },
  "copy-code": async () => {
    const c = fmtCode(st.household && st.household.id);
    try { await navigator.clipboard.writeText(c); toast("Invite code copied"); }
    catch(e){ const el = $("inviteCode"); if (el){ const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } toast("Select the code and copy it"); }
  }
};
function readManual(){
  const m = st.sheet && st.sheet.m; if (!m) return;
  const g = id => { const el = $(id); return el ? el.value : undefined; };
  if (g("mTitle")!==undefined) m.title = g("mTitle");
  if (g("mYear")!==undefined) m.year = g("mYear");
  if (g("mStatus")!==undefined) m.status = g("mStatus");
  if (g("mSeasons")!==undefined) m.seasons = g("mSeasons");
}
function focusFirst(){ setTimeout(()=>{ const el = sheet.querySelector("#q,#bulk,#mTitle"); if (el && matchMedia("(hover: hover)").matches) el.focus(); }, 30); }

document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]"); if (!el) return;
  const f = A[el.dataset.action]; if (!f) return;
  e.stopPropagation(); f(el, el.dataset.id, e);
});
document.addEventListener("keydown", e => {
  if (e.key==="Escape" && st.sheet){ closeSheet(); return; }
  if ((e.key==="Enter" || e.key===" ") && e.target.classList && e.target.classList.contains("card")){ e.preventDefault(); A.open(e.target, e.target.dataset.id); }
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  const id = e.target.id;
  if (id==="searchForm"){
    const s = st.sheet; const q = ($("q").value||"").trim(); if (!q) return;
    s.q = q; s.loading = true; s.err = ""; renderSheet();
    try { s.results = await searchTitles(q); } catch(err){ s.err = tmdbErr(err); s.results = null; }
    s.loading = false; if (st.sheet===s) renderSheet();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  } else if (id==="manualForm"){
    readManual(); const m = st.sheet.m; const title = m.title.trim();
    if (!title){ $("mTitle").focus(); return; }
    const seasons = m.type==="tv" ? (m.seasons||"").split(/[^0-9]+/).map(Number).filter(n=>n>0) : [];
    const ex = findExisting({title, type:m.type});
    if (ex){ openSheet({kind:"detail", id:ex.id}); toast("Already on your list"); return; }
    const it = makeItem({title, type:m.type, year:+m.year||null, seasons}, m.status, st.list); upsert(it, st.list);
    st.sheet.m = {title:"",type:m.type,year:"",seasons:"",status:m.status}; renderSheet();
    toast(`${title} added to ${STATUS_LABEL[it.status]}`);
  } else if (id==="emailForm"){
    emailAuth(false);
  } else if (id==="keyForm"){
    const s = st.sheet; const v = ($("tmdbKeyIn").value||"").trim();
    if (!v){ s.keyMsg = "Paste your key first."; s.keyOk = false; renderSheet(); return; }
    const old = lsGet("wl.tmdb"); lsSet("wl.tmdb", v); cache.clear(); genreIdx = null; provIdx = null;
    try {
      await tmdb("/configuration");
      s.keyMsg = "Saved. TMDB is connected."; s.keyOk = true;
      if (st.mode==="cloud" && st.user){
        backend.saveUser({tmdbKey:v}).catch(()=>{});
        if (st.household){ const hid = st.household.id; whenFB(() => fs.doc(`households/${hid}`).update({tmdbKey:v})).catch(()=>{}); }
      }
      scheduleRefresh();
    } catch(err){ lsSet("wl.tmdb", old); s.keyMsg = tmdbErr(err); s.keyOk = false; }
    render(true);
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id==="filter"){ st.filter = t.value; renderMain(); }
  else if (t.id==="q" && st.sheet) st.sheet.q = t.value;
  else if (t.id==="bulk" && st.sheet) st.sheet.bulk = t.value;
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id==="bCat" && st.sheet){ st.sheet.bcat = t.value; t.blur(); browse(st.sheet); return; }
  if (t.id==="bHide" && st.sheet){ st.sheet.bhide = t.checked; renderSheet(); return; }
  if (t.id==="recent"){ st.profile.recent = t.checked; backend.saveProfile(); tasteChanged(); }
  else if (t.id==="onlyMine"){ st.profile.onlyMine = t.checked; backend.saveProfile(); tasteChanged(); }
  else if (t.id==="notes"){ const L = listOf(t.dataset.id), it = clean(st.lists[L][t.dataset.id]); if (it.notes !== t.value){ it.notes = t.value.slice(0,2000); upsert(it, L); } }
  else if (t.id==="pS" || t.id==="pE"){
    const L = listOf(t.dataset.id), it = clean(st.lists[L][t.dataset.id]);
    const s = +$("pS").value; let ep = +$("pE").value;
    if (t.id==="pS") ep = Math.min(ep, it.seasons[s-1] || ep);
    it.progress = capProgress({s, e:ep}, it);
    if (it.status==="want") it.status = "watching";
    upsert(it, L);
  }
});

/* ---------- updates ---------- */
// When a newer version is published: reload on its own when you come back to the app,
// or offer a Reload button if you're in the middle of using it.
let updateShown = false;
const SHELL_CACHE = "wl-shell";
const SHELL_FILES = ["./", "index.html", "app.js", "fb.js", "config.js", "manifest.webmanifest"];
async function refreshShell(){
  if (!("caches" in window)) return;
  try {
    const c = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_FILES.map(u => fetch(u, {cache:"no-cache"}).then(r => r.ok ? c.put(u, r) : null)));
  } catch(e){}
}
async function reloadApp(){ saveSnap(); await refreshShell(); location.reload(); }
async function checkForUpdate(fromResume){
  const cur = APP_VERSION; if (!cur || cur.startsWith("__")) return;
  let v = "";
  try { const r = await fetch("version.txt?" + Date.now(), {cache:"no-store"}); if (r.ok) v = (await r.text()).trim(); } catch(e){ return; }
  if (!v || v === cur) return;
  const busy = st.sheet || typingIn(document.body) || st.picksBusy || st.fillBusy || st.updBusy;
  const tried = lsGet("wl.reloadedFor") === v; // already reloaded once for this version: don't loop
  if (fromResume && !busy && !tried){ lsSet("wl.reloadedFor", v); reloadApp(); return; }
  if (tried) return;
  if (updateShown) return; updateShown = true;
  const t = $("toast"); clearTimeout(toastTimer);
  t.innerHTML = `New version ready <button class="btn" style="margin-left:10px;min-height:30px;padding:6px 10px" data-action="reload-app">Reload</button>`;
  t.hidden = false;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState==="visible") checkForUpdate(true); });
setInterval(() => { if (document.visibilityState==="visible") checkForUpdate(false); }, 60000);
A["reload-app"] = () => reloadApp();

/* ---------- start ---------- */
function startLocal(){
  stopAll(); st.mode = "local"; st.user = null; st.household = null; st.lists.ours = {};
  backend = localBackend(); render(true); scheduleRefresh();
}
function loadScript(src){
  return new Promise((ok, fail) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => fail(new Error("load " + src)); document.body.appendChild(el); });
}
function init(){
  if ("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")) navigator.serviceWorker.register("sw.js").catch(()=>{});
  if (!HAS_FB || lsGet("wl.local")==="1"){ startLocal(); return; }
  st.mode = "cloud";
  // 1. Show the saved view right away.
  const snap = readSnap();
  if (snap){
    st.user = snap.user; st.household = snap.household || null; st.userDoc = snap.userDoc || {};
    st.profile = {...DEF_PROFILE, ...(snap.profile||{})}; st.lists = {mine:snap.lists.mine||{}, ours:snap.lists.ours||{}};
    st.ready = true; st.authReady = true; backend = cloudBackend();
  }
  render(true);
  // 2. Then load Firebase and catch up.
  fbReady = new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)))
    .then(() => loadScript("fb.js"))
    .then(() => {
      const emu = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && lsGet("wl.emu")==="1";
      FBX = window.WLFB.start(FB_CFG, {emulator: emu}); auth = FBX.auth; fs = FBX.fs; return FBX;
    });
  fbReady.then(() => {
    if (lsGet("wl.redirect")){ lsSet("wl.redirect", null); auth.getRedirectResult().catch(e => { st.authErr = authCopy(e); render(true); }); }
    auth.onAuthStateChanged(u => {
      st.authReady = true;
      if (lsGet("wl.local")==="1") return;
      if (u) startCloud(u);
      else { stopAll(); clearSnap(); st.user = null; st.ready = false; st.mode = "cloud"; st.lists = {mine:{}, ours:{}}; st.household = null; render(true); }
    });
  }).catch(() => {
    st.authReady = true;
    if (!st.user){ st.authErr = "Couldn't load sign-in. Check your connection and reopen the app."; }
    else toast("You're offline. Changes will save when you're back online.");
    render(true);
  });
}
init();
})();
