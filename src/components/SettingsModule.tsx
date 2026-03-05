import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { Lock, Save, CheckCircle, Upload, RefreshCw } from 'lucide-react';
import { normalizeProfileImageUrl, getApiBase } from '../services/db';

const API_BASE = getApiBase();

interface SettingsModuleProps {
  currentUser: User;
  onUpdateProfile: (updates: Partial<User>) => void;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({ currentUser, onUpdateProfile }) => {
  const [name, setName] = useState(currentUser.name);
  const [jobTitle, setJobTitle] = useState(currentUser.jobTitle || '');
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [previewAvatar, setPreviewAvatar] = useState(currentUser.avatar);
  const [password, setPassword] = useState(currentUser.password || '');

  const [showToast, setShowToast] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [latestUser, setLatestUser] = useState<User>(currentUser);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isDepartmentAccount = currentUser.isDepartmentAccount === true;

  // 최신 사용자 정보 조회
  useEffect(() => {
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
          }
        }
      } catch (error) {
        // silently handle error
      }
    };

    fetchLatestUser();
    const interval = setInterval(fetchLatestUser, 30000);
    return () => clearInterval(interval);
  }, [currentUser.id]);

  // Update local state when prop changes
  useEffect(() => {
    setName(currentUser.name);
    setJobTitle(currentUser.jobTitle || '');
    setAvatar(currentUser.avatar);
    setPreviewAvatar(normalizeProfileImageUrl(currentUser.avatar));
    setPassword(currentUser.password || '');
    setImageLoadFailed(false);
  }, [currentUser]);

  // 기본 아바타 생성
  const getDefaultAvatar = () => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  };

  const handleSave = () => {
    onUpdateProfile({ name, jobTitle, password });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };


  const generateAvatar = () => {
    setAvatar(getDefaultAvatar());
    setPreviewAvatar(getDefaultAvatar());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 체크 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 파일은 5MB 이하여야 합니다.');
      return;
    }

    // 파일 타입 체크
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      alert('jpg, png, gif, webp 형식만 지원합니다.');
      return;
    }

    try {
      setIsUploading(true);

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        setPreviewAvatar(base64Data);
        setImageLoadFailed(false);
      };
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('profileImage', file);

      const uploadUrl = `${API_BASE}/users/${currentUser.id}/profile-image`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errorMessage = `업로드 실패 (${response.status})`;
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setAvatar(data.imageUrl);
      setPreviewAvatar(data.imageUrl);
      
      onUpdateProfile({ avatar: data.imageUrl });
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      alert(`프로필 이미지 업로드 중 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsUploading(false);
    }

    // 파일 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full bg-white rounded-2xl p-8 border border-slate-200 shadow-sm overflow-y-auto relative">
      {showToast && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 z-50">
           <CheckCircle className="w-5 h-5 text-green-400" />
           <span className="font-bold">성공적으로 저장되었습니다!</span>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6 text-slate-800">내 정보 수정</h2>
      
      <div className="max-w-xl">
        <div className="mb-8 flex flex-col items-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
           {imageLoadFailed ? (
             <div className="w-24 h-24 rounded-full border-4 border-white shadow-md mb-4 bg-slate-300 flex items-center justify-center text-xs text-slate-600 font-bold text-center">
               이미지 로드 실패
             </div>
           ) : (
             <img 
               src={previewAvatar} 
               alt="Profile" 
               className="w-24 h-24 rounded-full border-4 border-white shadow-md mb-4 object-cover bg-slate-200" 
               onError={() => {
                   setImageLoadFailed(true);
               }}
               onLoad={() => {
                   setImageLoadFailed(false);
               }}
             />
           )}
           <p className="font-bold text-lg">{name}</p>
           <p className="text-blue-600 font-medium">{jobTitle || currentUser.role}</p>
           <p className="text-slate-500 text-sm">{currentUser.department}</p>
           
           {latestUser.works_saturday && latestUser.saturday_work_dates && latestUser.saturday_work_dates.length > 0 && (
             <div className="mt-4 w-full p-3 bg-orange-50 border border-orange-200 rounded-lg">
               <p className="text-xs font-bold text-orange-700 mb-2">📅 토요근무 일정</p>
               <div className="flex flex-wrap gap-2">
                 {(latestUser.saturday_work_dates as string[]).map(date => {
                   const [year, month, day] = date.split('-').map(Number);
                   const displayDate = new Date(year, month - 1, day).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
                   return (
                     <span key={date} className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded font-medium">
                       {displayDate}
                     </span>
                   );
                 })}
               </div>
             </div>
           )}
        </div>

        <div className="space-y-6">
           <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                disabled={isDepartmentAccount}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" 
              />
              {isDepartmentAccount && <p className="text-xs text-slate-500 mt-1">부서별 계정은 이름을 수정할 수 없습니다.</p>}
           </div>

           <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">직책</label>
              <input 
                type="text" 
                value={jobTitle} 
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={isDepartmentAccount}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" 
                placeholder="예: 원무과장"
              />
              {isDepartmentAccount && <p className="text-xs text-slate-500 mt-1">부서별 계정은 직책을 수정할 수 없습니다.</p>}
           </div>

           <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">프로필 이미지</label>
              <div className="flex gap-2 mb-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isDepartmentAccount}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  <Upload className="w-4 h-4" />
                  {isUploading ? '업로드 중...' : '이미지 업로드'}
                </button>
                <button 
                  onClick={generateAvatar}
                  disabled={isUploading || isDepartmentAccount}
                  className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="이름 기반 자동 생성"
                >
                  <RefreshCw className={`w-5 h-5 ${isUploading ? '' : ''}`} />
                </button>
              </div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isUploading || isDepartmentAccount}
                className="hidden"
              />
              <p className="text-xs text-slate-500">
                ✓ jpg, png, gif, webp 형식 지원 (최대 5MB)<br/>
                ✓ 업로드 후 자동으로 서버에 저장됩니다
                {isDepartmentAccount && <><br/>✗ 부서별 계정은 이미지를 변경할 수 없습니다.</>}
              </p>
           </div>


           <div className="pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <Lock className="w-4 h-4 text-slate-400" />
                 보안 설정
              </h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">새 비밀번호</label>
                <input 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    placeholder="변경할 비밀번호를 입력하세요"
                />
              </div>
           </div>

           <div className="pt-4 space-y-4">
              <button 
                onClick={handleSave}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                변경사항 저장
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};
