
import { User, UserRole, ChatSession, Message, LeaveRequest, LeaveStatus, LeaveType, LeaveStep, OvertimeRequest } from './types';

// Helper to set join date relative to now
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
};

// Updated to Google Drive Thumbnail URL which is more reliable for embedding
export const LOGO_URL = 'https://drive.google.com/thumbnail?id=1ZRxO4ViBK2dghRPf7RvqQUTyBJDDSfaR&sz=w1000';

// Admin User (System Administrator)
export const CURRENT_USER: User = {
  id: 'jungdong',
  name: '김관리',
  role: UserRole.ADMIN,
  jobTitle: '전산팀장',
  department: 'IT 관리팀',
  avatar: 'https://ui-avatars.com/api/?name=Admin&background=334155&color=fff',
  isManager: true,
  password: 'admin',
  joinDate: yearsAgo(5)
};

export const MOCK_USERS: Record<string, User> = {
  'jungdong': CURRENT_USER
};

export const INITIAL_CHATS: ChatSession[] = [];

export const INITIAL_MESSAGES: Record<string, Message[]> = {};

export const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [];

export const INITIAL_OVERTIME_REQUESTS: OvertimeRequest[] = [];

