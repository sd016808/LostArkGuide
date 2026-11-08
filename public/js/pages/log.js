/* 戰鬥紀錄 (/logs/:id) — lostark.bible 戰鬥紀錄頁的中文版（核心功能：傷害表、各技能明細、DPS 走勢） */
import {
  h, T, tr, trId, D, CDN, ORIGIN, addUi, loadExtra, card, sectionHeader, loadingEl, errorEl, infoIcon, toggleBtn,
  classIconEl, className, classByEn, specName, bossName, diffBadge, shortNum, fmtDuration, relTime, attachTooltip,
  mountChart, ECH_BASE, gradPink, clamp01,
} from '../common.js';

addUi({
  date: '日期', skills: '技能',
  log_cleared: '通關', log_failed: '未通關', log_duration: '戰鬥時間', log_total_damage: '總傷害', log_team_dps: '團隊 DPS',
  log_views: '{n} 次瀏覽', log_uploaded_by: '上傳者', log_bus: '代打', log_weird: '特殊隊伍', log_region: '地區',
  log_original: '英文原版完整分析（增益明細、配置快照等）', log_not_found: '找不到這筆紀錄。', log_too_many: '短時間內查看太多紀錄，請稍後再試。',
  tab_damage: '傷害', tab_rdps: '團隊貢獻', tab_taken: '承受傷害', tab_stagger: '癱瘓', tab_shield: '護盾',
  col_name: '角色', col_damage: '傷害', col_share: '佔比', col_crit: '暴擊率', col_back: '背擊傷害', col_front: '正擊傷害',
  col_ap: '攻擊力增益', col_brand: '烙印', col_identity: '特性增益', col_hat: '超覺醒', col_deaths: '死亡', col_parse: '百分位',
  col_rdps: 'rDPS', col_ndps: 'nDPS', col_given: '提供給隊友', col_received: '接受隊友加成',
  col_taken: '承受傷害', col_death_time: '死亡時間', col_incap: '倒地／控制',
  col_stagger: '癱瘓值', col_spm: '每分鐘',
  col_shield_given: '給予護盾', col_shield_received: '獲得護盾', col_absorbed_others: '為隊友吸收',
  party_n: '第 {n} 隊', party_other: '其他', party_total: '小計',
  click_player: '點選角色查看各技能傷害明細。', skills_of: '{name} 的技能明細',
  sk_skill: '技能', sk_casts: '施放', sk_cpm: '每分鐘施放', sk_hits: '命中', sk_max: '最高一擊', sk_avg_cast: '平均每次施放', sk_back: '背擊率', sk_front: '正擊率',
  hyper: '超覺醒',
  chart_title: 'DPS 走勢', chart_avg: '累計平均 DPS', chart_roll: '10 秒滾動 DPS', boss_hp: 'Boss 血量',
  tip_ap: '傷害中受到輔助「攻擊力增益」加成的比例。', tip_brand: '傷害中受到輔助「烙印」加成的比例。',
  tip_identity: '傷害中受到輔助「特性增益」加成的比例。', tip_hat: '傷害中受到輔助「超覺醒技能」加成的比例。',
  tip_parse: '這名角色在相同團本、難度與裝等區間中的排名百分位（輔助職業以貢獻度計算）。',
  tip_rdps: 'rDPS：把輔助增益帶來的傷害算回提供增益的人；nDPS：不含任何外部增益的純個人輸出。',
});

const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtPct = (v, d = 1) => `${v.toFixed(d)}%`;
const parseColor = (p) => (p >= 0.99 ? '#e5cc80' : p >= 0.95 ? '#e268a8' : p >= 0.75 ? '#ff8000' : p >= 0.5 ? '#a335ee' : p >= 0.25 ? '#0070ff' : '#1eff00');

async function fetchLog(id) {
  const r = await fetch(`/api/data/logs/${encodeURIComponent(id)}`);
  if (r.status === 429) throw new Error(T('log_too_many'));
  const j = await r.json();
  if (j.type !== 'data' || !Array.isArray(j.nodes)) throw new Error(j.status === 404 ? T('log_not_found') : (j.error && j.error.message) || 'bad data');
  const node = j.nodes[j.nodes.length - 1];
  if (!node || node.type === 'error') {
    const st = node && (node.status || (node.error && node.error.status));
    throw new Error(st === 429 ? T('log_too_many') : T('log_not_found'));
  }
  return devalue.unflatten(node.data);
}

export async function render(root, { match }) {
  const id = match[1];
  await Promise.all(['skills', 'raids'].map(loadExtra));
  const main = h('div', { class: 'mx-auto flex max-w-7xl flex-col gap-4 px-0.5 py-4 sm:px-4' });
  root.append(main);
  main.append(loadingEl(300));
  let data;
  try { data = await fetchLog(id); } catch (e) { main.innerHTML = ''; main.append(errorEl(e)); return; }
  main.innerHTML = '';

  const info = data.encounterInfo;
  const enc = info.encounter;
  const eds = enc.encounterDamageStats;
  const misc = eds.misc || {};
  const durMs = enc.duration || 1;
  const durS = durMs / 1000;
  const players = (enc.entityList || []).filter((e) => e.entityType === 'PLAYER');
  const colors = (D.raids && D.raids.classColors) || {};
  const totalDamage = players.reduce((a, p) => a + (p.damageStats.damageDealt || 0), 0) || eds.totalDamageDealt;

  const displayName = (p) => {
    const m = p.name.match(/^(.+) #(\d+)$/);
    const c = classByEn(p.class);
    if (m && c && m[1] === p.class) return `${className(c.id)} #${m[2]}`;
    return p.name;
  };
  const clsOf = (p) => classByEn(p.class);
  const parseOf = (p) => {
    const v = (info.parseInfo && info.parseInfo[p.name]) ?? (info.contributionParseInfo && info.contributionParseInfo[p.name]);
    return typeof v === 'number' ? v : null;
  };
  document.title = `${bossName(enc.currentBossName)} | ${T('combat_log')} | ${T('site_title')}`;

  // ---------- 標頭 ----------
  const stat = (label, value) => h('div', { class: 'flex flex-col' }, h('span', { class: 'text-xs text-neutral-400' }, label), h('span', { class: 'text-lg font-semibold' }, value));
  const badges = [];
  if (misc.raidClear !== undefined) badges.push(h('span', { class: `rounded-sm px-2 py-0.5 text-sm ${misc.raidClear ? 'bg-green-700/70' : 'bg-red-800/70'}` }, misc.raidClear ? T('log_cleared') : T('log_failed')));
  if (info.isBus) badges.push(h('span', { class: 'rounded-sm bg-amber-700/70 px-2 py-0.5 text-sm' }, T('log_bus')));
  if (info.isWeird) badges.push(h('span', { class: 'rounded-sm bg-violet-700/70 px-2 py-0.5 text-sm' }, T('log_weird')));
  main.append(card(
    h('div', { class: 'flex flex-col gap-3 p-4' },
      h('div', { class: 'flex flex-wrap items-center gap-2' },
        h('h1', { class: 'text-2xl font-bold' }, bossName(enc.currentBossName)),
        enc.difficulty ? h('span', { class: 'rounded-sm bg-neutral-800 px-2 py-0.5 text-sm' }, diffBadge(enc.difficulty)) : null,
        ...badges,
        h('div', { class: 'flex-1' }),
        h('a', { href: `${ORIGIN}/logs/${id}`, target: '_blank', rel: 'noopener', class: 'text-sm text-neutral-400 underline hover:text-white' }, T('log_original'))),
      h('div', { class: 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6' },
        stat(T('log_duration'), fmtDuration(durMs)),
        stat(T('log_total_damage'), shortNum(totalDamage, 2)),
        stat(T('log_team_dps'), shortNum(eds.dps || totalDamage / durS, 2)),
        stat(T('date'), new Date(enc.fightStart).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
        stat(T('log_region'), misc.region || '—'),
        stat(T('log_uploaded_by'), (info.uploader && info.uploader.username) || '—')),
      h('div', { class: 'text-xs text-neutral-500' }, T('log_views', { n: (data.views || 0).toLocaleString() }), ` · ${relTime(enc.fightStart)}`))));

  // ---------- 隊伍分組 ----------
  const byName = new Map(players.map((p) => [p.name, p]));
  const parties = [];
  const seen = new Set();
  for (const [k, names] of Object.entries(misc.partyInfo || {})) {
    const list = names.map((n) => byName.get(n)).filter(Boolean);
    list.forEach((p) => seen.add(p.name));
    if (list.length) parties.push({ label: T('party_n', { n: Number(k) + 1 }), list });
  }
  const rest = players.filter((p) => !seen.has(p.name));
  if (rest.length) parties.push({ label: parties.length ? T('party_other') : '', list: rest });

  // ---------- 主表 ----------
  const TABS = {
    damage: {
      label: T('tab_damage'),
      value: (p) => p.damageStats.damageDealt || 0,
      cols: [
        [T('col_damage'), (p) => shortNum(p.damageStats.damageDealt || 0, 2)],
        [T('col_share'), (p) => fmtPct(pct(p.damageStats.damageDealt, totalDamage))],
        ['DPS', (p) => shortNum(p.damageStats.dps || 0, 2)],
        [T('col_crit'), (p) => fmtPct(pct(p.skillStats.crits, p.skillStats.hits))],
        [T('col_back'), (p) => fmtPct(pct(p.damageStats.backAttackDamage, p.damageStats.damageDealt))],
        [T('col_front'), (p) => fmtPct(pct(p.damageStats.frontAttackDamage, p.damageStats.damageDealt))],
        [T('col_ap'), (p) => fmtPct(pct(p.damageStats.buffedBySupport, p.damageStats.damageDealt)), T('tip_ap')],
        [T('col_brand'), (p) => fmtPct(pct(p.damageStats.debuffedBySupport, p.damageStats.damageDealt)), T('tip_brand')],
        [T('col_identity'), (p) => fmtPct(pct(p.damageStats.buffedByIdentity, p.damageStats.damageDealt)), T('tip_identity')],
        [T('col_hat'), (p) => fmtPct(pct(p.damageStats.buffedByHat, p.damageStats.damageDealt)), T('tip_hat')],
        [T('col_deaths'), (p) => p.damageStats.deaths || 0],
      ],
    },
    rdps: {
      label: T('tab_rdps'),
      value: (p) => p.damageStats.rdps || 0,
      cols: [
        [T('col_rdps'), (p) => shortNum(p.damageStats.rdps || 0, 2), T('tip_rdps')],
        [T('col_ndps'), (p) => shortNum(p.damageStats.ndps || 0, 2), T('tip_rdps')],
        ['DPS', (p) => shortNum(p.damageStats.dps || 0, 2)],
        [T('col_given'), (p) => shortNum(p.damageStats.rdpsDamageGiven || 0, 2)],
        [T('col_received'), (p) => shortNum(p.damageStats.rdpsDamageReceived || 0, 2)],
      ],
    },
    taken: {
      label: T('tab_taken'),
      value: (p) => p.damageStats.damageTaken || 0,
      cols: [
        [T('col_taken'), (p) => shortNum(p.damageStats.damageTaken || 0, 2)],
        [T('col_share'), (p) => fmtPct(pct(p.damageStats.damageTaken, players.reduce((a, x) => a + (x.damageStats.damageTaken || 0), 0)))],
        [T('col_deaths'), (p) => p.damageStats.deaths || 0],
        [T('col_death_time'), (p) => (p.damageStats.deaths ? fmtDuration(p.damageStats.deathTime ? p.damageStats.deathTime - enc.fightStart : 0) : '—')],
        [T('col_incap'), (p) => (p.damageStats.incapacitations || []).length],
      ],
    },
    stagger: {
      label: T('tab_stagger'),
      value: (p) => p.damageStats.stagger || 0,
      cols: [
        [T('col_stagger'), (p) => (p.damageStats.stagger || 0).toLocaleString()],
        [T('col_share'), (p) => fmtPct(pct(p.damageStats.stagger, players.reduce((a, x) => a + (x.damageStats.stagger || 0), 0)))],
        [T('col_spm'), (p) => Math.round((p.damageStats.stagger || 0) / (durS / 60)).toLocaleString()],
      ],
    },
    shield: {
      label: T('tab_shield'),
      value: (p) => p.damageStats.shieldsGiven || 0,
      cols: [
        [T('col_shield_given'), (p) => shortNum(p.damageStats.shieldsGiven || 0, 2)],
        [T('col_shield_received'), (p) => shortNum(p.damageStats.shieldsReceived || 0, 2)],
        [T('col_absorbed_others'), (p) => shortNum(p.damageStats.damageAbsorbedOnOthers || 0, 2)],
      ],
    },
  };
  let tab = 'damage';
  let selected = null;
  const tabsEl = h('div', { class: 'flex flex-wrap gap-2 p-2' });
  const tableEl = h('div', { class: 'overflow-x-auto thin-scroll' });
  const detailEl = card();
  main.append(card(sectionHeader(T('combat_log')), tabsEl, tableEl), detailEl);

  function drawTabs() {
    tabsEl.innerHTML = '';
    for (const [k, t] of Object.entries(TABS)) tabsEl.append(toggleBtn(t.label, tab === k, () => { tab = k; drawTabs(); drawTable(); }));
  }
  function drawTable() {
    const t = TABS[tab];
    const max = Math.max(1, ...players.map(t.value));
    const head = h('tr', { class: 'text-left text-xs text-neutral-400' },
      h('th', { class: 'px-2 py-2 font-semibold' }, T('col_name')),
      ...t.cols.map(([label, , tip]) => {
        const th = h('th', { class: 'whitespace-nowrap px-2 py-2 text-right font-semibold' }, label);
        if (tip) th.append(infoIcon(tip));
        return th;
      }),
      tab === 'damage' ? (() => { const th = h('th', { class: 'whitespace-nowrap px-2 py-2 text-right font-semibold' }, T('col_parse')); th.append(infoIcon(T('tip_parse'))); return th; })() : null);
    const tbody = h('tbody');
    for (const party of parties) {
      if (party.label) tbody.append(h('tr', null, h('td', { colspan: t.cols.length + 2, class: 'bg-black/20 px-2 py-1 text-xs font-semibold text-neutral-300' }, party.label)));
      for (const p of party.list.slice().sort((a, b) => t.value(b) - t.value(a))) {
        const c = clsOf(p);
        const w = (t.value(p) / max) * 100;
        const color = colors[p.class] || '#8ec5ff';
        const nameCell = h('td', { class: 'relative min-w-[220px] px-2 py-1.5' },
          h('div', { class: 'absolute inset-y-0 left-0 opacity-30', style: `width:${w}%;background:${color}` }),
          h('div', { class: 'relative flex items-center gap-2' },
            c ? classIconEl(c.id, 'size-6') : null,
            h('div', { class: 'flex min-w-0 flex-col leading-tight' },
              h('span', { class: 'truncate font-semibold' }, displayName(p)),
              h('span', { class: 'truncate text-xs text-neutral-400' }, `${specName(p.spec) || ''} · ${p.gearScore ? (+p.gearScore).toFixed(2).replace(/\.?0+$/, '') : '-'}${p.combatPower ? ` · 戰力 ${Math.round(p.combatPower)}` : ''}`))));
        const parse = parseOf(p);
        const row = h('tr', { class: `cursor-pointer border-t border-neutral-900 hover:bg-white/5 ${selected === p ? 'bg-white/10' : ''}` },
          nameCell,
          ...t.cols.map(([, fn]) => h('td', { class: 'whitespace-nowrap px-2 py-1.5 text-right font-mono text-sm' }, fn(p))),
          tab === 'damage' ? h('td', { class: 'px-2 py-1.5 text-right font-mono text-sm', style: parse !== null ? `color:${parseColor(parse)}` : '' }, parse !== null ? Math.floor(parse * 100) : '—') : null);
        row.addEventListener('click', () => { selected = p; drawTable(); drawDetail(); });
        tbody.append(row);
      }
    }
    tableEl.innerHTML = '';
    tableEl.append(h('table', { class: 'w-full border-collapse' }, h('thead', null, head), tbody));
  }

  // ---------- 技能明細 ----------
  function drawDetail() {
    detailEl.innerHTML = '';
    if (!selected) { detailEl.append(sectionHeader(T('skills')), h('div', { class: 'px-3 py-3 text-neutral-400' }, T('click_player'))); return; }
    const p = selected;
    const c = clsOf(p);
    const cnum = c ? c.num : undefined;
    const total = p.damageStats.damageDealt || 1;
    const skills = Object.values(p.skills || {}).filter((s) => s.totalDamage > 0).sort((a, b) => b.totalDamage - a.totalDamage);
    const max = skills.length ? skills[0].totalDamage : 1;
    detailEl.append(sectionHeader(T('skills_of', { name: displayName(p) })));
    const cols = [
      [T('col_damage'), (s) => shortNum(s.totalDamage, 2)],
      [T('col_share'), (s) => fmtPct(pct(s.totalDamage, total))],
      ['DPS', (s) => shortNum(s.totalDamage / durS, 2)],
      [T('col_crit'), (s) => fmtPct(pct(s.crits, s.hits))],
      [T('sk_back'), (s) => fmtPct(pct(s.backAttacks, s.hits))],
      [T('sk_front'), (s) => fmtPct(pct(s.frontAttacks, s.hits))],
      [T('col_ap'), (s) => fmtPct(pct(s.buffedBySupport, s.totalDamage))],
      [T('col_brand'), (s) => fmtPct(pct(s.debuffedBySupport, s.totalDamage))],
      [T('sk_casts'), (s) => s.casts || 0],
      [T('sk_cpm'), (s) => ((s.casts || 0) / (durS / 60)).toFixed(1)],
      [T('sk_hits'), (s) => s.hits || 0],
      [T('sk_max'), (s) => shortNum(s.maxDamage || 0, 2)],
      [T('sk_avg_cast'), (s) => (s.casts ? shortNum(s.totalDamage / s.casts, 2) : '—')],
    ];
    const tbody = h('tbody');
    for (const s of skills) {
      const local = D.skills[String(s.id)];
      const icon = (local && local[2]) || (s.icon ? s.icon.replace(/\.png$/, '') : '');
      const name = trId('skills', String(s.id), (local && local[0]) || s.name, cnum);
      const w = (s.totalDamage / max) * 100;
      tbody.append(h('tr', { class: 'border-t border-neutral-900' },
        h('td', { class: 'relative min-w-[220px] px-2 py-1' },
          h('div', { class: 'absolute inset-y-0 left-0 opacity-25', style: `width:${w}%;background:${colors[p.class] || '#8ec5ff'}` }),
          h('div', { class: 'relative flex items-center gap-2' },
            icon ? h('img', { class: 'size-6 rounded-sm', src: `${CDN}/icon/${icon}.png`, alt: '' }) : h('span', { class: 'size-6' }),
            h('span', { class: 'truncate', title: s.name }, name),
            s.isHyperAwakening ? h('span', { class: 'rounded-sm bg-amber-700/60 px-1 text-xs' }, T('hyper')) : null)),
        ...cols.map(([, fn]) => h('td', { class: 'whitespace-nowrap px-2 py-1 text-right font-mono text-sm' }, fn(s)))));
    }
    detailEl.append(h('div', { class: 'overflow-x-auto thin-scroll' },
      h('table', { class: 'w-full border-collapse' },
        h('thead', null, h('tr', { class: 'text-left text-xs text-neutral-400' }, h('th', { class: 'px-2 py-2' }, T('sk_skill')), ...cols.map(([l]) => h('th', { class: 'whitespace-nowrap px-2 py-2 text-right' }, l)))),
        tbody)));
  }

  // ---------- DPS 走勢 ----------
  let chartMode = 'avg';
  const chartBtns = h('div', { class: 'flex gap-2' });
  const chartEl = h('div', { class: 'h-[360px] w-full' });
  main.append(card(h('div', { class: 'flex flex-row items-center bg-black/10 px-3 py-2 font-bold' }, h('span', null, T('chart_title')), h('div', { class: 'flex-1' }), chartBtns), chartEl));
  function drawChart() {
    chartBtns.innerHTML = '';
    chartBtns.append(toggleBtn(T('chart_avg'), chartMode === 'avg', () => { chartMode = 'avg'; drawChart(); }), toggleBtn(T('chart_roll'), chartMode === 'roll', () => { chartMode = 'roll'; drawChart(); }));
    const key = chartMode === 'avg' ? 'dpsAverage' : 'dpsRolling10sAvg';
    const len = Math.max(0, ...players.map((p) => (p.damageStats[key] || []).length));
    const xs = Array.from({ length: len }, (_, i) => i);
    const series = players.filter((p) => (p.damageStats[key] || []).length).map((p) => ({
      name: displayName(p), type: 'line', showSymbol: false, smooth: true, lineStyle: { width: 1.5 },
      itemStyle: { color: colors[p.class] || undefined }, data: p.damageStats[key],
    }));
    const hp = Object.values(eds.bossHpLog || {})[0];
    if (hp && hp.length) {
      const arr = new Array(len).fill(null);
      for (const pt of hp) if (pt.time < len) arr[pt.time] = +(pt.p * 100).toFixed(2);
      series.push({ name: T('boss_hp'), type: 'line', yAxisIndex: 1, showSymbol: false, connectNulls: true, lineStyle: { width: 1, type: 'dashed', color: '#a3a3a3' }, itemStyle: { color: '#a3a3a3' }, data: arr });
    }
    const axis = '#a3a3a3';
    mountChart(chartEl, {
      ...ECH_BASE,
      grid: { left: 60, right: 50, top: 40, bottom: 30 },
      legend: { type: 'scroll', top: 5, textStyle: { color: '#d4d4d4' } },
      tooltip: { trigger: 'axis', backgroundColor: '#262626', borderColor: '#404040', textStyle: { color: '#e5e5e5' },
        valueFormatter: (v) => (v === null || v === undefined ? '' : typeof v === 'number' && v <= 100 && v >= 0 && !Number.isInteger(v) ? `${v}%` : shortNum(Number(v), 2)) },
      xAxis: { type: 'category', data: xs, axisLabel: { color: axis, formatter: (v) => fmtDuration(Number(v) * 1000) }, axisLine: { lineStyle: { color: '#525252' } } },
      yAxis: [
        { type: 'value', axisLabel: { color: axis, formatter: (v) => shortNum(v, 1) }, splitLine: { lineStyle: { color: '#333' } } },
        { type: 'value', min: 0, max: 100, axisLabel: { color: axis, formatter: (v) => `${v}%` }, splitLine: { show: false } },
      ],
      series,
    }).catch((e) => { chartEl.innerHTML = ''; chartEl.append(errorEl(e)); });
  }

  drawTabs();
  drawTable();
  drawDetail();
  drawChart();
}
