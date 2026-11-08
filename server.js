// 失落的方舟 中文統計站 — 本機伺服器
// 1) 提供 public/ 下的靜態檔案
// 2) 代理 lostark.bible 的 SvelteKit remote function API（瀏覽器無法跨網域直接呼叫）
//
// 執行：node server.js  （預設 http://localhost:3000）
// 環境變數：PORT、UPSTREAM（預設 https://lostark.bible）、REMOTE_ID（預設 1b5dc20）

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM = process.env.UPSTREAM || 'https://lostark.bible';
// SvelteKit remote-function 版本雜湊，網站重新部署後可能改變。
// 啟動時會嘗試從原站前端程式碼自動偵測（detectRemoteId），偵測失敗才用這個預設值。
let REMOTE_ID = process.env.REMOTE_ID || '1b5dc20';

async function detectRemoteId() {
  try {
    const html = await (await fetch(`${UPSTREAM}/stats/class`, { headers: { 'user-agent': UA, accept: 'text/html' } })).text();
    const appMatch = html.match(/\.\.\/_app\/immutable\/entry\/(app\.[A-Za-z0-9_-]+\.js)/);
    if (!appMatch) return;
    const appJs = await (await fetch(`${UPSTREAM}/_app/immutable/entry/${appMatch[1]}`, { headers: { 'user-agent': UA } })).text();
    const dict = appJs.match(/"\/stats\/class":\[(-?\d+)/);
    if (!dict) return;
    let leaf = Number(dict[1]);
    if (leaf < 0) leaf = ~leaf; // 負數代表有 server load，實際 node 編號為 ~leaf
    const nodeMatch = appJs.match(new RegExp(`\\.\\./nodes/${leaf}\\.([A-Za-z0-9_-]+)\\.js`));
    if (!nodeMatch) return;
    const nodeJs = await (await fetch(`${UPSTREAM}/_app/immutable/nodes/${leaf}.${nodeMatch[1]}.js`, { headers: { 'user-agent': UA } })).text();
    const id = nodeJs.match(/`([0-9a-f]+)\/statsSkills`/);
    if (id && id[1] !== REMOTE_ID) {
      console.log(`偵測到新的 remote id: ${id[1]}（原為 ${REMOTE_ID}）`);
      REMOTE_ID = id[1];
    } else if (id) {
      console.log(`remote id 確認: ${REMOTE_ID}`);
    }
    // 其他頁面的 remote function 雜湊：掃描所有 nodes 模組中的 `hash/fnName`
    const nodeFiles = [...new Set([...appJs.matchAll(/\.\.\/nodes\/(\d+\.[A-Za-z0-9_-]+)\.js/g)].map((m) => m[1]))];
    const wanted = new Set(Object.keys(REMOTE_FUNCTIONS));
    const found = new Set();
    for (const nf of nodeFiles) {
      if (found.size >= wanted.size) break;
      let js;
      try { js = await (await fetch(`${UPSTREAM}/_app/immutable/nodes/${nf}.js`, { headers: { 'user-agent': UA } })).text(); } catch { continue; }
      for (const m of js.matchAll(/`([0-9a-z]+)\/([A-Za-z]+)`/g)) {
        if (wanted.has(m[2])) {
          if (REMOTE_FUNCTIONS[m[2]] !== m[1]) console.log(`remote id 更新 ${m[2]}: ${REMOTE_FUNCTIONS[m[2]]} -> ${m[1]}`);
          REMOTE_FUNCTIONS[m[2]] = m[1];
          found.add(m[2]);
        }
      }
    }
  } catch (e) {
    console.warn('無法自動偵測 remote id，沿用預設值:', e.message);
  }
}
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// 允許轉送的 remote function：函式名 -> 其所屬的版本雜湊（預設值；啟動時會自動偵測更新）
const REMOTE_FUNCTIONS = {
  statsSkills: '1b5dc20',
  statsEngraving: '1b5dc20',
  statsArkGridCore: '1b5dc20',
  statsArkGridCombinations: '1b5dc20',
  arkPassiveStats: '1sps3x4',
  arkPassiveTopLoadouts: '1sps3x4',
  combatPowerDPSSearch: '1ranzqj',
  raidClearRatesSearch: '1ranzqj',
  raidSamplesSearch: '1ranzqj',
  raidStatsSearch: '1ranzqj',
  leaderboardsSearch: '36qgt6',
  styleBookData: '1spkw1n',
};
// 允許以 __data.json 方式轉送的頁面（server load 資料）
const ALLOWED_DATA_PAGES = new Set(['stats/generic', 'stats/combat-power', 'stats/ark-passive', 'stats/class', '']);
const DATA_PAGE_PATTERNS = [/^style-book\/(NA|CE)\/[\w-]+$/];

const UA = 'LostArkGuide-zh/1.0 (+local proxy; https://github.com/)';
const cache = new Map(); // url -> {t, body, status, type}
const CACHE_MS = 10 * 60 * 1000;

async function fetchCached(url, headers) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit;
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json, text/html;q=0.9, */*;q=0.8', ...headers } });
  const body = Buffer.from(await res.arrayBuffer());
  const entry = { t: Date.now(), body, status: res.status, type: res.headers.get('content-type') || 'application/octet-stream' };
  if (res.ok) cache.set(url, entry);
  return entry;
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
}

// 從 /stats/class 的 SSR HTML 取出 arkGridLoadoutCombinations（伺服端渲染時就內嵌在頁面裡）
function extractCombinations(html) {
  const key = 'arkGridLoadoutCombinations:';
  const i = html.indexOf(key);
  if (i < 0) return null;
  let j = i + key.length;
  let depth = 0;
  let k = j;
  for (; k < html.length; k++) {
    const ch = html[k];
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  let literal = html.slice(j, k + 1);
  // JS 物件字面值 -> JSON：幫未加引號的 key 加引號
  literal = literal.replace(/([{,])([A-Za-z_$][\w$]*):/g, '$1"$2":');
  try {
    return JSON.parse(literal);
  } catch (e) {
    return null;
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  try {
    if (parts[1] === 'remote' && parts[2]) {
      const fn = parts[2];
      if (!REMOTE_FUNCTIONS[fn]) return sendJson(res, 404, { error: 'unknown remote function' });
      const payload = url.searchParams.get('payload');
      if (!payload) return sendJson(res, 400, { error: 'payload required' });
      const search = url.searchParams.get('search') || '';
      const pathname = url.searchParams.get('pathname') || '/stats/class';
      const target = `${UPSTREAM}/_app/remote/${REMOTE_FUNCTIONS[fn]}/${fn}?payload=${encodeURIComponent(payload)}`;
      const r = await fetchCached(target, {
        'x-sveltekit-pathname': pathname,
        'x-sveltekit-search': search,
        referer: `${UPSTREAM}${pathname}${search}`,
      });
      return send(res, r.status, r.body, r.type.includes('json') ? 'application/json; charset=utf-8' : r.type);
    }
    if (parts[1] === 'data') {
      // /api/data/stats/generic -> UPSTREAM/stats/generic/__data.json
      const page = parts.slice(2).join('/');
      if (!ALLOWED_DATA_PAGES.has(page) && !DATA_PAGE_PATTERNS.some((re) => re.test(page))) return sendJson(res, 404, { error: 'unknown page' });
      const r = await fetchCached(`${UPSTREAM}/${page ? page + '/' : ''}__data.json`, { accept: 'application/json' });
      return send(res, r.status, r.body, 'application/json; charset=utf-8');
    }
    if (parts[1] === 'image') {
      // 轉送原站圖片（/i/... 與 /api/style-book/image/...）
      const rest = url.pathname.slice('/api/image/'.length);
      if (!/^(i\/|api\/style-book\/image\/|api\/og\/)[\w\-./@=%]+$/.test(rest)) return sendJson(res, 400, { error: 'bad image path' });
      const r = await fetchCached(`${UPSTREAM}/${rest}`, { accept: 'image/*' });
      res.writeHead(r.status, { 'content-type': r.type, 'cache-control': 'public, max-age=86400' });
      return res.end(r.body);
    }
    if (parts[1] === 'combinations') {
      const r = await fetchCached(`${UPSTREAM}/stats/class`, { accept: 'text/html' });
      const combos = extractCombinations(r.body.toString('utf8'));
      if (!combos) return sendJson(res, 502, { error: 'could not extract combinations from upstream page' });
      return sendJson(res, 200, combos);
    }
    if (parts[1] === 'health') {
      return sendJson(res, 200, { ok: true, upstream: UPSTREAM, remoteId: REMOTE_ID });
    }
    return sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    return sendJson(res, 502, { error: String(e && e.message || e) });
  }
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p.startsWith('/stats') || p.startsWith('/leaderboards') || p.startsWith('/style-book')) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // 程式與資料檔用 no-cache（瀏覽器仍會以 ETag/時間驗證），只有圖片長期快取；避免改版後瀏覽器用到舊的 JS
    const longCache = /\.(png|svg|ico|woff2)$/i.test(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': longCache ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    return serveStatic(req, res, url);
  })
  .listen(PORT, () => {
    console.log(`失落的方舟 中文統計站: http://localhost:${PORT}/stats/class`);
    console.log(`上游: ${UPSTREAM}  remote id: ${REMOTE_ID}`);
    detectRemoteId();
  });
