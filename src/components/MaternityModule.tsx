/**
 * 모성보호제도 관리 컴포넌트
 * LeaveModule에 통합할 수 있는 별도 탭
 */

import React, { useState, useEffect } from 'react';
import { Plus, Calendar, AlertCircle, CheckCircle, Clock, Heart } from 'lucide-react';
import { MaternityBenefit, MaternityBenefitType } from '../types';
import { dbService } from '../services/db';
import {
  getShortenedWorkRules,
  getMaternityLeaveRules,
  getParentalLeaveRules,
  validateMaternityBenefit,
  formatMinutesToTime,
} from '../utils/maternityUtils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface MaternityModuleProps {
  currentUserId: string;
  allUsers: Record<string, any>;
}

export const MaternityModule: React.FC<MaternityModuleProps> = ({
  currentUserId,
  allUsers
}) => {
  const [benefits, setBenefits] = useState<MaternityBenefit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedBenefitType, setSelectedBenefitType] = useState<MaternityBenefitType>(
    MaternityBenefitType.SHORTENED_WORK
  );
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // 모성보호 혜택 로드
  useEffect(() => {
    loadBenefits();
  }, [currentUserId]);

  const loadBenefits = async () => {
    try {
      const data = await dbService.getUserMaternityBenefits(currentUserId);
      setBenefits(data.filter(b => b.status === 'ACTIVE'));
    } catch (e) {
    }
  };

  const handleSubmit = async () => {
    setError('');

    // 입력 검증
    if (!startDate || !endDate) {
      setError('시작일과 종료일을 선택해주세요.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }

    // 모성보호 혜택 검증
    const validation = validateMaternityBenefit(
      selectedBenefitType,
      new Date(startDate),
      new Date(endDate)
    );

    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setLoading(true);

    try {
      const benefit: MaternityBenefit = {
        id: `maternity_${currentUserId}_${Date.now()}`,
        userId: currentUserId,
        benefitType: selectedBenefitType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isPaid: ['MATERNITY', 'SHORTENED_WORK'].includes(selectedBenefitType),
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await dbService.saveMaternityBenefit(benefit);
      
      setBenefits([benefit, ...benefits]);
      setShowForm(false);
      setStartDate('');
      setEndDate('');
    } catch (e) {
      setError('저장 실패: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getBenefitLabel = (type: MaternityBenefitType): string => {
    const labels: Record<MaternityBenefitType, string> = {
      [MaternityBenefitType.SHORTENED_WORK]: '임신기 근로시간 단축',
      [MaternityBenefitType.MATERNITY]: '출산휴가 (산전+산후)',
      [MaternityBenefitType.PARENTAL]: '육아휴직',
    };
    return labels[type];
  };

  const getIcon = (type: MaternityBenefitType) => {
    const icons: Record<MaternityBenefitType, React.ReactNode> = {
      [MaternityBenefitType.SHORTENED_WORK]: <Clock className="w-5 h-5 text-blue-500" />,
      [MaternityBenefitType.MATERNITY]: <Calendar className="w-5 h-5 text-pink-500" />,
      [MaternityBenefitType.PARENTAL]: <Heart className="w-5 h-5 text-purple-500" />,
    };
    return icons[type];
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">모성보호제도</h3>
          <p className="text-sm text-gray-600 mt-1">
            고용노동부 지침 기반 임신·출산·육아 지원
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          <Plus className="w-4 h-4" />
          신규 등록
        </button>
      </div>

      {/* 신청 폼 */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-4">모성보호 혜택 신청</h4>

          {/* 혜택 유형 선택 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              혜택 유형
            </label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(MaternityBenefitType).map(([key, type]) => (
                <button
                  key={type}
                  onClick={() => setSelectedBenefitType(type as MaternityBenefitType)}
                  className={`p-3 rounded-lg border-2 transition text-sm font-medium ${
                    selectedBenefitType === type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {getBenefitLabel(type as MaternityBenefitType)}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 선택 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                시작일
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                종료일
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 규칙 표시 */}
          {selectedBenefitType && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 whitespace-pre-wrap">
                <strong>안내:</strong> {
                  selectedBenefitType === MaternityBenefitType.SHORTENED_WORK 
                    ? '임신 중 1일 최대 2시간(주 10시간) 근무시간을 단축할 수 있습니다.'
                    : selectedBenefitType === MaternityBenefitType.MATERNITY
                    ? '2025년 개정: 출산휴가 총 90일(산전 45일 + 산후 45일)을 유급으로 사용할 수 있습니다.'
                    : '각 부모는 최대 1년씩, 배우자와 동시 사용 시 각 1년 3개월까지 가능합니다.\n부부 합산 최대 2년 6개월 사용 가능합니다.'
                }
              </p>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? '저장 중...' : '신청'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 활성 혜택 목록 */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-800">현재 적용 중인 혜택</h4>
        
        {benefits.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-600">
            <p className="text-sm">현재 적용 중인 모성보호 혜택이 없습니다.</p>
          </div>
        ) : (
          benefits.map((benefit) => (
            <div
              key={benefit.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
            >
              <div className="flex items-start gap-3">
                {getIcon(benefit.benefitType)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-800">
                      {getBenefitLabel(benefit.benefitType)}
                    </h5>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        benefit.isPaid
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {benefit.isPaid ? '유급' : '무급'}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mt-1">
                    {format(benefit.startDate, 'yyyy년 M월 d일', { locale: ko })} ~{' '}
                    {format(benefit.endDate, 'yyyy년 M월 d일', { locale: ko })}
                  </p>

                  {/* 기간 바 */}
                  <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 참고 사항 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h5 className="font-semibold text-yellow-900 mb-2">📋 2025년 개정사항 및 주요 규칙</h5>
        <ul className="text-sm text-yellow-800 space-y-2 list-disc list-inside">
          <li>
            <strong>출산휴가:</strong> 산전+산후 통합 → 총 90일 유급 (산전 45일 + 산후 45일)
          </li>
          <li>
            <strong>육아휴직:</strong> 각 부모당 최대 1년, 배우자 동시 지원 시 각 최대 1년 3개월
            <ul className="list-disc list-inside ml-4 mt-1 text-xs">
              <li>개인 사용: 최대 1년 (365일)</li>
              <li>부모 동시 지원: 각 최대 1년 3개월 (455일)</li>
              <li>부부 합산: 최대 2년 6개월 (910일)</li>
              <li>1회 최소: 30일 이상</li>
            </ul>
          </li>
          <li>
            <strong>육아휴직 급여:</strong> 무급이지만 고용보험 구직급여 지급 (평균임금의 80%, 월 최대 250만원)
          </li>
          <li>
            <strong>근로시간 단축:</strong> 기존 규칙 유지 - 1일 최대 2시간, 주 최대 10시간
          </li>
          <li>상세한 내용은 인사팀에 문의하시기 바랍니다.</li>
        </ul>
      </div>
    </div>
  );
};
