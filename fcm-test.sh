#!/bin/bash

# FCM 푸시 알림 테스트 스크립트
# 사용법: ./fcm-test.sh <api_url> <user_id>
# 예: ./fcm-test.sh http://localhost:3001 user_001

API_URL="${1:-http://localhost:3001}"
USER_ID="${2:-user_001}"
TIMESTAMP=$(date +%s)

echo "=========================================="
echo "🔔 FCM 푸시 알림 테스트"
echo "=========================================="
echo "API URL: $API_URL"
echo "User ID: $USER_ID"
echo "Timestamp: $TIMESTAMP"
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수: 요청 전송 및 응답 표시
send_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  local description=$4

  echo -e "${BLUE}➜${NC} $description"
  echo -e "${YELLOW}$method $API_URL$endpoint${NC}"
  
  if [ -z "$data" ]; then
    response=$(curl -s -X "$method" "$API_URL$endpoint")
  else
    response=$(curl -s -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  # JSON 포맷팅 (jq가 있으면 사용)
  if command -v jq &> /dev/null; then
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
  else
    echo "$response"
  fi
  
  echo ""
  return 0
}

# 테스트 1: 헬스 체크
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 1: 서버 헬스 체크${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
send_request "GET" "/api/health" "" "서버 상태 확인"

# 테스트 2: 토큰 조회 (등록 전)
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 2: 등록된 토큰 조회 (사전)${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
send_request "GET" "/api/fcm/tokens/$USER_ID" "" "사용자 토큰 조회"

# 테스트 3: 토큰 등록
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 3: 새 토큰 등록${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
TEST_TOKEN="test_token_${TIMESTAMP}_$(openssl rand -hex 8)"
token_data=$(cat <<EOF
{
  "userId": "$USER_ID",
  "token": "$TEST_TOKEN",
  "platform": "Web",
  "deviceName": "Test Browser - $(uname)"
}
EOF
)
send_request "POST" "/api/fcm/register-token" "$token_data" "FCM 토큰 등록"

# 테스트 4: 토큰 조회 (등록 후)
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 4: 등록된 토큰 조회 (사후)${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
send_request "GET" "/api/fcm/tokens/$USER_ID" "" "사용자 토큰 조회"

# 테스트 5: 푸시 알림 전송 (기본)
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 5: 기본 푸시 알림 전송${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
send_data=$(cat <<EOF
{
  "userId": "$USER_ID",
  "title": "테스트 알림",
  "body": "기본 푸시 알림 테스트입니다."
}
EOF
)
send_request "POST" "/api/fcm/send" "$send_data" "푸시 알림 전송"

# 테스트 6: 푸시 알림 전송 (데이터 포함)
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 6: 데이터 포함 푸시 알림 전송${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
send_with_data=$(cat <<EOF
{
  "userId": "$USER_ID",
  "title": "새 메시지",
  "body": "정동병원에서 새 메시지가 도착했습니다.",
  "data": {
    "chatId": "chat_001",
    "userId": "$USER_ID",
    "messageId": "msg_$(date +%s)",
    "sentAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "priority": "high"
  }
}
EOF
)
send_request "POST" "/api/fcm/send" "$send_with_data" "데이터 포함 푸시 전송"

# 테스트 7: 특정 토큰으로 직접 전송 (테스트용)
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 7: 특정 토큰으로 직접 전송${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
direct_send=$(cat <<EOF
{
  "token": "$TEST_TOKEN",
  "title": "직접 전송 테스트",
  "body": "토큰을 직접 지정하여 전송하는 테스트입니다."
}
EOF
)
send_request "POST" "/api/fcm/send-to-token" "$direct_send" "토큰 직접 전송"

# 테스트 8: 응급 알림 (높은 우선순위)
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 8: 응급 알림 (높은 우선순위)${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
urgent_alert=$(cat <<EOF
{
  "userId": "$USER_ID",
  "title": "🚨 응급 알림",
  "body": "높은 우선순위 알림입니다. 즉시 확인하세요.",
  "data": {
    "priority": "urgent",
    "action": "view_immediately",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
)
send_request "POST" "/api/fcm/send" "$urgent_alert" "응급 알림 전송"

# 테스트 9: 토큰 제거
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 9: 토큰 제거${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
remove_data=$(cat <<EOF
{
  "userId": "$USER_ID",
  "token": "$TEST_TOKEN"
}
EOF
)
send_request "DELETE" "/api/fcm/token" "$remove_data" "토큰 제거"

# 테스트 10: 최종 토큰 확인
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}테스트 10: 최종 토큰 확인${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
send_request "GET" "/api/fcm/tokens/$USER_ID" "" "최종 토큰 조회"

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 모든 테스트 완료${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""
echo "📝 테스트 결과:"
echo "  - 기본 API 호출: $API_URL"
echo "  - 테스트 사용자: $USER_ID"
echo "  - 테스트 토큰: $TEST_TOKEN"
echo ""
echo "🔍 확인 사항:"
echo "  1. 모든 요청이 HTTP 200 응답을 반환했는지 확인"
echo "  2. 응답의 'success': true 여부 확인"
echo "  3. 토큰 등록/제거 전후 count 변화 확인"
echo "  4. 실제 클라이언트에서 알림이 수신되는지 확인"
echo ""
