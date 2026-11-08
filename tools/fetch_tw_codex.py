# -*- coding: utf-8 -*-
"""
Fetch Taiwan-client skill text from lostarkcodex.com (/tw/) by game ID and build tw_ids.json
for tools/build_zh.py:  {"skills": {id: zh}, "tripods": {skillId: {"0".."7": zh}}, "skill_types": {id: [labels]}}

Usage: python -I tools/fetch_tw_codex.py <cache_dir> <data_dir> <out_file>
  cache_dir  where raw downloads are kept (re-runs skip cached files)
  data_dir   public/data (tripods.json gives our tripod slot icons for alignment)
Uses curl (plain) with a small delay; the codex data lags the live TW client (2025-05 as of writing),
so skills released later are simply absent and fall back to other sources.
"""
import json, os, re, sys, time, html, subprocess

BASE = 'https://lostarkcodex.com'
DELAY = 0.4


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return open(path, encoding='utf-8', errors='ignore').read()
    r = subprocess.run(['curl', '-s', '-f', '--max-time', '60', url], capture_output=True)
    time.sleep(DELAY)
    if r.returncode != 0:
        return ''
    body = r.stdout.decode('utf-8', errors='ignore')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(body)
    return body


def main(cache, data_dir, out_file):
    os.makedirs(os.path.join(cache, 'pages'), exist_ok=True)
    # 1) all TW skills (any unknown type returns the full list)
    body = get(f'{BASE}/query.php?a=skills&type=all&l=tw', os.path.join(cache, 'skills_all.json'))
    skills = {}
    try:
        for row in json.loads(body)['aaData']:
            m = re.search(r'<span></span>(.*?)</b>', row[2])
            if m:
                skills[str(row[0])] = html.unescape(m.group(1))
    except Exception as e:
        print('skill list failed', e)
    print('TW skills', len(skills))
    # 2) skill pages for tripod names, aligned by tripod icon
    tripods = json.load(open(os.path.join(data_dir, 'tripods.json'), encoding='utf-8'))
    out_trip = {}
    types = {}
    ids = [sid for sid in tripods if sid in skills]
    for i, sid in enumerate(ids):
        page = get(f'{BASE}/tw/skill/{sid}/', os.path.join(cache, 'pages', f'{sid}.html'))
        if not page:
            continue
        # tripod features: icon + title tooltip holding the name
        # each tripod: <img src="/icons/tripod_tier_X_Y.webp" ...><br>NAME</div>
        feats = re.findall(r'<img src="/icons/(tripod_tier_\d_\d+)\.webp"[^>]*><br>\s*([^<]+?)\s*</div>', page)
        by_icon = {}
        for icon, name in feats:
            by_icon.setdefault(icon, html.unescape(name).strip())
        slots = tripods[sid]
        got = {}
        for pos, slot in enumerate(slots):
            if slot and slot[1] in by_icon:
                got[str(pos)] = by_icon[slot[1]]
        if got:
            out_trip[sid] = got
        lab = re.findall(r'<span class="skill_effects">(.*?)</span>', page)
        if lab:
            types[sid] = [html.unescape(x) for x in lab]
        if (i + 1) % 50 == 0:
            print(f'{i + 1}/{len(ids)} pages, tripod skills so far {len(out_trip)}')
    json.dump({'skills': skills, 'tripods': out_trip, 'skill_types': types}, open(out_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('done: skills', len(skills), 'tripod skills', len(out_trip), 'typed', len(types))


if __name__ == '__main__':
    main(*sys.argv[1:4])
