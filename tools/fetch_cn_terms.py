# -*- coding: utf-8 -*-
"""
Fetch Chinese (China server) names from 方舟小册子 lostark.dvg.cn and map them by
in-game ID to the data used by this site. IDs (skills, tripod icons, ark passive
group codes, core item IDs, rune IDs) are identical between the CN client and the
Global client, so no name matching is needed.

Usage: python -I tools/fetch_cn_terms.py <raw_dir> <out_file>
  raw_dir   where raw API responses are cached (re-run skips cached files)
  out_file  JSON written with ID-keyed maps (consumed by tools/build_zh.py)
"""
import json, os, sys, time, urllib.request, urllib.parse

BASE = 'https://lostark.dvg.cn'
CLASSES = [102, 103, 104, 105, 112, 113, 202, 203, 204, 205, 302, 303, 304, 305, 312, 313,
           402, 403, 404, 405, 502, 503, 504, 505, 512, 602, 603, 604, 612, 702]
DELAY = 1.0


def get(url, cache_path):
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        with open(cache_path, encoding='utf-8') as f:
            return json.load(f)
    # 使用 curl（站方 WAF 會擋 Python-urllib 的請求）
    import subprocess
    r = subprocess.run(['curl', '-s', '-f', '--max-time', '60', url], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f'curl exit {r.returncode}')
    body = r.stdout
    time.sleep(DELAY)
    data = json.loads(body.decode('utf-8'))
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def main(raw_dir, out_file):
    os.makedirs(raw_dir, exist_ok=True)
    out = {'classes': {}, 'skills': {}, 'tripods': {}, 'arkpassive': {}, 'cores': {}, 'runes': {}, 'skill_icons': {}}
    for cid in CLASSES:
        try:
            p = get(f'{BASE}/tools/planner-api.php?action=class&id={cid}', os.path.join(raw_dir, f'planner_{cid}.json'))
            d = p.get('data') or {}
            if d.get('class_name'):
                out['classes'][str(cid)] = d['class_name']
            for sk in d.get('skills', []):
                out['skills'][str(sk['id'])] = sk['name']
                trip = {}
                for tier, lst in (sk.get('tripods') or {}).items():
                    for i, tp in enumerate(lst):
                        icon = os.path.splitext(os.path.basename(tp.get('icon', '')))[0]
                        trip[f'{tier}-{i}'] = {'zh': tp['name'], 'icon': icon}
                out['tripods'][str(sk['id'])] = trip
            for ru in d.get('runes', []):
                out['runes'][str(ru['id'])] = ru['name']
        except Exception as e:
            print('planner failed', cid, e)
        try:
            s = get(f'{BASE}/api/skill_list.php?class={cid}&page_size=200', os.path.join(raw_dir, f'skills_{cid}.json'))
            for row in s.get('rows', []):
                out['skills'].setdefault(str(row['id']), row['name'])
        except Exception as e:
            print('skill_list failed', cid, e)
        try:
            t = get(f'{BASE}/api/t4.php?action=class&id={cid}', os.path.join(raw_dir, f't4_{cid}.json'))
            pages = (((t.get('data') or {}).get('contentsInfo') or {}).get('passivePage') or {})
            for page in pages.values():
                for tier in page.get('tierList', []):
                    for node in tier.get('passiveList', []):
                        name = node['name'].split('[')[0].strip()
                        out['arkpassive'][str(node['group_code'])] = name
        except Exception as e:
            print('t4 failed', cid, e)
        print('class', cid, 'done', len(out['skills']), 'skills so far')

    # Ark Grid cores: item search is fuzzy, so page through and keep only matching names
    for words, prefix in [('秩序之', '秩序之'), ('混沌之', '混沌之')]:
        page = 1
        while True:
            q = urllib.parse.quote(words)
            try:
                r = get(f'{BASE}/api/item_list.php?words={q}&page_size=100&page={page}', os.path.join(raw_dir, f'items_{prefix}_{page}.json'))
            except Exception as e:
                print('items failed', words, page, e)
                break
            rows = r.get('rows', [])
            for row in rows:
                name = row.get('name', '')
                if name.startswith(prefix) and '核心' in name:
                    out['cores'][str(row['id'])] = name
            pages = r.get('pages', 1)
            if page >= pages or not rows:
                break
            page += 1
        print('cores', prefix, len(out['cores']))

    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print('skills', len(out['skills']), 'tripod skills', len(out['tripods']), 'arkpassive', len(out['arkpassive']),
          'cores', len(out['cores']), 'runes', len(out['runes']), 'classes', len(out['classes']))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
