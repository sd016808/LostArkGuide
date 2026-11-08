/* 團本表現 (/stats/raids) */
import {
  h, T, tr, D, addUi, loadExtra, remote, card, sectionHeader, loadingEl, errorEl, infoIcon, toggleBtn, select, filterRow, filterPanel, setQuery,
  shortNum, relTime, gradPink, clamp01, diffBadge, diffName, bossName, raidName, specName, classByEn, className, poweredBy, mountChart, ECH_BASE, ORIGIN, $, esc, PATCH_LABEL, gateLabel,
} from '../common.js';

addUi({
  absolute_perf: '絕對表現', relative_perf: '相對表現', clear_rate: '通關率',
  raid: '團本', difficulty: '難度', damage_type: '傷害類型', filter_by: '篩選依據', additional: '其他選項', patch: '版本', sort_by: '排序依據',
  include_bus: '包含代打', include_weird: '包含特殊隊伍', combat_power: '戰鬥力',
  tip_dps: '以一般 DPS 計算', tip_ndps: '以 nDPS（中性 DPS）計算：不含任何外部增益的純個人輸出。', tip_rdps: '以 rDPS（團隊貢獻 DPS）計算：玩家增益帶來的傷害算在該玩家身上。',
  tip_udps: '以 uDPS（無增益 DPS）計算：根據遊戲內戰鬥分析器，不含輔助增益的傷害。', tip_stagger: '以癱瘓傷害計算（持續可癱瘓的戰鬥使用每分鐘癱瘓值）。',
  tip_filter_ilvl: '依玩家裝備等級篩選', tip_filter_cp: '依玩家戰鬥力篩選。七月平衡版本之前的版本無此資料。',
  tip_bus: '包含代打場次中的玩家紀錄（被代打者不列入統計）。', tip_weird: '包含特殊隊伍組成的紀錄，例如多名輔助或「公主製造機」督軍。',
  ilvl_range_stats: '顯示裝等 {min} 到 {max} 的紀錄', cp_range_stats: '顯示戰鬥力 {min} 到 {max} 的紀錄',
  perf_title: '{dps} 表現', support_uptime: '輔助增益覆蓋率', support_contribution: '輔助 {x}',
  best: '最佳', ceiling: '上限', q3: 'Q3', median: '中位數', q1: 'Q1', floor: '下限', popularity: '熱門度',
  logs_n: '{n} 筆紀錄', click_to_view_log: '點擊查看紀錄', details: '詳細資料', click_row: '點選圖中任一列以查看詳細資料。',
  recorded_logs: '{n} 筆紀錄', sample_runs: '範例場次', sample_tip: '隨機抽樣 DPS 落在指定分界點 ±10% 內的場次；「最佳」顯示玩家的前 5 高紀錄。',
  run: '場次', cp_short: '戰鬥力', age: '時間', show_more: '顯示更多', show_less: '收合', not_enough_logs: '紀錄不足',
  dps_by_cp: '{dps} ／ 戰鬥力', dps_by_cp_tip: '每一點戰鬥力所造成的 {dps}。若全團每人只有 1 點戰鬥力，這就是預期的平均 {dps}。計算方式為各角色 {dps} 除以戰鬥力後取平均。',
  better_than_avg: '比平均職業好 {p}%', worse_than_avg: '比平均職業差 {p}%', worse_than_top: '比最強職業差 {p}%',
  overall_clear: '整體通關率：', daily_clear: '每日通關率', daily_activity: '每日活躍度', no_attempts: '過去 14 天沒有這個團本／難度的紀錄。',
  relative_attempts: '相對嘗試次數', partial: '（部分）',
  how_to_read: '如何閱讀這張圖？',
  how_to_read_text: '每個職業在團本中的表現以箱型圖表示。中間的直線是「中位數」：一半的紀錄比它低、一半比它高，是衡量職業平均表現的好指標。方框代表中間 50% 的紀錄範圍；方框越窄，輸出越穩定。左右兩側的線是「下限」與「上限」，代表預期的最低／最高 DPS，超出範圍的屬於極端值。菱形是記錄到的「最佳」一場；點擊菱形可開啟該場紀錄，點選列可在側欄查看其他優秀場次。',
});

const DPS_TYPES = ['dps', 'ndps', 'rdps', 'udps', 'stagger'];
const DPS_LABEL = { dps: 'DPS', udps: 'uDPS', ndps: 'nDPS', rdps: 'rDPS', bdps: 'bDPS', stagger: '癱瘓', spm: '每分鐘癱瘓', contribution: '貢獻度', r_contribution: 'r貢獻度' };
const SUP_STAT = { '1_support_ap': '攻擊力增益', '2_support_brand': '烙印', '3_support_identity': '特性增益', '4_support_hyper': '超覺醒技能' };
const CP_MIN = 1000, CP_MAX = 15000, ILVL_MAX = 1810;

export async function render(root) {
  await loadExtra('raids');
  const R = D.raids;
  const byBoss = {}; for (const r of R.raids) for (const g of r.gates) for (const b of g.bosses) byBoss[b] = [r, g];
  const byRaidName = {}; for (const r of R.raids) for (const g of r.gates) byRaidName[g.raidName] = [r, g];
  const byCategory = {}; for (const r of R.raids) (byCategory[r.category] ||= []).push(r);
  const findRaid = (boss, diff) => { for (const r of R.raids) { if (!r.difficulties.some((d) => d.difficulty === diff)) continue; const g = r.gates.find((g) => g.bosses.includes(boss)); if (g) return [r, g]; } return byBoss[boss]; };
  const gateKey = (r, g) => JSON.stringify([r.category, r.name, g.name]);
  const staggerType = (dpsType, boss) => (dpsType === 'stagger' ? (byBoss[boss] && byBoss[boss][1].staggerDpsType) || 'stagger' : dpsType);
  const patchStart = (api) => { const p = R.patches.find((x) => x.apiName === api); return p ? new Date(p.startDate) : null; };
  const stoppedBefore = (raid, api) => { const ps = patchStart(api); return !!ps && !!raid.stoppedAcceptingStatsAt && new Date(raid.stoppedAcceptingStatsAt) <= ps; };
  const isSupportSpec = (s) => ['Desperate Salvation', 'Full Bloom', 'Blessed Aura', 'Liberator', 'Princess'].includes(s);
  const classColor = (en) => R.classColors[en] || '#8ec5ff';
  const raidTitle = (r, g) => `${raidName(r.name)} ${gateLabel(g.name)}`;

  // ---- 狀態 ----
  const q = new URLSearchParams(location.search);
  const st = { boss: q.get('boss') || R.defaults.boss, difficulty: q.get('difficulty') || R.defaults.difficulty, patch: q.get('patch') || R.defaults.patch, filterBy: q.get('filterBy') || 'ilvl',
    minIlvl: undefined, maxIlvl: undefined, minCombatPower: undefined, maxCombatPower: undefined, bus: q.get('bus') === 'true', weird: q.get('weird') === 'true', dpsType: q.get('type') || 'ndps', sort: 'Median' };
  if (!byBoss[st.boss]) st.boss = R.defaults.boss;
  const diffInfo = () => { const [r] = findRaid(st.boss, st.difficulty) || byBoss[st.boss]; return r.difficulties.find((d) => d.difficulty === st.difficulty) || r.difficulties[r.difficulties.length - 1]; };
  function normalize() {
    const [r] = byBoss[st.boss];
    if (!r.difficulties.some((d) => d.difficulty === st.difficulty)) st.difficulty = r.difficulties[r.difficulties.length - 1].difficulty;
    const di = diffInfo();
    if (st.filterBy === 'ilvl') {
      st.minCombatPower = st.maxCombatPower = undefined;
      if (st.minIlvl === undefined) st.minIlvl = Number(q.get('minGearScore')) || di.minItemLevel || 1600;
      if (st.maxIlvl === undefined) st.maxIlvl = Number(q.get('maxGearScore')) || di.defaultMax || ILVL_MAX;
      st.minIlvl = Math.max(st.minIlvl, di.minItemLevel || 1600);
    } else {
      st.minIlvl = st.maxIlvl = undefined;
      if (st.minCombatPower === undefined) st.minCombatPower = Number(q.get('minCombatPower')) || CP_MIN;
      if (st.maxCombatPower === undefined) st.maxCombatPower = Number(q.get('maxCombatPower')) || CP_MAX;
    }
    const patch = R.patches.find((p) => p.apiName === st.patch);
    if (patch && patch.hasNoCombatPowerData && st.filterBy === 'combat_power') st.filterBy = 'ilvl';
    if (patch && patch.hasNoCombatPowerData && st.dpsType === 'udps') st.dpsType = 'dps';
    if (patch && patch.hasNoStaggerData && st.dpsType === 'stagger') st.dpsType = 'dps';
    if (stoppedBefore(r, st.patch)) { const alt = R.raids.find((x) => !stoppedBefore(x, st.patch)); if (alt) st.boss = alt.gates[0].bosses[0]; }
  }
  const snap = () => ({ boss: st.boss, difficulty: st.difficulty, patch: st.patch, filterBy: st.filterBy, minIlvl: st.minIlvl, maxIlvl: st.maxIlvl, minCombatPower: st.minCombatPower, maxCombatPower: st.maxCombatPower, bus: st.bus, weird: st.weird, dpsType: st.dpsType, sort: st.sort });
  const stale = (f) => JSON.stringify(f) !== JSON.stringify(snap());
  let selectedSpec = null;

  // ---- 版面 ----
  const secMain = h('div', { class: 'grid gap-3' });
  const sideBox = h('div', { class: 'flex flex-col gap-4 sticky top-20' });
  const detailsBox = card();
  const secRelative = h('div'), secClear = h('div');
  const title = (t) => [h('div', { class: 'w-full pt-4 text-2xl font-bold max-sm:px-2 sm:px-4' }, t), h('div', { class: 'mt-2 h-px bg-surface-900 sm:mx-4' })];
  root.append(h('main', { class: 'mx-auto max-w-7xl' },
    ...title(T('absolute_perf')),
    h('div', { class: 'flex w-full flex-col-reverse gap-4 px-0.5 py-4 sm:px-4 xl:grid xl:grid-cols-[1fr_20rem]' }, h('div', null, secMain), h('div', null, sideBox)),
    ...title(T('relative_perf')), secRelative,
    ...title(T('clear_rate')), secClear));

  // ---- 篩選面板 ----
  function renderFilters() {
    sideBox.innerHTML = '';
    const [raid] = byBoss[st.boss];
    const raidOpts = Object.entries(byCategory).map(([cat, raids]) => ({ group: tr('raid_categories', cat), options: raids.filter((r) => !stoppedBefore(r, st.patch)).flatMap((r) => r.gates.map((g) => ({ value: gateKey(r, g), label: raidTitle(r, g) }))) })).filter((g) => g.options.length);
    const curGate = findRaid(st.boss, st.difficulty) || byBoss[st.boss];
    const raidSel = select(raidOpts, gateKey(curGate[0], curGate[1]), (v) => { const [cat, name, gate] = JSON.parse(v); const r = R.raids.find((x) => x.category === cat && x.name === name); const g = r.gates.find((x) => x.name === gate); st.boss = g.bosses[0]; st.minIlvl = st.maxIlvl = undefined; selectedSpec = null; update(); });
    const diffs = h('div', { class: 'flex flex-wrap gap-2 p-2' }, ...raid.difficulties.map((d) => toggleBtn(diffName(d.difficulty), st.difficulty === d.difficulty, () => { st.difficulty = d.difficulty; st.minIlvl = st.maxIlvl = undefined; selectedSpec = null; update(); })));
    const patch = R.patches.find((p) => p.apiName === st.patch) || {};
    const dmg = h('div', { class: 'flex flex-wrap gap-2 p-2' }, ...DPS_TYPES.map((t) => toggleBtn(DPS_LABEL[t], st.dpsType === t, () => { st.dpsType = t; update(); }, T('tip_' + t), (t === 'udps' && patch.hasNoCombatPowerData) || (t === 'stagger' && patch.hasNoStaggerData))));
    const fb = h('div', { class: 'flex gap-2 p-2' }, toggleBtn(T('item_level'), st.filterBy === 'ilvl', () => { st.filterBy = 'ilvl'; st.minIlvl = st.maxIlvl = undefined; update(); }, T('tip_filter_ilvl')), toggleBtn(T('combat_power'), st.filterBy === 'combat_power', () => { st.filterBy = 'combat_power'; st.minCombatPower = st.maxCombatPower = undefined; update(); }, T('tip_filter_cp'), patch.hasNoCombatPowerData));
    const di = diffInfo();
    let rangeRow;
    if (st.filterBy === 'ilvl') {
      const mn = di.minItemLevel || 1600;
      rangeRow = filterRow(T('item_level'), rangeInput(mn, ILVL_MAX, 10, st.minIlvl, st.maxIlvl, (a, b) => T('ilvl_range_stats', { min: a, max: b }), (a, b) => { st.minIlvl = a; st.maxIlvl = b; update(); }));
    } else {
      rangeRow = filterRow(T('combat_power'), rangeInput(CP_MIN, CP_MAX, 250, st.minCombatPower, st.maxCombatPower, (a, b) => T('cp_range_stats', { min: a, max: b }), (a, b) => { st.minCombatPower = a; st.maxCombatPower = b; update(); }));
    }
    const extra = h('div', { class: 'flex gap-2 p-2' }, toggleBtn(T('include_bus'), st.bus, () => { st.bus = !st.bus; update(); }, T('tip_bus')), toggleBtn(T('include_weird'), st.weird, () => { st.weird = !st.weird; update(); }, T('tip_weird')));
    const patchSel = select(R.patches.map((p) => ({ value: p.apiName, label: PATCH_LABEL[p.apiName] || p.name, disabled: !!raid.stoppedAcceptingStatsAt && new Date(p.startDate) >= new Date(raid.stoppedAcceptingStatsAt) })), st.patch, (v) => { st.patch = v; update(); }, 'box-border flex w-full rounded-sm border border-neutral-600 bg-neutral-800 p-2 text-white focus:outline-none');
    const sorts = h('div', { class: 'flex flex-wrap gap-2 p-2' }, ...[['Floor', T('floor')], ['Q1', 'Q1'], ['Median', T('median')], ['Q3', 'Q3'], ['Ceiling', T('ceiling')], ['Best', T('best')], ['Popularity', T('popularity')]].map(([k, l]) => toggleBtn(l, st.sort === k, () => { st.sort = k; update(); })));
    sideBox.append(filterPanel(filterRow(T('raid'), raidSel), filterRow(T('difficulty'), diffs), filterRow(T('damage_type'), dmg), filterRow(T('filter_by'), fb), rangeRow, filterRow(T('additional'), extra), filterRow(T('patch'), h('div', { class: 'p-2' }, patchSel)), filterRow(T('sort_by'), sorts)));
    sideBox.append(detailsBox);
  }
  function rangeInput(min, max, step, lo, hi, label, onCommit) {
    const loI = h('input', { type: 'range', min, max, step, value: lo }), hiI = h('input', { type: 'range', min, max, step, value: hi });
    const fill = h('div', { class: 'fill' }), lab = h('span', { class: 'my-1 text-sm' });
    const sync = (w) => { let a = +loI.value, b = +hiI.value; if (a > b) { if (w === 'lo') { b = a; hiI.value = b; } else { a = b; loI.value = a; } } const pct = (v) => ((v - min) / (max - min)) * 100; fill.style.left = pct(a) + '%'; fill.style.width = pct(b) - pct(a) + '%'; lab.textContent = label(a, b); return [a, b]; };
    sync(); loI.addEventListener('input', () => sync('lo')); hiI.addEventListener('input', () => sync('hi'));
    const commit = () => { const [a, b] = sync(); onCommit(a, b); }; loI.addEventListener('change', commit); hiI.addEventListener('change', commit);
    return h('div', { class: 'm-2 flex flex-col' }, h('div', { class: 'range-wrap mx-2 my-3' }, h('div', { class: 'track' }), fill, loI, hiI), lab);
  }

  // ---- 箱型圖 ----
  const sortStats = (stats, sort, supportUptime) => {
    const key = { Median: 'median', Floor: 'lowerWhisker', Ceiling: 'upperWhisker', Q1: 'q1', Q3: 'q3', Best: 'max', Popularity: 'count' }[sort] || 'median';
    if (supportUptime) { const k = ['Median', 'Best', 'Popularity'].includes(sort) ? 'median' : key; return stats.slice().sort((a, b) => (a.stat === b.stat ? a[k] - b[k] : -String(a.stat).localeCompare(String(b.stat)))); }
    return stats.slice().sort((a, b) => a[key] - b[key]);
  };
  const specLabel = (s) => `${specName(s.spec)}（${s.count}）`;
  async function boxplot(el, items, { height, fmtVal, label, best, tooltip, bestTooltip, onBest, onCategory, xName }) {
    const axisColor = 'oklch(0.87 0 0)';
    let hoveringBest = false;
    const series = [{ type: 'boxplot', data: items.map((e) => ({ name: label(e), value: [e.lowerWhisker, e.q1, e.median, e.q3, e.upperWhisker], itemStyle: { color: classColor(e.class), borderColor: 'oklch(0.556 0 0)' }, emphasis: { disabled: true }, item: e })) }];
    if (best) series.push({ type: 'scatter', symbol: 'diamond', symbolSize: 12.5, name: 'best_point', data: items.map((e) => ({ name: label(e), value: e.max, itemStyle: { color: axisColor }, emphasis: { itemStyle: { color: classColor(e.class) } }, item: e })) });
    const inst = await mountChart(el, {
      ...ECH_BASE,
      tooltip: { trigger: 'axis', backgroundColor: '#262626', borderColor: '#404040', textStyle: { color: '#e5e5e5' }, formatter(e) { const d = e[0] && e[0].data; if (!d || !d.item) return ''; return hoveringBest && bestTooltip ? bestTooltip(d.item) : tooltip(d.item, e[0].dataIndex); }, axisPointer: { type: 'cross', label: { formatter(e) { return e.axisDimension === 'x' ? fmtVal(e.value) : e.value; } } } },
      yAxis: { type: 'category', axisLabel: { interval: 0, color: axisColor }, axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(150,150,150,0.2)' } }, axisTick: { alignWithLabel: true }, data: items.map(label) },
      xAxis: { name: xName, nameLocation: 'end', nameGap: 0, nameTextStyle: { align: 'right', verticalAlign: 'bottom', color: '#a3a3a3' }, type: 'value', axisLabel: { color: axisColor, formatter: fmtVal }, axisLine: { show: true }, axisTick: { show: true }, splitLine: { show: false } },
      series,
    });
    if (best) {
      inst.on('mouseover', { seriesName: 'best_point' }, () => (hoveringBest = true));
      inst.on('mouseout', { seriesName: 'best_point' }, () => (hoveringBest = false));
      inst.on('click', { seriesName: 'best_point' }, (e) => e.data && e.data.item && onBest && onBest(e.data.item));
    }
    inst.getZr().on('click', (e) => { const pt = inst.convertFromPixel('grid', [e.offsetX, e.offsetY]); const i = Math.round(pt[1]); if (i >= 0 && i < items.length && onCategory) onCategory(items[i]); });
    return inst;
  }
  const rangeText = (f) => (f.minIlvl ? `${f.minIlvl}-${f.maxIlvl} ${T('item_level')}` : `${f.minCombatPower}-${f.maxCombatPower} ${T('combat_power')}`);
  const rows = (arr, hl) => arr.map(([k, key, v]) => `<div class="flex justify-between min-w-36 w-full ${hl === key ? 'font-bold' : ''}"><div>${k}</div><div>${v}</div></div>`).join('');
  const getValue = (t, enc) => ({ udps: enc.udps, bdps: enc.bdps, ndps: enc.ndps ?? 0, rdps: enc.rdps ?? 0, stagger: enc.stagger ?? 0, spm: enc.staggerPerMinute ?? enc.stagger ?? 0 }[t] ?? enc.dps);

  async function perfSection(f, { support, supportDpsType }) {
    const wrap = card();
    const bossApi = (R.bossAlias[f.boss] && R.bossAlias[f.boss][f.difficulty]) || f.boss;
    const dpsType = supportDpsType || staggerType(f.dpsType, f.boss);
    const arg = { boss: bossApi, difficulty: f.difficulty, isSupport: support, filterBy: f.filterBy, dpsType, minGearScore: f.minIlvl, maxGearScore: f.maxIlvl, minCombatPower: f.minCombatPower, maxCombatPower: f.maxCombatPower, includeBus: f.bus || undefined, includeWeird: f.weird || undefined, patch: f.patch };
    const height = supportDpsType ? 150 : support ? 400 : 1000;
    wrap.append(loadingEl(Math.min(height, 400)));
    let data;
    try { data = await remote('raidStatsSearch', arg); } catch (e) { wrap.innerHTML = ''; wrap.append(errorEl(e)); return wrap; }
    if (stale(f)) return wrap;
    wrap.innerHTML = '';
    const uptime = support && !supportDpsType;
    let stats = (data && data.stats) || [];
    stats = uptime ? stats.filter((s) => s.stat) : stats.filter((s) => !s.stat);
    if (!stats.length) { return null; }
    const items = sortStats(stats, f.sort, uptime);
    const [r, g] = findRaid(f.boss, f.difficulty) || byBoss[f.boss];
    const headTitle = supportDpsType ? T('support_contribution', { x: DPS_LABEL[supportDpsType] }) : uptime ? T('support_uptime') : T('perf_title', { dps: DPS_LABEL[dpsType] });
    const head = h('div', { class: 'flex flex-row items-center justify-between bg-black/10 px-3 py-2' }, h('span', { class: 'inline-flex flex-wrap items-center gap-1 font-bold' }, `${raidTitle(r, g)} · `, diffBadge(f.difficulty), `：${headTitle}`));
    if (!support) head.append(infoIcon(T('how_to_read_text')), h('span', { class: 'ml-1 text-xs text-neutral-400' }, T('how_to_read')));
    wrap.append(head);
    if (data.timestamp) wrap.append(h('div', { class: 'px-3 py-2 text-sm text-neutral-400' }, T('last_updated', { t: relTime(new Date(data.timestamp).getTime()) })));
    const chartEl = h('div', { style: `height:${height}px` });
    wrap.append(h('div', null, chartEl));
    const fmtVal = uptime ? (e) => (Number(e) * 100).toFixed(0) + '%' : supportDpsType && dpsType.includes('contribution') ? (e) => (Number(e) * 100).toFixed(1) + '%' : (e) => shortNum(Number(e));
    const label = uptime ? (s) => `${className(classByEn(s.class) ? classByEn(s.class).id : s.class)} ${SUP_STAT[s.stat] || s.stat}` : specLabel;
    const valueLabel = dpsType.includes('contribution') ? DPS_LABEL[dpsType] : DPS_LABEL[dpsType];
    boxplot(chartEl, items, {
      height, fmtVal, label, best: !uptime,
      xName: `[${diffName(f.difficulty)}] ${bossName(f.boss)} | ${rangeText(f)} ${headTitle} | lostark.bible`,
      tooltip: (s, i) => {
        const cls = className(classByEn(s.class) ? classByEn(s.class).id : s.class);
        if (uptime) return `<div class="flex flex-col text-neutral-200"><div class="font-medium">${esc(cls)}</div><div class="text-neutral-300 pb-2">${SUP_STAT[s.stat] || s.stat}</div><div class="text-xs pb-2"><span class="font-mono">${s.count}</span> ${T('logs_n', { n: '' }).trim()}</div>${rows([[T('ceiling'), 'upperWhisker', fmtVal(s.upperWhisker)], ['Q3', 'q3', fmtVal(s.q3)], [T('median'), 'median', fmtVal(s.median)], ['Q1', 'q1', fmtVal(s.q1)], [T('floor'), 'lowerWhisker', fmtVal(s.lowerWhisker)]])}</div>`;
        return `<div class="flex flex-col text-neutral-200"><div class="font-medium">#${items.length - i} ${esc(cls)}</div><div class="text-neutral-300">${esc(specName(s.spec))}</div><div class="text-xs">${rangeText(f)}</div><div class="text-xs pb-2"><span class="font-mono">${s.count}</span> ${T('logs_n', { n: '' }).trim()}</div>${rows([[T('best'), 'max', fmtVal(s.max)], [T('ceiling'), 'upperWhisker', fmtVal(s.upperWhisker)], ['Q3', 'q3', fmtVal(s.q3)], [T('median'), 'median', fmtVal(s.median)], ['Q1', 'q1', fmtVal(s.q1)], [T('floor'), 'lowerWhisker', fmtVal(s.lowerWhisker)]])}</div>`;
      },
      bestTooltip: (s) => { const e = s.topEncounters && s.topEncounters[0]; if (!e) return ''; const v = dpsType.includes('contribution') ? ((e.rContribution ?? e.contribution ?? 0) * 100).toFixed(2) + '%' : `${shortNum(getValue(dpsType, e))} ${valueLabel}`; return `<div class="flex flex-col text-neutral-200"><div class="font-medium">${e.gearScore} ${esc(className(classByEn(s.class) ? classByEn(s.class).id : s.class))}</div><div class="text-xs">${e.combatPower === '0' ? '-' : e.combatPower} ${T('cp_short')}</div><div class="text-neutral-300 pb-2">${esc(specName(s.spec))}</div><div>${v}</div><div class="pt-2 text-white">${T('click_to_view_log')}</div></div>`; },
      onBest: (s) => s.topEncounters && s.topEncounters[0] && window.open(`/logs/${s.topEncounters[0].id}`, '_blank'),
      onCategory: uptime ? null : (s) => { selectedSpec = { ...s, dpsType, contribution: dpsType.includes('contribution') }; renderDetails(f); },
    }).catch((e) => { chartEl.innerHTML = ''; chartEl.append(errorEl(e)); });
    return wrap;
  }

  // ---- 詳細資料側欄 ----
  async function renderDetails(f) {
    detailsBox.innerHTML = '';
    detailsBox.append(h('div', { class: 'bg-black/10 px-3 py-2 font-bold' }, T('details')));
    const s = selectedSpec;
    if (!s) { detailsBox.append(h('div', { class: 'px-3 py-2 text-neutral-300' }, T('click_row'))); return; }
    const cls = classByEn(s.class);
    const eng = cls && cls.engravings.find((e) => e.name === s.spec);
    const isContrib = s.contribution;
    const fv = (v) => (isContrib ? `${(v * 100).toFixed(1)}%` : shortNum(v));
    detailsBox.append(h('div', { class: 'p-2' },
      h('div', { class: 'flex flex-row items-center gap-2' }, eng ? h('img', { class: 'size-8 rounded-sm', alt: eng.name, src: `https://cdn.ags.lol/icon/${eng.icon}.png` }) : h('div', { class: 'size-8 rounded-sm bg-surface-800' }),
        h('div', { class: 'flex flex-1 flex-col' }, h('div', { class: 'text-sm font-bold' }, `${specName(s.spec)} ${cls ? className(cls.id) : s.class}`), h('div', { class: 'text-xs text-neutral-300' }, T('recorded_logs', { n: s.count.toLocaleString() })))),
      h('div', { class: 'grid grid-cols-[auto_max-content] pt-2 text-sm' }, ...[[T('best'), s.max], [T('ceiling'), s.upperWhisker], ['Q3', s.q3], [T('median'), s.median], ['Q1', s.q1], [T('floor'), s.lowerWhisker]].flatMap(([k, v]) => [h('div', null, k), h('div', { class: 'text-right' }, fv(v))]))));
    let mode = 'Best', shown = 5;
    const sel = select([{ value: 'Best', label: T('best') }, { value: 'Ceiling', label: T('ceiling') }, { value: 'Q3', label: 'Q3' }, { value: 'Median', label: T('median') }], mode, (v) => { mode = v; shown = 5; drawRuns(); }, 'mr-2 w-max appearance-none border-b-2 border-gray-500 bg-transparent py-0 pr-7 pl-0.5 text-sm text-white focus:outline-none');
    detailsBox.append(h('div', { class: 'flex flex-row items-center gap-1 py-1.5 pl-2' }, h('span', { class: 'text-sm font-semibold' }, T('sample_runs')), infoIcon(T('sample_tip')), h('div', { class: 'flex-1' }), sel));
    const runsEl = h('div', { class: 'grid grid-cols-[max-content_max-content_auto_auto_max-content_max-content] gap-x-2 gap-y-1 p-2 text-sm' });
    detailsBox.append(runsEl);
    const bossApi = (R.bossAlias[f.boss] && R.bossAlias[f.boss][f.difficulty]) || f.boss;
    let samples = null;
    const age = (d) => { const hrs = Math.floor((Date.now() - d.getTime()) / 36e5); if (hrs < 24) return `${hrs}h`; const days = Math.floor(hrs / 24); if (days < 7) return `${days}d`; const w = Math.floor(days / 7); return w < 4 ? `${w}w` : `${Math.max(1, Math.floor(days / 30))}mo`; };
    const drawRuns = () => {
      runsEl.innerHTML = '';
      const list = mode === 'Best' ? (s.topEncounters || []) : ((samples && samples[mode.toLowerCase()]) || []);
      const vis = list.slice(0, shown);
      runsEl.append(h('b', null, mode === 'Best' ? T('rank') || '排名' : T('run')), h('b', null, T('item_level')), h('b', null, T('cp_short')), h('b', null, isContrib ? DPS_LABEL.contribution : DPS_LABEL[s.dpsType] || 'DPS'), h('b', null, T('age')), h('span'));
      if (!vis.length) { runsEl.append(h('div', { class: 'col-span-4 text-neutral-300' }, samples === null && mode !== 'Best' ? T('loading') : T('not_enough_logs'))); return; }
      vis.forEach((e, i) => {
        const val = isContrib ? `${((e.rContribution ?? e.contribution ?? 0) * 100).toFixed(2)}%` : shortNum(getValue(s.dpsType, e));
        runsEl.append(h('a', { href: `/logs/${e.id}`, target: '_blank', class: 'col-span-6 grid cursor-pointer grid-cols-subgrid text-neutral-300 transition hover:bg-black/20' },
          h('div', { class: 'font-mono' }, `#${i + 1}`), h('div', null, (+e.gearScore).toFixed(2).replace(/\.?0+$/, '')), h('div', null, e.combatPower === '0' ? '-' : (+e.combatPower).toFixed(0)), h('div', { class: 'font-mono' }, val), h('div', { class: 'mr-2 font-mono' }, age(new Date(e.timestamp))), h('div', { class: 'flex items-center justify-end' }, '↗')));
      });
      if (shown > 5) { const b = h('button', { class: 'col-span-2 text-left text-neutral-400 hover:text-neutral-300' }, T('show_less')); b.addEventListener('click', () => { shown -= 5; drawRuns(); }); runsEl.append(b); }
      if (list.length > shown) { const b = h('button', { class: 'col-start-3 col-end-6 text-right text-neutral-400 hover:text-neutral-300' }, T('show_more')); b.addEventListener('click', () => { shown += 5; drawRuns(); }); runsEl.append(b); }
    };
    drawRuns();
    try {
      samples = await remote('raidSamplesSearch', { boss: bossApi, difficulty: f.difficulty, spec: s.spec, ceiling: s.upperWhisker, q3: s.q3, median: s.median, minGearScore: f.minIlvl, maxGearScore: f.maxIlvl, minCombatPower: f.minCombatPower, maxCombatPower: f.maxCombatPower, includeBus: f.bus || undefined, includeWeird: f.weird || undefined, patch: f.patch, statType: isContrib ? (f.dpsType === 'udps' ? 'contribution' : 'r_contribution') : s.dpsType });
    } catch (e) { samples = {}; }
    if (selectedSpec === s) drawRuns();
  }

  // ---- 相對表現：每點戰鬥力的 DPS ----
  async function renderRelative(f) {
    secRelative.innerHTML = '';
    const wrap = card(); secRelative.append(h('div', { class: 'flex flex-col gap-4 px-0.5 py-4 sm:px-4' }, wrap));
    wrap.append(loadingEl(300));
    const bossApi = (R.bossAlias[f.boss] && R.bossAlias[f.boss][f.difficulty]) || f.boss;
    const dpsType = ['dps', 'ndps', 'rdps', 'udps'].includes(f.dpsType) ? f.dpsType : 'ndps';
    let data;
    try { data = await remote('combatPowerDPSSearch', { boss: bossApi, difficulty: f.difficulty, patch: f.patch, dpsType }); } catch (e) { wrap.innerHTML = ''; wrap.append(errorEl(e)); return; }
    if (stale(f)) return;
    wrap.innerHTML = '';
    const items = (data || []).filter((e) => !isSupportSpec(e.spec)).sort((a, b) => a.avg - b.avg);
    const [r, g] = findRaid(f.boss, f.difficulty) || byBoss[f.boss];
    const dl = DPS_LABEL[dpsType];
    wrap.append(h('div', { class: 'flex flex-row items-center justify-between bg-black/10 px-3 py-2' }, h('span', { class: 'inline-flex flex-wrap items-center gap-1' }, h('span', { class: 'font-bold inline-flex items-center gap-1' }, `${raidTitle(r, g)} · `, diffBadge(f.difficulty), '：'), ` ${T('dps_by_cp', { dps: dl })}`), infoIcon(T('dps_by_cp_tip', { dps: dl }))));
    if (!items.length) { wrap.append(h('div', { class: 'p-3 text-center text-sm' }, T('not_enough'))); return; }
    const avg = items.reduce((a, b) => a + b.avg, 0) / items.length, max = Math.max(...items.map((e) => e.avg));
    const el = h('div', { class: 'h-[1000px] w-full' }); wrap.append(el);
    const axisColor = 'oklch(0.87 0 0)';
    mountChart(el, {
      ...ECH_BASE,
      tooltip: { trigger: 'axis', backgroundColor: '#262626', borderColor: '#404040', textStyle: { color: '#e5e5e5' }, formatter(e) { const s = e[0].data.stats; const r1 = (s.avg / avg) * 100 - 100, r2 = (s.avg / max) * 100 - 100; const cls = classByEn(s.class) ? className(classByEn(s.class).id) : s.class; return `<div class="flex flex-col text-neutral-200"><div class="font-medium">#${items.length - e[0].dataIndex} ${esc(cls)}</div><div class="text-neutral-300 pb-2">${esc(specName(s.spec))}</div><div>${s.avg.toLocaleString()} ${dl}／${T('combat_power')}</div><div class="text-neutral-400">${r1 > 0 ? `<span class='text-green-200'>${T('better_than_avg', { p: Math.abs(r1).toFixed(2) })}</span>` : `<span class='text-red-200'>${T('worse_than_avg', { p: Math.abs(r1).toFixed(2) })}</span>`}</div>${r2 < 0 ? `<div class="text-neutral-400"><span class='text-red-200'>${T('worse_than_top', { p: Math.abs(r2).toFixed(2) })}</span></div>` : ''}</div>`; }, axisPointer: { type: 'cross', label: { formatter(e) { return e.axisDimension === 'x' ? shortNum(e.value) : e.value; } } } },
      yAxis: { type: 'category', axisLabel: { interval: 0, color: axisColor }, axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(150,150,150,0.2)' } }, axisTick: { alignWithLabel: true }, data: items.map(specLabel) },
      xAxis: { name: `[${diffName(f.difficulty)}] ${bossName(f.boss)} | ${dl}／${T('combat_power')} | lostark.bible`, nameLocation: 'end', nameGap: 0, nameTextStyle: { align: 'right', verticalAlign: 'bottom', color: '#a3a3a3' }, type: 'value', axisLabel: { color: axisColor, formatter: (v) => shortNum(v) }, axisLine: { show: true }, axisTick: { show: true }, splitLine: { show: false } },
      series: [{ type: 'scatter', symbol: 'diamond', symbolSize: 12.5, data: items.map((e) => ({ name: e.spec, value: e.avg, itemStyle: { color: classColor(e.class) }, stats: e })) }],
    }).catch((e) => { el.innerHTML = ''; el.append(errorEl(e)); });
  }

  // ---- 通關率 ----
  async function renderClear(f) {
    secClear.innerHTML = '';
    const wrap = card(); secClear.append(h('div', { class: 'flex flex-col gap-4 px-0.5 py-4 sm:px-4' }, wrap, poweredBy()));
    wrap.append(loadingEl(300));
    const [r, g] = findRaid(f.boss, f.difficulty) || byBoss[f.boss];
    let data;
    try { data = await remote('raidClearRatesSearch', { raidName: g.raidName, difficulty: f.difficulty }); } catch (e) { wrap.innerHTML = ''; wrap.append(errorEl(e)); return; }
    if (stale(f)) return;
    wrap.innerHTML = '';
    const pctFmt = (v) => (v === null || v === undefined ? 'N/A' : `${Number(v).toFixed(1)}%`);
    const col = (v) => (v === null || v === undefined ? '#a3a3a3' : gradPink.hexAt(clamp01(v / 100)));
    wrap.append(h('div', { class: 'flex flex-wrap items-center justify-between gap-2 bg-black/10 px-3 py-2' }, h('h2', { class: 'flex flex-wrap items-center gap-1 font-bold' }, `${raidTitle(r, g)} `, h('span', { class: 'text-neutral-400' }, '·'), diffBadge(f.difficulty)), h('div', { class: 'text-sm text-neutral-400' }, T('overall_clear'), h('span', { class: 'ml-0.5 font-semibold', style: `color:${col(data.clearRate)}` }, pctFmt(data.clearRate)))));
    if (!data.clearRate && !(data.daily || []).length) { wrap.append(h('div', { class: 'flex min-h-64 items-center justify-center p-6 text-neutral-400' }, T('no_attempts'))); return; }
    const day = 864e5;
    const dfmt = new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric' });
    const weeks = []; const wcolors = ['#93c5fd', '#c4b5fd', '#fcd34d'];
    data.daily.forEach((d, i) => { const start = d.time - ((new Date(d.time).getUTCDay() + 4) % 7) * day; const last = weeks.at(-1); if (last && last.start === start) last.last = i; else weeks.push({ start, first: i, last: i, color: wcolors[weeks.length % 3] }); });
    wrap.append(h('div', { class: 'flex flex-wrap items-center divide-x divide-neutral-950 text-sm text-neutral-400' }, h('span', { class: 'p-2 pr-4' }, T('last_updated', { t: relTime(new Date(data.generatedAt).getTime()) })),
      h('div', { class: 'flex flex-wrap items-center gap-4 px-4 py-2' }, ...weeks.map((w) => h('span', { class: 'inline-flex items-center gap-1.5' }, h('span', { class: 'size-2 rounded-sm', style: `background-color:${w.color}` }), `${dfmt.format(w.start)} – ${dfmt.format(w.start + 6 * day)}`)))));
    const el1 = h('div', { class: 'h-[280px] w-full' }), el2 = h('div', { class: 'h-[180px] w-full' });
    wrap.append(h('div', null, h('h3', { class: 'px-3 pt-2 text-sm font-bold' }, T('daily_clear')), el1), h('div', null, h('h3', { class: 'px-3 pt-2 text-sm font-bold' }, T('daily_activity')), el2));
    const markArea = { silent: true, label: { show: false }, data: weeks.map((w) => [{ xAxis: String(data.daily[w.first].time), itemStyle: { color: w.color + '20' } }, { xAxis: String(data.daily[w.last].time) }]) };
    const base = { ...ECH_BASE, animation: false, grid: { left: 52, right: 24, top: 28, bottom: 32 },
      tooltip: { trigger: 'axis', confine: true, backgroundColor: '#171717', borderColor: '#404040', textStyle: { color: '#e5e5e5' }, formatter(e) { const t = e[0]; if (!t) return ''; const d = data.daily[t.dataIndex]; return `${new Date(d.time).toLocaleDateString('zh-TW')}${d.partial ? T('partial') : ''}<br/>${T('clear_rate')}: <span style="color:${col(d.clearRate)}">${pctFmt(d.clearRate)}</span><br/>${T('relative_attempts')}: ${d.activity.toLocaleString()}%`; } },
      xAxis: { type: 'category', boundaryGap: true, data: data.daily.map((d) => String(d.time)), axisLabel: { color: '#a3a3a3', hideOverlap: true, formatter: (v, i) => `${dfmt.format(Number(v))}${data.daily[i] && data.daily[i].partial ? '*' : ''}` }, axisLine: { lineStyle: { color: '#525252' } }, axisTick: { show: false } } };
    mountChart(el1, { ...base, yAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { color: '#a3a3a3', formatter: (v) => `${v}%` }, splitLine: { lineStyle: { color: '#404040', type: 'dashed' } } },
      series: [{ type: 'bar', data: [], silent: true, markArea }, { name: T('clear_rate'), type: 'line', data: data.daily.map((d) => ({ value: d.clearRate, itemStyle: { color: col(d.clearRate) }, label: { color: col(d.clearRate) } })), connectNulls: false, showSymbol: true, symbolSize: 7, lineStyle: { width: 2, color: '#a3a3a3' }, label: { show: true, position: 'top', fontSize: 11, formatter: (e) => (e.value === null ? '' : pctFmt(e.value)) }, labelLayout: { hideOverlap: true } }] }).catch(() => {});
    mountChart(el2, { ...base, yAxis: { type: 'value', min: 0, max: 100, interval: 50, axisLabel: { color: '#a3a3a3', formatter: (v) => `${v}%` }, splitLine: { show: false } },
      series: [{ name: T('relative_attempts'), type: 'bar', barMaxWidth: 44, data: data.daily.map((d, i) => ({ value: d.activity, itemStyle: { color: weeks.find((w) => i >= w.first && i <= w.last).color, opacity: d.partial ? 0.35 : 0.65 } })), itemStyle: { borderRadius: [2, 2, 0, 0] }, markArea }] }).catch(() => {});
  }

  async function renderMain(f) {
    secMain.innerHTML = '';
    const patch = R.patches.find((p) => p.apiName === f.patch) || {};
    const holders = [h('div'), h('div'), h('div'), h('div')];
    secMain.append(...holders, poweredBy());
    const put = (i, p) => p.then((el) => { if (!stale(f) && el) holders[i].append(el); });
    put(0, perfSection(f, { support: false }));
    if (f.dpsType !== 'stagger' && !patch.hasNoContributionData) put(1, perfSection(f, { support: true, supportDpsType: f.dpsType === 'udps' ? 'contribution' : 'r_contribution' }));
    if (f.dpsType === 'udps') put(2, perfSection(f, { support: true, supportDpsType: 'bdps' }));
    if (f.dpsType === 'rdps') put(2, perfSection(f, { support: true, supportDpsType: 'rdps' }));
    if (f.dpsType !== 'stagger') put(3, perfSection(f, { support: true }));
  }

  function update() {
    normalize();
    setQuery({ boss: st.boss, difficulty: st.difficulty, patch: st.patch, filterBy: st.filterBy, type: st.dpsType, minGearScore: st.minIlvl, maxGearScore: st.maxIlvl, minCombatPower: st.minCombatPower, maxCombatPower: st.maxCombatPower, bus: st.bus || undefined, weird: st.weird || undefined });
    renderFilters();
    const f = snap();
    selectedSpec = null;
    renderDetails(f);
    renderMain(f); renderRelative(f); renderClear(f);
  }
  update();
}
