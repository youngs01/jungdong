const https = require('https');

/**
 * Legacy FCM API를 사용한 푸시 알림 전송 테스트
 * @param {string} serverKey - Firebase Server Key
 * @param {string} token - FCM 토큰
 * @param {string} title - 알림 제목
 * @param {string} body - 알림 내용
 */
function sendFCMNotificationLegacy(serverKey, token, title, body) {
  const postData = JSON.stringify({
    to: token,
    notification: {
      title: title,
      body: body,
      icon: '/icon-192x192.png',
      click_action: 'https://your-domain.com'
    },
    data: {
      chatId: 'test_chat',
      userId: 'test_user'
    }
  });

  const options = {
    hostname: 'fcm.googleapis.com',
    port: 443,
    path: '/fcm/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${serverKey}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);

    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log(`Response: ${chunk}`);
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

// 사용 예시
// Firebase Console > Project Settings > Cloud Messaging > Server Key를 입력하세요
const SERVER_KEY = 'YOUR_SERVER_KEY_HERE'; // 여기에 실제 서버 키를 입력
const TOKEN = 'ABCD1234'; // 테스트할 FCM 토큰

if (SERVER_KEY !== 'YOUR_SERVER_KEY_HERE') {
  sendFCMNotificationLegacy(SERVER_KEY, TOKEN, '테스트 알림', 'Legacy FCM API 테스트 메시지입니다.');
} else {
  console.log('❌ 서버 키를 설정해주세요.');
  console.log('Firebase Console > Project Settings > Cloud Messaging > Server Key를 복사해서 SERVER_KEY 변수에 입력하세요.');
}