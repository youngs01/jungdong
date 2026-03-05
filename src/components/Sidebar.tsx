
import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, Settings, Users, Activity, LogOut, Shield, Megaphone, Menu, MoreHorizontal, X, Download } from 'lucide-react';
import { User, UserRole } from '../types';
import { LOGO_URL } from '../constants';
import { normalizeProfileImageUrl } from '../services/db';

type View = 'chat' | 'leave' | 'colleagues' | 'settings' | 'admin' | 'notice';

interface SidebarProps {
  currentView: View;
  currentUser: User;
  onChangeView: (view: View) => void;
  onLogout: () => void;
  unreadTotal: number;
  hasNewNotice: boolean;
  pendingApprovalsCount: number;
  onInstallApp?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  currentUser, 
  onChangeView, 
  onLogout, 
  unreadTotal, 
  hasNewNotice, 
  pendingApprovalsCount,
  onInstallApp
}) => {
  const [imgError, setImgError] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  useEffect(() => {
    setImgError(false);
  }, [LOGO_URL]);

  const canAccessAdmin = currentUser.role === UserRole.DIRECTOR || 
                         currentUser.role === UserRole.ADMIN ||
                         (currentUser.isManager && (currentUser.department.includes('총무') || currentUser.department.includes('기획') || currentUser.department.includes('IT')));

  const isDepartmentAccount = currentUser.id.startsWith('dept_') || currentUser.isDepartmentAccount === true;

  const navItems = [
    { id: 'notice', label: '홈', icon: Megaphone, badge: hasNewNotice ? 'N' : 0 },
    { id: 'chat', label: '메시지', icon: MessageSquare, badge: unreadTotal },
    { id: 'leave', label: isDepartmentAccount ? '부서 일정' : '근태관리', icon: Calendar, badge: pendingApprovalsCount },
    { id: 'colleagues', label: '주소록', icon: Users },
  ];

  const moreItems = [
    { id: 'settings', label: '설정', icon: Settings },
    { id: 'logout', label: '로그아웃', icon: LogOut, action: onLogout }
  ];

  if (canAccessAdmin) {
    moreItems.unshift({ id: 'admin', label: '관리자', icon: Shield });
  }

  const hasAnyAlert = unreadTotal > 0 || hasNewNotice || pendingApprovalsCount > 0;

  return (
    <>
      <div className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col h-full transition-all duration-300 shadow-xl z-20">
        <div className="p-6 flex items-center gap-3 border-b border-slate-700">
          <div className={`bg-white rounded-xl relative shadow-lg shadow-black/20 group cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden shrink-0 ${imgError ? 'bg-blue-600 p-2.5' : 'p-1.5'}`}>
            {!imgError ? (
              <img 
                key={LOGO_URL}
                src={LOGO_URL} 
                alt="Logo" 
                className="w-8 h-8 object-contain" 
                onError={() => setImgError(true)}
                referrerPolicy="no-referrer"
              />
            ) : (
              <Activity className="w-5 h-5 text-white" />
            )}
            {hasAnyAlert && (
               <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-slate-900"></span>
               </span>
            )}
          </div>
          <span className="text-xl font-bold tracking-tight text-white">정동병원</span>
        </div>

        <div className="p-4 flex items-center gap-3 border-b border-slate-800 bg-slate-800/50">
           <img src={normalizeProfileImageUrl(currentUser.avatar)} className="w-9 h-9 rounded-full border-2 border-slate-600 object-cover" alt="Profile" />
           <div className="overflow-hidden">
               <p className="text-sm font-bold truncate text-slate-100">{currentUser.name}</p>
               <p className="text-xs text-slate-400 truncate">{currentUser.department} {currentUser.jobTitle?.replace(/[0]+$/, '')}</p>
           </div>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id as View)}
                className={`flex items-center gap-3 p-3.5 rounded-xl transition-all relative group
                  ${isActive 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white hover:translate-x-1'}
                `}
              >
                <item.icon className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className={`font-medium text-sm ${isActive ? 'font-bold' : ''}`}>{item.label === '홈' ? '공지사항' : item.label}</span>
                {item.badge ? (
                  <span className={`
                      absolute top-1/2 -translate-y-1/2 right-3 
                      text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.2rem] flex items-center justify-center shadow-sm
                      ${item.badge === 'N' ? 'bg-amber-500 ring-1 ring-amber-400/50' : 'bg-red-500 ring-1 ring-red-400/50'}
                  `}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-2">
           {onInstallApp && (
             <button 
                onClick={onInstallApp}
                className="flex items-center gap-3 p-3 rounded-xl w-full transition-all bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-600/20 mb-2"
             >
                <Download className="w-5 h-5 shrink-0" />
                <span className="font-bold text-sm">App 설치하기</span>
             </button>
           )}
           {moreItems.map(item => (
              <button 
                key={item.id}
                onClick={() => item.action ? item.action() : onChangeView(item.id as View)}
                className={`flex items-center gap-3 p-3 rounded-xl w-full transition-colors
                  ${currentView === item.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}
                `}>
                <item.icon className={`w-5 h-5 shrink-0 ${item.id === 'logout' ? 'group-hover:text-red-400' : ''}`} />
                <span className="font-medium text-sm">{item.label}</span>
             </button>
           ))}
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-50/95 backdrop-blur-xl border-t border-slate-200 flex justify-around items-end pt-2 px-2 z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] h-[84px] safe-area-bottom" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
         {navItems.map((item) => {
             const isActive = currentView === item.id;
             return (
                 <button 
                    key={item.id}
                    onClick={() => onChangeView(item.id as View)}
                    className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 group ${isActive ? '-translate-y-1' : ''}`}
                 >
                     {isActive && (
                        <div className="absolute -top-2 w-10 h-1 bg-blue-600 rounded-full shadow-[0_0_12px_rgba(37,99,235,0.6)] animate-in fade-in zoom-in duration-300" />
                     )}
                     <div className={`p-2 rounded-2xl transition-all duration-300 ${isActive ? 'text-blue-600 bg-blue-100/50' : 'text-slate-400 hover:text-slate-600'}`}>
                        <item.icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                     </div>
                     <span className={`text-[10px] font-black transition-colors ${isActive ? 'text-blue-700' : 'text-slate-400'}`}>
                         {item.label}
                     </span>
                     {item.badge ? (
                        <span className={`
                            absolute top-2 right-1/4 min-w-[1rem] h-4
                            text-white text-[9px] font-bold px-1 rounded-full flex items-center justify-center border border-white shadow-sm
                            ${item.badge === 'N' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}
                        `}>
                          {item.badge}
                        </span>
                      ) : null}
                 </button>
             )
         })}
         <button 
            onClick={() => setShowMobileMenu(true)}
            className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 group ${showMobileMenu ? '-translate-y-1' : ''}`}
         >
             <div className={`p-2 rounded-2xl transition-colors ${showMobileMenu ? 'bg-slate-200 text-slate-800' : 'text-slate-400'}`}>
                <Menu className="w-6 h-6" />
             </div>
             <span className="text-[10px] font-black text-slate-400">전체</span>
         </button>
      </div>

      {showMobileMenu && (
          <div className="md:hidden fixed inset-0 z-[60] flex items-end justify-center safe-area-top safe-area-bottom">
              <div 
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                  onClick={() => setShowMobileMenu(false)}
              />
              <div 
                  className="bg-white w-full rounded-t-[32px] p-6 animate-in slide-in-from-bottom-10 duration-300 relative shadow-2xl ring-1 ring-slate-200/50 max-h-[70vh] overflow-y-auto safe-area-bottom"
                  onClick={(e) => e.stopPropagation()}
                  style={{ paddingBottom: 'max(6rem, env(safe-area-inset-bottom) + 1.5rem)' }}
              >
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8" />
                  <div className="flex items-center gap-4 mb-8 p-5 bg-gradient-to-r from-slate-50 to-white rounded-3xl border border-slate-100 shadow-sm ring-1 ring-slate-100">
                       <div className="relative">
                          <img src={normalizeProfileImageUrl(currentUser.avatar)} className="w-14 h-14 rounded-full border-2 border-white shadow-md object-cover" alt="Profile" />
                       </div>
                       <div>
                           <div className="flex items-center gap-2 mb-0.5">
                              <p className="font-bold text-xl text-slate-800">{currentUser.name}</p>
                           </div>
                           <p className="text-sm text-slate-500 font-medium">{currentUser.department} {currentUser.jobTitle?.replace(/[0]+$/, '')}</p>
                       </div>
                  </div>
                  <h3 className="text-sm font-bold text-slate-400 mb-4 px-2">메뉴</h3>
                  <div className="grid grid-cols-3 gap-4 mb-8">
                      {onInstallApp && (
                        <button
                          onClick={() => { setShowMobileMenu(false); onInstallApp(); }}
                          className="flex flex-col items-center justify-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 active:scale-95 transition-all"
                        >
                          <div className="p-3.5 rounded-full shadow-sm bg-white text-blue-600">
                              <Download className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-bold text-blue-600">App 설치</span>
                        </button>
                      )}
                      {moreItems.map(item => (
                          <button
                             key={item.id}
                             onClick={() => {
                                 setShowMobileMenu(false);
                                 item.action ? item.action() : onChangeView(item.id as View);
                             }}
                             className="flex flex-col items-center justify-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 active:scale-95 transition-all"
                          >
                              <div className={`p-3.5 rounded-full shadow-sm ${item.id === 'logout' ? 'bg-red-100 text-red-600' : 'bg-white text-blue-600'}`}>
                                  <item.icon className="w-6 h-6" />
                              </div>
                              <span className="text-xs font-bold text-slate-600">{item.label}</span>
                          </button>
                      ))}
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => setShowMobileMenu(false)} className="p-3 rounded-full bg-slate-100 text-slate-400 active:bg-slate-200">
                        <X className="w-6 h-6" />
                    </button>
                  </div>
              </div>
          </div>
      )}
    </>
  );
};
