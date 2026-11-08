# -*- coding: utf-8 -*-
"""
Taiwan Ark Grid core names + effect texts by core ID.

1) Names: vendor/terms/tw_core_names.json is the full TW in-game core list (screenshots from the
   TW client), in in-game list order == item-ID order. Sorting our core name IDs per (order/chaos,
   sun/moon/star) and zipping gives an exact ID -> TW name mapping.
2) Effect texts: TW class-balance announcements quote some tiers verbatim ("變更後：…"). A quoted
   text is attached to that core's tier only if its numbers all appear in the current English text
   (guards against outdated values).

Usage: python -I tools/align_tw_cores.py <tw_cores_raw.json> <data_dir> <terms_dir>
  tw_cores_raw.json  [{class, type:[order,kind], name, tiers:[[P, text], ...]}] parsed from announcements
Writes <terms_dir>/tw_cores.json  {"cores": {instanceId: twName}, "effects": {effectId: twText}}
"""
import json, re, sys, os, collections

NUM = re.compile(r'\d+(?:\.\d+)?')
TIER_INDEX = {10: 0, 14: 1, 17: 2, 18: 3, 19: 4, 20: 5}
LIST_KEYS = {(0, 0): 'order_sun', (0, 1): 'order_moon', (0, 2): 'order_star',
             (1, 0): 'chaos_sun', (1, 1): 'chaos_moon', (1, 2): 'chaos_star'}


def flat(node, acc):
    if isinstance(node, str):
        acc.append(node)
    elif isinstance(node, (int, float)):
        acc.append(str(node))
    elif isinstance(node, list):
        if len(node) == 3 and node[0] == 2 and isinstance(node[1], str):
            for v in node[2]:
                flat(v, acc)
        elif len(node) == 3 and node[0] == 4 and isinstance(node[1], list):
            op, a, b = node[1]
            n = a - b if op == '-' else a + b if op == '+' else a * b if op == '*' else b
            acc.append(f'{n:.{node[2] or 0}f}')
        else:
            for x in node:
                flat(x, acc)


def nums(text):
    return set(NUM.findall(text.replace('，', ',')))


def main(raw_path, data_dir, terms_dir):
    cores = json.load(open(os.path.join(data_dir, 'cores.json'), encoding='utf-8'))
    desc = json.load(open(os.path.join(data_dir, 'core_desc.json'), encoding='utf-8'))
    tw_list = json.load(open(os.path.join(terms_dir, 'tw_core_names.json'), encoding='utf-8'))

    # nameId -> (order, kind, classNum, effects of the highest grade)
    meta = {}
    for iid, inst in cores['instances'].items():
        name, order, kind, nid, grade, effects, cnum = inst
        cur = meta.get(nid)
        if cur is None or len(effects) > len(cur[3]):
            meta[nid] = (order, kind, cnum, effects)
    groups = collections.defaultdict(list)
    for nid, (order, kind, _c, _e) in meta.items():
        groups[(order, kind)].append(nid)

    name_by_nid = {}
    for key, nids in groups.items():
        nids.sort(key=int)
        names = tw_list[LIST_KEYS[key]]
        if len(names) != len(nids):
            print(f'WARNING {LIST_KEYS[key]}: {len(names)} TW names vs {len(nids)} cores — skipped')
            continue
        for nid, z in zip(nids, names):
            name_by_nid[nid] = z

    out_cores = {iid: name_by_nid[inst[3]] for iid, inst in cores['instances'].items() if inst[3] in name_by_nid}

    # effect texts from announcements, attached by exact TW name (+class to disambiguate duplicates)
    raw = json.load(open(raw_path, encoding='utf-8')) if os.path.exists(raw_path) else []
    out_eff = {}
    hits = misses = 0
    for item in raw:
        order, kind = item['type']
        cands = [nid for nid in groups.get((order, kind), []) if name_by_nid.get(nid) == item['name']]
        if len(cands) > 1:
            cands = [nid for nid in cands if meta[nid][2] == item['class']] or cands[:1]
        if not cands:
            misses += 1
            continue
        effects = meta[cands[0]][3]
        for p, tw in item['tiers']:
            idx = TIER_INDEX.get(p)
            if idx is None or idx >= len(effects) or not tw:
                continue
            eid = str(int(effects[idx]))
            acc = []
            flat(desc.get(eid, []), acc)
            if nums(tw) and nums(tw) <= nums(' '.join(acc)):
                out_eff[eid] = tw
                hits += 1
    json.dump({'cores': out_cores, 'effects': out_eff}, open(os.path.join(terms_dir, 'tw_cores.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0)
    print(f'TW core names: {len(name_by_nid)} names -> {len(out_cores)} instances; '
          f'announcement effect texts kept: {hits} (unmatched announcement cores: {misses})')


if __name__ == '__main__':
    main(*sys.argv[1:4])
