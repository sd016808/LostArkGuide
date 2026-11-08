#!/bin/sh
# 重建 LostArkGuide：先用新程式碼建映像檔（這段舊容器照跑），建好才換容器。紀錄寫到 lostark-build.txt
OUT=/volume1/docker/lostark-build.txt
cd /volume1/docker/LostArkGuide || exit 1
DOCKER=/usr/local/bin/docker
DC="$DOCKER compose"; $DC version >/dev/null 2>&1 || DC=/usr/local/bin/docker-compose
P=$($DOCKER inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' lostark-zh 2>/dev/null); [ -z "$P" ] && P=lostarkguide
{
echo "== $(date) 開始，專案 $P =="; id
$DC -p "$P" build --no-cache
echo "== build 結束碼 $? =="
$DC -p "$P" up -d --force-recreate
echo "== up 結束碼 $? =="
sleep 8
$DOCKER ps --filter name=lostark-zh --format '{{.Names}}  {{.Status}}  {{.Image}}'
$DOCKER logs --tail 15 lostark-zh
echo "== done =="
} > "$OUT" 2>&1
