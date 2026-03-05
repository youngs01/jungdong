#!/bin/bash
# 25205 직원의 연차 잔액 초기화 스크립트

echo "🔄 25205 직원 연차 잔액 초기화 중..."

# 서버 URL
SERVER_URL="https://192.168.0.230:3000"

# DELETE 요청 (SSL 인증서 무시)
curl -k -X DELETE "$SERVER_URL/api/leave-balance/25205" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "✅ 초기화 완료!"
echo "다음 조회 시 새로운 기준(정확한 개월 계산)으로 재계산됩니다."
echo ""
echo "확인 방법:"
echo "  1. 앱을 새로고침"
echo "  2. 25205 직원의 연차를 다시 조회"
echo "  3. 법정 연차가 3개로 표시되어야 합니다"
