
export enum UserRole {
  DIRECTOR = '이사',
  DOCTOR = '의사',
  NURSE = '간호사',
  ADMIN = '관리자',
  STAFF = '직원',
  HOSPITAL_PRESIDENT = '병원장',
  MEDICAL_DIRECTOR = '원장'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  jobTitle?: string;
  password?: string;
  avatar: string;
  department: string;
  isManager?: boolean;
  isDeptHead?: boolean;
  joinDate?: Date;
  earnedLeaveHours?: number;
  lastSeen?: Date; // 마지막 접속 시간 추가
  saturday_work_dates?: string[]; // 토요근무 날짜 배열
  works_saturday?: number; // 토요근무 여부 (0 또는 1)
  isDepartmentAccount?: boolean; // 부서별 계정 여부
  parentDepartmentId?: string; // 부서별 계정의 경우 소속 부서 ID
  [key: string]: any; // 추가 필드 허용 (db에서 반환될 수 있는 예상치 못한 필드)
}

export interface DepartmentAccount {
  id: string;
  department: string;
  password: string;
  createdAt: Date;
  createdBy: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'document';
  url: string;
  size: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  isSystem?: boolean;
  readBy?: string[]; // 읽은 사용자 ID 배열
  readAtBy?: Record<string, Date>; // 사용자별 읽은 시간 정보
  isDeleted?: boolean; // 삭제 여부 플래그 추가
}

export interface ChatSession {
  id: string;
  name: string;
  participants: string[];
  lastMessage?: string;
  unreadCount: number;
  type: 'direct' | 'group';
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: Date;
  isImportant: boolean;
  views: number;
}

export enum LeaveType {
  ANNUAL = '연차',
  HALF_AM = '오전 반차',
  HALF_PM = '오후 반차',
  TIME = '시간 단위 연차',
  PREGNANCY_REDUCED = '임신기 근로시간 단축',
  SICK = '병가',
  PARENTAL = '육아휴직',
  MATERNITY = '출산 전후 휴가'
}

export enum MaternityBenefitType {
  SHORTENED_WORK = 'SHORTENED_WORK',     // 임신기 근로시간 단축 (최대 1일 2시간, 주 10시간)
  MATERNITY = 'MATERNITY',               // 출산휴가 (산전휴가 + 산후휴가 통합, 총 90일) - 2025년 개정
  PARENTAL = 'PARENTAL'                  // 육아휴직 (각 부모당 최대 1년, 동시 지원 시 1년 3개월) - 부부 분할 사용
}

export enum LeaveStatus {
  PENDING = '결재 진행중',
  APPROVED = '최종 승인',
  REJECTED = '반려됨'
}

export enum LeaveStep {
  MANAGER_APPROVAL = '팀장 승인 대기', 
  DEPT_HEAD_APPROVAL = '부장 승인 대기',
  PLANNING_TEAM_APPROVAL = '기획팀 승인 대기',
  DIRECTOR_APPROVAL = '이사 승인 대기',
  COMPLETED = '결재 완료'
}

export interface MaternityBenefit {
  id: string;
  userId: string;
  benefitType: MaternityBenefitType;
  startDate: Date;
  endDate: Date;
  isPaid: boolean;                  // 유급 여부
  spouseId?: string;                // 배우자 ID (동시 지원 시, 배우자와의 관계 추적)
  isSimultaneousWithSpouse?: boolean;  // 배우자와 동시 사용 여부
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserLeaveBalance {
  id: string;
  userId: string;
  annualMinutes: number;           // 연차 총 시간 (분)
  usedMinutes: number;             // 사용한 연차 (분)
  remainMinutes: number;           // 남은 연차 (분)
  shortenedWorkAdjustment: number; // 단축근무 시 조정된 분 (비례 차감)
  updatedAt: Date;
}

export interface LeaveDeductionLog {
  id: string;
  userId: string;
  leaveRequestId?: string;
  deductionType: 'NORMAL' | 'SHORTENED_WORKER' | 'MATERNITY' | 'PARENTAL';
  actualMinutes: number;           // 실제 휴무 시간 (분)
  deductedMinutes: number;         // DB에서 차감된 시간 (분)
  ratio: number;                   // 적용된 비례 계수 (1.0 또는 1.333...)
  isShortenedWorker: boolean;
  createdAt: Date;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  startTime?: string;
  endTime?: string;
  daysDeducted: number;
  earnedHoursUsed?: number;
  annualDaysUsed?: number;
  isAdvance?: boolean;
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
  currentStep: LeaveStep;
  rejectionReason?: string; // 반려 이유
  createdAt: Date;
  // 모성보호 관련 정보
  isMaternityRelated?: boolean;
  maternityBenefitId?: string;
}

export interface SaturdayShiftRequest {
  id: string;
  userId: string;
  date: Date;
  hours: number;
  status: LeaveStatus;
  currentStep: LeaveStep;
  rejectionReason?: string; // 반려 이유
  createdAt: Date;
}

export interface OvertimeRequest {
  id: string;
  userId: string;
  date: Date;
  hours: number;
  reason: string;
  status: LeaveStatus;
  currentStep: LeaveStep;
  rejectionReason?: string; // 반려 이유
  createdAt: Date;
}

export interface SystemLog {
  id: string;
  action: string;
  details: string;
  actorId: string;
  timestamp: Date;
}
