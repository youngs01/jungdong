/**
 * 📱 Android (APK) 푸시 알림 서비스
 * Capacitor PushNotifications API 기반
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { getApiBase } from '../db';

export interface PushNotificationListener {
  (notification: {
    title: string;
    body: string;
    data?: Record<string, any>;
  }): void;
}

const listeners: PushNotificationListener[] = [];

/**
 * Android 푸시 알림 초기화
 * @param userId 현재 사용자 ID
 */
export const initAndroidPush = async (userId: string): Promise<void> => {
  // 네이티브 플랫폼 확인
  if (!Capacitor.isNativePlatform()) {
    console.log('ℹ️ 웹 환경 - Android 푸시 초기화 스킵');
    return;
  }

  try {
    console.log('📱 Android 푸시 초기화 시작...');

    // 1️⃣ 권한 요청
    console.log('📋 푸시 권한 요청...');
    const permStatus = await PushNotifications.requestPermissions();
    
    if (permStatus.receive !== 'granted') {
      console.warn('⚠️ 푸시 알림 권한 거부됨');
      return;
    }

    console.log('✅ 푸시 권한 허가됨');

    // 2️⃣ FCM 등록
    console.log('📝 FCM 등록 중...');
    await PushNotifications.register();
    console.log('✅ FCM 등록 완료');

    // 3️⃣ FCM 토큰 수신 및 서버 등록
    PushNotifications.addListener('registration', async (token) => {
      console.log('🎫 FCM 토큰 수신:', token.value);

      try {
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/push/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            token: token.value,
            platform: 'ANDROID'
          })
        });

        if (response.ok) {
          console.log('✅ FCM 토큰 서버 등록 완료');
        } else {
          console.warn('⚠️ FCM 토큰 서버 등록 실패:', response.status);
        }
      } catch (error) {
        console.error('❌ FCM 토큰 서버 등록 실패:', error);
      }
    });

    // 4️⃣ FCM 등록 실패
    PushNotifications.addListener('registrationError', (err) => {
      console.error('❌ FCM 등록 에러:', err);
    });

    // 5️⃣ 포그라운드 푸시 수신 (앱 실행 중)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📩 포그라운드 푸시 수신:', notification);

      const payload = {
        title: notification.title ?? '알림',
        body: notification.body ?? '',
        data: notification.data
      };

      // 본인이 보낸 메시지 필터링
      if (payload.data?.senderId === userId) {
        console.log('⏭️ 본인 메시지 무시');
        return;
      }

      // 모든 리스너에 전파
      notifyListeners(payload);
    });

    // 6️⃣ 알림 클릭 (백그라운드/종료 상태)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('👆 알림 클릭:', action);

      const chatId = action.notification.data?.chatId;
      if (chatId) {
        // 앱에서 처리할 수 있도록 커스텀 이벤트 발생
        window.dispatchEvent(
          new CustomEvent('pushNotificationClicked', {
            detail: { chatId }
          })
        );
      }
    });

    console.log('═══════════════════════════════════════');
    console.log('✅ Android 푸시 초기화 완료');
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Android 푸시 초기화 실패:', error);
  }
};

/**
 * 푸시 알림 리스너 등록
 */
export const onAndroidPushNotification = (
  listener: PushNotificationListener
): (() => void) => {
  listeners.push(listener);
  console.log(`📌 Android 푸시 리스너 추가 (총 ${listeners.length}개)`);

  // 리스너 제거 함수 반환
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
      console.log(`🗑️ Android 푸시 리스너 제거 (남은 개수: ${listeners.length}개)`);
    }
  };
};

/**
 * 모든 리스너에 알림 전파
 */
const notifyListeners = (notification: {
  title: string;
  body: string;
  data?: Record<string, any>;
}): void => {
  listeners.forEach((listener) => {
    try {
      listener(notification);
    } catch (error) {
      console.error('리스너 실행 에러:', error);
    }
  });
};

export default {
  initAndroidPush,
  onAndroidPushNotification
};
