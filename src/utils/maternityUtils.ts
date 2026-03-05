/**
 * 고용노동부 지침 기반 모성보호제도 유틸리티
 * 
 * 참고 규정:
 * - 모성보호 규정: 근로기준법 제72-78조
 * - 육아휴직법: 「남녀고용평등과 일·가정 양립 지원에 관한 법률」
 * - 최신 지침: 2024년 고용노동부 모성보호 지침
 */

export enum MaternityBenefitType {
  SHORTENED_WORK = 'SHORTENED_WORK',     // 임신기 근로시간 단축
  PRENATAL = 'PRENATAL',                 // 산전휴가
  POSTNATAL = 'POSTNATAL',               // 산후휴가
  PARENTAL = 'PARENTAL'                  // 육아휴직
}

/**
 * 현재 날짜 기준으로 단축 근무 대상자인지 확인
 * @param user - 사용자 정보
 * @param checkDate - 확인 날짜 (기본값: 오늘)
 * @returns {boolean}
 */
export function checkIsShortenedWorker(
  user: any,
  checkDate: Date = new Date()
): boolean {
  if (!user.is_shortened_work) return false;
  
  const start = new Date(user.shortened_start_date);
  const end = new Date(user.shortened_end_date);
  
  return checkDate >= start && checkDate <= end;
}

/**
 * 비례 차감 시간 계산 (고용노동부 지침)
 * 
 * 임신기 근로시간 단축자는 정상 근무자(8시간)보다 2시간 덜 근무(6시간)합니다.
 * 같은 시간의 휴가를 사용해도 비례 원칙에 따라 더 많은 연차를 차감합니다.
 * 
 * 예시:
 * - 정상 근무자가 반차(4시간)를 쓰면: 4시간 차감
 * - 단축 근무자가 반차(실제 3시간)를 쓰면: 3h * (8/6) = 4시간 차감
 * 
 * @param leaveType - 'FULL' | 'HALF' | 'MIN_30'
 * @param isShortenedWorker - 단축 근무 여부
 * @returns {number} deductedMinutes - 차감할 연차 (분)
 */
export function calculateProportionalDeduction(
  leaveType: 'FULL' | 'HALF' | 'MIN_30',
  isShortenedWorker: boolean
): number {
  let actualMinutes = 0;
  
  if (isShortenedWorker) {
    // 단축 근무자 (6시간 근무)
    switch (leaveType) {
      case 'FULL': actualMinutes = 360; break; // 6시간
      case 'HALF': actualMinutes = 180; break; // 3시간
      case 'MIN_30': actualMinutes = 30; break; // 30분
    }
  } else {
    // 정상 근무자 (8시간 근무)
    switch (leaveType) {
      case 'FULL': actualMinutes = 480; break; // 8시간
      case 'HALF': actualMinutes = 240; break; // 4시간
      case 'MIN_30': actualMinutes = 30; break; // 30분
    }
  }
  
  // 비례 계수: 정상 근무자(8h) 기준 / 단축 근무자(6h) 기준
  const ratio = isShortenedWorker ? 8 / 6 : 1;
  
  return Math.round(actualMinutes * ratio);
}

/**
 * 모성보호 특별 휴가 검증
 * @param benefitType - PRENATAL | POSTNATAL | PARENTAL | SHORTENED_WORK
 * @param startDate - 시작일
 * @param endDate - 종료일
 * @returns {Object} {valid: boolean, message: string, maxDays?: number}
 */
export function validateMaternityBenefit(
  benefitType: string,
  startDate: Date,
  endDate: Date
): { valid: boolean; message: string; maxDays?: number } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  switch (benefitType) {
    case 'MATERNITY': {
      // 출산휴가: 총 90일 (2025년 개정: 산전휴가 + 산후휴가 통합)
      // 고용기준법 제72조
      if (durationDays > 90) {
        return { 
          valid: false, 
          message: '출산휴가는 최대 90일입니다.',
          maxDays: 90
        };
      }
      break;
    }
    
    case 'PARENTAL': {
      // 육아휴직: 각 부모당 최대 1년 (365일), 부모 동시 지원 시 최대 1년 3개월 (455일)
      // 남녀고용평등과 일·가정 양립 지원에 관한 법률 제19조
      // 일단 최대값으로 455일 허용 (배우자 동시 지원 경우)
      if (durationDays > 455) {
        return { 
          valid: false, 
          message: '육아휴직은 배우자 동시 지원 시 최대 1년 3개월(455일)입니다. 배우자가 없으면 최대 1년(365일)입니다.',
          maxDays: 455
        };
      }
      if (durationDays < 30) {
        return {
          valid: false,
          message: '육아휴직은 1회당 최소 30일 이상이어야 합니다.',
          maxDays: 455
        };
      }
      break;
    }
    
    case 'SHORTENED_WORK': {
      // 근로시간 단축: 최대 1일 2시간, 주 10시간
      // 고용기준법 제73조
      // 각 일별로 검증하는 것은 프론트에서 처리
      break;
    }
  }
  
  return { valid: true, message: '' };
}

/**
 * 모성보호 혜택 기간이 겹치는지 확인
 * @param benefits - 기존 모성보호 혜택 배열
 * @param newStart - 새로운 시작일
 * @param newEnd - 새로운 종료일
 * @param excludeId - 제외할 ID (수정 시)
 * @returns {boolean}
 */
export function hasOverlappingBenefit(
  benefits: any[],
  newStart: Date,
  newEnd: Date,
  excludeId?: string
): boolean {
  return benefits.some(benefit => {
    if (excludeId && benefit.id === excludeId) return false;
    
    const start = new Date(benefit.start_date);
    const end = new Date(benefit.end_date);
    
    return !(newEnd < start || newStart > end);
  });
}

/**
 * 분을 시간:분 형식으로 포맷
 * @param minutes - 분 단위
 * @returns {string}
 */
export function formatMinutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
}

/**
 * 분을 일, 시간, 분으로 포맷
 * @param minutes - 분 단위
 * @returns {string}
 */
export function formatMinutesToDayHourMin(minutes: number): string {
  const days = Math.floor(minutes / (8 * 60));
  const remainMinutes = minutes % (8 * 60);
  const hours = Math.floor(remainMinutes / 60);
  const mins = remainMinutes % 60;
  
  let result = '';
  if (days > 0) result += `${days}일`;
  if (hours > 0) result += ` ${hours}시간`;
  if (mins > 0) result += ` ${mins}분`;
  
  return result || '0분';
}

/**
 * 단축 근무 규칙 가져오기
 * @returns {Object}
 */
export function getShortenedWorkRules() {
  return {
    dailyMaxReduction: 2,        // 1일 최대 2시간 단축 가능
    weeklyMaxReduction: 10,      // 주 최대 10시간 단축 가능
    normalDailyHours: 8,         // 정상 일일 근무 시간
    shortenedDailyHours: 6,      // 단축 시 일일 근무 시간
    maxDuration: 365,            // 최대 기간 (일)
    description: '임신 중 1일 최대 2시간(주 10시간) 근무시간을 단축할 수 있습니다.',
  };
}

/**
 * 출산휴가 규칙 가져오기 (2025년 개정: 산전+산후 통합 → 총 90일)
 * @returns {Object}
 */
export function getMaternityLeaveRules() {
  return {
    totalDays: 90,               // 총 90일 (산전 45일 + 산후 45일)
    prepartumDays: 45,           // 산전 45일
    postpartumDays: 45,          // 산후 45일
    minWeeksBefore: 4,           // 최소 4주 전부터
    isPaidFully: true,           // 전체 유급
    description: '출산 예정일 4주 전부터 출산 후 45일까지 총 90일의 유급 휴가를 사용할 수 있습니다.',
  };
}

/**
 * 육아휴직 규칙 가져오기 (2025년 기준)
 * 
 * 실제 규칙:
 * - 각 부모당 개별 사용: 최대 1년 (365일)
 * - 부모 동시 지원: 각각 최대 1년 3개월 (455일)
 * - 부부 합산: 최대 2년 6개월
 * 
 * @returns {Object}
 */
export function getParentalLeaveRules() {
  return {
    minChildAge: 8,              // 자녀 만 8세 이하
    maxDaysPerParent: 365,       // 각 부모당 최대 1년(365일)
    maxDaysPerParentWithBenefit: 455,  // 배우자 동시 지원 시 각 1년 3개월(455일)
    maxDaysCombined: 910,        // 부부 합산 최대 2년 6개월(910일)
    minUsagePerTime: 30,         // 1회 최소 30일
    isPaid: false,               // 무급 (단, 고용보험 구직급여 지급)
    benefitRate: 0.8,            // 고용보험 급여는 평균 임금의 80%
    benefitCap: 2500000,         // 월 최대 250만 원 (2025년 기준)
    simultaneousBonus: 90,       // 배우자 동시 지원 시 추가 기간 (각 45일 × 2 = 90일)
    description: '만 8세 이하 또는 초등학교 2학년 이하 자녀가 있는 근로자가 신청 가능합니다.\n각 부모는 최대 1년씩 사용 가능하며,\n배우자가 동시에 사용하는 경우 각각 추가 기간(최대 1년 3개월)을 사용할 수 있습니다.',
  };
}

/**
 * 비례 차감 설명 텍스트 생성
 * @param isShortenedWorker - 단축 근무 여부
 * @returns {string}
 */
export function getProportionalDeductionExplanation(isShortenedWorker: boolean): string {
  if (!isShortenedWorker) {
    return '정상 근무 기준(8시간)으로 연차가 차감됩니다.';
  }
  
  return '임신기 근로시간 단축자(6시간 근무)로 인해 비례 원칙이 적용됩니다. ' +
         '실제 근무 시간 대비 정상 근무자와 동일한 수준의 연차가 차감됩니다. ' +
         '(차감 시간 = 실제 휴무 시간 × 8/6)';
}
