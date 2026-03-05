#!/bin/bash

# ============================================
# FCM 푸시 알림 테스트 스크립트
# Hospital Messenger APK 푸시 알림 테스트용
# ============================================

SERVER_URL="http://localhost:3000"  # 서버 URL (실제 환경에 맞게 변경)
USER_ID="jungdong"  # 테스트할 사용자 ID

echo "🔔 FCM 푸시 알림 테스트 시작..."
echo "서버: $SERVER_URL"
echo "사용자: $USER_ID"
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 서버 상태 확인
print_status "서버 상태 확인 중..."
if curl -s "$SERVER_URL/api/health" > /dev/null; then
    print_success "서버가 정상 작동 중"
else
    print_error "서버에 연결할 수 없습니다. 서버를 먼저 시작하세요."
    exit 1
fi

# FCM 토큰 확인
print_status "사용자의 FCM 토큰 확인 중..."
TOKEN_RESPONSE=$(curl -s -X GET "$SERVER_URL/api/fcm/tokens/$USER_ID")
if echo "$TOKEN_RESPONSE" | grep -q '"success":true'; then
    TOKEN_COUNT=$(echo "$TOKEN_RESPONSE" | grep -o '"count":[0-9]*' | cut -d':' -f2)
    print_success "FCM 토큰 $TOKEN_COUNT개 발견됨"
else
    print_error "FCM 토큰을 찾을 수 없습니다. 먼저 앱에서 로그인하세요."
    exit 1
fi

# 테스트 알림 전송
print_status "테스트 푸시 알림 전송 중..."
TEST_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/fcm/test-push" \
    -H "Content-Type: application/json" \
    -d "{
        \"userId\": \"$USER_ID\",
        \"title\": \"🔔 FCM 테스트 알림\",
        \"body\": \"$(date '+%Y-%m-%d %H:%M:%S') - 푸시 알림이 정상 작동합니다!\",
        \"data\": {
            \"type\": \"test\",
            \"timestamp\": \"$(date -Iseconds)\"
        }
    }")

if echo "$TEST_RESPONSE" | grep -q '"success":true'; then
    print_success "테스트 알림 전송 성공!"
    echo "$TEST_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TEST_RESPONSE"
else
    print_error "테스트 알림 전송 실패"
    echo "응답: $TEST_RESPONSE"
fi

echo ""
print_status "WebSocket 연결 테스트..."
WS_RESPONSE=$(curl -s "$SERVER_URL/api/push/test")
if echo "$WS_RESPONSE" | grep -q '"success":true'; then
    print_success "WebSocket 서비스 정상"
else
    print_warning "WebSocket 서비스 확인 필요"
fi

echo ""
print_status "푸시 시스템 통계..."
STATS_RESPONSE=$(curl -s "$SERVER_URL/api/push/stats")
echo "$STATS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATS_RESPONSE"

echo ""
print_success "🎉 FCM 푸시 알림 테스트 완료!"
echo ""
echo "📱 안드로이드 앱에서 알림이 왔는지 확인하세요."
echo "   - 포그라운드: 앱이 열려있을 때"
echo "   - 백그라운드: 앱이 닫혀있을 때"
echo ""
echo "🔧 추가 테스트:"
echo "   - 메시지 전송 테스트: curl -X PUT $SERVER_URL/api/messages/test-chat-id -H 'Content-Type: application/json' -d '{\"messages\": [{\"id\": \"test\", \"senderId\": \"other-user\", \"content\": \"테스트 메시지\", \"timestamp\": \"$(date -Iseconds)\"}]}'"
echo "   - 공지사항 테스트: curl -X PUT $SERVER_URL/api/notices -H 'Content-Type: application/json' -d '{\"id\": \"test-notice\", \"title\": \"테스트 공지\", \"content\": \"테스트 내용\", \"authorId\": \"admin\"}'"