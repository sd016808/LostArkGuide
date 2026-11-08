# -*- coding: utf-8 -*-
"""
Align Taiwan Ark Grid core names (and per-tier effect text) from TW official class-balance
announcements to our core instance IDs, by matching the numbers in the TW effect text against
the English effect description of the same point tier.

Usage: python -I tools/align_tw_cores.py <tw_cores_raw.json> <data_dir> <out_file>
  tw_cores_raw.json  [{class, type:[order,kind], name, tiers:[[P, text], ...]}]  (parsed from announce pages)
Writes {"cores": {instanceId: twName}, "effects": {effectId: twText}}
"""
import json, re, sys, os, collections

NUM = re.compile(r'\d+(?:\.\d+)?')
TIER_INDEX = {10: 0, 14: 1, 17: 2, 18: 3, 19: 4, 20: 5}


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


def main(raw_path, data_dir, out_file):
    raw = json.load(open(raw_path, encoding='utf-8'))
    cores = json.load(open(os.path.join(data_dir, 'cores.json'), encoding='utf-8'))
    desc = json.load(open(os.path.join(data_dir, 'core_desc.json'), encoding='utf-8'))
    # candidates: nameId -> list of instances (grade variants share nameId); use highest grade (most effects)
    by_key = collections.defaultdict(dict)
    for iid, inst in cores['instances'].items():
        name, order, kind, name_id, grade, effects, cnum = inst
        cur = by_key[(cnum, order, kind)].get(name_id)
        if cur is None or len(effects) > len(cur[1]):
            by_key[(cnum, order, kind)][name_id] = (iid, effects, name)
    out_cores, out_eff, report = {}, {}, []
    for item in raw:
        key = (item['class'], item['type'][0], item['type'][1])
        cands = by_key.get(key, {})
        best = None
        for name_id, (iid, effects, en) in cands.items():
            score = 0
            matched = []
            for p, tw in item['tiers']:
                idx = TIER_INDEX.get(p)
                if idx is None or idx >= len(effects) or not tw:
                    continue
                acc = []
                flat(desc.get(str(int(effects[idx])), []), acc)
                en_nums = nums(' '.join(acc))
                tw_nums = nums(tw)
                if tw_nums and tw_nums <= en_nums | {'3', '1', '2'}:  # tw numbers must appear in EN
                    score += len(tw_nums)
                    matched.append((str(int(effects[idx])), tw))
            if score and (best is None or score > best[0]):
                best = (score, name_id, iid, en, matched)
        if best and best[0] >= 3:
            _, name_id, iid, en, matched = best
            # map every grade variant of this core name
            for iid2, inst in cores['instances'].items():
                if inst[3] == name_id:
                    out_cores[iid2] = item['name']
            for eid, tw in matched:
                out_eff[eid] = tw
            report.append((item['class'], en, item['name'], best[0]))
        else:
            report.append((item['class'], None, item['name'], 0))
    json.dump({'cores': out_cores, 'effects': out_eff}, open(out_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    for r in sorted(report, key=lambda x: (x[0], x[3])):
        print(r)
    print('matched cores', len({v for v in out_cores.values()}), '/', len(raw), '; TW effect texts', len(out_eff))


if __name__ == '__main__':
    main(*sys.argv[1:4])
