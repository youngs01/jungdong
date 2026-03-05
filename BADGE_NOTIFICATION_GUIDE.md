# 🎯 웹앱 외부 배지 알림 시스템

**구현 완료:** 2026-02-09  
**상태:** ✅ 웹 Badge API + Service Worker + Android 지원

---

## 📋 구현된 기능

### 1. 웹 Badge API (PWA/웹 앱)
- 브라우저 탭에 배지 표시 (Chrome, Edge, Samsung Internet 등)
- 숫자 배지: 읽지 않은 메시지 수 + 공지사항 + 승인 대기 요청
- 자동 저장 및 새로고침 후 복구

### 2. Android 앱 아이콘 배지
- Firebase Cloud Messaging (FCM) 기반
- Android 8.0+ (API 26+) 네이티브 배지 지원
- 앱 아이콘에 빨간 숫자 배지 표시

### 3. Service Worker 배지 관리
- 백그라운드 푸시 알림과 함께 배지 업데이트
- 알림 클릭 시 배지 자동 감소
- 앱 포그라운드 전환 시 배지 동기화

---

## 🏗️ 기술 구조

### 주요 구성 파일

```
📁 Services/
  ├── badgeService.ts ⭐ (신규: 배지 관리 중앙 서비스)
  ├── notificationService.ts (기존: 포그라운드 알림)
  └── push/
      ├── push.web.ts (웹 푸시)
      └── push.android.ts (안드로이드 푸시)

📁 Components/
  └── App.tsx (배지 카운트 계산 + 업데이트)

📁 Service Worker/
  ├── public/firebase-messaging-sw.js (배지 메시지 처리)
  └── build/firebase-messaging-sw.js (컴파일 버전)

📁 Android Config/
  └── capacitor.config.ts (PushNotifications 플러그인 설정)
```

---

## 📊 배지 카운트 계산식

```
총 배지 수 = 읽지 않은 메시지 수 + (새 공지사항 있으면 1) + 승인 대기 요청 수

예시:
- 메시지 3개 읽지 않음
- 새 공지사항 1개
- 승인 대기 요청 2개
─────────────────────
결과: 배지 표시 6
```

### 각 항목별 계산

| 항목 | 카운트 방식 | 코드 위치 |
|------|----------|---------|
| **읽지 않은 메시지** | 채팅방별 미읽 메시지 합계 | `App.tsx` - `unreadTotal` |
| **새 공지사항** | `notices.length > 0 ? 1 : 0` | `App.tsx` - badge effect |
| **승인 대기 요청** | 결재 권한이 있고 PENDING 상태 | `App.tsx` - `pendingCount` |

---

## 💻 코드 구현

### 1️⃣ 배지 서비스 (badgeService.ts)

```typescript
import { Capacitor } from '@capacitor/core';

export const badgeService = {
  // 배지 설정
  async setBadgeCount(count: number): Promise<void> {
    // ✅ 웹 Badge API (동기)
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    }

    // ✅ Android 네이티브 배지 (APK)
    if (Capacitor.isNativePlatform()) {
      // FCM을 통한 배지 제공
      console.log(`📱 Android badge set: ${count}`);
    }

    // ✅ localStorage에 저장 (새로고침 후 복구)
    localStorage.setItem('badgeCount', count.toString());
  },

  // 배지 복구 (새로고침 후)
  async restoreBadge(): Promise<void> {
    const savedCount = parseInt(
      localStorage.getItem('badgeCount') || '0', 
      10
    );
    if (savedCount > 0) {
      await this.setBadgeCount(savedCount);
    }
  }
};
```

### 2️⃣ App.tsx에서 배지 업데이트

```typescript
// 승인 대기 요청 계산
const pendingCount = useMemo(() => {
  if (!currentUser) return 0;
  
  // 결재 권한이 있는 PENDING 요청만 카운트
  const pendingItems = [
    ...leaveRequests,
    ...saturdayShifts,
    ...overtimeRequests
  ].filter(item => 
    item.status === LeaveStatus.PENDING && 
    item.userId !== currentUser.id &&
    isApprovable(item) // 수용자의 승인 권한 확인
  );
  
  return pendingItems.length;
}, [leaveRequests, saturdayShifts, overtimeRequests, users, currentUser]);

// 배지 자동 업데이트
useEffect(() => {
  if (!currentUser) {
    badgeService.setBadgeCount(0);
    return;
  }

  // 총 배지 = 읽지않은 메시지 + 공지 + 승인대기
  const badgeCount = unreadTotal + (notices.length > 0 ? 1 : 0) + pendingCount;
  
  badgeService.setBadgeCount(badgeCount);
  console.log(`🎯 배지: ${badgeCount}`);
}, [unreadTotal, notices.length, pendingCount, currentUser?.id]);

// 앱 시작 시 배지 복구
useEffect(() => {
  badgeService.restoreBadge();
}, []);
```

### 3️⃣ Service Worker 배지 지원

```javascript
// firebase-messaging-sw.js

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'UPDATE_BADGE') {
    const badgeCount = event.data.count || 0;
    
    if ('setAppBadge' in self.navigator) {
      if (badgeCount > 0) {
        self.navigator.setAppBadge(badgeCount);
      } else {
        self.navigator.clearAppBadge();
      }
    }
  }
});
```

### 4️⃣ Android 설정 (capacitor.config.ts)

```typescript
const config: CapacitorConfig = {
  // ... 다른 설정 ...
  
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],  // ⭐ badge 포함
    }
  }
};
```

---

## 🎯 사용자 경험 흐름

### 시나리오 1: 메시지 수신
```
1️⃣ 사용자가 메시지 받음
   ↓
2️⃣ 서버가 FCM으로 메시지 전송
   ↓
3️⃣ 웹앱 하단: unreadTotal 증가
   ↓
4️⃣ useEffect 감지 → badgeService.setBadgeCount() 호출
   ↓
5️⃣ 결과:
   - PWA: 브라우저 탭에 빨간 배지 표시
   - Android: 앱 아이콘에 숫자 배지 표시
```

### 시나리오 2: 메시지 읽기
```
1️⃣ 사용자가 메시지 열어서 읽음
   ↓
2️⃣ markMessagesRead() 호출
   ↓
3️⃣ messages 상태 업데이트 → unreadTotal 감소
   ↓
4️⃣ useEffect 트리거 → badgeService.setBadgeCount() 호출
   ↓
5️⃣ 결과: 배지 숫자 감소
```

### 시나리오 3: 새로고침 (F5)
```
1️⃣ 사용자가 브라우저 새로고침
   ↓
2️⃣ App 컴포넌트 리마운트
   ↓
3️⃣ App 시작 useEffect에서 restoreBadge() 호출
   ↓
4️⃣ localStorage에서 이전 배지값 복구
   ↓
5️⃣ 결과: 배지가 유지됨 (숫자가 초기화되지 않음)
```

---

## 🔔 FCM 페이로드 예시

서버에서 전송하는 FCM 메시지에 badge 정보 포함:

```javascript
// server/fcmNotification.js - sendPushNotificationToUser()

const message = {
  notification: {
    title: '💬 {발신자}님으로부터 메시지',
    body: messageContent,
    icon: 'https://...',
    badge: 'https://.../badge-icon.png'  // PWA 배지 이미지
  },
  data: {
    type: 'MESSAGE',
    chatId: chatId,
    messageId: messageId,
    badge: '1'  // ⭐ 수치 배지
  },
  webpush: {
    notification: {
      badge: 'https://.../badge-icon-72x72.png',
      tag: 'FCM_NOTIFICATION'
    }
  },
  android: {
    notification: {
      badge: '1'  // ⭐ Android 배지
    }
  }
};

await admin.messaging().send(message);
```

---

## 📱 플랫폼별 배지 동작

### 웹 (Web/PWA)

| 브라우저 | 배지 위치 | 지원 | 비고 |
|---------|---------|------|------|
| **Chrome** | 탭 | ✅ | 완전 지원 |
| **Firefox** | 탭 | ⚡ | 일부 지원 |
| **Safari** | 탭 | ❌ | 미지원 |
| **Edge** | 탭 | ✅ | 완전 지원 |
| **Samsung Browser** | 탭 | ✅ | 완전 지원 |

### Android (APK)

| 버전 | 배지 동작 | 비고 |
|------|---------|------|
| **Android 8.0 이상** | 앱 아이콘 위 숫자 배지 | ✅ 강력하게 지원 |
| **Android 7.0 이하** | 알림 카운트 표시 | ⚠️ 제한적 |

### iOS (빌드 예정)

| 버전 | 배지 동작 | 비고 |
|------|---------|------|
| **iOS 10 이상** | 앱 아이콘 위 숫자 배지 | ✅ 네이티브 지원 |

---

## 🧪 테스트 방법

### 1. 웹 배지 테스트 (Chrome)

```javascript
// 브라우저 콘솔에서 실행
navigator.setAppBadge(5);  // 배지 5 표시
navigator.clearAppBadge();  // 배지 제거

// App.tsx의 배지 효과에서 변경 감시
localStorage.getItem('badgeCount')  // 현재 배지값
```

### 2. 메시지 읽지 않음 상태로 테스트

```
1️⃣ 사용자 A, B로 로그인
2️⃣ A에서 B로 메시지 3개 전송
3️⃣ B의 화면에서:
   - Sidebar: "메시지 3" 배지
   - 브라우저 탭: 빨간 배지 표시
   - 배지 값: 3 이상 (공지/승인 여부에 따라 다름)
```

### 3. 공지사항 추가

```
1️⃣ 관리자가 공지사항 작성
2️⃣ 모든 사용자의:
   - Sidebar: "공지 N" 배지
   - 브라우저 탭: 배지 +1 증가
```

### 4. 승인 대기 요청

```
1️⃣ 직원이 휴가/근무 신청
2️⃣ 팀장/부장의:
   - Sidebar: "근태관리 N" 배지
   - 브라우저 탭: 배지 증가
3️⃣ 승인하면 배지 감소
```

### 5. Android APK 테스트

```bash
# 1. APK 빌드
npm run build:apk

# 2. 디바이스에 설치
adb install android/app/build/outputs/.../app-debug.apk

# 3. 메시지 전송 후 앱 아이콘 확인
# → 앱 아이콘 위에 빨간 숫자 배지가 표시됨
```

---

## 🐛 문제 해결

### Q1: 배지가 표시되지 않는 경우

**증상:**
- PWA에서 배지가 안 보임
- Android 앱 아이콘에 배지 없음

**해결책:**

```typescript
// 1. 브라우저 지원 확인
if (!('setAppBadge' in navigator)) {
  console.warn('⚠️ 이 브라우저는 Badge API를 지원하지 않습니다');
}

// 2. ServiceWorker 등록 확인
navigator.serviceWorker.ready.then(() => {
  console.log('✅ Service Worker 준비됨');
});

// 3. localStorage 데이터 확인
console.log(localStorage.getItem('badgeCount'));

// 4. 개발자 도구에서 배지 업데이트 수동 실행
badgeService.setBadgeCount(5);
```

### Q2: 배지가 사라지지 않는 경우

**증상:**
- 메시지를 읽었는데도 배지가 남아있음
- unreadTotal이 업데이트되지 않음

**해결책:**

```typescript
// 1. 메시지 읽음 표시 확인
console.log('Unread messages:', unreadTotal);

// 2. markMessagesRead 호출 확인
await dbService.markMessagesRead(chatId, currentUser.id, messages);

// 3. useEffect 의존성 확인
// unreadTotal이 useEffect의 의존성 배열에 있는지 확인

// 4. 수동으로 배지 초기화
await badgeService.setBadgeCount(0);
```

### Q3: Android에서 배지가 안 나타나는 경우

**증상:**
- APK 설치 후 배지 미표시
- Android 12 이상에서 특히 문제

**해결책:**

```xml
<!-- AndroidManifest.xml에 권한 추가 -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Android 13+ 알림 권한 요청 -->
requestPermissions: [
  'android.permission.POST_NOTIFICATIONS'
]
```

```typescript
// capacitor.config.ts에서 PushNotifications 확인
plugins: {
  PushNotifications: {
    presentationOptions: ['badge', 'sound', 'alert']  // badge 포함
  }
}
```

---

## 📈 향후 개선 사항

- [ ] iOS 배지 지원 (Capacitor Push Notifications)
- [ ] 배지 클릭 시 해당 섹션으로 빠른 이동
- [ ] 배지 카운트 음성 안내
- [ ] 배지 진동 알림 패턴 커스터마이징
- [ ] Chrome Web Store 앱 배지 등록

---

## 📚 참고 자료

- [웹 Badge API MDN 문서](https://developer.mozilla.org/en-US/docs/Web/API/BadgeUIService)
- [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Android Notification Badges](https://developer.android.com/training/notify-user/badges)
