
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatModule } from './components/ChatModule';
import { LeaveModule } from './components/LeaveModule';
import { AdminModule } from './components/AdminModule';
import { SettingsModule } from './components/SettingsModule';
import { NoticeModule } from './components/NoticeModule';
import { ColleaguesModule } from './components/ColleaguesModule';
import { LoginScreen } from './components/LoginScreen';
import { 
  ChatSession, 
  Message, 
  LeaveRequest, 
  LeaveStatus, 
  UserRole,
  User,
  SystemLog,
  LeaveStep,
  SaturdayShiftRequest,
  OvertimeRequest,
  Notice,
  Attachment
} from './types';
import { dbService } from './services/db';
import { getApiBase } from './services/db';
import { MOCK_USERS, INITIAL_CHATS } from './constants';
import { Loader2 } from 'lucide-react';
import { notificationService } from './services/notificationService';
import { initAndroidPush, onAndroidPushNotification } from './services/push/push.android';
import { initWebPush, onWebPushNotification } from './services/push/push.web';
import { Capacitor } from '@capacitor/core';
import badgeService from './services/badgeService';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // localStorage 대신 sessionStorage 사용 (탭 닫으면 자동 삭제)
    const saved = sessionStorage.getItem('med_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [users, setUsers] = useState<Record<string, User>>(MOCK_USERS);
  const [isDbLoading, setIsDbLoading] = useState(true);
  
  const [chats, setChats] = useState<ChatSession[]>(INITIAL_CHATS);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [saturdayShifts, setSaturdayShifts] = useState<SaturdayShiftRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);

  const [currentView, setCurrentView] = useState<'chat' | 'leave' | 'colleagues' | 'settings' | 'admin' | 'notice'>('notice');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const pollingRef = useRef<number | null>(null);
  const messagePollingRef = useRef<number | null>(null);
  const lastMessageIds = useRef<Record<string, string>>({});
  const isTabActive = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [lastNotification, setLastNotification] = useState<any>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isTabActive.current = document.visibilityState === 'visible';
    };
    
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
    };

    const handleNotificationClick = (e: any) => {
      const { chatId } = e.detail;
      if (chatId) {
        setActiveChatId(chatId);
        setCurrentView('chat');
      }
    };

    // Service Worker 업데이트 체크
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // 1시간마다 업데이트 체크
        setInterval(() => {
          registration.update().catch(() => {
            // 업데이트 실패는 무시
          });
        }, 60 * 60 * 1000);
      }).catch(() => {
        // Service Worker 준비 실패는 무시
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('notificationClick', handleNotificationClick);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('notificationClick', handleNotificationClick);
    };
  }, []);

  // 🔔 푸시 알림 초기화 (플랫폼별)
  useEffect(() => {
    if (!currentUser) return;

    console.log('🔔 [푸시 알림] 초기화 시작');

    if (Capacitor.isNativePlatform()) {
      // 📱 Android (APK) - Capacitor 기반
      console.log('📱 Android 환경 감지');
      initAndroidPush(currentUser.id);

      // Android 푸시 리스너 등록
      const unsubscribe = onAndroidPushNotification((notification) => {
        console.log('📩 Android 푸시 알림 수신:', notification);
        setLastNotification(notification);
      });

      return () => {
        unsubscribe();
      };
    } else {
      // 🌐 Web (브라우저) - Firebase 기반
      console.log('🌐 Web 환경 감지');
      initWebPush();

      // Web 푸시 리스너 등록
      const unsubscribe = onWebPushNotification((notification) => {
        console.log('📩 Web 푸시 알림 수신:', notification);
        setLastNotification(notification);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [currentUser?.id]);

  // 📬 푸시 알림 수신 처리
  useEffect(() => {
    if (!lastNotification || !currentUser) return;

    console.log('📬 푸시 알림 처리:', lastNotification);
    
    const chatId = lastNotification.data?.chatId;
    const type = lastNotification.data?.type;

    if (type === 'MESSAGE' && chatId) {
      showToast(`💬 ${lastNotification.title}`, 'info');
      setActiveChatId(chatId);
      setCurrentView('chat');
    } else if (type === 'NOTICE') {
      showToast(`📢 ${lastNotification.title}`, 'info');
      setCurrentView('notice');
    } else if (type === 'SATURDAY_SHIFT' || type === 'OVERTIME') {
      showToast(`📅 ${lastNotification.title}`, 'info');
      setCurrentView('leave');
    } else {
      showToast(`🔔 ${lastNotification.title}`, 'info');
    }

    // 데이터 새로고침
    loadData(true);
  }, [lastNotification, currentUser]);

  const myChats = useMemo(() => {
    if (!currentUser) return [];
    return chats.filter(chat => chat.participants.includes(currentUser.id));
  }, [chats, currentUser]);

  const unreadTotal = useMemo(() => {
    if (!currentUser) return 0;
    return Object.keys(messages).reduce((acc, chatId) => {
      const chat = chats.find(c => c.id === chatId);
      if (!chat || !chat.participants.includes(currentUser.id)) return acc;

      const chatMsgs = messages[chatId];
      const unreadCount = chatMsgs.filter(m => 
        m.senderId !== currentUser.id && 
        (!m.readBy || !m.readBy.includes(currentUser.id))
      ).length;
      return acc + unreadCount;
    }, 0);
  }, [messages, chats, currentUser]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async (silent = false) => {
      // 이전 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
          const connected = await dbService.checkConnection();
          
          if (connected) {
              const [u, c, m, l, s, o, n, g] = await Promise.all([
                dbService.getAllUsers(),
                dbService.getAllChats(),
                dbService.getAllMessages(),
                dbService.getAllLeaves(),
                dbService.getAllSaturdayShifts(),
                dbService.getAllOvertime(),
                dbService.getAllNotices(),
                dbService.getAllLogs()
              ]);

              // null 응답 무시 (요청 취소됨)
              if (!u && !c && !m && !l && !s && !o && !n && !g) return;

              if (u && Object.keys(u).length > 0) {
                setUsers(u);
                // currentUser가 존재하면 업데이트 필요한 경우만 업데이트
                if (currentUser && u[currentUser.id]) {
                  const updatedUser = u[currentUser.id];
                  // 실제로 변경된 경우에만 setState 호출
                  if (JSON.stringify(updatedUser) !== JSON.stringify(currentUser)) {
                    setCurrentUser(updatedUser);
                  }
                }
              }
              setChats(c || []);
              
              const parseDate = (d: any) => d ? new Date(d) : new Date();
              
              // logs의 timestamp도 Date 객체로 변환
              setLogs((g || []).map((log: any) => ({
                ...log,
                timestamp: parseDate(log.timestamp)
              })));

              const parsedMessages: Record<string, Message[]> = {};
              Object.keys(m || {}).forEach(cid => {
                parsedMessages[cid] = m[cid].map((msg: any) => {
                  const parsedMsg: Message = {
                    ...msg,
                    timestamp: parseDate(msg.timestamp)
                  };
                  // readAtBy의 Date 객체 변환
                  if (msg.readAtBy && typeof msg.readAtBy === 'object') {
                    parsedMsg.readAtBy = {};
                    Object.keys(msg.readAtBy).forEach(userId => {
                      parsedMsg.readAtBy![userId] = parseDate(msg.readAtBy[userId]);
                    });
                  }
                  return parsedMsg;
                });
              });
              setMessages(parsedMessages);

              // 푸시 알림 폴링 (동시 실행)
              // 주의: FCM onMessage에서 이미 처리하므로 여기서는 호출 안 함
              if (currentUser?.id) {
                try {
                  const response = await fetch(`${getApiBase()}/push/pending/${currentUser.id}`, {
                    mode: 'cors',
                    credentials: 'omit'
                  });
                  if (response.ok) {
                    const notifications: any[] = await response.json();
                    // 폴링된 알림은 표시하지 않음 (FCM에서 이미 처리됨)
                    // 필요한 경우 백그라운드에서의 미수신 알림만 처리
                  }
                } catch (error) {
                  // 폴링 실패는 무시
                }
              }

              setLeaveRequests((l || []).map((r: any) => ({...r, isAdvance: !!r.isAdvance, startDate: parseDate(r.startDate), endDate: parseDate(r.endDate), createdAt: parseDate(r.createdAt)})));
              setSaturdayShifts((s || []).map((r: any) => ({...r, date: parseDate(r.date), createdAt: parseDate(r.createdAt)})));
              setOvertimeRequests((o || []).map((r: any) => ({...r, date: parseDate(r.date), createdAt: parseDate(r.createdAt)})));
              setNotices((n || []).map((notice: any) => ({ ...notice, createdAt: parseDate(notice.createdAt) })));

              if (currentUser) {
                // 실시간 하트비트 전송
                dbService.heartbeat(currentUser.id);

                Object.keys(parsedMessages).forEach(cid => {
                  const chatMsgs = parsedMessages[cid];
                  const lastMsg = chatMsgs[chatMsgs.length - 1];
                  
                  if (lastMsg && lastMsg.senderId !== currentUser.id && lastMessageIds.current[cid] !== lastMsg.id) {
                    // 읽지 않은 메시지만 알림 (readBy에 현재 사용자가 없어야 함)
                    const isUnread = !lastMsg.readBy || !lastMsg.readBy.includes(currentUser.id);
                    
                    if (isUnread && (cid !== activeChatId || !isTabActive.current)) {
                      const chat = (c || []).find((ch: any) => ch.id === cid);
                      if (chat && chat.participants.includes(currentUser.id)) {
                        const sender = (u || {})[lastMsg.senderId];
                        const senderName = sender ? `${sender.name}` : '새 메시지';
                        notificationService.showNotification(
                          senderName,
                          lastMsg.content,
                          cid
                        );
                        
                        // Service Worker를 통해 백그라운드 알림도 전송
                        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                          navigator.serviceWorker.controller.postMessage({
                            type: 'SHOW_NOTIFICATION',
                            title: senderName,
                            body: lastMsg.content,
                            chatId: cid,
                            icon: (sender?.avatar as string) || undefined
                          });
                        }
                      }
                    }
                    lastMessageIds.current[cid] = lastMsg.id;
                  }
                });
              }
          }
      } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // 요청 취소는 무시
            return;
          }
      }
  }, [currentUser?.id]); // currentUser 전체가 아닌 id만 사용

  // 메시지 전용 빠른 폴링 함수 (실시간 메시지 수신)
  const loadMessages = useCallback(async () => {
    try {
      const m = await dbService.getAllMessages();
      if (!m) return;

      const parseDate = (d: any) => d ? new Date(d) : new Date();
      
      const parsedMessages: Record<string, Message[]> = {};
      Object.keys(m || {}).forEach(cid => {
        parsedMessages[cid] = m[cid].map((msg: any) => ({
          ...msg,
          timestamp: parseDate(msg.timestamp)
        }));
      });
      setMessages(parsedMessages);

      if (currentUser) {
        const u = await dbService.getAllUsers();
        const c = await dbService.getAllChats();
        
        // 서버에서 가져온 사용자 목록이 있으면 업데이트
        if (u && Object.keys(u).length > 0) {
          setUsers(u);
        }

        Object.keys(parsedMessages).forEach(cid => {
          const chatMsgs = parsedMessages[cid];
          const lastMsg = chatMsgs[chatMsgs.length - 1];
          
          if (lastMsg && lastMsg.senderId !== currentUser.id && lastMessageIds.current[cid] !== lastMsg.id) {
            // 읽지 않은 메시지만 알림 (readBy에 현재 사용자가 없어야 함)
            const isUnread = !lastMsg.readBy || !lastMsg.readBy.includes(currentUser.id);
            
            if (isUnread && (cid !== activeChatId || !isTabActive.current)) {
              const chat = (c || []).find((ch: any) => ch.id === cid);
              if (chat && chat.participants.includes(currentUser.id)) {
                const sender = (u || {})[lastMsg.senderId];
                const senderName = sender ? `${sender.name}` : '새 메시지';
                notificationService.showNotification(
                  senderName,
                  lastMsg.content,
                  cid
                );
                
                // Service Worker를 통해 백그라운드 알림도 전송
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: senderName,
                    body: lastMsg.content,
                    chatId: cid,
                    icon: (sender?.avatar as string) || undefined
                  });
                }
              }
            }
            lastMessageIds.current[cid] = lastMsg.id;
          }
        });
      }
    } catch (err) {
    }
  }, [currentUser?.id, activeChatId]);

  useEffect(() => {
    // 초기 로드: 마운트될 때만 실행 (의존성 배열 비워둠)
    const init = async () => {
        setIsDbLoading(true);
        try {
          await loadData();
        } finally {
          // 최소 1초의 로딩을 보여준 후 해제 (너무 빨리 깜박이는 것 방지)
          setTimeout(() => setIsDbLoading(false), 1000);
        }
    };
    init();
    
    return () => { 
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (messagePollingRef.current) clearInterval(messagePollingRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []); // 마운트 시에만 실행

  // 로그인 후 권한 요청
  useEffect(() => {
    if (!currentUser) return;

    const requestNotificationPermission = async () => {
      try {
        if ('Notification' in window && (window as any).Notification.permission === 'default') {
          const permission = await (window as any).Notification.requestPermission();
        }
      } catch (error) {
      }
    };

    requestNotificationPermission();
  }, [currentUser?.id]);

  // 로그인 후 주기적으로 데이터 폴링 (온라인 상태 실시간 업데이트) - 폴링 주기 최적화
  useEffect(() => {
    if (!currentUser) return;

    // 초기 로드
    loadData(true);

    // 폴링 주기 최적화: 10초 (사용자 온라인 상태, 기타 데이터 배경 동기화)
    pollingRef.current = window.setInterval(() => {
      loadData(true);
    }, 10000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [currentUser?.id, loadData]);

  // 메시지 전용 빠른 폴링 - 실시간 메시지 수신 (1초)
  useEffect(() => {
    if (!currentUser) return;

    // 초기 메시지 로드
    loadMessages();

    // 메시지 폴링: 1초 (실시간 채팅)
    messagePollingRef.current = window.setInterval(() => {
      loadMessages();
    }, 1000);

    return () => {
      if (messagePollingRef.current) clearInterval(messagePollingRef.current);
    };
  }, [currentUser?.id, loadMessages]);

  useEffect(() => {
    if (activeChatId && currentUser && messages[activeChatId]) {
      const chatMsgs = messages[activeChatId];
      const hasUnread = chatMsgs.some(m => m.senderId !== currentUser.id && (!m.readBy || !m.readBy.includes(currentUser.id)));
      if (hasUnread) {
        dbService.markMessagesRead(activeChatId, currentUser.id, chatMsgs);
      }
    }
  }, [activeChatId, messages, currentUser]);

  const handleLogin = async (user: User) => {
      // 로그인 시 권한 요청 및 초기화
      const NotificationAPI = (window as any).Notification;
      
      const permissionGranted = await notificationService.requestPermission();
      
      if (!permissionGranted && NotificationAPI?.permission !== 'granted') {
      }
      
      notificationService.init();

      setCurrentUser(user);
      setCurrentView('notice'); // 로그인 시 공지사항 화면으로 설정
      sessionStorage.setItem('med_user', JSON.stringify(user));
      showToast(`${user.name}님, 환영합니다!`);
      await dbService.addLog({ id: `log_${Date.now()}`, action: 'LOGIN', details: `${user.name} 로그인 성공`, actorId: user.id, timestamp: new Date() });
      
      // 로그인 후 데이터 로드
      await loadData();
      
      // Service Worker에 사용자 정보 전송
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'USER_LOGGED_IN',
          userId: user.id,
          userName: user.name,
          notificationMode: notificationService.notificationMode
        });
      }
      
      // 하트비트 전송
      dbService.heartbeat(user.id);
  };

  const handleLogout = async () => {
    if (currentUser) {
      try {
        // 로그아웃 시 lastSeen을 현재 시간으로 업데이트하여 오프라인 표시
        const offlineUser = { ...currentUser, lastSeen: new Date() };
        await dbService.saveUser(offlineUser);
        await dbService.addLog({
          id: `log_${Date.now()}`,
          action: 'LOGOUT',
          details: `${currentUser.name} 로그아웃`,
          actorId: currentUser.id,
          timestamp: new Date()
        });
      } catch (error) {
      }

      // Service Worker에 로그아웃 정보 전송 (백그라운드 폴링 중지)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'USER_LOGGED_OUT'
        });
      }
      
      // Android SharedPreferences에서 userId 삭제
      if ((window as any).Android) {
        try {
          (window as any).Android.clearUserId();
        } catch (error) {
        }
      }
      
      // 알림 모드 초기화
      notificationService.notificationMode = 'auto';
      localStorage.removeItem('notification_mode');
      
      setCurrentUser(null);
      sessionStorage.removeItem('med_user');
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (messagePollingRef.current) clearInterval(messagePollingRef.current);
    }
  };

  const handleSendMessage = async (chatId: string, content: string, files?: File[]) => {
      if (!currentUser) return;
      // 메시지 보낼 때도 오디오 초기화 확인 (브라우저 잠금 대비)
      notificationService.init();

      // 동적 API URL 생성 (HTTPS 3000으로 고정)
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const apiUrl = (import.meta.env.VITE_API_URL as any) || `https://${hostname}:3000`;
      let attachments: Attachment[] = [];
      
      // 파일 처리 로직 (이미지는 압축 후 업로드, 영상은 경로만 저장)
      if (files && files.length > 0) {
        try {
          attachments = await Promise.all(files.map(async (file) => {
            // 파일 크기 사전 검사
            const maxImageSize = 3 * 1024 * 1024;
            const maxDocumentSize = 50 * 1024 * 1024;
            const maxVideoSize = 100 * 1024 * 1024;
            
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
            const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
            
            let maxSize = maxDocumentSize;
            if (isImage) maxSize = maxImageSize;
            else if (isVideo) maxSize = maxVideoSize;
            
            if (file.size > maxSize) {
              throw new Error(`${file.name}: 파일이 너무 큽니다 (최대 ${(maxSize/1024/1024).toFixed(0)}MB)`);
            }
            
            const isImageType = file.type.startsWith('image/');
            
            if (isImageType) {
              // 이미지: 압축 후 업로드
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const img = new Image();
              
              return new Promise<Attachment>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                  img.onload = () => {
                    // 최대 너비 800px, 높이 자동 계산 (더 작게)
                    let width = img.width;
                    let height = img.height;
                    const maxWidth = 800;
                    
                    if (width > maxWidth) {
                      height = (height * maxWidth) / width;
                      width = maxWidth;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx?.drawImage(img, 0, 0, width, height);
                    
                    // 30% 품질로 적극 압축
                    canvas.toBlob(async (blob) => {
                      if (!blob) {
                        reject(new Error('Canvas conversion failed'));
                        return;
                      }
                      
                      const compressedReader = new FileReader();
                      compressedReader.readAsDataURL(blob);
                      compressedReader.onload = async () => {
                        try {
                          const response = await fetch(`${apiUrl}/api/upload`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              fileName: file.name,
                              fileData: compressedReader.result as string
                            })
                          });
                          
                          const data = await response.json();
                          if (data.success) {
                            resolve({
                              id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                              name: file.name,
                              type: 'image',
                              url: data.url,
                              size: ((blob.size) / 1024).toFixed(1) + ' KB'
                            });
                          } else {
                            reject(new Error(data.message));
                          }
                        } catch (error) {
                          reject(error);
                        }
                      };
                    }, 'image/jpeg', 0.3);
                  };
                  img.src = e.target?.result as string;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            } else {
              // 문서/영상: 업로드만 진행
              return new Promise<Attachment>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                  try {
                    const response = await fetch(`${apiUrl}/api/upload`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        fileName: file.name,
                        fileData: reader.result as string
                      })
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                      resolve({
                        id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: file.name,
                        type: file.type.startsWith('video/') ? 'document' : 'document',
                        url: data.url,
                        size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
                      });
                    } else {
                      reject(new Error(data.message));
                    }
                  } catch (error) {
                    reject(error);
                  }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            }
          }));
        } catch (error) {
          showToast("파일 업로드 중 오류가 발생했습니다.", 'error');
          return;
        }
      }

      const newMessage: Message = { 
        id: `m_${Date.now()}`, 
        senderId: currentUser.id, 
        content, 
        timestamp: new Date(), 
        readBy: [currentUser.id],
        attachments // 첨부파일 추가
      };
      
      const currentChatMsgs = messages[chatId] || [];
      const updatedMessages = [...currentChatMsgs, newMessage];

      setMessages(prev => ({ ...prev, [chatId]: updatedMessages }));
      
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        // 파일만 보낸 경우 미리보기에 '사진' 또는 '파일'로 표시
        const previewMsg = content || (attachments.length > 0 ? (attachments[0].type === 'image' ? '📷 사진' : '📎 파일') : '');
        const updatedChat = { ...chat, lastMessage: previewMsg };
        await dbService.saveChat(updatedChat);
      }

      await dbService.saveMessages(chatId, updatedMessages);
      loadData(true);
  };

  // 삭제 핸들러: 삭제 후 즉시 loadData(true)를 호출하여 UI 갱신
  const handleDeleteMessage = async (messageId: string, chatId: string) => {
    await dbService.deleteMessage(messageId, chatId);
    loadData(true);
  };

  // 채팅방 나가기 핸들러 수정: 본인의 userId를 함께 전달
  const handleDeleteChat = async (chatId: string) => {
    if (!currentUser) return;
    await dbService.deleteChat(chatId, currentUser.id);
    if (activeChatId === chatId) setActiveChatId(null);
    loadData(true);
  };

  const handleApproveReject = async (id: string, status: LeaveStatus, category: 'leave' | 'ot' | 'saturday', rejectionReason?: string) => {
    if (!currentUser) return;

    let target: any = null;
    if (category === 'leave') target = leaveRequests.find(r => r.id === id);
    else if (category === 'ot') target = overtimeRequests.find(r => r.id === id);
    else if (category === 'saturday') target = saturdayShifts.find(r => r.id === id);

    if (!target) return;

    // 이사의 최종 승인 취소 기능 (APPROVED → PENDING)
    if (currentUser.role === UserRole.DIRECTOR && status === LeaveStatus.PENDING && target.status === LeaveStatus.APPROVED) {
      const updated = { ...target, status: LeaveStatus.PENDING, currentStep: LeaveStep.DIRECTOR_APPROVAL, rejectionReason: null };
      if (category === 'leave') await dbService.saveLeave(updated);
      else if (category === 'ot') await dbService.saveOvertime(updated);
      else if (category === 'saturday') await dbService.saveSaturdayShift(updated);
      showToast('결재가 취소되었습니다. 신청자가 이제 삭제할 수 있습니다.', 'info');
      await dbService.addLog({ id: `log_${Date.now()}`, action: 'CANCEL_APPROVAL', details: `${category} 최종 결재 취소 (${id})`, actorId: currentUser.id, timestamp: new Date() });
    } else if (status === LeaveStatus.REJECTED) {
      const updated = { ...target, status: LeaveStatus.REJECTED, rejectionReason: rejectionReason || '반려되었습니다.' };
      if (category === 'leave') await dbService.saveLeave(updated);
      else if (category === 'ot') await dbService.saveOvertime(updated);
      else if (category === 'saturday') await dbService.saveSaturdayShift(updated);
      showToast('반려 처리되었습니다.', 'info');
      await dbService.addLog({ id: `log_${Date.now()}`, action: 'REJECT', details: `${category} 결재 반려 (${id}) - 사유: ${rejectionReason}`, actorId: currentUser.id, timestamp: new Date() });
    } else {
      let nextStep = target.currentStep;
      let finalStatus = LeaveStatus.PENDING;

      // 결재 라인: 팀장 → 부장(있으면)/이사(없으면) → 이사
      if (target.currentStep === LeaveStep.MANAGER_APPROVAL) {
        // 같은 부서에 부장이 있는지 확인
        const requestUser = users[target.userId];
        const hasDeptHead = Object.values(users).some(u => 
          u.department === requestUser?.department && u.isDeptHead
        );
        nextStep = hasDeptHead ? LeaveStep.DEPT_HEAD_APPROVAL : LeaveStep.DIRECTOR_APPROVAL;
      } else if (target.currentStep === LeaveStep.DEPT_HEAD_APPROVAL) {
        nextStep = LeaveStep.DIRECTOR_APPROVAL;
      } 
      else if (target.currentStep === LeaveStep.DIRECTOR_APPROVAL) {
        nextStep = LeaveStep.COMPLETED;
        finalStatus = LeaveStatus.APPROVED;
      }

      const updated = { ...target, currentStep: nextStep, status: finalStatus };
      if (category === 'leave') await dbService.saveLeave(updated);
      else if (category === 'ot') await dbService.saveOvertime(updated);
      else if (category === 'saturday') await dbService.saveSaturdayShift(updated);
      
      // 최종 승인 시 연차 차감 처리
      if (finalStatus === LeaveStatus.APPROVED && category === 'leave') {
        try {
          // 연차 타입 매핑: LeaveType → useLeave API format
          let useLeaveType: 'FULL' | 'HALF' | 'MIN_30' = 'FULL';
          if (target.type === '오전 반차' || target.type === '오후 반차') {
            useLeaveType = 'HALF';
          } else if (target.type === '시간 단위 연차') {
            useLeaveType = 'MIN_30';
          }
          
          console.log(`[승인 시 연차 차감] userId=${target.userId}, leaveType=${useLeaveType}, requestId=${target.id}`);
          await dbService.useLeave(target.userId, useLeaveType, target.id, target.reason);
        } catch (e) {
          console.error('연차 차감 처리 실패:', e);
          showToast('승인은 완료되었으나 차감 처리 중 오류가 발생했습니다.', 'error');
        }
      }
      
      showToast(finalStatus === LeaveStatus.APPROVED ? '최종 승인되었습니다.' : '승인되었습니다.');
      await dbService.addLog({ id: `log_${Date.now()}`, action: 'APPROVE', details: `${category} 결재 승인 (${id})`, actorId: currentUser.id, timestamp: new Date() });
    }
    loadData(true);
  };

  const handleRequestCancel = async (id: string, type: 'leave' | 'ot' | 'saturday') => {
    if (!currentUser) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      // 동적 API URL 생성 (HTTPS 3000으로 고정)
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const apiUrl = (import.meta.env.VITE_API_URL as any) || `https://${hostname}:3000`;
      
      let url = '';
      if (type === 'leave') {
        url = `${apiUrl}/api/leaves/${id}`;
      } else if (type === 'ot') {
        url = `${apiUrl}/api/overtime/${id}`;
      } else if (type === 'saturday') {
        url = `${apiUrl}/api/saturday/${id}`;
      }
      
      const response = await fetch(url, { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        showToast(data.message || '삭제되었습니다.');
        loadData(true);
      } else {
        showToast(data.message || '삭제에 실패했습니다.', 'error');
      }
    } catch (error) {
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleInstallApp = async () => {
    // 설치 기능 비활성화
  };

  const handleChangeView = (view: any) => {
    notificationService.init(); // 뷰 전환(클릭) 시 오디오 활성화
    // 채팅이 아닌 다른 뷰로 이동할 때 활성 채팅 종료 (푸시 알림 수신을 위해)
    if (view !== 'chat') {
      setActiveChatId(null);
    }
    setCurrentView(view);
  };

  // 승인 대기 중인 요청 카운트
  const pendingCount = useMemo(() => {
    if (!currentUser) return 0;

    const leaves = leaveRequests.filter(r => r.status === LeaveStatus.PENDING && r.userId !== currentUser.id);
    const saturdays = saturdayShifts.filter(r => r.status === LeaveStatus.PENDING && r.userId !== currentUser.id);
    const overtimes = overtimeRequests.filter(r => r.status === LeaveStatus.PENDING && r.userId !== currentUser.id);
    
    // 결재 권한이 있는 것만 카운트
    let count = 0;
    
    // 승인 권한이 있는 것만 카운트
    [...leaves, ...saturdays, ...overtimes].forEach(item => {
      const step = item.currentStep;
      const requestUser = users[item.userId];
      
      if (step === LeaveStep.MANAGER_APPROVAL && currentUser.isManager && requestUser?.department === currentUser.department) {
        count++;
      } else if (step === LeaveStep.DEPT_HEAD_APPROVAL && currentUser.isDeptHead && requestUser?.department === currentUser.department) {
        count++;
      } else if (step === LeaveStep.DIRECTOR_APPROVAL && currentUser.role === UserRole.DIRECTOR) {
        count++;
      }
    });
    
    return count;
  }, [leaveRequests, saturdayShifts, overtimeRequests, users, currentUser]);

  // 🎯 앱 아이콘 배지 업데이트
  useEffect(() => {
    if (!currentUser) {
      badgeService.setBadgeCount(0);
      return;
    }

    // 배지 카운트 계산: 읽지 않은 메시지 + 새 공지사항 + 승인 대기 요청
    const badgeCount = 
      unreadTotal + 
      (notices.length > 0 ? 1 : 0) + 
      pendingCount;

    // 배지 업데이트 (웹 Badge API + Android 네이티브)
    badgeService.setBadgeCount(badgeCount);
    console.log(`🎯 [배지] 업데이트: ${badgeCount} (읽지않음: ${unreadTotal}, 공지: ${notices.length > 0 ? 1 : 0}, 승인대기: ${pendingCount})`);
  }, [unreadTotal, notices.length, pendingCount, currentUser?.id]);

  // 🎯 앱 시작 시 저장된 배지 복구 (새로고침 후)
  useEffect(() => {
    badgeService.restoreBadge();
  }, []);

  if (isDbLoading) return (
    <div className="w-full h-full min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-slate-900 gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-slate-400 font-medium animate-pulse text-sm">시스템 최적화 중...</p>
    </div>
  );

  if (!currentUser) return (
    <LoginScreen users={Object.values(users)} onLogin={handleLogin} isServerConnected={true} />
  );

  return (
    <div className="flex flex-col md:flex-row w-full h-full min-h-screen min-h-[100dvh] bg-slate-50 overflow-hidden relative safe-area-top">
      {toast && (
        <div className="fixed top-1/3 md:top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl bg-blue-600 text-white font-bold animate-toast">
          {toast.message}
        </div>
      )}
      
      <Sidebar 
        currentView={currentView} 
        currentUser={currentUser} 
        onChangeView={handleChangeView} 
        onLogout={handleLogout} 
        unreadTotal={unreadTotal} 
        hasNewNotice={notices.length > 0} 
        pendingApprovalsCount={pendingCount}
      />
      
      <main className="flex-1 w-full overflow-hidden mb-[84px] md:mb-0 relative p-2 md:p-4 flex flex-col safe-area-top">
        <div className="h-full w-full max-w-7xl mx-auto">
      {currentView === 'notice' && <NoticeModule notices={notices} currentUser={currentUser} allUsers={users} onCreateNotice={async (n) => { const notice: Notice = { ...n as Notice, id: n.id || `notice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }; await dbService.saveNotice(notice); loadData(true); }} onDeleteNotice={async (id) => { await dbService.deleteNotice(id); loadData(true); }} />}
          {currentView === 'chat' && (
            <ChatModule 
              currentUser={currentUser} 
              allUsers={users} 
              chats={myChats} 
              messages={messages} 
              activeChatId={activeChatId} 
              onSelectChat={setActiveChatId} 
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onDeleteChat={handleDeleteChat}
              onMarkRead={(cid) => dbService.markMessagesRead(cid, currentUser.id, messages[cid] || [])} 
              onCreateGroup={async (name, participantIds) => {
                const newGroup: ChatSession = { id: `chat_${Date.now()}`, name, participants: [...participantIds, currentUser.id], unreadCount: 0, type: 'group', lastMessage: '그룹 채팅이 시작되었습니다.' };
                await dbService.saveChat(newGroup); loadData(true);
              }} 
              onStartDirectChat={async (targetUserId) => {
                const existing = myChats.find(c => c.type === 'direct' && c.participants.includes(targetUserId));
                if (existing) { setActiveChatId(existing.id); return; }
                const newDirect: ChatSession = { id: `chat_${Date.now()}`, name: '', participants: [currentUser.id, targetUserId], unreadCount: 0, type: 'direct', lastMessage: '대화가 시작되었습니다.' };
                await dbService.saveChat(newDirect); loadData(true); setActiveChatId(newDirect.id);
              }} 
            />
          )}
          {currentView === 'leave' && (
            <LeaveModule 
              requests={leaveRequests} 
              overtimeRequests={overtimeRequests} 
              saturdayShifts={saturdayShifts} 
              currentUser={currentUser} 
              allUsers={users} 
              onRequestCreate={async (r)=> { 
                // 당겨쓰기도 정상과 동일하게 팀장부터 시작
                const req = r as LeaveRequest;
                
                // 신청자가 팀장이면 부장 또는 이사로 바로 라우팅
                let initialStep = LeaveStep.MANAGER_APPROVAL;
                if (currentUser.isManager) {
                  const hasDeptHead = Object.values(users).some(u => 
                    u.department === currentUser.department && u.isDeptHead
                  );
                  initialStep = hasDeptHead ? LeaveStep.DEPT_HEAD_APPROVAL : LeaveStep.DIRECTOR_APPROVAL;
                }
                
                const leaveData = {
                  ...req,
                  id: req.id || `lv_${Date.now()}`,
                  userId: currentUser.id,
                  createdAt: req.createdAt || new Date(),
                  currentStep: req.currentStep || initialStep,
                  status: req.status || LeaveStatus.PENDING
                };
                await dbService.saveLeave(leaveData); 
                loadData(true); 
              }}
              onOvertimeCreate={async (req)=> { 
                // 신청자가 팀장이면 부장 또는 이사로 바로 라우팅
                let initialStep = LeaveStep.MANAGER_APPROVAL;
                if (currentUser.isManager) {
                  const hasDeptHead = Object.values(users).some(u => 
                    u.department === currentUser.department && u.isDeptHead
                  );
                  initialStep = hasDeptHead ? LeaveStep.DEPT_HEAD_APPROVAL : LeaveStep.DIRECTOR_APPROVAL;
                }
                
                const otData = {
                  ...req as OvertimeRequest,
                  id: (req as OvertimeRequest).id || `ot_${Date.now()}`,
                  userId: currentUser.id,
                  createdAt: (req as OvertimeRequest).createdAt || new Date(),
                  currentStep: (req as OvertimeRequest).currentStep || initialStep,
                  status: (req as OvertimeRequest).status || LeaveStatus.PENDING
                };
                await dbService.saveOvertime(otData); 
                loadData(true); 
              }} 
              onSaturdayShiftCreate={async (d)=> { 
                // 신청자가 팀장이면 부장 또는 이사로 바로 라우팅
                let initialStep = LeaveStep.MANAGER_APPROVAL;
                if (currentUser.isManager) {
                  const hasDeptHead = Object.values(users).some(u => 
                    u.department === currentUser.department && u.isDeptHead
                  );
                  initialStep = hasDeptHead ? LeaveStep.DEPT_HEAD_APPROVAL : LeaveStep.DIRECTOR_APPROVAL;
                }
                
                const satData = {
                  id: (d as any).id || `sat_${Date.now()}`,
                  userId: currentUser.id,
                  date: (d as any).date || d,
                  hours: (d as any).hours || 4,
                  status: (d as any).status || LeaveStatus.PENDING,
                  currentStep: (d as any).currentStep || initialStep,
                  createdAt: (d as any).createdAt || new Date()
                };
                await dbService.saveSaturdayShift(satData); 
                loadData(true); 
              }} 
              onApproveReject={handleApproveReject} 
              onRequestCancel={handleRequestCancel} 
            />
          )}
          {currentView === 'colleagues' && <ColleaguesModule allUsers={users} currentUser={currentUser} onStartDirectChat={async (targetUserId) => {
             const existing = myChats.find(c => c.type === 'direct' && c.participants.includes(targetUserId));
             if (existing) { setActiveChatId(existing.id); setCurrentView('chat'); return; }
             const newDirect: ChatSession = { id: `chat_${Date.now()}`, name: '', participants: [currentUser.id, targetUserId], unreadCount: 0, type: 'direct', lastMessage: '대화가 시작되었습니다.' };
             await dbService.saveChat(newDirect); loadData(true); setActiveChatId(newDirect.id); setCurrentView('chat');
          }} />}
          {currentView === 'admin' && <AdminModule logs={logs} onAddUser={async (u) => { await dbService.saveUser(u as User); loadData(true); }} onDeleteUser={async (id) => { await dbService.deleteUser(id, currentUser?.id); loadData(true); }} onUpdateUser={async (id, up) => { await dbService.saveUser({ ...users[id], ...up }); loadData(true); }} currentUser={currentUser} allUsers={users} />}
          {currentView === 'settings' && <SettingsModule currentUser={currentUser} onUpdateProfile={async (up) => { await dbService.saveUser({ ...currentUser, ...up }); loadData(true); }} />}
        </div>
      </main>
    </div>
  );
}
