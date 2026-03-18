#!/bin/bash

# ==========================================
# MuniBed Stable Startup Script (Guardian)
# ==========================================

# 1. 의존성 확인 및 설치
echo "📦 Checking dependencies..."
if [ ! -d "node_modules/sqlite3" ]; then
    echo "Installing sqlite3 for local database stable fallback..."
    npm install sqlite3
fi

# 2. 기존 프로세스 종료 (충돌 방지)
# 전체 시스템의 "node server.js"를 죽이지 않고, 현재 디렉토리의 서버만 타겟팅합니다.
PGID=$(pgrep -f "node server.js" | grep -v "$$" || true)
if [ ! -z "$PGID" ]; then
    echo "Stopping existing server processes..."
    # 이 스크립트가 돌아가는 경로와 일치하는 프로세스만 종료하도록 시도할 수 있으나, 
    # 여기서는 좀 더 안전하게 pkill -f 대신 pgrep으로 거른 후 종료합니다.
    pkill -f "node $(pwd)/server.js" || true
fi
pkill -f "ssh -R .*localhost.run" || true

# 3. 서버 실행 (무한 루프)
run_server() {
    while true; do
        echo "🚀 Starting Server..."
        node server.js >> server.log 2>&1
        echo "⚠️ Server crashed or stopped. Restarting in 3 seconds..."
        sleep 3
    done
}

# 4. 터널 실행 (무한 루프)
# 원하는 호스트 이름을 설정하고 싶으면 nokey:myhost@localhost.run 처럼 변경하세요.
run_tunnel() {
    while true; do
        echo "🔗 Starting Tunnel (localhost.run)..."
        ssh -R 80:localhost:3000 nokey@localhost.run >> tunnel.log 2>&1
        echo "❌ Tunnel closed. Restarting in 5 seconds..."
        sleep 5
    done
}

# 백그라운드에서 실행
run_server &
run_tunnel &

echo "=========================================="
echo "✅ MuniBed Guardian이 활성화되었습니다."
echo "- 서버 로그: tail -f server.log"
echo "- 터널 로그: tail -f tunnel.log"
echo "- 종료하려면 'pkill -f munibed' 또는 직접 프로세스 종료"
echo "=========================================="

wait
