# -*- coding: utf-8 -*-
"""
Translate the Ark Grid core effect descriptions (public/data/core_desc.json) into Traditional Chinese.

The descriptions are generated from a small set of English sentence templates
("<skill> Damage +X%.", "On <effect> activation, gain the <effect> effect for Xs." ...).
This script applies a hand-written glossary of those templates (official Taiwan-server
terminology for stats / mechanics) and substitutes skill names by game ID from zh.json.
Proper nouns without an official Chinese source (core effect names, identity gauges)
are kept in English rather than invented.

Usage: python -I tools/translate_core_desc.py public/data
Writes public/data/core_desc_zh.json  { effectId: <same nested structure, translated> }
and prints coverage statistics.
"""
import json, os, re, sys, collections

PH = '⟦{}⟧'  # ⟦n⟧ placeholders for coloured value nodes
PH_RE = re.compile(r'⟦(\d+)⟧')

# ---- identity / mode terms with an official Chinese form we could verify (TW first) ----
IDENTITY = {
    'Burst Mode': '狂暴模式', 'Mayhem Mode': '狂氣模式', 'Burst': '狂暴',
    'Hyper Awakening Techniques': '超覺醒技能', 'Hyper Awakening': '超覺醒',
    'Awakening Skills': '覺醒技能', 'Awakening': '覺醒',
    'Normal Mode': '一般模式', 'Defensive Stance': '防禦架勢', 'Assault Stance': '突擊架勢',
    'Normal Skill': '一般技能', 'Normal Skills': '一般技能',
    # skill categories (TW/CN client terms that are identical or verified)
    'Esoteric Skill': '奧義技能', 'Esoteric Skills': '奧義技能', 'Esoteric': '奧義',
    'Demon Skill': '惡魔技能', 'Demon Skills': '惡魔技能',
    'Rifle Skill': '步槍技能', 'Shotgun Skill': '散彈槍技能', 'Handgun Skill': '手槍技能',
    'Rifle': '步槍', 'Shotgun': '散彈槍', 'Handgun': '手槍',
    'Gunlance Skill': '槍矛技能', 'Gunlance': '槍矛',
    'Paint Skill': '墨法技能', 'Paint': '墨法',
    'Shapeshift Skill': '變身技能', 'Shapeshift': '變身',
    'Phantom Beast Skill': '幻獸技能', 'Phantom Beast Awakening': '幻獸覺醒', 'Phantom Beast': '幻獸', 'Fox Skill': '狐技能',
    'Summon Skill': '召喚技能', 'Summon': '召喚',
    'Holy Blade Skill': '聖劍技能', 'Holy Blade': '聖劍',
    'Stamina Skill': '氣力技能', 'Shock Skill': '衝擊技能',
    'Sync-type Skill': '同步型技能', 'Sync-type': '同步型',
    'Gravity Release Skill': '重力解放技能', 'Gravity Release Mode': '重力解放模式', 'Gravity Release': '重力解放',
    'Hypergravity Zone': '超重力領域', 'Hypergravity': '超重力',
    'Sun Shower Status': '太陽雨狀態', 'Sun Shower': '太陽雨', 'Umbrella Skill': '雨傘技能', 'Umbrella': '雨傘',
    'Barrage Mode': '砲擊模式', 'Barrage Skill': '砲擊技能',
    'Forbidden Sorcery': '禁術', 'Stagger': '癱瘓', 'Weak Point': '弱點',
    'Max MP': '最大法力', 'HP recovery': '生命值恢復', 'Stand Up': '起身',
    'Boss': 'Boss',
}

# ordered (regex, replacement) rules; applied after skill-name substitution
RULES = [
    (r'Atk\./Move Speed', '攻擊／移動速度'), (r'Atk\. Speed', '攻擊速度'), (r'Atk\. Power', '攻擊力'),
    (r'Phy\./Mag\. ', '物理／魔法'), (r'Phy\. ', '物理'), (r'Mag\. ', '魔法'),
    (r'Normal Skill Damage \(excluding 超覺醒技能\)', '一般技能傷害（超覺醒技能除外）'),
    (r'\(excluding 超覺醒技能\)', '（超覺醒技能除外）'),
    (r'\(excluding Forbidden Sorcery Skills\)', '（禁術技能除外）'),
    (r'\(Excluding Movement, Stand Up, and 覺醒技能\)', '（移動、起身與覺醒技能除外）'),
    (r'Damage to Boss or higher foes', '對 Boss 以上等級敵人造成的傷害'),
    (r'Damage to foes', '對敵人造成的傷害'),
    (r'Damage (?:from|of) attacks (?:that are not|other than) (?:a )?Back Attack (?:or|and) Frontal Attack', '非背面攻擊與正面攻擊的傷害'),
    (r' when it hits as a Back Attack', '（背面攻擊命中時）'),
    (r'Back Attack', '背面攻擊'), (r'Frontal Attack', '正面攻擊'),
    (r'On Crit Hit, ', '暴擊時，'), (r'Crit Hit', '暴擊'), (r'Crit Damage', '暴擊傷害'), (r'Crit Rate', '暴擊率'),
    (r'Basic Attack Damage', '普通攻擊傷害'), (r'Basic Attack', '普通攻擊'),
    (r'Normal and Encroachment Skill Damage', '一般與侵蝕技能傷害'),
    (r'Normal Skill Damage', '一般技能傷害'),
    (r'Skill Casting Speed', '技能施放速度'), (r'Casting Speed', '施放速度'),
    (r'Skill Crit Damage', '技能暴擊傷害'), (r'Skill Damage', '技能傷害'), (r'Skill MP Cost', '技能法力消耗'),
    (r'Skill Cooldown', '技能冷卻時間'),
    (r'Damage Enhancement [Ee]ffect', '傷害增幅效果'), (r'Enhancement [Ee]ffect', '增幅效果'),
    (r'Ally Heal/Shield Bonus', '隊友治癒／護盾量'), (r'Ally Heal Bonus', '隊友治癒量'), (r'Ally Shield Bonus', '隊友護盾量'),
    (r'Ally ', '隊友'), (r'Party ', '隊伍'),
    (r'Damage Bonus', '額外傷害'), (r'Stagger Damage', '癱瘓傷害'),
    (r'Cooldown', '冷卻時間'), (r'MP Cost', '法力消耗'), (r'Max HP', '最大生命值'),
    (r'All Defense', '全部防禦力'), (r'Defense', '防禦力'), (r'Weapon Power', '武器攻擊力'), (r'Brand Power', '烙印力'),
    (r'Vitality', '活力'), (r'Move Speed', '移動速度'), (r'Push Immunity', '擊退免疫'),
    (r'Elemental Orbs?', '元素球'), (r'Skill Tree', '三重核心'),
    (r'Piety Meter', '虔誠量表'), (r'Serenade Meter', '小夜曲量表'), (r'Harmony Meter', '和諧量表'), (r'Specialty Meter', '特性量表'),
    (r' gained on (.+?) hit', '（\\1 命中時獲得）'), (r' gain on (.+?) hit', '（\\1 命中時獲得）'),
    (r'On (.+?) hit, (.+?) recovery \+', '\\1 命中時，\\2 恢復量 +'),
    (r'On (.+?) hit, (.+?) gained \+', '\\1 命中時，\\2 獲得量 +'),
    (r'On (.+?) hit, (.+?) \+', '\\1 命中時，\\2 +'),
    (r' gained \+', ' 獲得量 +'), (r' Gain \+', ' 獲得量 +'), (r' gain \+', ' 獲得量 +'),
    # activation templates
    (r'On (.+?) activation, gain (⟦\d+⟧) stacks of (?:the )?(.+?)(?: effect)? for (⟦\d+⟧)s?\.', '發動 \\1 時，獲得 \\2 層 \\3 效果，持續 \\4。'),
    (r'On (.+?) activation, gain (⟦\d+⟧) stacks of (?:the )?(.+?)(?: effect)?\.', '發動 \\1 時，獲得 \\2 層 \\3 效果。'),
    (r'On (.+?) activation, gain (?:the ?)?(.+?)(?: effect)? for (⟦\d+⟧)s?\.', '發動 \\1 時，獲得 \\2 效果，持續 \\3。'),
    (r'On (.+?) activation, gain (?:the ?)?(.+?)(?: effect)?\.', '發動 \\1 時，獲得 \\2 效果。'),
    (r'On (.+?) activation, (.+?) triggers for (⟦\d+⟧)s?\.', '發動 \\1 時，\\2 發動，持續 \\3。'),
    (r'On (.+?) activation, next (.+?) \+(⟦\d+⟧) for (⟦\d+⟧) time\(s\)\.', '發動 \\1 時，接下來 \\4 次的 \\2 +\\3。'),
    (r'On (.+?) activation, ', '發動 \\1 時，'),
    (r'When (?:the )?(.+?) effect ends, (?:the )?(.+?) effects? (?:is|are) removed\.', '\\1 效果結束時，移除 \\2 效果。'),
    (r'(.+?) effect is enhanced\.', '\\1 效果強化。'), (r': Effect is enhanced\.', '：效果強化。'),
    (r'Enhanced effectiveness for (⟦\d+⟧)\.', '強化 \\1 的效果。'),
    (r'This effect disappears after one use\.', '此效果使用一次後消失。'),
    (r'Grants Push Immunity during skill use\.', '施放技能期間獲得擊退免疫。'),
    (r'Grants 擊退免疫 during skill use\.', '施放技能期間獲得擊退免疫。'),
    (r'Max (⟦\d+⟧) stacks\.', '最多疊加 \\1 層。'), (r' per stack', '（每層）'),
    (r'Entering (.+?) activates (⟦\d+⟧)\.', '進入 \\1 時發動 \\2。'),
    (r'Using (.+?) activates (⟦\d+⟧)\.', '使用 \\1 時發動 \\2。'),
    (r'On (.+?) use, consume (⟦\d+⟧) 元素球 to increase Damage by (⟦\d+⟧)\.', '使用 \\1 時，消耗 \\2 個元素球使傷害增加 \\3。'),
    (r'On (.+?) use, consume (?:the )?(.+?) effect\.', '使用 \\1 時，消耗 \\2 效果。'),
    (r'On (.+?) use, ', '使用 \\1 時，'),
    (r'(.+?) Skills? (⟦\d+⟧) times? activates (⟦\d+⟧)\.', '使用 \\1 技能 \\2 次時發動 \\3。'),
    (r'(.+?) Skills? (⟦\d+⟧) time\(s\) activates (⟦\d+⟧)\.', '使用 \\1 技能 \\2 次時發動 \\3。'),
    (r'(.+?) 三重核心 is applied, ', '套用 \\1 三重核心時，'),
    (r'Damage of (.+?) and (.+?) \+', '\\1 與 \\2 的傷害 +'),
    (r'Damage \+(⟦\d+⟧) in 一般模式', '一般模式中傷害 +\\1'),
    (r'In (.+?) (Mode|Stance|Status|Zone), ', lambda m: f"處於{m.group(1)}{ {'Mode': '模式', 'Stance': '架勢', 'Status': '狀態', 'Zone': '領域'}[m.group(2)] }時，"),
    (r'While in (.+?), ', '處於 \\1 時，'), (r'During (.+?), ', '\\1 期間，'),
    (r' while (.+?) is active', '（\\1 啟動期間）'),
    (r' in (.+?) (Mode|Stance)\b', lambda m: f"（{m.group(1)}{'模式' if m.group(2) == 'Mode' else '架勢'}中）"),
    (r"(.+?)'s last attack Damage", '\\1 最後一擊的傷害'),
    (r'With (.+?)[,，] ?', '搭配 \\1 時，'),
    (r'Upon entering (.+?)[,，] ?next (.+?) Damage \+', '進入 \\1 時，接下來的 \\2 傷害 +'),
    (r'Upon entering (.+?)[,，] ?', '進入 \\1 時，'), (r'Upon using (.+?)[,，] ?', '使用 \\1 時，'), (r'On using (.+?)[,，] ?', '使用 \\1 時，'),
    (r'When using (.+?) or (.+?)[,，] ?', '使用 \\1 或 \\2 時，'), (r'When not in (.+?)[,，] ?', '不在 \\1 狀態時，'),
    (r'Recover (⟦\d+⟧) for Max MP on (.+?) hit\.', '\\2 命中時，恢復 \\1 的最大法力。'),
    (r'While the (⟦\d+⟧) effect is active[,，] ?', '\\1 效果啟動期間，'), (r'While (⟦\d+⟧) is active[,，] ?', '\\1 啟動期間，'),
    (r'Activating (⟦\d+⟧) resets the cooldown of (.+?)\.', '發動 \\1 時重置 \\2 的冷卻時間。'),
    (r'Removed on (.+?) use\.', '使用 \\1 時移除。'), (r'Removed upon using (.+?)\.', '使用 \\1 時移除。'), (r'Removed when (.+?) is used\.', '使用 \\1 時移除。'),
    (r"On a successful attack, additionally decreases the target's defenses by (⟦\d+⟧) for (⟦\d+⟧)s?\.", '攻擊命中時，額外使目標防禦力降低 \\1，持續 \\2。'),
    (r'On a successful attack, the target takes \+(⟦\d+⟧) (.+?) from you and party members for (⟦\d+⟧)s?\.', '攻擊命中時，目標受到你與隊友的\\2 +\\1，持續 \\3。'),
    (r'When the Brand effect is applied, target takes \+(⟦\d+⟧) (.+?) from you and party members for (⟦\d+⟧)s?\.', '套用烙印效果時，目標受到你與隊友的\\2 +\\1，持續 \\3。'),
    (r'On a successful attack, (.+?) cooldown -(⟦\d+⟧) once every (⟦\d+⟧)\.', '攻擊命中時，\\1 冷卻時間 -\\2（每 \\3 一次）。'),
    (r'On a successful attack, ', '攻擊命中時，'),
    (r'(.+?) cooldown \+(⟦\d+⟧)s?, but ', '\\1 冷卻時間 +\\2，但 '), (r'\bcooldown\b', '冷卻時間'),
    (r'(⟦\d+⟧) time\(s\)', '\\1 次'), (r'(⟦\d+⟧) times', '\\1 次'), (r'(⟦\d+⟧) time\b', '\\1 次'),
    (r'Next ', '接下來的 '), (r'Additional Damage', '額外傷害'), (r'Incoming Damage', '受到的傷害'), (r' additional\.', '（額外）。'),
    (r'(\S+) Rate \+', '\\1率 +'), (r'changed to (⟦\d+⟧)', '變更為 \\1'), (r'changes to (⟦\d+⟧)', '變更為 \\1'), (r'increases to (⟦\d+⟧)', '提高為 \\1'),
    (r'Burn Damage', '燃燒傷害'), (r' in Split Timeline', '（時間線分裂中）'), (r'Weak Point attack', '弱點攻擊'),
    (r'On (.+?) Hit, ', '\\1命中時，'), (r' always hits as a (.+?)\.', ' 必定判定為\\1。'),
    (r'(.+?) becomes stackable up to (⟦\d+⟧) times\.', '\\1 最多可疊加 \\2 層。'), (r'Up to (⟦\d+⟧) (.+?)\.', '最多 \\1 \\2。'),
    (r'Number of (⟦\d+⟧) (.+?) obtained changes to (⟦\d+⟧)\.', '獲得的 \\1 \\2 數量變更為 \\3。'),
    (r'(⟦\d+⟧) now also increases (.+?) by (⟦\d+⟧)\.', '\\1 現在也會使 \\2 增加 \\3。'),
    (r'(.+?) of (⟦\d+⟧) changes to (⟦\d+⟧)\.', '\\1 由 \\2 變更為 \\3。'), (r'Changes (.+?) of (⟦\d+⟧) to (⟦\d+⟧)\.', '\\1 由 \\2 變更為 \\3。'),
    (r'(.+?) from (⟦\d+⟧) increases to (⟦\d+⟧)\.', '\\1 由 \\2 提高為 \\3。'),
    (r' while the (.+?) lasts', '（\\1 持續期間）'), (r'(\S+) consumption of ', '\\1消耗（'), (r'Stamina consumption', '氣力消耗'),
    (r'\bgain\b', '獲得'), (r'\bgrants\b', '給予'), (r'\brecover\b', '恢復'), (r'\bstate\b', '狀態'), (r'\bmode\b', '模式'),
    (r'\bthe\b ?', ''), (r'\bof\b', '的'), (r'\bper\b', '每'), (r'\bbut\b', '但'), (r'\bor\b', '或'), (r'\bupon using\b', '使用時'),
    (r'\bAttack\b', '攻擊'), (r'\bHit\b', '命中'), (r'\bhit\b', '命中'), (r'\buse\b', '使用'), (r'\bNon-', '非'), (r'\bNon ', '非'),
    (r'\bLevel\b', '等級'), (r'\bduration\b', '持續時間'), (r'\bImmunity\b', '免疫'), (r'\bParalysis\b', '麻痺'), (r'\bCores?\b', '核心'),
    (r'\bCard\b', '卡'), (r'\bCommand\b', '指令'), (r'\bOrbs?\b', '球'), (r'\bMeter\b', '量表'), (r'\bShield\b', '護盾'), (r'\bEnergy\b', '能量'),
    (r'\(excluding (.+?)\)', '（\\1 除外）'),
    (r'On (.+?) end[,，] ?', '\\1 結束時，'), (r'When (.+?) ends[,，] ?', '\\1 結束時，'), (r'On (.+?) expiration[,，] ?', '\\1 結束時，'),
    (r'Expires when (.+?) ends\.', '\\1 結束時失效。'), (r'This effect expires upon using (.+?)\.', '使用 \\1 時此效果失效。'),
    (r'(.+?) is activated[,，] ?', '\\1 發動時，'), (r'\bis activated\b', '發動'),
    (r'\(Max (⟦\d+⟧) uses\)', '（最多 \\1 次）'), (r'\bup to (⟦\d+⟧)', '最多 \\1'),
    (r'On (.+?) use while in (.+?)[,，] ?', '處於 \\2 時使用 \\1，'),
    (r'(^|。)In (.+?)[,，] ?', '\\1處於 \\2 時，'),
    (r'during skill use', '施放技能期間'), (r'\bduring (.+?)[,，] ?', '\\1 期間，'),
    (r'Using (.+?) reduces remaining (.+?) cooldown by (⟦\d+⟧)', '使用 \\1 可減少 \\2 的剩餘冷卻時間 \\3'),
    (r'For every (⟦\d+⟧) (.+?) hit landed', '每命中 \\1 次 \\2'), (r'\bfor every\b', '每'), (r'\bnext\b', '接下來的'),
    (r'(\S+) Mode Skill', '\\1 模式技能'), (r'\bskills?\b', '技能'),
    (r'(⟦\d+⟧): ', '\\1：'),
    (r' for (⟦\d+⟧)s?\.', '，持續 \\1。'), (r' for (⟦\d+⟧)s?$', '，持續 \\1'),
    (r'Damage \+', '傷害 +'), (r'Damage -', '傷害 -'), (r'Damage (⟦)', '傷害 \\1'),
    (r'\bDamage\b', '傷害'), (r'\bSkills\b', '技能'), (r'\bSkill\b', '技能'), (r'\beffects?\b', '效果'),
    (r'\bactivates\b', '發動'), (r' and ', ' 與 '), (r'\bstacks?\b', '層'), (r'\bPower\b', '攻擊力'), (r'\bSpeed\b', '速度'),
    (r'\bMode\b', '模式'), (r'\bStance\b', '架勢'), (r'\bStatus\b', '狀態'),
    (r'\. ', '。'), (r'\.(?=\n|$)', '。'), (r', ', '，'), (r':\s', '：'),
]
COMPILED = [(re.compile(p), r) for p, r in RULES]


def flatten(node, out):
    if isinstance(node, str):
        out.append(node)
    elif isinstance(node, list):
        if len(node) == 3 and node[0] == 2 and isinstance(node[1], str) and isinstance(node[2], list):
            out.append(node)
        else:
            for x in node:
                flatten(x, out)


def translate_value(v, names):
    """coloured value: numbers/time kept, names translated when known"""
    if isinstance(v, str):
        m = re.fullmatch(r'(-?\d+(?:\.\d+)?)s', v)
        if m:
            return m.group(1) + '秒'
        if v in names:
            return names[v]
        return v
    return v


def main(data_dir):
    desc = json.load(open(os.path.join(data_dir, 'core_desc.json'), encoding='utf-8'))
    cores = json.load(open(os.path.join(data_dir, 'cores.json'), encoding='utf-8'))
    skills = json.load(open(os.path.join(data_dir, 'skills.json'), encoding='utf-8'))
    zh = json.load(open(os.path.join(data_dir, 'zh.json'), encoding='utf-8'))
    ap = json.load(open(os.path.join(data_dir, 'arkpassive.json'), encoding='utf-8'))
    skills_by_id = zh.get('skills_by_id', {})
    ap_by_id = zh.get('arkpassive_by_id', {})

    # effect id -> class number
    eid_class = {}
    for inst in cores['instances'].values():
        for eid in inst[5]:
            eid_class.setdefault(str(eid), inst[6])
    # per-class English skill name -> Chinese (by id)
    class_names = collections.defaultdict(dict)
    name_sk = zh.get('skills', {})
    for sid, (en, cnum, _icon) in skills.items():
        z = skills_by_id.get(sid) or (name_sk.get(str(cnum)) or {}).get(en) or (name_sk.get('_') or {}).get(en)
        if en and z and en.lower() != 'placeholder':
            class_names[cnum].setdefault(en, z)
    for nid, n in ap.items():
        z = ap_by_id.get(nid)
        if z and n[0]:
            class_names[n[6]].setdefault(n[0], z)
    # tripod names ("With <tripod>, ...") by skill id -> class
    tripods = json.load(open(os.path.join(data_dir, 'tripods.json'), encoding='utf-8'))
    trip_by_id = zh.get('tripods_by_id', {})
    trip_by_name = zh.get('tripods', {})
    for sid, slots in tripods.items():
        cnum = skills.get(sid, [None, 0])[1]
        for pos, slot in enumerate(slots):
            if not slot:
                continue
            z = (trip_by_id.get(sid) or {}).get(str(pos)) or (trip_by_name.get(str(cnum)) or {}).get(slot[0])
            if z and len(slot[0]) >= 4:
                class_names[cnum].setdefault(slot[0], z)
    generic = {}
    for sec in ('class_engravings', 'engravings', 'runes', 'stats'):
        generic.update(zh.get(sec, {}))

    out = {}
    stats = collections.Counter()
    leftovers = collections.Counter()
    for eid, entry in desc.items():
        toks = []
        flatten(entry, toks)
        cnum = eid_class.get(eid, 0)
        names = dict(generic)
        names.update(class_names.get(cnum, {}))
        names.update(IDENTITY)
        values = []
        text = ''
        for t in toks:
            if isinstance(t, str):
                text += t
            else:
                text += PH.format(len(values))
                values.append([2, t[1], [translate_value(v, names) for v in t[2]]])
        # 1) skill / node / tripod names (longest first), 2) identity terms, 3) templates
        if cnum in class_names:
            name_map = class_names[cnum]
        else:  # effect not tied to one class: use every class's names
            name_map = {}
            for m in class_names.values():
                for k, v in m.items():
                    name_map.setdefault(k, v)
        for en, z in sorted(name_map.items(), key=lambda kv: -len(kv[0])):
            if len(en) < 4:
                continue
            flags = re.IGNORECASE if len(en) >= 8 else 0
            text = re.sub(r'(?<![\w])' + re.escape(en) + r'(?![\w])', z, text, flags=flags)
        for en, z in sorted(IDENTITY.items(), key=lambda kv: -len(kv[0])):
            text = re.sub(r'\b' + re.escape(en) + r'\b', z, text)
        for rx, rep in COMPILED:
            text = rx.sub(rep, text)
        text = re.sub(r'\s+([，。：）])', r'\1', text).replace('（ ', '（')
        # rebuild segments
        segs = []
        pos = 0
        for m in PH_RE.finditer(text):
            if m.start() > pos:
                segs.append(text[pos:m.start()])
            segs.append(values[int(m.group(1))])
            pos = m.end()
        if pos < len(text):
            segs.append(text[pos:])
        out[eid] = [segs]
        residual = re.findall(r'[A-Za-z][A-Za-z\'.:/-]+', PH_RE.sub('', text))
        residual = [w for w in residual if w not in ('Boss', 'MP', 'HP')]
        stats['total'] += 1
        if not residual:
            stats['fully'] += 1
        for w in residual:
            leftovers[w] += 1
    json.dump(out, open(os.path.join(data_dir, 'core_desc_zh.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"translated {stats['total']} descriptions; fully Chinese (no English words left): {stats['fully']} ({stats['fully'] * 100 // max(1, stats['total'])}%)")
    print('most common English leftovers:')
    for w, c in leftovers.most_common(80):
        print(f'  {c:4d} {w}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/data')
