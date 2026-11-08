/* 戰鬥力統計 (/stats/combat-power) */
import { h, T, D, addUi, pageData, card, infoIcon, classIconEl, errorEl, loadingEl, className, mountChart, ECH_BASE } from '../common.js';

addUi({
  cp_by_ilvl: '各裝等戰鬥力分布', cp_by_class: '各職業戰鬥力分布', dps_classes: '輸出職業', support_classes: '輔助職業',
  combined: '合計', classes: '職業', average: '平均：{v}', ceiling: '上限', q3: 'Q3', median: '中位數', q1: 'Q1', floor: '下限',
  cp_tip: '依遊戲內顯示的戰鬥力數值。只計入 1640 以上且寶石已滿的角色。',
});

class Digest {
  constructor(e) {
    this.c = e.centroids.filter((x) => x[1] > 0 && !isNaN(x[0])).sort((a, b) => a[0] - b[0]);
    if (!this.c.length) throw new Error('empty digest');
    this.w = this.c.reduce((a, b) => a + b[1], 0);
    this.count = e.count; this.min = e.min; this.max = e.max;
  }
  estimateQuantile(q) {
    const t = Math.max(0, Math.min(1, q));
    if (this.c.length === 1) return this.c[0][0];
    const n = this.w; if (n <= 1) return this.c[0][0];
    let r = 0, prev = 0, cur = 0, idx = 0;
    for (let i = 0; i < this.c.length; i++) {
      const s = this.c[i]; prev = cur; cur = (2 * r + s[1] - 1) / (2 * (n - 1)); r += s[1];
      if (cur >= t) break; idx = i + 1;
    }
    if (idx === 0) return this.c[0][0];
    if (idx >= this.c.length) return this.c[this.c.length - 1][0];
    const a = this.c[idx - 1], b = this.c[idx], l = cur - prev;
    if (l < 1e-9) return (a[0] + b[0]) / 2;
    const u = (t - prev) / l; return a[0] * (1 - u) + b[0] * u;
  }
}
function getDigest(dist, cls, kind, ilvl, min = 5) {
  let key = `${kind}-all`;
  if (ilvl !== null) key = `${kind}-${ilvl - (ilvl % 10)}`;
  const s = dist[cls] && dist[cls][key];
  if (!s || !s.centroids.length || s.count < min) return null;
  return new Digest(s);
}
function getDigestFrom(dist, cls, kind, minIlvl, min = 5) {
  const o = dist[cls]; if (!o) return null;
  const cents = []; let count = 0, mn = Infinity, mx = -Infinity;
  for (const [k, v] of Object.entries(o)) {
    if (k === `${kind}-all` || !k.startsWith(`${kind}-`)) continue;
    const n = Number(k.slice(kind.length + 1)); if (isNaN(n) || n < minIlvl) continue;
    cents.push(...v.centroids); count += v.count; mn = Math.min(mn, v.min); mx = Math.max(mx, v.max);
  }
  if (!cents.length || count < min) return null;
  return new Digest({ centroids: cents, count, min: mn, max: mx });
}
const isSupport = (id) => id === 'support' || ['holyknight', 'holyknight_female', 'bard', 'yinyangshi'].includes(id);

function densityPath(dg, min, max) {
  const pts = [[min, 0]]; const r = 1 / 100;
  for (let i = 0; i < 100; i++) {
    const a = i * r, b = (i + 1) * r, s = dg.estimateQuantile(a), c = dg.estimateQuantile(b), u = c - s;
    if (u <= 0) continue;
    const f = (s + c) / 2; if (f < min || f > max) continue;
    pts.push([f, (b - a) / u]);
  }
  pts.push([max, 0]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const scaled = pts.map(([x, y]) => [((x - x0) / (x1 - x0 || 1)) * 800, 40 - ((y - y0) / (y1 - y0 || 1)) * 40]);
  // 平滑曲線
  const sm = 0.2;
  const ctrl = (cur, prev, next, rev) => { const p0 = prev || cur, p1 = next || cur; const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + (rev ? Math.PI : 0); const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * sm; return [cur[0] + Math.cos(ang) * len, cur[1] + Math.sin(ang) * len]; };
  let d = '';
  scaled.forEach((pt, i, arr) => {
    if (i === 0) { d = `M ${pt[0]},${pt[1]}`; return; }
    const c1 = ctrl(arr[i - 1], arr[i - 2], pt), c2 = ctrl(pt, arr[i - 1], arr[i + 1], true);
    d += ` C ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${pt[0]},${pt[1]}`;
  });
  return d;
}

export async function render(root) {
  const main = h('div', { class: 'mx-auto flex max-w-7xl flex-col gap-4 px-0.5 py-4 sm:px-4' });
  root.append(main);
  main.append(loadingEl(300));
  let data;
  try { data = await pageData('stats/combat-power'); } catch (e) { main.innerHTML = ''; main.append(errorEl(e)); return; }
  main.innerHTML = '';
  const dist = data.distribution;
  const classIds = D.classes.map((c) => c.id).filter((id) => dist[id]);

  // ---- 各裝等箱型圖 ----
  let sel = 'dps';
  const chartEl = h('div', { class: 'h-[600px] w-full' });
  const select = h('select', { class: 'appearance-none border-b-2 border-gray-500 bg-transparent py-1 pr-8 text-sm text-white focus:border-blue-500 focus:outline-none' },
    h('optgroup', { label: T('combined') }, h('option', { value: 'dps' }, T('all_dps')), h('option', { value: 'support' }, T('all_supports'))),
    h('optgroup', { label: T('classes') }, ...classIds.map((id) => h('option', { value: id }, className(id)))));
  select.addEventListener('change', () => { sel = select.value; drawBox(); });
  main.append(card(h('div', { class: 'flex flex-row items-center bg-black/10 px-3 py-2 font-bold' }, h('span', null, T('cp_by_ilvl')), h('div', { class: 'flex-1' }), select, infoIcon(T('cp_tip'))), chartEl));
  const tipRow = (k, v) => `<div class="flex justify-between min-w-36 w-full"><div>${k}</div><div>${v.toFixed(2)}</div></div>`;
  async function drawBox() {
    const kind = isSupport(sel) ? 2 : 1;
    const rows = [];
    for (let il = 1680; il <= 1790; il += 10) {
      const dg = getDigest(dist, sel, kind, il); if (!dg) continue;
      const med = dg.estimateQuantile(0.5), q1 = dg.estimateQuantile(0.25), q3 = dg.estimateQuantile(0.75), iqr = q3 - q1;
      rows.push([il, [Math.max(Math.max(q1 - 1.5 * iqr, 0), dg.min), q1, med, q3, Math.min(q3 + 1.5 * iqr, dg.max)]]);
    }
    const top = getDigestFrom(dist, sel, kind, 1800);
    if (top) { const med = top.estimateQuantile(0.5), q1 = top.estimateQuantile(0.25), q3 = top.estimateQuantile(0.75), iqr = q3 - q1; rows.push([1800, [Math.max(Math.max(q1 - 1.5 * iqr, 0), top.min), q1, med, q3, Math.min(q3 + 1.5 * iqr, top.max)]]); }
    rows.reverse();
    const label = (il) => (il >= 1800 ? `${il}+` : `${il}-${il + 10}`);
    const axisColor = 'oklch(0.87 0 0)';
    try {
      await mountChart(chartEl, {
        ...ECH_BASE,
        tooltip: { trigger: 'axis', backgroundColor: '#262626', borderColor: '#404040', textStyle: { color: '#e5e5e5' }, formatter(e) { const v = e[0].value.slice(1); return `<div class="flex flex-col text-neutral-200"><div class="font-bold">${T('item_level')} ${e[0].name}</div>${tipRow(T('ceiling'), v[4])}${tipRow('Q3', v[3])}${tipRow(T('median'), v[2])}${tipRow('Q1', v[1])}${tipRow(T('floor'), v[0])}</div>`; }, axisPointer: { type: 'cross', label: { formatter(e) { return typeof e.value === 'string' ? e.value : e.value.toFixed(2); } } } },
        yAxis: { type: 'category', axisLabel: { interval: 0, color: axisColor }, axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(150,150,150,0.2)' } }, axisTick: { alignWithLabel: true }, data: rows.map((r) => label(r[0])) },
        xAxis: { name: `${T('cp_by_ilvl')} | lostark.bible`, nameLocation: 'end', nameGap: 0, nameTextStyle: { align: 'right', verticalAlign: 'bottom', color: '#a3a3a3' }, type: 'value', axisLabel: { color: axisColor, formatter: (v) => v.toFixed(2) }, axisLine: { show: true }, axisTick: { show: true }, splitLine: { show: false } },
        series: [{ type: 'boxplot', data: rows.map((r) => ({ name: label(r[0]), value: r[1], itemStyle: { color: '#8ec5ff', borderColor: 'oklch(0.556 0 0)' }, emphasis: { disabled: true } })) }],
      });
    } catch (e) { chartEl.innerHTML = ''; chartEl.append(errorEl(e)); }
  }
  drawBox();

  // ---- 各職業分布 ----
  const minS = Math.min(...Object.values(dist).map((e) => (e['2-all'] ? e['2-all'].min : 0))), maxS = Math.max(...Object.values(dist).map((e) => (e['2-all'] ? e['2-all'].max : 0))) * 0.75;
  const minD = Math.min(...Object.values(dist).map((e) => (e['1-all'] ? e['1-all'].min : 0))), maxD = Math.max(...Object.values(dist).map((e) => (e['1-all'] ? e['1-all'].max : 0))) * 0.75;
  const grid = h('div', { class: 'grid grid-cols-[min-content_max-content_1fr] divide-y divide-neutral-950' });
  const row = (id) => {
    const sup = isSupport(id);
    const dg = getDigest(dist, id, sup ? 2 : 1, null);
    if (!dg) return null;
    const [mn, mx] = sup ? [minS, maxS] : [minD, maxD];
    const path = densityPath(dg, mn, mx);
    const svg = `<svg viewBox="0 0 800 40" preserveAspectRatio="none" class="h-[40px] w-full"><path fill="none" stroke-width="1" stroke="#8ec5ff" d="${path}"></path><path fill="rgba(142, 197, 255, 0.2)" d="${path} L 800 40 L 0 40 Z"></path></svg>`;
    const name = id === 'dps' ? T('all_dps') : id === 'support' ? T('all_supports') : className(id);
    const icon = id === 'dps' || id === 'support' ? h('span', { class: 'grid size-8 place-items-center text-neutral-400' }, id === 'dps' ? '⚔' : '✚') : classIconEl(id, 'size-8');
    return h('div', { class: 'col-span-full grid grid-cols-subgrid items-center gap-3 p-2 px-3' }, icon,
      h('div', { class: 'flex flex-col max-sm:hidden' }, h('div', { class: 'text-sm font-bold' }, name), h('div', { class: 'text-xs text-neutral-400' }, T('average', { v: dg.estimateQuantile(0.5).toFixed(2) }))),
      h('div', { html: svg }));
  };
  grid.append(h('div', { class: 'col-span-full p-2' }, h('span', { class: 'text-sm font-bold text-neutral-400' }, T('dps_classes'))), row('dps'), ...classIds.filter((id) => !isSupport(id)).map(row));
  grid.append(h('div', { class: 'col-span-full p-2' }, h('span', { class: 'text-sm font-bold text-neutral-400' }, T('support_classes'))), row('support'), ...classIds.filter((id) => isSupport(id)).map(row));
  main.append(card(h('div', { class: 'flex flex-row items-center bg-black/10 px-3 py-2 font-bold' }, h('span', null, T('cp_by_class'))), grid));
}
