/* 共用工具：DOM、i18n、資料載入、API、常用元件 */
export const CDN = 'https://cdn.ags.lol';
export const ORIGIN = 'https://lostark.bible';

export const $ = (sel, root) => (root || document).querySelector(sel);
export const h = (tag, attrs, ...children) => {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
};
export const fmt = (n) => Number(n).toLocaleString('zh-Hant-TW');
export const clamp01 = (e) => (e < 0 ? 0 : e > 1 ? 1 : e);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtNum = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
// 1234567 -> 1.23M（對應原站 formatNumber）
export function shortNum(e, t = 1) {
  const n = e >= 1e9 ? Math.max(t, 2) : t;
  const o = { minimumFractionDigits: n, maximumFractionDigits: n };
  if (e >= 1e3 && e < 1e6) return (e / 1e3).toLocaleString('en', o) + 'K';
  if (e >= 1e6 && e < 1e9) return (e / 1e6).toLocaleString('en', o) + 'M';
  if (e >= 1e9 && e < 1e12) return (e / 1e9).toLocaleString('en', o) + 'B';
  if (e >= 1e12) return (e / 1e12).toLocaleString('en', o) + 'T';
  return e.toFixed(0);
}
export function fmtDuration(ms, withUnits = false) {
  const m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return withUnits ? `${m}分${String(s).padStart(2, '0')}秒` : `${m}:${String(s).padStart(2, '0')}`;
}
export function relTime(ts) {
  const diff = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const units = [[60, '秒'], [3600, '分鐘'], [86400, '小時'], [604800, '天'], [2592e3, '週'], [31536e3, '個月'], [Infinity, '年']];
  let i = units.findIndex(([s]) => s > abs);
  const div = i === 0 ? 1 : units[i - 1][0];
  const n = Math.floor(abs / div);
  if (n === 0 && i === 0) return '剛剛';
  return diff < 0 ? `${n} ${units[i][1]}前` : `${n} ${units[i][1]}後`;
}
export const imgUrl = (u) => (u && u.startsWith('/') ? `/api/image${u.startsWith('/api/') ? u.slice(4) : u}` : u);

// ---------- 顏色漸層 ----------
export function gradient(...stops) {
  const rgb = stops.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  return {
    rgbAt(t) {
      t = clamp01(t);
      const pos = t * (rgb.length - 1);
      const i = Math.min(Math.floor(pos), rgb.length - 2);
      const f = pos - i;
      const c = rgb[i].map((v, k) => Math.round(v + (rgb[i + 1][k] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    },
    hexAt(t) {
      const m = this.rgbAt(t).match(/\d+/g).map(Number);
      return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
    },
  };
}
export const gradPink = gradient('#FF85A9', '#ECBB09', '#2DC88F');
export const gradBlue = gradient('#FF85A9', '#5794F2', '#2DC88F');
export const gradPop = gradient('#FF85A9', '#5794F2', '#2DC88F', '#2DC88F', '#2DC88F', '#2DC88F');

// ---------- 資料與翻譯 ----------
export const D = {};
export let ZH = { ui: {} };
const UI = {
  site_title: '失落的方舟 中文統計',
  nav_stats: '統計', nav_leaderboards: '排行榜', nav_stylebook: '造型書', view_original: '英文原站',
  statistics: '統計', filters: '篩選', loading: '載入中…', load_error: '資料載入失敗：{msg}', not_enough: '資料不足。',
  tab_general: '綜合統計', tab_raids: '團本表現', tab_class: '職業配置', tab_arkpassive: '方舟被動', tab_combatpower: '戰鬥力',
  class: '職業', class_engraving: '職業刻印', ark_grid_cores: '方舟星圖核心', item_level: '裝備等級', search: '搜尋…',
  all_order_combos: '所有秩序核心組合', popularity: '使用率', others: '其他',
  order: '秩序', chaos: '混沌', sun: '日', moon: '月', star: '星', core: '核心', first: '一', second: '二',
  support: '輔助', dps: '輸出', all_dps: '所有輸出職業', all_supports: '所有輔助職業',
  footer: '資料來源：lostark.bible（Discord 社群統計）。本站為非官方中文介面，遊戲名詞取自台灣《失落的方舟》／中國《命運方舟》官方資料與中文社群慣用譯名。',
  last_updated: '最後更新 {t}',
  powered_by: '資料由 {x} 提供。資料為玩家自行上傳，可能無法代表整體玩家群。',
  page: '第 {p} 頁，共 {n} 頁',
  combat_log: '戰鬥紀錄',
};
export function addUi(obj) { Object.assign(UI, obj); }
export function T(key, vars) {
  let s = ZH.ui && ZH.ui[key] !== undefined ? ZH.ui[key] : UI[key] !== undefined ? UI[key] : key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}
// 名詞翻譯：section 內先找職業專屬（classNum）→ 通用 `_` → 原文
export function tr(section, en, classNum) {
  if (!en) return en;
  const sec = ZH[section];
  if (!sec) return en;
  if (classNum !== undefined && sec[classNum] && sec[classNum][en]) return sec[classNum][en];
  if (typeof sec[en] === 'string') return sec[en];
  if (sec._ && sec._[en]) return sec._[en];
  return en;
}
// 以遊戲內 ID 翻譯（優先），找不到再用英文名稱
export function trId(section, id, en, classNum) {
  const byId = ZH[section + '_by_id'];
  if (byId && byId[id]) return byId[id];
  return tr(section, en, classNum);
}
export const className = (id) => {
  const c = D.classes.find((x) => x.id === id || x.en === id || String(x.num) === String(id));
  return c ? tr('classes', c.en) : tr('classes', id);
};
export const classByEn = (en) => D.classes.find((c) => c.en === en);
export const coreTypeLabel = (order, type) => `${order === 0 ? T('order') : T('chaos')}${[T('sun'), T('moon'), T('star')][type] || ''}${T('core')}`;
export function coreName(instanceName, classNum, instanceId) {
  if (instanceId !== undefined && ZH.cores_by_id && ZH.cores_by_id[instanceId]) {
    const z = ZH.cores_by_id[instanceId];
    const i = z.indexOf('：');
    return i >= 0 ? z.slice(i + 1) : z;
  }
  const idx = instanceName.indexOf(': ');
  const base = idx >= 0 ? instanceName.slice(idx + 2) : instanceName;
  return tr('cores', base, classNum);
}
export function coreTypeFromName(instanceName) {
  const t = instanceName.split(':')[0];
  const order = /Chaos/i.test(t) ? 1 : 0;
  const type = /Moon/i.test(t) ? 1 : /Star/i.test(t) ? 2 : 0;
  return coreTypeLabel(order, type);
}
export const specName = (spec) => tr('class_engravings', spec);
export const diffName = (d) => tr('difficulties', d);
export const bossName = (b) => tr('bosses', b);
export const raidName = (r) => (r && r.startsWith('Extreme ') ? `極限 ${tr('raids', r.slice(8))}` : tr('raids', r));

export async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}
let baseLoaded;
export function loadBase() {
  if (baseLoaded) return baseLoaded;
  baseLoaded = (async () => {
    const [classes, colors, classIcons, zh] = await Promise.all([
      loadJson('/data/classes.json'), loadJson('/data/colors.json'), loadJson('/data/class_icons.json'),
      loadJson('/data/zh.json').catch(() => ({ ui: {} })),
    ]);
    Object.assign(D, { classes, colors, classIcons });
    ZH = zh || { ui: {} };
  })();
  return baseLoaded;
}
const extra = {};
export function loadExtra(name) {
  if (!extra[name]) extra[name] = loadJson(`/data/${name}.json`).then((j) => (D[name] = j));
  return extra[name];
}

// ---------- API ----------
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const apiCache = new Map();
export async function remote(fn, arg, pathname) {
  const payload = b64url(devalue.stringify(arg));
  const key = fn + payload;
  if (apiCache.has(key)) return apiCache.get(key);
  const p = (async () => {
    const r = await fetch(`/api/remote/${fn}?payload=${encodeURIComponent(payload)}&pathname=${encodeURIComponent(pathname || location.pathname)}&search=${encodeURIComponent(location.search)}`);
    const j = await r.json();
    if (j.type === 'error' || j.error) throw new Error((j.error && (j.error.message || j.error)) || 'remote error');
    if (j.data !== undefined) {
      const data = typeof j.data === 'string' ? devalue.parse(j.data) : devalue.unflatten(j.data);
      if (data && typeof data === 'object' && '_' in data) return data._;
      return data;
    }
    return j;
  })();
  apiCache.set(key, p);
  p.catch(() => apiCache.delete(key));
  return p;
}
// 頁面的 server-load 資料（__data.json）
export async function pageData(page) {
  const key = 'data:' + page;
  if (apiCache.has(key)) return apiCache.get(key);
  const p = (async () => {
    const j = await loadJson(`/api/data/${page}`);
    if (j.type !== 'data' || !Array.isArray(j.nodes)) throw new Error('bad __data.json');
    const node = j.nodes.filter(Boolean).pop();
    return devalue.unflatten(node.data);
  })();
  apiCache.set(key, p);
  p.catch(() => apiCache.delete(key));
  return p;
}

// ---------- echarts ----------
let echartsP;
export function ensureEcharts() {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (!echartsP) echartsP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/echarts.min.js'; // 本機提供（ECharts 5.5.1，Apache-2.0）
    s.onload = () => res(window.echarts);
    s.onerror = () => rej(new Error('echarts 載入失敗'));
    document.head.append(s);
  });
  return echartsP;
}
export const ECH_BASE = { textStyle: { fontFamily: 'ui-sans-serif, system-ui, "Noto Sans TC", "Microsoft JhengHei", sans-serif' }, grid: { left: '5%', right: '3%', bottom: '2%', top: '2%', containLabel: true } };
export async function mountChart(el, option) {
  const ec = await ensureEcharts();
  if (el.__chart) el.__chart.dispose();
  const inst = ec.init(el, null, { renderer: 'svg' });
  inst.setOption(option, { notMerge: true });
  el.__chart = inst;
  const ro = new ResizeObserver(() => inst.resize({ animation: { duration: 300 } }));
  ro.observe(el);
  return inst;
}

// ---------- 小元件 ----------
export function attachTooltip(el, render) {
  const tip = $('#tooltip');
  const show = (ev) => {
    tip.innerHTML = '';
    const content = render();
    if (!content) return;
    tip.append(content instanceof Node ? content : document.createTextNode(content));
    tip.hidden = false;
    move(ev);
  };
  const move = (ev) => {
    const pad = 12;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = Math.max(4, x) + 'px';
    tip.style.top = Math.max(4, y) + 'px';
  };
  el.addEventListener('mouseenter', show);
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseleave', () => (tip.hidden = true));
}
export const card = (...children) => h('div', { class: 'rounded-md bg-surface-900 shadow-sm shadow-neutral-800' }, ...children);
export const sectionHeader = (title, extra) => h('div', { class: 'flex flex-row items-center bg-black/10 px-3 py-2 font-bold' }, h('span', null, title), h('div', { class: 'flex-1' }), extra || null);
export const notEnough = () => h('div', { class: 'flex flex-row px-2 py-1' }, h('span', { class: 'text-neutral-600 italic' }, T('not_enough')));
export const loadingEl = (hgt) => h('div', { class: 'w-full animate-pulse rounded-sm bg-surface-900 p-2 text-sm text-neutral-500', style: hgt ? `height:${hgt}px` : '' }, T('loading'));
export const errorEl = (e) => h('div', { class: 'flex flex-col gap-1 px-3 py-2 text-sm text-rose-300' }, h('span', null, T('load_error', { msg: e && e.message || e })), h('span', { class: 'text-xs text-neutral-500' }, '請確認 server.js 已啟動，且 lostark.bible 可連線。'));
export const infoIcon = (text) => {
  const el = h('span', { class: 'ml-2 inline-grid size-5 cursor-help place-items-center rounded-full border border-neutral-500 text-xs text-neutral-400' }, 'i');
  attachTooltip(el, () => h('p', { class: 'max-w-[360px] px-2 py-1 text-left text-sm' }, text));
  return el;
};
export function toggleBtn(label, active, onclick, tooltip, disabled) {
  const b = h('button', { type: 'button', disabled, class: `rounded-sm border border-neutral-600 px-2 py-1 whitespace-nowrap text-white transition focus:outline-none ${active ? 'bg-neutral-700' : 'bg-transparent hover:bg-neutral-700/60'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}` }, label);
  b.addEventListener('click', onclick);
  if (tooltip) attachTooltip(b, () => h('p', { class: 'max-w-[360px] px-2 py-1 text-sm' }, tooltip));
  return b;
}
export function barList(rows, { getWidth, key, value, icon, cls, barExtra }) {
  const wrap = h('div', { class: `flex flex-col divide-y divide-neutral-950 ${cls || ''}` });
  for (const row of rows) {
    const [k, v] = row;
    const w = getWidth(v, row) * 100;
    wrap.append(
      h('div', { class: 'flex flex-row px-2 py-1' },
        icon ? h('div', { class: 'flex items-center' }, icon(k, row)) : null,
        h('div', { class: 'flex flex-1 flex-col' },
          h('div', { class: 'mt-1 flex flex-row items-center justify-between' },
            h('div', { class: 'font-semibold' }, key(k, row)),
            h('div', { class: 'ml-2' }, value(v, row))),
          h('div', { class: 'relative mt-1 mb-2 h-2 w-full rounded-sm bg-surface-800' },
            h('div', { class: 'h-2 rounded-sm bg-blue-300 transition-[width]', style: `width:${Math.min(100, w)}%` }),
            barExtra ? barExtra(k, row) : null))));
  }
  return wrap;
}
export function classIconEl(classId, cls) {
  const c = D.classes.find((x) => x.id === classId) || classByEn(classId);
  const svg = D.classIcons[classId] || (c && D.classIcons[c.id]);
  const el = h('span', { class: `inline-flex shrink-0 items-center justify-center ${cls || ''}` });
  if (svg) el.innerHTML = svg;
  else if (c) el.append(h('img', { class: 'h-6 w-6 rounded-sm', alt: c.en, src: `${CDN}/icon/${c.engravings[0].icon}.png` }));
  else el.textContent = '◆';
  const s = el.querySelector('svg'); if (s) { s.style.height = '1.5rem'; s.style.width = '1.5rem'; }
  return el;
}
export function closePopovers() { document.querySelectorAll('.popover').forEach((p) => p.remove()); }
document.addEventListener('click', closePopovers);

// 可搜尋的職業選單
export function classPicker(anchor, currentId, onPick) {
  closePopovers();
  const pop = h('div', { class: 'popover absolute left-2 right-2 top-full z-20 flex max-h-[400px] flex-col rounded-lg bg-neutral-800 p-2 shadow-lg fade-in', onclick: (e) => e.stopPropagation() });
  const input = h('input', { class: 'input w-full', placeholder: T('search') });
  const list = h('div', { class: 'mt-2 flex flex-1 flex-col gap-2 overflow-y-scroll thin-scroll' });
  let idx = 0;
  let buttons = [];
  const items = () => {
    const q = input.value.trim().toLowerCase();
    return D.classes.filter((c) => !q || tr('classes', c.en).toLowerCase().includes(q) || c.en.toLowerCase().startsWith(q) || c.id.startsWith(q));
  };
  // 只切換高亮，不重繪清單（重繪會把捲動位置重置）
  const highlight = (scroll) => {
    buttons.forEach((b, i) => { b.classList.toggle('border-accent-900', i === idx); b.classList.toggle('border-transparent', i !== idx); });
    if (scroll && buttons[idx]) buttons[idx].scrollIntoView({ block: 'nearest' });
  };
  const render = () => {
    list.innerHTML = '';
    buttons = items().map((c, i) => {
      const b = h('button', { type: 'button', class: 'mr-1 flex h-11 shrink-0 flex-row items-center rounded-md border border-transparent bg-neutral-900 p-2 text-left' },
        classIconEl(c.id, 'size-6 pr-2'), h('span', { class: 'text-white' }, tr('classes', c.en)), h('span', { class: 'ml-2 text-xs text-neutral-500' }, c.en));
      b.addEventListener('click', () => { closePopovers(); onPick(c); });
      b.addEventListener('mouseenter', () => { idx = i; highlight(false); });
      list.append(b);
      return b;
    });
    highlight(false);
  };
  input.addEventListener('input', () => { idx = 0; render(); });
  input.addEventListener('keydown', (e) => {
    const it = items();
    if (e.key === 'Enter' && it[idx]) { closePopovers(); onPick(it[idx]); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, it.length - 1); highlight(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); highlight(true); }
    else if (e.key === 'Escape') closePopovers();
  });
  pop.append(input, list);
  anchor.append(pop);
  render();
  input.focus();
}
export function classButton(box, classId, onPick) {
  const cls = D.classes.find((c) => c.id === classId);
  const btn = h('button', { type: 'button', class: 'm-2 box-border flex flex-1 flex-row items-center rounded-sm border border-neutral-600 p-2 text-white transition hover:bg-neutral-800 focus:outline-none' },
    classIconEl(cls.id, 'size-6 pr-2'), h('span', null, tr('classes', cls.en)));
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); classPicker(box, classId, onPick); });
  return btn;
}

// 雙滑桿
export function dualRange({ min, max, step, lo, hi, label, onCommit }) {
  const loI = h('input', { type: 'range', min, max, step, value: Math.max(min, lo) });
  const hiI = h('input', { type: 'range', min, max, step, value: Math.min(max, hi) });
  const fill = h('div', { class: 'fill' });
  const lab = h('span', { class: 'my-1 text-sm' });
  const n = Math.round((max - min) / step) + 1;
  const ticks = h('div', { class: 'absolute left-0 right-0 top-[10px] flex justify-between px-[8px] pointer-events-none' }, ...Array.from({ length: Math.min(n, 60) }, () => h('span', { class: 'size-[3px] rounded-full bg-white/50 translate-y-[1px]' })));
  const wrap = h('div', { class: 'range-wrap mx-2 my-3' }, h('div', { class: 'track' }), ticks, fill, loI, hiI);
  const sync = (which) => {
    let a = Number(loI.value), b = Number(hiI.value);
    if (a > b) { if (which === 'lo') { b = a; hiI.value = b; } else { a = b; loI.value = a; } }
    const pct = (v) => ((v - min) / (max - min)) * 100;
    fill.style.left = pct(a) + '%';
    fill.style.width = pct(b) - pct(a) + '%';
    lab.textContent = label(a, b);
    return [a, b];
  };
  sync();
  loI.addEventListener('input', () => sync('lo'));
  hiI.addEventListener('input', () => sync('hi'));
  const commit = () => { const [a, b] = sync(); onCommit(a, b); };
  loI.addEventListener('change', commit);
  hiI.addEventListener('change', commit);
  return h('div', { class: 'm-2 flex flex-col' }, wrap, lab);
}
export function singleRange({ min, max, step, value, onCommit, format }) {
  const inp = h('input', { type: 'range', min, max, step, value, class: 'flex-1 accent-neutral-400' });
  const lab = h('span', { class: 'my-1 w-[40px] text-center text-sm' }, format ? format(value) : value);
  inp.addEventListener('input', () => (lab.textContent = format ? format(inp.value) : inp.value));
  inp.addEventListener('change', () => onCommit(Number(inp.value)));
  return h('div', { class: 'm-2 flex flex-row items-center gap-2' }, inp, lab);
}
export function select(options, value, onChange, cls) {
  const sel = h('select', { class: cls || 'm-2 box-border flex flex-1 flex-row rounded-sm border border-neutral-600 bg-neutral-800 p-2 text-white transition focus:outline-none' });
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const oo of o.options) g.append(h('option', { value: oo.value, disabled: oo.disabled }, oo.label));
      sel.append(g);
    } else sel.append(h('option', { value: o.value, disabled: o.disabled }, o.label));
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}
export const filterRow = (label, ...children) => h('div', { class: 'relative flex flex-col bg-surface-900' }, h('span', { class: 'px-2 pt-2 text-sm' }, label), ...children);
export const filterPanel = (...rows) => card(h('div', { class: 'flex justify-between bg-black/10 px-3 py-2 font-bold' }, h('span', null, T('filters'))), h('div', { class: 'flex flex-col divide-y divide-neutral-950' }, ...rows));

// 難度文字顏色（對應原站）
export function diffClass(d) {
  if (d === 'Hard' || d === 'Extreme Hard' || d === 'Level 2') return 'text-yellow-300';
  if (d === 'Inferno' || d === 'Challenge' || d === 'Trial') return 'text-amber-600';
  if (d === 'Solo') return 'text-cyan-400';
  if (d === 'Nightmare' || d === 'Extreme Nightmare') return 'text-violet-400';
  if (d === 'Extreme' || d === 'The First') return 'text-purple-500';
  if (d === 'Level 3') return 'text-rose-300';
  return '';
}
export const diffBadge = (d) => h('span', { class: diffClass(d) }, diffName(d));
export const poweredBy = () => h('span', { class: 'inline text-sm text-neutral-400 max-md:mx-2' },
  '資料由 ', h('img', { src: '/api/image/i/loa_logs_icon.png', alt: 'LOA Logs', class: 'mx-0.5 inline size-4' }), h('a', { href: 'https://github.com/snoww/loa-logs/', target: '_blank', rel: 'external', class: 'text-orange-300 hover:underline' }, 'LOA Logs'), ' 提供。資料為玩家自行上傳，可能無法代表整體玩家群。');
export const PATCH_LABEL = { wildsoul: '幻獸師登場', april: '2025 四月平衡', july: '2025 七月平衡', nov: '2025 十一月平衡', jan26: '2026 一月平衡', mar26: '2026 三月平衡', jun26: '2026 六月平衡', sep26: '2026 九月平衡', current: '本週', alltime: '歷史' };
export const gateLabel = (name) => name.replace(/^Gate\s*(\d+)$/, '關卡 $1');

// ---------- 路由 ----------
export function navigate(path, replace) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  window.dispatchEvent(new Event('app:navigate'));
}
export function setQuery(params, replace = true) {
  const p = new URLSearchParams();
  for (const k in params) if (params[k] !== undefined && params[k] !== null && params[k] !== '') p.set(k, Array.isArray(params[k]) ? params[k].join(',') : params[k]);
  history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : ''));
  const a = $('#orig-link'); if (a) a.href = ORIGIN + location.pathname + location.search;
}
export function intercept(root) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('/api/')) return;
    e.preventDefault();
    navigate(href);
  });
}
