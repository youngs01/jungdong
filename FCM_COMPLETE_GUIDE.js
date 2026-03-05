/**
 * FCM 푸시 알림 완전 구현 가이드
 * 송수신 통합 테스트 및 검증
 */

// ============================================
// 1️⃣ 서버에서 클라이언트로 푸시 알림 전송
// ============================================

/**
 * 올바른 FCM 메시지 페이로드 형식
 * 이메일/Postman에서 테스트할 때 사용
 */
const correctFCMPayload = {
  // 알림 제목 및 내용
  notification: {
    title: "새 메시지",
    body: "정동병원 긴급 알림입니다.",
    icon: "https://your-domain.com/logo.png",  // 선택사항
  },

  // 앱으로 전달할 데이터
  data: {
    chatId: "chat_001",
    userId: "user_123",
    messageId: "msg_456",
    sentAt: new Date().toISOString(),
    customField: "custom_value",
  },

  // Android 플랫폼 설정
  android: {
    priority: "high",  // high: 즉시 전송, normal: 배터리 최적화 고려
    notification: {
      channelId: "messenger_channel",  // 중요! Android 8.0 이상 필수
      clickAction: "FLUTTER_NOTIFICATION_CLICK",
      sound: "default",
      vibrate: [0, 500, 250, 500],  // 진동 패턴 (밀리초)
    },
  },

  // iOS 플랫폼 설정
  apns: {
    headers: {
      "apns-priority": "10",  // 10: 즉시, 5: 배터리 절약
    },
    payload: {
      aps: {
        alert: {
          title: "새 메시지",
          body: "정동병원 긴급 알림입니다.",
        },
        sound: "default",
        "mutable-content": 1,
        badge: 1,  // 앱 아이콘에 표시할 배지 숫자
        "content-available": 1,  // 백그라운드 모드
      },
    },
  },

  // 웹 플랫폼 설정
  webpush: {
    headers: {
      TTL: "86400",  // 24시간
    },
    data: {
      chatId: "chat_001",
      userId: "user_123",
    },
    notification: {
      title: "새 메시지",
      body: "정동병원 긴급 알림입니다.",
      icon: "/logo.png",
      badge: "/badge-icon-72x72.png",
      tag: "FCM_NOTIFICATION",
    },
  },

  // 수신자 지정 (3가지 방법 중 하나 선택)
  // 방법 1: 단일 사용자
  token: "FCM_TOKEN_HERE",

  // 방법 2: 여러 토큰 (MultiCast)
  // tokens: ["TOKEN1", "TOKEN2", "TOKEN3"],

  // 방법 3: 구독자 (Topic)
  // topic: "urgent_alerts",
};

// ============================================
// 2️⃣ Node.js 서버에서 알림 전송 (Admin SDK)
// ============================================

const admin = require("firebase-admin");

/**
 * Firebase Admin SDK를 사용한 메시지 전송
 */
async function sendFCMNotification(
  token,
  title,
  body,
  data = {}
) {
  try {
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data,
      android: {
        priority: "high",
        notification: {
          channelId: "messenger_channel",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: {
              title: title,
              body: body,
            },
            sound: "default",
          },
        },
      },
      token: token,
    };

    const response = await admin.messaging().send(message);
    console.log("✅ 메시지 전송 성공:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("❌ 메시지 전송 실패:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 여러 토큰으로 동시 전송 (Multicast)
 */
async function sendMulticastNotification(
  tokens,
  title,
  body,
  data = {}
) {
  try {
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data,
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
      },
    };

    const response = await admin
      .messaging()
      .sendMulticast({ ...message, tokens });

    console.log("✅ 다중 메시지 전송 완료:");
    console.log("   성공:", response.successCount);
    console.log("   실패:", response.failureCount);

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("❌ 다중 메시지 전송 실패:", error);
    return { success: false, error: error.message };
  }
}

// ============================================
// 3️⃣ 서버 API 엔드포인트 예시
// ============================================

// Express.js 예시
const express = require("express");
const app = express();

/**
 * 특정 사용자에게 푸시 알림 전송
 * POST /api/fcm/send
 * Body: { userId: "user_123", title: "...", body: "...", data: {...} }
 */
app.post("/api/fcm/send", async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    // DB에서 해당 사용자의 FCM 토큰들 조회
    const tokens = await dbService.getUserTokens(userId);

    if (!tokens || tokens.length === 0) {
      return res
        .status(400)
        .json({ error: "사용자에게 등록된 토큰이 없습니다" });
    }

    // 여러 토큰으로 동시 전송
    const result = await sendMulticastNotification(
      tokens,
      title,
      body,
      data || {}
    );

    res.json(result);
  } catch (error) {
    console.error("API 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * FCM 토큰 등록
 * POST /api/fcm/register-token
 * Body: { userId: "user_123", token: "FCM_TOKEN", platform: "Web", deviceName: "..." }
 */
app.post("/api/fcm/register-token", async (req, res) => {
  try {
    const { userId, token, platform, deviceName } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ error: "userId, token 필수" });
    }

    // DB에 저장
    await dbService.saveFCMToken({
      userId,
      token,
      platform: platform || "Web",
      deviceName: deviceName || null,
      registeredAt: new Date(),
    });

    res.json({
      success: true,
      message: "토큰이 등록되었습니다.",
    });
  } catch (error) {
    console.error("API 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 4️⃣ 클라이언트 수신 처리
// ============================================

/**
 * 포그라운드 메시지 수신 (앱이 열려있을 때)
 * public/index.html에서 실행
 */
const messaging = firebase.messaging();

messaging.onMessage((payload) => {
  console.log("📬 포그라운드 메시지 수신:", payload);

  const notificationTitle = payload.notification?.title;
  const notificationOptions = {
    body: payload.notification?.body,
    icon: "/logo.png",
    data: payload.data,
  };

  // 브라우저 알림 표시
  new Notification(notificationTitle, notificationOptions);
});

/**
 * 백그라운드 메시지 수신 (Service Worker)
 * public/firebase-messaging-sw.js에서 실행
 */
self.addEventListener("push", (event) => {
  const notificationData = event.data.json();

  const notificationTitle = notificationData.notification?.title;
  const notificationOptions = {
    body: notificationData.notification?.body,
    icon: "/logo.png",
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// ============================================
// 5️⃣ 테스트 시나리오
// ============================================

/**
 * 테스트 1: FCM 토큰 등록 테스트
 * 요청:
 * POST http://localhost:3001/api/fcm/register-token
 * Content-Type: application/json
 *
 * {
 *   "userId": "user_001",
 *   "token": "c_L8sJh3...", (실제 FCM 토큰)
 *   "platform": "Web",
 *   "deviceName": "Chrome on Windows"
 * }
 *
 * 예상 응답:
 * {
 *   "success": true,
 *   "message": "FCM 토큰이 등록되었습니다.",
 *   "userId": "user_001",
 *   "tokenLength": 152
 * }
 */

/**
 * 테스트 2: 알림 전송 테스트
 * 요청:
 * POST http://localhost:3001/api/fcm/send
 * Content-Type: application/json
 *
 * {
 *   "userId": "user_001",
 *   "title": "테스트 알림",
 *   "body": "이것은 테스트 메시지입니다.",
 *   "data": {
 *     "chatId": "chat_001",
 *     "messageType": "text"
 *   }
 * }
 *
 * 예상 응답:
 * {
 *   "success": true,
 *   "successCount": 1,
 *   "failureCount": 0
 * }
 */

/**
 * 테스트 3: 토큰 조회 테스트
 * 요청:
 * GET http://localhost:3001/api/fcm/tokens/user_001
 *
 * 예상 응답:
 * {
 *   "success": true,
 *   "userId": "user_001",
 *   "tokens": ["c_L8sJh3...", "d_M9tLk4..."],
 *   "count": 2
 * }
 */

// ============================================
// 6️⃣ 주요 검증 항목
// ============================================

/**
 * 체크리스트:
 *
 * ✅ 서버 설정
 * - [ ] Firebase Admin SDK 초기화됨 (serviceAccountKey.json 필요)
 * - [ ] FCM API 엔드포인트 구현됨
 * - [ ] 토큰 DB 테이블 생성됨
 *
 * ✅ 클라이언트 설정
 * - [ ] Firebase 초기화 스크립트 (public/index.html)
 * - [ ] Service Worker 등록됨 (firebase-messaging-sw.js)
 * - [ ] VAPID 키 설정됨
 * - [ ] Notification 권한 요청됨
 *
 * ✅ 송신 테스트
 * - [ ] 서버에서 /api/fcm/send 호출 성공
 * - [ ] 토큰이 유효함 (failureCount = 0)
 * - [ ] 응답 시간 < 3초
 *
 * ✅ 수신 테스트
 * - [ ] 포그라운드: 앱 열려있을 때 알림 표시됨
 * - [ ] 백그라운드: Service Worker가 알림을 받고 표시함
 * - [ ] 잠금화면: OS 알림이 표시됨
 * - [ ] 알림 클릭: 올바른 페이지로 이동
 *
 * ✅ 다양한 환경 테스트
 * - [ ] Chrome/Edge (Windows)
 * - [ ] Safari (macOS/iOS)
 * - [ ] Android Chrome
 * - [ ] 네이티브 APK (Capacitor)
 */

module.exports = {
  correctFCMPayload,
  sendFCMNotification,
  sendMulticastNotification,
};
