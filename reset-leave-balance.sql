-- 25205 직원의 연차 잔액 초기화
DELETE FROM user_leave_balances WHERE user_id = '25205';

-- 확인
SELECT user_id, annual_minutes, remain_minutes, used_minutes FROM user_leave_balances WHERE user_id = '25205';
