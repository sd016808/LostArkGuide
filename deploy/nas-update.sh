#!/bin/bash
# =============================================================================
# LostArkGuide 自動更新腳本（給 NAS「任務排程器」使用）
#
# 做的事：
#   1. 查 GitHub 上最新的版本；已經是最新版就只確認容器有在跑，然後結束
#   2. 下載最新版，只更新部署需要的檔案（server.js、public/、Dockerfile、docker-compose.yml…）
#   3. 依變更內容決定：
#        Dockerfile / package.json 有變  -> docker compose up -d --build（重建映像）
#        docker-compose.yml 有變         -> docker compose up -d（重建容器；舊檔備份成 .bak）
#        其他（server.js、網頁、翻譯）   -> docker compose restart
#   4. 等健康檢查（/api/health）通過才記錄為已部署；結果寫在同資料夾的 update.log
#
# 用法（Synology：控制台 → 任務排程器 → 新增 → 排程的任務 → 使用者定義的指令碼，使用者選 root）：
#   bash /volume1/docker/LostArkGuide/update.sh
# 可用環境變數（寫在指令前面，例如 FORCE=1 bash .../update.sh）：
#   FORCE=1        不管版本是否相同都重新部署並重啟
#   DRY_RUN=1      只檢查與下載、比對，不改檔案也不動 docker
#   APP_DIR=...    專案資料夾（預設：這個腳本所在的資料夾）
#   PROJECT=...    compose 專案名稱（預設：自動從現有容器讀取）
#   HEALTH_URL=... 健康檢查網址（預設 http://127.0.0.1:7799/api/health）
# =============================================================================
set -u

REPO="${REPO:-sd016808/LostArkGuide}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"
CONTAINER="${CONTAINER:-lostark-zh}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7799/api/health}"
FORCE="${FORCE:-0}"
DRY_RUN="${DRY_RUN:-0}"
# 任務排程器的 PATH 很精簡，補上 Synology / QNAP 常見的 docker 位置
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:/share/CACHEDEV1_DATA/.qpkg/container-station/bin:${PATH:-}"

LOG="$APP_DIR/update.log"
LOCK="$APP_DIR/.update.lock"
SHA_FILE="$APP_DIR/.deployed_sha"
TMP=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
fail() { log "失敗：$*"; exit 1; }
cleanup() {
  [ -n "$TMP" ] && rm -rf "$TMP"
  rm -rf "$LOCK"
  # 日誌只保留最後 1000 行
  if [ -f "$LOG" ]; then tail -n 1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv -f "$LOG.tmp" "$LOG"; fi
}

# ---- 防止同時執行兩份（超過 30 分鐘的鎖視為殘留）----
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    rm -rf "$LOCK"; mkdir "$LOCK" || exit 1
  else
    echo "另一個更新正在執行，略過。"; exit 0
  fi
fi
trap cleanup EXIT
log "開始檢查更新（$APP_DIR）"

[ -f "$APP_DIR/docker-compose.yml" ] || fail "在 $APP_DIR 找不到 docker-compose.yml（請確認 APP_DIR）"
command -v curl >/dev/null 2>&1 || fail "找不到 curl"
command -v tar >/dev/null 2>&1 || fail "找不到 tar"

# ---- docker compose 指令 ----
if [ "$DRY_RUN" != 1 ]; then
  command -v docker >/dev/null 2>&1 || fail "找不到 docker（任務請用 root 執行）"
  if docker compose version >/dev/null 2>&1; then DC=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then DC=(docker-compose)
  else fail "找不到 docker compose / docker-compose"; fi
  # 沿用現有容器的專案名稱，避免另外建立一份造成容器名稱衝突
  if [ -z "${PROJECT:-}" ]; then
    PROJECT="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER" 2>/dev/null || true)"
    [ "$PROJECT" = "<no value>" ] && PROJECT=""
  fi
  [ -n "${PROJECT:-}" ] && DC+=(-p "$PROJECT")
fi
compose() { (cd "$APP_DIR" && "${DC[@]}" "$@") >> "$LOG" 2>&1; }
container_running() { [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]; }
wait_healthy() {
  local i
  for i in $(seq 1 30); do
    curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

# ---- 1. 查最新版本 ----
LATEST="$(curl -fsSL --max-time 30 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null \
  | grep -m1 -o '"sha": *"[0-9a-f]\{40\}"' | grep -o '[0-9a-f]\{40\}' || true)"
CURRENT="$(cat "$SHA_FILE" 2>/dev/null || true)"
if [ -n "$LATEST" ] && [ "$LATEST" = "$CURRENT" ] && [ "$FORCE" != 1 ]; then
  if [ "$DRY_RUN" != 1 ] && ! container_running; then
    log "已是最新版 ${LATEST:0:7}，但容器沒在執行，啟動中…"
    compose up -d || fail "docker compose up -d 失敗（詳見 update.log）"
    wait_healthy && log "容器已啟動，健康檢查通過" || fail "容器啟動後健康檢查未通過"
  else
    log "已是最新版 ${LATEST:0:7}，容器執行中，不需更新。"
  fi
  exit 0
fi
[ -z "$LATEST" ] && log "無法取得最新版本編號（GitHub API 可能暫時限流），改用 $BRANCH 分支直接比對檔案"
REF="${LATEST:-$BRANCH}"

# ---- 2. 下載並解壓 ----
TMP="$(mktemp -d 2>/dev/null || echo "/tmp/lostark-update-$$")"; mkdir -p "$TMP"
curl -fsSL --max-time 300 -o "$TMP/src.tgz" "https://codeload.github.com/$REPO/tar.gz/$REF" || fail "下載原始碼失敗"
tar -xzf "$TMP/src.tgz" -C "$TMP" || fail "解壓縮失敗"
SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -f "$SRC/server.js" ] && [ -d "$SRC/public" ] && [ -f "$SRC/docker-compose.yml" ] || fail "下載內容不完整"

# ---- 3. 比對變更 ----
NEED_BUILD=0; NEED_RECREATE=0; CHANGED=""
for f in Dockerfile package.json .dockerignore; do
  if [ -f "$SRC/$f" ] && ! cmp -s "$SRC/$f" "$APP_DIR/$f"; then NEED_BUILD=1; CHANGED="$CHANGED $f"; fi
done
if ! cmp -s "$SRC/docker-compose.yml" "$APP_DIR/docker-compose.yml"; then NEED_RECREATE=1; CHANGED="$CHANGED docker-compose.yml"; fi
cmp -s "$SRC/server.js" "$APP_DIR/server.js" || CHANGED="$CHANGED server.js"
HAVE_RSYNC=0; command -v rsync >/dev/null 2>&1 && HAVE_RSYNC=1
if [ "$HAVE_RSYNC" = 1 ]; then
  N_PUBLIC="$(rsync -rcn --delete --out-format='%n' "$SRC/public/" "$APP_DIR/public/" 2>/dev/null | grep -vc '/$' || true)"
  [ "${N_PUBLIC:-0}" != 0 ] && CHANGED="$CHANGED public/(${N_PUBLIC} 個檔案)"
else
  CHANGED="$CHANGED public/"
fi
log "版本 ${CURRENT:0:7} -> ${REF:0:7}，變更：${CHANGED:- 無}"

if [ "$DRY_RUN" = 1 ]; then
  log "DRY_RUN：重建映像=$NEED_BUILD 重建容器=$NEED_RECREATE，不修改任何檔案"
  exit 0
fi

# ---- 4. 更新檔案（就地覆寫，保留 volume 掛載的同一個檔案／資料夾）----
for f in Dockerfile package.json .dockerignore README.md; do
  [ -f "$SRC/$f" ] && cp -f "$SRC/$f" "$APP_DIR/$f"
done
if [ "$NEED_RECREATE" = 1 ]; then
  cp -f "$APP_DIR/docker-compose.yml" "$APP_DIR/docker-compose.yml.bak"
  cp -f "$SRC/docker-compose.yml" "$APP_DIR/docker-compose.yml"
  log "docker-compose.yml 已更新（原本的備份為 docker-compose.yml.bak）"
fi
cp -f "$SRC/server.js" "$APP_DIR/server.js"
mkdir -p "$APP_DIR/public"
if [ "$HAVE_RSYNC" = 1 ]; then
  rsync -a --delete "$SRC/public/" "$APP_DIR/public/" || fail "更新 public/ 失敗"
else
  cp -a "$SRC/public/." "$APP_DIR/public/" || fail "更新 public/ 失敗"
fi

# ---- 5. 重建／重啟 ----
if [ "$NEED_BUILD" = 1 ]; then
  log "執行 docker compose up -d --build"
  compose up -d --build || fail "docker compose up -d --build 失敗（詳見 update.log）"
elif [ "$NEED_RECREATE" = 1 ] || ! container_running; then
  log "執行 docker compose up -d"
  compose up -d || fail "docker compose up -d 失敗（詳見 update.log）"
else
  log "執行 docker compose restart"
  compose restart || fail "docker compose restart 失敗（詳見 update.log）"
fi

wait_healthy || fail "重啟後健康檢查未通過：$HEALTH_URL"
[ -n "$LATEST" ] && echo "$LATEST" > "$SHA_FILE"
log "更新完成，目前版本 ${REF:0:7}，健康檢查通過"
# 腳本自我更新：用 mv 換檔，正在執行的這份不受影響
if [ -f "$SRC/deploy/nas-update.sh" ] && ! cmp -s "$SRC/deploy/nas-update.sh" "$0"; then
  cp -f "$SRC/deploy/nas-update.sh" "$0.new" && chmod +x "$0.new" && mv -f "$0.new" "$0" && log "update.sh 本身也已更新為最新版"
fi
exit 0
