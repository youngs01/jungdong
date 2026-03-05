# Ubuntu 배포 가이드

## ✅ 배포 전 확인사항

### 1. 필수 파일 확인
```bash
# Ubuntu 서버에서 다음 파일이 존재하는지 확인
server/.env                      # 환경 변수
server/serviceAccountKey.json    # Firebase 설정
certs/cert.pem                   # SSL 인증서
certs/key.pem                    # SSL 개인키
build/                           # 빌드된 웹 앱
```

### 2. 서버 환경 변수 설정 (server/.env)
```env
# MySQL Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jungdong_hospital

# Server Configuration
PORT=3000
NODE_ENV=production

# HTTPS 설정
USE_HTTPS=true
BASE_URL=https://your.domain.com:3000

# Optional: separate database for leave/attendance
# (e.g. Neon Postgres connection string)
# LEAVE_DATABASE_URL=postgres://neondb_owner:...@ep-round-.../neondb?sslmode=require&channel_binding=require

# Firebase Configuration
FIREBASE_DATABASE_URL=
```

### 3. MySQL 데이터베이스 확인
```bash
# Ubuntu에서 MySQL 접속 확인
mysql -h localhost -u root -p jungdong_hospital
```

### 4. 필수 폴더 생성
```bash
mkdir -p server/uploads
chmod 755 server/uploads
```

### 5. Node.js 의존성 설치
```bash
cd messenger
npm install

cd server
npm install
```

### 6. HTTPS 인증서 (Let's Encrypt 프로덕션용)
```bash
# Ubuntu에서 자동 인식 경로
/etc/letsencrypt/live/your.domain.com/fullchain.pem
/etc/letsencrypt/live/your.domain.com/privkey.pem

# 로컬 테스트용 자체 서명 인증서도 지원
certs/cert.pem
certs/key.pem
```

## 🚀 서버 시작

### 개발 모드
```bash
cd server
npm run dev
```

### 프로덕션 모드 (권장)
```bash
cd server
NODE_ENV=production node index.js

# 또는 PM2 사용 (권장)
npm install -g pm2
pm2 start index.js --name "hospital-messenger"
pm2 save
pm2 startup
```

## 📝 포트 설정
- **API 서버**: 3000 (HTTPS)
- **WebSocket**: 같은 포트 (WSS)

## 🔧 트러블슈팅

### 포트 3000이 이미 사용 중인 경우
```bash
# 사용 중인 프로세스 확인
lsof -i :3000

# 해당 프로세스 종료
kill -9 <PID>
```

### 데이터베이스 연결 오류
```bash
# MySQL 상태 확인
systemctl status mysql

# MySQL 시작
systemctl start mysql
```

### HTTPS 인증서 오류
```bash
# 인증서 파일 권한 확인
ls -la /etc/letsencrypt/live/your.domain.com/

# 필요시 권한 수정
chmod 644 /etc/letsencrypt/live/your.domain.com/fullchain.pem
chmod 640 /etc/letsencrypt/live/your.domain.com/privkey.pem
```

## 📦 배포 완료 확인

### 1. 서버 상태 확인
```bash
curl https://your.domain.com:3000
# 응답: {"message": "API Server Running", "version": "1.0"}
```

### 2. 데이터베이스 연결 확인
```bash
# 서버 로그에서 "MySQL 데이터베이스 연결 성공!" 메시지 확인
```

### 3. WebSocket 연결 확인
```bash
# 브라우저 개발자 도구에서 WebSocket 연결 상태 확인
# Network 탭 > WS 필터 > wss://your.domain.com:3000
```

## 🔐 보안 설정

### 방화벽 설정
```bash
# 포트 3000 오픈
sudo ufw allow 3000/tcp

# 또는 nginx/apache 리버스 프록시 설정
```

### SSL 인증서 갱신
```bash
# Let's Encrypt 자동 갱신 설정
sudo certbot renew --dry-run
```

## ✅ 최종 체크리스트

- [ ] MySQL 데이터베이스 생성 및 확인
- [ ] .env 파일 설정 완료
- [ ] Firebase serviceAccountKey.json 확인
- [ ] SSL 인증서 배치 (Let's Encrypt or 로컬)
- [ ] npm install 완료
- [ ] uploads 폴더 생성 및 권한 설정
- [ ] 웹앱 빌드 파일 배치 (build/)
- [ ] 포트 3000 방화벽 오픈
- [ ] 서버 시작 및 로그 확인
