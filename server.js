// 失落的方舟 中文統計站 — 本機伺服器
// 1) 提供 public/ 下的靜態檔案
// 2) 代理 lostark.bible 的 SvelteKit remote function / __data.json / 圖片（瀏覽器無法跨網域直接呼叫）
// 3) 保護機制：訪客限流、對上游的全域限流、相同請求合併、上游 429 時暫停並改用舊快取
//
// 執行：node server.js  （預設 http://localhost:3000）
// 環境變數見下方 ENV 區塊

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// ENV
// ---------------------------------------------------------------------------
const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const PORT = num(process.env.PORT, 3000);
const UPSTREAM = process.env.UPSTREAM || 'https://lostark.bible';
// 每個訪客 IP 每分鐘可用的請求數（0 = 不限制）
const RL_API_PER_MIN = num(process.env.RL_API_PER_MIN, 120); // 一般資料（統計、排行榜…）
const RL_LOG_PER_MIN = num(process.env.RL_LOG_PER_MIN, 10); // 戰鬥紀錄（每筆約 0.7MB）
const RL_IMAGE_PER_MIN = num(process.env.RL_IMAGE_PER_MIN, 600); // 轉送的圖片
// 對 lostark.bible 的全域限制（所有訪客共用）
const UPSTREAM_CONCURRENCY = num(process.env.UPSTREAM_CONCURRENCY, 4);
const UPSTREAM_PER_SEC = num(process.env.UPSTREAM_PER_SEC, 5);
const UPSTREAM_IMAGE_CONCURRENCY = num(process.env.UPSTREAM_IMAGE_CONCURRENCY, 8);
const UPSTREAM_IMAGE_PER_SEC = num(process.env.UPSTREAM_IMAGE_PER_SEC, 20);
const UPSTREAM_QUEUE_MAX = num(process.env.UPSTREAM_QUEUE_MAX, 200); // 排隊上限，超過直接回 503
const UPSTREAM_TIMEOUT_MS = num(process.env.UPSTREAM_TIMEOUT_MS, 30000);
// 快取
const CACHE_MS = num(process.env.CACHE_MS, 10 * 60 * 1000); // 成功回應
const ERROR_CACHE_MS = num(process.env.ERROR_CACHE_MS, 15 * 1000); // 錯誤回應（避免重新整理一直打上游）
const CACHE_MAX_ENTRIES = num(process.env.CACHE_MAX_ENTRIES, 150);

// SvelteKit remote-function 版本雜湊，網站重新部署後可能改變。
// 啟動時會嘗試從原站前端程式碼自動偵測（detectRemoteId），偵測失敗才用預設值。
let REMOTE_ID = process.env.REMOTE_ID || '1b5dc20';
const UA = 'LostArkGuide-zh/1.0 (+local proxy; https://github.com/)';
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
const DATA_PAGE_PATTERNS = [/^style-book\/(NA|CE)\/[\w-]+$/, /^logs\/[\w-]+$/];

// ---------------------------------------------------------------------------
// 1) 訪客限流（每個 IP 一個 token bucket，依類別分開計算）
// ---------------------------------------------------------------------------
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

function clientIp(req) {
  const remote = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  // 只有當連線來自內網（反向代理、Docker 閘道）時才採信 X-Forwarded-For，避免外部偽造
  if (PRIVATE_IP.test(remote)) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
  }
  return remote || 'unknown';
}

const BUCKET_LIMITS = { api: RL_API_PER_MIN, log: RL_LOG_PER_MIN, image: RL_IMAGE_PER_MIN };
const buckets = new Map(); // `${kind}:${ip}` -> {tokens, t}

// 回傳 0 表示放行；否則回傳建議等待秒數
function takeToken(kind, ip) {
  const perMin = BUCKET_LIMITS[kind];
  if (!perMin) return 0;
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const rate = perMin / 60000; // tokens per ms
  const b = buckets.get(key) || { tokens: perMin, t: now };
  b.tokens = Math.min(perMin, b.tokens + (now - b.t) * rate);
  b.t = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return 0;
  }
  buckets.set(key, b);
  return Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000));
}
// 定期清掉閒置的 IP 紀錄
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, b] of buckets) if (b.t < cutoff) buckets.delete(k);
}, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// 2) 對上游的全域限流（同時請求數 + 每秒請求數，超過的排隊）
// ---------------------------------------------------------------------------
let pausedUntil = 0; // 上游回 429 後暫停到這個時間點
let consecutive429 = 0;
const STARTED_AT = new Date().toISOString(); // 方便確認容器是否已重啟
let upstreamRequests = 0; // 實際送到上游的請求總數（/api/health 可查看）

class Limiter {
  constructor(name, concurrency, perSec) {
    this.name = name;
    this.concurrency = Math.max(1, concurrency);
    this.interval = perSec > 0 ? 1000 / perSec : 0;
    this.queue = [];
    this.active = 0;
    this.nextAt = 0;
    this.timer = null;
  }
  run(fn) {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= UPSTREAM_QUEUE_MAX) return reject(httpError(503, '伺服器忙碌中，請稍後再試。', 5));
      this.queue.push({ fn, resolve, reject });
      this.pump();
    });
  }
  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const now = Date.now();
      const wait = Math.max(this.nextAt - now, pausedUntil - now);
      if (wait > 0) {
        if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.pump(); }, wait);
        return;
      }
      this.nextAt = now + this.interval;
      const job = this.queue.shift();
      this.active++;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => { this.active--; this.pump(); });
    }
  }
}
const apiLimiter = new Limiter('api', UPSTREAM_CONCURRENCY, UPSTREAM_PER_SEC);
const imageLimiter = new Limiter('image', UPSTREAM_IMAGE_CONCURRENCY, UPSTREAM_IMAGE_PER_SEC);

function httpError(status, message, retryAfter) {
  return Object.assign(new Error(message), { status, retryAfter });
}

function pauseUpstream(retryAfterHeader) {
  consecutive429++;
  const fromHeader = Number(retryAfterHeader);
  const sec = fromHeader > 0 ? Math.min(fromHeader, 600) : Math.min(30 * 2 ** (consecutive429 - 1), 300);
  pausedUntil = Math.max(pausedUntil, Date.now() + sec * 1000);
  console.warn(`[上游] 收到 429，暫停 ${sec} 秒（連續第 ${consecutive429} 次）`);
}

// 低階：經過限流器向上游發請求
function upstreamFetch(url, headers, kind = 'api') {
  const limiter = kind === 'image' ? imageLimiter : apiLimiter;
  return limiter.run(async () => {
    upstreamRequests++;
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json, text/html;q=0.9, */*;q=0.8', ...headers },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body, type: res.headers.get('content-type') || 'application/octet-stream', retryAfter: res.headers.get('retry-after') };
  });
}

// ---------------------------------------------------------------------------
// 3) 快取 + 合併相同請求  4) 上游 429 時暫停、改用舊快取
// ---------------------------------------------------------------------------
const cache = new Map(); // url -> {t, ok, body, status, type}
const inflight = new Map(); // url -> Promise<entry>

// SvelteKit remote function 失敗時仍回 200，但內容是 {"type":"error",...}
const isSvelteError = (e) => e.type.includes('json') && e.body.length < 2000 && /^\s*\{"type":"error"/.test(e.body.toString('utf8', 0, 40));

function storeCache(url, entry) {
  cache.delete(url); // 重新插入到最後（近似 LRU）
  cache.set(url, entry);
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchCached(url, headers, kind = 'api') {
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && now - hit.t < (hit.ok ? CACHE_MS : ERROR_CACHE_MS)) return { ...hit, cacheState: 'HIT' };
  const stale = hit && hit.ok ? { ...hit, cacheState: 'STALE' } : null;
  if (now < pausedUntil) {
    if (stale) return stale;
    throw httpError(503, `原網站暫時限制請求，請 ${Math.ceil((pausedUntil - now) / 1000)} 秒後再試。`, Math.ceil((pausedUntil - now) / 1000));
  }
  if (inflight.has(url)) return inflight.get(url);
  const p = upstreamFetch(url, headers, kind)
    .then((r) => {
      if (r.status === 429) {
        pauseUpstream(r.retryAfter);
        if (stale) return stale;
        const wait = Math.ceil((pausedUntil - Date.now()) / 1000);
        throw httpError(503, `原網站暫時限制請求，請 ${wait} 秒後再試。`, wait);
      }
      const ok = r.status >= 200 && r.status < 300 && !isSvelteError(r);
      if (ok) consecutive429 = 0;
      if (!ok && r.status >= 500 && stale) return stale; // 上游壞掉時先給舊資料
      const entry = { t: Date.now(), ok, body: r.body, status: r.status, type: r.type };
      storeCache(url, entry);
      return { ...entry, cacheState: 'MISS' };
    })
    .catch((e) => {
      if (e && e.status) throw e;
      if (stale) return stale; // 逾時或連線失敗時先給舊資料
      throw httpError(502, `無法連線到原網站：${(e && e.message) || e}`);
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

// ---------------------------------------------------------------------------
// 回應工具
// ---------------------------------------------------------------------------
function send(res, status, body, type, extra) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...(extra || {}) });
  res.end(body);
}
function sendJson(res, status, obj, extra) {
  send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
}
// 錯誤一律用 SvelteKit 相同格式，前端可直接顯示 message
function sendError(res, status, message, retryAfter) {
  sendJson(res, status, { type: 'error', error: { message }, status }, retryAfter ? { 'retry-after': String(retryAfter) } : undefined);
}

// 從 /stats/class 的 SSR HTML 取出 arkGridLoadoutCombinations（伺服端渲染時就內嵌在頁面裡）
function extractCombinations(html) {
  const key = 'arkGridLoadoutCombinations:';
  const i = html.indexOf(key);
  if (i < 0) return null;
  const j = i + key.length;
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
  literal = literal.replace(/([{,])([A-Za-z_$][\w$]*):/g, '$1"$2":'); // JS 物件字面值 -> JSON
  try {
    return JSON.parse(literal);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API 路由
// ---------------------------------------------------------------------------
function rateKind(parts) {
  if (parts[1] === 'health') return null;
  if (parts[1] === 'data' && parts[2] === 'logs') return 'log';
  if (parts[1] === 'image') return 'image';
  return 'api';
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const kind = rateKind(parts);
  if (kind) {
    const wait = takeToken(kind, clientIp(req));
    if (wait) {
      const msg = kind === 'log' ? `短時間內查看太多戰鬥紀錄，請 ${wait} 秒後再試。` : `請求太頻繁，請 ${wait} 秒後再試。`;
      return sendError(res, 429, msg, wait);
    }
  }
  try {
    if (parts[1] === 'remote' && parts[2]) {
      const fn = parts[2];
      if (!REMOTE_FUNCTIONS[fn]) return sendError(res, 404, 'unknown remote function');
      const payload = url.searchParams.get('payload');
      if (!payload) return sendError(res, 400, 'payload required');
      const search = url.searchParams.get('search') || '';
      const pathname = url.searchParams.get('pathname') || '/stats/class';
      const target = `${UPSTREAM}/_app/remote/${REMOTE_FUNCTIONS[fn]}/${fn}?payload=${encodeURIComponent(payload)}`;
      const r = await fetchCached(target, {
        'x-sveltekit-pathname': pathname,
        'x-sveltekit-search': search,
        referer: `${UPSTREAM}${pathname}${search}`,
      });
      return send(res, r.status, r.body, r.type.includes('json') ? 'application/json; charset=utf-8' : r.type, { 'x-cache': r.cacheState });
    }
    if (parts[1] === 'data') {
      // /api/data/stats/generic -> UPSTREAM/stats/generic/__data.json
      const page = parts.slice(2).join('/');
      if (!ALLOWED_DATA_PAGES.has(page) && !DATA_PAGE_PATTERNS.some((re) => re.test(page))) return sendError(res, 404, 'unknown page');
      const r = await fetchCached(`${UPSTREAM}/${page ? page + '/' : ''}__data.json`, { accept: 'application/json' });
      return send(res, r.status, r.body, 'application/json; charset=utf-8', { 'x-cache': r.cacheState });
    }
    if (parts[1] === 'image') {
      // 轉送原站圖片（/i/... 與 /api/style-book/image/...）
      const rest = url.pathname.slice('/api/image/'.length);
      if (!/^(i\/|api\/style-book\/image\/|api\/og\/)[\w\-./@=%]+$/.test(rest)) return sendError(res, 400, 'bad image path');
      const r = await fetchCached(`${UPSTREAM}/${rest}`, { accept: 'image/*' }, 'image');
      res.writeHead(r.status, { 'content-type': r.type, 'cache-control': 'public, max-age=86400', 'x-cache': r.cacheState });
      return res.end(r.body);
    }
    if (parts[1] === 'combinations') {
      const r = await fetchCached(`${UPSTREAM}/stats/class`, { accept: 'text/html' });
      const combos = extractCombinations(r.body.toString('utf8'));
      if (!combos) return sendError(res, 502, 'could not extract combinations from upstream page');
      return sendJson(res, 200, combos, { 'x-cache': r.cacheState });
    }
    if (parts[1] === 'health') {
      return sendJson(res, 200, {
        ok: true,
        startedAt: STARTED_AT,
        upstream: UPSTREAM,
        remoteId: REMOTE_ID,
        cacheEntries: cache.size,
        inflight: inflight.size,
        queued: apiLimiter.queue.length + imageLimiter.queue.length,
        upstreamRequests,
        upstreamPausedSec: Math.max(0, Math.ceil((pausedUntil - Date.now()) / 1000)),
      });
    }
    return sendError(res, 404, 'not found');
  } catch (e) {
    const status = (e && e.status) || 502;
    return sendError(res, status, String((e && e.message) || e), e && e.retryAfter);
  }
}

// ---------------------------------------------------------------------------
// 靜態檔
// ---------------------------------------------------------------------------
function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'bad request', 'text/plain'); }
  if (p === '/' || p.startsWith('/stats') || p.startsWith('/leaderboards') || p.startsWith('/style-book') || p.startsWith('/logs')) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // 程式與資料檔用 no-cache（瀏覽器仍會驗證），只有圖片長期快取；避免改版後瀏覽器用到舊的 JS
    const longCache = /\.(png|svg|ico|woff2)$/i.test(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': longCache ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// 啟動時偵測原站 remote function 版本雜湊（同樣經過上游限流）
// ---------------------------------------------------------------------------
async function upstreamText(url, accept) {
  const r = await upstreamFetch(url, accept ? { accept } : {});
  if (r.status === 429) { pauseUpstream(r.retryAfter); throw new Error('upstream 429'); }
  return r.body.toString('utf8');
}

async function detectRemoteId() {
  try {
    const html = await upstreamText(`${UPSTREAM}/stats/class`, 'text/html');
    const appMatch = html.match(/\.\.\/_app\/immutable\/entry\/(app\.[A-Za-z0-9_-]+\.js)/);
    if (!appMatch) return;
    const appJs = await upstreamText(`${UPSTREAM}/_app/immutable/entry/${appMatch[1]}`);
    const dict = appJs.match(/"\/stats\/class":\[(-?\d+)/);
    if (!dict) return;
    let leaf = Number(dict[1]);
    if (leaf < 0) leaf = ~leaf; // 負數代表有 server load，實際 node 編號為 ~leaf
    const nodeMatch = appJs.match(new RegExp(`\\.\\./nodes/${leaf}\\.([A-Za-z0-9_-]+)\\.js`));
    if (!nodeMatch) return;
    const nodeJs = await upstreamText(`${UPSTREAM}/_app/immutable/nodes/${leaf}.${nodeMatch[1]}.js`);
    const id = nodeJs.match(/`([0-9a-f]+)\/statsSkills`/);
    if (id && id[1] !== REMOTE_ID) {
      console.log(`偵測到新的 remote id: ${id[1]}（原為 ${REMOTE_ID}）`);
      REMOTE_ID = id[1];
    } else if (id) {
      console.log(`remote id 確認: ${REMOTE_ID}`);
    }
    // 其他頁面的 remote function 雜湊：掃描 nodes 模組中的 `hash/fnName`
    const nodeFiles = [...new Set([...appJs.matchAll(/\.\.\/nodes\/(\d+\.[A-Za-z0-9_-]+)\.js/g)].map((m) => m[1]))];
    const wanted = new Set(Object.keys(REMOTE_FUNCTIONS));
    const found = new Set();
    for (const nf of nodeFiles) {
      if (found.size >= wanted.size) break;
      let js;
      try { js = await upstreamText(`${UPSTREAM}/_app/immutable/nodes/${nf}.js`); } catch { continue; }
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

http
  .createServer((req, res) => {
    let url;
    try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { return send(res, 400, 'bad request', 'text/plain'); }
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    return serveStatic(req, res, url);
  })
  .listen(PORT, () => {
    console.log(`失落的方舟 中文統計站: http://localhost:${PORT}/`);
    console.log(`上游: ${UPSTREAM}  remote id: ${REMOTE_ID}`);
    console.log(`限流：訪客 一般 ${RL_API_PER_MIN}/分、戰鬥紀錄 ${RL_LOG_PER_MIN}/分、圖片 ${RL_IMAGE_PER_MIN}/分；上游 同時 ${UPSTREAM_CONCURRENCY}、每秒 ${UPSTREAM_PER_SEC}`);
    detectRemoteId();
  });
