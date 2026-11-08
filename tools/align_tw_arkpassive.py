# -*- coding: utf-8 -*-
"""
Align Taiwan Ark Passive node names (from TW official class-balance announcements) to node IDs
by matching the numbers in their effect descriptions against the China-server node descriptions
(which we already have by ID from lostark.dvg.cn /api/t4.php).

Usage: python -I tools/align_tw_arkpassive.py <tw_html_dir> <dvg_raw_dir> <data_dir> <out_file>
  tw_html_dir  folder of saved mangot5 announce pages (*.html)
  dvg_raw_dir  folder with t4_<classnum>.json from tools/fetch_cn_terms.py
  data_dir     public/data (arkpassive.json, zh.json for TW class names)
Writes {node_id: tw_name} for confident matches.
"""
import re, json, os, sys, glob, html, collections

NUM = re.compile(r'\d+(?:\.\d+)?')


def page_text(path):
    s = open(path, encoding='utf-8', errors='ignore').read()
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', s, flags=re.S)
    t = re.sub(r'<br\s*/?>|</(p|div|li|tr|td|h\d)>', '\n', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t)
    t = re.sub(r'[ \t\xa0]+', ' ', t)
    return re.sub(r'\n\s*\n+', '\n', t)


def numbers(text):
    return set(NUM.findall(text.replace('，', ',')))


def main(tw_dir, raw_dir, data_dir, out_file):
    zh = json.load(open(os.path.join(data_dir, 'zh.json'), encoding='utf-8'))
    ap = json.load(open(os.path.join(data_dir, 'arkpassive.json'), encoding='utf-8'))
    classes = json.load(open(os.path.join(data_dir, 'classes.json'), encoding='utf-8'))
    tw_class_to_num = {}
    for c in classes:
        z = zh['classes'].get(c['en'])
        if z:
            tw_class_to_num[z] = c['num']
    # CN descriptions by node id (all levels joined)
    cn_desc = {}
    for p in glob.glob(os.path.join(raw_dir, 't4_*.json')):
        try:
            pages = json.load(open(p, encoding='utf-8'))['data']['contentsInfo']['passivePage']
        except Exception:
            continue
        for page in pages.values():
            for tier in page.get('tierList', []):
                for node in tier.get('passiveList', []):
                    cn_desc[str(node['group_code'])] = ' '.join(re.sub(r'<[^>]+>', '', d) for d in node.get('desc', []))

    # TW announcements: find class sections and 「name」被動 ... 變更後：desc
    found = collections.defaultdict(dict)  # class_num -> name -> set(numbers)
    for p in glob.glob(os.path.join(tw_dir, '*.html')):
        t = page_text(p)
        lines = t.split('\n')
        cur = None
        for i, line in enumerate(lines):
            s = line.strip()
            if s in tw_class_to_num:
                cur = tw_class_to_num[s]
                continue
            if cur is None:
                continue
            m = re.search(r'「([^」]+)」被動(?:變更為「([^」]+)」被動)?', s)
            if m:
                name = m.group(2) or m.group(1)
                # description: following lines until next 「 or blank, prefer 變更後
                desc = ''
                for j in range(i + 1, min(i + 6, len(lines))):
                    l2 = lines[j].strip()
                    if '「' in l2 and '被動' in l2:
                        break
                    if l2.startswith('變更後'):
                        desc = l2
                        break
                    if not desc and l2.startswith('變更前'):
                        continue
                if not desc:
                    for j in range(i + 1, min(i + 4, len(lines))):
                        if lines[j].strip() and '「' not in lines[j]:
                            desc = lines[j].strip()
                            break
                nums = numbers(desc)
                if len(nums) >= 2:
                    found[cur][name] = nums | found[cur].get(name, set())

    out = {}
    report = []
    for cnum, names in found.items():
        cands = {nid: numbers(cn_desc.get(nid, '')) for nid, n in ap.items() if n[6] == cnum and nid in cn_desc}
        for name, nums in names.items():
            scored = []
            for nid, cn in cands.items():
                if not cn:
                    continue
                inter = len(nums & cn)
                if inter >= 2 and inter >= len(nums) * 0.6:
                    scored.append((inter / len(nums | cn), inter, nid))
            scored.sort(reverse=True)
            if scored and scored[0][0] >= 0.5 and (len(scored) == 1 or scored[0][0] > scored[1][0] * 1.3):
                nid = scored[0][2]
                if nid in out and out[nid] != name:
                    continue
                out[nid] = name
                report.append((cnum, ap[nid][0], name, round(scored[0][0], 2)))
    json.dump(out, open(out_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in sorted(report):
        print(r)
    print('matched', len(out), 'of', sum(len(v) for v in found.values()), 'TW node mentions')


if __name__ == '__main__':
    main(*sys.argv[1:5])
