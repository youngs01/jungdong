# 📱 APK 무수정 운영 최종 계획

## 🎯 최종 목표 달성 ✅

### 사용자가 원한 것
```
✅ 무료 도메인 + SSL 자동 갱신
✅ APK 수정 없이 영구 사용 가능
✅ 비용 0원
```

### 실현 방식
```
1️⃣ Freenom: 무료 도메인 (hospital.tk)
   └─ 갱신: 연 1회, 1분, 수동

2️⃣ Let's Encrypt: 무료 SSL 인증서
   └─ 갱신: 자동 (완전 자동화)

3️⃣ APK: 도메인 한 번 입력
   └─ 유지보수: 0 (수정 불필요)
```

---

## 📊 운영 요약

| 항목 | 초기 설정 | 월간 | 연간 |
|------|---------|------|------|
| **도메인** | 5분 | 0분 | 1분 |
| **SSL** | 5분 | 0분 | 0분 (자동) |
| **APK** | 2분 | 0분 | 0분 |
| **비용** | $0 | $0 | **$0** |

---

## 🚀 실행 순서

### 📅 Week 1: 초기 설정 (20분)

```
Day 1 - 도메인 등록 (5분)
├─ Freenom 가입: https://www.freenom.com
├─ 도메인 선택: hospital.tk (또는 다른 이름)
└─ 12개월 무료 선택 → 완료

Day 2 - DNS 설정 (5분)
├─ Freenom → hospital.tk 관리
├─ A 레코드 추가: 192.168.0.230 (또는 공인 IP)
└─ 반영 대기 (5-10분)

Day 3 - SSL 발급 (5분)
├─ 터미널: sudo certbot certonly --standalone -d hospital.tk
└─ 설정 자동 저장

Day 4 - Nginx 설정 (3분)
├─ 터미널: sudo certbot --nginx -d hospital.tk
└─ 자동 설정 완료

Day 5 - APK 설정 (2분)
├─ APK 실행 → 설정 탭
├─ 서버 주소: hospital.tk 입력
└─ 저장 및 테스트 → ✅ 완료!
```

---

## 🤖 자동 운영 계획

### 매달 (자동)
```
✓ SSL 갱신: Certbot이 자동 처리
  └─ 만료 30일 전부터 자동 갱신
  └─ 성공 시 Nginx 자동 재로드
```

### 매년 1월
```
⏰ Freenom 메일 수신 (만료 30일 전)
📧 제목: "Your domain hospital.tk is about to expire"

✅ 갱신 (1분)
1. https://www.freenom.com 접속
2. My Domains → hospital.tk
3. "Renew Domain" 클릭
4. 12개월 무료 선택 → 완료

📝 Note: APK는 수정 불필요!
```

---

## 💾 설정 파일 위치

### 도메인 관련
```
Freenom 계정: https://my.freenom.com
도메인: hospital.tk
갱신: 연 1회 수동
```

### SSL 인증서
```
위치: /etc/letsencrypt/live/hospital.tk/
자동 갱신: ✅ Certbot Timer
갱신 주기: 90일마다 (자동)
```

### APK 설정
```
저장 위치: sessionStorage (브라우저)
설정 값: hospital.tk
수정: 불필요 (한 번만!)
```

---

## 📱 APK 사용자 입장에서 보는 것

### 초기 설정 (1회)
```
┌──────────────────────────────────┐
│ 정동병원 메신저                  │
├──────────────────────────────────┤
│ 설정                             │
│                                  │
│ APK 서버 설정 (모바일 앱)        │
│ ┌──────────────────────────────┐ │
│ │ hospital.tk                  │ │
│ └──────────────────────────────┘ │
│ [저장 및 테스트]                │
│ ✅ 연결 성공!                   │
└──────────────────────────────────┘
```

### 이후 (영구)
```
✅ 도메인 한 번 입력 → 영구 사용
✅ SSL 자동 갱신 (사용자 몰래 진행)
✅ 도메인 자동 갱신 (Freenom에서 1분)
✅ 수정 불필요!
```

---

## 🔄 갱신 프로세스 다이어그램

```
Year 1                Year 2                Year 3
┌─────────┐         ┌─────────┐          ┌─────────┐
│ 초기설정 │         │ 갱신 필요│          │ 갱신 필요│
│ 20분    │         │ 1분     │          │ 1분     │
└────┬────┘         └────┬────┘          └────┬────┘
     │                   │                    │
     ├─ Freenom 도메인 등록                  │
     │  ✓ hospital.tk                        │
     │  ✓ 12개월 무료                        │
     │                                      │
     ├─ DNS A 레코드 설정                    │
     │  ✓ 192.168.0.230                    │
     │                                      │
     ├─ Let's Encrypt SSL 발급             │
     │  ✓ 무료 + 자동 갱신 활성화          │
     │                                      │
     ├─ APK 설정                           │
     │  ✓ 서버 주소: hospital.tk          │
     │                                      │
     └─ Freenom 메일 수신                   │
        "hospital.tk이 30일 후 만료"        │
        ↓                                    ↓
        클릭 1번으로 갱신                  클릭 1번으로 갱신
        (1분 소요)                         (1분 소요)
        ↓                                    ↓
        ✅ 또 1년 사용 가능                ✅ 또 1년 사용 가능
```

---

## ⚠️ 주의사항

### 중요!
```
1. Freenom 메일을 주기적으로 확인하세요
   (연 1회, 만료 30일 전 발송)

2. 메일을 놓치면 도메인이 만료됩니다
   (재등록 가능하지만 번거로움)

3. APK는 수정 불필요하지만,
   도메인 갱신은 수동입니다 (1분)
```

### 더 완전한 자동화를 원한다면
```
대안: DDNS (동적 DNS) 사용
└─ IP 자동 갱신: Duck DNS, No-IP 등
└─ 도메인도 자동 유지 가능
└─ 별도 설정 필요 (스크립트)
```

---

## 📋 최종 체크리스트

### 📝 준비물
- [ ] 이메일 계정 (Freenom 가입용)
- [ ] 서버 IP 주소 확인
- [ ] 터미널 접근 가능

### 🔧 설정 진행 상황
- [ ] Freenom 가입
- [ ] 도메인 등록 (hospital.tk)
- [ ] DNS A 레코드 설정
- [ ] Let's Encrypt SSL 발급
- [ ] Nginx 설정
- [ ] APK 설정 (서버 주소 입력)
- [ ] 갱신 테스트 (sudo certbot renew --dry-run)

### 📅 연간 일정
- [ ] 1월 1일: Freenom 메일 확인 준비
- [ ] 1월 30일: Freenom 메일 수신
- [ ] 1월 31일: 도메인 갱신 (1분)

---

## 🎓 자주 묻는 질문

### Q: 정말 수정 없이 쓸 수 있나요?
**A:** 네! 도메인만 갱신하면 APK는 그대로 사용 가능합니다.

### Q: 도메인 갱신을 잊으면?
**A:** 도메인이 만료되지만, Freenom에서 다시 등록 가능합니다.

### Q: 비용이 정말 무료?
**A:** 네, Freenom + Let's Encrypt = 완전 무료입니다.

### Q: IP 주소가 변경되면?
**A:** Freenom DNS 설정에서 새 IP로 업데이트하면 됩니다. (이 경우에도 APK는 수정 불필요)

### Q: 도메인 갱신을 자동화할 수 없나?
**A:** Freenom이 API를 제공하지 않아 완전 자동화는 불가능합니다. 하지만 1분만 투자하면 됩니다.

---

## 💡 프로 팁

### Freenom 메일을 달력에 등록
```
Google Calendar, Outlook 등에서:
- 매년 1월 1일 알림 설정
- "Freenom 도메인 갱신" 이벤트
- 미리 알림: 3일 전
```

### 복구 전략
```
도메인 만료 시:
1. Freenom에서 "재등록" 버튼 클릭
2. 12개월 무료 선택
3. 완료!

APK: 수정 불필요!
```

---

## 📞 문제 해결

### "DNS가 반영되지 않음"
```bash
# 캐시 지우기
sudo systemctl restart systemd-resolved

# 확인
nslookup hospital.tk
dig hospital.tk +nocmd +noall +answer
```

### "SSL 갱신 실패"
```bash
# 수동 갱신
sudo certbot renew --force-renewal -v

# 로그 확인
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### "도메인이 응답하지 않음"
```bash
# 포트 확인
sudo ss -tuln | grep -E ':80|:443'

# Nginx 상태
sudo systemctl status nginx

# 재시작
sudo systemctl restart nginx
```

---

## 🎉 완성!

### 최종 상태
```
┌─────────────────────────────────────┐
│ ✅ 무료 도메인 (hospital.tk)        │
│ ✅ 무료 SSL (Let's Encrypt)        │
│ ✅ 자동 SSL 갱신                   │
│ ✅ APK 수정 없음                   │
│ ✅ 비용 $0/년                      │
│ ✅ 운영 1분/년                     │
└─────────────────────────────────────┘
```

### 사용 방법
1. Freenom에서 연 1회 도메인 갱신 (1분)
2. SSL은 자동 갱신 (0분)
3. APK는 그대로 사용 (0분)

---

**작성일**: 2026년 1월 30일  
**상태**: ✅ 준비 완료  
**시작하기**: [FREE_DOMAIN_AUTO_RENEWAL.md](FREE_DOMAIN_AUTO_RENEWAL.md) 참조
