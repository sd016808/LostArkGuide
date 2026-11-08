/* 團本排行榜 (/leaderboards) */
import {
  h, T, tr, D, addUi, loadExtra, remote, card, loadingEl, errorEl, toggleBtn, select, filterRow, filterPanel, setQuery, attachTooltip,
  shortNum, fmtDuration, relTime, diffBadge, diffName, raidName, specName, classByEn, className, classIconEl, poweredBy, ORIGIN, PATCH_LABEL, gateLabel,
} from '../common.js';

addUi({
  leaderboards: '排行榜', raid: '團本', difficulty: '難度', time_range: '時間範圍', patch: '版本', current_reset: '本週', all_time: '歷史',
  tip_current: '本週重置週期（週三至週三）內最快的場次。', tip_alltime: '所有版本中最快的場次。',
  rank: '排名', team: '隊伍', avg_ilvl: '平均裝等', avg_cp: '平均戰鬥力', avg_ilvl_short: '平均裝等', avg_cp_short: '平均戰力', total_dps: 'DPS', duration: '時間', date: '日期', party_n: '第 {n} 隊',
  team_of: '{name} 的隊伍', no_runs: '這個團本目前還沒有任何紀錄。',
});

export async function render(root) {
  await loadExtra('raids');
  const R = D.raids;
  const byBoss = {}; for (const r of R.raids) for (const g of r.gates) for (const b of g.bosses) byBoss[b] = [r, g];
  const byCategory = {}; for (const r of R.raids) (byCategory[r.category] ||= []).push(r);
  const findRaid = (boss, diff) => { for (const r of R.raids) { if (!r.difficulties.some((d) => d.difficulty === diff)) continue; const g = r.gates.find((g) => g.bosses.includes(boss)); if (g) return [r, g]; } return byBoss[boss]; };
  const gateKey = (r, g) => JSON.stringify([r.category, r.name, g.name]);
  const raidTitle = (r, g) => `${raidName(r.name)} ${gateLabel(g.name)}`;
  const q = new URLSearchParams(location.search);
  const st = { boss: q.get('boss') || R.defaults.boss, difficulty: q.get('difficulty') || R.defaults.difficulty, patch: q.get('patch') || 'current' };
  if (!byBoss[st.boss]) st.boss = R.defaults.boss;
  const snap = () => ({ ...st });
  const stale = (f) => JSON.stringify(f) !== JSON.stringify(snap());
  const patchDate = () => (st.patch === 'current' ? new Date() : (R.patches.find((p) => p.apiName === st.patch) || {}).startDate && new Date(R.patches.find((p) => p.apiName === st.patch).startDate));
  const stoppedByPatch = (raid) => { const d = patchDate(); return !!d && !!raid.stoppedAcceptingStatsAt && new Date(raid.stoppedAcceptingStatsAt) <= d; };
  const stoppedNow = (raid) => !!raid.stoppedAcceptingStatsAt && new Date(raid.stoppedAcceptingStatsAt) <= new Date();

  const main = h('div'), side = h('div', { class: 'sticky top-20 flex flex-col gap-4' });
  root.append(
    h('div', { class: 'h-30 bg-transparent md:h-20' }, h('div', { class: 'container mx-auto flex h-full max-w-7xl justify-between p-4' }, h('div', { class: 'flex flex-col' }, h('div', { class: 'pt-4' }, h('h1', { class: 'flex items-center text-3xl font-bold' }, T('leaderboards')))))),
    h('div', { class: 'bg-neutral-900' }, h('div', { class: 'container mx-auto flex max-w-7xl items-center px-4 py-2' })),
    h('main', { class: 'mx-auto flex max-w-7xl flex-col-reverse gap-4 px-0.5 py-4 sm:px-4 xl:grid xl:grid-cols-[1fr_20rem]' }, h('div', null, h('div', { class: 'flex flex-col gap-3' }, main, poweredBy(), h('div', { class: 'max-sm:hidden', style: 'height:600px' }))), h('div', null, side)));

  function normalize() {
    const [r] = byBoss[st.boss];
    if (!r.difficulties.some((d) => d.difficulty === st.difficulty)) st.difficulty = r.difficulties[r.difficulties.length - 1].difficulty;
    if (st.difficulty === 'Inferno' && st.patch === 'current') st.patch = 'alltime';
    if (stoppedNow(r) && st.patch === 'current') st.patch = 'alltime';
  }
  function renderFilters() {
    side.innerHTML = '';
    const [raid] = byBoss[st.boss];
    const curGate = findRaid(st.boss, st.difficulty) || byBoss[st.boss];
    const raidOpts = Object.entries(byCategory).map(([cat, raids]) => ({ group: tr('raid_categories', cat), options: raids.filter((r) => !stoppedByPatch(r)).flatMap((r) => r.gates.map((g) => ({ value: gateKey(r, g), label: raidTitle(r, g) }))) })).filter((g) => g.options.length);
    const raidSel = select(raidOpts, gateKey(curGate[0], curGate[1]), (v) => { const [cat, name, gate] = JSON.parse(v); const r = R.raids.find((x) => x.category === cat && x.name === name); const g = r.gates.find((x) => x.name === gate); st.boss = g.bosses[0]; update(); });
    const diffs = h('div', { class: 'flex flex-wrap gap-2 p-2' }, ...raid.difficulties.map((d) => toggleBtn(diffName(d.difficulty), st.difficulty === d.difficulty, () => { st.difficulty = d.difficulty; update(); })));
    const range = h('div', { class: 'flex gap-2 p-2' }, toggleBtn(T('current_reset'), st.patch === 'current', () => { st.patch = 'current'; update(); }, T('tip_current'), stoppedNow(raid)), toggleBtn(T('all_time'), st.patch === 'alltime', () => { st.patch = 'alltime'; update(); }, T('tip_alltime')));
    const patchSel = select([{ value: 'current', label: T('current_reset'), disabled: stoppedNow(raid) }, { value: 'alltime', label: T('all_time') }, ...R.patches.map((p) => ({ value: p.apiName, label: PATCH_LABEL[p.apiName] || p.name, disabled: !!raid.stoppedAcceptingStatsAt && new Date(p.startDate) >= new Date(raid.stoppedAcceptingStatsAt) }))], st.patch, (v) => { st.patch = v; update(); }, 'box-border flex w-full rounded-sm border border-neutral-600 bg-neutral-800 p-2 text-white focus:outline-none');
    side.append(filterPanel(filterRow(T('raid'), raidSel), filterRow(T('difficulty'), diffs), filterRow(T('time_range'), range), filterRow(T('patch'), h('div', { class: 'p-2' }, patchSel))));
  }

  async function renderBoard(f) {
    main.innerHTML = '';
    const wrap = card(); main.append(wrap);
    const [r, g] = findRaid(f.boss, f.difficulty) || byBoss[f.boss];
    wrap.append(h('div', { class: 'flex flex-row items-center justify-between bg-black/10 px-3 py-2' }, h('span', { class: 'inline-flex flex-wrap items-center gap-1 font-bold' }, raidTitle(r, g), h('span', { class: 'text-neutral-400' }, '·'), diffBadge(f.difficulty), '：', h('span', { class: 'pl-1 font-normal' }, PATCH_LABEL[f.patch] || f.patch))));
    const body = h('div'); wrap.append(body); body.append(loadingEl(600));
    const bossApi = (R.bossAlias[f.boss] && R.bossAlias[f.boss][f.difficulty]) || f.boss;
    let data;
    try { data = await remote('leaderboardsSearch', { boss: bossApi, difficulty: f.difficulty, patch: f.patch }); } catch (e) { body.innerHTML = ''; body.append(errorEl(e)); return; }
    if (stale(f)) return;
    body.innerHTML = '';
    body.append(h('div', { class: 'px-3 py-2 text-sm text-neutral-400' }, T('last_updated', { t: data.timestamp ? relTime(new Date(data.timestamp).getTime()) : 'N/A' })));
    const enc = data.encounters || [];
    if (!enc.length) { body.append(h('div', { class: 'w-full p-2 py-4 text-center text-neutral-200' }, T('no_runs'))); return; }
    const precise = enc.length >= 2 && enc[1].duration - enc[0].duration < 1000 && Math.floor(enc[0].duration / 1000) === Math.floor(enc[1].duration / 1000);
    const dur = (ms) => (precise ? `${fmtDuration(ms)}.${String(ms % 1000).padStart(3, '0')}` : fmtDuration(ms));
    const durDiff = (ms) => (ms < 1000 ? `+${fmtDuration(ms)}.${String(ms % 1000).padStart(3, '0')}` : `+${fmtDuration(ms)}`);
    const grid = h('div', { class: 'grid grid-cols-[max-content_minmax(0,1fr)_max-content_max-content_max-content_max-content_max-content] max-sm:grid-cols-[1fr_max-content_max-content_max-content]' },
      h('div', { class: 'px-3 py-2 font-semibold' }, T('rank')), h('div', { class: 'px-3 py-2 font-semibold max-sm:hidden' }, T('team')), h('div', { class: 'px-3 py-2 text-right font-semibold max-sm:hidden' }, T('avg_ilvl_short')), h('div', { class: 'px-3 py-2 text-right font-semibold max-sm:hidden' }, T('avg_cp_short')), h('div', { class: 'px-3 py-2 text-right font-semibold' }, 'DPS'), h('div', { class: 'px-3 py-2 text-right font-semibold' }, T('duration')), h('div', { class: 'px-3 py-2 text-right font-semibold' }, T('date')));
    enc.forEach((e, i) => {
      const first = enc[0];
      const dDur = e.duration - first.duration, dDps = e.totalDps - first.totalDps;
      const maxParty = Math.max(...e.players.map((p) => p.partyId));
      const top = e.players.reduce((a, b) => (b.dps > a.dps ? b : a), { name: '', dps: 0 }).name;
      const row = h('a', { href: `${ORIGIN}/logs/${e.id}`, target: '_blank', class: 'col-span-full grid grid-cols-subgrid gap-y-2 border-b border-neutral-900 bg-surface-800 pt-2 last:border-b-0 hover:bg-surface-700' },
        h('div', { class: 'flex items-center gap-1 self-center px-3 sm:text-center' }, i < 3 ? h('span', { class: i === 0 ? 'text-yellow-400' : i === 1 ? 'text-sky-200' : 'text-orange-400' }, '★') : null, ` #${i + 1}`),
        h('div', { class: 'flex min-w-0 items-center gap-2 self-center px-3 max-sm:hidden' }, e.region ? h('p', { class: 'shrink-0 rounded-sm bg-black/20 px-1 py-0.5 text-xs' }, e.region) : null, h('p', { class: 'truncate' }, T('team_of', { name: top }))),
        h('div', { class: 'self-center px-3 text-right max-sm:hidden' }, (+e.avgGearScore).toFixed(2).replace(/\.?0+$/, '')),
        h('div', { class: 'self-center px-3 text-right max-sm:hidden' }, e.avgCombatPower == null ? 'N/A' : e.avgCombatPower.toFixed(0)),
        h('div', { class: 'flex flex-col items-end self-center px-3' }, h('span', { title: e.totalDps.toLocaleString() }, shortNum(e.totalDps, 2).toLowerCase()), i !== 0 ? h('span', { class: `text-xs ${dDps < 1 ? 'text-red-400' : 'text-green-500'}` }, `${dDps < 0 ? '-' : '+'}${shortNum(Math.abs(dDps), 2).toLowerCase()}`) : null),
        h('div', { class: 'flex flex-col items-end self-center px-3 text-right' }, dur(e.duration), i !== 0 ? h('span', { class: `text-xs ${dDur > 0 ? 'text-red-400' : 'text-green-500'}` }, durDiff(dDur)) : null),
        h('div', { class: 'flex flex-col items-end self-center px-3' }, h('span', { title: new Date(e.timestamp).toLocaleString('zh-TW') }, relTime(e.timestamp))));
      const parties = h('div', { class: `col-span-full grid border-t border-neutral-900 ${maxParty === 0 ? 'grid-cols-1' : 'grid-cols-2 max-md:grid-cols-1'}` });
      for (let p = 0; p <= maxParty; p++) {
        const box = h('div', { class: 'grid grid-cols-[max-content_auto_max-content] items-center gap-1 border-neutral-900 bg-black/20 px-3 py-2 max-md:not-first:border-t md:odd:border-r' }, h('span', { class: 'col-span-3 text-xs font-semibold not-first:mt-2' }, T('party_n', { n: p + 1 })));
        const maxShare = Math.max(...e.players.map((x) => x.dps / e.totalDps));
        for (const pl of e.players.filter((x) => x.partyId === p)) {
          const cls = classByEn(pl.class);
          const share = pl.dps / e.totalDps;
          const icon = h('span', { class: 'shrink-0' }, cls ? classIconEl(cls.id, 'size-4') : null);
          attachTooltip(icon, () => h('p', { class: 'px-2 py-1 text-sm' }, `${specName(pl.spec)} ${cls ? className(cls.id) : pl.class}`));
          box.append(h('div', { class: `${maxParty > 0 ? 'w-25' : 'w-30'} mr-1 flex flex-row items-center gap-1` }, icon, h('span', { class: 'truncate text-xs' }, pl.name)),
            h('div', { class: 'w-full rounded-sm bg-black/30' }, h('div', { class: 'h-2 rounded-sm', style: `width:${(share / maxShare) * 100}%; background-color: rgb(from ${R.classColors[pl.class] || '#8ec5ff'} r g b / 0.6)` })),
            h('div', { class: 'flex flex-col items-end pl-3 text-xs', title: pl.dps.toLocaleString() }, shortNum(pl.dps, 2).toLowerCase()));
        }
        parties.append(box);
      }
      row.append(parties);
      grid.append(row);
    });
    body.append(h('div', null, grid));
  }

  function update() {
    normalize();
    setQuery({ boss: st.boss, difficulty: st.difficulty, patch: st.patch });
    renderFilters();
    renderBoard(snap());
  }
  update();
}
