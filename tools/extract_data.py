# -*- coding: utf-8 -*-
"""
Convert the minified data chunks of lostark.bible (downloaded JS modules)
into JSON files used by the Chinese frontend.

Usage:  python -I tools/extract_data.py <chunks_dir> <out_dir>
The chunk file names are the hashed names from the lostark.bible bundle
(see CHUNKS below). Re-download them if the site is redeployed.
"""
import re, json, os, sys

CHUNKS = {
    'engravings': '1JUQL_5B.js',
    'classes': 'CIgaTdC-.js',
    'arkpassive': 'qx73q1L-.js',
    'skills': 'BtWxuuiK.js',
    'tripods': 'DSOShIUI.js',
    'runes': 'DYyY14m7.js',
    'items': 'BGHcGJW4.js',
    'cores': 'DtVrSRzL.js',
    'class_icons': 'BwVZ6PNY.js',
}

PLAY = {'berserker': 102, 'destroyer': 103, 'warlord': 104, 'holyknight': 105, 'berserker_female': 112,
        'holyknight_female': 113, 'arcana': 202, 'summoner': 203, 'bard': 204, 'elemental_master': 205,
        'battle_master': 302, 'infighter': 303, 'force_master': 304, 'lance_master': 305,
        'battle_master_male': 312, 'infighter_male': 313, 'blade': 402, 'demonic': 403, 'reaper': 404,
        'soul_eater': 405, 'hawk_eye': 502, 'devil_hunter': 503, 'blaster': 504, 'scouter': 505,
        'devil_hunter_female': 512, 'yinyangshi': 602, 'weather_artist': 603, 'alchemist': 604,
        'dimension_master': 612, 'dragon_knight': 702}
EN = {'berserker': 'Berserker', 'destroyer': 'Destroyer', 'warlord': 'Gunlancer', 'holyknight': 'Paladin',
      'berserker_female': 'Slayer', 'holyknight_female': 'Valkyrie', 'arcana': 'Arcanist', 'summoner': 'Summoner',
      'bard': 'Bard', 'elemental_master': 'Sorceress', 'battle_master': 'Wardancer', 'infighter': 'Scrapper',
      'force_master': 'Soulfist', 'lance_master': 'Glaivier', 'battle_master_male': 'Striker',
      'infighter_male': 'Breaker', 'blade': 'Deathblade', 'demonic': 'Shadowhunter', 'reaper': 'Reaper',
      'soul_eater': 'Souleater', 'hawk_eye': 'Sharpshooter', 'devil_hunter': 'Deadeye', 'blaster': 'Artillerist',
      'scouter': 'Machinist', 'devil_hunter_female': 'Gunslinger', 'yinyangshi': 'Artist',
      'weather_artist': 'Aeromancer', 'alchemist': 'Wildsoul', 'dimension_master': 'Dimensionalist',
      'dragon_knight': 'Guardianknight'}

BT = re.compile(r'`((?:[^`\\]|\\.)*)`')
NUMKEY = re.compile(r'([{,])(\d+(?:e\d+)?):')
IDKEY = re.compile(r'([{,])([A-Za-z_$][\w$]*):')


def js2json(src):
    s = BT.sub(lambda m: json.dumps(m.group(1), ensure_ascii=False), src)
    s = s.replace('!0', 'true').replace('!1', 'false')
    s = NUMKEY.sub(lambda m: m.group(1) + '"' + str(int(float(m.group(2)))) + '":', s)
    s = IDKEY.sub(r'\1"\2":', s)
    s = re.sub(r'(?<=[\[,:\-])\.(?=\d)', '0.', s)  # JS allows .5, JSON needs 0.5
    return json.loads(s)


def grab(src, start_pat):
    """Return the balanced {...} or [...] literal that starts at the end of start_pat."""
    i = src.find(start_pat)
    assert i >= 0, start_pat
    j = i + len(start_pat) - 1
    depth = 0
    k = j
    inside = False
    while True:
        c = src[k]
        if c == '`':
            inside = not inside
        elif not inside:
            if c in '{[':
                depth += 1
            elif c in '}]':
                depth -= 1
                if depth == 0:
                    break
        k += 1
    return src[j:k + 1]


def main(chunks, out):
    os.makedirs(out, exist_ok=True)
    rd = lambda n: open(os.path.join(chunks, CHUNKS[n]), encoding='utf-8').read()
    dump = lambda name, obj: json.dump(obj, open(os.path.join(out, name), 'w', encoding='utf-8'), ensure_ascii=False)

    eng = js2json(grab(rd('engravings'), 'var e={'))
    dump('engravings.json', eng)

    ap = js2json(grab(rd('arkpassive'), 'var e={'))
    dump('arkpassive.json', ap)

    c = rd('classes')
    # 例：berserker:[k(188),k(125)]  alchemist:[A(2330200,`Ferality`),A(2330100)]
    pairs = re.findall(r'(\w+):\[(\w)\((\d+(?:e\d)?)(?:,`([^`]*)`)?\),(\w)\((\d+(?:e\d)?)(?:,`([^`]*)`)?\)\]', grab(c, ',j={'))
    classes = []
    for cid, f1, id1, n1, f2, id2, n2 in pairs:
        if cid not in PLAY:
            continue

        def ref(f, i, override):
            i = str(int(float(i)))
            if f == 'k':
                return {'type': 'engraving', 'id': int(i), 'name': override or eng[i][0], 'icon': eng[i][1]}
            return {'type': 'arkpassive', 'id': int(i), 'name': override or ap[i][0], 'icon': ap[i][1]}
        classes.append({'id': cid, 'num': PLAY[cid], 'en': EN[cid], 'engravings': [ref(f1, id1, n1), ref(f2, id2, n2)]})
    dump('classes.json', classes)
    print('classes', len(classes))
    nums = set(PLAY.values())

    sk = js2json(grab(rd('skills'), 'var e={'))
    sk = {k: v for k, v in sk.items() if v[1] in nums}
    dump('skills.json', sk)
    print('skills', len(sk))

    tr = js2json(grab(rd('tripods'), 'var e={'))
    tr = {k: v for k, v in tr.items() if k in sk}
    dump('tripods.json', tr)
    print('tripods', len(tr))

    ru = js2json(grab(rd('runes'), 'var e={'))
    g = rd('items')
    runes = {}
    for k, v in ru.items():
        m = re.search(r'[{,]' + k + r':\[`[^`]*`,(\d+)', g)
        runes[k] = [v, int(m.group(1)) if m else 0]
    dump('runes.json', runes)
    print('runes', len(runes))

    d = rd('cores')
    core_names = js2json(grab(d, ',r={'))
    core_inst = js2json(grab(d, ',i={'))
    core_desc = js2json(grab(d, ',a={'))
    # 職業專屬（秩序）核心 + 通用（混沌）核心（classId 0）
    core_names = {k: v for k, v in core_names.items() if v[1] in nums or v[1] == 0}
    core_inst = {k: v for k, v in core_inst.items() if v[6] in nums or v[6] == 0}
    items = {}
    for k in core_inst:
        m = re.search(r'[{,]' + k + r':\[`([^`]*)`,(\d+)', g)
        if m:
            items[k] = [m.group(1), int(m.group(2))]
    dump('cores.json', {'names': core_names, 'instances': core_inst, 'items': items})
    dump('core_desc.json', core_desc)
    print('core names', len(core_names), 'instances', len(core_inst), 'desc', len(core_desc))

    colors = js2json(grab(c, ',w=['))
    dump('colors.json', {'grade': colors})

    b = rd('class_icons')
    tpl = dict(re.findall(r'[,;\s]([\w$]+)=e\(`(<svg[^`]*)`', b))
    br = dict(re.findall(r'([\w$]+)=e=>\{var n=([\w$]+)\(\);', b))
    # 例：K.loaClass===103||K.loaClass===`destroyer`?e($,2)  /  (K.loaClass===612||K.loaClass==`dimension_master`)&&e(Ie,38)
    chain = re.findall(r'K\.loaClass===(\d+)\|\|K\.loaClass={2,3}`(\w+)`\)?(?:\?|&&)e\(([\w$]+)', b)
    icons = {}
    for num, cid, fn in chain:
        v = br.get(fn)
        if v and v in tpl:
            icons[cid] = tpl[v]
    dump('class_icons.json', icons)
    print('icons', len(icons), 'templates', len(tpl), 'branches', len(br), 'chain', len(chain))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
