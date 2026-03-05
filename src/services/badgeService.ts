/**
 * 앱 아이콘 배지 관리 서비스
 * 웹 Badge API + Android 네이티브 배지 지원
 */

import { Capacitor } from '@capacitor/core';

export const badgeService = {
  /**
   * 배지 카운트 설정 (웹 + Android)
   * @param count 표시할 배지 숫자 (0 = 배지 제거)
   */
  async setBadgeCount(count: number): Promise<void> {
    try {
      // 1️⃣ 웹 Badge API (PWA, 웹 앱)
      if ('setAppBadge' in navigator) {
        if (count > 0) {
          try {
            await (navigator as any).setAppBadge(count);
            console.log(`✅ 웹 Badge API: 배지 설정 = ${count}`);
          } catch (e) {
            console.warn('⚠️ 웹 Badge API 설정 실패:', e);
          }
        } else {
          try {
            await (navigator as any).clearAppBadge();
            console.log('✅ 웹 Badge API: 배지 제거');
          } catch (e) {
            console.warn('⚠️ 웹 Badge API 제거 실패:', e);
          }
        }
      }

      // 2️⃣ Android 네이티브 배지 (APK)
      if (Capacitor.isNativePlatform()) {
        await badgeService.setAndroidBadge(count);
      }

      // 3️⃣ localStorage에 저장 (앱 시작 시 복구용)
      localStorage.setItem('badgeCount', count.toString());
    } catch (error) {
      console.error('❌ 배지 설정 오류:', error);
    }
  },

  /**
   * 배지 카운트 증가
   * @param increment 증가량 (기본값: 1)
   */
  async incrementBadgeCount(increment: number = 1): Promise<void> {
    try {
      const current = parseInt(localStorage.getItem('badgeCount') || '0', 10);
      const newCount = Math.max(0, current + increment);
      await badgeService.setBadgeCount(newCount);
    } catch (error) {
      console.error('❌ 배지 증가 오류:', error);
    }
  },

  /**
   * 배지 카운트 감소
   * @param decrement 감소량 (기본값: 1)
   */
  async decrementBadgeCount(decrement: number = 1): Promise<void> {
    try {
      const current = parseInt(localStorage.getItem('badgeCount') || '0', 10);
      const newCount = Math.max(0, current - decrement);
      await badgeService.setBadgeCount(newCount);
    } catch (error) {
      console.error('❌ 배지 감소 오류:', error);
    }
  },

  /**
   * 현재 배지 카운트 조회
   */
  getBadgeCount(): number {
    try {
      return parseInt(localStorage.getItem('badgeCount') || '0', 10);
    } catch {
      return 0;
    }
  },

  /**
   * Android 네이티브 배지 설정
   * Android 8.0+ (API 26+)에서 지원
   */
  async setAndroidBadge(count: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('ℹ️ 네이티브 환경이 아님 - Android 배지 설정 스킵');
      return;
    }

    try {
      // Capacitor의 App API를 사용하여 배지 설정
      // Android 기본 배지는 ShortcutBadger 또는 BadgeProvider 라이브러리 필요
      // 여기서는 콘솔 로그만 남김 (Android 네이티브 설정에서 처리)
      console.log(`📱 Android 배지 설정: ${count}`);

      // Android 12+ 에서는 NotificationManager를 통한 배지 설정이 기본
      // firebase-messaging 또는 native 플러그인으로 처리
    } catch (error) {
      console.warn('⚠️ Android 배지 설정 실패:', error);
    }
  },

  /**
   * 앱 시작 시 저장된 배지 복구
   */
  async restoreBadge(): Promise<void> {
    try {
      const savedCount = parseInt(localStorage.getItem('badgeCount') || '0', 10);
      if (savedCount > 0) {
        await badgeService.setBadgeCount(savedCount);
        console.log(`✅ 배지 복구: ${savedCount}`);
      }
    } catch (error) {
      console.error('❌ 배지 복구 오류:', error);
    }
  },

  /**
   * Service Worker를 통한 배지 업데이트 (백그라운드)
   * firebase-messaging-sw.js에서 호출
   */
  async notifyBadgeUpdate(count: number): Promise<void> {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'UPDATE_BADGE',
          count: count
        });
        console.log(`📢 Service Worker에 배지 업데이트: ${count}`);
      }
    } catch (error) {
      console.warn('⚠️ Service Worker 배지 업데이트 실패:', error);
    }
  }
};

export default badgeService;
