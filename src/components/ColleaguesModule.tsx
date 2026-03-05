
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { Search, MessageSquare, Building2, UserCircle } from 'lucide-react';
import { normalizeProfileImageUrl, getApiBase } from '../services/db';

const API_BASE = getApiBase();

interface ColleaguesModuleProps {
  allUsers: Record<string, User>;
  currentUser: User;
  onStartDirectChat: (targetUserId: string) => void;
}

export const ColleaguesModule: React.FC<ColleaguesModuleProps> = ({ allUsers, currentUser, onStartDirectChat }) => {
  const [search, setSearch] = useState('');
  const [freshUsers, setFreshUsers] = useState<Record<string, User>>(allUsers);
  
  // 주소록 탭 로드 시 최신 사용자 정보 조회
  useEffect(() => {
    const fetchFreshUsers = async () => {
      try {
        const response = await fetch(`${API_BASE}/users`, {
          mode: 'cors',
          credentials: 'omit'
        });
        if (response.ok) {
          const users: User[] = await response.json();
          const usersMap = users.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as Record<string, User>);
          setFreshUsers(usersMap);
        }
      } catch (error) {
        // 실패 시 prop으로 받은 allUsers 사용
        setFreshUsers(allUsers);
      }
    };
    
    fetchFreshUsers();
  }, []);
  
  // allUsers prop이 변경될 때도 동기화
  useEffect(() => {
    setFreshUsers(allUsers);
  }, [allUsers]);
  
  
  const allUserArray = Object.values(freshUsers) as User[];
  const colleagues = allUserArray.filter(u => 
    u.id !== currentUser.id &&
    (u.name.includes(search) || u.department.includes(search) || (u.jobTitle || '').includes(search))
  );

  const departments = Array.from(new Set(colleagues.map(u => u.department)));

  // 온라인 상태 판별 (마지막 신호가 15초 이내인 경우)
  const isUserOnline = (user: User) => {
    if (!user.lastSeen) return false;
    const lastSeen = new Date(user.lastSeen).getTime();
    const now = Date.now();
    return now - lastSeen < 15000; 
  };

  // 프로필 이미지 URL 획득 (여러 시도로 강화)
  const getProfileImageSrc = (user: User): string => {
    const normalizedUrl = normalizeProfileImageUrl(user.avatar);
    
    if (normalizedUrl) {
      return normalizedUrl;
    }
    
    // 폴백: UI Avatars 사용
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&bold=true`;
  };

  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-4">
          <UserCircle className="w-7 h-7 text-blue-600" />
          직원 주소록
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="이름, 부서 또는 직책으로 검색하세요" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">
          {departments.length === 0 && search ? (
            <div className="text-center py-20 text-slate-400">검색 결과가 없습니다.</div>
          ) : (
            departments.map(dept => (
              <div key={dept} className="mb-8 last:mb-0">
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-4 px-2 uppercase tracking-wider">
                  <Building2 className="w-4 h-4" />
                  {dept}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {colleagues.filter(u => u.department === dept).map(user => {
                    const online = isUserOnline(user);
                    return (
                      <div key={user.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all group cursor-pointer" onClick={() => onStartDirectChat(user.id)}>
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <img 
                              src={getProfileImageSrc(user)} 
                              className="w-12 h-12 rounded-full object-cover border-2 border-slate-50 shadow-sm bg-slate-200" 
                              alt={user.name}
                              loading="lazy"
                              onError={(e) => {
                                // 이미지 로드 실패 시 폴백 아바타 설정
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&bold=true`;
                              }}
                            />
                            {/* 온라인 상태 표시등 */}
                            <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm transition-colors duration-500 ${online ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{user.name}</p>
                              <span className={`text-[9px] font-black px-1 py-0.5 rounded leading-none border uppercase tracking-tighter ${online ? 'text-green-600 bg-green-50 border-green-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                {online ? 'online' : 'offline'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mb-0 pb-0">{String(user.jobTitle || user.role)}</p>
                            {user.works_saturday === 1 && user.saturday_work_dates && Array.isArray(user.saturday_work_dates) && user.saturday_work_dates.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(user.saturday_work_dates as string[]).slice(0, 2).map((date, idx) => {
                                  const [year, month, day] = date.split('-').map(Number);
                                  const displayDate = new Date(year, month - 1, day).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
                                  return (
                                    <span key={idx} className="text-[8px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                                      {displayDate}
                                    </span>
                                  );
                                })}
                                {user.saturday_work_dates.length > 2 && (
                                  <span className="text-[8px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                                    +{user.saturday_work_dates.length - 2}
                                  </span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            className="p-3 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all active:scale-90"
                            title="채팅 시작"
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
