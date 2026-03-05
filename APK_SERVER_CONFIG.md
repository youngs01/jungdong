# APK 앱 서버 설정 가이드

## 문제

다른 컴퓨터에서는 웹이 잘 작동하지만, **APK 앱(모바일)에서는 안 되는 이유**:

1. **localhost는 모바일에서 작동하지 않음** - 각 기기의 로컬 주소를 의미하므로
2. **고정 IP 주소 문제** - 서버 IP가 변경되면 접속 불가
3. **자체 서명 인증서(Self-signed Certificate) 문제** - HTTPS 연결 실패
4. **네트워크 격리** - 모바일이 다른 네트워크에 연결되어 있으면 접속 불가

## 해결 방법

### 1️⃣ 앱 내 서버 설정 (권장)

APK 앱을 실행한 후:

1. **설정 탭** → **APK 서버 설정 (모바일 앱)** 섹션 찾기
2. 서버 주소 입력:
   - **같은 WiFi 네트워크**: `192.168.0.230` (또는 서버의 실제 IP)
   - **외부 네트워크**: `hospital.com` (도메인 사용)
3. **저장 및 테스트** 버튼 클릭
4. ✓ 연결 성공 메시지 확인

### 2️⃣ 포트 포워딩 (동일 기기에서 테스트)

스마트폰과 서버가 같은 기기에 있을 경우:

```bash
# Android Studio 연결 시
adb forward tcp:3000 tcp:3000

# 그 후 앱에서 설정: localhost
```

### 3️⃣ 서버 IP 찾기

#### Linux/Mac:
```bash
ifconfig
# 또는
hostname -I
```

#### Windows:
```cmd
ipconfig
```

**IPv4 주소** 찾기 (예: `192.168.0.230`)

### 4️⃣ 외부 접속 설정

**도메인이나 고정 IP를 사용하려면:**

```env
# .env.production
VITE_API_URL=https://hospital.com:3000
```

그 후 빌드:
```bash
npm run build
npm run cap:copy
npm run apk:debug
```

## 자체 서명 인증서 처리

APK는 자체 서명 인증서(Self-signed SSL)를 자동으로 허용하도록 설정되어 있습니다.

(**mainActivity.kt** 참고)

## API 엔드포인트 검증

### 헬스 체크 엔드포인트:
```bash
curl -k https://192.168.0.230:3000/health
# 응답: {"status":"ok","timestamp":"..."}
```

### 사용자 조회:
```bash
curl -k https://192.168.0.230:3000/api/users
```

## 테스트 단계

1. ✅ 웹 브라우저에서 테스트
   ```
   https://localhost:3000
   ```

2. ✅ 같은 기기의 다른 포트에서 테스트
   ```
   https://192.168.0.230:3000
   ```

3. ✅ 모바일 기기로 테스트
   - APK 설정 → 서버 주소 입력 → 저장 및 테스트

## 자주 묻는 질문 (FAQ)

**Q: "연결 실패"가 나와요**
- A: 방화벽 확인, 포트 3000 열려있는지 확인
  ```bash
  sudo ufw allow 3000
  ```

**Q: HTTPS 에러가 나와요**
- A: `-k` 플래그로 인증서 검증 건너뛰기 (개발 환경용)

**Q: 네트워크가 자주 바뀌어요**
- A: 앱의 설정 탭에서 매번 서버 주소를 입력하면 됨

**Q: 도메인으로 접속하고 싶어요**
- A: HTTPS 인증서 설치 후 .env 수정 필요

## 번역 요약 (만약 영문이 필요하면)

- **APK Server Configuration Guide**
- **Same WiFi Network**: IP address (e.g., 192.168.0.230)
- **External Network**: Domain name (e.g., hospital.com)
- **Test Connection**: Click "Save & Test" button

---

**수정 날짜**: 2026년 1월 30일
**작성자**: Copilot
