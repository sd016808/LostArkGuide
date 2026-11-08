#!/bin/bash
# LostArkGuide 重新部署：用 NAS 資料夾裡現有的檔案重建映像並重啟容器
# 任務排程器（使用者 root）：bash /volume1/docker/LostArkGuide/update.sh
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")" || exit 1

# docker compose（新版）或 docker-compose（舊版）
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

# 沿用現有容器的專案名稱，避免另外建立一份造成名稱衝突
P=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' lostark-zh 2>/dev/null)
if [ -n "$P" ] && [ "$P" != "<no value>" ]; then DC="$DC -p $P"; fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 開始重新部署" | tee -a update.log
$DC up -d --build --force-recreate 2>&1 | tee -a update.log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 完成，結束代碼 ${PIPESTATUS[0]}" | tee -a update.log
