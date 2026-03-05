# 🔐 Let's Encrypt 자동 갱신 설정 요약

## ✅ 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| Certbot | ✅ 설치됨 | v2.9.0 |
| 자동 갱신 타이머 | ✅ 활성화됨 | 하루 2회 실행 |
| 보안 인증서 | ⏳ 준비 필요 | Let's Encrypt |
| 비용 | **무료** | 0원/년 |

---

## 🚀 빠른 시작 (3단계)

### 1️⃣ 자동 갱신 활성화 (1분)
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 2️⃣ SSL 인증서 발급 (5분)

#### A) Freenom에서 무료 도메인 획득
- https://www.freenom.com에 접속
- 원하는 도메인 등록 (예: hospital.tk)
- DNS A 레코드를 서버 IP(192.168.0.230)로 설정

#### B) Let's Encrypt에서 인증서 발급
```bash
# 도메인으로 발급
sudo certbot certonly --standalone \
  -d hospital.tk \
  -d www.hospital.tk \
  --agree-tos \
  -n \
  --email your-email@example.com
```

### 3️⃣ Nginx 설정 (10분)
```bash
sudo certbot --nginx -d hospital.tk
```

---

## 📊 자동 갱신 동작 원리

```
매일 자정과 정오에
       ↓
Certbot이 인증서 확인
       ↓
만료 30일 전이면?
    ↙        ↘
YES: 자동 갱신   NO: 넘어감
    ↓
Nginx 재로드
    ↓
✅ 인증서 최신 상태 유지
```

---

## 🔍 모니터링 방법

### 1️⃣ 인증서 상태 확인
```bash
# 현재 인증서 목록
sudo certbot certificates

# 결과 예시:
# Certificate Name: hospital.tk
# Domains: hospital.tk, www.hospital.tk
# Expiry Date: 2026-05-01 (59 days)
# Auto Renewal: Enabled
```

### 2️⃣ 갱신 로그 확인
```bash
# 최근 갱신 기록 (실시간)
sudo journalctl -u certbot.timer -f

# 또는
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### 3️⃣ 갱신 테스트 (마른 실행)
```bash
# 실제 갱신 없이 테스트
sudo certbot renew --dry-run

# 결과:
# Cert not due for renewal, but simulating renewal for cert...
# Renewal simulation succeeded
```

---

## 📋 인증서 발급 체크리스트

- [ ] Certbot 설치 확인: `sudo certbot --version`
- [ ] 포트 80, 443 열려있음: `sudo ss -tuln | grep -E ':80|:443'`
- [ ] Nginx 실행 중: `sudo systemctl status nginx`
- [ ] 도메인 준비: Freenom 또는 IP 주소 사용
- [ ] 인증서 발급: `sudo certbot certonly --standalone`
- [ ] Nginx 설정: `sudo certbot --nginx`
- [ ] 자동 갱신 활성화: `sudo systemctl enable certbot.timer`
- [ ] 갱신 테스트: `sudo certbot renew --dry-run`

---

## 🔧 고급 설정

### 자동 갱신 실패 시 알림 받기

```bash
# 1. 모니터링 스크립트 설정
bash /path/to/setup-certbot-monitoring.sh

# 2. 갱신 실패 로그 확인
tail -f /var/log/certbot-renewal-alert.log

# 3. (선택) 이메일 알림 추가
# /etc/letsencrypt/renewal-hooks/post/notify-failure.sh 수정
```

### 갱신 후 Node.js 자동 재시작

```bash
# /etc/letsencrypt/renewal-hooks/post/restart-services.sh
#!/bin/bash
systemctl reload nginx
# systemctl restart node  # 필요시 추가
```

---

## 🎯 연간 비용 절감

| 항목 | 기존 | Let's Encrypt | 절감액 |
|------|------|---------------|--------|
| SSL 인증서 | $99/년 | **무료** | **$99** |
| 수동 갱신 | 3시간/년 | **자동** | **3시간** |
| 신뢰성 | 보증 | ⭐⭐⭐⭐⭐ | 동급 |
| **총합** | **$99** | **$0** | **$99 절감** |

---

## ⚠️ 주의사항

### 1. 포트 80과 443 필수
- Let's Encrypt 챌린지 인증에 필요
- 방화벽에서 개방 필수

### 2. 도메인 또는 공인 IP 필요
- 사설 IP(192.168.0.x)로는 Let's Encrypt 미지원
- 공인 IP 또는 도메인 사용 필수

### 3. DNS 설정 필요 (도메인 사용 시)
- A 레코드: 도메인 → 서버 IP
- Let's Encrypt가 DNS를 통해 확인

---

## 📞 문제 해결

### "Connection refused"
```bash
# 포트 상태 확인
sudo ss -tuln | grep -E ':80|:443'

# Nginx 시작
sudo systemctl start nginx
```

### "Certificate verification failed"
```bash
# DNS 설정 확인
nslookup hospital.tk

# 또는
dig hospital.tk
```

### "Renewal failed"
```bash
# 로그 확인
sudo tail -100 /var/log/letsencrypt/letsencrypt.log

# 수동 갱신 시도
sudo certbot renew --force-renewal -v
```

---

## 🔗 유용한 링크

- [Let's Encrypt 공식 사이트](https://letsencrypt.org)
- [Certbot 문서](https://certbot.eff.org/docs/)
- [Freenom 무료 도메인](https://www.freenom.com)
- [SSL 검증](https://www.ssllabs.com/ssltest/)

---

## 📝 최종 체크리스트

**설정 직후:**
- [ ] `sudo systemctl status certbot.timer` 활성화 확인
- [ ] `sudo certbot certificates` 인증서 목록 확인
- [ ] `sudo certbot renew --dry-run` 갱신 테스트 성공

**월 1회:**
- [ ] 인증서 만료 일자 확인
- [ ] 갱신 로그 검토

**연 1회:**
- [ ] Let's Encrypt 약관 확인
- [ ] 보안 정책 업데이트 검토

---

**설정 완료일**: 2026년 1월 30일
**자동 갱신 활성화**: ✅ 예
**연간 비용**: **$0**
**신뢰 수준**: ⭐⭐⭐⭐⭐
