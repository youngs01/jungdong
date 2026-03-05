# 🔔 FCM 푸시 알림 완전 구현 - 송수신 통합 가이드

## 📋 구현 요약

| 구성요소 | 상태 | 설명 |
|---------|------|------|
| **서버 API** | ✅ 완료 | FCM 토큰 등록/조회/전송 API 구현 |
| **클라이언트 Firebase** | ✅ 완료 | Firebase SDK 초기화 및 FCM 토큰 획득 |
| **Service Worker** | ✅ 완료 | 백그라운드 메시지 수신 및 알림 표시 |
| **포그라운드 핸들러** | ✅ 완료 | 앱 활성 시 메시지 실시간 처리 |
| **에러 처리** | ✅ 완료 | 토큰 만료/무효화 자동 처리 |

---

## 🚀 완전한 송수신 흐름

### 1️⃣ 송신 (Server → Client)

```
User logs in
    ↓
Firebase SDK initializes (public/index.html)
    ↓
Notification permission request
    ↓
Service Worker registration
    ↓
FCM token generated
    ↓
Token sent to server (POST /api/fcm/register-token)
    ↓
Token stored in database
```

### 2️⃣ 수신 처리

#### 백그라운드 (App Closed)
```
Server sends push (POST /api/fcm/send)
    ↓
Firebase Cloud Messaging service receives
    ↓
firebase-messaging-sw.js processes (Service Worker)
    ↓
onBackgroundMessage() handler triggered
    ↓
showNotification() displays OS notification
    ↓
User clicks notification
    ↓
notificationclick event
    ↓
App opens with notification data
```

#### 포그라운드 (App Active)
```
Server sends push (POST /api/fcm/send)
    ↓
Firebase Cloud Messaging service receives
    ↓
App is open/running
    ↓
onMessage() handler triggered (public/index.html)
    ↓
fcmMessageHandler() called (App.tsx)
    ↓
In-app toast/notification displayed
    ↓
User sees notification without leaving app
```

---

## 🔧 API 엔드포인트

### 1. FCM 토큰 등록
```http
POST /api/fcm/register-token
Content-Type: application/json

{
  "userId": "user_001",
  "token": "c_L8sJh3sQ2z...",
  "platform": "Web",
  "deviceName": "Chrome Windows"
}
```

**응답:**
```json
{
  "success": true,
  "message": "FCM 토큰이 등록되었습니다.",
  "userId": "user_001",
  "tokenLength": 152
}
```

### 2. 사용자의 모든 토큰 조회
```http
GET /api/fcm/tokens/user_001
```

**응답:**
```json
{
  "success": true,
  "userId": "user_001",
  "tokens": ["token1", "token2"],
  "count": 2
}
```

### 3. 푸시 알림 전송
```http
POST /api/fcm/send
Content-Type: application/json

{
  "userId": "user_001",
  "title": "새 메시지",
  "body": "긴급 알림입니다.",
  "data": {
    "chatId": "chat_001",
    "messageId": "msg_456"
  }
}
```

**응답:**
```json
{
  "success": true,
  "successCount": 1,
  "failureCount": 0
}
```

### 4. 특정 토큰으로 직접 전송 (테스트용)
```http
POST /api/fcm/send-to-token
Content-Type: application/json

{
  "token": "c_L8sJh3sQ2z...",
  "title": "테스트",
  "body": "이것은 테스트입니다."
}
```

### 5. 토큰 제거
```http
DELETE /api/fcm/token
Content-Type: application/json

{
  "userId": "user_001",
  "token": "c_L8sJh3sQ2z..."
}
```

---

## 📊 메시지 페이로드 구조

### 올바른 형식 ✅
```json
{
  "notification": {
    "title": "새 메시지",
    "body": "정동병원 긴급 알림"
  },
  "data": {
    "chatId": "chat_001",
    "userId": "user_123",
    "messageId": "msg_456",
    "sentAt": "2026-01-29T10:30:00Z"
  },
  "android": {
    "priority": "high",
    "notification": {
      "channelId": "messenger_channel"
    }
  },
  "apns": {
    "headers": {
      "apns-priority": "10"
    },
    "payload": {
      "aps": {
        "alert": {
          "title": "새 메시지",
          "body": "정동병원 긴급 알림"
        },
        "sound": "default"
      }
    }
  },
  "tokens": ["token1", "token2"]
}
```

### 잘못된 형식 ❌
```json
{
  "registration_ids": ["token1", "token2"],
  "data": {
    "my_custom_key": "my_custom_value"
  }
}
```
**이유:** Firebase Admin SDK는 `tokens` 배열을 사용하며, `registration_ids`는 GCM 레거시 형식입니다.

---

## 🧪 테스트 시나리오

### 시나리오 1: 웹 브라우저 포그라운드 테스트
```bash
# 1. 로컬 서버 시작
npm run dev

# 2. 로그인 (user_001)

# 3. 브라우저 콘솔에서 확인
# - Firebase 초기화 성공
# - Service Worker 등록 완료
# - FCM 토큰 획득 성공

# 4. 다른 터미널에서 푸시 전송
curl -X POST http://localhost:3001/api/fcm/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_001",
    "title": "테스트 알림",
    "body": "포그라운드 테스트 메시지"
  }'

# 5. 앱 내 토스트 알림이 표시됨
```

### 시나리오 2: 웹 브라우저 백그라운드 테스트
```bash
# 1. 위의 시나리오 1 완료 후

# 2. 브라우저 창 최소화 또는 다른 탭으로 이동

# 3. 푸시 전송
curl -X POST http://localhost:3001/api/fcm/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_001",
    "title": "백그라운드 테스트",
    "body": "백그라운드 테스트 메시지"
  }'

# 4. OS 알림이 화면에 표시됨 (우측 하단 등)

# 5. 알림을 클릭하면 앱 탭이 활성화됨
```

### 시나리오 3: 동시 다중 사용자 전송
```bash
# 사용자 1, 2, 3에게 동시에 전송
curl -X POST http://localhost:3001/api/fcm/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_001",
    "title": "공지사항",
    "body": "모든 사용자에게 전달됩니다."
  }'

curl -X POST http://localhost:3001/api/fcm/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_002",
    "title": "공지사항",
    "body": "모든 사용자에게 전달됩니다."
  }'
```

---

## 🐛 문제 해결

### 문제: FCM 토큰이 생성되지 않음
**원인:** Notification 권한 거부 또는 Service Worker 미등록

**해결:**
```javascript
// 콘솔에서 확인
console.log(Notification.permission); // 'granted' 필수
console.log(navigator.serviceWorker.controller); // null이면 미등록
```

### 문제: 백그라운드에서 알림이 표시되지 않음
**원인:** Service Worker 오류 또는 메시지 페이로드 형식 오류

**해결:**
```javascript
// firebase-messaging-sw.js 콘솔 확인
// [firebase-messaging-sw.js] Service Worker로드 완료 필수
// [firebase-messaging-sw.js] 백그라운드 메시지 수신 로그 확인
```

### 문제: 포그라운드에서 알림이 표시되지 않음
**원인:** fcmMessageHandler가 설정되지 않음

**해결:**
```javascript
// App.tsx 콘솔 확인
console.log(typeof window.fcmMessageHandler); // 'function' 필수
```

### 문제: 토큰이 자주 변경됨
**원인:** 정상 동작 (새 Service Worker 배포 시 등)

**해결:** 
- DB에 최근 사용된 토큰 30개 유지
- 만료된 토큰 자동 정리 (30일 미사용)

---

## 📱 다양한 환경 지원

### 웹 브라우저
- ✅ Chrome/Edge (Windows/Mac)
- ✅ Firefox
- ✅ Safari (macOS 13+)
- ❌ IE 11 (Firebase 미지원)

### 모바일
- ✅ Android Chrome
- ✅ iOS Safari
- ✅ Capacitor/React Native

### 데스크톱
- ✅ Electron
- ✅ PWA (설치 후)

---

## 🔐 보안 고려사항

1. **VAPID 키 노출 방지**
   - 공개키만 클라이언트에 노출
   - 개인키는 절대 공개하지 않음

2. **토큰 유효성 검증**
   - 토큰 등록 시 사용자 인증 확인
   - 토큰 소유권 검증

3. **레이트 제한**
   - 사용자당 전송 제한 설정
   - DDoS 방지

4. **데이터 암호화**
   - HTTPS 필수
   - 민감한 정보는 data 필드 제한

---

## 📞 모니터링 체크리스트

### 일일 확인 항목
- [ ] 총 등록된 토큰 수
- [ ] 실패한 메시지 수
- [ ] 만료된 토큰 정리 실행
- [ ] Service Worker 에러 로그 확인

### 주간 확인 항목
- [ ] 불필요한 토큰 제거
- [ ] 메시지 전송 성공률 통계
- [ ] 사용자 피드백 검토

---

## 🎯 다음 단계

1. **채팅 메시지 자동 푸시**
   ```javascript
   // 메시지 저장 후 자동으로 푸시 전송
   await dbService.saveMessage(message);
   await fcmService.send(recipientUserId, {
     title: senderName,
     body: message.content,
     data: { chatId: message.chatId }
   });
   ```

2. **특정 이벤트 푸시**
   - 휴가 신청 승인
   - 공지사항 작성
   - @mention 알림

3. **푸시 분석**
   - 전송/수신 통계
   - 클릭률
   - 사용자별 선호도

---

**생성일:** 2026-01-29  
**최종 업데이트:** 2026-01-29
