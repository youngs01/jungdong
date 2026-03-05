
import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, MessageSquare, ArrowLeft, Plus, Trash2, X, Image as ImageIcon, FileText, CheckCircle } from 'lucide-react';
import { ChatSession, Message, User } from '../types';
import { normalizeProfileImageUrl } from '../services/db';

interface ChatModuleProps {
  currentUser: User;
  allUsers: Record<string, User>;
  chats: ChatSession[];
  messages: Record<string, Message[]>;
  activeChatId: string | null;
  onSelectChat: (chatId: string | null) => void;
  onSendMessage: (chatId: string, content: string, attachments?: File[]) => void;
  onDeleteMessage: (messageId: string, chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onMarkRead: (chatId: string) => void;
  onCreateGroup: (name: string, participantIds: string[]) => void;
  onStartDirectChat: (targetUserId: string) => void;
}

export const ChatModule: React.FC<ChatModuleProps> = ({ 
  currentUser, 
  allUsers,
  chats, 
  messages,
  activeChatId,
  onSelectChat, 
  onSendMessage,
  onDeleteMessage,
  onDeleteChat,
  onMarkRead,
  onCreateGroup,
  onStartDirectChat
}) => {
  const [inputText, setInputText] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isDirectChatModalOpen, setIsDirectChatModalOpen] = useState(false);
  
  // Group Create State
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  // Ref definitions
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedChat = chats.find(c => c.id === activeChatId);
  const currentMessages = activeChatId ? messages[activeChatId] || [] : [];

  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    }
  };

  useEffect(() => {
    if (activeChatId) {
      scrollToBottom(true);
      onMarkRead(activeChatId);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (currentMessages.length > 0) {
      scrollToBottom();
    }
  }, [currentMessages.length]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  const handleSend = () => {
    if ((!inputText.trim()) || !activeChatId) return;
    const textToSend = inputText;
    setInputText('');
    onSendMessage(activeChatId, textToSend);
    if ('vibrate' in navigator) {
      navigator.vibrate(10); 
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleDeleteMessage = (messageId: string, chatId: string) => {
    if (window.confirm('메시지를 삭제하시겠습니까?')) {
      onDeleteMessage(messageId, chatId);
    }
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (window.confirm('채팅방을 나가시겠습니까? 대화 기록이 내 목록에서만 사라집니다.')) {
      onDeleteChat(chatId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
        if (window.innerWidth >= 768) {
          e.preventDefault();
          handleSend();
        }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && activeChatId) {
      onSendMessage(activeChatId, "", Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getParticipantName = (chat: ChatSession) => {
    if (chat.type === 'group') return chat.name;
    const otherId = chat.participants.find(p => p !== currentUser.id);
    return (otherId && allUsers[otherId]) ? allUsers[otherId].name : '사용자 없음';
  };

  const getParticipantAvatar = (chat: ChatSession) => {
      if (chat.type === 'group') return null;
      const otherId = chat.participants.find(p => p !== currentUser.id);
      return (otherId && allUsers[otherId]) ? allUsers[otherId].avatar : null;
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  // 온라인 상태 판별 (마지막 신호가 15초 이내인 경우)
  const isUserOnline = (user: User) => {
    if (!user.lastSeen) return false;
    const lastSeen = new Date(user.lastSeen).getTime();
    const now = Date.now();
    return now - lastSeen < 15000; 
  };

  return (
    <div className="flex h-full bg-white md:rounded-2xl overflow-hidden shadow-sm border border-slate-200 ring-1 ring-slate-200/50 relative">
      
      {/* 1:1 채팅 시작 모달 */}
      {isDirectChatModalOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85%] border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">1:1 채팅 시작</h3>
              <button onClick={() => setIsDirectChatModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-2">
              {Object.values(allUsers).filter(u => u.id !== currentUser.id).map(user => {
                const online = isUserOnline(user);
                return (
                  <div 
                    key={user.id}
                    onClick={() => {
                      onStartDirectChat(user.id);
                      setIsDirectChatModalOpen(false);
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-xl hover:bg-blue-50 cursor-pointer border border-transparent hover:border-blue-200 transition-all active:bg-blue-100"
                  >
                    <div className="relative">
                      <img src={user.avatar} className="w-12 h-12 rounded-full bg-slate-200 object-cover shadow-sm" alt="" />
                      <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-colors duration-500 ${online ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-800">{user.name}</p>
                        <span className={`text-[9px] font-black px-1 py-0.5 rounded leading-none border uppercase tracking-tighter ${online ? 'text-green-600 bg-green-50 border-green-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                          {online ? 'online' : 'offline'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{user.department} {user.jobTitle}</p>
                      {/* 토요근무 표시 */}
                      {user.works_saturday && user.saturday_work_dates && user.saturday_work_dates.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(user.saturday_work_dates as string[]).slice(0, 2).map((date, idx) => (
                            <span key={idx} className="text-[8px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                              {new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            </span>
                          ))}
                          {user.saturday_work_dates.length > 2 && (
                            <span className="text-[8px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                              +{user.saturday_work_dates.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {Object.values(allUsers).length <= 1 && (
                <p className="text-center text-slate-400 py-8 text-sm">채팅할 동료가 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 그룹 채팅 생성 모달 */}
      {isGroupModalOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85%] border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">새 그룹 채팅</h3>
              <button onClick={() => setIsGroupModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wide">채팅방 이름</label>
                <input 
                  value={groupName} 
                  onChange={e => setGroupName(e.target.value)} 
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                  placeholder="예: 간호 2팀 공지방"
                  autoFocus
                />
              </div>
              
              <div>
                 <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wide">대화 상대 초대 ({selectedUserIds.length}명)</label>
                 <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                   {Object.values(allUsers).filter(u => u.id !== currentUser.id).map(user => {
                     const online = isUserOnline(user);
                     return (
                       <div 
                          key={user.id} 
                          onClick={() => toggleUserSelection(user.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${selectedUserIds.includes(user.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50 border-transparent'}`}
                       >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selectedUserIds.includes(user.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                              {selectedUserIds.includes(user.id) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <div className="relative">
                            <img src={user.avatar} className="w-10 h-10 rounded-full bg-slate-200 object-cover shadow-sm" alt="" />
                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-1.5 border-white shadow-sm transition-colors duration-500 ${online ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className={`font-bold text-sm ${selectedUserIds.includes(user.id) ? 'text-blue-700' : 'text-slate-800'}`}>{user.name}</p>
                              <span className={`text-[8px] font-black px-0.5 py-0.5 rounded leading-none border uppercase tracking-tighter ${online ? 'text-green-600 bg-green-50 border-green-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                {online ? 'online' : 'offline'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">{user.department} {user.jobTitle?.replace(/[0]+$/, '')}</p>
                          </div>
                       </div>
                     );
                   })}
                   {Object.values(allUsers).length <= 1 && (
                     <p className="text-center text-slate-400 py-4 text-sm">초대할 동료가 없습니다.</p>
                   )}
                 </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button 
                disabled={!groupName.trim() || selectedUserIds.length === 0}
                onClick={() => {
                   onCreateGroup(groupName, selectedUserIds);
                   setIsGroupModalOpen(false);
                   setGroupName('');
                   setSelectedUserIds([]);
                }}
                className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 active:scale-[0.98]"
              >
                채팅방 만들기
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`w-full md:w-80 border-r border-slate-200 flex flex-col ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 md:p-5 border-b border-slate-100 bg-white sticky top-0 z-10 shadow-sm">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-2xl font-black text-slate-900 tracking-tight">메시지</h2>
             <div className="relative group">
               <button 
                  className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all shadow-md active:scale-90"
               >
                  <Plus className="w-6 h-6" />
               </button>
               <div className="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                 <button 
                   onClick={() => setIsDirectChatModalOpen(true)}
                   className="w-full text-left px-4 py-3 hover:bg-blue-50 first:rounded-t-lg text-slate-800 font-medium text-sm transition-colors"
                 >
                   1:1 채팅 시작
                 </button>
                 <div className="border-t border-slate-100"></div>
                 <button 
                   onClick={() => setIsGroupModalOpen(true)}
                   className="w-full text-left px-4 py-3 hover:bg-blue-50 last:rounded-b-lg text-slate-800 font-medium text-sm transition-colors"
                 >
                   그룹 채팅 만들기
                 </button>
               </div>
             </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="사람 또는 채팅방 검색" 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all border-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50 bg-white">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
               <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
               <p className="text-xs font-medium">대화 목록이 비어있습니다</p>
            </div>
          ) : (
            chats.map(chat => {
              const isActive = activeChatId === chat.id;
              const avatarUrl = getParticipantAvatar(chat);
              const chatName = getParticipantName(chat);
              const chatMsgs = messages[chat.id] || [];
              const lastMsg = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length-1] : null;
              const unreadCount = chatMsgs.filter(m => m.senderId !== currentUser.id && (!m.readBy || !m.readBy.includes(currentUser.id))).length;

              // 삭제된 메시지일 경우 미리보기 텍스트 변경
              const lastMsgContent = lastMsg?.isDeleted ? "삭제된 메시지입니다." : (lastMsg?.content || chat.lastMessage);

              return (
                <div 
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`p-4 flex gap-4 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-all group relative ${isActive ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="relative shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-14 h-14 rounded-[20px] object-cover shadow-sm ring-1 ring-slate-100" />
                    ) : (
                      <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                        {chatName ? chatName[0] : '?'}
                      </div>
                    )}
                    {unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full font-black border-2 border-white animate-bounce-short shadow-sm">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h3 className={`font-bold truncate text-[15px] ${isActive ? 'text-blue-700' : 'text-slate-900'}`}>
                          {chatName}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-medium font-sans">
                        {lastMsg ? lastMsg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${unreadCount > 0 ? 'text-slate-900 font-bold' : 'text-slate-500'} ${lastMsg?.isDeleted ? 'italic text-slate-400' : ''}`}>
                      {lastMsgContent}
                    </p>
                  </div>

                  {/* 채팅방 삭제 버튼 (목록) */}
                  <button 
                    onClick={(e) => handleDeleteChat(e, chat.id)}
                    className="absolute right-2 bottom-2 p-2 bg-white/90 text-slate-400 hover:text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="대화방 나가기"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {activeChatId && selectedChat ? (
        <>
          <div className="flex flex-col bg-slate-100 md:flex md:flex-col md:flex-1 z-40 md:z-auto md:relative animate-in slide-in-from-right-10 duration-300 md:safe-area-top overflow-hidden" style={{ height: '100%' }}>
            <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0 z-10 shadow-sm">
            <div className="flex items-center gap-1">
               <button onClick={() => onSelectChat(null)} className="md:hidden p-2 -ml-2 text-slate-600 active:bg-slate-100 rounded-full transition-colors">
                  <ArrowLeft className="w-6 h-6" />
               </button>
               <div className="flex items-center gap-3">
                   <div className="relative">
                       {getParticipantAvatar(selectedChat) ? (
                         <img src={getParticipantAvatar(selectedChat)!} className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-slate-100" alt="" />
                       ) : (
                         <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shadow-sm ring-1 ring-blue-50">
                           {getParticipantName(selectedChat)[0]}
                         </div>
                       )}
                   </div>
                   <div>
                       <h3 className="font-black text-slate-900 text-[15px] md:text-base leading-tight">{getParticipantName(selectedChat)}</h3>
                       <div className="flex items-center gap-1.5 mt-0.5">
                          {selectedChat.type === 'direct' && (
                            (() => {
                              const otherId = selectedChat.participants.find(p => p !== currentUser.id);
                              const otherUser = otherId ? allUsers[otherId] : null;
                              const isOnline = otherUser ? isUserOnline(otherUser) : false;
                              return (
                                <>
                                  <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-tighter ${isOnline ? 'text-green-600' : 'text-slate-400'}`}>
                                    {isOnline ? 'online' : 'offline'}
                                  </span>
                                </>
                              );
                            })()
                          )}
                          {selectedChat.type === 'group' && (
                            <>
                              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">group</span>
                            </>
                          )}
                       </div>
                   </div>
               </div>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <button className="hover:text-slate-600 p-2 active:bg-slate-50 rounded-full transition-all"><Search className="w-5 h-5" /></button>
              {/* 채팅방 삭제 버튼 (헤더) */}
              <button 
                onClick={(e) => handleDeleteChat(e, selectedChat.id)}
                className="hover:text-red-500 p-2 active:bg-red-50 rounded-full transition-all"
                title="채팅방 나가기"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-slate-100/50 backdrop-blur-sm">
            {currentMessages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              const sender = allUsers[msg.senderId];
              const totalParticipants = selectedChat.participants.length;
              const readByCount = msg.readBy ? msg.readBy.length : 0;
              const unreadCount = totalParticipants - readByCount;

              return (
                <div key={msg.id} className={`flex gap-2.5 group items-end ${isMe ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  {!isMe && (
                    <img src={normalizeProfileImageUrl(sender?.avatar) || 'https://ui-avatars.com/api/?name=?&background=random'} alt={sender?.name} className="w-9 h-9 rounded-[14px] self-start mt-1 shadow-sm object-cover ring-1 ring-slate-200" />
                  )}
                  <div className={`max-w-[75%] md:max-w-[65%] space-y-1`}>
                    {!isMe && <p className="text-[11px] font-black text-slate-500 ml-1 mb-0.5">{sender?.name || '알 수 없음'}</p>}
                    <div className="relative">
                      <div className={`p-3 md:p-3.5 rounded-2xl shadow-sm break-words relative transition-all active:scale-[0.98] ring-1 ${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-tr-none ring-blue-500' 
                            : 'bg-white text-slate-800 border-none rounded-tl-none ring-slate-200/50'
                        }`}>
                        {msg.isDeleted ? (
                            <p className="whitespace-pre-wrap text-[14px] leading-[1.5] font-medium text-slate-300 italic flex items-center gap-2">
                                <Trash2 className="w-3 h-3" /> 삭제된 메시지입니다.
                            </p>
                        ) : (
                            <>
                                {/* 첨부파일 렌더링 */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="space-y-2 mb-2">
                                        {msg.attachments.map((att, idx) => (
                                            <div key={idx} className="overflow-hidden rounded-lg">
                                                {att.type === 'image' ? (
                                                    <a href={att.url} download={att.name}>
                                                        <img src={att.url} alt="첨부 이미지" className="max-w-full max-h-60 object-cover rounded-lg border border-white/20" />
                                                    </a>
                                                ) : (
                                                    <a href={att.url} download={att.name} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${isMe ? 'bg-blue-700/50 hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200'}`}>
                                                        <div className={`p-2 rounded-lg ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-blue-600'}`}>
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <p className={`text-sm font-bold truncate ${isMe ? 'text-white' : 'text-slate-800'}`}>{att.name}</p>
                                                            <p className={`text-xs ${isMe ? 'text-blue-200' : 'text-slate-500'}`}>{att.size}</p>
                                                        </div>
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {msg.content && <p className="whitespace-pre-wrap text-[14px] leading-[1.5] font-medium">{msg.content}</p>}
                            </>
                        )}
                      </div>
                      
                      {/* 메시지 개별 삭제 버튼 (본인 메시지만, 삭제되지 않은 경우에만) */}
                      {isMe && !msg.isDeleted && (
                        <button 
                            onClick={() => handleDeleteMessage(msg.id, selectedChat.id)}
                            className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-100"
                            title="삭제"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    <div className={`flex items-end gap-1.5 mt-1 ${isMe ? 'justify-end mr-0.5' : 'ml-0.5'}`}>
                        {isMe && !msg.isDeleted && (
                            <span className="text-[10px] font-black italic">
                                {unreadCount > 0 ? (
                                    <span className="text-amber-500">{unreadCount}</span>
                                ) : (
                                    <span className="text-blue-500 opacity-80">읽음</span>
                                )}
                            </span>
                        )}
                        <p className="text-[10px] text-slate-400 font-bold font-sans">
                          {(() => {
                            const msgTime = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
                            return msgTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
                          })()}
                        </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          <div className="md:flex-shrink-0 md:mt-auto p-2 md:p-4 bg-white md:bg-white border-t border-slate-200 md:border-t md:border-slate-200 safe-area-bottom shadow-[0_-10px_30px_rgba(0,0,0,0.08)] md:shadow-sm md:static" style={{ height: 'auto' }}>
            <div className="flex items-end gap-2 max-w-5xl mx-auto md:w-full">
              <button 
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all mb-0.5 shrink-0 active:scale-90"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="w-6 h-6" />
              </button>
              
              <div className="flex-1 flex items-end bg-slate-100 rounded-[24px] border-2 border-transparent focus-within:bg-white focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all p-1 min-h-[44px]">
                <textarea 
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="메시지를 입력하세요" 
                  className="flex-1 bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400 resize-none max-h-32 px-4 py-2 text-[16px] font-medium leading-[1.4] md:text-[15px] no-scrollbar overflow-y-auto"
                  rows={1}
                />
              </div>

              <button 
                onClick={handleSend}
                disabled={!inputText.trim()}
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all mb-0.5 shrink-0 active:scale-90 shadow-lg ${
                  inputText.trim() 
                    ? 'bg-blue-600 text-white shadow-blue-600/30' 
                    : 'bg-slate-200 text-slate-400 shadow-none'
                }`}
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} multiple />
          </div>
          </div>
        </>
      ) : (
        <div className="flex-1 hidden md:flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 backdrop-blur-sm">
          <div className="w-24 h-24 bg-white rounded-[32px] shadow-sm flex items-center justify-center mb-6 border border-slate-200 ring-1 ring-slate-100 animate-pulse">
            <MessageSquare className="w-12 h-12 text-blue-300" />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">정동병원 메신저</h3>
          <p className="font-bold text-slate-400">왼쪽 대화 목록에서 채팅을 시작하세요</p>
        </div>
      )}
    </div>
  );
};
