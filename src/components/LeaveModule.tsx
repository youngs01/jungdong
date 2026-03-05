
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Calendar as CalendarIcon, Clock, CheckCircle, XCircle, Trash2, 
  BarChart3, Info, Sun, Timer, ArrowRight, Coffee, AlertTriangle, 
  ChevronLeft, ChevronRight, Check, User as UserIcon, FileText, Moon, Printer, X, Download, Utensils, Eye
} from 'lucide-react';
import { LeaveRequest, LeaveType, LeaveStatus, User, UserRole, LeaveStep, OvertimeRequest, SaturdayShiftRequest } from '../types';
import { getApiBase, normalizeProfileImageUrl } from '../services/db';
import { 
  format, startOfDay, endOfDay, getDay, addMonths, subMonths, 
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, 
  isSameMonth, addDays, isWeekend, startOfWeek
} from 'date-fns';

const API_BASE = getApiBase();

interface LeaveModuleProps {
  requests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  saturdayShifts: SaturdayShiftRequest[];
  currentUser: User;
  allUsers: Record<string, User>;
  onRequestCreate: (request: Partial<LeaveRequest>) => Promise<void>;
  onOvertimeCreate: (request: Partial<OvertimeRequest>) => Promise<void>;
  onSaturdayShiftCreate: (date: Date) => Promise<void>;
  onApproveReject: (id: string, status: LeaveStatus, category: 'leave' | 'ot' | 'saturday', rejectionReason?: string) => void;
  onRequestCancel: (id: string, type: 'leave' | 'ot' | 'saturday') => void;
}

export const LeaveModule: React.FC<LeaveModuleProps> = ({ 
  requests, overtimeRequests, saturdayShifts, currentUser, allUsers, 
  onRequestCreate, onOvertimeCreate, onSaturdayShiftCreate, onApproveReject, onRequestCancel 
}) => {
  const getInitialTab = (): 'summary' | 'leave' | 'saturday' | 'ot' | 'approval' | 'logs' => {
    // 병원장/원장은 토요근무 탭으로 기본 설정
    const isHospitalPresident = currentUser.role === UserRole.HOSPITAL_PRESIDENT || currentUser.role === UserRole.MEDICAL_DIRECTOR;
    return isHospitalPresident ? 'saturday' : 'summary';
  };
  
  const [activeTab, setActiveTab] = useState<'summary' | 'leave' | 'saturday' | 'ot' | 'approval' | 'logs'>(getInitialTab());
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [latestUser, setLatestUser] = useState<User>(currentUser);
  const [leaveBalance, setLeaveBalance] = useState<any | null>(null);
  
  // 부서별 계정 확인 (ID가 dept_로 시작하면 부서 계정)
  const isDepartmentAccount = currentUser.id.startsWith('dept_') || currentUser.isDepartmentAccount === true;
  
  // 최신 사용자 정보 조회 (토요근무 등) - 폴링 주기 최적화
  useEffect(() => {
    if (isDepartmentAccount) return; // 부서별 계정은 폴링 안 함
    
    const fetchLatestUser = async () => {
      try {
        const response = await fetch(`${API_BASE}/users`, {
          mode: 'cors',
          credentials: 'omit'
        });
        if (response.ok) {
          const users: User[] = await response.json();
          const updated = users.find(u => u.id === currentUser.id);
          if (updated) {
            setLatestUser(updated);
            console.log(`[LeaveModule] 최신 사용자 정보 업데이트: ${updated.id}`);
          }
        }
      } catch (error) {
        console.error('사용자 정보 조회 실패:', error);
      }
    };

    // LeaveModule 탭 활성화 시 즉시 조회
    fetchLatestUser();
    
    // 폴링 주기 최적화:
    // - summary/leave/saturday 탭: 10초 (일반 조회)
    // - ot/approval 탭: 5초 (더 자주 확인)
    const pollingInterval = (['approval', 'ot'].includes(activeTab)) ? 5000 : 10000;
    
    const interval = setInterval(fetchLatestUser, pollingInterval);
    return () => clearInterval(interval);
  }, [currentUser.id, activeTab, isDepartmentAccount]);
  
  // 연차 잔액 조회 (관리자 조정 반영) - 폴링 주기 최적화
  useEffect(() => {
    const fetchLeaveBalance = async () => {
      try {
        const response = await fetch(`${API_BASE}/admin/user-leave-balance/${currentUser.id}`, {
          mode: 'cors',
          credentials: 'omit'
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setLeaveBalance({
              remainMinutes: data.remainMinutes || 0,
              usedMinutes: data.usedMinutes || 0,
              annualMinutes: data.annualMinutes || 0,
              additionalLeaveDays: data.additionalLeaveDays || 0
            });
            console.log(`[LeaveModule] 연차 잔액 업데이트: ${data.remainMinutes}분, 법정연차: ${data.annualMinutes}분, 추가연차: ${data.additionalLeaveDays}일`);
          }
        }
      } catch (error) {
        console.error('연차 잔액 조회 실패:', error);
      }
    };

    // LeaveModule 마운트 시 즉시 조회 (초기값이 null이 아니도록)
    fetchLeaveBalance();
    
    // leave 또는 summary 탭 활성화 시 폴링 계속 (다른 탭에서는 폴링 중단)
    if (activeTab === 'leave' || activeTab === 'summary') {
      // 폴링 주기: 10초
      const interval = setInterval(fetchLeaveBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [currentUser.id, activeTab]);
  
  // 시간을 일, 시간, 분으로 변환하는 함수
  const formatHours = (totalHours: number) => {
    const days = Math.floor(totalHours / 8);
    const hours = Math.floor(totalHours % 8);
    const minutes = Math.round((totalHours % 1) * 60);
    
    let result = '';
    if (days > 0) result += `${days}일`;
    if (hours > 0) result += ` ${hours}시간`;
    if (minutes > 0) result += ` ${minutes}분`;
    
    return result || '0분';
  };

  // 분 수를 일, 시간, 분으로 표시 (AdminModule과 동일)
  const formatMinutesToDaysHoursMins = (totalMins: number) => {
    const days = Math.floor(totalMins / 480);      // 480분 = 1일
    const remainingAfterDays = totalMins % 480;
    const hours = Math.floor(remainingAfterDays / 60);
    const mins = remainingAfterDays % 60;
    return { days, hours, mins };
  };

  // 문자열 날짜를 로컬 타임존으로 파싱 (타임존 문제 해결)
  const parseLocalDate = (date: Date | string | number): Date => {
    if (!date) return new Date();
    
    if (typeof date === 'string') {
      // "yyyy-MM-dd" 형식의 문자열인 경우: 로컬 타임존으로 파싱
      if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = date.split('-').map(Number);
        return new Date(year, month - 1, day); // 로컬 자정
      } else {
        // ISO 형식이나 다른 형식: 기본 파싱
        return new Date(date);
      }
    } else if (typeof date === 'number') {
      return new Date(date);
    } else {
      return date;
    }
  };

  // 한국 표준시(KST) 기반 날짜 포매팅 - 타임존 문제 해결
  const formatDateKST = (date: Date | string | number) => {
    if (!date) return '';
    const dateObj = parseLocalDate(date);
    
    // "2026년 02월 13일" 형식으로 포매팅
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일`;
  };

  // 부서별 계정용: 같은 부서 직원들의 이번 주 연차 신청 조회
  const getDepartmentThisWeekLeaves = () => {
    if (!isDepartmentAccount) return [];
    
    const today = new Date();
    const weekStart = startOfWeek(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // 같은 부서 직원들 (부서 계정 제외)
    const deptStaff = Object.values(allUsers).filter(u => 
      u.department === currentUser.department && !u.isDepartmentAccount && !u.id.startsWith('dept_')
    );
    
    // 같은 부서 직원들의 이번 주 승인된 연차 신청
    const thisWeekLeaves = requests.filter(req => {
      const reqDate = parseLocalDate(req.startDate);
      return (
        deptStaff.some(staff => staff.id === req.userId) &&
        req.status === LeaveStatus.APPROVED &&
        reqDate >= weekStart &&
        reqDate <= weekEnd
      );
    });
    
    return thisWeekLeaves;
  };

  // 부서별 계정용: 같은 부서 직원들의 이번 주 토요 근무 신청 조회
  const getDepartmentThisWeekSaturday = () => {
    if (!isDepartmentAccount) return [];
    
    const today = new Date();
    const weekStart = startOfWeek(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // 같은 부서 직원들 (부서 계정 제외)
    const deptStaff = Object.values(allUsers).filter(u => 
      u.department === currentUser.department && !u.isDepartmentAccount && !u.id.startsWith('dept_')
    );
    
    // 같은 부서 직원들의 이번 주 승인된 토요근무 신청
    const thisWeekSaturday = saturdayShifts.filter(req => {
      const reqDate = parseLocalDate(req.date);
      return (
        deptStaff.some(staff => staff.id === req.userId) &&
        req.status === LeaveStatus.APPROVED &&
        reqDate >= weekStart &&
        reqDate <= weekEnd
      );
    });
    
    return thisWeekSaturday;
  };
  
  // 반려 이유 모달 상태
  const [rejectionModal, setRejectionModal] = useState<{ itemId: string; category: 'leave' | 'ot' | 'saturday' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // 수정 모달 상태
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editReason, setEditReason] = useState('');
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>(LeaveType.ANNUAL);
  const [isAdvance, setIsAdvance] = useState(false);
  const [advanceAgreed, setAdvanceAgreed] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  const [satMonth, setSatMonth] = useState(new Date());
  const [selectedSatDate, setSelectedSatDate] = useState<Date | null>(null);

  const [otDate, setOtDate] = useState(new Date());
  const [otHours, setOtHours] = useState('2');
  const [otReason, setOtReason] = useState('');

  const getKoreanHolidays = (year: number) => {
    const holidays: Record<string, string> = {
      [`${year}-01-01`]: '신정',
      [`${year}-03-01`]: '삼일절',
      [`${year}-05-01`]: '근로자의날',
      [`${year}-05-05`]: '어린이날',
      [`${year}-06-06`]: '현충일',
      [`${year}-08-15`]: '광복절',
      [`${year}-10-03`]: '개천절',
      [`${year}-10-09`]: '한글날',
      [`${year}-12-25`]: '성탄절',
    };

    const lunarMapping: Record<number, Record<string, string>> = {
      2024: { '02-09': '설날', '02-10': '설날', '02-11': '설날', '05-15': '부처님오신날', '09-16': '추석', '09-17': '추석', '09-18': '추석' },
      2025: { '01-28': '설날', '01-29': '설날', '01-30': '설날', '05-05': '부처님오신날', '10-05': '추석', '10-06': '추석', '10-07': '추석' },
      2026: { '02-16': '설날', '02-17': '설날', '02-18': '설날', '05-24': '부처님오신날', '09-24': '추석', '09-25': '추석', '09-26': '추석', '06-03': '지방선거' },
      2027: { '02-06': '설날', '02-07': '설날', '02-08': '설날', '05-13': '부처님오신날', '09-14': '추석', '09-15': '추석', '09-16': '추석', '03-03': '대통령선거' },
      2028: { '01-26': '설날', '01-27': '설날', '01-28': '설날', '05-02': '부처님오신날', '10-02': '추석', '10-03': '추석', '10-04': '추석', '04-12': '국회의원선거', '05-31': '지방선거' },
      2029: { '02-12': '설날', '02-13': '설날', '02-14': '설날', '05-20': '부처님오신날', '09-21': '추석', '09-22': '추석', '09-23': '추석' },
      2030: { '02-02': '설날', '02-03': '설날', '02-04': '설날', '05-09': '부처님오신날', '09-11': '추석', '09-12': '추석', '09-13': '추석', '06-05': '지방선거' },
      2031: { '01-22': '설날', '01-23': '설날', '01-24': '설날', '05-28': '부처님오신날', '09-30': '추석', '10-01': '추석', '10-02': '추석' },
      2032: { '02-10': '설날', '02-11': '설날', '02-12': '설날', '05-16': '부처님오신날', '09-18': '추석', '09-19': '추석', '09-20': '추석', '03-03': '대통령선거', '04-14': '국회의원선거', '06-02': '지방선거' },
      2033: { '01-30': '설날', '01-31': '설날', '02-01': '설날', '05-06': '부처님오신날', '09-07': '추석', '09-08': '추석', '09-09': '추석' },
      2034: { '02-18': '설날', '02-19': '설날', '02-20': '설날', '05-25': '부처님오신날', '09-26': '추석', '09-27': '추석', '09-28': '추석', '04-12': '국회의원선거', '05-31': '지방선거' },
      2035: { '02-07': '설날', '02-08': '설날', '02-09': '설날', '05-15': '부처님오신날', '09-15': '추석', '09-16': '추석', '09-17': '추석' },
    };

    if (lunarMapping[year]) {
      Object.entries(lunarMapping[year]).forEach(([date, name]) => {
        holidays[`${year}-${date}`] = name;
      });
    }

    if (year >= 2024 && (year - 2024) % 4 === 0) {
      let wedCount = 0;
      for (let i = 1; i <= 14; i++) {
        const d = new Date(year, 3, i);
        if (getDay(d) === 3) {
          wedCount++;
          if (wedCount === 2) { holidays[format(d, 'yyyy-MM-dd')] = '국회의원선거'; break; }
        }
      }
    }
    if (year >= 2022 && (year - 2022) % 5 === 0) {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(year, 2, i);
        if (getDay(d) === 3) { holidays[format(d, 'yyyy-MM-dd')] = '대통령선거'; break; }
      }
    }
    if (year >= 2022 && (year - 2022) % 4 === 0) {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(year, 5, i);
        if (getDay(d) === 3) { holidays[format(d, 'yyyy-MM-dd')] = '지방선거'; break; }
      }
    }

    const finalHolidays: Record<string, string> = { ...holidays };
    Object.keys(holidays).forEach(hDate => {
      const d = new Date(hDate);
      const day = getDay(d);
      const name = holidays[hDate];
      const isFlexibleHoliday = ['어린이날', '삼일절', '광복절', '개천절', '한글날', '성탄절', '부처님오신날', '설날', '추석'].some(n => name.includes(n));
      
      if (isFlexibleHoliday) {
        if (day === 0 || day === 6 || (name.includes('설날') && day === 0) || (name.includes('추석') && day === 0)) {
          let nextDay = addDays(d, 1);
          while (finalHolidays[format(nextDay, 'yyyy-MM-dd')] || getDay(nextDay) === 0) {
            nextDay = addDays(nextDay, 1);
          }
          finalHolidays[format(nextDay, 'yyyy-MM-dd')] = '대체공휴일';
        }
      }
    });

    return finalHolidays;
  };

  const isKoreanHoliday = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const holidays = getKoreanHolidays(date.getFullYear());
    const holidayName = holidays[dateStr];
    const isSun = getDay(date) === 0;
    return { isHoliday: !!holidayName || isSun, name: holidayName || "" };
  };

  const calculateHours = () => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startVal = sh * 60 + sm;
    const endVal = eh * 60 + em;
    if (endVal <= startVal) return 0;
    let totalMinutes = endVal - startVal;
    const lunchStart = 13 * 60; 
    const lunchEnd = 14 * 60;   
    if (startVal < lunchEnd && endVal > lunchStart) {
      const overlapStart = Math.max(startVal, lunchStart);
      const overlapEnd = Math.min(endVal, lunchEnd);
      totalMinutes -= (overlapEnd - overlapStart);
    }
    return Math.max(0, totalMinutes / 60);
  };

  const formatWorkHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return h > 0 ? `${h}시간 ${m > 0 ? m + '분' : ''}` : `${m}분`;
  };

  const getCalendarDays = (month: Date) => {
    const start = startOfMonth(month);
    const startDate = startOfWeek(start, { weekStartsOn: 0 });
    const end = endOfMonth(month);
    const endDate = addDays(startOfWeek(end, { weekStartsOn: 0 }), 6);
    return eachDayOfInterval({ start: startDate, end: endDate });
  };

  const daysInMonth = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);
  const satDaysInMonth = useMemo(() => getCalendarDays(satMonth), [satMonth]);

  const isPlanningManager = currentUser.department.includes('기획') && currentUser.isManager;
  const isGAManager = currentUser.department.includes('총무') && currentUser.isManager;

  const approvalQueue = useMemo(() => {
    const allPending = [
      ...requests.filter(r => r.status === LeaveStatus.PENDING).map(r => ({...r, category: 'leave' as const})),
      ...overtimeRequests.filter(r => r.status === LeaveStatus.PENDING).map(r => ({...r, category: 'ot' as const})),
      ...saturdayShifts.filter(r => r.status === LeaveStatus.PENDING).map(r => ({...r, category: 'saturday' as const}))
    ];
    return allPending.filter(item => {
      const step = item.currentStep;
      const requestUser = allUsers[item.userId];
      
      // 본인 신청서도 포함
      if (item.userId === currentUser.id) return true;
      
      // 결재 권한 체크 - 부서별로 처리
      if (step === LeaveStep.MANAGER_APPROVAL && currentUser.isManager) {
        // 팀장: 자신의 부서 직원만
        return requestUser && requestUser.department === currentUser.department;
      }
      if (step === LeaveStep.DEPT_HEAD_APPROVAL && currentUser.isDeptHead) {
        // 부장: 자신의 부서 직원만
        return requestUser && requestUser.department === currentUser.department;
      }
      if (step === LeaveStep.DIRECTOR_APPROVAL && currentUser.role === UserRole.DIRECTOR) return true;
      
      return false;
    });
  }, [requests, overtimeRequests, saturdayShifts, currentUser, isPlanningManager, isGAManager]);

  // 연차 열람 권한 확인
  const canViewRequest = (request: any) => {
    // 본인 요청이면 항상 볼 수 있음
    if (request.userId === currentUser.id) return true;
    
    const requestUser = allUsers[request.userId];
    
    // 승인권이 있으면 볼 수 있음 (부서별)
    const step = request.currentStep;
    if (step === LeaveStep.MANAGER_APPROVAL && currentUser.isManager && requestUser && requestUser.department === currentUser.department) return true;
    if (step === LeaveStep.DEPT_HEAD_APPROVAL && currentUser.isDeptHead && requestUser && requestUser.department === currentUser.department) return true;
    if (step === LeaveStep.DIRECTOR_APPROVAL && currentUser.role === UserRole.DIRECTOR) return true;
    
    // 참조권이 있으면 볼 수 있음 (PENDING 상태만, 모든 요청)
    // 기획팀장, 총무팀장 참조 가능
    if (request.status === LeaveStatus.PENDING && (isPlanningManager || isGAManager)) return true;
    
    return false;
  };

  // 한국 노동부 기준 연차 계산 함수 (정확한 개월 계산)
  const calculateLegalLeave = (joinDate: Date) => {
    const today = new Date();
    
    // 날짜만 비교 (시간 무시)
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const joinDateOnly = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
    
    // 정확한 개월 수 계산 (년-월 기준)
    let monthsOfService = 0;
    let tempDate = new Date(joinDateOnly);
    
    while (tempDate <= todayDate) {
      tempDate.setMonth(tempDate.getMonth() + 1);
      if (tempDate <= todayDate) {
        monthsOfService++;
      }
    }
    
    // 근속일수 계산 (로그용)
    const daysDifference = (todayDate.getTime() - joinDateOnly.getTime()) / (1000 * 60 * 60 * 24);
    const yearsOfService = daysDifference / 365.25;
    
    console.log(`calculateLegalLeave: joinDate=${joinDateOnly.toISOString()}, today=${todayDate.toISOString()}, yearsOfService=${yearsOfService}, monthsOfService=${monthsOfService}`);
    
    // 연차 규정:
    // - 1년 미만: 월차 (1개월당 1개, 최대 11개)
    // - 1년 이상 2년 미만: 15개 + 월차(추가 최대 11개) → 최대 26개
    // - 2년 이상 3년 미만: 15개 (고정)
    // - 3년 이상: 15개 + floor((yearsOfService - 1) / 2)
    //   단, 근속 5년 이상인 경우 연차 증가분은 최대 25일까지 제한
    
    let totalLeave = 0;
    
    if (yearsOfService < 1) {
      // 1년 미만: 월차
      totalLeave = Math.min(monthsOfService, 11);
    } else if (yearsOfService < 2) {
      // 1~2년차: 15일 고정 + 추가 월차
      const extraMonths = Math.max(0, monthsOfService - 12);
      totalLeave = 15 + Math.min(extraMonths, 11);
    } else if (yearsOfService < 3) {
      // 2~3년차: 15개 (월차는 2주년과 함께 소멸)
      totalLeave = 15;
    } else {
      // 3년 이상
      totalLeave = 15 + Math.floor((yearsOfService - 1) / 2);
      if (yearsOfService >= 5) {
        totalLeave = Math.min(totalLeave, 25);
      }
    }
    
    // 2017년 5월 30일 이전 입사자: 표시용 +1 적용
    // (회사 정책: 상한이 없어졌기 때문에 추가일도 그대로 더한다)
    const cutoffDate = new Date(2017, 4, 30); // 2017-05-30
    if (joinDateOnly < cutoffDate) {
      totalLeave += 1;
      console.log(`calculateLegalLeave: legacy +1 적용 => totalLeave=${totalLeave}`);
    }

    console.log(`calculateLegalLeave: yearsOfService=${yearsOfService}, monthsOfService=${monthsOfService}, totalLeave=${totalLeave}`);
    return totalLeave;
  };

  // 연차 계산 함수
  const calculateLeaveStats = useMemo(() => {
    console.log(`calculateLeaveStats: latestUser.joinDate = ${latestUser.joinDate}, type = ${typeof latestUser.joinDate}`);
    console.log(`calculateLeaveStats: leaveBalance = ${JSON.stringify(leaveBalance)}`);
    
    const myLeaves = requests.filter(r => r.userId === latestUser.id && r.status === LeaveStatus.APPROVED);
    const mySaturdays = saturdayShifts.filter(s => s.userId === latestUser.id && s.status === LeaveStatus.APPROVED);
    
    // 모든 연차를 시간 단위로 계산
    let totalUsedHours = 0;
    
    myLeaves.forEach(leave => {
      if (leave.type === LeaveType.TIME) {
        // 시간 연차: earnedHoursUsed 사용
        totalUsedHours += leave.earnedHoursUsed || 0;
      } else if (leave.type === LeaveType.HALF_AM || leave.type === LeaveType.HALF_PM) {
        // 반차: 4시간 차감
        totalUsedHours += 4;
      } else {
        // 일 단위 연차/병가: 8시간으로 계산
        if (leave.startDate && leave.endDate) {
          const days = Math.ceil((parseLocalDate(leave.endDate).getTime() - parseLocalDate(leave.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
          totalUsedHours += days * 8; // 1일 = 8시간
        }
      }
    });
    
    // 토요일 근무 시간 계산: latestUser의 saturday_work_dates 사용
    let saturdayHours = 0;
    if (latestUser.saturday_work_dates && latestUser.saturday_work_dates.length > 0) {
      // 각 토요근무 날짜마다 4시간으로 계산
      saturdayHours = latestUser.saturday_work_dates.length * 4;
    } else {
      // 혹은 saturdayShifts 테이블의 신청 항목도 함께 계산
      mySaturdays.forEach(sat => {
        saturdayHours += sat.hours || 0; // 4시간씩 추가
      });
    }
    
    // 법정 연차 계산
    const joinDate = latestUser.joinDate ? parseLocalDate(latestUser.joinDate) : new Date();
    const autoCalculatedDays = calculateLegalLeave(joinDate);
    
    // DB에서 법정 연차 정보 조회
    // leaveBalance.annualMinutes = 모든 활성 차수의 annual_minutes 합 (절대 변경 안됨)
    // leaveBalance.remainMinutes = 모든 활성 차수의 remain_minutes 합 (실제 남은 값)
    const dbAnnualMinutes = leaveBalance?.annualMinutes || (autoCalculatedDays * 480);
    const dbRemainMinutes = leaveBalance?.remainMinutes !== undefined ? leaveBalance.remainMinutes : (autoCalculatedDays * 480);
    const dbUsedMinutes = leaveBalance?.usedMinutes || 0;

    // 자동 계산된 법정 연차와 DB 저장된 법정 연차가 다를 수 있는데,
    // 증가 상한을 해제했기 때문에 UI에 보여주는 autoCalculatedDays도
    // 25 이상으로 늘어날 수 있음.    
    // 법정 연차는 DB 기준 사용 (일관성 유지)
    const totalEarnedDays = Math.floor(dbAnnualMinutes / 480);
    const totalEarnedHours = dbAnnualMinutes / 60;
    
    console.log(`[연차계산] 법정연차: DB 기준 ${totalEarnedDays}일 (자동계산: ${autoCalculatedDays}일)`);
    if (leaveBalance && leaveBalance.annualMinutes && leaveBalance.annualMinutes > 0) {
      console.log(`[연차계산] DB 법정연차: ${Math.floor(leaveBalance.annualMinutes/480)}일, 남은 연차: ${Math.floor(leaveBalance.remainMinutes/480)}일`);
    }

    
    // 전체 가용 연차 = 법정 연차 + 토요근무 인정
    const totalAvailableHours = totalEarnedHours + saturdayHours;
    
    // 토요근무 시간을 먼저 사용하고, 남으면 법정 연차에서 사용
    const usedFromSaturday = Math.min(saturdayHours, totalUsedHours);
    const usedFromEarned = Math.max(0, totalUsedHours - saturdayHours);
    
    // 계산값 기본 설정 (DB 값이 없을 때 사용)
    const remainingEarnedHours_calc = Math.max(0, totalEarnedHours - usedFromEarned);
    const remainingHours_calc = Math.max(0, totalAvailableHours - totalUsedHours);
    
    // **관리자 조정 반영**: DB 값을 우선 사용하여 일관성 유지
    let finalRemainingMinutes = remainingHours_calc * 60;  // 분 단위 (총 남은 연차: 법정+토요)
    let finalRemainingEarnedMinutes = remainingEarnedHours_calc * 60;  // 분 단위 (법정 연차만, 계산값)
    let finalUsedMinutes = totalUsedHours * 60;       // 분 단위 (사용한 연차, 계산값)
    let finalTotalAvailableMinutes = totalAvailableHours * 60;
    
    if (leaveBalance && leaveBalance.remainMinutes !== undefined) {
      // DB의 값을 사용: 정확하고 관리자 조정이 반영된 최신값
      finalRemainingEarnedMinutes = leaveBalance.remainMinutes;  // 남은 법정 연차 (분 단위, DB)
      finalUsedMinutes = leaveBalance.usedMinutes;  // 사용한 연차 (분 단위, DB)
      // 총 남은 = 법정 남은 + 토요근무 인정 시간
      finalRemainingMinutes = leaveBalance.remainMinutes + (saturdayHours * 60);  // 분 단위
      finalTotalAvailableMinutes = leaveBalance.annualMinutes + (saturdayHours * 60);  // 분 단위
      console.log(`[연차계산] DB 값 사용 - 법정연차: ${Math.floor(leaveBalance.annualMinutes/480)}일, 남은 법정연차: ${Math.floor(leaveBalance.remainMinutes/480)}일, 사용: ${Math.floor(leaveBalance.usedMinutes/480)}일, 토요: ${saturdayHours}시간`);
    } else {
      console.log(`[연차계산] 계산값 사용 - 법정연차: ${Math.floor(dbAnnualMinutes/480)}일, 남은 법정연차: ${Math.floor(finalRemainingEarnedMinutes/480)}일, 사용: ${Math.floor(finalUsedMinutes/480)}일`);
    }
    
    return {
      totalUsedHours: finalUsedMinutes / 60,           // 분을 시간으로
      saturdayHours,
      usedFromSaturday,
      usedFromEarned,
      earnedLeave: totalEarnedDays,
      usedHours: finalUsedMinutes / 60,               // 분을 시간으로
      totalAvailableHours: finalTotalAvailableMinutes / 60,
      remainingHours: finalRemainingMinutes,          // 분 단위로 유지 (법정+토요)
      remainingEarnedHours: finalRemainingEarnedMinutes,  // 법정 연차만
      remainingDays: Math.floor(finalRemainingMinutes / 480)  // 480분 = 1일
    };
  }, [requests, saturdayShifts, latestUser, leaveBalance]);

  // 토요근무 통계
  const saturdayStats = useMemo(() => {
    const mySaturdays = saturdayShifts.filter(s => s.userId === currentUser.id && s.status === LeaveStatus.APPROVED);
    const totalHours = mySaturdays.reduce((sum, sat) => sum + (sat.hours || 0), 0);
    const totalDays = mySaturdays.length;
    return { totalHours, totalDays };
  }, [saturdayShifts, currentUser]);

  const renderDocumentModal = () => {
    if (!selectedDoc) return null;
    const user = allUsers[selectedDoc.userId];
    const isApproved = selectedDoc.status === LeaveStatus.APPROVED;
    const isAdvanceDoc = selectedDoc.isAdvance;
    let title = "연차 신청서";
    if (selectedDoc.type === LeaveType.SICK) title = "병가 신청서";
    else if (selectedDoc.type === LeaveType.TIME) title = "시간연차 신청서";
    else if (selectedDoc.category === 'ot' || overtimeRequests.find(o => o.id === selectedDoc.id)) title = "연장근무 신청서";
    else if (selectedDoc.category === 'saturday' || saturdayShifts.find(s => s.id === selectedDoc.id)) title = "토요근무 신청서";
    
    // 신청자 직급에 따른 결재 라인 결정
    let signBoxes: string[] = [];
    const userJobTitle = user?.jobTitle || '';
    const isDept = user?.isDeptHead;
    const isManager = user?.isManager;
    
    // 부서의 부장 존재 여부 확인
    const deptHead = Object.values(allUsers).find(u => u.department === user?.department && u.isDeptHead);
    const hasDeptHead = !!deptHead;
    
    // 신청자 직급 분석
    const isDirector = userJobTitle.includes('이사') || userJobTitle.includes('원장');
    const isDeptHead = isDept || userJobTitle.includes('부장');
    const isTeamLead = isManager || userJobTitle.includes('팀장');
    
    if (isDirector) {
      // 이사가 신청: 바로 최종 (결재 불필요)
      signBoxes = [];
    } else if (isDeptHead) {
      // 부장이 신청: 행정부장 → 관리이사 → 병원장
      signBoxes = ['행정부장', '관리이사', '병원장'];
    } else if (isTeamLead) {
      // 팀장이 신청: [부서장] 유무에 따라 → 행정부장 → 관리이사 → 병원장
      if (isAdvanceDoc) {
        signBoxes = [];
        if (hasDeptHead) signBoxes.push('부서장');
        signBoxes.push('행정부장', '관리이사', '병원장');
      } else {
        signBoxes = [];
        if (hasDeptHead) signBoxes.push('부서장');
        signBoxes.push('행정부장', '관리이사', '병원장');
      }
    } else {
      // 일반 직원: [부서장] → 행정부장 → 관리이사 → 병원장
      if (isAdvanceDoc) {
        signBoxes = [];
        if (hasDeptHead) signBoxes.push('부서장');
        signBoxes.push('행정부장', '관리이사', '병원장');
      } else {
        signBoxes = [];
        if (hasDeptHead) signBoxes.push('부서장');
        signBoxes.push('행정부장', '관리이사', '병원장');
      }
    }
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-3xl rounded-sm shadow-2xl flex flex-col max-h-[95%] overflow-hidden border border-slate-300">
          <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center gap-4 flex-wrap no-print">
            <span className="text-sm font-bold text-slate-600 flex items-center gap-2 flex-1 min-w-fit"><FileText className="w-4 h-4" /> 전자결재 공식 서류</span>
            <div className="flex gap-2 flex-shrink-0">
               <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold hover:bg-slate-50 transition-colors"><Printer className="w-4 h-4" /> 인쇄</button>
               <button onClick={() => setSelectedDoc(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-12 bg-white font-serif text-black printable-area">
             <div className="border-[2px] border-black p-8 relative min-h-[850px] flex flex-col">
                <div className="absolute top-8 right-8 flex border-collapse">
                   {signBoxes.map((pos, idx) => {
                      // 각 결재 위치의 담당자 찾기
                      let approverName = '';
                      if (pos === '부서장') {
                        const deptHead = Object.values(allUsers).find(u => u.department === user?.department && u.isDeptHead);
                        approverName = deptHead?.name || pos;
                      } else if (pos === '행정부장') {
                        const admin = Object.values(allUsers).find(u => u.jobTitle?.includes('행정부장'));
                        approverName = admin?.name || pos;
                      } else if (pos === '관리이사') {
                        const director = Object.values(allUsers).find(u => u.jobTitle?.includes('관리이사'));
                        approverName = director?.name || pos;
                      } else if (pos === '병원장') {
                        const president = Object.values(allUsers).find(u => u.role === UserRole.HOSPITAL_PRESIDENT || u.role === UserRole.MEDICAL_DIRECTOR);
                        approverName = president?.name || pos;
                      } else {
                        approverName = pos;
                      }
                      
                      return (
                        <div key={pos} className="border border-black w-20 text-center">
                           <div className="text-[10px] bg-slate-50 border-b border-black py-1 font-sans">{pos}</div>
                           <div className="h-16 flex items-center justify-center relative">
                              {isApproved && (
                                 <div className="w-12 h-12 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 text-[9px] font-bold rotate-12 font-sans text-center leading-tight">
                                    {approverName.length > 6 ? approverName.substring(0, 3) : approverName}
                                 </div>
                              )}
                           </div>
                        </div>
                      );
                   })}
                </div>
                <h1 className="text-4xl font-black text-center underline underline-offset-[12px] mb-20 mt-32 tracking-[0.5em]">{isAdvanceDoc ? '당겨쓰기 ' : ''}{title}</h1>
                <table className="w-full border-collapse border border-black mb-8 text-sm font-sans">
                   <tbody>
                      <tr>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">문서번호</td>
                         <td className="border border-black p-3" colSpan={3}>JDH-{selectedDoc.id.toUpperCase()}</td>
                      </tr>
                      <tr>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">성 명</td>
                         <td className="border border-black p-3 w-40">{user?.name}</td>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">사 번</td>
                         <td className="border border-black p-3">{user?.id}</td>
                      </tr>
                      <tr>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">부 서</td>
                         <td className="border border-black p-3">{user?.department}</td>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">직 위</td>
                         <td className="border border-black p-3">{user?.jobTitle?.replace(/[0]+$/, '')}</td>
                      </tr>
                      <tr>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">신청일시</td>
                         <td className="border border-black p-3" colSpan={3}>
                            <span className="font-bold">{formatDateKST(selectedDoc.startDate || selectedDoc.date)}</span> 
                            {selectedDoc.startTime ? ` [${selectedDoc.startTime} ~ ${selectedDoc.endTime}]` : ''}
                            {selectedDoc.earnedHoursUsed ? ` (사용: ${Math.floor(selectedDoc.earnedHoursUsed)}시간 ${Math.round((selectedDoc.earnedHoursUsed % 1) * 60)}분)` : selectedDoc.hours ? ` (총 ${formatWorkHours(selectedDoc.hours)})` : ''}
                         </td>
                      </tr>
                      <tr>
                         <td className="border border-black bg-slate-50 p-3 w-28 font-bold text-center">사 유</td>
                         <td className="border border-black p-3 h-60 align-top leading-relaxed" colSpan={3}>
                            {selectedDoc.reason || '병원 내부 규정에 따른 성실한 근태 신청'}
                         </td>
                      </tr>
                   </tbody>
                </table>
                <div className="flex-1 flex flex-col justify-end font-sans">
                    <p className="text-center text-lg mb-12">위와 같이 <span className="font-bold">{title.replace(" 신청서", "")}</span>을(를) 신청하오니 승인하여 주시기 바랍니다.</p>
                    <div className="flex justify-end px-4 mb-10">
                        <div className="text-right">
                           <p className="text-xl font-bold mb-2">{formatDateKST(selectedDoc.createdAt || new Date())}</p>
                           <p className="text-2xl font-bold">신청인: <span className="underline decoration-dotted underline-offset-4">{user?.name}</span> (인)</p>
                        </div>
                    </div>
                    <div className="border-t-[3px] border-black pt-8 text-center text-3xl font-black tracking-widest mb-4">정 동 병 원</div>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 ring-1 ring-slate-200/50">
      {isDepartmentAccount ? (
        // 부서별 계정: 근태 현황만 표시
        <>
          <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white z-10">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">📅 {currentUser.department} 연차/토요근무 현황</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
            <div className="max-w-6xl mx-auto">
              <p className="text-sm text-slate-500 mb-6">이번 주 연차 및 토요근무 일정</p>
              
              {(() => {
                const thisWeekLeaves = getDepartmentThisWeekLeaves();
                const thisWeekSaturday = getDepartmentThisWeekSaturday();
                const staffByDept = Object.values(allUsers).filter(u => 
                  u.department === currentUser.department && !u.isDepartmentAccount && !u.id.startsWith('dept_')
                );
                
                // 직원별로 연차를 그룹화
                const leavesByUser = new Map<string, LeaveRequest[]>();
                const saturdayByUser = new Map<string, SaturdayShiftRequest[]>();
                
                staffByDept.forEach(staff => {
                  leavesByUser.set(staff.id, thisWeekLeaves.filter(l => l.userId === staff.id));
                  saturdayByUser.set(staff.id, thisWeekSaturday.filter(s => s.userId === staff.id));
                });
                
                return (
                  <div className="space-y-6">
                    {staffByDept.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <p>같은 부서 직원이 없습니다.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {staffByDept.map(staff => {
                          const staffLeaves = leavesByUser.get(staff.id) || [];
                          const staffSaturday = saturdayByUser.get(staff.id) || [];
                          const hasSchedule = staffLeaves.length > 0 || staffSaturday.length > 0;
                          
                          return (
                            <div key={staff.id} className={`p-4 rounded-lg border-2 transition-all ${
                              hasSchedule 
                                ? 'bg-amber-50 border-amber-200' 
                                : 'bg-slate-50 border-slate-200'
                            }`}>
                              <div className="flex items-center gap-3 mb-4">
                                <img src={normalizeProfileImageUrl(staff.avatar)} alt="" className="w-10 h-10 rounded-full" />
                                <div>
                                  <p className="font-bold text-slate-800">{staff.name}</p>
                                  <p className="text-xs text-slate-500">{staff.jobTitle}</p>
                                </div>
                              </div>
                              
                              <div className="space-y-3">
                                {staffLeaves.length > 0 ? (
                                  <div className="space-y-2">
                                    {staffLeaves.map(leave => (
                                      <div key={leave.id} className="text-sm p-2 bg-white rounded border border-amber-100">
                                        <p className="font-semibold text-amber-700">{leave.type}</p>
                                        <p className="text-xs text-slate-600">
                                          {format(parseLocalDate(leave.startDate), 'M월 d일')}
                                          {leave.endDate && leave.startDate !== leave.endDate && 
                                            ` ~ ${format(parseLocalDate(leave.endDate), 'M월 d일')}`
                                          }
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500">연차 없음</p>
                                )}
                                
                                {staffSaturday.length > 0 ? (
                                  <div className="space-y-2">
                                    {staffSaturday.map(sat => (
                                      <div key={sat.id} className="text-sm p-2 bg-white rounded border border-blue-100">
                                        <p className="font-semibold text-blue-700">토요근무</p>
                                        <p className="text-xs text-slate-600">
                                          {format(parseLocalDate(sat.date), 'M월 d일')}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500">토요근무 없음</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p><span className="font-bold">📌 안내:</span> 이번 주 승인된 연차와 토요근무만 표시됩니다.</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {renderDocumentModal()}
          
          {/* 반려 이유 모달 */}
          {rejectionModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-slate-800">반려 사유</h3>
                  <button onClick={() => { setRejectionModal(null); setRejectionReason(''); }} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-600">반려 사유를 작성해주세요.</p>
                  <textarea
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="예: 이미 휴가가 많습니다. 다른 일정으로 부탁합니다."
                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none resize-none h-32"
                  />
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => { setRejectionModal(null); setRejectionReason(''); }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        if (rejectionReason.trim() && rejectionModal) {
                          onApproveReject(rejectionModal.itemId, LeaveStatus.REJECTED, rejectionModal.category, rejectionReason);
                          setRejectionModal(null);
                          setRejectionReason('');
                        }
                      }}
                      disabled={!rejectionReason.trim()}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold disabled:opacity-50 hover:bg-red-700"
                    >
                      반려
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 수정 모달 */}
          {editingRequest && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-slate-800">{editingRequest.type || '신청'} 수정</h3>
                  <button onClick={() => { setEditingRequest(null); setEditDate(null); setEditReason(''); }} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">날짜 변경</label>
                    <input
                      type="date"
                      value={editDate ? format(editDate, 'yyyy-MM-dd') : ''}
                      onChange={e => {
                        if (e.target.value) {
                          // "yyyy-MM-dd" 형식을 로컬 자정으로 변환
                          const [year, month, day] = e.target.value.split('-').map(Number);
                          setEditDate(new Date(year, month - 1, day));
                        } else {
                          setEditDate(null);
                        }
                      }}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  {editingRequest.reason !== undefined && (
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-2 block">사유</label>
                      <textarea
                        value={editReason}
                        onChange={e => setEditReason(e.target.value)}
                        placeholder="변경할 사유를 입력하세요"
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none h-28"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => { setEditingRequest(null); setEditDate(null); setEditReason(''); }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        if (editDate && editingRequest) {
                          // 날짜를 YYYY-MM-DD 문자열로 변환하여 전송 (타임존 문제 해결)
                          const editDateStr = format(editDate, 'yyyy-MM-dd');
                          // 기존 요청 객체를 유지하면서 필드만 업데이트
                          const updatedRequest = {
                            ...editingRequest,
                            // 날짜 필드 업데이트 (startDate 또는 date 중 해당하는 것)
                            ...(editingRequest.startDate !== undefined && { startDate: editDateStr }),
                            ...(editingRequest.date !== undefined && { date: editDateStr }),
                            // 사유 필드 업데이트 (reason이 있으면)
                            ...(editingRequest.reason !== undefined && { reason: editReason }),
                          };
                          onRequestCreate(updatedRequest);
                          setEditingRequest(null);
                          setEditDate(null);
                          setEditReason('');
                        }
                      }}
                      disabled={!editDate}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50 hover:bg-blue-700"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white z-10">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">정동병원 근태 관리 시스템</h2>
            <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
               {['summary', 'leave', 'ot', 'saturday', 'approval', 'logs'].map((tab) => {
                 // 병원장/원장: 토요근무만 표시, 연차/병가/연장근무 숨김
                 const isHospitalPresident = currentUser.role === UserRole.HOSPITAL_PRESIDENT || currentUser.role === UserRole.MEDICAL_DIRECTOR;
                 const isHiddenForPresident = isHospitalPresident && ['summary', 'leave', 'ot'].includes(tab);
                 
                 if (isHiddenForPresident) return null;
                 
                 return (
                   (tab !== 'approval' || (currentUser.isManager || currentUser.isDeptHead || currentUser.role === UserRole.DIRECTOR || isPlanningManager || isGAManager)) && (
                     <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>
                       {tab === 'summary' ? '잔여 현황' : tab === 'leave' ? '연차/병가 신청' : tab === 'ot' ? '연장근무' : tab === 'saturday' ? '토요근무' : tab === 'approval' ? '결재/참조함' : '전체기록'}
                       {tab === 'approval' && approvalQueue.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 rounded-full">{approvalQueue.length}</span>}
                     </button>
                   )
                 );
               })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
        {activeTab === 'summary' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <h3 className="text-2xl font-bold text-slate-800 mb-6">잔여 연차 현황</h3>
            
            {/* 잔여 연차 현황 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 남은 법정 연차 */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-2xl border-2 border-blue-200 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-bold text-blue-700 uppercase tracking-wider">남은 법정 연차</span>
                  <CalendarIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-black text-blue-900">
                      {(() => {
                        const { days, hours, mins } = formatMinutesToDaysHoursMins(calculateLeaveStats.remainingEarnedHours);
                        return `${days}일`;
                      })()}
                    </div>
                    <div className="text-3xl text-blue-700">
                      {(() => {
                        const { days, hours, mins } = formatMinutesToDaysHoursMins(calculateLeaveStats.remainingEarnedHours);
                        return `${hours}시간 ${mins}분`;
                      })()}
                    </div>
                  </div>
                  <div className="text-sm text-blue-600 font-medium">
                    {(() => {
                      const totalHours = calculateLeaveStats.remainingEarnedHours / 60;
                      return `전체 ${Math.floor(totalHours)}시간`;
                    })()}
                  </div>
                </div>
              </div>

              {/*토요일 근무로 인해 발행된 시간 */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-2xl border-2 border-green-200 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-bold text-green-700 uppercase tracking-wider">토요 근무 공제분</span>
                  <Sun className="w-6 h-6 text-green-600" />
                </div>
                <div className="space-y-3">
                  <div className="text-5xl font-black text-green-900">
                    {formatHours(calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday)}
                  </div>
                </div>
              </div>
            </div>

            {/* 합계 카드 */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-8 rounded-2xl border-2 border-purple-200 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-bold text-purple-700 uppercase tracking-wider">전체 잔여 시간</span>
                <CheckCircle className="w-6 h-6 text-purple-600" />
              </div>
              <div className="space-y-3">
                <div className="text-5xl font-black text-purple-900">
                  {(() => {
                    const remainingSaturdayMinutes = (calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday) * 60;
                    const totalRemainMinutes = calculateLeaveStats.remainingEarnedHours + remainingSaturdayMinutes;
                    const { days, hours, mins } = formatMinutesToDaysHoursMins(totalRemainMinutes);
                    return `${days}일 ${hours}시간 ${mins}분`;
                  })()}
                </div>
                <div className="flex gap-4 text-sm text-purple-600 font-medium">
                  <div>
                    법정: {(() => {
                      const { days, hours, mins } = formatMinutesToDaysHoursMins(calculateLeaveStats.remainingEarnedHours);
                      return `${days}일 ${hours}시간 ${mins}분`;
                    })()}
                  </div>
                  <div>+</div>
                  <div>
                    토요: {(() => {
                      const remainingSaturdayMinutes = (calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday) * 60;
                      const { hours, mins } = formatMinutesToDaysHoursMins(remainingSaturdayMinutes);
                      return `${hours}시간 ${mins}분`;
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* 토요 근무 날짜 목록 */}
            {latestUser.saturday_work_dates && latestUser.saturday_work_dates.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Sun className="w-5 h-5 text-amber-500" />
                  토요일 근무 일정 현황 ({latestUser.saturday_work_dates.length}일)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {(latestUser.saturday_work_dates as string[]).map(date => {
                    const [year, month, day] = date.split('-').map(Number);
                    const displayDate = new Date(year, month - 1, day).toLocaleDateString('ko-KR', { weekday: 'long', month: 'short', day: 'numeric' });
                    return (
                      <div key={date} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <div className="font-bold text-amber-900">{displayDate}</div>
                        <div className="text-xs text-amber-600 mt-1">4시간</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 연차 소멸 예정 알림 */}
            {leaveBalance?.expiringTranches && leaveBalance.expiringTranches.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h4 className="font-bold text-red-800 mb-3 text-lg">
                      ⚠️ 소멸 예정 연차가 있습니다!
                    </h4>
                    <div className="space-y-2">
                      {leaveBalance.expiringTranches.map((tranche: any, idx: number) => {
                        const days = Math.floor(tranche.remain_minutes / 480);
                        const hours = Math.floor((tranche.remain_minutes % 480) / 60);
                        const mins = tranche.remain_minutes % 60;
                        return (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-red-200">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-semibold text-red-700">
                                차수 {tranche.tranche_number}: {days}일 {hours}시간 {mins}분
                              </div>
                              <div className="text-sm font-bold text-red-600">
                                D-{tranche.days_until_expiration}
                              </div>
                            </div>
                            <div className="text-sm text-slate-600">
                              소멸예정: {new Date(tranche.expiration_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-sm text-red-700 mt-4 font-semibold">
                      💡 팁: 소멸되기 전에 연차를 사용하세요!
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'leave' && (
           <div className="max-w-5xl mx-auto space-y-6">
              {/* 연차 통계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">법정 연차</span>
                    <CalendarIcon className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="text-3xl font-black text-slate-900 mb-1">
                    {calculateLeaveStats.earnedLeave}일
                  </div>
                  <div className="text-xs text-slate-700">
                    <div>+{formatHours(calculateLeaveStats.earnedLeave * 8)}</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-green-700 uppercase tracking-wider">토요 근무 인정시간</span>
                    <Sun className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-3xl font-black text-green-900 mb-1">
                    +{formatHours(calculateLeaveStats.saturdayHours)}
                  </div>
                  <div className="text-xs text-green-700">
                    <div>({saturdayStats.totalDays}회)</div>
                    {/* 토요근무 날짜 표시 */}
                    {latestUser.saturday_work_dates && latestUser.saturday_work_dates.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-green-200 space-y-1 flex flex-wrap gap-1">
                        {(latestUser.saturday_work_dates as string[]).map(date => {
                          // 타임존 문제 해결: YYYY-MM-DD 형식을 직접 파싱
                          const [year, month, day] = date.split('-').map(Number);
                          const displayDate = new Date(year, month - 1, day).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
                          return (
                            <div key={date} className="text-[10px] font-bold text-green-600 bg-green-200/40 px-2 py-0.5 rounded">
                              {displayDate} (4h)
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">사용한 연차</span>
                    <CheckCircle className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="text-3xl font-black text-orange-900 mb-1">
                    -{formatHours(calculateLeaveStats.usedHours)}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border border-blue-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">남은 연차</span>
                    <CalendarIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-blue-900 mb-1 break-words">
                    {(() => {
                      const remainingSaturdayMinutes = (calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday) * 60;
                      const totalRemainMinutes = calculateLeaveStats.remainingEarnedHours + remainingSaturdayMinutes;
                      const { days, hours, mins } = formatMinutesToDaysHoursMins(totalRemainMinutes);
                      return `${days}일 ${hours}시간 ${mins}분`;
                    })()}
                  </div>
                  <div className="text-xs text-blue-700 space-y-1">
                    <div>({(() => {
                      const { days: earnedDays, hours: earnedHours, mins: earnedMins } = formatMinutesToDaysHoursMins(calculateLeaveStats.remainingEarnedHours);
                      const remainingSaturdayMinutes = (calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday) * 60;
                      const { hours: satHours, mins: satMins } = formatMinutesToDaysHoursMins(remainingSaturdayMinutes);
                      return `법정 ${earnedDays}일 ${earnedHours}시간 ${earnedMins}분 + 토요 ${satHours}시간 ${satMins}분`;
                    })()})</div>
                  </div>
                </div>
              </div>

              {/* 전체 잔여 현황 카드 */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl border-2 border-purple-200 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-purple-700 flex items-center gap-2 uppercase tracking-wider">
                    <CheckCircle className="w-5 h-5" />
                    전체 잔여 현황
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 남은 법정 연차 */}
                  <div className="bg-white rounded-lg p-4 border border-purple-100">
                    <div className="text-sm font-medium text-purple-600 mb-2">남은 법정 연차</div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-2xl font-black text-purple-900">
                        {(() => {
                          const { days, hours, mins } = formatMinutesToDaysHoursMins(calculateLeaveStats.remainingEarnedHours);
                          return `${days}일`;
                        })()}
                      </div>
                      <div className="text-2xl text-purple-600">
                        {(() => {
                          const { days, hours, mins } = formatMinutesToDaysHoursMins(calculateLeaveStats.remainingEarnedHours);
                          return `${hours}시간 ${mins}분`;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* 토요일 근무로 인해 발생된 시간 */}
                  <div className="bg-white rounded-lg p-4 border border-purple-100">
                    <div className="text-sm font-medium text-purple-600 mb-2">토요 근무 공제분</div>
                    <div className="text-2xl font-black text-purple-900">
                      {(() => {
                        const remainingSaturday = calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday;
                        const { hours, mins } = formatMinutesToDaysHoursMins(remainingSaturday * 60);
                        return `${hours}시간 ${mins}분`;
                      })()}
                    </div>
                  </div>

                  {/* 합계 */}
                  <div className="bg-gradient-to-br from-purple-100 to-purple-50 rounded-lg p-4 border-2 border-purple-300">
                    <div className="text-sm font-bold text-purple-700 mb-2">합계</div>
                    <div className="text-2xl font-black text-purple-900">
                      {(() => {
                        const remainingSaturdayMinutes = (calculateLeaveStats.saturdayHours - calculateLeaveStats.usedFromSaturday) * 60;
                        const totalRemainMinutes = calculateLeaveStats.remainingEarnedHours + remainingSaturdayMinutes;
                        const { days, hours, mins } = formatMinutesToDaysHoursMins(totalRemainMinutes);
                        return `${days}일 ${hours}시간 ${mins}분`;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                 <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-200/50">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">{format(currentMonth, 'yyyy년 MM월')}</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronRight className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center">
                        {['일','월','화','수','목','금','토'].map((d, i) => (
                           <div key={d} className={`text-[10px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
                        ))}
                        {daysInMonth.map((date) => {
                            const isStartSelected = selectedStartDate && isSameDay(date, selectedStartDate);
                            const isEndSelected = selectedEndDate && isSameDay(date, selectedEndDate);
                            const isInRange = selectedStartDate && selectedEndDate && 
                              date >= selectedStartDate && date <= selectedEndDate;
                            const isCurr = isSameMonth(date, currentMonth);
                            const holiday = isKoreanHoliday(date);
                            const isTday = isToday(date);
                            let textColor = 'text-slate-900';
                            if (holiday.isHoliday) textColor = 'text-red-500';
                            else if (getDay(date) === 6) textColor = 'text-blue-500';

                            // 연차 신청 시 빨간 날(공휴일/일요일)은 선택 불가
                            const isSelectable = isCurr && !holiday.isHoliday;

                            const handleDateClick = () => {
                              if (!isSelectable) return;
                              
                              // 로컬 자정으로 Date 객체 생성 (타임존 문제 해결)
                              const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                              
                              // 시작일 미설정 또는 종료일짜가 이미 설정되어있으면 새로 시작
                              if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
                                setSelectedStartDate(localDate);
                                setSelectedEndDate(null);
                              } else if (localDate < selectedStartDate) {
                                // 선택한 날짜가 시작일보다 이전이면 시작일로 변경
                                setSelectedStartDate(localDate);
                                setSelectedEndDate(null);
                              } else {
                                // 종료일 설정
                                setSelectedEndDate(localDate);
                              }
                            };

                            return (
                                <button 
                                    key={date.toString()} 
                                    disabled={!isSelectable} 
                                    onClick={handleDateClick}
                                    className={`aspect-square flex flex-col items-center justify-center rounded-2xl text-sm transition-all relative
                                        ${isStartSelected || isEndSelected ? 'bg-blue-600 text-white shadow-lg' : isInRange ? 'bg-blue-300 text-white' : isCurr ? 'bg-blue-50 hover:bg-blue-600 hover:text-white ' + textColor : 'text-slate-300'}
                                        ${!isSelectable && isCurr ? 'opacity-40 cursor-not-allowed hover:bg-blue-50 hover:text-inherit' : ''}`}>
                                    <span className={`font-bold z-10 ${isTday && !isStartSelected && !isEndSelected ? 'text-blue-700 underline underline-offset-2' : ''}`}>{format(date, 'd')}</span>
                                    {holiday.name && isCurr && <span className="absolute bottom-1 text-[8px] font-bold truncate max-w-full px-1 leading-tight text-red-500">{holiday.name}</span>}
                                </button>
                            );
                        })}
                    </div>
                 </div>
                 <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-200/50">
                    <form onSubmit={async (e) => { 
                      e.preventDefault(); 
                      if(selectedStartDate && reason) { 
                        try {
                          const endDate = selectedEndDate || selectedStartDate;
                          const daysCount = Math.ceil((endDate.getTime() - selectedStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                          
                          // 시간 연차인 경우 시간 계산
                          let earnedHours = 0;
                          if (leaveType === LeaveType.TIME) {
                            const [startH, startM] = startTime.split(':').map(Number);
                            const [endH, endM] = endTime.split(':').map(Number);
                            const startMinutes = startH * 60 + startM;
                            const endMinutes = endH * 60 + endM;
                            earnedHours = (endMinutes - startMinutes) / 60; // 시간 단위로 변환
                          } else if (leaveType === LeaveType.HALF_AM || leaveType === LeaveType.HALF_PM) {
                            // 반차는 4시간으로 계산
                            earnedHours = 4;
                          } else {
                            // 일 단위 연차는 해당 일 수 * 8시간으로 계산
                            earnedHours = daysCount * 8;
                          }
                          
                          // 날짜를 YYYY-MM-DD 문자열로 변환하여 전송 (타임존 문제 해결)
                          const startDateStr = format(selectedStartDate, 'yyyy-MM-dd');
                          const endDateStr = format(endDate, 'yyyy-MM-dd');
                          
                          await onRequestCreate({ 
                            type: leaveType, 
                            isAdvance, 
                            startDate: startDateStr as any, 
                            endDate: endDateStr as any, 
                            isAllDay: leaveType !== LeaveType.TIME, 
                            startTime: leaveType === LeaveType.TIME ? startTime : undefined, 
                            endTime: leaveType === LeaveType.TIME ? endTime : undefined, 
                            reason, 
                            status: LeaveStatus.PENDING, 
                            daysDeducted: daysCount,
                            earnedHoursUsed: earnedHours
                          });
                          setSelectedStartDate(null);
                          setSelectedEndDate(null);
                          setReason(''); 
                          setIsAdvance(false);
                          setAdvanceAgreed(false); 
                        } catch (error) {
                          console.error('신청 실패:', error);
                        }
                      } 
                    }} className="space-y-6">
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Sun className="w-6 h-6 text-amber-500" /> 연차 신청 상세</h3>
                        <div className="space-y-4">
                           <div>
                              <label className="text-xs font-bold text-slate-500 mb-2 block">신청 유형</label>
                              <select value={leaveType} onChange={e => setLeaveType(e.target.value as LeaveType)} className="w-full p-4 border rounded-2xl bg-slate-50 font-bold border-slate-200">
                                  {Object.values(LeaveType).map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                           </div>
                           <label className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 cursor-pointer group hover:bg-blue-100 transition-colors">
                              <input type="checkbox" checked={isAdvance} onChange={e => { setIsAdvance(e.target.checked); if (!e.target.checked) setAdvanceAgreed(false); }} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              <div className="flex-1">
                                 <p className="text-sm font-bold text-blue-700">당겨쓰기 (연차 선사용)</p>
                                 <p className="text-[10px] text-blue-500">발생 예정 연차를 미리 사용합니다. (기획팀장 승인 단계 추가)</p>
                              </div>
                           </label>
                           {isAdvance && (
                              <label className="flex items-center gap-3 p-4 bg-red-50/50 rounded-2xl border border-red-100 cursor-pointer group hover:bg-red-100 transition-colors animate-in slide-in-from-top-2">
                                 <input type="checkbox" checked={advanceAgreed} onChange={e => setAdvanceAgreed(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                                 <div className="flex-1">
                                    <p className="text-sm font-bold text-red-700">급여에서 차감될 수 있습니다</p>
                                    <p className="text-[10px] text-red-500">당겨쓰기한 연차는 회사의 판단에 따라 급여에서 차감될 수 있으므로 이에 동의합니다.</p>
                                 </div>
                              </label>
                           )}
                        </div>
                        {leaveType === LeaveType.TIME && (
                           <div className="space-y-3 animate-in slide-in-from-top-2">
                              <div className="grid grid-cols-2 gap-4">
                                 <div><label className="text-xs font-bold text-slate-500 mb-2 block">시작</label><select value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold">{Array.from({length: 25}, (_, i) => 8 + i*0.5).map(h => { const time = `${Math.floor(h).toString().padStart(2, '0')}:${h % 1 === 0 ? '00' : '30'}`; return <option key={time} value={time}>{time}</option>; })}</select></div>
                                 <div><label className="text-xs font-bold text-slate-500 mb-2 block">종료</label><select value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold">{Array.from({length: 25}, (_, i) => 8.5 + i*0.5).map(h => { const time = `${Math.floor(h).toString().padStart(2, '0')}:${h % 1 === 0 ? '00' : '30'}`; return <option key={time} value={time}>{time}</option>; })}</select></div>
                              </div>
                              <div className="bg-blue-50 p-3 rounded-xl flex items-center justify-between text-blue-700 text-xs font-bold">
                                 <span className="flex items-center gap-1.5"><Timer className="w-4 h-4" /> 실제 소진 시간:</span>
                                 <span>{formatWorkHours(calculateHours())} (점심 1시간 제외)</span>
                              </div>
                           </div>
                        )}
                        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="구체적인 사유를 입력하세요" className="w-full p-4 border border-slate-200 rounded-2xl h-28 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                        <div className="space-y-2">
                          {selectedStartDate && (
                            <div className="text-sm font-semibold text-blue-700 bg-blue-50 p-3 rounded-xl">
                              선택 날짜: {format(selectedStartDate, 'yyyy년 MM월 dd일')}{selectedEndDate && ` ~ ${format(selectedEndDate, 'yyyy년 MM월 dd일')}`}
                              {selectedStartDate && selectedEndDate && (
                                <div className="text-xs text-blue-600 mt-1">
                                  ({Math.ceil((selectedEndDate.getTime() - selectedStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}일)
                                </div>
                              )}
                            </div>
                          )}
                          <button type="submit" disabled={!selectedStartDate || !reason || (isAdvance && !advanceAgreed)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold disabled:bg-slate-200 transition-all shadow-lg shadow-blue-900/20 active:scale-95">결재 올리기</button>
                        </div>
                    </form>
                 </div>
              </div>

              {/* 내 신청 현황 */}
              <div className="max-w-5xl mx-auto">
                 <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" /> 
                    내 신청 현황
                 </h3>
                 {requests.filter(r => r.userId === currentUser.id).length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                       <p>아직 신청한 연차/병가가 없습니다.</p>
                    </div>
                 ) : (
                    <div className="space-y-3">
                       {requests.filter(r => r.userId === currentUser.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(req => (
                          <div key={req.id} onClick={() => setSelectedDoc(req)} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-300 transition-all">
                             <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex-1">
                                   <div className="flex items-center gap-3 mb-2">
                                      <span className="font-bold text-slate-800">{req.type} ({format(parseLocalDate(req.startDate), 'MM/dd')})</span>
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                         req.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                         req.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' :
                                         'bg-blue-100 text-blue-700'
                                      }`}>
                                         {req.status === LeaveStatus.APPROVED ? '✓ 최종승인' : req.status === LeaveStatus.REJECTED ? '✕ 반려됨' : '대기중'}
                                      </span>
                                      <span className="text-[10px] text-slate-500 px-2 py-1 bg-slate-100 rounded-full">{req.currentStep}</span>
                                   </div>
                                   {req.status === LeaveStatus.REJECTED && req.rejectionReason && (
                                      <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100 italic">
                                         <span className="font-bold">반려 사유:</span> {req.rejectionReason}
                                      </p>
                                   )}
                                </div>
                                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                   {req.status === LeaveStatus.PENDING ? (
                                      <>
                                         <button onClick={() => { setEditingRequest(req); const dateToEdit = parseLocalDate(req.startDate); setEditDate(dateToEdit); setEditReason(req.reason); }} className="text-xs px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">수정</button>
                                         <button onClick={() => onRequestCancel(req.id, 'leave')} className="text-xs px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors">삭제</button>
                                         {req.currentStep === LeaveStep.DIRECTOR_APPROVAL && (
                                           <div className="flex flex-col gap-1">
                                             <span className="text-[9px] text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg font-bold">이사가 결재 취소함</span>
                                             <span className="text-[8px] text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">위의 삭제 버튼으로 신청을 취소할 수 있습니다</span>
                                           </div>
                                         )}
                                      </>
                                   ) : (
                                      <button onClick={() => setSelectedDoc(req)} className="text-xs px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">보기</button>
                                   )}
                                </div>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>
           </div>
        )}

        {activeTab === 'saturday' && (
           <div className="max-w-5xl mx-auto space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                 <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-200/50">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">{format(satMonth, 'yyyy년 MM월')}</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setSatMonth(subMonths(satMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                            <button onClick={() => setSatMonth(addMonths(satMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronRight className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center">
                        {['일','월','화','수','목','금','토'].map((d, i) => (
                           <div key={d} className={`text-[10px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
                        ))}
                        {satDaysInMonth.map((date) => {
                            const isSelected = selectedSatDate && isSameDay(date, selectedSatDate);
                            const isCurr = isSameMonth(date, satMonth);
                            const isSat = getDay(date) === 6;
                            const isTday = isToday(date);
                            return (
                                <button key={date.toString()} disabled={!isCurr || !isSat} onClick={() => {
                                  // 로컬 자정으로 Date 객체 생성 (타임존 문제 해결)
                                  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                  setSelectedSatDate(localDate);
                                }}
                                    className={`aspect-square flex items-center justify-center rounded-2xl text-sm transition-all relative
                                        ${isSelected ? 'bg-blue-600 text-white shadow-lg' : isCurr && isSat ? 'text-blue-500 font-bold bg-blue-50 hover:bg-blue-600 hover:text-white' : 'text-slate-400'} ${!isCurr || !isSat ? 'cursor-not-allowed' : ''}`}>
                                    <span className="relative z-10">{format(date, 'd')}</span>
                                    {isTday && isCurr && !isSelected && (
                                       <div className="absolute bottom-1 w-1 h-1 bg-blue-600 rounded-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                 </div>
                 <div className="lg:col-span-7 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-200/50 flex flex-col justify-center">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner"><CalendarIcon className="w-8 h-8" /></div>
                        <h3 className="text-xl font-bold text-slate-800">토요 근무 신청</h3>
                        <p className="text-slate-500 text-sm">달력에서 근무 예정인 토요일을 선택해 주세요.</p>
                        {selectedSatDate && (
                           <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 animate-in zoom-in duration-200 shadow-sm">
                              <p className="text-lg font-bold text-blue-700 mb-1">{format(selectedSatDate, 'yyyy년 MM월 dd일 (토)')}</p>
                              <p className="text-sm text-blue-600 font-medium italic">오전 근무: 09:00 ~ 13:00 (4시간)</p>
                           </div>
                        )}
                        <button disabled={!selectedSatDate} onClick={async () => { 
                          if(selectedSatDate) { 
                            try {
                              // 날짜를 YYYY-MM-DD 문자열로 변환하여 전송 (타임존 문제 해결)
                              const satDateStr = format(selectedSatDate, 'yyyy-MM-dd');
                              await onSaturdayShiftCreate(new Date(satDateStr) as any); 
                              setSelectedSatDate(null); 
                            } catch (error) {
                              console.error('신청 실패:', error);
                            }
                          } 
                        }}
                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold disabled:bg-slate-200 shadow-lg shadow-blue-900/20 active:scale-95 transition-all">토요근무 결재 요청</button>
                    </div>
                 </div>
              </div>

              {/* 내 토요근무 신청 현황 */}
              <div className="max-w-5xl mx-auto">
                 <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" /> 
                    내 신청 현황
                 </h3>
                 {saturdayShifts.filter(r => r.userId === currentUser.id).length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                       <p>아직 신청한 토요근무가 없습니다.</p>
                    </div>
                 ) : (
                    <div className="space-y-3">
                       {saturdayShifts.filter(r => r.userId === currentUser.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(req => (
                          <div key={req.id} onClick={() => setSelectedDoc(req)} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-300 transition-all">
                             <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex-1">
                                   <div className="flex items-center gap-3 mb-2">
                                      <span className="font-bold text-slate-800">토요근무 ({format(parseLocalDate(req.date), 'MM/dd')})</span>
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                         req.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                         req.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' :
                                         'bg-blue-100 text-blue-700'
                                      }`}>
                                         {req.status === LeaveStatus.APPROVED ? '✓ 최종승인' : req.status === LeaveStatus.REJECTED ? '✕ 반려됨' : '대기중'}
                                      </span>
                                      <span className="text-[10px] text-slate-500 px-2 py-1 bg-slate-100 rounded-full">{req.currentStep}</span>
                                   </div>
                                   {req.status === LeaveStatus.REJECTED && req.rejectionReason && (
                                      <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100 italic">
                                         <span className="font-bold">반려 사유:</span> {req.rejectionReason}
                                      </p>
                                   )}
                                </div>
                                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                   {req.status === LeaveStatus.PENDING ? (
                                      <>
                                         <button onClick={() => { setEditingRequest({...req, type: '토요근무'}); const dateToEdit = parseLocalDate(req.date); setEditDate(dateToEdit); }} className="text-xs px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">수정</button>
                                         <button onClick={() => onRequestCancel(req.id, 'saturday')} className="text-xs px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors">삭제</button>
                                         {req.currentStep === LeaveStep.DIRECTOR_APPROVAL && (
                                           <div className="flex flex-col gap-1">
                                             <span className="text-[9px] text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg font-bold">이사가 결재 취소함</span>
                                             <span className="text-[8px] text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">위의 삭제 버튼으로 신청을 취소할 수 있습니다</span>
                                           </div>
                                         )}
                                      </>
                                   ) : (
                                      <button onClick={() => setSelectedDoc(req)} className="text-xs px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">보기</button>
                                   )}
                                </div>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>
           </div>
        )}

        {activeTab === 'ot' && (
           <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-200/50">
               <h3 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2"><Moon className="w-6 h-6 text-indigo-500" /> 연장근무 신청</h3>
               <form onSubmit={async (e) => { 
                 e.preventDefault(); 
                 try {
                   // 날짜를 YYYY-MM-DD 문자열로 변환하여 전송 (타임존 문제 해결)
                   const otDateStr = format(otDate, 'yyyy-MM-dd');
                   await onOvertimeCreate({ date: new Date(otDateStr) as any, hours: parseFloat(otHours), reason: otReason }); 
                   setOtReason(''); 
                 } catch (error) {
                   console.error('신청 실패:', error);
                 }
               }} className="space-y-6">
                   <div><label className="block text-sm font-bold text-slate-600 mb-2">근무 일자</label>
                   <input type="date" value={format(otDate, 'yyyy-MM-dd')} onChange={e => {
                     if (e.target.value) {
                       // "yyyy-MM-dd" 형식을 로컬 자정으로 변환
                       const [year, month, day] = e.target.value.split('-').map(Number);
                       setOtDate(new Date(year, month - 1, day));
                     }
                   }} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" /></div>
                   <div><label className="block text-sm font-bold text-slate-600 mb-2">시간 선택</label>
                   <select value={otHours} onChange={e => setOtHours(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold">
                       {[1,2,3,4,5,6].map(h => <option key={h} value={h.toString()}>{h}시간</option>)}
                   </select></div>
                   <div><label className="block text-sm font-bold text-slate-600 mb-2">근무 내용 및 사유</label>
                   <textarea value={otReason} onChange={e => setOtReason(e.target.value)} placeholder="구체적인 사유를 입력하세요" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-32 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" required /></div>
                   <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-all">신청서 제출</button>
               </form>

               {/* 내 연장근무 신청 현황 */}
               <div className="mt-12 pt-8 border-t border-slate-200">
                  <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                     <BarChart3 className="w-5 h-5 text-indigo-600" /> 
                     내 신청 현황
                  </h3>
                  {overtimeRequests.filter(r => r.userId === currentUser.id).length === 0 ? (
                     <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                        <p>아직 신청한 연장근무가 없습니다.</p>
                     </div>
                  ) : (
                     <div className="space-y-3">
                        {overtimeRequests.filter(r => r.userId === currentUser.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(req => (
                           <div key={req.id} onClick={() => setSelectedDoc(req)} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                 <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                       <span className="font-bold text-slate-800">{req.hours}시간 ({format(parseLocalDate(req.date), 'MM/dd')})</span>
                                       <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                          req.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                          req.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' :
                                          'bg-indigo-100 text-indigo-700'
                                       }`}>
                                          {req.status === LeaveStatus.APPROVED ? '✓ 최종승인' : req.status === LeaveStatus.REJECTED ? '✕ 반려됨' : '대기중'}
                                       </span>
                                       <span className="text-[10px] text-slate-500 px-2 py-1 bg-slate-200 rounded-full">{req.currentStep}</span>
                                    </div>
                                    {req.status === LeaveStatus.REJECTED && req.rejectionReason && (
                                       <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100 italic">
                                          <span className="font-bold">반려 사유:</span> {req.rejectionReason}
                                       </p>
                                    )}
                                 </div>
                                 <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                    {req.status === LeaveStatus.PENDING ? (
                                       <>
                                          <button onClick={() => { setEditingRequest({...req, type: '연장근무'}); const dateToEdit = parseLocalDate(req.date); setEditDate(dateToEdit); setEditReason(req.reason); }} className="text-xs px-3 py-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors">수정</button>
                                          <button onClick={() => onRequestCancel(req.id, 'ot')} className="text-xs px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors">삭제</button>
                                          {req.currentStep === LeaveStep.DIRECTOR_APPROVAL && (
                                            <div className="flex flex-col gap-1">
                                              <span className="text-[9px] text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg font-bold">이사가 결재 취소함</span>
                                              <span className="text-[8px] text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">위의 삭제 버튼으로 신청을 취소할 수 있습니다</span>
                                            </div>
                                          )}
                                       </>
                                    ) : (
                                       <button onClick={() => setSelectedDoc(req)} className="text-xs px-3 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors">보기</button>
                                    )}
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
           </div>
        )}

        {activeTab === 'approval' && (
            <div className="max-w-3xl mx-auto space-y-4 pb-20 md:pb-0">
                {/* 최종 승인 목록 (이사용 취소 권한) */}
                {currentUser.role === UserRole.DIRECTOR && (
                  <div className="space-y-4">
                    <div className="px-2">
                      <h3 className="font-bold text-slate-800">✓ 최종 승인 현황</h3>
                      <p className="text-xs text-slate-500 mt-1">최종 승인된 항목은 취소할 수 있습니다</p>
                    </div>
                    {[...requests, ...saturdayShifts, ...overtimeRequests].filter(item => item.status === LeaveStatus.APPROVED).map(item => {
                      const user = allUsers[item.userId];
                      const label = (item as any).type || (overtimeRequests.find(o=>o.id===item.id) ? '연장근무' : '토요근무');
                      return (
                        <div key={item.id} onClick={() => setSelectedDoc(item)} className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all cursor-pointer group ring-1 ring-green-50 hover:border-green-200">
                          <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                              <img src={normalizeProfileImageUrl(user?.avatar)} className="w-12 h-12 rounded-full border border-white shadow-sm" alt="" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 group-hover:text-green-600 transition-colors">{user?.name} <span className="text-slate-400 text-sm font-normal">{user?.department}</span></p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white">✓ 최종승인</span>
                              </div>
                              <p className="text-sm text-slate-600 font-medium mt-1">{label} ({format(parseLocalDate((item as any).startDate || (item as any).date), 'MM/dd')})</p>
                            </div>
                          </div>
                          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onApproveReject(item.id, LeaveStatus.PENDING, overtimeRequests.find(o=>o.id===item.id) ? 'ot' : (saturdayShifts.find(s=>s.id===item.id) ? 'saturday' : 'leave'))} className="px-5 py-2.5 bg-amber-50 text-amber-600 rounded-xl font-bold hover:bg-amber-100 transition-colors active:scale-95">결재 취소</button>
                          </div>
                        </div>
                      );
                    })}
                    {[...requests, ...saturdayShifts, ...overtimeRequests].filter(item => item.status === LeaveStatus.APPROVED).length === 0 && (
                      <div className="text-center py-8 text-slate-400">
                        <p className="text-sm">최종 승인된 항목이 없습니다</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 결재 대기 목록 */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2 mb-6">
                    <h3 className="font-bold text-slate-800">결재 대기 및 참조 목록</h3>
                    <div className="flex gap-2 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">● 결재대상</span>
                      <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">● 기획팀장/총무팀장 참조</span>
                    </div>
                  </div>
                  {approvalQueue.map(item => {
                    const user = allUsers[item.userId];
                    const label = (item as any).type || (overtimeRequests.find(o=>o.id===item.id) ? '연장근무' : '토요근무');
                    const step = item.currentStep;
                    let isActualApprover = false;
                    if (step === LeaveStep.MANAGER_APPROVAL && currentUser.isManager) isActualApprover = true;
                    if (step === LeaveStep.DEPT_HEAD_APPROVAL && currentUser.isDeptHead) isActualApprover = true;
                    if (step === LeaveStep.PLANNING_TEAM_APPROVAL && (item as any).isAdvance && (isPlanningManager || isGAManager)) isActualApprover = true;
                    if (step === LeaveStep.DIRECTOR_APPROVAL && currentUser.role === UserRole.DIRECTOR) isActualApprover = true;

                    return (
                      <div key={item.id} onClick={() => setSelectedDoc(item)} className={`bg-white p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all cursor-pointer group ring-1 ${isActualApprover ? 'border-blue-200 ring-blue-100 hover:border-blue-400 shadow-md' : 'border-slate-100 ring-slate-50 opacity-80'}`}>
                        <div className="flex items-center gap-4">
                          <div className="relative shrink-0">
                            <img src={normalizeProfileImageUrl(user?.avatar)} className="w-12 h-12 rounded-full border border-white shadow-sm" alt="" />
                            {!isActualApprover && <div className="absolute -top-1 -right-1 bg-white p-1 rounded-full border border-slate-200 shadow-sm"><Eye className="w-3 h-3 text-slate-400" /></div>}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{user?.name} <span className="text-slate-400 text-sm font-normal">{user?.department}</span></p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isActualApprover ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{item.currentStep}</span>
                              {(item as any).isAdvance && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">당겨쓰기</span>}
                            </div>
                            <p className="text-sm text-slate-600 font-medium mt-1">{label} ({format(parseLocalDate((item as any).startDate || (item as any).date), 'MM/dd')})</p>
                          </div>
                        </div>
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setSelectedDoc(item)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors active:scale-95 flex items-center gap-2"><FileText className="w-4 h-4" /> 서류</button>
                          {isActualApprover && (
                            <>
                              <button onClick={() => setRejectionModal({ itemId: item.id, category: overtimeRequests.find(o=>o.id===item.id) ? 'ot' : (saturdayShifts.find(s=>s.id===item.id) ? 'saturday' : 'leave') })} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors active:scale-95">반려</button>
                              <button onClick={() => onApproveReject(item.id, LeaveStatus.APPROVED, overtimeRequests.find(o=>o.id===item.id) ? 'ot' : (saturdayShifts.find(s=>s.id===item.id) ? 'saturday' : 'leave'))} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-900/20 transition-all active:scale-95">승인</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
            </div>
        )}

        {activeTab === 'logs' && (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ring-1 ring-slate-100">
                <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                   <span>전체 근태 보관소</span>
                   <span className="text-[10px] text-slate-400 font-medium font-sans">관리자 전용 조회</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50/80 border-b text-slate-500 font-bold uppercase">
                            <tr><th className="p-4">신청자</th><th className="p-4">유형</th><th className="p-4">날짜</th><th className="p-4">상태/단계</th><th className="p-4 text-center">서류</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {[...requests, ...saturdayShifts, ...overtimeRequests].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime()).map(row => (
                                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4 flex items-center gap-2 font-sans"><img src={normalizeProfileImageUrl(allUsers[row.userId]?.avatar)} className="w-6 h-6 rounded-full shadow-sm" /><span className="font-bold">{allUsers[row.userId]?.name}</span></td>
                                    <td className="p-4 text-slate-500 text-xs">
                                       <div className="flex flex-col">
                                          <span className="font-medium">{(row as any).type || (overtimeRequests.find(o=>o.id===row.id) ? '연장근무' : '토요근무')}</span>
                                          {(row as any).isAdvance && <span className="text-[9px] text-amber-600 font-bold">당겨쓰기</span>}
                                       </div>
                                    </td>
                                    <td className="p-4 text-xs font-sans text-slate-600">{format(parseLocalDate((row as any).startDate || (row as any).date), 'yyyy.MM.dd')}</td>
                                    <td className="p-4">
                                       <div className="flex flex-col gap-0.5">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${row.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' : row.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{row.status}</span>
                                          <span className="text-[9px] text-slate-400 pl-1">{row.currentStep}</span>
                                       </div>
                                    </td>
                                    <td className="p-4 text-center"><button onClick={() => setSelectedDoc(row)} className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"><FileText className="w-4 h-4" /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
