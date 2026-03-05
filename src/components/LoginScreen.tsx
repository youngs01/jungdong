
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { Activity, Lock, User as UserIcon, LogIn, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { LOGO_URL } from '../constants';
import { notificationService } from '../services/notificationService';
import { getApiBase } from '../services/db';

interface LoginScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  isServerConnected?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ users, onLogin, isServerConnected = false }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [LOGO_URL]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 로그인 시점에 알림 서비스 초기화 (오디오 잠금 해제)
      notificationService.init();

      const apiBase = getApiBase();
      const loginUrl = `${apiBase}/login`;
      console.log('🔐 로그인 시작:', { userId, apiBase, loginUrl, origin: window.location.origin });
      
      // 타임아웃 설정 (10초)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        console.log('📡 서버에 로그인 요청 중...', loginUrl);
        const response = await fetch(loginUrl, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, password }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        console.log('✅ 서버 응답:', response.status, response.statusText);

        if (!response.ok) {
          try {
            const data = await response.json();
            console.error('❌ 로그인 실패:', data.error);
            setError(data.error || `로그인 실패 (${response.status})`);
          } catch {
            setError(`로그인 실패 (${response.status})`);
          }
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        console.log('✅ 로그인 성공:', data.user?.id);
        
        if (data.success && data.user) {
          // Android SharedPreferences에 userId 저장
          saveUserIdToAndroid(data.user.id);
          
          // FCM 토큰이 있으면 서버에 등록
          if ((window as any).fcmToken) {
            registerFCMToken(data.user.id, (window as any).fcmToken);
          }
          onLogin(data.user);
        } else {
          setError(data.error || '로그인에 실패했습니다.');
          setIsLoading(false);
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        console.error('❌ 네트워크 에러:', fetchErr.message, fetchErr.name);
        console.error('전체 에러:', fetchErr);
        
        // 타임아웃 에러인지 확인
        if (fetchErr.name === 'AbortError') {
          setError('서버 연결 시간 초과 (10초). 네트워크를 확인하세요.');
          setIsLoading(false);
          return;
        }

        // Failed to fetch 에러 (CORS 또는 네트워크 문제)
        if (fetchErr.message === 'Failed to fetch' || fetchErr instanceof TypeError) {
          console.error('네트워크 상세:', {
            message: fetchErr.message,
            name: fetchErr.name,
            stack: fetchErr.stack
          });
          setError(`❌ 서버 연결 실패\n\n요청 주소: ${loginUrl}\n현재 origin: ${window.location.origin}`);
          setIsLoading(false);
          return;
        }

        // 다른 에러
        setError(`연결 오류: ${fetchErr.message}`);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('❌ 예상치 못한 로그인 오류:', err);
      setError(`오류: ${err.message || '알 수 없는 오류'}`);
      setIsLoading(false);
    }
  };

  const registerFCMToken = async (userId: string, fcmToken: string) => {
    try {
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/push/register-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, fcmToken })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ FCM 토큰 등록 완료:', result);
      } else {
        console.warn('FCM 토큰 등록 실패:', response.statusText);
      }
    } catch (error) {
      console.warn('FCM 토큰 등록 오류:', error);
    }
  };

  // Android SharedPreferences에 사용자 ID 저장
  const saveUserIdToAndroid = (userId: string) => {
    if ((window as any).Android) {
      try {
        (window as any).Android.saveUserId(userId);
        console.log('✅ Android SharedPreferences에 userId 저장됨:', userId);
      } catch (error) {
        console.warn('⚠️ Android SharedPreferences 저장 실패:', error);
      }
    } else {
      console.log('ℹ️ Android 인터페이스 사용 불가 (웹브라우저 환경)');
    }
  };

  return (
    <div className="w-full h-full min-h-screen min-h-[100dvh] bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden safe-area-top safe-area-bottom">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
          <div className="absolute top-10 left-10 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute top-10 right-10 w-64 h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-64 h-64 bg-teal-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
             <div className="bg-white p-4 rounded-3xl shadow-2xl shadow-blue-900/50">
                {!imgError ? (
                   <img 
                      key={LOGO_URL}
                      src={LOGO_URL} 
                      alt="정동병원" 
                      className="h-16 w-auto object-contain"
                      onError={() => setImgError(true)}
                      referrerPolicy="no-referrer"
                   />
                ) : (
                   <div className="p-2">
                      <Activity className="w-12 h-12 text-blue-600" />
                   </div>
                )}
             </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">정동병원</h1>
          <p className="text-slate-400 font-medium">통합 근태 관리 및 메신저 시스템</p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 relative">
          <div className={`absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${isServerConnected ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {isServerConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isServerConnected ? '온라인' : '오프라인'}
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">직원 로그인</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5 ml-1">아이디 (사번)</label>
              <div className="relative group">
                <UserIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5 ml-1">비밀번호</label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium animate-in fade-in slide-in-from-top-2 border border-red-100">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading || !userId || !password}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  로그인하기
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-slate-500 text-sm mt-8 font-medium">
          계정 문의: 기획팀 (내선 910)
        </p>
      </div>
    </div>
  );
};
