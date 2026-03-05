# 🎉 메시지/공지사항/근태관리 푸시 알림 및 배지 완전 구현 완료

**구현 날짜:** 2026-01-29  
**상태:** ✅ 송수신 통합 완료 + 배지 카운트 추가

---

## 📋 구현된 기능

### ✅ 자동 푸시 알림 전송

| 이벤트 | 발동 | 수신자 | 알림 내용 |
|-------|------|--------|---------|
| **메시지 수신** | 새 메시지 저장 | 채팅방 멤버 (발신자 제외) | `💬 {발신자}님으로부터 메시지` |
| **공지사항 작성** | 새 공지사항 생성 | 모든 사용자 (작성자 제외) | `📢 [중요] {제목}` (중요도 표시) |
| **토요일 근무 신청** | 신청 저장 | 팀장/부장/이사 | `📅 토요일 근무 신청 - {신청자} 승인 대기` |
| **연장근무 신청** | 신청 저장 | 팀장/부장/이사 | `⏰ 연장근무 신청 - {신청자} 승인 대기` |

### ✅ Sidebar 배지 표시

| 항목 | 배지 유형 | 표시 조건 |
|------|---------|---------|
| **메시지** | 🔴 숫자 | 읽지 않은 메시지 수 |
| **공지사항** | 🟠 N | 새 공지사항 있음 |
| **근태관리** | 🔴 숫자 | 승인 대기 중인 요청 수 |

### ✅ 포그라운드/백그라운드 처리

#### 포그라운드 (앱이 열려있을 때)
- 📬 FCM 메시지 수신
- 토스트 알림 표시
- 타입별 자동 탭 이동
- 배지 업데이트

#### 백그라운드 (앱이 닫혀있을 때)
- 📩 Service Worker에서 수신
- OS 알림 표시
- 알림 클릭 시 앱 열기
- 타입별 페이지로 이동

---

## 🏗️ 구현 구조

### 서버 측 (Node.js)

#### 메시지 푸시
```javascript
// 메시지 저장 시 자동 푸시
if (m.senderId && !m.isSystem) {
  // 채팅방 멤버들에게 푸시
  for (const memberId of memberIds) {
    await sendPushNotificationToUser(memberId, {
      type: 'MESSAGE',
      title: '💬 {발신자}님으로부터 메시지',
      body: 메시지_내용,
      badge: 1,
      data: { type, messageId, chatId, senderId }
    });
  }
}
```

#### 공지사항 푸시
```javascript
// 공지사항 저장 시 자동 푸시
if (isNewNotice) {
  const [allUsers] = await pool.query('SELECT id FROM users');
  for (const user of allUsers) {
    await sendPushNotificationToUser(user.id, {
      type: 'NOTICE',
      title: '📢 {제목}',
      body: 내용_미리보기,
      badge: 1,
      data: { type: 'NOTICE', noticeId, isImportant }
    });
  }
}
```

#### 근태관리 푸시
```javascript
// 토요일 근무/연장근무 신청 시
if (isNewRequest) {
  const [approvers] = await pool.query('SELECT id FROM users WHERE (isManager OR isDeptHead)');
  for (const approver of approvers) {
    await sendPushNotificationToUser(approver.id, {
      type: type, // 'SATURDAY_SHIFT' or 'OVERTIME'
      title: '📅/⏰ {신청 유형}',
      body: '{{신청자}} 승인 대기중',
      badge: 1,
      data: { type, shiftId/overtimeId, userId, userName }
    });
  }
}
```

### 클라이언트 측 (React)

#### 포그라운드 핸들러
```typescript
// App.tsx
window.fcmMessageHandler = (payload) => {
  const { type, data } = payload;
  
  switch (type) {
    case 'MESSAGE':
      showToast('💬 메시지 수신');
      setActiveChatId(data.chatId);
      setCurrentView('chat');
      break;
    case 'NOTICE':
      showToast('📢 공지사항 등록');
      setCurrentView('notice');
      break;
    case 'SATURDAY_SHIFT':
    case 'OVERTIME':
      showToast('📅 근태 신청');
      setCurrentView('leave');
      break;
  }
  loadData(true); // 데이터 새로고침
};
```

#### 배지 계산
```typescript
// App.tsx
const unreadTotal = useMemo(() => {
  // 메시지 읽지 않은 수
  return Object.keys(messages).reduce((acc, chatId) => {
    return acc + unreadCount;
  }, 0);
}, [messages, chats, currentUser]);

const pendingCount = useMemo(() => {
  // 승인 대기 중인 요청 수
  const leaves = leaveRequests.filter(r => r.status === 'PENDING');
  const shifts = saturdayShifts.filter(r => r.status === 'PENDING');
  const overtimes = overtimeRequests.filter(r => r.status === 'PENDING');
  return [...leaves, ...shifts, ...overtimes].length;
}, [leaveRequests, saturdayShifts, overtimeRequests]);
```

#### 백그라운드 처리
```typescript
// firebase-messaging-sw.js
messaging.onBackgroundMessage((payload) => {
  const { type, chatId, noticeId, shiftId } = payload.data;
  
  let targetUrl = '/app';
  if (type === 'MESSAGE') targetUrl = `/app?view=chat&chatId=${chatId}`;
  else if (type === 'NOTICE') targetUrl = `/app?view=notice`;
  else if (type === 'SATURDAY_SHIFT' || type === 'OVERTIME') {
    targetUrl = `/app?view=leave`;
  }
  
  // 알림 표시
  return self.registration.showNotification(title, {
    body, icon, badge,
    data,
    actions: [{ action: 'open', title: '열기' }]
  });
});
```

---

## 🧪 테스트 방법

### 1. 메시지 푸시 테스트
```bash
# 1. 브라우저에서 로그인 (user_001)

# 2. 다른 브라우저에서 로그인 (user_002)

# 3. user_002에서 user_001로 메시지 전송

# 4. user_001의 화면에 나타남:
#    - 포그라운드: 토스트 "💬 메시지 수신" + 배지 업데이트
#    - 백그라운드: OS 알림 표시
```

### 2. 공지사항 푸시 테스트
```bash
# 1. 관리자 계정으로 로그인

# 2. 공지사항 작성

# 3. 다른 사용자의 화면에서:
#    - 포그라운드: 토스트 "📢 공지사항 등록" + 공지탭 활성화
#    - 백그라운드: OS 알림 표시
```

### 3. 근태관리 푸시 테스트
```bash
# 1. 일반 직원으로 로그인

# 2. 토요일 근무 신청 또는 연장근무 신청

# 3. 팀장/부장의 화면에서:
#    - 포그라운드: 토스트 "📅 근태 신청" + 근태관리탭 활성화
#    - 백그라운드: OS 알림 표시
#    - 배지에 승인 대기 건수 표시
```

### 4. 배지 카운트 확인
```
Sidebar 메시지: 읽지 않은 메시지 수 표시 ✅
Sidebar 공지사항: N 표시 (새 공지 있음) ✅
Sidebar 근태관리: 승인 대기 건수 표시 ✅
```

---

## 📊 수정된 파일

### 서버
- `server/index.js`
  - 메시지 푸시: badge 정보 추가
  - 공지사항 푸시: 모든 사용자에게 전송 강화
  - 토요일 근무: badge 정보 추가
  - 연장근무: 신규 알림 로직 추가

### 클라이언트
- `src/App.tsx`
  - FCM 포그라운드 핸들러: 타입별 자동 탭 이동 추가
  
- `public/firebase-messaging-sw.js`
  - 배지 정보 처리
  - 타입별 URL 라우팅
  - 알림 클릭 시 올바른 페이지 이동

---

## 🎯 사용자 경험 흐름

### 메시지 수신
```
발신자가 메시지 전송
    ↓
서버: FCM 알림 자동 생성 (badge: 1)
    ↓
┌─────────────────────────────────┐
│ 수신자 앱 상태                   │
├─────────────────────────────────┤
│ 포그라운드:                     │
│ • 토스트: 💬 메시지            │
│ • 메시지 탭 활성화              │
│ • 배지 업데이트 (+1)            │
│                                 │
│ 백그라운드:                     │
│ • OS 알림: 💬 {발신자}          │
│ • 클릭 시 메시지 탭 열기        │
│ • 배지 업데이트 (+1)            │
└─────────────────────────────────┘
```

### 공지사항 등록
```
관리자가 공지사항 작성
    ↓
서버: 모든 사용자에게 FCM 알림
    ↓
┌─────────────────────────────────┐
│ 각 사용자 화면                   │
├─────────────────────────────────┤
│ 포그라운드:                     │
│ • 토스트: 📢 공지사항           │
│ • 공지사항 탭 활성화            │
│ • 배지: N 표시                  │
│                                 │
│ 백그라운드:                     │
│ • OS 알림: 📢 공지사항          │
│ • 클릭 시 공지사항 탭 열기      │
│ • 배지: N 표시                  │
└─────────────────────────────────┘
```

### 근태관리 신청
```
직원이 토요일 근무/연장근무 신청
    ↓
서버: 승인자(팀장/부장/이사)에게 FCM 알림
    ↓
┌─────────────────────────────────┐
│ 승인자 화면                     │
├─────────────────────────────────┤
│ 포그라운드:                     │
│ • 토스트: 📅/⏰ 근태 신청      │
│ • 근태관리 탭 활성화            │
│ • 배지: +1 (승인 대기)          │
│                                 │
│ 백그라운드:                     │
│ • OS 알림: 📅 근태 신청         │
│ • 클릭 시 근태관리 탭 열기      │
│ • 배지: +1 (승인 대기)          │
└─────────────────────────────────┘
```

---

## ✨ 주요 기능 요약

✅ **자동 송신**
- 메시지 저장 시 자동 푸시
- 공지사항 생성 시 전체 푸시
- 근태 신청 시 승인자에게 푸시

✅ **스마트 수신**
- 포그라운드: 토스트 + 자동 탭 이동
- 백그라운드: OS 알림 + 클릭 시 자동 페이지 이동

✅ **배지 카운트**
- 메시지: 읽지 않은 수 표시
- 공지: 새 공지 여부 (N 표시)
- 근태: 승인 대기 건수 표시

✅ **타입별 구분**
- 각 알림에 type 정보 포함
- UI에서 타입에 따른 다른 처리
- 클릭 시 올바른 페이지로 이동

---

## 🚀 즉시 사용 가능

모든 코드가 완성되어 바로 사용 가능합니다. 별도의 설정이 필요 없습니다.

**축하합니다! 완전한 푸시 알림 시스템이 구축되었습니다!** 🎉
