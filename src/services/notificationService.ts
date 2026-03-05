
import { LOGO_URL } from '../constants';

// 병원 환경에 적합한 맑고 짧은 알림음 (안정적인 CDN 소스)
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

export const notificationService = {
  audio: null as HTMLAudioElement | null,
  isInitialized: false,
  audioContext: null as AudioContext | null,
  notificationMode: 'auto' as 'auto', // 항상 'auto' (시스템 설정에 맡김)

  // 초기화: 브라우저 정책상 사용자 상호작용(클릭) 시점에 호출하여 오디오 잠금을 해제해야 함
  init() {
    if (this.isInitialized) return;
    
    try {
      this.audio = new Audio(NOTIFICATION_SOUND_URL);
      this.audio.load();
      
      // WebAudio API 초기화 (더 안정적인 오디오 재생)
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext && !this.audioContext) {
        try {
          this.audioContext = new AudioContext();
        } catch (e) {
        }
      }
      
      // 빈 소리를 한 번 재생하여 모바일/데스크톱 브라우저의 오디오 잠금을 해제
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
          }
          this.isInitialized = true;
        }).catch(e => {
          this.isInitialized = true; // 실패해도 초기화 완료 처리
        });
      }
    } catch (e) {
      this.isInitialized = true;
    }
  },

  // 현재 모드에 따라 소리 재생 여부 결정 (항상 자동으로 시스템 설정에 따름)
  shouldPlaySound(): boolean {
    // 자동 모드: 스마트폰 설정 감지
    return this.detectSilentMode() !== true;
  },

  // 스마트폰 사일런트/진동 모드 감지 (자동으로 시스템 설정에 따름)
  detectSilentMode(): boolean | null {
    try {
      // iOS Safari에서 사일런트 모드 감지 시도 (스피커 테스트)
      if ('onvolumechange' in window) {
        const tempAudio = new Audio();
        // 볼륨이 0이면 사일런트 모드일 가능성이 높음
        if ((tempAudio as any).defaultPlaybackRate === 0 || (window as any).audioVolume === 0) {
          return true;
        }
      }

      // Android: AudioContext의 상태로 추정
      if (this.audioContext && this.audioContext.state === 'suspended') {
        return true; // 사일런트/진동 모드일 가능성
      }
    } catch (e) {
    }
    
    return null; // 감지 불가 (기본: 소리 + 진동)
  },

  // 알림 권한 요청 (갤럭시/안드로이드 최적화)
  async requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }

    // Android WebView에서는 Notification API가 없으므로 체크
    if (typeof (window as any).Notification === 'undefined') {
      return false;
    }

    const NotificationAPI = (window as any).Notification;
    let permission = NotificationAPI.permission;
    
    if (permission === 'default') {
      permission = await NotificationAPI.requestPermission();
    }

    // 갤럭시/Android: 배터리 최적화 경고
    if (permission === 'granted') {
      const userAgent = navigator.userAgent.toLowerCase();
      const isAndroid = /android/.test(userAgent);
      const isSamsung = /samsung/.test(userAgent);
      
      if (isAndroid || isSamsung) {
      }
    }

    return permission === 'granted';
  },

  // 실제 알림 실행 (팝업 + 소리 + 진동)
  showNotification(title: string, body: string, chatId?: string) {
    try {
      const shouldSound = this.shouldPlaySound();
      const shouldVibrate = this.notificationMode !== 'sound' && this.notificationMode !== 'silent';

      // WebView 환경에서 Notification이 없을 수 있으므로 안전하게 접근
      const notificationPermission = typeof (window as any).Notification !== 'undefined' ? (window as any).Notification.permission : 'denied';

      // 1. 소리 알람 (설정에 따라)
      if (shouldSound) {
        this.playNotificationSound();
      }

      // 2. 진동 (스마트폰) - 여러 번 시도
      if (shouldVibrate && 'vibrate' in navigator) {
        try {
          // 첫 번째: 긴 진동
          navigator.vibrate(200);
          
          // 두 번째: 약간의 지연 후 진동 패턴
          setTimeout(() => {
            try {
              navigator.vibrate([150, 100, 150]);
            } catch (e) {
            }
          }, 300);
        } catch (e) {
        }
      }

      // 3. 시스템 팝업 알림
      if (typeof (window as any).Notification !== 'undefined' && (window as any).Notification.permission === 'granted') {
        try {
          const NotificationAPI = (window as any).Notification;
          const options: any = {
            body,
            icon: LOGO_URL,
            badge: LOGO_URL,
            tag: chatId || 'general',
            renotify: true,
            silent: !shouldSound,
            vibrate: shouldVibrate ? [150, 100, 150] : undefined,
          };

          const n = new NotificationAPI(title, options);
          
          n.onclick = () => {
            window.focus();
            if (chatId) {
              window.dispatchEvent(new CustomEvent('notificationClick', { detail: { chatId } }));
            }
            n.close();
          };
        } catch (e) {
        }
      } else if (typeof (window as any).Notification !== 'undefined') {
      } else {
      }

      // 4. Service Worker로도 알림 전송 (백그라운드 재생용)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          body,
          chatId,
          icon: LOGO_URL,
          playSound: shouldSound,
          vibrate: shouldVibrate
        });
      }
    } catch (e) {
    }
  },

  // 오디오 재생 (여러 방식 시도)
  playNotificationSound() {
    if (!this.audio) {
      try {
        this.audio = new Audio(NOTIFICATION_SOUND_URL);
      } catch (e) {
        return;
      }
    }

    try {
      // 방식 1: 기본 HTML Audio
      this.audio.currentTime = 0;
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          // 방식 2: WebAudio API (더 안정적)
          this.playWithWebAudio();
        });
      }
    } catch (e) {
      // 방식 3: WebAudio API
      this.playWithWebAudio();
    }
  },

  // WebAudio API를 통한 오디오 재생
  async playWithWebAudio() {
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        return;
      }

      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // AudioContext가 suspended 상태면 resume
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // 오실레이터로 간단한 비프음 생성 (설정된 음성 로드 불가 시 대체)
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // 알림음 톤 설정 (1000Hz, 400ms)
      oscillator.frequency.value = 1000;
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.4);
    } catch (e) {
    }
  }
};
