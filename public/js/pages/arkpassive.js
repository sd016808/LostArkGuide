/* 方舟被動統計 (/stats/ark-passive) */
import {
  h, T, tr, trId, D, CDN, clamp01, gradPink, gradBlue, gradPop, addUi, loadExtra, remote,
  attachTooltip, card, sectionHeader, loadingEl, errorEl, infoIcon, classButton, filterRow, filterPanel, setQuery,
} from '../common.js';
import { coreComboPicker, loadCombinations } from './class.js';

addUi({
  ap_points: '方舟被動點數', tree_evolution: '進化', tree_enlightenment: '領悟', tree_leap: '跳躍',
  node_popularity: '節點熱門度',
  node_popularity_tip: '符合篩選條件的所有角色中，各方舟被動節點的使用率。節點上的百分比是「有點該節點（任一等級）」的玩家比例；將滑鼠移到節點上可看到各等級的分布。',
  common_loadouts: '常見配置', common_loadouts_tip: '符合篩選條件時最常見的幾種完整配置。',
  loadout_n_of: '配置 {i} / {n}', used_by: '使用者佔比 ', points: '{a}/{b} 點', level_n: '等級 {n}',
  nobody_uses: '看起來沒有人使用這個節點。',
  not_enough_long: '目前篩選條件下的資料不足。請調整篩選條件，或等待更多資料收集。',
});

const TREES = ['evolution', 'enlightenment', 'leap'];
const TREE_IDX = { evolution: 0, enlightenment: 1, leap: 2 };
const TREE_STYLE = { evolution: 'text-amber-200', enlightenment: 'text-sky-300', leap: 'text-lime-300' };
const SLIDER = { evolution: [80, 140, 140], enlightenment: [60, 101, 101], leap: [40, 70, 70] };
// 領悟樹在 6x4 格中的位置（對應原站）
const ENLIGHT_LAYOUT = [
  [null, null, [0, 1], [0, 2], null, null],
  [null, null, [1, 1], [1, 2], null, null],
  [null, [2, 0], [2, 1], [2, 2], [2, 3], null],
  [null, [3, 0], [3, 1], [3, 2], [3, 3], null],
];

export async function render(root) {
  await Promise.all(['arkpassive', 'cores'].map(loadExtra));
  await loadCombinations();

  const state = { class_id: 'berserker', class_engraving: 'First', tree: 'evolution', ark_grid_cores: undefined, points: { evolution: 140, enlightenment: 101, leap: 70 } };
  const p = new URLSearchParams(location.search);
  if (p.get('class_id') && D.classes.some((c) => c.id === p.get('class_id'))) state.class_id = p.get('class_id');
  if (['First', 'Second'].includes(p.get('class_engraving'))) state.class_engraving = p.get('class_engraving');
  if (TREES.includes(p.get('tree'))) state.tree = p.get('tree');
  if (p.get('ark_grid_cores')) { const a = p.get('ark_grid_cores').split(',').map(Number).filter((n) => n > 0); state.ark_grid_cores = a.length ? a : undefined; }
  if (p.get('min_points')) state.points[state.tree] = Number(p.get('min_points'));
  const snapshot = () => ({ class_id: state.class_id, class_engraving: state.class_engraving, tree: state.tree, ark_grid_cores: state.ark_grid_cores, min_points: state.points[state.tree], max_points: state.points[state.tree] });
  const stale = (f) => JSON.stringify(f) !== JSON.stringify(snapshot());
  const classNum = () => D.classes.find((c) => c.id === state.class_id).num;

  const secLoadouts = card(), secNodes = card();
  const filterBox = h('div', { class: 'sticky top-20' });
  root.append(h('main', { class: 'mx-auto flex max-w-7xl flex-col-reverse gap-4 px-0.5 py-4 sm:px-4 md:grid md:grid-cols-[auto_20rem]' },
    h('div', null, h('div', { class: 'grid gap-3' }, secLoadouts, secNodes, h('div', { class: 'max-sm:hidden', style: 'height:600px' }))),
    h('div', null, filterBox)));

  // 找出 (row, col) 對應的節點 id
  function nodeAt(tree, row, col, cnum) {
    for (const [id, n] of Object.entries(D.arkpassive)) {
      const [, , t, r, c, , cls] = n;
      if ((tree === 'evolution' || cls === cnum) && t === TREE_IDX[tree] && r === row && c === col) return +id;
    }
    return null;
  }
  function gridLayout(tree, cnum) {
    const rows = [];
    if (tree === 'evolution') for (let r = 0; r < 5; r++) rows.push(Array.from({ length: 6 }, (_, c) => nodeAt(tree, r, c, cnum)));
    else if (tree === 'enlightenment') for (const row of ENLIGHT_LAYOUT) rows.push(row.map((rc) => (rc ? nodeAt(tree, rc[0], rc[1], cnum) : null)));
    else for (let r = 0; r < 2; r++) rows.push(Array.from({ length: 6 }, (_, c) => nodeAt(tree, r, c, cnum)));
    return rows;
  }
  const nodeName = (id) => trId('arkpassive', id, D.arkpassive[id][0], classNum());
  const gridEl = (tree, cells) => h('div', { class: `grid grid-cols-6 gap-px bg-neutral-900 transition` }, ...cells.flat().map((c) => c || h('div', { class: 'bg-transparent' })));

  function renderFilters() {
    filterBox.innerHTML = '';
    const cls = D.classes.find((c) => c.id === state.class_id);
    const combos = (D.combinations.combinations[state.class_id] && D.combinations.combinations[state.class_id][state.class_engraving]) || [];
    if (state.ark_grid_cores && !combos.some(([, ids]) => JSON.stringify(ids) === JSON.stringify(state.ark_grid_cores))) state.ark_grid_cores = undefined;
    const current = state.ark_grid_cores ? combos.find(([, ids]) => JSON.stringify(ids) === JSON.stringify(state.ark_grid_cores)) : null;
    const tabs = h('div', { class: 'flex flex-row divide-x divide-neutral-950' }, ...TREES.map((t) => {
      const b = h('button', { type: 'button', class: `flex flex-auto flex-col items-center justify-center bg-surface-950/50 p-2 text-sm ${TREE_STYLE[t]} transition ${state.tree === t ? '!bg-surface-900' : ''}` }, T('tree_' + t));
      b.addEventListener('click', () => { state.tree = t; update(); });
      return b;
    }));
    const classBox = filterRow(T('class'));
    classBox.append(classButton(classBox, state.class_id, (c) => { state.class_id = c.id; state.ark_grid_cores = undefined; update(); }));
    const engName = (e) => (e.type === 'arkpassive' ? trId('arkpassive', e.id, e.name) : tr('class_engravings', e.name));
    const sel = h('select', { class: 'm-2 box-border flex flex-1 flex-row rounded-sm border border-neutral-600 bg-transparent p-2 text-white transition hover:bg-neutral-800 focus:outline-none' },
      h('option', { value: 'First' }, engName(cls.engravings[0])), h('option', { value: 'Second' }, engName(cls.engravings[1])));
    sel.value = state.class_engraving;
    sel.addEventListener('change', () => { state.class_engraving = sel.value; state.ark_grid_cores = undefined; update(); });
    const coreBox = filterRow(T('ark_grid_cores'));
    coreBox.append(coreComboPicker(coreBox, combos, current, cls.num, (ids) => { state.ark_grid_cores = ids; update(); }));
    const [mn, mx] = SLIDER[state.tree];
    const inp = h('input', { type: 'range', min: mn, max: mx, step: 1, value: state.points[state.tree], class: 'flex-1 accent-neutral-400' });
    const lab = h('span', { class: 'my-1 w-[40px] text-center text-sm' }, state.points[state.tree]);
    inp.addEventListener('input', () => (lab.textContent = inp.value));
    inp.addEventListener('change', () => { state.points[state.tree] = Number(inp.value); update(); });
    filterBox.append(filterPanel(tabs, classBox, filterRow(T('class_engraving'), sel), coreBox, filterRow(T('ap_points'), h('div', { class: 'm-2 flex flex-row items-center gap-2' }, inp, lab))));
  }

  async function renderLoadouts(filters) {
    secLoadouts.innerHTML = '';
    secLoadouts.append(sectionHeader(T('common_loadouts'), infoIcon(T('common_loadouts_tip'))));
    const body = h('div'); secLoadouts.append(body); body.append(loadingEl(200));
    let data;
    try { data = await remote('arkPassiveTopLoadouts', filters); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(filters)) return;
    body.innerHTML = '';
    if (!data || !data.loadouts || data.loadouts.length === 0 || data.total < 20) { body.append(h('div', { class: 'p-3 text-center text-sm' }, T('not_enough_long'))); return; }
    let idx = 0;
    const layout = gridLayout(filters.tree, classNum());
    const draw = () => {
      body.innerHTML = '';
      const lo = data.loadouts[idx];
      const pop = lo.count / data.total;
      let pts = 0;
      for (const [id, lv] of Object.entries(lo.nodes)) { const n = D.arkpassive[id]; if (n) pts += lv * n[7]; }
      const prev = h('button', { type: 'button', class: 'rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700', disabled: idx === 0 }, '‹');
      const next = h('button', { type: 'button', class: 'rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700', disabled: idx === data.loadouts.length - 1 }, '›');
      prev.addEventListener('click', () => { idx = Math.max(0, idx - 1); draw(); });
      next.addEventListener('click', () => { idx = Math.min(data.loadouts.length - 1, idx + 1); draw(); });
      body.append(h('div', { class: 'flex flex-row items-center gap-1 p-2' }, prev, h('span', { class: 'w-[120px] px-2 text-center text-xs' }, T('loadout_n_of', { i: idx + 1, n: data.loadouts.length })), next,
        h('span', { class: 'pl-3 text-sm' }, T('used_by'), h('span', { class: 'font-semibold', style: `color:${gradPop.rgbAt(clamp01(pop))}` }, `${(pop * 100).toFixed(1)}%`)),
        h('div', { class: 'flex-1' }), h('span', { class: 'text-sm' }, T('points', { a: pts, b: filters.max_points }))));
      const cells = layout.map((row) => row.map((id) => {
        if (!id) return null;
        const n = D.arkpassive[id];
        const lv = lo.nodes[id] || 0;
        return h('div', { class: `relative flex h-full w-full flex-col items-center justify-center bg-neutral-800 p-3 shadow-neutral-950 ${lv ? '' : 'opacity-30'}`, style: 'box-shadow:0 0 0 1px var(--tw-shadow-color)' },
          h('img', { class: 'z-10 size-10 rounded-lg max-sm:size-8', src: `${CDN}/icon/${n[1]}.png`, alt: n[0] }),
          h('span', { class: 'z-10 cursor-default pt-2 text-center text-xs max-sm:text-[10px]', title: n[0] }, nodeName(id)),
          lv ? h('span', { class: 'text-xs max-sm:text-[10px]' }, T('level_n', { n: lv })) : null);
      }));
      body.append(gridEl(filters.tree, cells));
    };
    draw();
  }

  async function renderNodes(filters) {
    secNodes.innerHTML = '';
    secNodes.append(sectionHeader(T('node_popularity'), infoIcon(T('node_popularity_tip'))));
    const body = h('div'); secNodes.append(body); body.append(loadingEl(300));
    let data;
    try { data = await remote('arkPassiveStats', filters); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(filters)) return;
    body.innerHTML = '';
    if (!data || !data.by_node) { body.append(h('div', { class: 'p-3 text-center text-sm' }, T('not_enough_long'))); return; }
    const layout = gridLayout(filters.tree, classNum());
    const totalFor = (id) => Object.values(data.by_node[id] || {}).reduce((a, b) => a + b, 0);
    const cells = layout.map((row) => row.map((id) => {
      if (!id) return null;
      const n = D.arkpassive[id];
      const cnt = totalFor(id);
      const ratio = data.total ? cnt / data.total : 0;
      const cell = h('div', { class: `relative flex h-full w-full flex-col items-center justify-center bg-neutral-800 p-3 shadow-neutral-950 ${ratio < 0.05 ? 'opacity-40' : ''}`, style: 'box-shadow:0 0 0 1px var(--tw-shadow-color)' },
        h('div', { class: 'absolute inset-0 opacity-30 transition', style: `background-color:${gradBlue.rgbAt(clamp01(ratio))}` }),
        h('img', { class: 'z-10 size-10 rounded-lg max-sm:size-8', src: `${CDN}/icon/${n[1]}.png`, alt: n[0] }),
        h('span', { class: 'z-10 cursor-default pt-2 text-center text-xs max-sm:text-[10px]', title: n[0] }, nodeName(id)),
        h('span', { class: 'z-10 cursor-default', style: `color:${gradPink.rgbAt(clamp01(ratio))}` }, h('span', null, (ratio * 100).toFixed(2), h('span', { class: 'ml-0 text-xs' }, '%'))));
      attachTooltip(cell, () => {
        const box = h('div', { class: 'flex w-[300px] flex-col space-y-1 py-1 text-left text-xs font-normal' },
          h('div', { class: 'flex flex-row items-center justify-center gap-2' }, h('img', { class: 'size-6 rounded-lg', src: `${CDN}/icon/${n[1]}.png`, alt: '' }), h('span', { class: 'text-sm font-semibold' }, nodeName(id))));
        if (!cnt) { box.append(h('span', { class: 'pt-2 pl-1 text-sm' }, T('nobody_uses'))); return box; }
        const grid = h('div', { class: 'grid grid-cols-[max-content_auto_max-content]' });
        const maxLv = n[5];
        for (let i = 0; i < maxLv; i++) {
          const c = (data.by_node[id] || {})[i + 1] || 0; const r = c / cnt;
          if (!(r > 0.05 || maxLv <= 5)) continue;
          grid.append(h('div', { class: 'ml-3 flex items-center justify-end' }, h('span', { class: 'text-right text-xs font-semibold' }, `${i + 1}/${maxLv}`)),
            h('div', { class: 'm-2 flex items-center justify-center' }, h('div', { class: 'relative h-2 w-full rounded-sm bg-surface-800' }, h('div', { class: 'absolute left-0 h-2 rounded-sm bg-blue-300', style: `width:${r * 100}%` }))),
            h('div', { class: 'mr-3 flex items-center justify-start' }, h('span', { class: 'text-xs' }, `${(r * 100).toFixed(2)}%`)));
        }
        box.append(grid);
        return box;
      });
      return cell;
    }));
    body.append(gridEl(filters.tree, cells));
  }

  function update() {
    setQuery(snapshot());
    renderFilters();
    const f = snapshot();
    renderLoadouts(f); renderNodes(f);
  }
  update();
}
