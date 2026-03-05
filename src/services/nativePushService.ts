/**
 * 네이티브 푸시 알림 서비스 (Capacitor Firebase Messaging)
 * APK 전용 - 포그라운드/백그라운드 모두 지원
 */

import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { App as CapacitorApp } from '@capacitor/app';
import { getApiBase } from './db';

export interface NativePushNotification {
  title: string;
  body: string;
  data?: Record<string, any>;
  sentAt?: string;
}

export const NativePushService = {
  listeners: [] as Array<(notification: NativePushNotification) => void>,
  currentUserId: '' as string,
  isInitialized: false,
  tokenAttempts: 0,
  tokenReceived: false, // ✅ 토큰 수신 여부를 추적

  /**
   * 네이티브 푸시 초기화 (Capacitor Firebase Messaging)
   * @param userId - 사용자 ID
   */
  initialize: async (userId: string): Promise<string | null> => {
    if (!userId) {
      console.warn('⚠️ userId가 없어서 네이티브 푸시 초기화 불가');
      return null;
    }
    
    // Capacitor 환경 체크
    if (!typeof (window as any).Capacitor) {
      console.log('ℹ️ Capacitor 환경이 아님 - 웹 환경에서는 index.tsx의 Firebase SDK 사용');
      return null;
    }

    NativePushService.currentUserId = userId;
    NativePushService.tokenReceived = false; // ✅ 리셋
    console.log('🔴 [NativePushService] 초기화 시작:', userId);

    try {
      // 🔑 1단계: 권한 요청 (필수)
      console.log('📢 권한 요청 중...');
      try {
        await FirebaseMessaging.requestPermissions();
        console.log('✅ 권한 획득 완료');
      } catch (err) {
        console.warn('⚠️ 권한 요청 실패 (비치명적):', err);
      }

      // 🎫 2단계: 토큰 리스너 설정
      // ⚠️ Capacitor v8에서 getToken()을 호출하면 vapidKey undefined 에러 발생
      // 대신 onNewToken 리스너를 설정하면 APK가 자동으로 토큰 생성 후 리스너 호출
      console.log('👂 토큰 리스너 설정 중...');
      
      try {
        // tokenReceived: APK에서 토큰이 생성/갱신될 때 자동 호출
        FirebaseMessaging.addListener('tokenReceived', async (data: any) => {
          const newToken = data?.token;
          if (newToken) {
            console.log('🎫 [tokenReceived] 새 토큰 수신:', newToken.substring(0, 30) + '...');
            NativePushService.tokenReceived = true; // ✅ 플래그 설정
            
            try {
              await NativePushService.registerTokenToServer(newToken, userId, getApiBase());
              console.log('✅ 토큰 서버 등록 완료');
            } catch (regErr) {
              console.warn('⚠️ 토큰 서버 등록 실패:', regErr);
            }
          }
        });
        console.log('✅ 토큰 리스너 설정 완료');
      } catch (listenerErr) {
        console.warn('⚠️ 토큰 리스너 설정 실패:', listenerErr);
      }

      // 2-1단계: 초기 토큰 요청 (웹 Firebase SDK 경로 사용)
      // APK에서는 onNewToken이 자동으로 호출되므로 시간이 걸릴 수 있음
      console.log('🎫 초기 토큰 요청 (웹 경로)...');
      try {
        // Capacitor 환경에서 웹 Firebase SDK를 직접 import하여 사용
        const { getMessaging, getToken } = await import('firebase/messaging');
        const { initializeApp } = await import('firebase/app');
        const { firebaseConfig, vapidKey } = await import('../config/firebase');
        
        const firebaseApp = initializeApp(firebaseConfig);
        const messaging = getMessaging(firebaseApp);
        
        // Service Worker 준비
        const registration = await navigator.serviceWorker.ready;
        
        const token = await getToken(messaging, { 
          vapidKey,
          serviceWorkerRegistration: registration 
        });
        
        if (token) {
          console.log('✅ 초기 토큰 획득 (웹 경로):', token.substring(0, 30) + '...');
          NativePushService.tokenReceived = true; // ✅ 플래그 설정
          
          try {
            await NativePushService.registerTokenToServer(token, userId, getApiBase());
            console.log('✅ 초기 토큰 서버 등록 완료');
          } catch (regErr) {
            console.warn('⚠️ 초기 토큰 서버 등록 실패:', regErr);
          }
        }
      } catch (webErr: any) {
        // 웹 경로 실패는 무시 (onNewToken 리스너가 나중에 호출할 것)
        if (!webErr?.message?.includes('NetworkError')) {
          console.log('📝 웹 경로 초기 토큰 획득 불가 (onNewToken 대기 중):', webErr?.message?.substring(0, 50));
        }
      }

      // 2-2단계: 일정 시간 대기해도 토큰이 오지 않으면 경고
      console.log('⏳ 3초간 토큰 수신 대기...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (!NativePushService.tokenReceived) {
        console.warn('⚠️ 토큰 미수신 - 가능한 원인:');
        console.warn('   - 장치의 알림 권한이 비활성화됨');
        console.warn('   - Google Play Services 문제');
        console.warn('   - Firebase 설정 오류');
      }

      // 👂 3단계: 리스너 설정 (부분 실패해도 계속)
      console.log('👂 포그라운드 리스너 설정...');
      try {
        NativePushService.setupForegroundListener();
        console.log('✅ 포그라운드 리스너 완료');
      } catch (err) {
        console.warn('⚠️ 포그라운드 리스너 설정 실패:', err);
      }

      console.log('🌙 백그라운드 리스너 설정...');
      try {
        NativePushService.setupBackgroundListener();
        console.log('✅ 백그라운드 리스너 완료');
      } catch (err) {
        console.warn('⚠️ 백그라운드 리스너 설정 실패:', err);
      }

      console.log('🖱️  알림 클릭 리스너 설정...');
      try {
        NativePushService.setupNotificationActionListener();
        console.log('✅ 알림 클릭 리스너 완료');
      } catch (err) {
        console.warn('⚠️ 알림 클릭 리스너 설정 실패:', err);
      }

      NativePushService.isInitialized = true;
      const status = NativePushService.tokenReceived ? '✅ 성공' : '⚠️ 부분성공(리스너만)';
      console.log(`\n🎉 네이티브 푸시 초기화 ${status}`);

      return null; // 토큰은 onNewToken 리스너로 수신
    } catch (error) {
      console.error('❌ 예상치 못한 오류:', error);
      NativePushService.isInitialized = true; // 리스너라도 설정됨
      return null;
    }
  },

  /**
   * 포그라운드 알림 수신 (앱이 열려있을 때)
   */
  setupForegroundListener: () => {
    FirebaseMessaging.addListener('notificationReceived', (event) => {
      console.log('📬 포그라운드 알림 수신:', event);
      const notification: NativePushNotification = {
        title: event.notification?.title || '알림',
        body: event.notification?.body || '',
        data: event.notification?.data,
        sentAt: new Date().toISOString()
      };
      console.log('✅ 파싱된 알림:', notification);

      // 웹뷰에서 처리할 수 있도록 이벤트 발생
      NativePushService.handleNotification(notification);
    });
  },

  /**
   * 백그라운드 알림 수신 (앱이 닫혀있을 때)
   * 참고: 백그라운드에서는 자동으로 시스템 알림이 표시됨
   */
  setupBackgroundListener: () => {
    // 백그라운드 알림 리스너
    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      console.log('🌙 백그라운드 알림 액션:', event);
    });
  },

  /**
   * 알림 클릭 시 동작
   */
  setupNotificationActionListener: () => {
    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      console.log('🖱️  알림 클릭됨:', event);
      const { notification } = event;
      if (notification?.data && typeof notification.data === 'object') {
        const url = (notification.data as any)?.url;
        if (url && typeof url === 'string') {
          // 특정 페이지로 이동
          window.location.href = url;
        }
      }
    });
  },

  /**
   * 알림 처리 및 리스너 실행
   */
  handleNotification: (notification: NativePushNotification) => {
    // 모든 리스너에 알림 전달
    NativePushService.listeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (error) {
      }
    });

    // 시스템 알림 표시 (선택사항 - 포그라운드에서도 알림음 재생)
    NativePushService.showSystemNotification(notification);
  },

  /**
   * 시스템 알림 표시
   */
  showSystemNotification: (notification: NativePushNotification) => {
    if ('Notification' in window) {
      const NotificationAPI = (window as any).Notification;
      if (NotificationAPI.permission === 'granted') {
        try {
          new NotificationAPI(notification.title, {
            body: notification.body,
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            tag: 'native-push-notification',
            requireInteraction: true,
            renotify: true,
            silent: false,
            vibrate: [200, 100, 200]
          });
        } catch (error) {
        }
      }
    }
  },

  /**
   * 알림 리스너 등록
   */
  onNotification: (callback: (notification: NativePushNotification) => void): (() => void) => {
    NativePushService.listeners.push(callback);

    // 언서브스크라이브 함수 반환
    return () => {
      const index = NativePushService.listeners.indexOf(callback);
      if (index > -1) {
        NativePushService.listeners.splice(index, 1);
      }
    };
  },

  /**
   * FCM 토큰을 서버에 등록
   */
  registerTokenToServer: async (
    token: string,
    userId: string,
    apiBase: string
  ): Promise<boolean> => {
    try {
      console.log('\n📤 [registerTokenToServer] 서버 등록 시작');
      console.log('   URL:', `${apiBase}/api/fcm/save-token`);
      console.log('   userId:', userId);
      console.log('   token:', token.substring(0, 30) + '...');
      
      // 토큰을 localStorage에 저장 (콘솔에서 확인 가능)
      localStorage.setItem('apk_fcm_token', token);
      console.log('✅ localStorage에 토큰 저장됨');
      
      const registerUrl = `${apiBase}/api/fcm/save-token`;
      
      console.log('🔗 POST 요청 시작:', registerUrl);
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          token: token
        })
      });

      console.log('📡 응답 상태:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 서버 응답 성공:', result);
        console.log('✅ 스마트폰에서 푸시 알림을 받을 준비가 완료되었습니다.\n');
        return true;
      } else {
        const error = await response.text();
        console.error('❌ 토큰 등록 실패:', response.status);
        console.error('   응답:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ 토큰 등록 네트워크 오류:', error);
      return false;
    }
  },

  /**
   * 앱 시작 시 FCM 토큰 요청 및 등록
   */
  initializePush: async (userId: string, apiBase: string): Promise<void> => {
    try {
      if (!userId || !apiBase) {
        console.error('❌ userId 또는 apiBase 누락:', { userId, apiBase });
        return;
      }

      console.log('═══════════════════════════════════════');
      console.log('🚀 [initializePush] 네이티브 푸시 시작');
      console.log('   userId:', userId);
      console.log('   apiBase:', apiBase);
      console.log('═══════════════════════════════════════');
      
      // 1️⃣ 네이티브 푸시 초기화 및 토큰 획득
      console.log('\n📊 [Step 1/3] 네이티브 푸시 초기화...');
      await NativePushService.initialize(userId);

      // ✅ 토큰 수신 여부를 플래그로 확인
      if (NativePushService.tokenReceived) {
        console.log('\n✅ [완료] 네이티브 푸시 시스템 준비 완료!');
        console.log('   이제 스마트폰에서 푸시 알림을 받을 수 있습니다.');
        console.log('═══════════════════════════════════════\n');
      } else {
        console.warn('\n⚠️ [상태] 네이티브 푸시 리스너 설정 완료 (토큰 대기 중)');
        console.log('   onNewToken 리스너가 활성 상태입니다.');
        console.log('   토큰이 생성되면 자동으로 등록됩니다.');
        console.log('═══════════════════════════════════════\n');
      }
    } catch (error) {
      console.error('\n❌ [오류] 푸시 알림 초기화 실패:', error);
      console.log('═══════════════════════════════════════\n');
    }
  }
};

export default NativePushService;
