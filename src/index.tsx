import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// 강제 캐시 무효화 (빌드 버전 업데이트 시 자동 갱신)
const BUILD_VERSION = Date.now().toString();
console.log('🔄 빌드 버전:', BUILD_VERSION);

// Firebase 초기화
import { initializeApp } from 'firebase/app';
import { getMessaging, onMessage, getToken } from 'firebase/messaging';
import { firebaseConfig, vapidKey } from './config/firebase';

// 네이티브 푸시 초기화 (Capacitor 환경)
async function initializeCapacitorPush() {
  try {
    if ((window as any).Capacitor) {
      console.log('📱 Capacitor 환경 감지 - 네이티브 푸시 준비 중...');
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      
      // 앱이 백그라운드에서 복귀할 때 푸시 초기화
      const { App: CapApp } = await import('@capacitor/app');
      
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('📱 앱이 포그라운드로 돌아옴');
          // 필요시 푸시 토큰 갱신 등 추가 작업
        }
      });
      
      console.log('✅ Capacitor 푸시 환경 준비 완료');
    }
  } catch (error) {
    console.log('ℹ️ Capacitor 푸시 초기화 불가 (APK 환경이 아님)');
  }
}

// 앱 시작 시 Capacitor 푸시 초기화
initializeCapacitorPush();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Firebase 앱 초기화
const firebaseApp = initializeApp(firebaseConfig);

// Notification 권한 요청 (FCM 토큰 획득 전 필수)
async function requestNotificationPermission() {
  try {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        console.log('🔔 Notification 권한 요청 중...');
        const permission = await Notification.requestPermission();
        console.log('✅ Notification 권한:', permission);
        return permission === 'granted';
      } else if (Notification.permission === 'granted') {
        console.log('✅ Notification 권한 이미 있음');
        return true;
      } else {
        console.warn('⚠️ Notification 권한이 거부됨');
        return false;
      }
    }
    return false;
  } catch (error) {
    console.warn('⚠️ Notification 권한 요청 오류:', error);
    return false;
  }
}

// Firebase Cloud Messaging 초기화 및 FCM 토큰 획득
let messaging = null;
async function initializeMessaging() {
  try {
    // 1️⃣ Notification 권한 먼저 요청
    const hasPermission = await requestNotificationPermission();
    
    if (!hasPermission) {
      console.warn('⚠️ Notification 권한 없음 - 폴링으로 대체');
    }
    
    messaging = getMessaging(firebaseApp);
    console.log('✅ Firebase Cloud Messaging 초기화 완료');
    
    // 2️⃣ Service Worker 확인
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('📋 Service Worker 등록 상태:', registrations.length);
      registrations.forEach((reg, i) => {
        console.log(`   [${i}] Scope: ${reg.scope}, Active: ${!!reg.active}`);
      });
    }
    
    // 3️⃣ FCM 토큰 획득 시도
    try {
      const token = await getToken(messaging, { 
        vapidKey: vapidKey 
      });
      
      if (token) {
        console.log('✅ FCM 토큰 획득 성공:', token.substring(0, 20) + '...');
        // 전역 객체에 저장하여 App.tsx에서 접근 가능하게 함
        (window as any).fcmToken = token;
        // 서버에 토큰 등록 (App.tsx에서 호출될 때)
      }
    } catch (tokenError: any) {
      // 토큰 획득 실패는 정상 - 로컬 IP 환경에서는 실패하며 폴링으로 자동 전환됨
    }
  } catch (error: any) {
    // 모든 에러를 조용히 처리 - 폴링으로 대체
    if (error.code === 'messaging/unsupported-browser') {
      console.log('ℹ️ Firebase Cloud Messaging: 이 브라우저에서는 지원되지 않습니다. 폴링을 사용합니다.');
    } else if (error.code === 'messaging/failed-service-worker-registration') {
      console.log('ℹ️ Firebase Cloud Messaging: Service Worker 등록 실패. 폴링으로 계속 진행합니다.');
    } else if (error.code === 'messaging/permission-default' || error.code === 'messaging/permission-blocked') {
      console.log('ℹ️ Firebase Cloud Messaging: 알림 권한이 없습니다. 폴링으로 계속 진행합니다.');
    } else {
      // 예상치 못한 에러도 조용히 처리
      console.warn('⚠️ Firebase Cloud Messaging: 초기화 실패. 폴링으로 계속 진행합니다.', error.message || error);
    }
  }
}

// Service Worker가 등록된 후 메시징 초기화
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 기존 Service Worker 등록 해제 (캐시 무효화)
    navigator.serviceWorker.getRegistrations()
      .then(registrations => {
        console.log('🔍 기존 Service Worker 등록:', registrations.length);
        registrations.forEach(reg => {
          if (reg.scope.includes('firebase-messaging-sw')) {
            reg.unregister();
            console.log('🗑️ 이전 Firebase SW 등록 해제');
          }
        });
      })
      .catch(err => {
        console.warn('⚠️ 기존 SW 조회 실패:', err.message);
      });

    // 캐시 버스터를 포함한 새로운 Service Worker 등록
    const swUrl = '/firebase-messaging-sw.js?' + BUILD_VERSION;
    navigator.serviceWorker.register(swUrl, { scope: '/' })
      .then((registration) => {
        console.log('✅ Firebase Messaging Service Worker 등록 성공');
        console.log('   Scope:', registration.scope);
        console.log('   Active:', !!registration.active);
        
        // 업데이트 확인
        registration.update().catch(() => {});
        
        // 약간의 지연 후 메시징 초기화 (Service Worker 준비 시간)
        setTimeout(() => {
          initializeMessaging();
        }, 500);
      })
      .catch(err => {
        console.warn('⚠️ Service Worker 등록 실패:', err.message);
        console.warn('   URL:', swUrl);
        // 실패해도 폴링으로 계속 진행
        initializeMessaging();
      });
  });
} else {
  // Service Worker 미지원 시 바로 초기화
  initializeMessaging();
}

// 웹 환경 Notification API 설정
async function setupWebNotifications() {
  if (!('Notification' in window)) {
    console.log('ℹ️ Notification API를 지원하지 않습니다');
    return;
  }

  // Notification 권한 요청
  if (Notification.permission === 'default') {
    try {
      const permission = await Notification.requestPermission();
      console.log('✅ Notification 권한:', permission);
    } catch (error) {
      console.warn('⚠️ Notification 권한 요청 실패:', error);
    }
  }
}

// 포그라운드에서 메시지 수신 (messaging이 초기화된 후에 설정)
const setupOnMessage = async () => {
  // 웹 환경 Notification 권한 설정
  setupWebNotifications();

  // messaging이 초기화될 때까지 대기
  let attempts = 0;
  while (!messaging && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (messaging) {
    try {
      onMessage(messaging, (payload) => {
        console.log('📨 FCM 메시지 수신 (포그라운드):', payload);
        
        const notificationTitle = payload.notification?.title || '새 메시지';
        const notificationOptions = {
          body: payload.notification?.body || '새 알림이 있습니다.',
          icon: '/icon-192x192.png',
          badge: '/badge-72x72.png',
          data: payload.data,
          requireInteraction: true,  // 사용자가 클릭할 때까지 유지
          tag: 'messenger-notification',  // 동일 태그 알림은 하나만 표시
          renotify: true,  // 새 알림이 오면 다시 알림
        };
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: notificationTitle,
            options: notificationOptions,
          });
        }
      });
      console.log('✅ FCM 포그라운드 메시지 리스너 설정 완료');
    } catch (error) {
      console.warn('⚠️ FCM 포그라운드 메시지 리스너 설정 실패:', error);
    }
  }
};

setupOnMessage();

// 모바일 브라우저 주소창 변화에 대응
const setVH = () => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
};

setVH();
window.addEventListener('resize', setVH);
window.addEventListener('orientationchange', setVH);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);