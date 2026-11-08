# -*- coding: utf-8 -*-
"""
Merge researched Chinese terms into public/data/zh.json.

Usage: python -I tools/build_zh.py <terms_dir> <data_dir> <out_file> [--trad]
  terms_dir  folder with: cn_ids.json (ID-keyed CN-server names from tools/fetch_cn_terms.py),
             general.json, chaos_cores.json, raids.json, group*.json (name-keyed research results)
  data_dir   public/data (needs tripods.json to align tripod positions by icon)
  --trad     convert Simplified -> Traditional (OpenCC s2tw)

Priority for a given term: manual override (tools/zh_overrides.json) > Taiwan official ("tw")
> China official ("cn") > community ("fan"). ID-keyed CN names are the baseline for skills,
tripods, Ark Grid cores, Ark Passive nodes and runes; name-keyed TW results override them where found.
"""
import json, os, sys, glob

RANK = {'tw': 3, 'cn': 2, 'fan': 1}


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def val(v):
    """-> (zh, src) or None"""
    if v is None:
        return None
    if isinstance(v, str):
        return (v.strip(), 'cn') if v.strip() else None
    if isinstance(v, dict):
        z = v.get('zh')
        if isinstance(z, str) and z.strip():
            return (z.strip(), v.get('src') or 'cn')
    return None


class Merger:
    def __init__(self, conv):
        self.C = conv
        self.best = {}  # (section, key) -> (rank, zh)

    def put(self, section, key, zh, src, force=False):
        if not zh:
            return
        r = RANK.get(src, 1)
        cur = self.best.get((section, key))
        if force or cur is None or r > cur[0]:
            self.best[(section, key)] = (r, self.C(zh))

    def section(self, name):
        return {k[1]: v[1] for k, v in self.best.items() if k[0] == name}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    terms_dir, data_dir, out_file = args
    conv = (lambda s: s)
    if '--trad' in sys.argv:
        from opencc import OpenCC
        cc = OpenCC('s2tw')
        conv = cc.convert
    M = Merger(conv)
    stats = {}

    # ---- ID-keyed baseline (China server, by game ID) ----
    cn_path = os.path.join(terms_dir, 'cn_ids.json')
    by_id = {'skills_by_id': {}, 'tripods_by_id': {}, 'arkpassive_by_id': {}, 'cores_by_id': {}, 'runes_by_id': {}, 'classes_by_num': {}}
    if os.path.exists(cn_path):
        cn = load(cn_path)
        by_id['skills_by_id'] = {k: conv(v) for k, v in cn.get('skills', {}).items()}
        by_id['arkpassive_by_id'] = {k: conv(v) for k, v in cn.get('arkpassive', {}).items()}
        by_id['cores_by_id'] = {k: conv(v) for k, v in cn.get('cores', {}).items()}
        by_id['runes_by_id'] = {k: conv(v) for k, v in cn.get('runes', {}).items()}
        by_id['classes_by_num'] = {k: conv(v) for k, v in cn.get('classes', {}).items()}
        # tripods: our data has 8 slots [t1 x3, t2 x3, t3 x2] with icons; CN has "tier-i" with icon
        tripods = load(os.path.join(data_dir, 'tripods.json'))
        for sid, cn_trip in cn.get('tripods', {}).items():
            ours = tripods.get(sid)
            if not ours:
                continue
            out = {}
            for tier in ('1', '2', '3'):
                base = (int(tier) - 1) * 3
                cands = {k: v for k, v in cn_trip.items() if k.startswith(tier + '-')}
                # by icon first
                used = set()
                for pos in range(3 if tier != '3' else 2):
                    slot = ours[base + pos] if base + pos < len(ours) else None
                    if not slot:
                        continue
                    icon = slot[1]
                    hit = next((k for k, v in cands.items() if v['icon'] == icon and k not in used), None)
                    if hit is None:
                        hit = next((k for k in cands if k == f'{tier}-{pos}' and k not in used), None)
                    if hit is None:
                        continue
                    used.add(hit)
                    out[str(base + pos)] = conv(cands[hit]['zh'])
            if out:
                by_id['tripods_by_id'][sid] = out
        stats['id:skills'] = len(by_id['skills_by_id'])
    # Taiwan client text by ID (lostarkcodex /tw/) overrides the CN baseline
    tw_path = os.path.join(terms_dir, 'tw_ids.json')
    if os.path.exists(tw_path):
        tw = load(tw_path)
        n = 0
        for sid, z in (tw.get('skills') or {}).items():
            if z:
                by_id['skills_by_id'][sid] = z
                n += 1
        for sid, pos in (tw.get('tripods') or {}).items():
            cur = by_id['tripods_by_id'].setdefault(sid, {})
            for k, z in pos.items():
                if z:
                    cur[k] = z
        stats['tw:skills'] = n
        stats['tw:tripod skills'] = len(tw.get('tripods') or {})
        stats['id:tripod skills'] = len(by_id['tripods_by_id'])
        stats['id:arkpassive'] = len(by_id['arkpassive_by_id'])
        stats['id:cores'] = len(by_id['cores_by_id'])
        stats['id:runes'] = len(by_id['runes_by_id'])

    # ---- name-keyed research results ----
    g = os.path.join(terms_dir, 'general.json')
    if os.path.exists(g):
        gen = load(g)
        for sec in ['classes', 'class_engravings', 'engravings', 'runes', 'systems', 'stats']:
            for en, v in (gen.get(sec) or {}).items():
                r = val(v)
                if r:
                    M.put(sec, en, r[0], r[1])
                    # "Berserker: Mayhem" -> also store under "Mayhem"
                    if sec == 'class_engravings' and ': ' in en:
                        M.put(sec, en.split(': ', 1)[1], r[0], r[1])
    cc_path = os.path.join(terms_dir, 'chaos_cores.json')
    if os.path.exists(cc_path):
        cc = load(cc_path)
        for en, v in (cc.get('cores') or {}).items():
            r = val(v)
            if r:
                M.put('cores', en, r[0], r[1])
        for en, v in (cc.get('ark_passive_common') or {}).items():
            r = val(v)
            if r:
                M.put('arkpassive', en, r[0], r[1])
        for en, v in (cc.get('systems') or {}).items():
            r = val(v)
            if r:
                M.put('systems', en, r[0], r[1])
    rd = os.path.join(terms_dir, 'raids.json')
    if os.path.exists(rd):
        raids = load(rd)
        for sec_in, sec_out in [('categories', 'raid_categories'), ('raids', 'raids'), ('bosses', 'bosses'), ('difficulties', 'difficulties'), ('misc', 'misc')]:
            for en, v in (raids.get(sec_in) or {}).items():
                r = val(v)
                if not r:
                    continue
                src = r[1]
                # "Aegir (TW extra)" -> key "Aegir", Taiwan name takes priority
                if en.endswith(' (TW extra)'):
                    en, src = en[:-len(' (TW extra)')], 'tw'
                elif en.endswith(' (extra)'):
                    en = en[:-len(' (extra)')]
                M.put(sec_out, en, r[0], src)

    per_class = {'skills': {}, 'tripods': {}, 'cores': {}, 'arkpassive': {}}
    for p in sorted(glob.glob(os.path.join(terms_dir, 'group*.json'))):
        try:
            groups = load(p)
        except Exception as e:
            print('skip', p, e)
            continue
        if isinstance(groups, dict):
            groups = groups.get('classes') or list(groups.values())
        for cls in groups:
            if not isinstance(cls, dict):
                continue
            cid = str(cls.get('class_id'))
            if cls.get('class_zh') and cls.get('class_en'):
                # class_zh from group files is usually CN; general.json (tw) wins by rank
                M.put('classes', cls['class_en'], cls['class_zh'], 'cn')
            for sec, key in [('skills', 'skills'), ('tripods', 'tripods'), ('cores', 'ark_grid_cores'), ('arkpassive', 'ark_passive_nodes')]:
                d = cls.get(key) or {}
                n = 0
                for en, v in d.items():
                    r = val(v)
                    if r:
                        n += 1
                        M.put(sec, en, r[0], r[1])            # global name map
                        M.put(f'{sec}#{cid}', en, r[0], r[1])  # class-scoped
                stats[f'{sec}:{cls.get("class_en")}'] = f'{n}/{len(d)}'

    # 方舟星圖核心：台灣平衡公告比對到的名稱優先於陸服 ID 對照（保留「秩序之X核心：」前綴格式）
    twc_path = os.path.join(terms_dir, 'tw_cores.json')
    if os.path.exists(twc_path):
        twc = load(twc_path).get('cores', {})
        n = 0
        for iid, z in twc.items():
            cur = by_id['cores_by_id'].get(iid)
            prefix = cur.split('：')[0] + '：' if cur and '：' in cur else ''
            by_id['cores_by_id'][iid] = prefix + z
            n += 1
        stats['tw:cores'] = n

    # 符文：台灣官方名稱（依英文名）優先於陸服 ID 對照
    runes_path = os.path.join(data_dir, 'runes.json')
    if os.path.exists(runes_path):
        tw_runes = M.section('runes')
        for rid, (en, _grade) in load(runes_path).items():
            if en in tw_runes:
                by_id['runes_by_id'][rid] = tw_runes[en]

    # 方舟被動節點：台灣名稱（依英文名，含 zh_overrides 的 arkpassive 區段與台灣職業刻印名）優先於陸服 ID 對照
    ap_path = os.path.join(data_dir, 'arkpassive.json')
    if os.path.exists(ap_path):
        ov_ap = {}
        ov_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zh_overrides.json')
        if os.path.exists(ov_path):
            ov_ap = {k: v for k, v in (load(ov_path).get('arkpassive') or {}).items() if isinstance(v, str)}
        tw_eng = {k: v[1] for (s, k), v in M.best.items() if s == 'class_engravings' and v[0] >= RANK['tw']}
        tw_ap_path = os.path.join(terms_dir, 'tw_arkpassive.json')
        tw_ap = load(tw_ap_path) if os.path.exists(tw_ap_path) else {}
        n = 0
        for nid, node in load(ap_path).items():
            en = node[0]
            z = ov_ap.get(en) or tw_ap.get(nid) or (tw_eng.get(en) if node[2] == 1 else None)
            if z:
                by_id['arkpassive_by_id'][nid] = z
                n += 1
        stats['tw:arkpassive overrides'] = n

    # 以方舟被動節點為職業刻印的新職業：用 ID 對照補上名稱（例如 Valkyrie / Dimensionalist / Guardianknight）
    classes_path = os.path.join(data_dir, 'classes.json')
    if os.path.exists(classes_path):
        for cls in load(classes_path):
            for e in cls.get('engravings', []):
                if e.get('type') == 'arkpassive':
                    z = by_id['arkpassive_by_id'].get(str(e['id']))
                    if z and ('class_engravings', e['name']) not in M.best:
                        M.put('class_engravings', e['name'], z, 'cn')

    out = {'ui': {}}
    for sec in ['classes', 'class_engravings', 'engravings', 'runes', 'systems', 'stats', 'raid_categories', 'raids', 'bosses', 'difficulties', 'misc']:
        out[sec] = M.section(sec)
    for sec in ['skills', 'tripods', 'cores', 'arkpassive']:
        o = {'_': M.section(sec)}
        for (s, k), v in M.best.items():
            if s.startswith(sec + '#'):
                o.setdefault(s.split('#')[1], {})[k] = v[1]
        out[sec] = o
    out.update(by_id)

    # ---- manual overrides (highest priority) ----
    ov = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zh_overrides.json')
    if os.path.exists(ov):
        o = load(ov)
        for sec, d in o.items():
            if sec in ('skills', 'tripods', 'cores', 'arkpassive'):
                for k, v in d.items():
                    if isinstance(v, dict):
                        out[sec].setdefault(k, {}).update(v)
                    else:
                        out[sec]['_'][k] = v
            else:
                out.setdefault(sec, {}).update(d)

    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    for k, v in stats.items():
        print(k, v)
    print('written', out_file)


if __name__ == '__main__':
    main()
