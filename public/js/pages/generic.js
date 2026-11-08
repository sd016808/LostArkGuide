/* 綜合統計 (/stats/generic) */
import { h, T, tr, D, CDN, fmt, addUi, pageData, card, sectionHeader, infoIcon, barList, classIconEl, errorEl, loadingEl, className } from '../common.js';

addUi({
  total_characters: '角色總數', total_rosters: '帳號（遠征隊）總數', total_guilds: '公會總數',
  avg_roster_size: '平均每帳號角色數', chars_per_roster: '角色／帳號', global_support_pct: '全體輔助比例', most_popular_class: '最熱門職業',
  chars_per_class: '各職業角色數', all_ilvls: '所有裝等', chars_by_engraving: '各職業刻印角色分布',
  chars_by_ilvl: '角色裝等分布', rosters_by_ilvl: '帳號最高裝等分布', support_ratio: '團本輔助／輸出比例',
  chars_per_region: '各地區角色數', chars_per_world: '各伺服器角色數', lower_than: '低於 {n}',
  tip_tracked: '資料僅包含本站追蹤到的角色；角色需在第四階段（T4）上線後至少登入過一次。1650 以上的角色估計有 95% 準確度，較低裝等區間可能有遺漏。',
  tip_engraving: '僅計入本站追蹤角色的團本配置；部分混沌地城配置可能被誤判為團本配置。',
  tip_roster: '每個帳號中最高裝等角色的裝等分布。資料僅包含本站追蹤到的角色；角色需在第四階段（T4）上線後至少登入過一次。',
  tip_support: '各裝等區間中輔助職業所佔的百分比。低於 25% 表示輔助短缺，高於 25% 表示輸出短缺。區間為不含上界。',
});

const REGION = { NA: '北美', CE: '歐洲', NAW: '北美西', NAE: '北美東' };
const WORLD_REGION = { Thaemine: 'NA', Brelshaza: 'NA', Luterra: 'NA', Nineveh: 'NA', Balthorr: 'NA', Inanna: 'NA', Vairgrys: 'NA', Ortuus: 'CE', Elpon: 'CE', Ratik: 'CE', Arcturus: 'CE', Gienah: 'CE' };
const isSupportClass = (id) => ['holyknight', 'holyknight_female', 'bard', 'yinyangshi'].includes(id);

const SUPPORT_RANGES = [
  ['Behemoth (1640-1670)', '1640-1670'], ['Aegir NM (1660-1680)', '1660-1680'], ['Brelshaza NM (1670-1690)', '1670-1690'], ['Aegir HM (1680-1700)', '1680-1700'],
  ['Brelshaza HM (1690-1730)', '1690-1730'], ['Mordum NM (1680-1700)', '1680-1700'], ['Mordum HM (1700+)', '1700-9999'], ['Armoche NM (1700-1720)', '1700-1720'],
  ['Kazeros NM, Serca NM (1710-1730)', '1710-1730'], ['Armoche HM (1720+)', '1720-9999'], ['Serca HM (1730-1740)', '1730-1740'], ['Kazeros HM (1730+)', '1730-9999'], ['Serca Nightmare (1740+)', '1740-9999'],
];
function supportLabel(en) {
  // "Aegir NM (1660-1680)" -> "埃吉爾 普通 (1660-1680)"
  return en.replace(/^([A-Za-z, ]+?)\s*(NM|HM|Nightmare)?\s*\((.*)\)$/, (m, names, diff, range) => {
    const n = names.split(',').map((s) => tr('raids', s.trim())).join('、');
    const d = diff === 'NM' ? tr('difficulties', 'Normal') : diff === 'HM' ? tr('difficulties', 'Hard') : diff ? tr('difficulties', diff) : '';
    return `${n} ${d} (${range})`.replace(/\s+/g, ' ');
  });
}
const num = (e) => (typeof e === 'string' ? e : Number(e).toLocaleString('en-US', { maximumFractionDigits: 2 }));

export async function render(root) {
  const main = h('div', { class: 'mx-auto flex max-w-7xl flex-col gap-4 px-0.5 py-4 sm:px-4' });
  root.append(main);
  main.append(loadingEl(300));
  let data;
  try { data = await pageData('stats/generic'); } catch (e) { main.innerHTML = ''; main.append(errorEl(e)); return; }
  main.innerHTML = '';
  const g = data.generic, ce = data.classEngravings;

  const tile = (label, value, unit) => h('div', { class: 'flex flex-1 flex-col gap-2 rounded-lg bg-neutral-900 p-4' }, h('div', { class: 'text-md font-semibold' }, label), h('div', { class: 'text-4xl font-bold' }, h('span', null, value), unit ? h('span', { class: 'text-xl font-semibold' }, ' ' + unit) : null));
  const topClass = Object.entries(g.classCounts[0]).filter(([k]) => !k.includes(':')).reduce((a, b) => (a[1] > b[1] ? a : b));
  main.append(
    h('div', { class: 'flex flex-col justify-between gap-3 md:flex-row' }, tile(T('total_characters'), num(g.numCharacters)), tile(T('total_rosters'), num(g.numRosters)), tile(T('total_guilds'), num(g.numGuilds))),
    h('div', { class: 'flex flex-col justify-between gap-3 md:flex-row' }, tile(T('avg_roster_size'), num(g.numCharacters / g.numRosters), T('chars_per_roster')), tile(T('global_support_pct'), num(g.globalSupportPct * 100), '%'), tile(T('most_popular_class'), className(topClass[0]))),
  );

  // 各職業角色數
  {
    let bracket = 0;
    const body = h('div');
    const sel = h('select', { class: 'appearance-none border-b-2 border-gray-500 bg-transparent py-1 pr-8 text-sm text-white focus:border-blue-500 focus:outline-none' },
      h('option', { value: 0 }, T('all_ilvls')), ...[1640, 1660, 1680, 1700, 1720, 1740, 1760, 1780, 1800].map((v) => h('option', { value: v }, `${v}+`)));
    sel.addEventListener('change', () => { bracket = Number(sel.value); draw(); });
    const draw = () => {
      body.innerHTML = '';
      const counts = g.classCounts[bracket] || {};
      const rows = Object.entries(counts).filter(([k]) => !k.includes(':')).sort((a, b) => b[1] - a[1]);
      const max = Math.max(...Object.values(counts));
      body.append(barList(rows, { getWidth: (v) => v / max, key: (k) => h('span', null, className(k)), value: (v) => h('span', null, fmt(v)), icon: (k) => classIconEl(k, 'mr-3 size-8') }));
    };
    draw();
    main.append(card(h('div', { class: 'flex flex-row items-center bg-black/10 px-3 py-2 font-bold' }, h('span', null, T('chars_per_class')), h('div', { class: 'flex-1' }), sel, infoIcon(T('tip_tracked'))), body));
  }

  // 各職業刻印
  {
    const list = h('div', { class: 'flex flex-col divide-y divide-neutral-950' });
    const rows = Object.entries(ce.stats).map(([id, v]) => [D.classes.find((c) => c.id === id), v]).filter(([c]) => c).sort((a, b) => a[0].num - b[0].num);
    for (const [c, v] of rows) {
      const total = (v.First || 0) + (v.Second || 0);
      const p1 = ((v.First || 0) / total) * 100, p2 = ((v.Second || 0) / total) * 100;
      const [e1, e2] = c.engravings;
      list.append(h('div', { class: 'flex flex-row divide-x divide-neutral-950' },
        h('div', { class: 'flex items-center bg-surface-900 px-2 py-1' }, classIconEl(c.id, 'size-8')),
        h('div', { class: 'flex flex-1 flex-row items-center bg-surface-900 px-2 py-1' },
          h('img', { class: 'size-9 rounded-sm max-sm:hidden', alt: e1.name, src: `${CDN}/icon/${e1.icon}.png` }),
          h('div', { class: 'flex flex-1 flex-col py-1 sm:mx-2' },
            h('div', { class: 'flex flex-row items-center justify-between' }, h('span', { class: 'text-sm' }, `${tr('class_engravings', e1.name)} (${p1.toFixed(2)}%)`), h('span', { class: 'text-sm' }, `${tr('class_engravings', e2.name)} (${p2.toFixed(2)}%)`)),
            h('div', { class: 'relative my-1 h-2 w-full rounded-sm bg-surface-800 sm:my-2' }, h('div', { class: 'absolute left-0 h-2 rounded-l-sm bg-blue-300', style: `width:${p1}%` }), h('div', { class: 'absolute right-0 h-2 rounded-r-sm bg-red-500', style: `width:${p2}%` }))),
          h('img', { class: 'size-9 rounded-sm max-sm:hidden', alt: e2.name, src: `${CDN}/icon/${e2.icon}.png` }))));
    }
    main.append(card(h('div', { class: 'flex flex-row items-center bg-black/10 px-3 py-2 font-bold' }, h('span', null, T('chars_by_engraving')), h('div', { class: 'flex-1' }), infoIcon(T('tip_engraving'))), list));
  }

  const ilvlLabel = (v) => (v === 0 ? T('lower_than', { n: 1640 }) : v === 1770 ? '1770+' : `${v}.00 - ${v + 9.99}`);
  const simpleBars = (title, rows, tip, keyFn, valFn, widthMax, barExtra) => card(
    h('div', { class: 'flex flex-row items-center justify-between bg-black/10 px-3 py-2 font-bold' }, h('span', null, title), tip ? infoIcon(tip) : null),
    barList(rows, { getWidth: (v) => v / widthMax, key: keyFn, value: valFn, barExtra }));
  main.append(simpleBars(T('chars_by_ilvl'), g.ilvlCounts, T('tip_tracked'), (k) => h('span', null, ilvlLabel(k)), (v) => h('span', null, fmt(v)), Math.max(...g.ilvlCounts.map((e) => e[1]))));
  main.append(simpleBars(T('rosters_by_ilvl'), g.rosterIlvlCounts, T('tip_roster'), (k) => h('span', null, ilvlLabel(k)), (v) => h('span', null, fmt(v)), Math.max(...g.rosterIlvlCounts.map((e) => e[1]))));
  main.append(simpleBars(T('support_ratio'), SUPPORT_RANGES.map(([label, key]) => [label, g.supportBalance[key] || 0]), T('tip_support'), (k) => h('span', null, supportLabel(k)), (v) => h('span', null, `${(v * 100).toFixed(2)}%`), 0.4,
    () => h('div', { class: 'absolute top-0 left-[62.5%] h-2 w-[3px] bg-red-400' })));
  const regionRows = Object.entries(g.charsByRegion).sort((a, b) => b[1] - a[1]);
  main.append(simpleBars(T('chars_per_region'), regionRows, null, (k) => h('span', null, REGION[k] || k), (v) => h('span', null, fmt(v)), Math.max(...regionRows.map((e) => e[1]))));
  const worldRows = Object.entries(g.charsByWorld).sort((a, b) => b[1] - a[1]);
  main.append(simpleBars(T('chars_per_world'), worldRows, null, (k) => h('span', null, `${k} (${REGION[WORLD_REGION[k]] || WORLD_REGION[k] || ''})`), (v) => h('span', null, fmt(v)), Math.max(...worldRows.map((e) => e[1]))));
  main.append(h('div', { class: 'text-xs text-neutral-500' }, T('last_updated', { t: new Date(g.lastUpdate).toLocaleString('zh-TW') })));
}
