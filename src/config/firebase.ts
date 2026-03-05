/**
 * 🔥 Firebase 설정 (웹 환경 전용)
 * ⚠️ Android 환경에서는 절대 호출하면 안 됨
 * 
 * 플랫폼별 푸시 알림:
 * - Android (APK): src/services/push/push.android.ts (Capacitor)
 * - Web (브라우저): src/services/push/push.web.ts (Firebase)
 */

// Firebase 프로젝트 설정 (웹 SDK 전용)
export const firebaseConfig = {
  apiKey: "AIzaSyBAnYrnLNk6WoyPdL9iZ_W46J1HWOeNWoM",
  authDomain: "jungdong-48d68.firebaseapp.com",
  databaseURL: "https://jungdong-48d68.firebasedatabase.app",
  projectId: "jungdong-48d68",
  storageBucket: "jungdong-48d68.appspot.com",
  messagingSenderId: "215479265614",
  appId: "1:215479265614:web:d51cc5b797f54731df161f",
};

// VAPID 공개 키 (Web FCM 필수)
export const vapidKey = "BG0EfVFSZ2qg5xgRVRjTd5YlT8Y0i4Nx9PZ8N8qL5q9qQ9Z4mK9qL0m8n2o7p5r";

export default {
  firebaseConfig,
  vapidKey
};
