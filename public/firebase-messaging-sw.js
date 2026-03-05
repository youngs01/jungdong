/**
 * Firebase Cloud Messaging Service Worker
 * 백그라운드에서 푸시 알림 수신 및 처리
 */

importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// 전역 에러 핸들러
self.addEventListener('error', function(event) {
  console.error('[firebase-messaging-sw.js] Global error:', event.message);
});

self.addEventListener('unhandledrejection', function(event) {
  console.error('[firebase-messaging-sw.js] Unhandled rejection:', event.reason);
  event.preventDefault();
});

// Firebase 설정 (public/index.html의 설정과 동일해야 함)
var firebaseConfig = {
  apiKey: "AIzaSyBAnYrnLNk6WoyPdL9iZ_W46J1HWOeNWoM",
  authDomain: "jungdong-48d68.firebaseapp.com",
  databaseURL: "https://jungdong-48d68.firebasedatabase.app",
  projectId: "jungdong-48d68",
  storageBucket: "jungdong-48d68.appspot.com",
  messagingSenderId: "215479265614",
  appId: "1:215479265614:web:d51cc5b797f54731df161f"
};

// Firebase 초기화
var messaging = null;

try {
  if (typeof firebase === 'undefined') {
    console.warn('[firebase-messaging-sw.js] Firebase SDK가 로드되지 않았습니다.');
  } else {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
      console.log('✅ [firebase-messaging-sw.js] Firebase 초기화 완료');
    } else {
      console.log('✅ [firebase-messaging-sw.js] Firebase 이미 초기화됨');
    }
    
    messaging = firebase.messaging();
    console.log('✅ [firebase-messaging-sw.js] Cloud Messaging 초기화 완료');
  }
} catch (error) {
  console.error('❌ [firebase-messaging-sw.js] 초기화 실패:', error);
}

// 백그라운드 메시지 수신 처리
if (messaging) {
  messaging.onBackgroundMessage(function(payload) {
    try {
      console.log('📩 [firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);

      var notificationTitle = payload.notification && payload.notification.title 
        ? payload.notification.title 
        : '새 메시지';
      
      var badgeCount = payload.data && payload.data.badge 
        ? parseInt(payload.data.badge) 
        : 1;
      
      var notificationData = {
        chatId: payload.data && payload.data.chatId ? payload.data.chatId : '',
        userId: payload.data && payload.data.userId ? payload.data.userId : '',
        messageId: payload.data && payload.data.messageId ? payload.data.messageId : '',
        sentAt: payload.data && payload.data.sentAt ? payload.data.sentAt : '',
        type: payload.data && payload.data.type ? payload.data.type : 'MESSAGE',
        noticeId: payload.data && payload.data.noticeId ? payload.data.noticeId : '',
        shiftId: payload.data && payload.data.shiftId ? payload.data.shiftId : '',
        overtimeId: payload.data && payload.data.overtimeId ? payload.data.overtimeId : ''
      };

      var notificationOptions = {
        body: payload.notification && payload.notification.body
          ? payload.notification.body
          : '메시지가 도착했습니다.',
        icon: payload.notification && payload.notification.icon
          ? payload.notification.icon
          : '/logo.svg',
        badge: '/badge-icon-72x72.png',
        tag: 'FCM_NOTIFICATION',
        requireInteraction: false,
        data: notificationData,
        actions: [
          {
            action: 'open',
            title: '열기'
          },
          {
            action: 'close',
            title: '닫기'
          }
        ],
        badge: badgeCount
      };

      console.log('📤 알림 표시 준비:', {
        title: notificationTitle,
        body: notificationOptions.body,
        data: notificationData
      });

      return self.registration.showNotification(notificationTitle, notificationOptions).catch(function(err) {
        console.error('❌ 알림 표시 실패:', err);
      });
    } catch (error) {
      console.error('❌ 백그라운드 메시지 처리 오류:', error);
    }
  });
}

/**
 * 알림 클릭 이벤트 처리
 * 사용자가 푸시 알림을 클릭하면 해당 페이지로 이동
 */
self.addEventListener('notificationclick', function(event) {
  console.log('🔔 [firebase-messaging-sw.js] 알림 클릭:', event.notification);
  console.log('📊 알림 데이터:', event.notification.data);

  event.notification.close();

  if (event.action === 'close') {
    console.log('🚫 닫기 버튼 클릭');
    return;
  }

  var data = event.notification.data || {};
  var targetUrl = '/app';
  
  if (data.type === 'MESSAGE' && data.chatId) {
    targetUrl = '/app?view=chat&chatId=' + data.chatId;
    console.log('💬 메시지 알림 -> 채팅으로 이동:', targetUrl);
  } else if (data.type === 'NOTICE' && data.noticeId) {
    targetUrl = '/app?view=notice';
    console.log('📢 공지사항 알림 -> 공지로 이동:', targetUrl);
  } else if ((data.type === 'SATURDAY_SHIFT' || data.type === 'OVERTIME') && data.shiftId) {
    targetUrl = '/app?view=leave';
    console.log('📅 근무/초과 알림 -> 휴가관리로 이동:', targetUrl);
  } else if (data.type === 'MATERNITY' && data.userId) {
    targetUrl = '/app?view=maternity';
    console.log('🤰 출산휴가 알림 -> 출산휴가로 이동:', targetUrl);
  } else if (data.chatId) {
    targetUrl = '/app?view=chat&chatId=' + data.chatId;
    console.log('💬 기본 메시지 알림 -> 채팅으로 이동:', targetUrl);
  } else {
    console.log('🏠 기본 URL로 이동:', targetUrl);
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        console.log('🔍 찾은 윈도우 개수: ' + clientList.length);
        
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          console.log('📍 윈도우 ' + i + ': ' + client.url);
          
          if (client.url && client.url.indexOf('/app') !== -1) {
            console.log('✅ 기존 창 찾음 - 포커스 및 네비게이션:', targetUrl);
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        
        console.log('🆕 새 창 열기:', targetUrl);
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
      .catch(function(err) {
        console.error('❌ 알림 클릭 처리 오류:', err);
      })
  );
});

/**
 * 알림 닫기 이벤트 처리
 */
self.addEventListener('notificationclose', function(event) {
  console.log('✖️ [firebase-messaging-sw.js] 알림 닫음:', event.notification.tag);
});

// 포그라운드에서 전송한 커스텀 메시지 처리
var currentUser = null;
var notificationMode = 'auto';

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'USER_LOGGED_IN') {
    currentUser = {
      id: event.data.userId,
      name: event.data.userName
    };
    notificationMode = event.data.notificationMode || 'auto';
    console.log('[firebase-messaging-sw.js] User logged in:', currentUser);
  } else if (event.data && event.data.type === 'USER_LOGGED_OUT') {
    currentUser = null;
    console.log('[firebase-messaging-sw.js] User logged out');
  } else if (event.data && event.data.type === 'UPDATE_NOTIFICATION_MODE') {
    notificationMode = event.data.mode;
    console.log('[firebase-messaging-sw.js] Notification mode updated:', notificationMode);
  } else if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    var title = event.data.title;
    var options = event.data.options;
    self.registration.showNotification(title, options).catch(function(err) {
      console.error('[firebase-messaging-sw.js] 알림 표시 실패:', err);
    });
  } else if (event.data && event.data.type === 'UPDATE_BADGE') {
    // 🎯 배지 업데이트 메시지 처리
    var badgeCount = event.data.count || 0;
    if ('setAppBadge' in self.navigator) {
      if (badgeCount > 0) {
        self.navigator.setAppBadge(badgeCount).catch(function(err) {
          console.warn('[Service Worker] Badge update failed:', err);
        });
        console.log('📱 [Service Worker] Badge updated: ' + badgeCount);
      } else {
        self.navigator.clearAppBadge().catch(function(err) {
          console.warn('[Service Worker] Badge clear failed:', err);
        });
        console.log('📱 [Service Worker] Badge cleared');
      }
    }
  }
});

console.log('✅ [firebase-messaging-sw.js] Service Worker 로드 완료');

