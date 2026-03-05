import React, { useState } from 'react';
import { Notice, User, UserRole } from '../types';
import { Bell, Megaphone, Plus, Trash2, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface NoticeModuleProps {
  notices: Notice[];
  currentUser: User;
  allUsers: Record<string, User>;
  onCreateNotice: (notice: Partial<Notice>) => void;
  onDeleteNotice: (id: string) => void;
}

export const NoticeModule: React.FC<NoticeModuleProps> = ({ notices, currentUser, allUsers, onCreateNotice, onDeleteNotice }) => {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isImportant, setIsImportant] = useState(false);

  // Can Write: Admin, Director, Dept Head, or Manager (Team Leader and above)
  const canWrite = currentUser.role === UserRole.ADMIN || 
                   currentUser.role === UserRole.DIRECTOR || 
                   currentUser.isDeptHead || 
                   currentUser.isManager;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateNotice({
      title,
      content,
      isImportant,
      authorId: currentUser.id,
      createdAt: new Date(),
      views: 0
    });
    setShowForm(false);
    setTitle('');
    setContent('');
    setIsImportant(false);
  };

  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-200 flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <Megaphone className="w-6 h-6 text-blue-600" />
             공지사항
           </h2>
           <p className="text-slate-500">병원 주요 소식 및 전달사항</p>
        </div>
        {canWrite && !showForm && (
          <button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
          >
            <Plus className="w-5 h-5" />
            공지 작성
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          
          {showForm && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
               <h3 className="font-bold text-lg mb-4">새 공지사항 작성</h3>
               <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <input 
                      type="text" 
                      placeholder="제목을 입력하세요" 
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      required
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <textarea 
                      placeholder="내용을 입력하세요" 
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      required
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-40 resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="important"
                      checked={isImportant}
                      onChange={e => setIsImportant(e.target.checked)}
                      className="w-5 h-5 rounded text-red-600 focus:ring-red-500"
                    />
                    <label htmlFor="important" className="text-slate-700 font-medium cursor-pointer">중요 공지로 설정 (상단 강조)</label>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">취소</button>
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">등록</button>
                  </div>
               </form>
            </div>
          )}

          <div className="space-y-4">
             {notices.length === 0 ? (
               <div className="text-center py-20 text-slate-400">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>등록된 공지사항이 없습니다.</p>
               </div>
             ) : (
               notices.map(notice => {
                 const author = allUsers[notice.authorId];
                 
                 // Delete Permission Logic
                 const isAuthor = currentUser.id === notice.authorId;
                 const isDirector = currentUser.role === UserRole.DIRECTOR;
                 const isAdmin = currentUser.role === UserRole.ADMIN;
                 const isGaManager = currentUser.department.includes('총무') && currentUser.isManager;
                 const isPlanningManager = currentUser.department.includes('기획') && currentUser.isManager;
                 
                 const canDelete = isAuthor || isDirector || isGaManager || isAdmin || isPlanningManager;

                 return (
                   <div key={notice.id} className={`bg-white p-6 rounded-xl border shadow-sm transition-all hover:shadow-md ${notice.isImportant ? 'border-l-4 border-l-red-500 border-slate-200 bg-red-50/10' : 'border-slate-200'}`}>
                      <div className="flex justify-between items-start mb-3">
                         <div className="flex items-center gap-2">
                            {notice.isImportant && (
                              <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> 중요
                              </span>
                            )}
                            <h3 className="font-bold text-lg text-slate-800">{notice.title}</h3>
                         </div>
                         <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               {format(notice.createdAt, 'yyyy.MM.dd HH:mm')}
                            </span>
                            {canDelete && (
                              <button onClick={() => onDeleteNotice(notice.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                         </div>
                      </div>
                      <p className="text-slate-600 whitespace-pre-wrap leading-relaxed mb-4">{notice.content}</p>
                      <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                         <img src={author?.avatar} className="w-6 h-6 rounded-full" alt="" />
                         <span className="text-xs font-bold text-slate-700">{author?.name}</span>
                         <span className="text-xs text-slate-400">{author?.department} {author?.jobTitle}</span>
                      </div>
                   </div>
                 );
               })
             )}
          </div>
        </div>
      </div>
    </div>
  );
};