/* 造型書 (/style-book, /style-book/:region/:id) */
import { h, T, tr, D, addUi, loadExtra, remote, pageData, card, loadingEl, errorEl, filterRow, filterPanel, imgUrl, classIconEl, className, ORIGIN, CDN } from '../common.js';

addUi({
  stylebook: '造型書', search_term: '搜尋', search_ph: '依標題或作者搜尋', region: '地區', all_regions: '所有地區', ce: '歐洲', na: '北美', all_classes: '所有職業', order_by: '排序',
  newest: '最新', recommended: '推薦', saved: '收藏數', no_results: '沒有符合的結果。', views: '觀看', likes: '喜歡', downloads: '下載',
  uploaded_by: '上傳者', screenshots: '截圖', dye_info: '染色資訊', part_n: '部位 {n}', not_dyed: '此部位未染色。', cannot_dye: '無法染色。',
  other_designs: '{a} 的其他設計', view_all_by: '查看 {a} 的所有設計', gloss_default: '預設',
});
const ARCH = { 101: 'Warrior', 111: 'Warrior', 201: 'Mage', 301: 'Martial Artist', 311: 'Martial Artist', 401: 'Assassin', 501: 'Gunner', 511: 'Gunner', 601: 'Specialist', 701: 'Guardianknight' };
const ARCH_ZH = { 101: '戰士（男）', 111: '戰士（女）', 201: '魔法師', 301: '格鬥家（女）', 311: '格鬥家（男）', 401: '暗殺者', 501: '獵人（男）', 511: '獵人（女）', 601: '幻使', 701: '守護者騎士' };
const REGION = { CE: '歐洲', NA: '北美' };

const designCard = (it, region) => h('a', { href: `/style-book/${it.region || region}/${it.id}`, class: 'justify-self-center' },
  h('div', { class: 'flex h-72 w-54 flex-col justify-end rounded-sm bg-surface-900 bg-cover bg-center p-4 text-white', style: `background-image:linear-gradient(to bottom,transparent,rgba(0,0,0,0.4) 60%,rgba(0,0,0,0.8)),url('${imgUrl(it.thumbnail) || ''}')` },
    h('p', { class: 'truncate text-lg font-semibold' }, it.title),
    it.author ? h('p', { class: 'text-sm' }, `${it.region ? it.region.slice(0, 2) + ' - ' : ''}${it.author}`) : null,
    h('div', { class: 'flex flex-row items-center gap-1 text-neutral-300 text-sm' }, `👁 ${it.views}`, h('span', { class: 'ml-2' }, `♥ ${it.likes}`), h('span', { class: 'ml-2' }, `⤓ ${it.downloads}`))));

export async function render(root, { match, detail }) {
  if (detail) return renderDetail(root, match[1], match[2]);
  const st = { region: 'all', classId: 0, searchTerm: '', order: 'recommended', page: 1 };
  const main = h('div'), side = h('div', { class: 'sticky top-20' });
  root.append(
    h('div', { class: 'h-30 bg-transparent md:h-20' }, h('div', { class: 'container mx-auto flex h-full max-w-7xl justify-between p-4' }, h('div', { class: 'flex flex-col' }, h('div', { class: 'pt-4' }, h('h1', { class: 'flex items-center text-3xl font-bold' }, T('stylebook')))))),
    h('div', { class: 'bg-neutral-900' }, h('div', { class: 'container mx-auto flex max-w-7xl items-center px-4 py-2' })),
    h('main', { class: 'mx-auto flex max-w-7xl flex-col-reverse gap-4 px-0.5 py-4 sm:px-4 md:grid md:grid-cols-[auto_20rem]' }, h('div', null, h('div', { class: 'grid gap-3' }, main, h('div', { class: 'max-sm:hidden', style: 'height:600px' }))), h('div', null, side)));

  function renderFilters() {
    side.innerHTML = '';
    const input = h('input', { type: 'text', placeholder: T('search_ph'), value: st.searchTerm, class: 'm-2 box-border flex flex-1 rounded-sm border border-neutral-600 bg-transparent p-2 text-white hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none' });
    let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.searchTerm = input.value; st.page = 1; renderList(); }, 300); });
    const mk = (opts, val, key) => { const s = h('select', { class: 'm-2 box-border flex flex-1 rounded-sm border border-neutral-600 bg-transparent p-2 text-white hover:bg-neutral-800 focus:outline-none' }, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = String(val); s.addEventListener('change', () => { st[key] = key === 'classId' ? Number(s.value) : s.value; st.page = 1; renderList(); }); return s; };
    side.append(filterPanel(filterRow(T('search_term'), input), filterRow(T('region'), mk([['all', T('all_regions')], ['CE', T('ce')], ['NA', T('na')]], st.region, 'region')),
      filterRow(T('class'), mk([[0, T('all_classes')], ...Object.keys(ARCH).map((k) => [k, ARCH_ZH[k]])], st.classId, 'classId')),
      filterRow(T('order_by'), mk([['new', T('newest')], ['recommended', T('recommended')], ['saved', T('saved')]], st.order, 'order'))));
  }
  async function renderList() {
    main.innerHTML = ''; main.append(loadingEl(400));
    const f = { ...st };
    let data;
    try { data = await remote('styleBookData', f, '/style-book'); } catch (e) { main.innerHTML = ''; main.append(errorEl(e)); return; }
    if (JSON.stringify(f) !== JSON.stringify(st)) return;
    main.innerHTML = '';
    if (!data || !data.items || !data.items.length) { main.append(h('div', { class: 'text-center text-neutral-400' }, T('no_results'))); return; }
    const pages = data.maxIndividualResults ? Math.ceil(data.maxIndividualResults / 20) : 1;
    main.append(h('div', { class: 'designs-grid gap-4 max-md:px-4' }, ...data.items.map((it) => designCard(it, st.region))));
    const prev = h('button', { class: 'rounded bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700', disabled: st.page === 1 }, '‹');
    const next = h('button', { class: 'rounded bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700', disabled: st.page >= pages }, '›');
    prev.addEventListener('click', () => { st.page = Math.max(1, st.page - 1); renderList(); scrollTo({ top: 0, behavior: 'smooth' }); });
    next.addEventListener('click', () => { st.page = Math.min(pages, st.page + 1); renderList(); scrollTo({ top: 0, behavior: 'smooth' }); });
    main.append(h('div', { class: 'mt-4 flex justify-center' }, h('div', { class: 'flex flex-row items-center gap-1 p-2' }, prev, h('span', { class: 'w-[140px] px-2 text-center text-sm' }, T('page', { p: st.page, n: pages })), next)));
  }
  renderFilters();
  renderList();
}

async function renderDetail(root, region, id) {
  await loadExtra('cores');
  const main = h('main'); root.append(main); main.append(loadingEl(400));
  let data;
  try { data = await pageData(`style-book/${region}/${id}`); } catch (e) { main.innerHTML = ''; main.append(errorEl(e)); return; }
  main.innerHTML = '';
  const d = data.details, author = data.author || {};
  document.title = `${d.title.trim()} | ${T('stylebook')} | ${T('site_title')}`;
  const stat = (v, l) => h('span', { class: 'mr-2 ml-1 text-sm' }, `${l} ${v}`);
  main.append(h('div', { class: 'container mx-auto flex h-full max-w-7xl justify-between p-3 sm:p-4' },
    h('div', { class: 'flex flex-col' },
      h('div', { class: 'flex gap-2 overflow-y-auto text-nowrap thin-scroll' }, h('p', { class: 'rounded-sm bg-neutral-900 px-2 py-1 text-sm' }, T('stylebook')), h('p', { class: 'rounded-sm bg-neutral-900 px-2 py-1 text-sm' }, REGION[region] || region), h('p', { class: 'rounded-sm bg-neutral-900 px-2 py-1 text-sm' }, className(d.classId) || ARCH_ZH[d.classId] || '')),
      h('div', { class: 'pt-4' }, h('h1', { class: 'flex items-center gap-1 text-3xl font-bold max-md:text-2xl' }, d.title)),
      h('div', { class: 'flex-1' }, h('p', { class: 'text-sm text-neutral-300' }, d.description || '')),
      h('div', { class: 'flex flex-col gap-2 pt-4' }, h('div', { class: 'flex flex-row gap-1 text-neutral-300 max-sm:flex-col' },
        h('div', { class: 'flex flex-row items-center gap-1' }, h('div', null, T('uploaded_by')), author.class ? classIconEl(author.class, 'size-5') : null, h('a', { class: 'text-accent-500 underline', href: `${ORIGIN}/character/${region}/${encodeURIComponent(d.author)}`, target: '_blank' }, d.author)),
        h('div', { class: 'mx-1 text-neutral-400 max-sm:hidden' }, '·'),
        h('div', { class: 'flex flex-row items-center gap-1' }, stat(d.views, '👁'), stat(d.likes, '♥'), stat(d.downloads, '⤓'))))),
    h('div', { class: 'py-2' }, h('img', { alt: '', class: 'max-h-64 w-auto rounded-md border-4 border-neutral-800 object-cover', src: imgUrl(d.thumbnail) }))));
  main.append(h('div', { class: 'bg-neutral-900' }, h('div', { class: 'container mx-auto max-w-7xl px-4 py-2' })));
  const shots = card(h('div', { class: 'bg-black/10 px-3 py-2 font-bold' }, T('screenshots')), h('div', null, ...(d.images || []).map((im) => {
    const full = im.crop && im.crop.top === 0 && im.crop.left === 0 && im.crop.bottom === 900 && im.crop.right === 1600;
    const src = full ? imgUrl(im.url) : `/api/image/api/style-book/image/${btoa([im.url, im.crop.top, im.crop.right, im.crop.bottom, im.crop.left].join('@')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;
    const img = h('img', { alt: 'Screenshot', class: 'block h-auto w-full cursor-zoom-in border border-neutral-800 object-cover', src, width: im.crop ? im.crop.right - im.crop.left : null, height: im.crop ? im.crop.bottom - im.crop.top : null });
    img.addEventListener('click', () => window.open(src, '_blank'));
    return h('div', { class: 'flex justify-center' }, img);
  })));
  const body = h('div', { class: `mx-auto flex max-w-7xl flex-col-reverse gap-4 px-0.5 py-4 sm:px-4 xl:grid ${d.dyeInfo ? 'xl:grid-cols-[1fr_20rem]' : ''}` }, shots);
  if (d.dyeInfo) {
    const SLOTS = [[12, 19], [13, 20], [17, 24], [18, 25], [14, 21], [15, 22]]; // 武器/頭/臉1/臉2/上衣/下衣（含外觀欄位）
    const hex = (e) => { if (e < 0) e += 16777216; const t = e.toString(16).padStart(6, '0').toUpperCase(); return [`#${t}`, `rgb(${e >> 16}, ${(e >> 8) & 255}, ${e & 255})`]; };
    const dye = card(h('div', { class: 'bg-black/10 px-3 py-2 font-bold' }, T('dye_info')));
    for (const slots of SLOTS) {
      const it = (d.dyeInfo.items || []).find((x) => slots.includes(x.slot));
      if (!it) continue;
      const item = D.cores.items[it.id];
      const row = h('div', { class: 'flex flex-row gap-2 p-2' }, item ? h('img', { class: 'size-8 rounded-sm', src: `${CDN}/icon/${item[0]}.png`, alt: '' }) : h('div', { class: 'size-8 rounded-sm bg-surface-800' }),
        h('div', { class: 'flex flex-col gap-1' }, h('span', { class: 'truncate text-sm font-semibold' }, it.name || `#${it.id}`)));
      if (it.tints && it.tints.length) {
        const g = h('div', { class: 'grid grid-cols-[auto_auto_1fr_auto_auto_1fr] items-center gap-1 text-xs' });
        for (const t of it.tints) {
          const [c1, r1] = hex(t.color), [c2, r2] = hex(t.patternColor);
          g.append(h('span', { class: 'text-sm' }, T('part_n', { n: t.partIndex + 1 })), h('div', { class: 'ml-1 size-4 border border-neutral-600', style: `background-color:${r1}` }), h('span', { class: 'font-mono' }, c1), h('span', null, [T('gloss_default'), '0%', '50%', '100%'][t.gloss] || ''), h('div', { class: 'ml-1 size-4 border border-neutral-600', style: `background-color:${r2}` }), h('span', { class: 'font-mono' }, c2));
        }
        row.lastChild.append(g);
      } else row.lastChild.append(h('span', { class: 'text-sm text-neutral-400' }, T('not_dyed')));
      dye.append(row);
    }
    body.append(dye);
  }
  main.append(body);
  if (data.otherEntries && data.otherEntries.length) {
    main.append(h('div', { class: 'mx-auto flex max-w-7xl px-0.5 py-4 sm:px-4' }, card(h('div', { class: 'bg-black/10 px-3 py-2 font-bold' }, T('other_designs', { a: d.author })),
      h('div', { class: 'w-full' }, h('div', { class: 'designs-grid w-full gap-4 p-4' }, ...data.otherEntries.map((it) => designCard({ ...it, region }, region))),
        data.hasEvenMoreEntries ? h('div', { class: 'flex w-full justify-end px-4 pb-3' }, h('a', { class: 'text-sm text-neutral-400 underline', href: `${ORIGIN}/character/${region}/${encodeURIComponent(d.author)}/style-book`, target: '_blank' }, T('view_all_by', { a: d.author }))) : null))));
  }
}
