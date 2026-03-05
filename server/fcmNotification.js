/**
 * FCM (Firebase Cloud Messaging) 푸시 알림 API
 * 서버 파일: /messenger/server/fcmNotification.js
 */

const admin = require('firebase-admin');

// ============================================
// 1️⃣ FCM 토큰 저장소 (DB 연동 필요)
// ============================================

// pool 객체는 index.js에서 전달받음
let pool = null;

/**
 * DB 연결 풀 설정 (index.js에서 호출)
 * @param {object} dbPool - MySQL 연결 풀
 */
function setDatabasePool(dbPool) {
  pool = dbPool;
}

/**
 * 사용자 FCM 토큰 저장 (DB 사용)
 * @param {string} userId - 사용자 ID
 * @param {string} token - FCM 토큰
 * @param {string} deviceName - 기기 이름 (선택사항)
 * @param {string} platform - 플랫폼 (iOS, Android, Web)
 */
async function saveUserToken(userId, token, deviceName = null, platform = 'Android') {
  if (!pool) {
    console.error('❌ DB 연결 없음');
    return;
  }
  
  try {
    console.log(`💾 FCM 토큰 저장: userId=${userId}, platform=${platform}, token=${token.substring(0, 20)}...`);
    await pool.query(
      `INSERT INTO fcm_tokens (user_id, token, device_name, platform) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE last_used = NOW()`,
      [userId, token, deviceName, platform]
    );
    console.log(`✅ FCM 토큰 저장 완료`);
  } catch (error) {
    console.error('❌ FCM 토큰 저장 오류:', error);
  }
}

/**
 * 사용자의 모든 토큰 조회 (DB 사용)
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string[]>} FCM 토큰 배열
 */
async function getUserTokens(userId) {
  if (!pool) {
    return [];
  }
  
  try {
    const [rows] = await pool.query(
      'SELECT token FROM fcm_tokens WHERE user_id = ? ORDER BY last_used DESC',
      [userId]
    );
    return rows.map(row => row.token);
  } catch (error) {
    return [];
  }
}

/**
 * 만료된 토큰 제거 (30일 이상 미사용)
 */
async function removeExpiredTokens() {
  if (!pool) return;
  
  try {
    const [result] = await pool.query(
      `DELETE FROM fcm_tokens 
       WHERE DATEDIFF(NOW(), last_used) > 30`
    );
  } catch (error) {

  }
}

/**
 * 특정 토큰 제거
 * @param {string} userId - 사용자 ID
 * @param {string} token - 제거할 토큰
 */
async function removeToken(userId, token) {
  if (!pool) return;
  
  try {
    await pool.query(
      'DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?',
      [userId, token]
    );
  } catch (error) {
  }
}

/**
 * 특정 사용자에게 푸시 알림 전송
 * @param {string} userId - 대상 사용자 ID
 * @param {string} title - 알림 제목
 * @param {string} body - 알림 내용
 * @param {object} data - 추가 데이터 (선택사항)
 */
async function sendNotificationToUser(userId, title, body, data = {}) {
  try {
    const tokens = await getUserTokens(userId);
    
    if (tokens.length === 0) {
      console.warn(`⚠️ 사용자 ${userId}에 대한 등록된 토큰 없음`);
      return { success: false, message: '토큰이 없습니다' };
    }

    console.log(`📤 사용자 ${userId}에게 FCM 알림 전송 (토큰: ${tokens.length}개)`);

    const message = {
      notification: {
        title: title,
        body: body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'messenger_channel',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          sound: 'default',
          priority: 'high',
        },
        data: {
          title: title,
          body: body,
          ...data
        }
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            alert: {
              title: title,
              body: body,
            },
            sound: 'default',
            'mutable-content': 1,
            badge: 1,
            'content-available': 1,
          },
        },
      },
      data: {
        title: title,
        body: body,
        ...data
      },
      tokens: tokens, // 여러 기기에 동시 전송
    };

    console.log('📨 전송할 메시지:', JSON.stringify(message, null, 2).substring(0, 500));

    const response = await admin.messaging().sendMulticast(message);
    
    console.log(`✅ FCM 전송 완료 - 성공: ${response.successCount}, 실패: ${response.failureCount}`);
    
    // 실패한 토큰 제거
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ 토큰 ${tokens[idx].substring(0, 20)}... 전송 실패:`, resp.error);
          failedTokens.push(tokens[idx]);
        }
      });
      
      // 비동기로 실패한 토큰 제거
      for (const token of failedTokens) {
        removeToken(userId, token).catch(e => {});
      }
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 여러 사용자에게 푸시 알림 전송
 * @param {string[]} userIds - 대상 사용자 ID 배열
 * @param {string} title - 알림 제목
 * @param {string} body - 알림 내용
 * @param {object} data - 추가 데이터
 */
async function sendNotificationToMultipleUsers(userIds, title, body, data = {}) {
  const results = [];
  
  for (const userId of userIds) {
    const result = await sendNotificationToUser(userId, title, body, data);
    results.push({ userId, ...result });
  }

  return results;
}

/**
 * 전체 사용자에게 브로드캐스트 알림 전송
 * @param {string} title - 알림 제목
 * @param {string} body - 알림 내용
 * @param {object} data - 추가 데이터
 */
async function broadcastNotification(title, body, data = {}) {
  if (!pool) {
    return { success: false, message: 'DB 연결 없음' };
  }
  
  try {
    // 모든 토큰 조회
    const [rows] = await pool.query(
      'SELECT DISTINCT token FROM fcm_tokens WHERE DATE_SUB(NOW(), INTERVAL 30 DAY) < last_used'
    );
    
    const allTokens = rows.map(row => row.token);
    
    if (allTokens.length === 0) {
      return { success: false, message: '토큰이 없습니다' };
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'messenger_channel',
        },
      },
      data: data,
      tokens: allTokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 특정 토큰으로 푸시 알림 전송 (테스트용)
 * @param {string} token - 기기 토큰
 * @param {string} title - 제목
 * @param {string} body - 내용
 * @param {object} data - 추가 데이터
 */
async function sendNotificationToToken(token, title, body, data = {}) {
  try {
    const message = {
      notification: {
        title: title,
        body: body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'messenger_channel',
        },
      },
      data: data,
      token: token,
    };

    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  setDatabasePool,
  saveUserToken,
  getUserTokens,
  removeToken,
  removeExpiredTokens,
  sendNotificationToUser,
  sendNotificationToMultipleUsers,
  broadcastNotification,
  sendNotificationToToken,
};
