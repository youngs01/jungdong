/**
 * 🌐 Web (브라우저) 푸시 알림 서비스
 * Firebase Cloud Messaging 기반
 */

import { initializeApp } from 'firebase/app';
import { getMessaging, onMessage } from 'firebase/messaging';
import { firebaseConfig } from '../../config/firebase';
import { Capacitor } from '@capacitor/core';

export interface PushNotificationListener {
  (notification: {
    title: string;
    body: string;
    data?: Record<string, any>;
  }): void;
}

const listeners: PushNotificationListener[] = [];
let firebaseApp: any = null;
let messaging: any = null;

/**
 * Web 푸시 알림 초기화 (Firebase Cloud Messaging)
 */
export const initWebPush = (): void => {
  // Android 네이티브 환경이면 초기화 스킵
  if (Capacitor.isNativePlatform()) {
    console.log('ℹ️ Android 환경 - Web 푸시 초기화 스킵 (push.android 사용)');
    return;
  }

  try {
    console.log('🌐 Web 푸시 초기화 시작...');

    // Firebase 앱 초기화 (중복 방지)
    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      console.log('✅ Firebase 앱 초기화 완료');
    }

    // Firebase Messaging 초기화
    if (!messaging) {
      messaging = getMessaging(firebaseApp);
      console.log('✅ Firebase Cloud Messaging 초기화 완료');
    }

    // 포그라운드 메시지 리스너 등록
    // (Service Worker는 백그라운드/종료 상태의 메시지 처리)
    onMessage(messaging, (payload) => {
      console.log('📩 포그라운드 메시지 수신:', payload);

      const notification = {
        title: payload.notification?.title ?? '알림',
        body: payload.notification?.body ?? '',
        data: payload.data
      };

      // 모든 리스너에 전파
      notifyListeners(notification);
    });

    console.log('═══════════════════════════════════════');
    console.log('✅ Web 푸시 초기화 완료');
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Web 푸시 초기화 실패:', error);
  }
};

/**
 * 푸시 알림 리스너 등록
 */
export const onWebPushNotification = (
  listener: PushNotificationListener
): (() => void) => {
  listeners.push(listener);
  console.log(`📌 Web 푸시 리스너 추가 (총 ${listeners.length}개)`);

  // 리스너 제거 함수 반환
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
      console.log(`🗑️ Web 푸시 리스너 제거 (남은 개수: ${listeners.length}개)`);
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
  initWebPush,
  onWebPushNotification
};
