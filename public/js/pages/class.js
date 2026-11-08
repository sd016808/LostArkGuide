/* 職業配置統計 (/stats/class) */
import {
  $, h, T, tr, trId, D, ZH, CDN, fmt, clamp01, esc, gradPink, gradBlue, gradPop, addUi, loadExtra, remote, loadJson,
  attachTooltip, card, sectionHeader, notEnough, loadingEl, errorEl, infoIcon, barList, classButton, dualRange, filterRow, filterPanel,
  coreName, coreTypeLabel, coreTypeFromName, setQuery, closePopovers,
} from '../common.js';

addUi({
  ilvl_range: '顯示裝等介於 {min} 與 {max} 之間的角色',
  skills: '技能', skill_level: '技能等級', skill_tripods: '三重核心', skill_runes: '技能符文', level: '等級',
  combos: '方舟星圖核心組合',
  combos_tooltip: '所有符合條件玩家中，三個秩序核心組合的使用率。只計入三個秩序核心皆達 14 點以上的角色。',
  used_by: '使用者佔比 ', limited_to_loadout: '結果已限制在特定核心配置。', clear_loadout: '清除核心配置篩選',
  core_popularity: '方舟星圖核心熱門度', engravings: '刻印', entries_hidden: '已隱藏 {n} 個項目',
});

const GRADE_BG = ['linear-gradient(135deg, #232323, #575757)', 'linear-gradient(135deg, #18220b, #304911)', 'linear-gradient(135deg, #111f2c, #113d5d)', 'linear-gradient(135deg, #261331, #480d5d)', 'linear-gradient(135deg, #362003, #9e5f04)', 'linear-gradient(135deg, #341a09, #a24006)', 'linear-gradient(135deg, #3d3325, #dcc999)', 'linear-gradient(135deg, #0c2e2c, #2faba8)'];
export const SLOT_BG = ['bg-sky-500/80', 'bg-green-600/80', 'bg-amber-600/80'];
export const slotIndex = (id) => Math.floor((id % 1e4) / 1e3) % 3;
export function coreIcon(id, cls) {
  const item = D.cores.items[id];
  if (!item) return h('div', { class: cls });
  return h('div', { class: `relative ${cls}`, style: `background-image:${GRADE_BG[item[1]] || ''}` },
    h('img', { alt: '', class: 'h-full w-full rounded-[inherit] object-cover', src: `${CDN}/icon/${item[0]}.png` }));
}
function renderDesc(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(String(node));
  if (Array.isArray(node)) {
    if (node.length === 3 && node[0] === 2 && typeof node[1] === 'string' && Array.isArray(node[2])) return `<span style="color:${esc(node[1])}">${node[2].map(renderValue).join('')}</span>`;
    return node.map(renderDesc).join('');
  }
  return '';
}
function renderValue(v) {
  if (typeof v === 'string' || typeof v === 'number') return esc(String(v));
  if (Array.isArray(v)) {
    if (v.length === 3 && v[0] === 4 && Array.isArray(v[1])) {
      const [op, a, b] = v[1]; const dec = v[2] || 0;
      const n = op === '-' ? a - b : op === '+' ? a + b : op === '*' ? a * b : op === '/' ? a / b : b;
      return esc(n.toFixed(dec));
    }
    return v.map(renderValue).join('');
  }
  return '';
}
const POINT_STEPS = [10, 14, 17, 18, 19, 20];
const GRADE_EFFECT_COUNT = [1, 2, 6, 6];
export function coreTooltip(instanceId) {
  const inst = D.cores.instances[instanceId];
  if (!inst) return null;
  const [name, order, type, , gradeIdx, effects, classNum] = inst;
  const box = h('div', { class: 'flex max-w-[420px] flex-col gap-2 p-2 text-left' });
  box.append(h('div', { class: 'flex flex-row items-center gap-2' },
    coreIcon(instanceId, 'size-10 rounded-md'),
    h('div', { class: 'flex flex-col' },
      h('div', { class: 'font-bold' }, coreName(name, classNum, instanceId)),
      h('div', { class: 'flex flex-row items-center gap-1 text-sm text-neutral-400' },
        h('img', { class: 'size-4', src: `${CDN}/ui/emoticon_arkgrid_${order === 0 ? 'order' : 'chaos'}_${['sun', 'moon', 'star'][type]}.png`, alt: '' }),
        coreTypeLabel(order, type)))));
  const grid = h('div', { class: 'grid grid-cols-[max-content_1fr] gap-1 text-sm' });
  (effects || []).forEach((eid, i) => {
    if (i >= GRADE_EFFECT_COUNT[gradeIdx]) return;
    const d = (D.core_desc_zh && D.core_desc_zh[eid]) || D.core_desc[eid];
    grid.append(h('span', { class: 'text-neutral-300' }, `[${POINT_STEPS[i]}P]`), h('span', { html: d ? renderDesc(d[0]) : '' }));
  });
  box.append(grid, h('div', { class: 'text-xs text-neutral-500' }, '效果名稱（紫色）尚無官方中文，保留原文'));
  return box;
}
export function coreMatchesEngraving(instanceId, classEngraving) {
  const inst = D.cores.instances[instanceId];
  if (!inst) return false;
  const nm = D.cores.names[inst[3]];
  if (!nm) return false;
  const apId = nm[3];
  if (apId !== 0) {
    const ap = D.arkpassive[apId];
    const col = ap ? ap[4] : undefined;
    if (classEngraving === 'First' && col !== 1) return false;
    if (classEngraving === 'Second' && col !== 2) return false;
  }
  return true;
}
export function comboSummary(ids, popularity) {
  const span = h('span', { class: 'flex flex-row flex-wrap items-center gap-1' });
  ids.forEach((id) => span.append(h('span', { class: `rounded-sm px-1.5 text-sm whitespace-nowrap ${SLOT_BG[slotIndex(id)]}` }, slotIndex(id) + 1)));
  span.append(h('span', { class: 'text-neutral-400' }, '-'));
  span.append(h('span', { class: 'text-sm text-white' }, h('span', { style: `color:${gradPop.rgbAt(popularity / 100)}` }, `${popularity.toFixed(2)}%`), ` ${T('popularity')}`));
  return span;
}
// 核心組合選單（職業配置頁與方舟被動頁共用）
export function coreComboPicker(box, combos, current, classNum, onPick) {
  const btn = h('button', { type: 'button', class: 'm-2 box-border flex flex-1 flex-row items-center rounded-sm border border-neutral-600 p-2 text-white transition hover:bg-neutral-800 focus:outline-none' },
    current ? comboSummary(current[1], current[0]) : h('span', { class: 'text-white' }, T('all_order_combos')));
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closePopovers();
    const pop = h('div', { class: 'popover absolute left-2 right-2 top-full z-20 flex max-h-[400px] flex-col rounded-lg bg-neutral-800 p-2 shadow-lg fade-in', onclick: (e) => e.stopPropagation() });
    const list = h('div', { class: 'flex flex-1 flex-col gap-2 overflow-y-scroll thin-scroll' });
    const all = h('button', { type: 'button', class: `mr-1 flex h-11 flex-row items-center rounded-md border ${!current ? 'border-accent-900' : 'border-transparent'} bg-neutral-900 p-2` }, h('span', null, T('all_order_combos')));
    all.addEventListener('click', () => { closePopovers(); onPick(undefined); });
    list.append(all);
    for (const [pop_, ids] of combos) {
      const b = h('button', { type: 'button', class: `mr-1 flex flex-col rounded-md border ${current && JSON.stringify(current[1]) === JSON.stringify(ids) ? 'border-accent-900' : 'border-transparent'} bg-neutral-900 text-left` });
      b.append(h('div', { class: 'w-full border-b border-neutral-800 p-2' }, comboSummary(ids, pop_)));
      const rows = h('div', { class: 'flex flex-col py-2' });
      for (const id of ids) {
        const inst = D.cores.instances[id];
        rows.append(h('div', { class: 'flex flex-row items-center gap-2 px-2 py-1' },
          h('div', { class: 'relative' }, coreIcon(id, 'size-6 rounded-sm'), h('div', { class: `absolute right-0 bottom-0 flex size-3 items-center justify-center rounded-tl-sm rounded-br-sm text-xs ${SLOT_BG[slotIndex(id)]}` }, slotIndex(id) + 1)),
          h('span', { class: 'text-sm' }, inst ? coreName(inst[0], classNum, id) : String(id))));
      }
      b.append(rows);
      b.addEventListener('click', () => { closePopovers(); onPick(ids.slice()); });
      list.append(b);
    }
    pop.append(list);
    box.append(pop);
  });
  return btn;
}
export async function loadCombinations() {
  if (D.combinations) return D.combinations;
  try { D.combinations = await loadJson('/api/combinations'); } catch (e) { D.combinations = { combinations: {} }; }
  return D.combinations;
}

export async function render(root) {
  await Promise.all(['skills', 'tripods', 'runes', 'engravings', 'cores', 'core_desc', 'arkpassive'].map(loadExtra));
  await loadExtra('core_desc_zh').catch(() => {});
  await loadCombinations();

  const state = { classId: 'berserker', classEngraving: 'First', arkGridCores: undefined, minIlvl: 1680, maxIlvl: 1810 };
  const p = new URLSearchParams(location.search);
  if (p.get('classId') && D.classes.some((c) => c.id === p.get('classId'))) state.classId = p.get('classId');
  if (['First', 'Second'].includes(p.get('classEngraving'))) state.classEngraving = p.get('classEngraving');
  if (p.get('arkGridCores')) { const a = p.get('arkGridCores').split(',').map(Number).filter((n) => n > 0); state.arkGridCores = a.length ? a : undefined; }
  if (p.get('minIlvl')) state.minIlvl = Number(p.get('minIlvl'));
  if (p.get('maxIlvl')) state.maxIlvl = Number(p.get('maxIlvl'));
  const snapshot = () => ({ classId: state.classId, classEngraving: state.classEngraving, arkGridCores: state.arkGridCores, minIlvl: state.minIlvl, maxIlvl: state.maxIlvl });
  const stale = (f) => JSON.stringify(f) !== JSON.stringify(snapshot());

  const secSkills = card(), secCombos = card(), secCores = card(), secEng = card();
  const filterBox = h('div', { class: 'sticky top-20' });
  root.append(h('main', { class: 'mx-auto flex max-w-7xl flex-col-reverse gap-4 px-0.5 py-4 sm:px-4 md:grid md:grid-cols-[auto_20rem]' },
    h('div', null, h('div', { class: 'grid gap-3' }, secSkills, secCombos, secCores, secEng, h('div', { class: 'max-sm:hidden', style: 'height:600px' }))),
    h('div', null, filterBox)));

  const pct = (v, tot, cls_) => {
    const ratio = tot ? v / tot : 0;
    return h('span', { class: cls_ || '', style: `color:${gradPink.rgbAt(clamp01(ratio))}` }, (ratio * 100).toFixed(2), h('span', { class: 'ml-0 text-xs' }, '%'));
  };

  function renderFilters() {
    filterBox.innerHTML = '';
    const cls = D.classes.find((c) => c.id === state.classId);
    const combos = (D.combinations.combinations[state.classId] && D.combinations.combinations[state.classId][state.classEngraving]) || [];
    if (state.arkGridCores && !combos.some(([, ids]) => JSON.stringify(ids) === JSON.stringify(state.arkGridCores))) state.arkGridCores = undefined;
    const current = state.arkGridCores ? combos.find(([, ids]) => JSON.stringify(ids) === JSON.stringify(state.arkGridCores)) : null;
    const classBox = filterRow(T('class'));
    classBox.append(classButton(classBox, state.classId, (c) => { state.classId = c.id; state.arkGridCores = undefined; update(); }));
    const sel = h('select', { class: 'm-2 box-border flex flex-1 flex-row rounded-sm border border-neutral-600 bg-transparent p-2 text-white transition hover:bg-neutral-800 focus:outline-none' },
      h('option', { value: 'First' }, tr('class_engravings', cls.engravings[0].name)),
      h('option', { value: 'Second' }, tr('class_engravings', cls.engravings[1].name)));
    sel.value = state.classEngraving;
    sel.addEventListener('change', () => { state.classEngraving = sel.value; state.arkGridCores = undefined; update(); });
    const coreBox = filterRow(T('ark_grid_cores'));
    coreBox.append(coreComboPicker(coreBox, combos, current, cls.num, (ids) => { state.arkGridCores = ids; update(); }));
    filterBox.append(filterPanel(classBox, filterRow(T('class_engraving'), sel), coreBox,
      filterRow(T('item_level'), dualRange({ min: 1700, max: 1810, step: 10, lo: state.minIlvl, hi: state.maxIlvl, label: (a, b) => T('ilvl_range', { min: a, max: b }), onCommit: (a, b) => { state.minIlvl = a; state.maxIlvl = b; update(); } }))));
  }

  async function renderSkills(filters) {
    secSkills.innerHTML = '';
    secSkills.append(sectionHeader(T('skills')));
    const body = h('div'); secSkills.append(body); body.append(loadingEl());
    let data;
    try { data = await remote('statsSkills', filters); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(filters)) return;
    body.innerHTML = '';
    if (!data || !data.by_skill_level) { body.append(notEnough()); return; }
    const cls = D.classes.find((c) => c.id === filters.classId);
    const total = data.total || 0;
    const skills = Object.entries(data.by_skill_level).filter(([, arr]) => arr.slice(1).some((v) => v > 0)).map(([id, arr]) => [id, arr, arr.slice(1).reduce((a, b) => a + b, 0)]).sort((a, b) => b[2] - a[2]);
    if (!skills.length || total < 50) { body.append(notEnough()); return; }
    let selected = skills[0][0];
    const listCol = h('div', { class: 'flex w-full flex-col divide-y divide-neutral-950 max-lg:max-h-[250px] max-lg:overflow-y-scroll lg:w-[30%] thin-scroll' });
    const detailCol = h('div', { class: 'flex flex-1 flex-col gap-px' });
    body.append(h('div', { class: 'flex flex-row divide-x divide-neutral-950 transition max-lg:flex-col' }, listCol, detailCol));
    const renderList = () => {
      listCol.innerHTML = '';
      for (const [id, , count] of skills) {
        const sk = D.skills[id]; if (!sk) continue;
        const b = h('button', { type: 'button', class: `flex flex-row items-center justify-center gap-2 bg-surface-900 p-2 transition ${selected === id ? '!bg-surface-800 !opacity-100' : 'opacity-70 hover:opacity-100'}` },
          h('img', { class: 'size-6 rounded-sm', alt: sk[0], src: `${CDN}/icon/${sk[2] || ''}.png` }),
          h('span', { class: 'flex-1 truncate text-left', title: sk[0] }, trId('skills', id, sk[0], cls.num)),
          pct(count, total, 'text-right text-sm'));
        b.addEventListener('click', () => { selected = id; renderList(); renderDetail(); });
        listCol.append(b);
      }
    };
    const renderDetail = () => {
      detailCol.innerHTML = '';
      const lv = data.by_skill_level[selected] || [];
      const G = lv.slice(1).reduce((a, b) => a + b, 0);
      const levels = [[`${T('level')} 1-3`, lv.slice(1, 3).reduce((a, b) => a + b, 0)], [`${T('level')} 4-6`, lv.slice(3, 6).reduce((a, b) => a + b, 0)], [`${T('level')} 7-9`, lv.slice(6, 9).reduce((a, b) => a + b, 0)],
        [`${T('level')} 10`, lv[9] || 0], [`${T('level')} 11`, lv[10] || 0], [`${T('level')} 12`, lv[11] || 0], [`${T('level')} 13`, lv[12] || 0], [`${T('level')} 14`, lv[13] || 0]];
      detailCol.append(h('div', { class: 'flex flex-col bg-surface-800 p-2' }, h('div', { class: 'font-bold' }, T('skill_level'))));
      const grid = h('div', { class: 'grid grid-cols-[max-content_auto_max-content] grid-rows-8 bg-surface-900 py-1' });
      for (const [k, v] of levels) {
        const w = G ? (v / G) * 100 : 0;
        grid.append(h('div', { class: 'ml-3 flex items-center justify-end' }, h('span', { class: 'text-right text-xs font-semibold' }, k)),
          h('div', { class: 'm-2 flex items-center justify-center' }, h('div', { class: 'relative h-2 w-full rounded-sm bg-surface-800' }, h('div', { class: 'absolute left-0 h-2 rounded-sm bg-blue-300 transition-[width]', style: `width:${w > 100 ? 0 : w}%` }))),
          h('div', { class: 'mr-3 flex items-center justify-start' }, pct(v, G, 'text-xs')));
      }
      detailCol.append(grid);
      detailCol.append(h('div', { class: 'flex flex-col bg-surface-800 p-2' }, h('div', { class: 'font-bold' }, T('skill_tripods'))));
      const tri = (data.by_skill_tripod && data.by_skill_tripod[selected]) || Array(8).fill(0);
      const names = D.tripods[selected] || [];
      const triZh = (ZH.tripods_by_id && ZH.tripods_by_id[selected]) || {};
      [3, 3, 2].forEach((n, r) => {
        const row = h('div', { class: 'flex flex-row gap-px' });
        for (let i = 0; i < n; i++) {
          const idx = r * 3 + i, c = tri[idx] || 0, t = names[idx];
          if (!t) continue;
          const ratio = G ? c / G : 0;
          row.append(h('div', { class: `relative flex flex-1 flex-row items-center bg-surface-900 p-2 transition ${ratio < 0.05 ? 'opacity-40' : ''}` },
            h('div', { class: 'absolute inset-0 opacity-30 transition', style: `background-color:${gradBlue.rgbAt(clamp01(ratio))}` }),
            h('img', { class: 'relative mr-2 size-8 rounded-sm', alt: t[0], src: `${CDN}/icon/${t[1]}.png` }),
            h('div', { class: 'relative flex flex-1 flex-col' }, h('span', { class: 'text-xs font-semibold', title: t[0] }, triZh[idx] || tr('tripods', t[0], cls.num)), pct(c, G, 'text-xs'))));
        }
        detailCol.append(row);
      });
      detailCol.append(h('div', { class: 'flex flex-col bg-surface-800 p-2' }, h('div', { class: 'font-bold' }, T('skill_runes'))));
      const runeCounts = (data.by_skill_rune && data.by_skill_rune[selected]) || {};
      const m = new Map(); let n = 0;
      for (const [rid, cnt] of Object.entries(runeCounts)) {
        const r = D.runes[rid]; if (!r) continue;
        const key = `${r[0]}_${r[1]}_${rid}`;
        m.set(key, (m.get(key) || 0) + cnt); n += cnt;
      }
      // 同名同品級合併
      const merged = new Map();
      for (const [k, v] of m) { const [name, grade, rid] = k.split('_'); const kk = `${name}_${grade}`; const cur = merged.get(kk) || { v: 0, rid }; cur.v += v; merged.set(kk, cur); }
      let rows = Array.from(merged.entries()).map(([k, { v, rid }]) => [k.split('_')[0], +k.split('_')[1], v, n ? v / n : 0, rid]).sort((a, b) => b[2] - a[2]);
      const top = rows.slice(0, 5);
      if (rows.length > 5) { const rest = rows.slice(5).reduce((a, b) => a + b[2], 0); top.push([T('others'), -1, rest, n ? rest / n : 0, null]); }
      const rgrid = h('div', { class: 'grid grid-cols-[max-content_auto_max-content] bg-surface-900 py-1', style: `grid-template-rows:repeat(${top.length},minmax(0,1fr))` });
      for (const [name, grade, , ratio, rid] of top) {
        rgrid.append(h('div', { class: 'ml-3 flex items-center justify-end' }, h('span', { class: 'text-right text-xs font-semibold' }, h('span', { style: `color:${grade === -1 ? 'inherit' : D.colors.grade[grade] || 'inherit'}` }, grade === -1 ? name : trId('runes', rid, name)))),
          h('div', { class: 'm-2 flex items-center justify-center' }, h('div', { class: 'relative h-2 w-full rounded-sm bg-surface-800' }, h('div', { class: 'absolute left-0 h-2 rounded-sm bg-blue-300 transition-[width]', style: `width:${ratio * 100}%` }))),
          h('div', { class: 'mr-3 flex items-center justify-start' }, pct(ratio, 1, 'text-xs')));
      }
      if (!top.length) rgrid.append(h('div', { class: 'col-span-3' }, notEnough()));
      detailCol.append(rgrid);
    };
    renderList(); renderDetail();
  }

  async function renderCombos(filters) {
    secCombos.innerHTML = '';
    secCombos.append(sectionHeader(T('combos'), infoIcon(T('combos_tooltip'))));
    const body = h('div'); secCombos.append(body);
    if (filters.arkGridCores) {
      const btn = h('button', { type: 'button', class: 'btn border border-blue-300/40 text-sm max-md:w-full' }, T('clear_loadout'));
      btn.addEventListener('click', () => { state.arkGridCores = undefined; update(); });
      body.append(h('div', { class: 'flex flex-col items-center justify-center p-4' }, h('span', { class: 'pb-2 text-sm text-neutral-400' }, T('limited_to_loadout')), btn));
      return;
    }
    body.append(loadingEl());
    let data;
    try { data = await remote('statsArkGridCombinations', filters); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(filters)) return;
    body.innerHTML = '';
    if (!data || !data.by_bucket || data.total < 50) { body.append(notEnough()); return; }
    const cls = D.classes.find((c) => c.id === filters.classId);
    let rows = Object.entries(data.by_bucket).map(([k, v]) => ({ cores: k.split(',').map(Number), popularity: v / data.total })).filter((r) => r.cores.every((id) => coreMatchesEngraving(id, filters.classEngraving)));
    rows.sort((a, b) => b.popularity - a.popularity);
    const big = rows.filter((r) => r.popularity >= 0.05);
    rows = big.length > 3 ? big : rows.slice(0, 3);
    if (!rows.length) { body.append(notEnough()); return; }
    const grid = h('div', { class: 'grid grid-cols-[max-content_1fr] divide-y divide-neutral-950' });
    for (const r of rows) {
      const cells = h('div', { class: 'col-span-2 grid gap-2 divide-neutral-950 px-1 max-md:grid-rows-3 max-md:divide-y md:grid-cols-3 md:divide-x' });
      for (const id of r.cores) {
        const inst = D.cores.instances[id];
        const name = inst ? inst[0] : String(id);
        const cell = h('div', { class: 'flex flex-row items-center gap-2 px-1 py-3' },
          h('div', { class: 'relative' }, coreIcon(id, 'size-9 rounded-sm'), h('div', { class: `absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-tl-sm rounded-br-sm text-sm ${SLOT_BG[slotIndex(id)]}` }, slotIndex(id) + 1)),
          h('div', { class: 'flex flex-col' }, h('span', { class: 'text-xs text-surface-300' }, coreTypeFromName(name)), h('span', { class: 'text-sm', title: name }, coreName(name, cls.num, id))));
        attachTooltip(cell, () => coreTooltip(id));
        cells.append(cell);
      }
      const pc = r.popularity * 100;
      grid.append(h('div', { class: 'col-span-2 grid grid-cols-subgrid' }, cells,
        h('div', { class: 'col-span-2 grid grid-cols-subgrid items-center bg-surface-800 p-2' },
          h('span', { class: 'mr-4 text-sm' }, T('used_by'), h('span', { class: 'font-semibold', style: `color:${gradPop.rgbAt(clamp01(r.popularity))}` }, `${pc.toFixed(1)}%`)),
          h('div', { class: 'relative h-2 w-full rounded-sm bg-surface-700' }, h('div', { class: 'h-2 rounded-sm bg-blue-300 transition-[width]', style: `width:${pc}%` })))));
    }
    body.append(grid);
  }

  async function renderCores(filters) {
    secCores.innerHTML = '';
    secCores.append(sectionHeader(T('core_popularity')));
    const body = h('div'); secCores.append(body); body.append(loadingEl());
    let data;
    try { data = await remote('statsArkGridCore', filters); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(filters)) return;
    body.innerHTML = '';
    if (!data || !data.by_bucket || data.total < 50) { body.append(notEnough()); return; }
    const cls = D.classes.find((c) => c.id === filters.classId);
    const slots = Array.from({ length: 6 }, () => ({}));
    for (const [id, cnt] of Object.entries(data.by_bucket)) {
      const inst = D.cores.instances[id]; if (!inst) continue;
      const [, order, type, nameId] = inst;
      if (!coreMatchesEngraving(id, filters.classEngraving)) continue;
      const slot = order * 3 + type;
      slots[slot][nameId] = (slots[slot][nameId] || 0) + cnt;
    }
    const slotData = slots.map((m) => { const entries = Object.entries(m).map(([k, v]) => [parseInt(k), v]).sort((a, b) => b[1] - a[1]); return { total: entries.reduce((a, [, v]) => a + v, 0), entries }; });
    const list = h('div', { class: 'flex flex-col gap-px' });
    for (const s of filters.arkGridCores ? [3, 4, 5] : [0, 1, 2, 3, 4, 5]) {
      const sd = slotData[s]; const o = Math.floor(s / 3), t = s % 3;
      list.append(h('div', { class: 'flex flex-row items-center gap-1 bg-surface-800 p-2 font-semibold' }, h('img', { class: 'size-6', alt: '', src: `${CDN}/ui/emoticon_arkgrid_${o === 0 ? 'order' : 'chaos'}_${['sun', 'moon', 'star'][t]}.png` }), coreTypeLabel(o, t)));
      if (sd.total < 50) { list.append(h('div', { class: 'flex flex-col border-b border-neutral-900 p-2 last:border-0' }, h('span', { class: 'text-neutral-600 italic' }, T('not_enough')))); continue; }
      list.append(barList(sd.entries, {
        getWidth: (v) => v / sd.total, cls: 'bg-surface-950/20',
        icon: (nameId) => { const nm = D.cores.names[nameId]; const baseId = nm ? nm[2] : null; const el = coreIcon(baseId, 'mr-2 size-10 rounded-sm'); if (baseId) attachTooltip(el, () => coreTooltip(baseId)); return el; },
        key: (nameId) => { const nm = D.cores.names[nameId]; const en = nm ? nm[0].replace(/<[^>]+>/g, '') : String(nameId); const el = h('span', { class: 'cursor-default', title: en }, nm ? coreName(`x: ${en}`, cls.num, nm[2]) : en); if (nm) attachTooltip(el, () => coreTooltip(nm[2])); return el; },
        value: (v) => h('span', null, `${((v / sd.total) * 100).toFixed(2)}%`),
      }));
    }
    body.append(list);
  }

  const isDebuff = (id) => [800, 801, 802, 803, 1800, 1801, 1802, 1803].includes(id);
  async function renderEngravings(filters) {
    secEng.innerHTML = '';
    secEng.append(sectionHeader(T('engravings')));
    const body = h('div'); secEng.append(body); body.append(loadingEl());
    let data;
    try { data = await remote('statsEngraving', filters); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(filters)) return;
    body.innerHTML = '';
    if (!data || !data.by_bucket || data.total < 50) { body.append(notEnough()); return; }
    const m = new Map();
    for (let [id, cnt] of Object.entries(data.by_bucket)) {
      id = +id; if (isDebuff(id)) continue;
      const e = D.engravings[id]; if (!e) continue;
      if (e[3] && D.engravings[id - 1000]) id -= 1000;
      m.set(id, (m.get(id) || 0) + cnt);
    }
    const total = data.total;
    const all = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const shown = all.filter(([, v]) => v / total > 0.005);
    body.append(barList(shown, {
      getWidth: (v) => v / total,
      icon: (id) => h('img', { class: 'mr-3 size-8', alt: D.engravings[id][0], src: `${CDN}/icon/${D.engravings[id][1]}.png` }),
      key: (id) => h('span', { title: D.engravings[id][0] }, tr('engravings', D.engravings[id][0])),
      value: (v) => h('span', null, `${fmt(v)} (${((v / total) * 100).toFixed(2)}%)`),
    }));
    if (all.length - shown.length > 0) body.append(h('div', { class: 'flex flex-row bg-surface-900 px-2 py-1' }, h('span', { class: 'text-neutral-600 italic' }, T('entries_hidden', { n: all.length - shown.length }))));
  }

  function update() {
    setQuery(snapshot());
    renderFilters();
    const f = snapshot();
    renderSkills(f); renderCombos(f); renderCores(f); renderEngravings(f);
  }
  update();
}
