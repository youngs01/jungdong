
import { User, ChatSession, Message, LeaveRequest, OvertimeRequest, SystemLog, Notice, SaturdayShiftRequest, MaternityBenefit, UserLeaveBalance, LeaveDeductionLog } from '../types';

export const getApiBase = () => {
  // allow runtime-injected value from server (after index.html loads)
  if (typeof window !== 'undefined' && (window as any).__API_BASE__) {
    const injected = (window as any).__API_BASE__;
    console.log('✅ API Base (injected):', injected);
    return injected;
  }

  // 환경변수가 설정되어 있으면 우선 사용 (프로덕션/빌드 타임)
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.trim()) {
    const normalized = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
    console.log('✅ API Base (환경변수):', normalized);
    return normalized;
  }

  if (typeof window !== 'undefined') {
    // APK 환경 감지 (Capacitor 사용)
    if (isAPKEnvironment()) {
      const apkServerUrl = getAPKServerUrl();
      console.log('✅ API Base (APK):', apkServerUrl);
      return apkServerUrl;
    }

    // 웹 환경: 도메인 기반 URL 생성 (localhost → jd-hospital.p-e.kr로 변환)
    const protocol = window.location.protocol;
    let hostname = window.location.hostname;
    
    // localhost를 도메인으로 변환 (사내 접속용)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      hostname = 'jd-hospital.p-e.kr';
    }
    
    const port = window.location.port || (protocol === 'https:' ? '443' : '80');
    const portSuffix = (protocol === 'https:' && port === '443') || (protocol === 'http:' && port === '80') 
      ? '' 
      : `:${port}`;
    
    const apiBase = `${protocol}//${hostname}${portSuffix}/api`;
    console.log('✅ API Base (웹):', apiBase);
    return apiBase;
  }

  // 서버 사이드 렌더링/테스트 등
  return 'https://localhost:3000/api';
};

// APK 환경인지 확인
const isAPKEnvironment = (): boolean => {
  // Capacitor 플러그인이 있는지 확인
  return !!(window as any).Capacitor;
};

// APK에서 서버 URL 가져오기
const getAPKServerUrl = (): string => {
  // sessionStorage에서 저장된 서버 주소 확인
  const savedServerUrl = sessionStorage.getItem('apk_server_url');
  if (savedServerUrl) {
    // 포트가 없으면 3000 추가
    if (!savedServerUrl.includes(':')) {
      return `https://${savedServerUrl}:3000/api`;
    }
    return `https://${savedServerUrl}/api`;
  }

  // 기본값: 192.168.0.230 (사내 네트워크)
  const defaultIp = process.env.REACT_APP_SERVER_IP || '192.168.0.230';
  return `https://${defaultIp}:3000/api`;
};

const API_BASE = getApiBase();

// 프로필 이미지 URL 정규화 (다른 호스트에서도 로드 가능하도록)
export const normalizeProfileImageUrl = (url: string | undefined): string | undefined => {
  if (!url) return url;
  
  // 상대 경로이면 절대 경로로 변환
  if (url.startsWith('/uploads/')) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${hostname}${port}${url}`;
  }
  
  // 이미 완전한 URL이면 반환 (프로토콜 일관성 보장)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // 현재 페이지 프로토콜과 일치시키기 (Mixed Content 방지)
    const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const pageProtocol = window.location.protocol;
    
    // HTTPS 페이지에서 HTTP 리소스 로드 시 HTTPS로 업그레이드
    if (pageProtocol === 'https:' && url.startsWith('http://')) {
      return url.replace(/^http:/, 'https:');
    }
    
    return url;
  }
  
  // 프로토콜이 없는 상대 경로는 현재 프로토콜 사용
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${protocol}//${hostname}${port}${url.startsWith('/') ? url : '/' + url}`;
};

export const syncChannel = new BroadcastChannel('med_messenger_sync');

const fetchAPI = async (path: string, options?: RequestInit) => {
  try {
    const url = new URL(`${API_BASE}${path}`);
    url.searchParams.append('_t', Date.now().toString());

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000); // 30초로 증가

    // Capacitor 앱에서 SSL 인증서 문제 해결을 위해
    const fetchOptions: RequestInit = {
      ...options,
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {})
      }
    };

    const res = await fetch(url.toString(), fetchOptions);
    clearTimeout(id);
    
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (err: any) {
    // AbortError는 조용히 처리 (요청이 취소되었다는 뜻)
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('⚠️ API 요청 타임아웃 (30초):', path);
      return null; // null 반환하여 호출자가 처리하도록
    }
    
    // 네트워크 에러 상세 로깅
    if (err.message && err.message.includes('Failed to fetch')) {
      console.error('🔴 네트워크 연결 실패:', {
        url: `${API_BASE}${path}`,
        error: err.message,
        isCapacitor: typeof window !== 'undefined' && !!(window as any).Capacitor,
        timestamp: new Date().toISOString()
      });
    } else {
      // API 응답 에러
      console.error('🔴 API 요청 실패:', {
        path,
        error: err.message,
        code: err.code || 'UNKNOWN'
      });
    }
    
    throw err;
  }
};

export const dbService = {
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  async heartbeat(userId: string) {
    try {
      await fetch(`${API_BASE}/users/heartbeat/${userId}`, { method: 'POST' });
    } catch (e) {
      // Ignore heartbeat failures
    }
  },
  
  async getAllUsers(): Promise<Record<string, User>> {
    const users = await fetchAPI('/users');
    const userMap: Record<string, User> = {};
    users.forEach((u: any) => { 
      userMap[u.id] = {
        id: u.id,
        name: u.name,
        role: u.role,
        jobTitle: u.jobTitle,
        password: u.password,
        avatar: normalizeProfileImageUrl(u.avatar),
        department: u.department,
        isManager: Boolean(u.isManager),
        isDeptHead: Boolean(u.isDeptHead),
        joinDate: u.joinDate ? new Date(u.joinDate) : new Date(),
        earnedLeaveHours: u.earnedLeaveHours,
        lastSeen: u.lastSeen ? new Date(u.lastSeen) : new Date(),
        saturday_work_dates: u.saturday_work_dates,
        works_saturday: u.works_saturday ? 1 : 0,
        isDepartmentAccount: u.isDepartmentAccount,
        parentDepartmentId: u.parentDepartmentId
      };
    });
    return userMap;
  },

  async saveUser(user: User) {
    const formatDate = (d: any) => {
      if (!d) return null;
      return d instanceof Date 
        ? d.toISOString().slice(0, 19).replace('T', ' ')
        : new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    };
    
    const formatted = {
      ...user,
      joinDate: formatDate(user.joinDate),
      lastSeen: formatDate(user.lastSeen)
    };
    await fetchAPI('/users', { method: 'PUT', body: JSON.stringify(formatted) });
    syncChannel.postMessage({ type: 'USERS_UPDATED' });
  },

  async deleteUser(userId: string, adminId?: string) {
    const path = adminId ? `/users/${userId}?adminId=${adminId}` : `/users/${userId}`;
    await fetchAPI(path, { method: 'DELETE' });
    syncChannel.postMessage({ type: 'USERS_UPDATED' });
  },

  // 🔧 부서 목록 조회 (동적 부서 관리)
  async getDepartments(): Promise<string[]> {
    try {
      const departments = await fetchAPI('/departments');
      return departments.sort();
    } catch (error) {
      return [];
    }
  },

  async getAllChats(): Promise<ChatSession[]> {
    return await fetchAPI('/chats');
  },

  async saveChat(chat: ChatSession) {
    await fetchAPI('/chats', { method: 'PUT', body: JSON.stringify(chat) });
    syncChannel.postMessage({ type: 'CHATS_UPDATED' });
  },

  // 채팅방 나가기 (사용자 ID 전달하여 목록에서 제거)
  async deleteChat(chatId: string, userId?: string) {
    const query = userId ? `?userId=${userId}` : '';
    await fetchAPI(`/chats/${chatId}${query}`, { method: 'DELETE' });
    syncChannel.postMessage({ type: 'CHATS_UPDATED' });
  },

  async getAllMessages(): Promise<Record<string, Message[]>> {
    return await fetchAPI('/messages');
  },

  async saveMessages(chatId: string, messages: Message[]) {
    const formatDate = (d: any) => {
      const date = d instanceof Date ? d : new Date(d);
      // 한국 시간으로 변환 (UTC+9)
      const koreaTime = new Date(date.getTime() + (9 * 60 * 60 * 1000));
      return koreaTime.toISOString().slice(0, 19).replace('T', ' ');
    };
    
    const formatted = messages.map(msg => ({
      ...msg,
      timestamp: formatDate(msg.timestamp),
      readAtBy: msg.readAtBy ? Object.entries(msg.readAtBy).reduce((acc, [key, value]) => {
        acc[key] = formatDate(value);
        return acc;
      }, {} as Record<string, string>) : undefined
    }));
    
    await fetchAPI(`/messages/${chatId}`, { method: 'PUT', body: JSON.stringify({ messages: formatted }) });
    syncChannel.postMessage({ type: 'MESSAGES_UPDATED', chatId });
  },

  async deleteMessage(messageId: string, chatId: string) {
    await fetchAPI(`/messages/${messageId}`, { method: 'DELETE' });
    syncChannel.postMessage({ type: 'MESSAGES_UPDATED', chatId });
  },

  async markMessagesRead(chatId: string, userId: string, messages: Message[]) {
    const updatedMessages = messages.map(msg => {
      if (!msg.readBy) msg.readBy = [];
      if (!msg.readBy.includes(userId)) {
        const updated = { ...msg, readBy: [...msg.readBy, userId] };
        // 읽은 시간 정보 저장
        if (!updated.readAtBy) updated.readAtBy = {};
        updated.readAtBy[userId] = new Date();
        return updated;
      }
      return msg;
    });
    await this.saveMessages(chatId, updatedMessages);
  },

  async getAllLeaves(): Promise<LeaveRequest[]> {
    const leaves = await fetchAPI('/leaves');
    return leaves.map((l: any) => ({
      ...l,
      isAdvance: !!l.isAdvance,
      startDate: new Date(l.startDate),
      endDate: new Date(l.endDate),
      createdAt: new Date(l.createdAt)
    }));
  },

  async saveLeave(leave: LeaveRequest) {
    const formatDate = (d: any) => d instanceof Date 
      ? d.toISOString().slice(0, 19).replace('T', ' ')
      : new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    
    const formatted = {
      ...leave,
      startDate: formatDate(leave.startDate),
      endDate: formatDate(leave.endDate),
      createdAt: formatDate(leave.createdAt)
    };
    await fetchAPI('/leaves', { method: 'PUT', body: JSON.stringify(formatted) });
    syncChannel.postMessage({ type: 'LEAVES_UPDATED' });
  },

  async getAllSaturdayShifts(): Promise<SaturdayShiftRequest[]> {
    const shifts = await fetchAPI('/saturday');
    return shifts.map((s: any) => ({
      ...s,
      date: new Date(s.date),
      createdAt: new Date(s.createdAt)
    }));
  },

  async saveSaturdayShift(shift: SaturdayShiftRequest) {
    const formatDate = (d: any) => d instanceof Date 
      ? d.toISOString().slice(0, 19).replace('T', ' ')
      : new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    
    const formatted = {
      ...shift,
      date: formatDate(shift.date),
      createdAt: formatDate(shift.createdAt)
    };
    await fetchAPI('/saturday', { method: 'PUT', body: JSON.stringify(formatted) });
    syncChannel.postMessage({ type: 'LEAVES_UPDATED' });
  },

  async getAllNotices(): Promise<Notice[]> {
    return await fetchAPI('/notices');
  },

  async saveNotice(notice: Notice) {
    // MySQL DateTime 형식으로 변환 (YYYY-MM-DD HH:MM:SS)
    const formattedNotice = {
      ...notice,
      createdAt: notice.createdAt instanceof Date 
        ? notice.createdAt.toISOString().slice(0, 19).replace('T', ' ')
        : new Date(notice.createdAt).toISOString().slice(0, 19).replace('T', ' ')
    };
    await fetchAPI('/notices', { method: 'PUT', body: JSON.stringify(formattedNotice) });
    syncChannel.postMessage({ type: 'NOTICES_UPDATED' });
  },

  async deleteNotice(id: string) {
    await fetchAPI(`/notices/${id}`, { method: 'DELETE' });
    syncChannel.postMessage({ type: 'NOTICES_UPDATED' });
  },

  async getAllLogs(): Promise<SystemLog[]> {
    return await fetchAPI('/logs');
  },

  async addLog(log: SystemLog) {
    const formatDate = (d: any) => d instanceof Date 
      ? d.toISOString().slice(0, 19).replace('T', ' ')
      : new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    
    const formatted = {
      ...log,
      timestamp: formatDate(log.timestamp)
    };
    await fetchAPI('/logs', { method: 'PUT', body: JSON.stringify(formatted) });
    syncChannel.postMessage({ type: 'LOGS_UPDATED' });
  },

  async getAllOvertime(): Promise<OvertimeRequest[]> {
    const overtime = await fetchAPI('/overtime');
    return overtime.map((o: any) => ({
      ...o,
      date: new Date(o.date),
      createdAt: new Date(o.createdAt)
    }));
  },

  async saveOvertime(ot: OvertimeRequest) {
    const formatDate = (d: any) => d instanceof Date 
      ? d.toISOString().slice(0, 19).replace('T', ' ')
      : new Date(d).toISOString().slice(0, 19).replace('T', ' ');
    
    const formatted = {
      ...ot,
      date: formatDate(ot.date),
      createdAt: formatDate(ot.createdAt)
    };
    await fetchAPI('/overtime', { method: 'PUT', body: JSON.stringify(formatted) });
    syncChannel.postMessage({ type: 'LEAVES_UPDATED' });
  },

  // ============================================================
  // 모성보호제도 관련 API
  // ============================================================

  async getMaternityBenefits(): Promise<MaternityBenefit[]> {
    const benefits = await fetchAPI('/maternity-benefits');
    return benefits.map((b: any) => ({
      ...b,
      startDate: new Date(b.start_date),
      endDate: new Date(b.end_date),
      createdAt: new Date(b.created_at),
      updatedAt: new Date(b.updated_at)
    }));
  },

  async getUserMaternityBenefits(userId: string): Promise<MaternityBenefit[]> {
    const benefits = await fetchAPI(`/maternity-benefits/${userId}`);
    return benefits.map((b: any) => ({
      ...b,
      startDate: new Date(b.start_date),
      endDate: new Date(b.end_date),
      createdAt: new Date(b.created_at),
      updatedAt: new Date(b.updated_at)
    }));
  },

  async saveMaternityBenefit(benefit: MaternityBenefit) {
    const formatDate = (d: any) => {
      if (!d) return null;
      return d instanceof Date 
        ? d.toISOString().split('T')[0]
        : new Date(d).toISOString().split('T')[0];
    };

    const formatted = {
      ...benefit,
      startDate: formatDate(benefit.startDate),
      endDate: formatDate(benefit.endDate)
    };

    await fetchAPI('/maternity-benefits', {
      method: 'PUT',
      body: JSON.stringify(formatted)
    });
    syncChannel.postMessage({ type: 'MATERNITY_BENEFITS_UPDATED' });
  },

  async getUserLeaveBalance(userId: string): Promise<UserLeaveBalance> {
    const balance = await fetchAPI(`/leave-balance/${userId}`);
    return {
      ...balance,
      updatedAt: new Date(balance.updated_at)
    };
  },

  async useLeave(userId: string, leaveType: 'FULL' | 'HALF' | 'MIN_30', requestId: string, reason?: string) {
    const result = await fetchAPI('/use-leave', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        leaveType,
        requestId,
        reason
      })
    });
    syncChannel.postMessage({ type: 'LEAVE_BALANCE_UPDATED', userId });
    return result;
  },

  async getLeaveDeductionLogs(userId: string): Promise<LeaveDeductionLog[]> {
    const logs = await fetchAPI(`/leave-deduction-logs/${userId}`);
    return logs.map((log: any) => ({
      ...log,
      createdAt: new Date(log.created_at)
    }));
  }
};
