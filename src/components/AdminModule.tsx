
import React, { useState, useEffect } from 'react';
import { User, UserRole, SystemLog } from '../types';
import { UserPlus, Shield, FileText, CheckSquare, Lock, Hash, Calendar, Trash2, X, PenSquare, Key } from 'lucide-react';
import { normalizeProfileImageUrl, getApiBase, dbService } from '../services/db';

// 공통 getApiBase 사용 (db.ts) - 동일 Origin 기반
const API_BASE = getApiBase();

interface AdminModuleProps {
  logs: SystemLog[];
  onAddUser: (user: Partial<User>) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUser: (userId: string, updates: Partial<User>) => void;
  currentUser: User;
  allUsers: Record<string, User>;
}

export const AdminModule: React.FC<AdminModuleProps> = ({ logs, onAddUser, onDeleteUser, onUpdateUser, currentUser, allUsers }) => {
  // Determine permission for "Add Staff"
  // Allowed: Director, Admin, or Manager of General Affairs OR Planning
  const canManageStaff = currentUser.role === UserRole.DIRECTOR || 
                         currentUser.role === UserRole.ADMIN ||
                         ((currentUser.department.includes('총무') || currentUser.department.includes('기획')) && currentUser.isManager);

  // 시스템 로그는 IT 관리팀 팀장만 볼 수 있음
  const canViewLogs = currentUser.id === 'jungdong' || 
                      (currentUser.department.includes('IT') && currentUser.isManager);

  // 연차/토요일 근무 관리 권한: 이사 또는 IT 부서 팀장
  const canManageLeaveAndShift = currentUser.role === UserRole.DIRECTOR || 
                                  (currentUser.department.includes('IT') && currentUser.isManager);

  // Default tab depends on permission
  const [activeTab, setActiveTab] = useState<'staff' | 'logs' | 'leave' | 'department'>(
    canManageStaff ? 'staff' : canManageLeaveAndShift ? 'leave' : canViewLogs ? 'logs' : 'staff'
  );
  
  // Registration Form State
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [dept, setDept] = useState('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  
  // Permission Flags
  const [isManager, setIsManager] = useState(false);
  const [isDeptHead, setIsDeptHead] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [isHospitalPresident, setIsHospitalPresident] = useState(false);
  const [isMedicalDirector, setIsMedicalDirector] = useState(false);

  // Delete Modal State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit/Reset Password Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 연차 관리 State
  const [selectedUserForLeave, setSelectedUserForLeave] = useState<string | null>(null);
  const [leaveAdjustmentDays, setLeaveAdjustmentDays] = useState(0);
  const [leaveAdjustmentHours, setLeaveAdjustmentHours] = useState(0);
  const [leaveAdjustmentMins, setLeaveAdjustmentMins] = useState(0);
  const [leaveAdjustmentReason, setLeaveAdjustmentReason] = useState('');
  const [leaveAdjustmentType, setLeaveAdjustmentType] = useState<'add' | 'subtract' | 'set'>('add');
  const [userLeaveBalances, setUserLeaveBalances] = useState<Record<string, number>>({});
  const [additionalLeaveDays, setAdditionalLeaveDays] = useState<Record<string, number>>({}); // 추가연차
  
  // 토요일 근무 State - 직원별 근무 날짜 배열 (YYYY-MM-DD 형식)
  const [selectedUserForSaturday, setSelectedUserForSaturday] = useState<string | null>(null);
  const [saturdayWorkDates, setSaturdayWorkDates] = useState<Record<string, string[]>>({}); // { userId: ['2026-01-25', '2026-02-01', ...] }
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date()); // 달력 표시 월

  // 부서별 계정 State
  const [deptAccountId, setDeptAccountId] = useState('');
  const [deptAccountPassword, setDeptAccountPassword] = useState('');
  const [selectedDeptForAccount, setSelectedDeptForAccount] = useState('');
  const [deptAccounts, setDeptAccounts] = useState<Record<string, { password: string; createdAt: Date; createdBy: string }>>({});

  // 부서 목록은 constants에서 기본값 사용
  
  // 부서별 계정 생성 및 관리
  const handleCreateDeptAccount = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deptAccountId.trim() || !selectedDeptForAccount.trim() || !deptAccountPassword.trim()) {
      alert('아이디, 부서명, 비밀번호를 모두 입력해주세요.');
      return;
    }

    // 중복 확인
    if (Object.values(allUsers).some(u => u.id === deptAccountId)) {
      alert('이미 존재하는 아이디입니다.');
      return;
    }
    
    // 부서별 계정 생성 (ID는 dept_ 패턴으로 생성)
    const finalDeptAccountId = deptAccountId.startsWith('dept_') ? deptAccountId : `dept_${deptAccountId}`;
    const newDeptAccount: User = {
      id: finalDeptAccountId,
      name: `${selectedDeptForAccount} 계정`,
      role: UserRole.STAFF,
      department: selectedDeptForAccount,
      password: deptAccountPassword,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedDeptForAccount)}&background=2563eb&color=fff`,
      isDepartmentAccount: true,
      joinDate: new Date(),
    };

    onAddUser(newDeptAccount);
    
    // 로컬 상태 저장
    setDeptAccounts({
      ...deptAccounts,
      [finalDeptAccountId]: {
        password: deptAccountPassword,
        createdAt: new Date(),
        createdBy: currentUser.id
      }
    });

    // 폼 초기화
    setDeptAccountId('');
    setSelectedDeptForAccount('');
    setDeptAccountPassword('');
  };

  // 부서별 계정 목록
  const departmentAccountsList = Object.values(allUsers).filter(u => u.isDepartmentAccount === true);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Determine Role based on checkboxes (병원장/원장이 우선)
    let role: UserRole = UserRole.STAFF;
    if (isHospitalPresident) {
      role = UserRole.HOSPITAL_PRESIDENT;
    } else if (isMedicalDirector) {
      role = UserRole.MEDICAL_DIRECTOR;
    } else if (isDirector) {
      role = UserRole.DIRECTOR;
    }

    onAddUser({
      id: userId,
      password: password,
      name,
      role, 
      jobTitle: jobTitle || undefined,
      department: dept,
      isManager,
      isDeptHead,
      joinDate: new Date(joinDate),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    });
    
    // Reset form
    setUserId('');
    setPassword('');
    setName('');
    setDept('');
    setJobTitle('');
    setJoinDate(new Date().toISOString().split('T')[0]);
    setIsManager(false);
    setIsDeptHead(false);
    setIsDirector(false);
    setIsHospitalPresident(false);
    setIsMedicalDirector(false);
  };

  // 일, 시간, 분을 총 분 수로 변환
  const calculateTotalMinutes = () => {
    return leaveAdjustmentDays * 480 + leaveAdjustmentHours * 60 + leaveAdjustmentMins;
  };

  // 분 수를 일, 시간, 분으로 표시
  const formatMinutesToDaysHoursMins = (totalMins: number) => {
    const days = Math.floor(totalMins / 480);
    const remainingAfterDays = totalMins % 480;
    const hours = Math.floor(remainingAfterDays / 60);
    const mins = remainingAfterDays % 60;
    return { days, hours, mins };
  };

  // 주어진 월의 모든 토요일을 구하는 함수
  const getSaturdaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const saturdays: Date[] = [];
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 첫 번째 토요일 찾기 (요일: 0=일, 1=월, ..., 6=토)
    let currentDate = new Date(firstDay);
    const dayOfWeek = currentDate.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    currentDate.setDate(currentDate.getDate() + daysUntilSaturday);
    
    // 모든 토요일 추가
    while (currentDate.getMonth() === month) {
      saturdays.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 7);
    }
    
    return saturdays;
  };

  // 날짜를 YYYY-MM-DD 형식으로 변환
  const dateToString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 토요일 선택 토글
  const toggleSaturdayDate = (dateStr: string) => {
    if (!selectedUserForSaturday) return;
    
    const currentDates = saturdayWorkDates[selectedUserForSaturday] || [];
    const index = currentDates.indexOf(dateStr);
    
    if (index > -1) {
      // 이미 선택된 경우 제거
      setSaturdayWorkDates({
        ...saturdayWorkDates,
        [selectedUserForSaturday]: currentDates.filter(d => d !== dateStr)
      });
    } else {
      // 선택되지 않은 경우 추가
      setSaturdayWorkDates({
        ...saturdayWorkDates,
        [selectedUserForSaturday]: [...currentDates, dateStr].sort()
      });
    }
  };

  // 연차 탭 활성화 시 사용자별 연차 잔액 로드
  useEffect(() => {
    if (activeTab === 'leave' && canManageLeaveAndShift) {
      const loadLeaveBalances = async () => {
        try {
          const balances: Record<string, number> = {};
          for (const user of Object.values(allUsers)) {
            const response = await fetch(`${API_BASE}/admin/user-leave-balance/${user.id}`, {
              mode: 'cors',
              credentials: 'omit'
            });
            if (response.ok) {
              const data = await response.json();
              balances[user.id] = data.remainMinutes || 0;
            }
          }
          setUserLeaveBalances(balances);
        } catch (error) {
          console.error('연차 잔액 로드 오류:', error);
        }
      };
      loadLeaveBalances();
    }
  }, [activeTab, canManageLeaveAndShift, allUsers]);

  // 연차 직원 선택 시 해당 직원의 최신 연차 잔액 조회 - 폴링 주기 최적화
  useEffect(() => {
    if (selectedUserForLeave && activeTab === 'leave') {
      const loadSelectedUserLeaveBalance = async () => {
        try {
          const response = await fetch(`${API_BASE}/admin/user-leave-balance/${selectedUserForLeave}`, {
            mode: 'cors',
            credentials: 'omit'
          });
          if (response.ok) {
            const data = await response.json();
            setUserLeaveBalances(prev => ({
              ...prev,
              [selectedUserForLeave]: data.remainMinutes || 0
            }));
            // 추가연차도 함께 로드
            setAdditionalLeaveDays(prev => ({
              ...prev,
              [selectedUserForLeave]: data.additionalLeaveDays || 0
            }));
            console.log(`[AdminModule] ${selectedUserForLeave} 연차 잔액: ${data.remainMinutes}분, 추가연차: ${data.additionalLeaveDays}일`);
          }
        } catch (error) {
          console.error('선택한 직원의 연차 잔액 조회 오류:', error);
        }
      };
      
      // 선택 시 즉시 조회
      loadSelectedUserLeaveBalance();
      
      // 폴링 주기 최적화: 5초 (조정 후 반영 충분)
      const interval = setInterval(loadSelectedUserLeaveBalance, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedUserForLeave, activeTab]);

  // 토요일 관리 탭에서 직원 선택 시 기존 토요일 근무 일정 로드
  useEffect(() => {
    if (selectedUserForSaturday && activeTab === 'leave') {
      const loadSaturdayDates = async () => {
        try {
          const response = await fetch(`${API_BASE}/admin/saturday-schedule/${selectedUserForSaturday}`, {
            mode: 'cors',
            credentials: 'omit'
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.workDates)) {
              setSaturdayWorkDates({
                ...saturdayWorkDates,
                [selectedUserForSaturday]: data.workDates
              });
            } else {
              setSaturdayWorkDates({
                ...saturdayWorkDates,
                [selectedUserForSaturday]: []
              });
            }
          } else {
            setSaturdayWorkDates({
              ...saturdayWorkDates,
              [selectedUserForSaturday]: []
            });
          }
        } catch (error) {
          console.error('토요일 일정 로드 오류:', error);
          // 로컬 스토리지에서 로드 (백업)
          try {
            const allSaturdayData = JSON.parse(localStorage.getItem('saturdayWorkDates') || '{}');
            const userWorkDates = allSaturdayData[selectedUserForSaturday] || [];
            setSaturdayWorkDates({
              ...saturdayWorkDates,
              [selectedUserForSaturday]: userWorkDates
            });
          } catch {
            setSaturdayWorkDates({
              ...saturdayWorkDates,
              [selectedUserForSaturday]: []
            });
          }
        }
      };
      loadSaturdayDates();
    }
  }, [selectedUserForSaturday, activeTab]);
  const confirmAndDelete = (user: User) => {
      setUserToDelete(user);
  };

  const executeDelete = async () => {
      if (userToDelete) {
          setIsDeleting(true);
          try {
              await onDeleteUser(userToDelete.id);
              setUserToDelete(null); // Close modal
          } catch (error: any) {
              console.error('삭제 오류:', error);
              const message = error?.message || '삭제 중 오류가 발생했습니다.';
              alert(`삭제 실패: ${message}`);
          } finally {
              setIsDeleting(false);
          }
      }
  };

  const openEditModal = (user: User) => {
      setEditingUser(user);
      setEditName(user.name);
      setEditDept(user.department);
      setEditJobTitle(user.jobTitle || '');
      setNewPassword(''); // Always start blank
  };

  const executeUpdate = () => {
      if (!editingUser) return;
      
      const updates: Partial<User> = {
          name: editName,
          department: editDept,
          jobTitle: editJobTitle,
      };

      if (newPassword.trim()) {
          updates.password = newPassword.trim();
      }

      onUpdateUser(editingUser.id, updates);
      setEditingUser(null);
  };

  // Fix: UserRole.AI is not defined. Removing the filter check.
  const staffList = (Object.values(allUsers) as User[]);

  // 권한이 없으면 빈 화면 표시
  const hasAnyPermission = canManageStaff || canManageLeaveAndShift || canViewLogs;
  
  if (!hasAnyPermission) {
    return (
      <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">접근 권한이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
      
      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-slate-200">
               <div className="flex justify-between items-start mb-4">
                   <div className="p-3 bg-red-100 rounded-full">
                       <Trash2 className="w-6 h-6 text-red-600" />
                   </div>
                   <button onClick={() => setUserToDelete(null)} className="text-slate-400 hover:text-slate-600">
                       <X className="w-5 h-5" />
                   </button>
               </div>
               
               <h3 className="text-xl font-bold text-slate-800 mb-2">직원 퇴사 처리</h3>
               <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4 flex items-center gap-3">
                    <img src={userToDelete.avatar} className="w-10 h-10 rounded-full" alt="" />
                    <div>
                        <p className="font-bold text-slate-800">{userToDelete.name}</p>
                        <p className="text-xs text-slate-500">{userToDelete.department} {userToDelete.jobTitle?.replace(/[0]+$/, '')}</p>
                    </div>
               </div>
               <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                   정말로 삭제하시겠습니까? <br/>
                   해당 계정은 즉시 <strong>로그인 차단</strong>되며, 관련된 <strong>모든 채팅방에서 제거</strong>됩니다. 이 작업은 되돌릴 수 없습니다.
               </p>
               
               <div className="flex gap-3">
                   <button 
                       onClick={() => setUserToDelete(null)}
                       disabled={isDeleting}
                       className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                   >
                       취소
                   </button>
                   <button 
                       onClick={executeDelete}
                       disabled={isDeleting}
                       className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                       {isDeleting ? '삭제 중...' : '삭제 확정'}
                   </button>
               </div>
           </div>
        </div>
      )}

      {/* Edit / Password Reset Modal */}
      {editingUser && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full border border-slate-200">
               <div className="flex justify-between items-start mb-4">
                   <div className="p-3 bg-blue-100 rounded-full">
                       <PenSquare className="w-6 h-6 text-blue-600" />
                   </div>
                   <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                       <X className="w-5 h-5" />
                   </button>
               </div>
               
               <h3 className="text-xl font-bold text-slate-800 mb-2">직원 정보 수정</h3>
               <p className="text-sm text-slate-500 mb-6">기본 정보 수정 및 비밀번호 초기화가 가능합니다.</p>

               <div className="space-y-4 mb-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">이름</label>
                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">아이디 (수정불가)</label>
                            <input type="text" value={editingUser.id} disabled className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">부서</label>
                            <input type="text" value={editDept} onChange={e => setEditDept(e.target.value)} placeholder="예: 원무과, IT팀" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">직책</label>
                            <input type="text" value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100">
                        <label className="block text-sm font-bold text-blue-600 mb-2 flex items-center gap-1">
                            <Key className="w-4 h-4" /> 비밀번호 초기화
                        </label>
                        <input 
                            type="text" 
                            value={newPassword} 
                            onChange={e => setNewPassword(e.target.value)} 
                            placeholder="변경 시에만 입력하세요" 
                            className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                        <p className="text-xs text-slate-400 mt-1">입력하지 않으면 기존 비밀번호가 유지됩니다.</p>
                    </div>
               </div>
               
               <div className="flex gap-3">
                   <button 
                       onClick={() => setEditingUser(null)}
                       className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                   >
                       취소
                   </button>
                   <button 
                       onClick={executeUpdate}
                       className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
                   >
                       수정 저장
                   </button>
               </div>
           </div>
        </div>
      )}

      <div className="p-3 md:p-4 border-b border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              관리자 대시보드
            </h2>
            <p className="text-xs md:text-sm text-slate-500">직원 관리 및 시스템 로그 조회</p>
          </div>
          {/* 상단 메뉴 탭 - 모바일에서는 가로 스크롤 가능한 작은 탭 */}
          <div className="w-full md:w-auto">
            <div className="flex flex-row flex-nowrap gap-1 bg-slate-100 rounded-xl px-1 py-1 overflow-x-auto">
              {canManageStaff && (
                <button
                  onClick={() => setActiveTab('staff')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'staff' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <UserPlus className="w-3 h-3 md:w-4 md:h-4" />
                  직원 관리
                </button>
              )}
              {canManageStaff && (
                <button
                  onClick={() => setActiveTab('department')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'department' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Hash className="w-3 h-3 md:w-4 md:h-4" />
                  부서별 계정
                </button>
              )}
              {canManageLeaveAndShift && (
                <button
                  onClick={() => setActiveTab('leave')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'leave' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                  연차/토요일 관리
                </button>
              )}
              {canViewLogs && (
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'logs' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText className="w-3 h-3 md:w-4 md:h-4" />
                  시스템 로그
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {activeTab === 'staff' && canManageStaff && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
             {/* Registration Form */}
             <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-blue-600" />
                    새 직원 등록
                </h3>
                <form onSubmit={handleAddUser} className="space-y-6">
                    
                    {/* Account Credentials */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                            <Hash className="w-3 h-3" /> 아이디 (사번)
                        </label>
                        <input 
                            type="text" 
                            required 
                            value={userId} 
                            onChange={e => setUserId(e.target.value)} 
                            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="예: 04001" 
                        />
                        </div>
                        <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> 초기 비밀번호
                        </label>
                        <input 
                            type="text" 
                            required 
                            value={password} 
                            onChange={e => setPassword(e.target.value)} 
                            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="예: 1234" 
                        />
                        </div>
                    </div>

                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="이름을 입력하세요" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">부서</label>
                        <input 
                            type="text" 
                            required 
                            value={dept} 
                            onChange={e => setDept(e.target.value)} 
                            placeholder="예: 원무과, IT팀"
                            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                        </div>
                        <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">직책</label>
                        <input 
                            type="text" 
                            required 
                            value={jobTitle} 
                            onChange={e => setJobTitle(e.target.value)} 
                            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="예: 주임, 계장, 팀장, 간호사" 
                        />
                        </div>
                    </div>

                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Calendar className="w-4 h-4" /> 입사일
                    </label>
                    <input 
                        type="date" 
                        required 
                        value={joinDate} 
                        onChange={e => setJoinDate(e.target.value)} 
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                    <p className="text-xs text-slate-400 mt-1">입사일을 기준으로 근속 연수에 따른 연차가 자동 계산됩니다.</p>
                    </div>

                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                        특별 권한 설정
                    </h4>
                    <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={isHospitalPresident} onChange={e => setIsHospitalPresident(e.target.checked)} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-red-500 checked:bg-red-500 hover:border-red-400" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                                <svg stroke="currentColor" fill="none" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">병원장</span>
                                <p className="text-xs text-slate-500">연차 없음, 토요근무만 관리 (의료인)</p>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={isMedicalDirector} onChange={e => setIsMedicalDirector(e.target.checked)} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-orange-500 checked:bg-orange-500 hover:border-orange-400" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                                <svg stroke="currentColor" fill="none" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">원장</span>
                                <p className="text-xs text-slate-500">연차 없음, 토요근무만 관리 (의료인)</p>
                            </div>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={isManager} onChange={e => setIsManager(e.target.checked)} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-blue-500 checked:bg-blue-500 hover:border-blue-400" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                                <svg stroke="currentColor" fill="none" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">팀장 (중간 관리자)</span>
                                <p className="text-xs text-slate-500">소속 부서 직원의 연차 1차 승인</p>
                            </div>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={isDeptHead} onChange={e => setIsDeptHead(e.target.checked)} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-teal-500 checked:bg-teal-500 hover:border-teal-400" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                                <svg stroke="currentColor" fill="none" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">부장 (상급 관리자)</span>
                                <p className="text-xs text-slate-500">팀장 승인 후 2차 승인 담당</p>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={isDirector} onChange={e => setIsDirector(e.target.checked)} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-purple-500 checked:bg-purple-500 hover:border-purple-400" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                                <svg stroke="currentColor" fill="none" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">임원/이사 (최종 관리자)</span>
                                <p className="text-xs text-slate-500">모든 연차의 최종 승인 권한 부여</p>
                            </div>
                        </label>
                    </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20">
                    직원 등록 완료
                    </button>
                </form>
             </div>

             {/* Existing Staff List */}
             <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full max-h-[800px]">
                 <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                     <CheckSquare className="w-5 h-5 text-slate-600" />
                     직원 목록 및 관리
                 </h3>
                 <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                     {staffList.length === 0 ? (
                         <div className="text-center py-10 text-slate-400">등록된 직원이 없습니다.</div>
                     ) : (
                         staffList.map(user => (
                             <div key={user.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors group">
                                 <div className="flex items-center gap-3">
                                     <img src={normalizeProfileImageUrl(user.avatar)} alt="" className="w-10 h-10 rounded-full bg-slate-200 object-cover" />
                                     <div>
                                         <p className="font-bold text-slate-800 text-sm">
                                             {user.name} 
                                             <span className="text-slate-400 font-normal ml-1">({user.id})</span>
                                         </p>
                                         <div className="flex flex-wrap gap-1 mt-1">
                                            <span className="text-xs text-slate-500">{user.department} {user.jobTitle?.replace(/[0]+$/, '') || ''}</span>
                                            {user.isManager && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">팀장</span>}
                                            {user.isDeptHead && <span className="text-[10px] bg-teal-100 text-teal-700 px-1 rounded">부장</span>}
                                         </div>
                                     </div>
                                 </div>
                                 
                                 {user.id !== currentUser.id && user.id !== 'jungdong' ? (
                                     <div className="flex gap-2 relative z-10">
                                         <button 
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                openEditModal(user);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-all active:scale-95"
                                            title="정보 수정 / 비밀번호 초기화"
                                         >
                                            <PenSquare className="w-4 h-4" />
                                         </button>
                                         <button 
                                             type="button"
                                             onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                confirmAndDelete(user);
                                             }}
                                             className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all active:scale-95"
                                             title="퇴사 처리 (계정 삭제)"
                                         >
                                             <Trash2 className="w-4 h-4 pointer-events-none" />
                                         </button>
                                     </div>
                                 ) : (
                                     <span className="text-xs text-slate-300 font-medium px-2 py-1 bg-slate-50 rounded">본인/관리자</span>
                                 )}
                             </div>
                         ))
                     )}
                 </div>
             </div>
          </div>
        )}
        
        {activeTab === 'leave' && canManageLeaveAndShift && (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* 연차 조정 */}
              <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-green-600" />
                  연차 조정 (비례 차감 직원 포함)
                </h3>
                
                <div className="space-y-4">
                  {/* 직원 선택 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">직원 선택 (병원장/원장 제외)</label>
                    <select 
                      value={selectedUserForLeave || ''}
                      onChange={(e) => setSelectedUserForLeave(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">직원을 선택하세요</option>
                      {Object.values(allUsers)
                        .filter(user => user.role !== UserRole.HOSPITAL_PRESIDENT && user.role !== UserRole.MEDICAL_DIRECTOR)
                        .map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.id}) - {user.department}
                          </option>
                        ))
                      }
                    </select>
                  </div>

                  {selectedUserForLeave && (
                    <>
                      {/* 현재 연차 잔액 표시 */}
                      <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                        <p className="text-sm text-slate-600 mb-2">현재 연차 잔액</p>
                        <p className="text-2xl font-bold text-green-600">
                          {(() => {
                            const balance = userLeaveBalances[selectedUserForLeave] ?? 0;
                            const { days, hours, mins } = formatMinutesToDaysHoursMins(balance);
                            return `${days}일 ${hours}시간 ${mins}분`;
                          })()}
                          <span className="text-lg text-slate-500 ml-3">
                            ({userLeaveBalances[selectedUserForLeave] ?? 0}분)
                          </span>
                        </p>
                      </div>

                      {/* 조정 유형 */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">조정 방식</label>
                        <div className="grid grid-cols-3 gap-2">
                          {['add', 'subtract', 'set'].map(type => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setLeaveAdjustmentType(type as 'add' | 'subtract' | 'set')}
                              className={`p-3 rounded-lg font-medium text-sm transition-all ${
                                leaveAdjustmentType === type
                                  ? 'bg-green-600 text-white shadow-lg'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {type === 'add' ? '➕ 추가' : type === 'subtract' ? '➖ 차감' : '🔧 설정'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 조정 일/시간/분 */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">
                          {leaveAdjustmentType === 'add' ? '추가할' : leaveAdjustmentType === 'subtract' ? '차감할' : '설정할'} 연차
                        </label>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          {/* 일 */}
                          <div>
                            <label className="text-xs text-slate-500 font-medium mb-1 block">일</label>
                            <input 
                              type="number" 
                              value={leaveAdjustmentDays}
                              onChange={(e) => setLeaveAdjustmentDays(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-center"
                              min="0"
                              placeholder="0"
                            />
                          </div>
                          {/* 시간 */}
                          <div>
                            <label className="text-xs text-slate-500 font-medium mb-1 block">시간</label>
                            <input 
                              type="number" 
                              value={leaveAdjustmentHours}
                              onChange={(e) => setLeaveAdjustmentHours(Math.max(0, Math.min(7, parseInt(e.target.value) || 0)))}
                              className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-center"
                              min="0"
                              max="7"
                              placeholder="0"
                            />
                          </div>
                          {/* 분 */}
                          <div>
                            <label className="text-xs text-slate-500 font-medium mb-1 block">분</label>
                            <input 
                              type="number" 
                              value={leaveAdjustmentMins}
                              onChange={(e) => setLeaveAdjustmentMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                              className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-center"
                              min="0"
                              max="59"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* 총 시간 표시 */}
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-3">
                          <p className="text-xs text-slate-600">총 연차</p>
                          <p className="text-lg font-bold text-blue-600">
                            {leaveAdjustmentDays ? `${leaveAdjustmentDays}일 ` : ''}
                            {leaveAdjustmentHours || leaveAdjustmentDays ? `${leaveAdjustmentHours}시간 ` : ''}
                            {leaveAdjustmentMins || leaveAdjustmentHours || leaveAdjustmentDays ? `${leaveAdjustmentMins}분` : '0분'}
                            <span className="text-sm text-slate-500 ml-2">({calculateTotalMinutes()}분)</span>
                          </p>
                        </div>

                        {/* 빠른 입력 버튼 */}
                        <div className="flex gap-2">
                          <button
                            key="1day"
                            type="button"
                            onClick={() => {
                              setLeaveAdjustmentDays(leaveAdjustmentType === 'set' ? 1 : leaveAdjustmentDays + 1);
                            }}
                            className="flex-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all"
                          >
                            +1일
                          </button>
                          <button
                            key="4hours"
                            type="button"
                            onClick={() => {
                              if (leaveAdjustmentType === 'set') {
                                setLeaveAdjustmentDays(0);
                                setLeaveAdjustmentHours(4);
                                setLeaveAdjustmentMins(0);
                              } else {
                                const newHours = leaveAdjustmentHours + 4;
                                if (newHours >= 8) {
                                  setLeaveAdjustmentDays(leaveAdjustmentDays + Math.floor(newHours / 8));
                                  setLeaveAdjustmentHours(newHours % 8);
                                } else {
                                  setLeaveAdjustmentHours(newHours);
                                }
                              }
                            }}
                            className="flex-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all"
                          >
                            +4시간
                          </button>
                          <button
                            key="2hours"
                            type="button"
                            onClick={() => {
                              if (leaveAdjustmentType === 'set') {
                                setLeaveAdjustmentDays(0);
                                setLeaveAdjustmentHours(2);
                                setLeaveAdjustmentMins(0);
                              } else {
                                const newHours = leaveAdjustmentHours + 2;
                                if (newHours >= 8) {
                                  setLeaveAdjustmentDays(leaveAdjustmentDays + 1);
                                  setLeaveAdjustmentHours(newHours - 8);
                                } else {
                                  setLeaveAdjustmentHours(newHours);
                                }
                              }
                            }}
                            className="flex-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all"
                          >
                            +2시간
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          {leaveAdjustmentType === 'add' ? '➕ 연차를 추가합니다' : leaveAdjustmentType === 'subtract' ? '➖ 연차를 차감합니다' : '🔧 연차를 정확히 설정합니다'}
                        </p>
                      </div>

                      {/* 사유 */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">조정 사유</label>
                        <textarea 
                          value={leaveAdjustmentReason}
                          onChange={(e) => setLeaveAdjustmentReason(e.target.value)}
                          className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none resize-none"
                          placeholder="예: 입사일 재계산, 관리자 오류 수정, 기타 조정 사유"
                          rows={3}
                        />
                      </div>

                      {/* 확정 버튼 */}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedUserForLeave) {
                            alert('❌ 직원을 선택해주세요');
                            return;
                          }
                          if (!leaveAdjustmentReason.trim()) {
                            alert('❌ 조정 사유를 입력해주세요');
                            return;
                          }
                          try {
                            const totalMinutes = calculateTotalMinutes();
                            console.log(`연차 조정 요청: userId=${selectedUserForLeave}, type=${leaveAdjustmentType}, minutes=${totalMinutes}`);
                            const response = await fetch(`${API_BASE}/admin/adjust-leave`, {
                              method: 'POST',
                              mode: 'cors',
                              credentials: 'omit',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                userId: selectedUserForLeave,
                                type: leaveAdjustmentType,
                                minutes: totalMinutes,
                                reason: leaveAdjustmentReason,
                                adminId: currentUser.id
                              })
                            });
                            
                            console.log(`응답 상태: ${response.status}`);
                            if (response.ok) {
                              const data = await response.json();
                              console.log(`성공 응답: ${JSON.stringify(data)}`);
                              // 잔액 업데이트
                              setUserLeaveBalances({
                                ...userLeaveBalances,
                                [selectedUserForLeave]: data.totalRemainMinutes
                              });
                              // 입력 필드 초기화
                              setLeaveAdjustmentDays(0);
                              setLeaveAdjustmentHours(0);
                              setLeaveAdjustmentMins(0);
                              setLeaveAdjustmentReason('');
                              // 잔액 표시 포맷팅
                              const { days, hours, mins } = formatMinutesToDaysHoursMins(data.totalRemainMinutes);
                              const displayText = `${days}일 ${hours}시간 ${mins}분 (${data.totalRemainMinutes}분)`;
                              alert(`✅ 연차가 ${leaveAdjustmentType === 'add' ? '추가' : leaveAdjustmentType === 'subtract' ? '차감' : '조정'}되었습니다.\n남은 연차: ${displayText}`);
                            } else {
                              const error = await response.json();
                              console.error(`에러 응답: ${JSON.stringify(error)}`);
                              alert(`❌ 오류: ${error.error}`);
                            }
                          } catch (error) {
                            console.error('연차 조정 오류:', error);
                            alert(`❌ 네트워크 오류: ${error}`);
                          }
                        }}
                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-600/20"
                      >
                        연차 조정 확정
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 토요일 근무 관리 - 달력 형식 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  토요일 근무 달력 관리
                </h3>
                
                {/* 병원장/원장 주의사항 */}
                {(() => {
                  const selectedUserRole = selectedUserForSaturday ? Object.values(allUsers).find(u => u.id === selectedUserForSaturday)?.role : null;
                  if (selectedUserRole === UserRole.HOSPITAL_PRESIDENT || selectedUserRole === UserRole.MEDICAL_DIRECTOR) {
                    return (
                      <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <p className="text-sm text-orange-800">
                          <span className="font-bold">💡 주의:</span> 병원장/원장은 <strong>연차가 없으며 토요근무만 관리됩니다.</strong>
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                
                <div className="space-y-4">
                  {/* 직원 선택 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">직원 선택</label>
                    <select 
                      value={selectedUserForSaturday || ''}
                      onChange={(e) => setSelectedUserForSaturday(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">직원을 선택하세요</option>
                      <optgroup label="병원장/원장">
                        {Object.values(allUsers)
                          .filter(user => user.role === UserRole.HOSPITAL_PRESIDENT || user.role === UserRole.MEDICAL_DIRECTOR)
                          .map(user => (
                            <option key={user.id} value={user.id}>
                              {user.name} ({user.id}) - {user.role}
                            </option>
                          ))
                        }
                      </optgroup>
                      <optgroup label="일반 직원">
                        {Object.values(allUsers)
                          .filter(user => user.role !== UserRole.HOSPITAL_PRESIDENT && user.role !== UserRole.MEDICAL_DIRECTOR)
                          .map(user => (
                            <option key={user.id} value={user.id}>
                              {user.name} ({user.id}) - {user.department}
                            </option>
                          ))
                        }
                      </optgroup>
                    </select>
                  </div>

                  {selectedUserForSaturday && (
                    <>
                      {/* 달력 */}
                      <div className="space-y-3">
                        {/* 달력 네비게이션 */}
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                          <button
                            type="button"
                            onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1))}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            ◀️
                          </button>
                          <h4 className="font-bold text-slate-800 w-32 text-center">
                            {currentCalendarMonth.getFullYear()}년 {currentCalendarMonth.getMonth() + 1}월
                          </h4>
                          <button
                            type="button"
                            onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1))}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            ▶️
                          </button>
                        </div>

                        {/* 토요일 버튼들 */}
                        <div className="grid grid-cols-2 gap-2">
                          {getSaturdaysInMonth(currentCalendarMonth).map(saturday => {
                            const dateStr = dateToString(saturday);
                            const isSelected = (saturdayWorkDates[selectedUserForSaturday] || []).includes(dateStr);
                            
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() => toggleSaturdayDate(dateStr)}
                                className={`p-3 rounded-lg font-medium transition-all text-sm ${
                                  isSelected
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {saturday.getDate()}일 (토)
                                <div className="text-xs opacity-75 mt-1">
                                  {isSelected ? '✓ 근무' : '휴무'}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* 선택된 날짜 표시 */}
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-slate-600 mb-1">선택된 근무일</p>
                          <p className="text-sm font-medium text-blue-700">
                            {(saturdayWorkDates[selectedUserForSaturday] || []).length > 0
                              ? (saturdayWorkDates[selectedUserForSaturday] || []).map(date => {
                                  // 타임존 문제 해결: YYYY-MM-DD 형식을 직접 파싱
                                  const [year, month, day] = date.split('-').map(Number);
                                  return `${month}월 ${day}일`;
                                }).join(', ')
                              : '선택된 날짜 없음'}
                          </p>
                        </div>
                      </div>

                      {/* 저장 버튼 */}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const response = await fetch(`${API_BASE}/admin/saturday-schedule`, {
                              method: 'POST',
                              mode: 'cors',
                              credentials: 'omit',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                userId: selectedUserForSaturday,
                                workDates: saturdayWorkDates[selectedUserForSaturday] || [],
                                adminId: currentUser.id
                              })
                            });
                            
                            if (response.ok) {
                              const data = await response.json();
                              alert(`✅ ${allUsers[selectedUserForSaturday].name}의 토요일 근무 일정이 저장되었습니다.\n(${data.updateCount}개 날짜)`);
                              // 로컬 스토리지에도 백업
                              const allSaturdayData = JSON.parse(localStorage.getItem('saturdayWorkDates') || '{}');
                              allSaturdayData[selectedUserForSaturday] = saturdayWorkDates[selectedUserForSaturday] || [];
                              localStorage.setItem('saturdayWorkDates', JSON.stringify(allSaturdayData));
                            } else {
                              const error = await response.json();
                              alert(`❌ 오류: ${error.error}`);
                            }
                          } catch (error) {
                            alert(`❌ 오류: ${error}`);
                            console.error('저장 오류:', error);
                          }
                        }}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
                      >
                        토요일 근무 일정 저장
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'department' && canManageStaff && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
             {/* 부서별 계정 생성 Form */}
             <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Hash className="w-5 h-5 text-purple-600" />
                    부서별 계정 생성
                </h3>
                <form onSubmit={handleCreateDeptAccount} className="space-y-6">
                    
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                        <p className="text-sm text-purple-800">
                            <span className="font-bold">부서별 계정</span>은 특정 부서에서 메시지를 공유하는 용도입니다.
                            <br/>연차 관리 없이 메시지 전송만 가능합니다.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">아이디 <span className="text-red-500">*</span></label>
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 focus-within:ring-2 focus-within:ring-purple-500">
                                <span className="px-4 py-3 bg-purple-100 text-purple-700 font-bold whitespace-nowrap">dept_</span>
                                <input 
                                    type="text" 
                                    value={deptAccountId}
                                    onChange={(e) => setDeptAccountId(e.target.value)}
                                    placeholder="예: marketing"
                                    className="flex-1 px-4 py-3 bg-slate-50 outline-none"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">부서 계정 ID는 자동으로 <span className="font-bold">dept_</span> 접두사가 붙습니다.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">부서명 <span className="text-red-500">*</span></label>
                            <input 
                                type="text" 
                                value={selectedDeptForAccount}
                                onChange={(e) => setSelectedDeptForAccount(e.target.value)}
                                placeholder="예: 원무과, IT팀"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-2">비밀번호</label>
                        <input 
                            type="text" 
                            value={deptAccountPassword}
                            onChange={(e) => setDeptAccountPassword(e.target.value)}
                            placeholder="부서 계정 비밀번호 설정"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">이 비밀번호로 부서 계정에 로그인합니다.</p>
                    </div>

                    <button 
                        type="submit"
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-600/20"
                    >
                        부서별 계정 생성
                    </button>
                </form>
             </div>

             {/* 부서별 계정 목록 */}
             <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-600" />
                    생성된 부서별 계정
                </h3>
                
                {departmentAccountsList.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-slate-300 mb-2 text-3xl">∅</div>
                        <p className="text-slate-500">생성된 부서별 계정이 없습니다.</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {departmentAccountsList.map(account => {
                            const deptStaff = Object.values(allUsers).filter(u => 
                                u.department === account.department && !u.isDepartmentAccount
                            );
                            return (
                            <div key={account.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <img src={account.avatar} alt="" className="w-10 h-10 rounded-full" />
                                        <div>
                                            <p className="font-bold text-slate-800">{account.department}</p>
                                            <p className="text-xs text-slate-500">{account.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                const password = prompt(`${account.department} 계정의 비밀번호:`, account.password || '');
                                                if (password !== null && password !== account.password) {
                                                    onUpdateUser(account.id, { password });
                                                }
                                            }}
                                            className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors"
                                        >
                                            비밀번호 변경
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (confirm(`${account.department} 계정을 부서별 계정에서 해제하시겠습니까?`)) {
                                                    onUpdateUser(account.id, { isDepartmentAccount: false });
                                                }
                                            }}
                                            className="px-3 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold rounded-lg transition-colors"
                                        >
                                            해제
                                        </button>
                                        <button 
                                            onClick={() => confirmAndDelete(account)}
                                            className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition-colors"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                                {deptStaff.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <p className="text-xs font-bold text-slate-600 mb-2">📋 같은 부서 직원 ({deptStaff.length}명)</p>
                                        <div className="flex flex-wrap gap-2">
                                            {deptStaff.map(staff => (
                                                <span key={staff.id} className="text-xs bg-white px-2 py-1 rounded border border-slate-300 text-slate-700 font-medium">
                                                    {staff.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                )}
             </div>
          </div>
        )}
        
        {activeTab === 'logs' && canViewLogs && (
          <div className="max-w-4xl mx-auto">
             <div className="bg-slate-900 text-green-400 p-6 rounded-xl font-mono text-sm h-[600px] overflow-y-auto shadow-inner">
                {logs.length === 0 && <p className="opacity-50">로그 기록이 없습니다.</p>}
                {logs.map(log => (
                  <div key={log.id} className="mb-2 border-b border-slate-800 pb-2 last:border-0">
                    <span className="text-slate-500">[{log.timestamp.toLocaleTimeString()}]</span>{' '}
                    <span className="text-blue-400 font-bold">{log.action}</span>{' '}
                    <span className="text-slate-300">by {log.actorId}</span>
                    <p className="pl-4 text-slate-400 mt-1">↳ {log.details}</p>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
