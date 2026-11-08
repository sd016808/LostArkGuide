/* 路由與頁面外殼 */
import { $, h, T, ORIGIN, loadBase, intercept, errorEl, loadingEl, closePopovers } from './common.js';

const ROUTES = [
  { match: /^\/$/, load: () => import('./pages/home.js'), title: 'site_title' },
  { match: /^\/stats\/?$/, redirect: '/stats/generic' },
  { match: /^\/stats\/generic\/?$/, load: () => import('./pages/generic.js'), stats: true, title: 'tab_general' },
  { match: /^\/stats\/raids\/?$/, load: () => import('./pages/raids.js'), stats: true, title: 'tab_raids' },
  { match: /^\/stats\/class\/?$/, load: () => import('./pages/class.js'), stats: true, title: 'tab_class' },
  { match: /^\/stats\/ark-passive\/?$/, load: () => import('./pages/arkpassive.js'), stats: true, title: 'tab_arkpassive' },
  { match: /^\/stats\/combat-power\/?$/, load: () => import('./pages/combatpower.js'), stats: true, title: 'tab_combatpower' },
  { match: /^\/stats\/combat-score\/?$/, redirect: '/stats/combat-power' },
  { match: /^\/leaderboards\/?$/, load: () => import('./pages/leaderboards.js'), title: 'nav_leaderboards' },
  { match: /^\/logs\/([\w-]+)\/?$/, load: () => import('./pages/log.js'), title: 'combat_log' },
  { match: /^\/style-book\/?$/, load: () => import('./pages/stylebook.js'), title: 'nav_stylebook' },
  { match: /^\/style-book\/(NA|CE)\/([\w-]+)\/?$/, load: () => import('./pages/stylebook.js'), detail: true, title: 'nav_stylebook' },
];

function header(active) {
  const nav = (href, key, isActive, external) => h('a', { href: external ? ORIGIN + href : href, target: external ? '_blank' : null, rel: external ? 'noopener' : null, class: `btn ${isActive ? 'bg-neutral-800' : ''}` }, T(key));
  return h('div', { class: 'mx-auto flex max-w-7xl items-center' },
    h('a', { href: '/', class: 'm-2 ml-4 flex items-center gap-2' },
      h('span', { class: 'grid size-11 place-items-center rounded-full bg-violet-700/60 text-lg font-black' }, '方'),
      h('span', { class: 'font-bold max-sm:hidden' }, T('site_title'))),
    h('div', { class: 'flex grow pr-4' },
      h('div', { class: 'flex items-center gap-2 pl-1 sm:gap-4' },
        nav('/stats/generic', 'nav_stats', active === 'stats'),
        nav('/leaderboards', 'nav_leaderboards', active === 'leaderboards'),
        nav('/style-book', 'nav_stylebook', active === 'stylebook')),
      h('div', { class: 'ml-auto flex items-center gap-4 text-xs text-neutral-400' },
        h('a', { id: 'orig-link', href: ORIGIN + location.pathname + location.search, target: '_blank', rel: 'noopener', class: 'hover:text-white' }, T('view_original')))));
}

export function statsSubnav(active) {
  const tab = (href, key) => h('a', { href, class: `btn ${location.pathname.replace(/\/$/, '') === href ? 'bg-neutral-800' : 'text-neutral-300'}` }, T(key));
  return [
    h('div', { class: 'h-30 bg-transparent md:h-20' },
      h('div', { class: 'container mx-auto flex h-full max-w-7xl justify-between p-4' },
        h('div', { class: 'flex flex-col' }, h('div', { class: 'pt-4' }, h('h1', { class: 'flex items-center text-3xl font-bold' }, T('statistics')))))),
    h('div', { class: 'bg-neutral-900 shadow-sm shadow-neutral-800' },
      h('div', { class: 'container mx-auto flex max-w-7xl items-center justify-between gap-2 overflow-y-auto px-4 py-2 max-md:max-w-[100vw] max-md:px-2 thin-scroll' },
        h('div', { class: 'flex gap-2 max-md:shrink max-md:overflow-x-scroll', style: 'scrollbar-width:none' },
          tab('/stats/generic', 'tab_general'), tab('/stats/raids', 'tab_raids'), tab('/stats/class', 'tab_class'), tab('/stats/ark-passive', 'tab_arkpassive'), tab('/stats/combat-power', 'tab_combatpower')))),
  ];
}

let current = null;
async function route() {
  closePopovers();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const r = ROUTES.find((x) => x.match.test(path));
  const page = $('#page');
  if (!r) { page.innerHTML = ''; page.append(h('div', { class: 'mx-auto max-w-7xl p-8 text-center text-neutral-400' }, '找不到頁面。', h('a', { class: 'ml-2 underline', href: '/' }, '回首頁'))); return; }
  if (r.redirect) { history.replaceState(null, '', r.redirect); return route(); }
  const active = r.stats ? 'stats' : path.startsWith('/leaderboards') ? 'leaderboards' : path.startsWith('/style-book') ? 'stylebook' : '';
  $('#site-header').innerHTML = '';
  $('#site-header').append(header(active));
  page.innerHTML = '';
  if (r.stats) page.append(...statsSubnav());
  const mount = h('div');
  page.append(mount);
  mount.append(loadingEl(200));
  const token = (current = {});
  try {
    const mod = await r.load();
    if (token !== current) return;
    mount.innerHTML = '';
    document.title = r.title === 'site_title' ? T('site_title') : `${T(r.title)} | ${T('site_title')}`;
    await mod.render(mount, { path, match: path.match(r.match), detail: r.detail });
  } catch (e) {
    console.error(e);
    mount.innerHTML = '';
    mount.append(errorEl(e));
  }
}

(async () => {
  try { await loadBase(); } catch (e) { $('#page').append(errorEl(e)); return; }
  $('#footer-text').textContent = T('footer');
  intercept(document.body);
  window.addEventListener('popstate', route);
  window.addEventListener('app:navigate', route);
  route();
})();
