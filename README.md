# 失落的方舟 中文統計站（lostark.bible 中文版）

[lostark.bible](https://lostark.bible) 的繁體中文介面。統計數字仍由 lostark.bible 即時提供（透過本機代理轉送），
遊戲名詞改用台灣《失落的方舟》／中國《命運方舟》的官方資料與中文社群慣用譯名，介面為繁體中文。

已中文化的頁面：

| 路徑 | 內容 |
| --- | --- |
| `/` | 首頁（角色搜尋會開啟英文原站的角色頁、熱門角色／紀錄、快速連結） |
| `/stats/generic` | 綜合統計（角色／帳號／公會數、各職業角色數、職業刻印分布、裝等分布、輔助比例、地區／伺服器） |
| `/stats/raids` | 團本表現（各職業 DPS 箱型圖、輔助貢獻／增益覆蓋率、詳細資料與範例場次、DPS／戰鬥力、通關率） |
| `/stats/class` | 職業配置（技能、技能等級、三重核心、符文、方舟星圖核心組合與熱門度、刻印） |
| `/stats/ark-passive` | 方舟被動（常見配置、節點熱門度，進化／領悟／跳躍三棵樹） |
| `/stats/combat-power` | 戰鬥力（各裝等箱型圖、各職業分布曲線） |
| `/leaderboards` | 團本排行榜（最速通關、隊伍成員與 DPS 占比） |
| `/style-book`、`/style-book/:region/:id` | 造型書（清單、篩選、分頁；單一造型的截圖與染色資訊） |

角色頁、戰鬥紀錄（logs）、帳號／上傳等需要 Discord 登入的功能仍由英文原站提供，站內的連結會開新分頁導到原站。

## 執行（Docker，建議 NAS 使用）

```bash
docker compose up -d --build
# 開啟 http://<NAS IP>:3000/
```

`docker-compose.yml` 可改埠號（`ports`）與上游網址（`UPSTREAM`）。映像只包含 `server.js` 與 `public/`，
不需要 npm 套件；容器內建健康檢查（`/api/health`）。更新程式後重新執行 `docker compose up -d --build` 即可。

## 執行（直接用 Node）

需要 Node.js 18 以上（內建 `fetch`）。頁面樣式用 Tailwind CDN、圖表用 ECharts CDN，所以需要網路連線（取得統計資料本來就需要）。

```bash
node server.js
# 開啟 http://localhost:3000/
```

環境變數：

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PORT` | `3000` | 本機埠號 |
| `UPSTREAM` | `https://lostark.bible` | 上游網站 |
| `REMOTE_ID` | `1b5dc20` | 職業配置頁 remote function 的版本雜湊。伺服器啟動時會自動從原站前端程式碼偵測各頁面最新的雜湊，偵測失敗才用預設值 |

與原站相同的網址參數可直接沿用，例如：
`/stats/class?classId=elemental_master&classEngraving=Second&minIlvl=1700&maxIlvl=1810`

## 架構

```
server.js                 無相依套件的 Node 伺服器：靜態檔 + /api 代理（remote functions、__data.json、圖片）
public/index.html         頁面外殼（Tailwind CDN）
public/js/app.js          路由與頁首／統計分頁列
public/js/common.js       共用工具：DOM、i18n、資料載入、API、ECharts、常用元件
public/js/pages/*.js      各頁面模組（home / generic / raids / class / arkpassive / combatpower / leaderboards / stylebook）
public/js/devalue.js      SvelteKit remote function 使用的 devalue 序列化格式
public/data/*.json        由原站前端資料模組轉出的靜態資料（技能、三重核心、核心、刻印、符文、方舟被動、團本定義、職業圖示…）
public/data/zh.json       中文名詞對照表
tools/extract_data.py     從原站 JS 資料模組（vendor/chunks）重新產生 public/data/*.json
tools/fetch_cn_terms.py   從中國伺服器資料庫（方舟小冊子 lostark.dvg.cn）依遊戲內 ID 抓取中文名稱
tools/build_zh.py         合併名詞資料（vendor/terms）成 zh.json，可簡轉繁（OpenCC）
tools/zh_overrides.json   手動修正的名詞（優先權最高）
tools/fetch_tw_codex.py   從失落方舟法典台服資料庫（lostarkcodex.com/tw）依 ID 抓台服技能／三重核心名稱 → vendor/terms/tw_ids.json
tools/translate_core_desc.py  以句型對照＋ID 名稱代入產生方舟星圖核心效果說明的中文版 → public/data/core_desc_zh.json
public/js/vendor/echarts.min.js  ECharts 5.5.1（本機提供，不依賴 CDN）
vendor/chunks/            原站資料模組快照（2025-11-08）
vendor/terms/             名詞研究結果快照（ID 對照 + 各來源查到的名詞）
```

### 代理 API

| 路徑 | 說明 |
| --- | --- |
| `/api/remote/<fn>?payload=…&pathname=…` | 轉送到 `UPSTREAM/_app/remote/<hash>/<fn>`；只允許白名單內的函式（statsSkills、statsEngraving、statsArkGridCore、statsArkGridCombinations、arkPassiveStats、arkPassiveTopLoadouts、raidStatsSearch、raidSamplesSearch、raidClearRatesSearch、combatPowerDPSSearch、leaderboardsSearch、styleBookData） |
| `/api/data/<page>` | 轉送頁面的 `__data.json`（server load 資料：綜合統計、戰鬥力、造型書詳細頁、首頁） |
| `/api/combinations` | 從原站 `/stats/class` 的 SSR 頁面抽出 `arkGridLoadoutCombinations` |
| `/api/image/<path>` | 轉送原站圖片（`/i/…`、造型書截圖） |
| `/api/health` | 健康檢查 |

回應會在記憶體中快取 10 分鐘。

## 名詞對照（zh.json）

查詢順序：**遊戲內 ID**（`skills_by_id`、`tripods_by_id`、`cores_by_id`、`arkpassive_by_id`、`runes_by_id`）→ 職業專屬英文名 → 通用英文名 → 英文原文。

名詞來源優先序：台灣官方（繁體）＞ 中國官方／官方資料庫（簡體，轉繁體）＞ 中文社群慣用譯名。
目前的狀況：

- 職業、系統名詞（方舟星圖、進化／領悟／跳躍、三重核心、刻印…）、屬性名稱、大部分刻印與符文：台灣官方。
- 技能、三重核心、方舟星圖核心、方舟被動節點：以中國伺服器資料庫依 ID 對照（完整覆蓋），部分職業另有台灣官方名稱覆蓋。
- 團本、Boss、難度：台灣／中國官方公告；中國尚未推出的內容（例如 Horizon Cathedral）保留英文。
- 找不到對應的名詞一律顯示英文原文，不自行翻譯。

修正或補充名詞：編輯 `tools/zh_overrides.json` 後重新產生：

```bash
pip install opencc-python-reimplemented
python -I tools/build_zh.py vendor/terms public/data public/data/zh.json --trad
```

原站改版（新技能、新職業、新核心）時：

```bash
# 1. 重新下載 _app/immutable/chunks 的資料模組到 vendor/chunks（檔名見 tools/extract_data.py 的 CHUNKS）
python -I tools/extract_data.py vendor/chunks public/data
# 2. 依 ID 重新抓中國伺服器名稱，再重建 zh.json
python -I tools/fetch_cn_terms.py vendor/cn_raw vendor/terms/cn_ids.json
python -I tools/fetch_tw_codex.py vendor/tw_codex public/data vendor/terms/tw_ids.json
python -I tools/build_zh.py vendor/terms public/data public/data/zh.json --trad
# 3. 核心效果說明中文版
python -I tools/translate_core_desc.py public/data
```

## 注意

- 本專案非官方，統計資料版權屬 lostark.bible，遊戲內容屬 Smilegate RPG。
- 原站若改版（資料模組雜湊或 remote function 雜湊改變），伺服器會嘗試自動偵測雜湊；資料模組則需重新執行 `tools/extract_data.py`。
