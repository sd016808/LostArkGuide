/* 首頁 (/) */
import { h, T, D, addUi, pageData, card, classIconEl, className, errorEl, fmtDuration, bossName, diffBadge, ORIGIN } from '../common.js';

addUi({
  home_tagline: 'lostark.bible 的繁體中文介面：統計、排行榜與造型書',
  search_ph: '輸入角色名稱…', search_note: '角色頁面（裝備、紀錄、遠征隊）仍由英文原站提供，搜尋後會在新分頁開啟。',
  popular_chars: '過去一小時的熱門角色', popular_logs: '過去一小時的熱門紀錄', no_popular: '目前沒有熱門資料', views_n: '{n} 次瀏覽',
  quick_links: '快速連結',
});
const REGIONS = ['NA', 'CE'];
const REGION_ZH = { NA: '北美', CE: '歐洲' };

export async function render(root) {
  const main = h('main', { class: 'flex h-full flex-col items-center px-0.5 pt-24 max-sm:pt-10 sm:px-4' });
  root.append(main);
  main.append(h('h1', { class: 'mb-2 pt-4 text-center text-3xl font-bold md:text-5xl' }, T('site_title')), h('h2', { class: 'pb-4 text-center text-neutral-300' }, T('home_tagline')));
  let region = 'NA';
  const sel = h('select', { class: 'rounded-l-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-white focus:outline-none' }, ...REGIONS.map((r) => h('option', { value: r }, REGION_ZH[r])));
  sel.addEventListener('change', () => (region = sel.value));
  const input = h('input', { type: 'text', placeholder: T('search_ph'), class: 'w-full rounded-r-md border border-l-0 border-neutral-700 bg-neutral-900 px-3 py-2 text-white focus:outline-none' });
  const go = () => { const n = input.value.trim(); if (n) window.open(`${ORIGIN}/character/${region}/${encodeURIComponent(n)}`, '_blank'); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  main.append(h('div', { class: 'flex w-full max-w-3xl flex-col gap-1 rounded-lg bg-neutral-950/30 p-2' }, h('div', { class: 'flex h-[42px]' }, sel, input), h('p', { class: 'px-1 text-xs text-neutral-500' }, T('search_note'))));

  const grid = h('div', { class: 'container mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-2 md:grid-cols-2 md:px-4' });
  main.append(grid);
  const links = card(h('div', { class: 'inline-flex h-10 items-center bg-black/10 px-3 py-2 font-bold' }, T('quick_links')),
    h('div', { class: 'grid grid-cols-1 divide-y divide-neutral-950/40' }, ...[['/stats/generic', 'tab_general'], ['/stats/raids', 'tab_raids'], ['/stats/class', 'tab_class'], ['/stats/ark-passive', 'tab_arkpassive'], ['/stats/combat-power', 'tab_combatpower'], ['/leaderboards', 'nav_leaderboards'], ['/style-book', 'nav_stylebook']].map(([href, k]) => h('a', { href, class: 'flex h-10 items-center px-3 hover:bg-black/20' }, T(k)))));
  const chars = card(h('div', { class: 'inline-flex h-10 items-center bg-black/10 px-3 py-2 font-bold' }, T('popular_chars')));
  const logs = card(h('div', { class: 'inline-flex h-10 items-center bg-black/10 px-3 py-2 font-bold' }, T('popular_logs')));
  grid.append(chars, logs, links);
  try {
    const data = await pageData('');
    const ilvl = (v) => (+v).toFixed(2).replace(/\.?0+$/, '');
    const cl = h('div', { class: 'grid auto-rows-[2.5rem] grid-cols-1 gap-px divide-y divide-neutral-950/40' });
    for (const [reg, name, cls, gs, views] of data.popularCharacters || []) {
      cl.append(h('a', { href: `${ORIGIN}/character/${reg}/${encodeURIComponent(name)}`, target: '_blank', class: 'flex min-w-0 items-center justify-between pl-3' },
        h('span', { class: 'inline-flex min-w-0 items-center truncate' }, classIconEl(cls, 'size-6 shrink-0 pr-1'), h('span', { class: 'truncate' }, `${name} - ${ilvl(gs)}`), h('span', { class: 'shrink-0 pl-1 text-xs text-surface-400' }, `(${reg})`)),
        h('span', { class: 'mr-2 shrink-0 text-xs text-surface-500' }, T('views_n', { n: views }))));
    }
    chars.append((data.popularCharacters || []).length ? cl : h('div', { class: 'px-3 py-2' }, T('no_popular')));
    const ll = h('div', { class: 'grid auto-rows-[2.5rem] grid-cols-1 gap-px divide-y divide-neutral-950/40' });
    for (const lg of data.popularLogs || []) {
      const p = lg.preview || {};
      ll.append(h('a', { href: `/logs/${lg.logId}`, class: 'flex min-w-0 items-center justify-between pl-3' },
        h('span', { class: 'inline-flex min-w-0 items-center gap-1 truncate pr-2' }, p.difficulty ? h('p', { class: 'shrink-0 rounded-sm bg-neutral-700/80 px-1 text-xs' }, diffBadge(p.difficulty)) : null, h('span', { class: 'truncate' }, bossName(p.boss) || '?'), h('span', { class: 'shrink-0' }, `- ${fmtDuration(p.duration || 0)} -`), h('span', { class: 'shrink-0 text-xs text-surface-400' }, `(${p.region || ''})`)),
        h('span', { class: 'mr-2 shrink-0 text-xs text-surface-500' }, T('views_n', { n: lg.views }))));
    }
    logs.append((data.popularLogs || []).length ? ll : h('div', { class: 'px-3 py-2' }, T('no_popular')));
  } catch (e) {
    chars.append(errorEl(e));
  }
}
