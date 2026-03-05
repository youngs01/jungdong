
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
// DB libraries: mysql2 for legacy/local MySQL, pg for Neon/Postgres
let mysql;
let pg;
const usePostgres = !!process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres');
if (usePostgres) {
  pg = require('pg');
} else {
  mysql = require('mysql2/promise');
}
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const admin = require('firebase-admin');
const fcmNotification = require('./fcmNotification');

const app = express();
const PORT = process.env.PORT || 3000;

// Firebase Admin SDK 초기화
// google-services.json 파일이 필요합니다
let firebaseInitialized = false;
try {
  // Firebase credentials can be provided via a file or an environment variable.
  // For production, set FIREBASE_CREDENTIALS to the JSON string and remove
  // serviceAccountKey.json from the repository entirely.
  let serviceAccount;
  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    // fall back to local file (should be ignored in git)
    serviceAccount = require('./serviceAccountKey.json');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
  });
  firebaseInitialized = true;
  console.log('✅ Firebase Admin SDK 초기화 성공');
} catch (error) {
  console.error('❌ Firebase Admin SDK 초기화 실패:', error.message);
  firebaseInitialized = false;
}

// 고정 BASE URL - 요청 호스트 헤더 기반으로 동적 생성
const getBaseUrl = (req) => {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL; // 프로덕션: 환경변수 우선
  }
  
  // 개발/로컬: 요청한 호스트명 기반으로 URL 생성
  const protocol = req.secure ? 'https' : 'http';
  const host = req.get('host'); // localhost:3001, 192.168.0.x:3001 등
  return host ? `${protocol}://${host}` : 'http://localhost:3001';
};

// BASE_URL 설정 (프로필 이미지 및 정적 파일용)
const BASE_URL = process.env.BASE_URL || 'https://192.168.0.230:3000';

// avatarUrl 정규화 helpers --------------------------------------------------
const normalizeAvatarUrl = (baseUrl, avatarUrl) => {
  if (!avatarUrl) return avatarUrl;
  let url = avatarUrl;
  if (url.startsWith('/uploads/')) {
    url = `${baseUrl}${url}`;
  }
  // HTTPS 페이지에서 HTTP 리소스를 로드할 경우 자동 업그레이드
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  return url;
};

// 업로드 디렉토리 설정
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer 설정 - 프로필 이미지 저장
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `profile-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다 (jpg, png, gif)'));
    }
  }
});

/**
 * [필독] 우분투 서버 설정 가이드
 */
// database configuration -- if DATABASE_URL is provided use Postgres, otherwise fall back to MySQL parameters
let dbConfig = {};
if (usePostgres) {
  // pg Pool will read from DATABASE_URL directly
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',  // must be provided via env var
    database: process.env.DB_NAME || 'jungdong_hospital',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };
}

// CORS 설정 - 출처 허용 목록을 환경변수로 관리
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) {
      // Postman이나 curl 같은 non-browser 요청
      return callback(null, true);
    }
    const allowedOrigins = [];
    if (process.env.CORS_ORIGINS) {
      // 환경변수에 콤마로 구분된 목록을 넣어 둘 수 있음
      allowedOrigins.push(...process.env.CORS_ORIGINS.split(',').map(o => o.trim()));
    }
    // 개발 편의를 위해 localhost 허용
    allowedOrigins.push('http://localhost:3000', 'http://localhost:3001');
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS 정책에 의해 차단됨')); // 브라우저가 에러를 보게 함
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  maxAge: 3600,
  optionsSuccessStatus: 200 // IE11 호환성
};


app.use(cors(corsOptions));

// OPTIONS 요청 명시적 처리 (Preflight 요청 해결)
app.options('*', cors(corsOptions));

// 단순 캐시 제어 미들웨어 (API 경로에만 적용)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(uploadsDir));

// 웹 앱 정적 파일 서빙 (messenger/build)
const buildDir = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));
}

// 루트 경로 핸들러
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/', (req, res) => {
  res.json({ message: 'API Server Running', version: '1.0' });
});

let pool;
let leavePool; // optional separate pool used for leave/attendance database

// helper that returns pool for leave/attendance operations; falls back to primary pool if not configured
const getLeavePool = () => leavePool || pool;

// helper: create a mysql-compatible wrapper around pg.Pool
const makePgCompatible = (pgPool) => {
  return {
    query: async (text, params) => {
      let newText = text;
      if (params && params.length) {
        let i = 0;
        newText = text.replace(/\?/g, () => '$' + (++i));
      }
      const res = await pgPool.query(newText, params);
      // return [rows, fields] to match mysql2 interface
      return [res.rows, res.fields];
    },
    getConnection: async () => {
      const client = await pgPool.connect();
      return {
        query: (text, params) => {
          let newText = text;
          if (params && params.length) {
            let i = 0;
            newText = text.replace(/\?/g, () => '$' + (++i));
          }
          return client.query(newText, params);
        },
        release: () => client.release()
      };
    }
  };
};

// MySQL datetime 형식으로 변환 (한국 시간 KST)
const formatDateForMySQL = (date) => {
  if (!date) return null;
  let d;
  if (typeof date === 'string') {
    d = new Date(date);
    if (isNaN(d.getTime())) return null;
  } else if (date instanceof Date) {
    d = date;
  } else {
    return null;
  }
  
  // UTC를 KST(+9시간)로 변환
  const kstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().replace('T', ' ').substring(0, 19);
};

const getKSTNow = () => {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
};

const initDb = async () => {
  try {
    // primary pool (messenger data)
    if (usePostgres) {
      const pgPool = new pg.Pool(dbConfig);
      pool = makePgCompatible(pgPool);
    } else {
      pool = mysql.createPool(dbConfig);
    }

    // secondary pool (leave/attendance) if configured
    if (process.env.LEAVE_DATABASE_URL) {
      const leaveUsePg = process.env.LEAVE_DATABASE_URL.startsWith('postgres');
      if (leaveUsePg) {
        const leavePgPool = new pg.Pool({
          connectionString: process.env.LEAVE_DATABASE_URL,
          ssl: { rejectUnauthorized: false }
        });
        leavePool = makePgCompatible(leavePgPool);
      } else {
        // assume mysql connection string parsed by mysql2
        const url = new URL(process.env.LEAVE_DATABASE_URL);
        leavePool = mysql.createPool({
          host: url.hostname,
          port: url.port,
          user: url.username,
          password: url.password,
          database: url.pathname.replace(/^\//, ''),
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });
      }
      console.log('🔗 Leave pool initialized from LEAVE_DATABASE_URL');
    }

    const connection = await pool.getConnection();
    console.log('-----------------------------------------');
    console.log(`🚀 데이터베이스 연결 성공! (${usePostgres ? 'Postgres' : 'MySQL'})`);
    console.log('-----------------------------------------');
    connection.release();

    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(50),
        jobTitle VARCHAR(100),
        department VARCHAR(100),
        avatar TEXT,
        isManager BOOLEAN DEFAULT FALSE,
        isDeptHead BOOLEAN DEFAULT FALSE,
        password VARCHAR(255),
        joinDate DATETIME,
        earnedLeaveHours DOUBLE DEFAULT 0,
        additional_leave_days INT DEFAULT 0,
        lastSeen DATETIME
      )`,
      `CREATE TABLE IF NOT EXISTS chats (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        participants JSON,
        lastMessage TEXT,
        unreadCount INT DEFAULT 0,
        type VARCHAR(20)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(50) PRIMARY KEY,
        chatId VARCHAR(50),
        senderId VARCHAR(50),
        content TEXT,
        timestamp DATETIME,
        attachments JSON,
        isSystem BOOLEAN DEFAULT FALSE,
        readBy JSON,
        isDeleted BOOLEAN DEFAULT FALSE,
        INDEX(chatId)
      )`,
      `CREATE TABLE IF NOT EXISTS leaves (
        id VARCHAR(50) PRIMARY KEY,
        userId VARCHAR(50),
        startDate DATETIME,
        endDate DATETIME,
        isAllDay BOOLEAN,
        startTime VARCHAR(10),
        endTime VARCHAR(10),
        daysDeducted DOUBLE,
        earnedHoursUsed DOUBLE,
        annualDaysUsed DOUBLE,
        type VARCHAR(50),
        reason TEXT,
        status VARCHAR(50),
        currentStep VARCHAR(50),
        isAdvance BOOLEAN DEFAULT FALSE,
        createdAt DATETIME,
        INDEX(userId)
      )`,
      `CREATE TABLE IF NOT EXISTS saturday_shifts (
        id VARCHAR(50) PRIMARY KEY,
        userId VARCHAR(50),
        date DATETIME,
        hours DOUBLE,
        status VARCHAR(50),
        currentStep VARCHAR(50),
        createdAt DATETIME,
        INDEX(userId)
      )`,
      `CREATE TABLE IF NOT EXISTS overtime (
        id VARCHAR(50) PRIMARY KEY,
        userId VARCHAR(50),
        date DATETIME,
        hours DOUBLE,
        reason TEXT,
        status VARCHAR(50),
        currentStep VARCHAR(50),
        createdAt DATETIME,
        INDEX(userId)
      )`,
      `CREATE TABLE IF NOT EXISTS notices (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255),
        content TEXT,
        authorId VARCHAR(50),
        createdAt DATETIME,
        isImportant BOOLEAN,
        views INT DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS logs (
        id VARCHAR(50) PRIMARY KEY,
        action VARCHAR(255),
        details TEXT,
        actorId VARCHAR(50),
        timestamp DATETIME
      )`
    ];

    for (const sql of tables) {
      await pool.query(sql);
      if (leavePool) {
        await leavePool.query(sql);
      }
    }

    // 기존 테이블 마이그레이션
    const alterStatements = [
      "ALTER TABLE messages ADD COLUMN isDeleted BOOLEAN DEFAULT FALSE",
      // 모성보호제도 관련 컬럼 추가
      "ALTER TABLE users ADD COLUMN is_shortened_work TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN shortened_start_date DATE NULL",
      "ALTER TABLE users ADD COLUMN shortened_end_date DATE NULL",
      "ALTER TABLE users ADD COLUMN is_maternity_leave TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN maternity_start_date DATE NULL",
      "ALTER TABLE users ADD COLUMN maternity_end_date DATE NULL",
      "ALTER TABLE users ADD COLUMN is_parental_leave TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN parental_leave_start_date DATE NULL",
      "ALTER TABLE users ADD COLUMN parental_leave_end_date DATE NULL",
      // 토요일 근무 컬럼 추가
      "ALTER TABLE users ADD COLUMN works_saturday TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN saturday_work_dates JSON DEFAULT NULL"
    ];

    // 마이그레이션 테이블 추가
    const migrationTables = [
      `CREATE TABLE IF NOT EXISTS maternity_benefits (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        benefit_type ENUM('SHORTENED_WORK', 'MATERNITY', 'PARENTAL') NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_paid TINYINT(1) DEFAULT 1,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        spouse_id VARCHAR(50) NULL,
        is_simultaneous_with_spouse TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX(user_id, benefit_type, start_date)
      )`,
      `CREATE TABLE IF NOT EXISTS user_leave_balances (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL UNIQUE,
        annual_minutes INT DEFAULT 480,
        used_minutes INT DEFAULT 0,
        remain_minutes INT DEFAULT 480,
        shortened_work_adjustment INT DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS leave_deduction_logs (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        leave_request_id VARCHAR(50),
        deduction_type VARCHAR(50),
        actual_minutes INT,
        deducted_minutes INT,
        ratio DECIMAL(5,3),
        is_shortened_worker TINYINT(1),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX(user_id, created_at)
      )`,
      `CREATE TABLE IF NOT EXISTS user_leave_tranches (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        tranche_number INT NOT NULL,
        annual_minutes INT NOT NULL,
        used_minutes INT DEFAULT 0,
        remain_minutes INT NOT NULL,
        grant_date DATETIME NOT NULL,
        expiration_date DATETIME NOT NULL,
        expired_minutes INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX(user_id, expiration_date),
        INDEX(user_id, status),
        UNIQUE KEY ux_user_tranche (user_id, tranche_number, status)
      )`,
      `CREATE TABLE IF NOT EXISTS leave_expiration_alerts (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        tranche_id VARCHAR(50) NOT NULL,
        remaining_minutes INT NOT NULL,
        days_until_expiration INT NOT NULL,
        alert_sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (tranche_id) REFERENCES user_leave_tranches(id),
        INDEX(user_id, created_at)
      )`
    ];

    // ALTER 실행 (이미 존재하면 무시)
    // 추후 마이그레이션 추가
    for (const sql of alterStatements) {
      try {
        await pool.query(sql);
      } catch (e) {
        // 컬럼/인덱스가 이미 존재하면 에러가 발생하므로 무시
      }
    }

    // 마이그레이션 테이블 생성
    for (const sql of migrationTables) {
      try {
        await pool.query(sql);
        if (leavePool) {
          await leavePool.query(sql);
        }
      } catch (e) {
      }
    }

    // 기본 관리자 계정 생성
    const [adminRows] = await pool.query('SELECT * FROM users WHERE id = ?', ['jungdong']);
    if (adminRows.length === 0) {
      await pool.query(`INSERT INTO users (id, name, role, jobTitle, department, avatar, isManager, password, joinDate) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        ['jungdong', '김관리', '관리자', '전산팀장', 'IT 관리팀', 'https://ui-avatars.com/api/?name=Admin&background=334155&color=fff', true, 'admin', formatDateForMySQL(new Date())]);
    }

  } catch (err) {
    // DB 없이 웹 앱만 서빙하기 위해 종료하지 않음
  }
};

initDb();

// FCM 서비스에 DB 연결 풀 전달
if (fcmNotification.setDatabasePool) {
  fcmNotification.setDatabasePool(pool);
}

const api = (path) => `/api${path}`;

/**
 * ============================================================
 * 고용노동부 지침 기반 모성보호제도 계산 로직
 * ============================================================
 */

/**
 * 현재 날짜 기준으로 단축 근무 대상자인지 확인
 * @param {Object} user - 사용자 정보
 * @param {Date} checkDate - 확인 날짜 (기본값: 오늘)
 * @returns {boolean}
 */
function checkIsShortenedWorker(user, checkDate = new Date()) {
  if (!user.is_shortened_work) return false;
  
  const start = new Date(user.shortened_start_date);
  const end = new Date(user.shortened_end_date);
  
  return checkDate >= start && checkDate <= end;
}

/**
 * 비례 차감 시간 계산 (고용노동부 지침)
 * 임신기 근로시간 단축자는 실제 근무 시간(6시간)을 기준으로 하므로,
 * 같은 시간을 쉬더라도 정상 근무자(8시간)보다 더 많은 연차를 차감
 * @param {string} leaveType - 'FULL', 'HALF', 'MIN_30'
 * @param {boolean} isShortenedWorker - 단축 근무 여부
 * @returns {number} deductedMinutes - 차감할 연차 (분)
 */
function calculateProportionalDeduction(leaveType, isShortenedWorker) {
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
  // 단축 근무자가 반차를 쓰면: 3h * (8/6) = 4h 차감
  const ratio = isShortenedWorker ? (8 / 6) : 1;
  
  return Math.round(actualMinutes * ratio);
}

/**
 * 모성보호 특별 휴가 검증 (2025년 개정)
 * @param {string} benefitType - MATERNITY(출산휴가), PARENTAL(육아휴직), SHORTENED_WORK(근로시간 단축)
 * @param {Date} startDate - 시작일
 * @param {Date} endDate - 종료일
 * @returns {Object} {valid: boolean, message: string}
 */
function validateMaternityBenefit(benefitType, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  switch (benefitType) {
    case 'MATERNITY':
      // 출산휴가 (산전휴가 + 산후휴가 통합): 최대 90일
      if (durationDays > 90) {
        return { valid: false, message: '출산휴가는 최대 90일입니다.' };
      }
      break;
      
    case 'PARENTAL':
      // 육아휴직: 최대 1년 (365일)
      if (durationDays > 365) {
        return { valid: false, message: '육아휴직은 최대 1년(365일)입니다.' };
      }
      break;
      
    case 'SHORTENED_WORK':
      // 근로시간 단축: 최대 1일 2시간, 주 10시간
      // 별도 검증 로직은 필요 시 추가
      break;
  }
  
  return { valid: true };
}

/**
 * ============================================================
 * REST API 엔드포인트
 * ============================================================
 */

/**
 * GET /api/push/pending/:userId
 * 사용자 ID로 대기 중인 푸시 알림 조회 (Polling용)
 */
app.get(api('/push/pending/:userId'), (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = pendingNotifications.get(userId) || [];
   
    // 반환 후 삭제 (이미 조회한 것)
    pendingNotifications.delete(userId);
   
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(api('/health'), (req, res) => res.json({ status: 'ok' }));

// ============================================
// 🔔 FCM 푸시 알림 관련 API
// ============================================

/**
 * FCM 토큰 저장 API
 * POST /api/fcm/register-token
 */
app.post(api('/fcm/register-token'), async (req, res) => {
  try {
    const { userId, token, deviceName, platform } = req.body;
    
    if (!userId || !token) {
      return res.status(400).json({ error: 'userId와 token이 필수입니다.' });
    }

    await fcmNotification.saveUserToken(userId, token, deviceName || null, platform || 'Web');
    
    res.json({ 
      success: true, 
      message: 'FCM 토큰이 등록되었습니다.',
      userId,
      tokenLength: token.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 사용자의 모든 FCM 토큰 조회 API
 * GET /api/fcm/tokens/:userId
 */
app.get(api('/fcm/tokens/:userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId가 필수입니다.' });
    }

    const tokens = await fcmNotification.getUserTokens(userId);
    
    res.json({ 
      success: true, 
      userId,
      tokens,
      count: tokens.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 푸시 알림 전송 API (테스트용)
 * POST /api/fcm/send
 */
app.post(api('/fcm/send'), async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, body가 필수입니다.' });
    }

    const result = await fcmNotification.sendNotificationToUser(
      userId, 
      title, 
      body, 
      data || {}
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 특정 토큰으로 푸시 알림 전송 (테스트용)
 * POST /api/fcm/send-to-token
 */
app.post(api('/fcm/send-to-token'), async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    
    if (!token || !title || !body) {
      return res.status(400).json({ error: 'token, title, body가 필수입니다.' });
    }

    const result = await fcmNotification.sendNotificationToToken(
      token, 
      title, 
      body, 
      data || {}
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 토큰 제거 API
 * DELETE /api/fcm/token
 */
app.delete(api('/fcm/token'), async (req, res) => {
  try {
    const { userId, token } = req.body;
    
    if (!userId || !token) {
      return res.status(400).json({ error: 'userId와 token이 필수입니다.' });
    }

    await fcmNotification.removeToken(userId, token);
    
    res.json({ 
      success: true, 
      message: 'FCM 토큰이 제거되었습니다.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 로그인 엔드포인트
app.post(api('/login'), async (req, res) => {
  try {
    const { userId, password } = req.body;
    
    if (!userId || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
    }

    // 사용자가 네온(leavePool) DB에 있다면 거기서 조회, 아니면 primary pool 사용
    const authDb = leavePool || pool;
    const [users] = await authDb.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    
    const user = users[0];
    const validPassword = user.password || '1234';
    
    if (password !== validPassword) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    
    // 마지막 접속 시간 업데이트
    await authDb.query('UPDATE users SET lastSeen = ? WHERE id = ?', [formatDateForMySQL(new Date()), userId]);
    
    // 사용자 정보 반환 (비밀번호 제외)
    const { password: _, ...userWithoutPassword } = user;
    
    // 상대 경로/HTTP을 처리하여 절대 URL로 변환
    const baseUrl = getBaseUrl(req);
    const userWithUrl = {
      ...userWithoutPassword,
      avatar: normalizeAvatarUrl(baseUrl, userWithoutPassword.avatar)
    };
    
    res.json({ success: true, user: userWithUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get(api('/users'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users');
  // 상대 경로/HTTP을 처리하여 절대 URL로 변환
  const baseUrl = getBaseUrl(req);
  const usersWithAbsoluteUrls = rows.map(user => ({
    ...user,
    avatar: normalizeAvatarUrl(baseUrl, user.avatar)
  }));
  
  res.json(usersWithAbsoluteUrls);
});

// 🔧 부서 목록 조회 (동적 부서 관리)
app.get(api('/departments'), async (req, res) => {
  try {
    const [departments] = await pool.query(
      'SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != "" ORDER BY department ASC'
    );
    const departmentList = departments.map(row => row.department);
    res.json(departmentList);
  } catch (e) {
    res.status(500).json({ error: '부서 목록을 불러올 수 없습니다' });
  }
});

// 하트비트 엔드포인트: 사용자의 마지막 접속 시간 갱신
app.post(api('/users/heartbeat/:id'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET lastSeen = ? WHERE id = ?', [formatDateForMySQL(new Date()), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put(api('/users'), async (req, res) => {
  const u = req.body;
  const joinDate = formatDateForMySQL(u.joinDate);
  const lastSeen = formatDateForMySQL(u.lastSeen || new Date());
  // jobTitle에서 trailing zero 제거
  const cleanJobTitle = u.jobTitle ? u.jobTitle.replace(/[0]+$/, '') : u.jobTitle;
  await pool.query(`INSERT INTO users (id, name, role, jobTitle, department, avatar, isManager, isDeptHead, password, joinDate, earnedLeaveHours, additional_leave_days, lastSeen) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, role=?, jobTitle=?, department=?, avatar=?, isManager=?, isDeptHead=?, password=?, joinDate=?, earnedLeaveHours=?, additional_leave_days=?, lastSeen=?`,
    [u.id, u.name, u.role, cleanJobTitle, u.department, u.avatar, !!u.isManager, !!u.isDeptHead, u.password, joinDate, u.earnedLeaveHours || 0, u.additional_leave_days || 0, lastSeen, u.name, u.role, cleanJobTitle, u.department, u.avatar, !!u.isManager, !!u.isDeptHead, u.password, joinDate, u.earnedLeaveHours || 0, u.additional_leave_days || 0, lastSeen]);
  res.json({ success: true });
});

app.delete(api('/users/:id'), async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 사용자 존재 확인
    let targetUser;
    try {
      const [rows] = await pool.query(
        'SELECT id, name FROM users WHERE id = ?',
        [userId]
      );
      targetUser = rows[0];
    } catch (dbError) {
      return res.status(500).json({ success: false, message: 'DB 조회 실패: ' + dbError.message });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    // 관련 데이터 먼저 삭제 (외래키 제약 때문)
    try {
      // leave_deduction_logs 삭제 (user_id 사용)
      await pool.query('DELETE FROM leave_deduction_logs WHERE user_id = ?', [userId]);
      if (leavePool) {
        await leavePool.query('DELETE FROM leave_deduction_logs WHERE user_id = ?', [userId]);
      }
      // leaves 삭제 (userId 사용)
      await pool.query('DELETE FROM leaves WHERE userId = ?', [userId]);
      if (leavePool) {
        await leavePool.query('DELETE FROM leaves WHERE userId = ?', [userId]);
      }
      // user_leave_balances 삭제 (user_id 사용)
      await pool.query('DELETE FROM user_leave_balances WHERE user_id = ?', [userId]);
      // messages 삭제 (senderId 사용)
      await pool.query('DELETE FROM messages WHERE senderId = ?', [userId]);
      // saturday_shifts 삭제 (userId 사용)
      await pool.query('DELETE FROM saturday_shifts WHERE userId = ?', [userId]);
      if (leavePool) {
        await leavePool.query('DELETE FROM saturday_shifts WHERE userId = ?', [userId]);
      }
      if (leavePool) {
        // also clean remote database if configured
        await leavePool.query('DELETE FROM saturday_shifts WHERE userId = ?', [userId]);
      }
      // overtime 삭제 (userId 사용)
      await pool.query('DELETE FROM overtime WHERE userId = ?', [userId]);
      if (leavePool) {
        await leavePool.query('DELETE FROM overtime WHERE userId = ?', [userId]);
      }
      console.log(`[DELETE] 관련 데이터 삭제 완료`);
    } catch (dbError) {
      console.error('[DELETE] 관련 데이터 삭제 오류:', dbError);
      return res.status(500).json({ success: false, message: '관련 데이터 삭제 실패: ' + dbError.message });
    }

    // 최종적으로 사용자 삭제
    let result;
    try {
      [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    } catch (dbError) {
      console.error('[DELETE] 사용자 삭제 오류:', dbError);
      return res.status(500).json({ success: false, message: 'DB 삭제 실패: ' + dbError.message });
    }
    
    console.log(`[DELETE] 성공 - 삭제된 사용자: ${targetUser.name} (${userId}), affectedRows: ${result.affectedRows}`);
    res.json({ success: true, message: '직원이 삭제되었습니다.' });
  } catch (e) {
    console.error('[DELETE] 전체 오류:', e);
    res.status(500).json({ success: false, message: '오류: ' + e.message });
  }
});

app.get(api('/chats'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM chats');
  res.json(rows.map(r => ({ ...r, participants: typeof r.participants === 'string' ? JSON.parse(r.participants) : r.participants })));
});

app.put(api('/chats'), async (req, res) => {
  const c = req.body;
  await pool.query(`INSERT INTO chats (id, name, participants, lastMessage, unreadCount, type) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, participants=?, lastMessage=?, unreadCount=?, type=?`,
    [c.id, c.name, JSON.stringify(c.participants), c.lastMessage, c.unreadCount, c.type, c.name, JSON.stringify(c.participants), c.lastMessage, c.unreadCount, c.type]);
  res.json({ success: true });
});

// 채팅방 삭제 (나가기) - 실제 DB 삭제가 아닌 참여자 목록에서 제외
app.delete(api('/chats/:id'), async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.query.userId; // 삭제를 요청한 사용자 ID

    if (!userId) {
      // User ID가 없으면 기존처럼 완전 삭제 (관리자 기능 또는 예외)
      // 하지만 안전을 위해 에러 처리 하거나 아무것도 안함
      return res.status(400).json({ error: 'User ID required for leaving chat' });
    }

    // 현재 채팅방 정보 가져오기
    const [rows] = await pool.query('SELECT participants FROM chats WHERE id = ?', [chatId]);
    if (rows.length === 0) return res.json({ success: true }); // 이미 없으면 성공 처리

    let participants = typeof rows[0].participants === 'string' ? JSON.parse(rows[0].participants) : rows[0].participants;
    
    // 요청한 사용자만 제거
    participants = participants.filter(id => id !== userId);

    if (participants.length === 0) {
      // 참여자가 아무도 남지 않으면 DB에서도 완전 삭제 (선택사항)
      await pool.query('DELETE FROM chats WHERE id = ?', [chatId]);
      await pool.query('DELETE FROM messages WHERE chatId = ?', [chatId]);
    } else {
      // 참여자 목록 업데이트
      await pool.query('UPDATE chats SET participants = ? WHERE id = ?', [JSON.stringify(participants), chatId]);
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get(api('/messages'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM messages ORDER BY timestamp ASC');
  const grouped = {};
  rows.forEach(msg => {
    if (!grouped[msg.chatId]) grouped[msg.chatId] = [];
    grouped[msg.chatId].push({ ...msg, attachments: typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments, readBy: typeof msg.readBy === 'string' ? JSON.parse(msg.readBy) : msg.readBy, isDeleted: !!msg.isDeleted });
  });
  res.json(grouped);
});

app.put(api('/messages/:chatId'), async (req, res) => {
  const { messages } = req.body;
  const chatId = req.params.chatId;
  
  for (const m of messages) {
    await pool.query(`INSERT INTO messages (id, chatId, senderId, content, timestamp, attachments, isSystem, readBy, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE readBy=?`,
      [m.id, chatId, m.senderId, m.content, m.timestamp, JSON.stringify(m.attachments || []), !!m.isSystem, JSON.stringify(m.readBy || []), !!m.isDeleted, JSON.stringify(m.readBy || [])]);
    
    // 새 메시지가 추가된 경우 해당 채팅방의 멤버들에게만 푸시 알림 전송
    if (m.senderId && !m.isSystem) {
      try {
        // 채팅방 정보 조회
        const [chatInfo] = await pool.query('SELECT participants FROM chats WHERE id = ?', [chatId]);
        if (chatInfo.length > 0) {
          const participants = typeof chatInfo[0].participants === 'string' 
            ? JSON.parse(chatInfo[0].participants) 
            : chatInfo[0].participants;
          
          const [senderInfo] = await pool.query('SELECT name FROM users WHERE id = ?', [m.senderId]);
          const senderName = senderInfo.length > 0 ? senderInfo[0].name : '메시지';
          
          // 채팅방의 멤버들 중 발신자 제외하고 알림 전송
          const memberIds = Array.isArray(participants) ? participants : Object.keys(participants || {});
          const notificationPromises = [];
          
          let recipientCount = 0;
          for (const memberId of memberIds) {
            // 🔴 FIX: 발신자와 현재 사용자 모두 제외하지 말고, 발신자만 제외
            if (String(memberId).trim() !== String(m.senderId).trim()) {
              // readBy 필터링: 이미 이 메시지를 읽은 사람에게는 알림을 보내지 않음
              const readBy = Array.isArray(m.readBy) ? m.readBy : (typeof m.readBy === 'string' ? JSON.parse(m.readBy || '[]') : []);
              const hasRead = readBy.some(userId => String(userId).trim() === String(memberId).trim());
              
              if (!hasRead) {
                recipientCount++;
                const promise = sendPushNotificationToUser(memberId, {
                  type: 'MESSAGE',
                  title: `💬 ${senderName}님으로부터 메시지`,
                  body: m.content.substring(0, 100),
                  chatId: chatId,
                  fromName: senderName,
                  message: m.content.substring(0, 50),
                  timestamp: m.timestamp,
                  senderId: m.senderId,
                  badge: 1,
                  data: {
                    type: 'MESSAGE',
                    messageId: m.id,
                    chatId: chatId,
                    senderId: m.senderId,
                    readBy: m.readBy || [],  // 이미 읽은 사람 목록
                    timestamp: m.timestamp
                  }
                });
                notificationPromises.push(promise);
              } else {
                console.log(`⏭️  사용자 ${memberId}는 이미 메시지 ${m.id}를 읽음 - 알림 스킵`);
              }
            }
          }
          
          // 모든 알림 전송이 완료될 때까지 대기
          try {
            if (notificationPromises.length > 0) {
              await Promise.all(notificationPromises);
            }
          } catch (notifError) {
            console.error('일부 알림 전송 오류:', notifError.message);
          }
          
          console.log(`💬 메시지 푸시 알림 전송: ${senderName} - 채팅방 ${chatId.substring(0, 8)}...의 ${recipientCount}명`);
        }
      } catch (e) {
        console.error('메시지 푸시 알림 오류:', e);
      }
    }
  }
  res.json({ success: true });
});

// 개별 메시지 삭제 (Soft Delete) - DB에는 남고 화면에서만 가림
app.delete(api('/messages/:id'), async (req, res) => {
  try {
    // 실제 DELETE 대신 UPDATE로 isDeleted 플래그 설정
    await pool.query('UPDATE messages SET isDeleted = TRUE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 모성보호제도 API
// ============================================================

/**
 * 모성보호 혜택 조회
 */
app.get(api('/maternity-benefits'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM maternity_benefits 
      WHERE status IN ('ACTIVE', 'COMPLETED')
      ORDER BY start_date DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 특정 사용자의 모성보호 혜택 조회
 */
app.get(api('/maternity-benefits/:userId'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM maternity_benefits 
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY start_date DESC
    `, [req.params.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 모성보호 혜택 등록/수정
 */
app.put(api('/maternity-benefits'), async (req, res) => {
  try {
    const { id, userId, benefitType, startDate, endDate, isPaid } = req.body;
    
    // 검증
    const validation = validateMaternityBenefit(benefitType, startDate, endDate);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const start = formatDateForMySQL(startDate);
    const end = formatDateForMySQL(endDate);
    
    // 모성보호 혜택 저장
    await pool.query(`
      INSERT INTO maternity_benefits (id, user_id, benefit_type, start_date, end_date, is_paid, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW())
      ON DUPLICATE KEY UPDATE benefit_type=?, start_date=?, end_date=?, is_paid=?, updated_at=NOW()
    `, [id, userId, benefitType, start, end, isPaid ? 1 : 0, benefitType, start, end, isPaid ? 1 : 0]);
    
    // 근로시간 단축인 경우, users 테이블 업데이트
    if (benefitType === 'SHORTENED_WORK') {
      await pool.query(`
        UPDATE users 
        SET is_shortened_work = 1, shortened_start_date = ?, shortened_end_date = ?
        WHERE id = ?
      `, [start, end, userId]);
    }
    
    // 산전/산후 휴가인 경우
    if (benefitType === 'PRENATAL' || benefitType === 'POSTNATAL') {
      await pool.query(`
        UPDATE users 
        SET is_maternity_leave = 1, maternity_start_date = ?, maternity_end_date = ?
        WHERE id = ?
      `, [start, end, userId]);
    }
    
    // 육아휴직인 경우
    if (benefitType === 'PARENTAL') {
      await pool.query(`
        UPDATE users 
        SET is_parental_leave = 1, parental_leave_start_date = ?, parental_leave_end_date = ?
        WHERE id = ?
      `, [start, end, userId]);
    }
    
    res.json({ success: true, message: '모성보호 혜택이 등록되었습니다.' });
  } catch (e) {
    console.error('모성보호 혜택 등록 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 연차 차수별 정보 조회 및 생성 (2년차까지 합산, 3년차부터 소멸 관리)
 * 규칙:
 * - 1년차: 월차 (1개월 경과 후 매달 1개, 최대 11개) → 입사 3주년에 소멸
 * - 2년차: 15일 → 입사 3주년에 소멸
 * - 3년차 이상: 매 주년 부여 → 1년 후 소멸
 */
async function generateLeaveTranches(userId, joinDate) {
  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // 사용자의 모든 연차 차수 조회
    const [existingTranches] = await pool.query(`
      SELECT * FROM user_leave_tranches 
      WHERE user_id = ? 
      ORDER BY grant_date ASC
    `, [userId]);
    
    const joinDateObj = new Date(joinDate);
    const joinDateNormalized = new Date(joinDateObj.getFullYear(), joinDateObj.getMonth(), joinDateObj.getDate());
    
    // 2017년 5월 30일 이전 입사자 확인
    const cutoffDate = new Date(2017, 4, 30); // 2017년 5월 30일
    const isLegacyEmployee = joinDateNormalized < cutoffDate;
    
    // 근속년수 계산 (입사 주년 기준)
    let yearsOfService = 0;
    let currentDate = new Date(joinDateNormalized);
    while (new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate()) <= startOfToday) {
      yearsOfService++;
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    }
    
    // 2주년 날짜 (1년차의 소멸일)
    const secondAnniversary = new Date(joinDateNormalized.getFullYear() + 2, joinDateNormalized.getMonth(), joinDateNormalized.getDate());
    // 3주년 날짜 (2년차의 소멸일)
    const thirdAnniversary = new Date(joinDateNormalized.getFullYear() + 3, joinDateNormalized.getMonth(), joinDateNormalized.getDate());
    
    // 생성해야 할 차수들 결정
    let tranchesToCreate = [];
    
    // 1년차: 1월 경과 후부터 매달 차수 생성 (최대 11개)
    // 소멸일: 입사 2주년 (근로기준법상 N년차는 N+1주년에 소멸)
    if (yearsOfService >= 0) {
      let monthDate = new Date(joinDateNormalized);
      monthDate.setMonth(monthDate.getMonth() + 1);
      
      for (let i = 1; i <= 11 && monthDate <= startOfToday; i++) {
        const trancheDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), monthDate.getDate());
        
        // 같은 tranche_number가 있으면 이미 생성된 것으로 본다 (grant_date는 무시).
        // 과거에 타임존/일시 차이로 하루 밀려 두 개가 생겼던 버그 때문.
        const exists = existingTranches.some(t => t.tranche_number === i);
        if (!exists) {
          tranchesToCreate.push({
            tranche_number: i,
            // grant_date는 입력한 joinDate 기준으로 동일한 날짜를 유지
            // (UTC/로컬 변환으로 하루 밀릴 수 있으므로, DB에는 날짜 문자열 그대로 넣어도 무방)
            grant_date: trancheDate,
            expiration_date: secondAnniversary, // 1년차 월차는 2주년에 소멸
            annual_minutes: 480 // 1일 = 480분
          });
        }
        monthDate.setMonth(monthDate.getMonth() + 1);
      }
    }
    
    // 2년차: 입사 1주년 시 15일 연차 차수 생성 (2017.5.30 이전 입사자는 +1)
    //   + 첫 해 월차 11개는 2주년에 모두 소멸하여 최대 26일 부여
    // 소멸일: 입사 3주년
    if (yearsOfService >= 1) {
      const year2Grant = new Date(joinDateNormalized.getFullYear() + 1, joinDateNormalized.getMonth(), joinDateNormalized.getDate());
      const exists = existingTranches.some(t => t.tranche_number === 12);
      if (!exists && year2Grant <= startOfToday) {
        let year2Days = 15; // 고정 15일
        if (isLegacyEmployee) year2Days += 1; // 2017.5.30 이전 입사자 +1일
        tranchesToCreate.push({
          tranche_number: 12,
          grant_date: year2Grant,
          expiration_date: thirdAnniversary, // 2년차는 3주년에 소멸
          annual_minutes: year2Days * 480
        });
      }
    }
    
    // 3년차부터: 입사 3주년, 4주년 등에 새로운 차수 생성 (1년 후 소멸)
    for (let year = 3; year <= yearsOfService + 2; year++) {
      const trancheGrantDate = new Date(joinDateNormalized.getFullYear() + year, joinDateNormalized.getMonth(), joinDateNormalized.getDate());
      
      if (trancheGrantDate <= startOfToday) {
        const trancheNumber = year + 10; // year=3→13(3년차), year=4→14(4년차), ...
        const exists = existingTranches.some(t => t.tranche_number === trancheNumber);
        
        if (!exists) {
          // N년차 연차 계산: 15 + floor((N-1) / 2) + (2017.5.30 이전 입사자 +1)
          // trancheNumber 13은 3년차, 14는 4년차, ...
          const yearOfService = trancheNumber - 10; // 3, 4, 5, ...
          let annualDays = 15 + Math.floor((yearOfService - 1) / 2);
          if (isLegacyEmployee) annualDays += 1; // 2017.5.30 이전 입사자 +1일
          // 5년차 이상인 경우 1년에 부여되는 연차는 최대 25일로 제한
          if (yearOfService >= 5) {
            annualDays = Math.min(annualDays, 25);
          }
          
          // 3년차부터는 1년 후 소멸
          const expirationDate = new Date(trancheGrantDate.getFullYear() + 1, trancheGrantDate.getMonth(), trancheGrantDate.getDate());
          
          tranchesToCreate.push({
            tranche_number: trancheNumber,
            grant_date: trancheGrantDate,
            expiration_date: expirationDate,
            annual_minutes: annualDays * 480
          });
        }
      }
    }
    
    // 새로운 차수 생성
    // (이전: 3년차부터 최대 25일 제한. 지금은 제거하여 근속년수에 따라 계속 증가)
    let totalCreatedMinutes = 0;
    // const maxTotalLegalLeave = 25 * 480; // 제한 해제    
    for (const tranche of tranchesToCreate) {
      // 이전 정책에서는 3년차 이상 누적을 25일로 제한했지만
      // 지금은 그 제한이 없기 때문에 단순히 생성만 한다.
      // (따라서 이 블록은 더 이상 필요 없음)
      // if (tranche.tranche_number >= 13 && totalCreatedMinutes + tranche.annual_minutes > maxTotalLegalLeave) {
      //   const adjustedMinutes = Math.max(0, maxTotalLegalLeave - totalCreatedMinutes);
      //   if (adjustedMinutes === 0) {
      //     console.log(`[연차 차수 생성] ${userId} - 차수 ${tranche.tranche_number}: 스킵됨 (3년차 이상 최대 25일 초과)`);
      //     continue;
      //   }
      //   tranche.annual_minutes = adjustedMinutes;
      //   console.log(`[연차 차수 생성] ${userId} - 차수 ${tranche.tranche_number}: ${tranche.annual_minutes / 480}일로 조정됨`);
      // }      
      const id = `tranche_${userId}_${tranche.tranche_number}_${Date.now()}`;
      await pool.query(`
        INSERT INTO user_leave_tranches 
        (id, user_id, tranche_number, annual_minutes, used_minutes, remain_minutes, grant_date, expiration_date, status)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'ACTIVE')
      `, [id, userId, tranche.tranche_number, tranche.annual_minutes, tranche.annual_minutes, tranche.grant_date, tranche.expiration_date]);
      
      // 통계에 포함 (1년차+2년차는 전부, 3년차부터는 총 25일까지만)
      totalCreatedMinutes += tranche.annual_minutes;
      const dayCount = tranche.annual_minutes / 480;
      const expirationDateStr = new Date(tranche.expiration_date).toLocaleDateString('ko-KR');
      console.log(`[연차 차수 생성] ${userId} - 차수 ${tranche.tranche_number}: ${dayCount}일 (소멸예정: ${expirationDateStr})`);
    }
    
    if (totalCreatedMinutes > 0) {
      console.log(`[연차 차수 생성 완료] ${userId}: 총 ${totalCreatedMinutes / 480}일 생성됨 (3년차 이상만 최대 25일 제한)`);
    }
    
    return true;
  } catch (e) {
    console.error('연차 차수 생성 오류:', e);
    return false;
  }
}

/**
 * 소멸된 연차 처리 및 알림
 */

/**
 * 중복 연차 차수를 합치고 불필요한 레코드를 제거합니다.
 *
 * 기존 버전에서 generateLeaveTranches가 잘못 호출되거나
 * joinDate 수정 등으로 동일 tranche_number가 여러번 생성된
 * 경우가 있어 남은 법정 연차가 2배로 보일 수 있습니다.
 * 이 함수는 사용자별로 활성 상태의 중복 항목을 검색하여
 * 첫번째 레코드에 합산한 뒤 중복 레코드를 삭제합니다.
 */
async function deduplicateLeaveTranches(userId) {
  // 먼저 중복되는 tranche_number 식별
  const [dupeRows] = await pool.query(`
    SELECT tranche_number, COUNT(*) AS cnt
    FROM user_leave_tranches
    WHERE user_id = ? AND status = 'ACTIVE'
    GROUP BY tranche_number
    HAVING cnt > 1
  `, [userId]);

  for (const { tranche_number } of dupeRows) {
    const [rows] = await pool.query(`
      SELECT *
      FROM user_leave_tranches
      WHERE user_id = ? AND status = 'ACTIVE' AND tranche_number = ?
      ORDER BY grant_date ASC, id ASC
    `, [userId, tranche_number]);

    if (rows.length < 2) continue; // 안전장치

    const keeper = rows[0];
    let totalAnnual = keeper.annual_minutes;
    let totalUsed = keeper.used_minutes;
    let totalRemain = keeper.remain_minutes;

    const idsToDelete = [];
    for (let i = 1; i < rows.length; i++) {
      totalAnnual += rows[i].annual_minutes;
      totalUsed += rows[i].used_minutes;
      totalRemain += rows[i].remain_minutes;
      idsToDelete.push(rows[i].id);
    }

    // 업데이트 및 삭제
    await pool.query(`
      UPDATE user_leave_tranches
      SET annual_minutes = ?, used_minutes = ?, remain_minutes = ?
      WHERE id = ?
    `, [totalAnnual, totalUsed, totalRemain, keeper.id]);

    if (idsToDelete.length > 0) {
      await pool.query(`
        DELETE FROM user_leave_tranches
        WHERE id IN (?)
      `, [idsToDelete]);
      console.log(`deduplicateLeaveTranches: removed ${idsToDelete.length} duplicate records for user ${userId} tranche ${tranche_number}`);
    }
  }
}

/**
 * 사용자 연차 잔액 조회
 */
async function processLeaveExpiration(userId) {
  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const thirtyDaysLater = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    // 활성 상태인 연차 차수 조회
    const [activeTranches] = await pool.query(`
      SELECT * FROM user_leave_tranches 
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY expiration_date ASC
    `, [userId]);
    
    for (const tranche of activeTranches) {
      const expirationDate = new Date(tranche.expiration_date);
      
      // 1. 소멸 예정 알림 (30일 전)
      if (tranche.remain_minutes > 0 && expirationDate > startOfToday && expirationDate <= thirtyDaysLater) {
        const daysUntilExpiration = Math.ceil((expirationDate - startOfToday) / (24 * 60 * 60 * 1000));
        const existsAlert = await pool.query(`
          SELECT id FROM leave_expiration_alerts 
          WHERE tranche_id = ? AND DATE(alert_sent_at) = CURDATE()
        `, [tranche.id]);
        
        if (existsAlert[0].length === 0) {
          const alertId = `alert_${tranche.id}_${Date.now()}`;
          await pool.query(`
            INSERT INTO leave_expiration_alerts 
            (id, user_id, tranche_id, remaining_minutes, days_until_expiration)
            VALUES (?, ?, ?, ?, ?)
          `, [alertId, userId, tranche.id, tranche.remain_minutes, daysUntilExpiration]);
          
          console.log(`[연차 소멸 예정 알림] ${userId} - 차수 ${tranche.tranche_number}: ${daysUntilExpiration}일 남음`);
        }
      }
      
      // 2. 연차 소멸 처리 (만료일 도래)
      if (expirationDate <= startOfToday && tranche.remain_minutes > 0) {
        await pool.query(`
          UPDATE user_leave_tranches 
          SET status = 'EXPIRED', expired_minutes = ?, remain_minutes = 0
          WHERE id = ?
        `, [tranche.remain_minutes, tranche.id]);
        
        console.log(`[연차 소멸 처리] ${userId} - 차수 ${tranche.tranche_number}: ${tranche.remain_minutes}분 소멸`);
      }
    }
    
    return true;
  } catch (e) {
    console.error('연차 소멸 처리 오류:', e);
    return false;
  }
}


/**
 * 관리자용: 중복 연차 차수 정리
 * POST /api/leave-balance/cleanup/:userId
 * (권한 체크는 호출 쪽에서 추가하세요.)
 */
app.post(api('/leave-balance/cleanup/:userId'), async (req, res) => {
  try {
    const userId = req.params.userId;
    await deduplicateLeaveTranches(userId);
    res.json({ userId, cleaned: true });
  } catch (e) {
    console.error('cleanup error', e);
    res.status(500).json({ error: e.message });
  }
});

// 전체 사용자에 대해 중복 정리(배치용)
app.post(api('/leave-balance/cleanup-all'), async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id FROM users');
    for (const u of users) {
      await deduplicateLeaveTranches(u.id);
    }
    res.json({ cleanedAll: true, userCount: users.length });
  } catch (e) {
    console.error('cleanup-all error', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 사용자 연차 잔액 조회
 */
app.get(api('/leave-balance/:userId'), async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // 사용자 정보 조회
    const [users] = await pool.query('SELECT joinDate FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    const joinDate = users[0].joinDate;
    
    // 연차 차수 생성 및 업데이트
    await generateLeaveTranches(userId, joinDate);
    
    // 소멸 연차 처리 및 알림
    await processLeaveExpiration(userId);
    
    // 모든 활성 연차 차수 조회
    // NOTE: 이전 버전에서 데이터가 중복 생성되어 있을 경우 법정 연차가 두 배로 계산되는 문제가 있었음.
    //       중복된 동일 `tranche_number`항목을 합산해서 하나로 취급하도록 쿼리를 변경.
    const [tranches] = await pool.query(`
      SELECT user_id,
             tranche_number,
             SUM(annual_minutes)    AS annual_minutes,
             SUM(used_minutes)      AS used_minutes,
             SUM(remain_minutes)    AS remain_minutes,
             MIN(grant_date)        AS grant_date,
             MAX(expiration_date)   AS expiration_date,
             status
      FROM user_leave_tranches
      WHERE user_id = ? AND status = 'ACTIVE'
      GROUP BY user_id, tranche_number, status
      ORDER BY grant_date ASC
    `, [userId]);
    
    // 소멸 예정 알림 조회
    const [expirationAlerts] = await pool.query(`
      SELECT * FROM leave_expiration_alerts 
      WHERE user_id = ? AND DATE(alert_sent_at) = CURDATE()
      ORDER BY created_at DESC
    `, [userId]);
    
    // 통계 계산
    let totalAnnualMinutes = 0;
    let totalUsedMinutes = 0;
    let totalRemainMinutes = 0;
    let expiringTranches = [];
    
    for (const tranche of tranches) {
      totalAnnualMinutes += tranche.annual_minutes;
      totalUsedMinutes += tranche.used_minutes;
      totalRemainMinutes += tranche.remain_minutes;
      
      // 30일 이내 소멸 차수
      const expirationDate = new Date(tranche.expiration_date);
      const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      if (tranche.remain_minutes > 0 && expirationDate <= thirtyDaysLater) {
        expiringTranches.push({
          tranche_number: tranche.tranche_number,
          remain_minutes: tranche.remain_minutes,
          expiration_date: tranche.expiration_date
        });
      }
    }
    
    res.json({
      userId,
      annualMinutes: totalAnnualMinutes,
      usedMinutes: totalUsedMinutes,
      remainMinutes: totalRemainMinutes,
      tranches,
      expiringTranches,
      expirationAlerts
    });
  } catch (e) {
    console.error('연차 잔액 조회 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 사용자 연차 잔액 재설정 (관리자용 - DB에서 기존 데이터 삭제하고 재생성)
 * DELETE /api/leave-balance/:userId
 */
app.delete(api('/leave-balance/:userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 기존 연차 잔액 삭제
    await pool.query('DELETE FROM user_leave_balances WHERE user_id = ?', [userId]);
    
    console.log(`[연차 재설정] ${userId} 기존 데이터 삭제됨. 다음 조회 시 재계산됨`);
    
    res.json({
      success: true,
      message: `${userId} 연차가 초기화되었습니다. 다음 조회 시 최신 기준으로 재계산됩니다.`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 연차 차감 (모성보호 규칙 적용, 차수별 관리)
 * POST /api/use-leave
 * {
 *   userId: string,
 *   leaveType: 'FULL' | 'HALF' | 'MIN_30',
 *   requestId: string,
 *   reason?: string
 * }
 */
app.post(api('/use-leave'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { userId, leaveType, requestId, reason } = req.body;
    
    // 1. 사용자 정보 조회
    const [users] = await connection.query(
      'SELECT is_shortened_work, shortened_start_date, shortened_end_date, additional_leave_days FROM users WHERE id = ?',
      [userId]
    );
    
    if (!users.length) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const user = users[0];
    const isShortenedWorker = checkIsShortenedWorker(user);
    const additionalLeaveDays = user.additional_leave_days || 0;
    
    // 2. 비례 차감 계산
    const deductedMinutes = calculateProportionalDeduction(leaveType, isShortenedWorker);
    
    // 3. 활성 연차 차수 중 남은 연차가 있는 것 조회 (만료 예정 순서대로)
    const [tranches] = await connection.query(`
      SELECT * FROM user_leave_tranches 
      WHERE user_id = ? AND status = 'ACTIVE' AND remain_minutes > 0
      ORDER BY expiration_date ASC
      FOR UPDATE
    `, [userId]);
    
    // 4. 차수별로 차감
    let remainingMinutes = deductedMinutes;
    const deductionDetails = [];
    
    for (const tranche of tranches) {
      if (remainingMinutes <= 0) break;
      
      const deductFromThisTranche = Math.min(remainingMinutes, tranche.remain_minutes);
      
      await connection.query(`
        UPDATE user_leave_tranches 
        SET used_minutes = used_minutes + ?, remain_minutes = remain_minutes - ?
        WHERE id = ?
      `, [deductFromThisTranche, deductFromThisTranche, tranche.id]);
      
      deductionDetails.push({
        tranche_number: tranche.tranche_number,
        deducted_minutes: deductFromThisTranche
      });
      
      remainingMinutes -= deductFromThisTranche;
    }
    
    // 5. 차수에서 부족한 경우, 추가 연차(additional_leave_days)에서 차감
    if (remainingMinutes > 0) {
      const additionalMinutes = additionalLeaveDays * 480; // 1일 = 480분
      
      if (additionalMinutes < remainingMinutes) {
        console.error(`[차감 실패] 잔여연차 부족 - userId=${userId}, 필요=${remainingMinutes}분, 추가연차=${additionalMinutes}분, tranches=${tranches.length}개`);
        throw new Error(`잔여 연차가 부족합니다. (필요: ${remainingMinutes}분, 사용 가능: ${additionalMinutes}분)`);
      }
      
      // 추가 연차에서 차감처리 - 별도의 차수가 없으므로 구독에 로그만 남김
      deductionDetails.push({
        tranche_number: 'ADDITIONAL',
        deducted_minutes: remainingMinutes
      });
      
      console.log(`[추가연차 차감] userId=${userId}, 추가연차에서 ${remainingMinutes}분 차감 (보유: ${additionalMinutes}분)`);
      
      // 추가 연차 차감을 기록하기 위해, additional_leave_days 업데이트
      const remainingDays = Math.floor((additionalMinutes - remainingMinutes) / 480);
      await connection.query(`
        UPDATE users SET additional_leave_days = ? WHERE id = ?
      `, [remainingDays, userId]);
      
      remainingMinutes = 0;
    }
    
    if (remainingMinutes > 0) {
      throw new Error('예상치 못한 오류: 연차 차감 불완전');
    }
    
    // 5. 차감 내역 기록
    const logId = `log_${userId}_${Date.now()}`;
    await connection.query(`
      INSERT INTO leave_deduction_logs (
        id, user_id, leave_request_id, deduction_type, 
        actual_minutes, deducted_minutes, ratio, is_shortened_worker
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logId, userId, requestId,
      isShortenedWorker ? 'SHORTENED_WORKER' : 'NORMAL',
      leaveType === 'FULL' ? (isShortenedWorker ? 360 : 480) : (leaveType === 'HALF' ? (isShortenedWorker ? 180 : 240) : 30),
      deductedMinutes,
      isShortenedWorker ? 1.333 : 1,
      isShortenedWorker ? 1 : 0
    ]);
    
    await connection.commit();
    
    // 남은 연차 재계산
    const [[balanceAfter]] = await connection.query(`
      SELECT COALESCE(SUM(remain_minutes), 0) as total_remain FROM user_leave_tranches 
      WHERE user_id = ? AND status = 'ACTIVE'
    `, [userId]);
    
    res.json({
      success: true,
      deductedMinutes,
      isShortenedWorker,
      ratio: isShortenedWorker ? 1.333 : 1,
      remainMinutes: balanceAfter.total_remain,
      deductionDetails,
      message: `${deductedMinutes}분(${Math.floor(deductedMinutes / 60)}시간 ${deductedMinutes % 60}분) 차감되었습니다.`
    });
    
  } catch (e) {
    await connection.rollback();
    console.error('연차 차감 오류:', e);
    res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

/**
 * 연차 차감 내역 조회
 */
app.get(api('/leave-deduction-logs/:userId'), async (req, res) => {
  try {
    const db = getLeavePool();
    const [rows] = await db.query(`
      SELECT * FROM leave_deduction_logs 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.params.userId]);
    
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get(api('/leaves'), async (req, res) => {
  const db = getLeavePool();
  const [rows] = await db.query('SELECT * FROM leaves WHERE isDeleted = 0 ORDER BY createdAt DESC');
  res.json(rows);
});

app.put(api('/leaves'), async (req, res) => {
  const l = req.body;
  const startDate = formatDateForMySQL(l.startDate);
  const endDate = formatDateForMySQL(l.endDate);
  const createdAt = formatDateForMySQL(l.createdAt);
  
  // 신규 신청 시 currentStep 결정 (UPDATE가 아닌 INSERT 시에만)
  // 신청자가 팀장인 경우, 부장이 있으면 부장 승인 대기, 없으면 이사 승인 대기
  let finalStep = l.currentStep;
  if (!finalStep) {
    finalStep = 'MANAGER_APPROVAL'; // 기본값
    
    // 신청자 정보 조회
    const db = getLeavePool();
    const [users] = await db.query('SELECT isManager, isDeptHead, department FROM users WHERE id = ?', [l.userId]);
    if (users.length > 0) {
      const requestUser = users[0];
      if (requestUser.isManager) {
        // 팀장이 신청했는지 확인
        const [deptHeads] = await db.query(
          'SELECT id FROM users WHERE isDeptHead = 1 AND department = ? AND id != ?',
          [requestUser.department, l.userId]
        );
        finalStep = deptHeads.length > 0 ? 'DEPT_HEAD_APPROVAL' : 'DIRECTOR_APPROVAL';
      }
    }
  }
  
  const db = getLeavePool();
  await db.query(`INSERT INTO leaves (id, userId, startDate, endDate, isAllDay, startTime, endTime, daysDeducted, earnedHoursUsed, annualDaysUsed, type, reason, status, currentStep, isAdvance, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE startDate=?, endDate=?, isAllDay=?, startTime=?, endTime=?, daysDeducted=?, earnedHoursUsed=?, annualDaysUsed=?, type=?, reason=?, status=?, currentStep=?, isAdvance=?`,
    [l.id, l.userId, startDate, endDate, l.isAllDay ? 1 : 0, l.startTime, l.endTime, l.daysDeducted, l.earnedHoursUsed, l.annualDaysUsed, l.type, l.reason, l.status, finalStep, l.isAdvance ? 1 : 0, createdAt, startDate, endDate, l.isAllDay ? 1 : 0, l.startTime, l.endTime, l.daysDeducted, l.earnedHoursUsed, l.annualDaysUsed, l.type, l.reason, l.status, finalStep, l.isAdvance ? 1 : 0]);
  
  // 새 연차 신청 시 승인자에게 푸시 알림 전송
  try {
    const db = getLeavePool();
    const [userInfo] = await db.query('SELECT name FROM users WHERE id = ?', [l.userId]);
    const userName = userInfo.length > 0 ? userInfo[0].name : '직원';
    
    // 승인자 찾기
    const [approvers] = await db.query(
      'SELECT id FROM users WHERE (isManager = 1 OR isDeptHead = 1) AND id != ?',
      [l.userId]
    );
    
    // 각 승인자에게 개별 알림 전송
    approvers.forEach(approver => {
      sendPushNotificationToUser(approver.id, {
        type: 'LEAVE_REQUEST',
        fromName: userName,
        message: `${userName}님의 ${l.type} 신청 승인 대기중`,
        data: {
          leaveId: l.id,
          userId: l.userId,
          leaveType: l.type,
          startDate: startDate,
          endDate: endDate
        }
      });
    });
    
    console.log(`📋 연차 신청 푸시 알림 전송: ${userName} - ${l.type}`);
  } catch (e) {
    console.error('연차 신청 푸시 알림 오류:', e);
  }
  
  res.json({ success: true });
});

app.get(api('/saturday'), async (req, res) => {
  const db = getLeavePool();
  const [rows] = await db.query('SELECT * FROM saturday_shifts WHERE isDeleted = 0 ORDER BY createdAt DESC');
  res.json(rows);
});

app.put(api('/saturday'), async (req, res) => {
  const s = req.body;
  const date = formatDateForMySQL(s.date);
  const createdAt = formatDateForMySQL(s.createdAt);
  const db = getLeavePool();
  
  // 신규 신청 시 currentStep 결정
  let finalStep = s.currentStep;
  if (!finalStep) {
    finalStep = 'MANAGER_APPROVAL'; // 기본값
    
    // 신청자 정보 조회
    const [users] = await db.query('SELECT isManager, isDeptHead, department FROM users WHERE id = ?', [s.userId]);
    if (users.length > 0) {
      const requestUser = users[0];
      if (requestUser.isManager) {
        // 팀장이 신청했는지 확인
        const [deptHeads] = await db.query(
          'SELECT id FROM users WHERE isDeptHead = 1 AND department = ? AND id != ?',
          [requestUser.department, s.userId]
        );
        finalStep = deptHeads.length > 0 ? 'DEPT_HEAD_APPROVAL' : 'DIRECTOR_APPROVAL';
      }
    }
  }
  
  await db.query(`INSERT INTO saturday_shifts (id, userId, date, hours, status, currentStep, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE date=?, hours=?, status=?, currentStep=?`,
    [s.id, s.userId, date, s.hours, s.status, finalStep, createdAt, date, s.hours, s.status, finalStep]);
  
  // 새 토요일 근무 신청 시 승인자에게 푸시 알림 전송
  try {
    const db = getLeavePool();
    const [userInfo] = await db.query('SELECT name FROM users WHERE id = ?', [s.userId]);
    const userName = userInfo.length > 0 ? userInfo[0].name : '직원';
    
    // 승인자 찾기
    const [approvers] = await db.query(
      'SELECT id FROM users WHERE (isManager = 1 OR isDeptHead = 1) AND id != ?',
      [s.userId]
    );
    
    // 각 승인자에게 개별 알림 전송
    approvers.forEach(approver => {
      sendPushNotificationToUser(approver.id, {
        type: 'SATURDAY_SHIFT',
        title: `📅 토요일 근무 신청`,
        body: `${userName}님의 근무신청 대기중`,
        fromName: userName,
        message: `${userName}님의 토요일 근무신청 승인 대기중`,
        badge: 1,
        data: {
          type: 'SATURDAY_SHIFT',
          shiftId: s.id,
          userId: s.userId,
          date: date,
          hours: s.hours,
          userName: userName
        }
      });
    });
    
    console.log(`📅 토요일 근무 신청 푸시 알림 전송: ${userName}`);
  } catch (e) {
    console.error('토요일 근무 신청 푸시 알림 오류:', e);
  }
  
  res.json({ success: true });
});

app.get(api('/overtime'), async (req, res) => {
  const db = getLeavePool();
  const [rows] = await db.query('SELECT * FROM overtime WHERE isDeleted = 0 ORDER BY createdAt DESC');
  res.json(rows);
});

app.put(api('/overtime'), async (req, res) => {
  const o = req.body;
  const date = formatDateForMySQL(o.date);
  const createdAt = formatDateForMySQL(o.createdAt);
  const isNewOvertime = !o.id || o.id.length === 0;
  const db = getLeavePool();
  
  // 신규 신청 시 currentStep 결정
  let finalStep = o.currentStep;
  if (!finalStep) {
    finalStep = 'MANAGER_APPROVAL'; // 기본값
    
    // 신청자 정보 조회
    const [users] = await db.query('SELECT isManager, isDeptHead, department FROM users WHERE id = ?', [o.userId]);
    if (users.length > 0) {
      const requestUser = users[0];
      if (requestUser.isManager) {
        // 팀장이 신청했는지 확인
        const [deptHeads] = await db.query(
          'SELECT id FROM users WHERE isDeptHead = 1 AND department = ? AND id != ?',
          [requestUser.department, o.userId]
        );
        finalStep = deptHeads.length > 0 ? 'DEPT_HEAD_APPROVAL' : 'DIRECTOR_APPROVAL';
      }
    }
  }
  
  await db.query(`INSERT INTO overtime (id, userId, date, hours, reason, status, currentStep, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE date=?, hours=?, reason=?, status=?, currentStep=?`,
    [o.id, o.userId, date, o.hours, o.reason, o.status, finalStep, createdAt, date, o.hours, o.reason, o.status, finalStep]);
  
  // 새 연장근무 신청 시 승인자에게 푸시 알림 전송
  if (isNewOvertime) {
    try {
      const db2 = getLeavePool();
      const [userInfo] = await db2.query('SELECT name FROM users WHERE id = ?', [o.userId]);
      const userName = userInfo.length > 0 ? userInfo[0].name : '직원';
      
      // 승인자 찾기 (팀장/부장/이사)
      const [approvers] = await db2.query(
        'SELECT id FROM users WHERE (isManager = 1 OR isDeptHead = 1) AND id != ?',
        [o.userId]
      );
      
      // 각 승인자에게 개별 알림 전송
      approvers.forEach(approver => {
        sendPushNotificationToUser(approver.id, {
          type: 'OVERTIME',
          title: `⏰ 연장근무 신청`,
          body: `${userName}님의 연장근무신청 대기중`,
          fromName: userName,
          message: `${userName}님의 연장근무신청 승인 대기중`,
          badge: 1,
          data: {
            type: 'OVERTIME',
            overtimeId: o.id,
            userId: o.userId,
            date: date,
            hours: o.hours,
            reason: o.reason,
            userName: userName
          }
        });
      });
      
      console.log(`⏰ 연장근무 신청 푸시 알림 전송: ${userName}`);
    } catch (e) {
      console.error('연장근무 신청 푸시 알림 오류:', e);
    }
  }
  
  res.json({ success: true });
});

app.get(api('/notices'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM notices ORDER BY isImportant DESC, createdAt DESC');
  res.json(rows);
});

app.put(api('/notices'), async (req, res) => {
  const n = req.body;
  const createdAt = formatDateForMySQL(n.createdAt);
  
  // 새 공지사항 생성인지 수정인지 확인 (UPDATE가 아닌 INSERT 시에만 알림)
  const isNewNotice = !n.id || n.id.length === 0;
  
  await pool.query(`INSERT INTO notices (id, title, content, authorId, createdAt, isImportant, views) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=?, content=?, isImportant=?, views=?`,
    [n.id, n.title, n.content, n.authorId, createdAt, !!n.isImportant, n.views || 0, n.title, n.content, !!n.isImportant, n.views || 0]);
  
  // 새 공지사항 작성 시 모든 사용자에게 브로드캐스트 알림
  if (isNewNotice) {
    try {
      const [authorInfo] = await pool.query('SELECT name FROM users WHERE id = ?', [n.authorId]);
      const authorName = authorInfo.length > 0 ? authorInfo[0].name : '관리자';
      
      // 모든 사용자에게 알림 전송
      const [allUsers] = await pool.query('SELECT id FROM users WHERE id != ?', [n.authorId]);
      const notificationPromises = [];
      
      for (const user of allUsers) {
        const promise = sendPushNotificationToUser(user.id, {
          type: 'NOTICE',
          title: `📢 ${n.isImportant ? '[중요]' : ''} ${n.title}`.substring(0, 50),
          body: n.content.substring(0, 100),
          authorName: authorName,
          isImportant: !!n.isImportant,
          badge: 1,
          data: {
            type: 'NOTICE',
            noticeId: n.id,
            authorId: n.authorId,
            title: n.title,
            isImportant: !!n.isImportant
          }
        });
        notificationPromises.push(promise);
      }
      
      // 모든 알림 전송 완료 대기
      if (notificationPromises.length > 0) {
        await Promise.all(notificationPromises);
      }
      
      console.log(`📢 공지사항 푸시 알림 전송: ${authorName} - ${n.title} (${allUsers.length}명)`);
    } catch (e) {
      console.error('공지사항 푸시 알림 오류:', e);
    }
  }
  
  res.json({ success: true });
});

app.delete(api('/notices/:id'), async (req, res) => {
  await pool.query('DELETE FROM notices WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// 연차 삭제 (소프트 딜리트)
app.delete(api('/leaves/:id'), async (req, res) => {
  try {
    const db = getLeavePool();
    const [result] = await db.query('UPDATE leaves SET isDeleted = 1 WHERE id = ?', [req.params.id]);
    console.log('[SOFT DELETE leaves]', req.params.id, 'affectedRows:', result.affectedRows);
    res.json({ success: result.affectedRows > 0, message: result.affectedRows > 0 ? '삭제되었습니다' : '해당 항목이 없습니다' });
  } catch (error) {
    console.error('[SOFT DELETE leaves ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 모든 연차 삭제 (소프트 딜리트)
app.delete(api('/leaves'), async (req, res) => {
  try {
    const db = getLeavePool();
    const [result] = await db.query('UPDATE leaves SET isDeleted = 1 WHERE isDeleted = 0');
    console.log('[SOFT DELETE ALL leaves]', 'affectedRows:', result.affectedRows);
    res.json({ success: true, message: `${result.affectedRows}건 삭제되었습니다`, deletedRows: result.affectedRows });
  } catch (error) {
    console.error('[SOFT DELETE ALL leaves ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 연장근무 삭제 (소프트 딜리트)
app.delete(api('/overtime/:id'), async (req, res) => {
  try {
    const db = getLeavePool();
    const [result] = await db.query('UPDATE overtime SET isDeleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: result.affectedRows > 0, message: result.affectedRows > 0 ? '삭제되었습니다' : '해당 항목이 없습니다' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 토요근무 삭제 (소프트 딜리트)
app.delete(api('/saturday/:id'), async (req, res) => {
  try {
    const db = getLeavePool();
    const [result] = await db.query('UPDATE saturday_shifts SET isDeleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: result.affectedRows > 0, message: result.affectedRows > 0 ? '삭제되었습니다' : '해당 항목이 없습니다' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 모든 토요근무 삭제 (소프트 딜리트)
app.delete(api('/saturday'), async (req, res) => {
  try {
    const db = getLeavePool();
    const [result] = await db.query('UPDATE saturday_shifts SET isDeleted = 1 WHERE isDeleted = 0');
    console.log('[SOFT DELETE ALL saturday]', 'affectedRows:', result.affectedRows);
    res.json({ success: true, message: `${result.affectedRows}건 삭제되었습니다`, deletedRows: result.affectedRows });
  } catch (error) {
    console.error('[SOFT DELETE ALL saturday ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get(api('/logs'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 200');
  res.json(rows.map(r => ({ ...r, timestamp: new Date(r.timestamp) })));
});

app.put(api('/logs'), async (req, res) => {
  const l = req.body;
  const timestamp = formatDateForMySQL(l.timestamp);
  await pool.query(`INSERT INTO logs (id, action, details, actorId, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [l.id, l.action, l.details, l.actorId, timestamp]);
  res.json({ success: true });
});

// 파일 업로드 엔드포인트
app.post(api('/upload'), express.json({ limit: '500mb' }), async (req, res) => {
  try {
    const { fileName, fileData } = req.body; // fileData는 Base64 string
    
    console.log(`[Upload] Received file: ${fileName}, data length: ${fileData ? fileData.length : 0}`);
    
    if (!fileName || !fileData) {
      console.error('[Upload] Missing fileName or fileData');
      return res.status(400).json({ success: false, message: '파일 이름과 데이터가 필요합니다.' });
    }

    // Base64에서 버퍼로 변환
    const buffer = Buffer.from(fileData.replace(/^data:[^;]+;base64,/, ''), 'base64');
    
    console.log(`[Upload] Buffer size: ${buffer.length}, fileName: ${fileName}`);
    
    // 파일 크기 제한
    const maxImageSize = 3 * 1024 * 1024; // 이미지 3MB
    const maxDocumentSize = 50 * 1024 * 1024; // 문서 50MB
    const maxVideoSize = 100 * 1024 * 1024; // 영상 100MB
    
    const ext = path.extname(fileName).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
    
    let maxSize = maxDocumentSize;
    if (isImage) maxSize = maxImageSize;
    else if (isVideo) maxSize = maxVideoSize;
    
    if (buffer.length > maxSize) {
      const sizeInMB = (maxSize / 1024 / 1024).toFixed(0);
      return res.status(400).json({ success: false, message: `파일 크기가 ${sizeInMB}MB를 초과합니다.` });
    }

    // 파일명 생성 (중복 방지)
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const baseName = path.basename(fileName, ext);
    const newFileName = `${baseName}_${timestamp}_${randomStr}${ext}`;
    const filePath = path.join(uploadsDir, newFileName);

    // 파일 저장
    fs.writeFileSync(filePath, buffer);
    
    console.log(`[Upload] File saved successfully: ${filePath}`);

    res.json({ 
      success: true, 
      url: `/uploads/${newFileName}`,
      fileName: newFileName
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 프로필 이미지 업로드 API
app.post(api('/users/:id/profile-image'), uploadProfile.single('profileImage'), async (req, res) => {
  try {
    console.log(`[Profile Upload] 요청 받음 - userId: ${req.params.id}`);
    console.log(`[Profile Upload] File info:`, req.file ? { filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype } : 'No file');

    if (!req.file) {
      console.log('[Profile Upload] 파일 없음');
      return res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    }

    const userId = req.params.id;
    const newImageUrl = `/uploads/${req.file.filename}`;

    console.log(`[Profile Upload] DB 조회 시작 - userId: ${userId}`);

    // 기존 이미지 경로 조회
    const [existingUser] = await pool.query('SELECT avatar FROM users WHERE id = ?', [userId]);
    const oldImagePath = existingUser.length > 0 ? existingUser[0].avatar : null;

    console.log(`[Profile Upload] 기존 이미지: ${oldImagePath}`);

    // DB에 새 아바타 URL 저장 (상대 경로만 저장 - 클라이언트가 normalizeProfileImageUrl로 처리)
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [newImageUrl, userId]);

    console.log(`[Profile Upload] DB 업데이트 완료 - ${newImageUrl}`);

    const baseUrl = getBaseUrl(req);
    res.json({
      success: true,
      message: '프로필 이미지가 업로드되었습니다.',
      imageUrl: baseUrl + newImageUrl  // 응답은 절대 경로로, DB는 상대 경로로 저장
    });
  } catch (error) {
    console.error('[Profile Upload] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 관리자: 연차 조정 API (차수별 관리)
 * POST /api/admin/adjust-leave
 * {
 *   userId: string,
 *   type: 'add' | 'subtract' | 'set',
 *   minutes: number,
 *   reason: string,
 *   trancheNumber?: number (특정 차수 지정 시),
 *   adminId: string
 * }
 */
app.post(api('/admin/adjust-leave'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { userId, type, minutes, reason, trancheNumber, adminId } = req.body;
    
    if (!userId || !['add', 'subtract', 'set'].includes(type) || minutes === undefined || !reason) {
      throw new Error('필수 정보가 누락되었습니다.');
    }
    
    // 권한 확인: 이사 또는 IT 팀장만
    const [[admin]] = await connection.query(
      'SELECT id, role, department, isManager FROM users WHERE id = ?',
      [adminId]
    );
    
    if (!admin || (admin.role !== '이사' && !(admin.department.includes('IT') && admin.isManager))) {
      throw new Error('권한이 없습니다.');
    }
    
    // 사용자 존재 확인
    const [users] = await connection.query(
      'SELECT id, joinDate FROM users WHERE id = ?',
      [userId]
    );
    
    if (!users.length) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const joinDate = users[0].joinDate;
    
    // 연차 차수 생성 (없으면 생성)
    await generateLeaveTranches(userId, joinDate);
    
    let adjustedTranches = [];
    
    if (trancheNumber) {
      // 특정 차수 조정
      const [[tranche]] = await connection.query(
        'SELECT id, remain_minutes FROM user_leave_tranches WHERE user_id = ? AND tranche_number = ? FOR UPDATE',
        [userId, trancheNumber]
      );
      
      if (!tranche) {
        throw new Error(`차수 ${trancheNumber}을(를) 찾을 수 없습니다.`);
      }
      
      let newRemain;
      if (type === 'add') {
        newRemain = tranche.remain_minutes + minutes;
      } else if (type === 'subtract') {
        newRemain = Math.max(0, tranche.remain_minutes - minutes);
      } else {
        newRemain = minutes;
      }
      
      const changeAmount = newRemain - tranche.remain_minutes;
      
      await connection.query(
        'UPDATE user_leave_tranches SET remain_minutes = remain_minutes + ? WHERE id = ?',
        [changeAmount, tranche.id]
      );
      
      adjustedTranches.push({
        tranche_number: trancheNumber,
        change: changeAmount,
        new_remain: newRemain
      });
      
    } else {
      // 모든 활성 차수에 균등 분배
      const [tranches] = await connection.query(
        'SELECT id, tranche_number FROM user_leave_tranches WHERE user_id = ? AND status = "ACTIVE" ORDER BY tranche_number ASC',
        [userId]
      );
      
      if (tranches.length === 0 && type !== 'set') {
        throw new Error('조정할 활성 연차 차수가 없습니다.');
      }
      
      if (type === 'set') {
        // set 타입: 남은 연차를 정확히 설정값으로 변경
        // ⚠️ 중요: annual_minutes(법정 연차)는 절대 변경하지 않음
        // ⚠️ 중요: remain_minutes만 변경하고, used_minutes는 건드리지 않음
        // (Admin이 정한 "남은 연차" 값이 정확하게 저장되어야 함)
        for (let i = 0; i < tranches.length; i++) {
          const tranche = tranches[i];
          if (i === 0) {
            // 첫 번째 차수: 남은 연차를 설정값으로
            const newRemain = Math.max(0, minutes);
            await connection.query(
              'UPDATE user_leave_tranches SET remain_minutes = ? WHERE id = ?',
              [newRemain, tranche.id]
            );
            console.log(`[연차조정-SET] ${userId} - 차수 ${tranche.tranche_number}: annual=${tranche.annual_minutes}분 (불변), remain=${newRemain}분으로 설정`);
            adjustedTranches.push({
              tranche_number: tranche.tranche_number,
              change: newRemain - tranche.remain_minutes,
              new_remain: newRemain
            });
          } else {
            // 나머지 차수: 남은 연차를 0으로 초기화
            const [[current]] = await connection.query(
              'SELECT remain_minutes FROM user_leave_tranches WHERE id = ?',
              [tranche.id]
            );
            await connection.query(
              'UPDATE user_leave_tranches SET remain_minutes = 0 WHERE id = ?',
              [tranche.id]
            );
            console.log(`[연차조정-SET] ${userId} - 차수 ${tranche.tranche_number}: annual=${tranche.annual_minutes}분 (불변), remain=0분으로 초기화`);
            adjustedTranches.push({
              tranche_number: tranche.tranche_number,
              change: -current.remain_minutes,
              new_remain: 0
            });
          }
        }
        
      } else if (type === 'add') {
        // add: 남은 연차에 값 추가
        for (const tranche of tranches) {
          const addAmount = minutes;
          const newRemain = tranche.remain_minutes + addAmount;
          
          await connection.query(
            'UPDATE user_leave_tranches SET remain_minutes = ? WHERE id = ?',
            [newRemain, tranche.id]
          );
          
          adjustedTranches.push({
            tranche_number: tranche.tranche_number,
            change: addAmount,
            new_remain: newRemain
          });
        }
        console.log(`[연차추가] userId=${userId}, 추가량=${minutes}분`);
        
      } else if (type === 'subtract') {
        // subtract: 남은 연차에서 값 차감
        let remainingSubtract = minutes;
        for (let i = tranches.length - 1; i >= 0 && remainingSubtract > 0; i--) {
          const tranche = tranches[i];
          const subtractAmount = Math.min(remainingSubtract, tranche.remain_minutes);
          const newRemain = tranche.remain_minutes - subtractAmount;
          
          await connection.query(
            'UPDATE user_leave_tranches SET remain_minutes = ? WHERE id = ?',
            [newRemain, tranche.id]
          );
          
          adjustedTranches.push({
            tranche_number: tranche.tranche_number,
            change: -subtractAmount,
            new_remain: newRemain
          });
          
          remainingSubtract -= subtractAmount;
        }
        console.log(`[연차차감] userId=${userId}, 차감량=${minutes}분`);
      }
    }
    
    // 조정 이력 기록
    const adjustmentLogId = `admin_adj_${userId}_${Date.now()}`;
    await connection.query(`
      INSERT INTO leave_deduction_logs (
        id, user_id, leave_request_id, deduction_type,
        actual_minutes, deducted_minutes, ratio, is_shortened_worker
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      adjustmentLogId,
      userId,
      null,
      `ADMIN_${type.toUpperCase()}`,
      Math.abs(minutes),
      Math.abs(minutes),
      1,
      0
    ]);
    
    await connection.commit();
    
    // 전체 잔액 계산
    const [[totalBalance]] = await connection.query(
      'SELECT COALESCE(SUM(remain_minutes), 0) as total FROM user_leave_tranches WHERE user_id = ? AND status = "ACTIVE"',
      [userId]
    );
    
    res.json({
      success: true,
      message: `연차가 ${type === 'add' ? '추가' : type === 'subtract' ? '차감' : '조정'}되었습니다.`,
      userId,
      type,
      adjustedMinutes: minutes,
      adjustedTranches,
      totalRemainMinutes: totalBalance.total,
      reason
    });
    
  } catch (e) {
    await connection.rollback();
    console.error('연차 조정 오류:', e);
    res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

/**
 * 이사: 직원 추가 연차 설정
 * POST /api/admin/set-additional-leave
 * {
 *   userId: string,
 *   additionalLeaveDays: number (추가할 일수)
 * }
 */
app.post(api('/admin/set-additional-leave'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { userId, additionalLeaveDays } = req.body;
    
    if (!userId || additionalLeaveDays === undefined) {
      return res.status(400).json({ error: '필수 정보가 부족합니다' });
    }
    
    // 음수 방지
    const adjustedDays = Math.max(0, parseInt(additionalLeaveDays));
    const newAnnualMinutes = adjustedDays * 480; // 1일 = 480분
    
    // 트랜잭션 시작
    await connection.beginTransaction();
    
    // 1. users 테이블 업데이트
    await connection.query(
      'UPDATE users SET additional_leave_days = ? WHERE id = ?',
      [adjustedDays, userId]
    );
    
    console.log(`[법정연차 설정] userId=${userId}, days=${adjustedDays}, minutes=${newAnnualMinutes}`);
    
    // 2. user_leave_balances 테이블 확인 및 업데이트
    const [[existingBalance]] = await connection.query(
      'SELECT id, annual_minutes, used_minutes FROM user_leave_balances WHERE user_id = ?',
      [userId]
    );
    
    if (existingBalance) {
      // 기존 사용한 연차 유지, 새 법정 연차 기준으로 남은 연차 계산
      const newRemainMinutes = newAnnualMinutes - existingBalance.used_minutes;
      
      await connection.query(
        'UPDATE user_leave_balances SET annual_minutes = ?, remain_minutes = ? WHERE user_id = ?',
        [newAnnualMinutes, Math.max(0, newRemainMinutes), userId]
      );
      
      console.log(`[연차 잔액 업데이트] 법정연차: ${existingBalance.annual_minutes}분 → ${newAnnualMinutes}분, 사용: ${existingBalance.used_minutes}분, 남은연차: ${Math.max(0, newRemainMinutes)}분`);
    } else {
      // 신규 생성
      const balanceId = `balance_${userId}_${Date.now()}`;
      await connection.query(
        'INSERT INTO user_leave_balances (id, user_id, annual_minutes, used_minutes, remain_minutes) VALUES (?, ?, ?, 0, ?)',
        [balanceId, userId, newAnnualMinutes, newAnnualMinutes]
      );
      
      console.log(`[연차 잔액 신규 생성] 법정연차: ${newAnnualMinutes}분`);
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `${userId}의 추가 연차가 ${adjustedDays}일로 설정되었습니다.`,
      userId,
      additionalLeaveDays: adjustedDays,
      annualMinutes: newAnnualMinutes
    });
    
  } catch (e) {
    await connection.rollback();
    console.error('추가 연차 설정 오류:', e);
    res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});

/**
 * 관리자: 토요일 근무 일정 조회
 * GET /api/admin/saturday-schedule/:userId
 */
app.get(api('/admin/saturday-schedule/:userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [[user]] = await pool.query(`
      SELECT saturday_work_dates FROM users WHERE id = ?
    `, [userId]);
    
    if (!user) {
      return res.json({
        success: true,
        userId,
        workDates: []
      });
    }
    
    let workDates = [];
    if (user.saturday_work_dates) {
      try {
        // saturday_work_dates가 문자열인 경우 파싱, 배열인 경우 그대로 사용
        workDates = typeof user.saturday_work_dates === 'string' 
          ? JSON.parse(user.saturday_work_dates) 
          : user.saturday_work_dates;
      } catch (parseError) {
        console.warn('saturday_work_dates 파싱 실패:', parseError);
        workDates = [];
      }
    }
    
    res.json({
      success: true,
      userId,
      workDates: Array.isArray(workDates) ? workDates : []
    });
  } catch (e) {
    console.error('토요일 일정 조회 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 관리자: 토요일 근무 일정 저장 (달력 형식)
 * POST /api/admin/saturday-schedule
 * {
 *   userId: string,
 *   workDates: ['2026-01-25', '2026-02-01', ...],
 *   adminId: string
 * }
 */
app.post(api('/admin/saturday-schedule'), async (req, res) => {
  try {
    const { userId, workDates, adminId } = req.body;
    
    if (!userId || !Array.isArray(workDates)) {
      return res.status(400).json({ success: false, error: '필수 정보가 누락되었습니다.' });
    }
    
    // 권한 확인: 이사 또는 IT 팀장만
    const [[admin]] = await pool.query(
      'SELECT id, role, department, isManager FROM users WHERE id = ?',
      [adminId]
    );
    
    if (!admin || (admin.role !== '이사' && !(admin.department.includes('IT') && admin.isManager))) {
      return res.status(403).json({ success: false, error: '권한이 없습니다.' });
    }
    
    // 사용자 존재 확인
    const [[user]] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
    }
    
    // 토요일 근무 날짜 배열을 JSON으로 저장
    const jsonData = JSON.stringify(workDates);
    const worksFlag = workDates.length > 0 ? 1 : 0;
    
    await pool.query(
      'UPDATE users SET saturday_work_dates = ?, works_saturday = ? WHERE id = ?',
      [jsonData, worksFlag, userId]
    );
    
    return res.json({
      success: true,
      message: '토요일 근무 일정이 저장되었습니다.',
      updateCount: workDates.length
    });
    
  } catch (e) {
    console.error('토요일 일정 저장 오류:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * 관리자: 직원 연차 잔액 조회
/**
 * 관리자: 사용자 연차 상세 조회 (차수별)
 * GET /api/admin/user-leave-balance/:userId
 */
app.get(api('/admin/user-leave-balance/:userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 사용자 정보 조회 (additional_leave_days 포함)
    const [users] = await pool.query(
      'SELECT id, joinDate, additional_leave_days FROM users WHERE id = ?',
      [userId]
    );
    
    if (!users.length) {
      return res.json({
        success: true,
        userId,
        remainMinutes: 0,
        usedMinutes: 0,
        tranches: [],
        expiringTranches: [],
        additionalLeaveDays: 0
      });
    }
    
    const joinDate = users[0].joinDate;
    const additionalLeaveDays = users[0].additional_leave_days || 0;
    
    // 연차 차수 생성
    await generateLeaveTranches(userId, joinDate);
    
    // 소멸 처리
    await processLeaveExpiration(userId);
    
    // 모든 활성 차수 조회
    const [tranches] = await pool.query(`
      SELECT * FROM user_leave_tranches 
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY grant_date ASC
    `, [userId]);
    
    // 통계 계산
    let totalAnnualMinutes = 0;
    let totalUsedMinutes = 0;
    let totalRemainMinutes = 0;
    let expiringTranches = [];
    
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    for (const tranche of tranches) {
      totalAnnualMinutes += tranche.annual_minutes;
      totalUsedMinutes += tranche.used_minutes;
      totalRemainMinutes += tranche.remain_minutes;
      
      // 30일 이내 소멸 차수
      const expirationDate = new Date(tranche.expiration_date);
      if (tranche.remain_minutes > 0 && expirationDate <= thirtyDaysLater) {
        const daysUntil = Math.ceil((expirationDate - now) / (24 * 60 * 60 * 1000));
        expiringTranches.push({
          tranche_number: tranche.tranche_number,
          remain_minutes: tranche.remain_minutes,
          expiration_date: tranche.expiration_date,
          days_until_expiration: daysUntil
        });
      }
    }
    
    console.log(`[잔액 조회] userId=${userId}, tranches=${tranches.length}개, totalAnnual=${totalAnnualMinutes}분 (${totalAnnualMinutes/480}일)`);
    
    // **중요**: annualMinutes(법정 연차 기본값)와 remainMinutes(남은 잔여 연차)는 별개입니다
    // - annualMinutes: DB의 annual_minutes 합계 (절대 변경 금지)
    // - remainMinutes: DB의 remain_minutes 합계 (관리자 조정으로 변경됨)
    res.json({
      success: true,
      userId,
      annualMinutes: totalAnnualMinutes,  // ← 법정 연차 (DB 그대로)
      usedMinutes: totalUsedMinutes,      // ← 사용한 연차
      remainMinutes: totalRemainMinutes,  // ← 남은 연차 (관리자 조정으로 변경됨)
      additionalLeaveDays: 0,  // 레거시 필드: 항상 0 반환
      tranches: tranches.map(t => ({
        tranche_number: t.tranche_number,
        annual_minutes: t.annual_minutes,  // ← 절대 변경되지 않음
        used_minutes: t.used_minutes,
        remain_minutes: t.remain_minutes,  // ← 이것만 변경됨
        grant_date: t.grant_date,
        expiration_date: t.expiration_date,
        status: t.status
      })),
      expiringTranches
    });
    
  } catch (e) {
    console.error('연차 잔액 조회 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

// HTTPS 서버 시작 - httpServer 정의 후 호출됨

// ============================================================
// 자동 메시지 정리 작업 (5년 이상 오래된 메시지 삭제)
// 매일 자정에 실행
// ============================================================

const schedule = require('node-schedule');

// 매일 자정(00:00)에 오래된 메시지 정리
const cleanupOldMessages = async () => {
  try {
    // 5년(1825일) 이전의 메시지 삭제
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setDate(fiveYearsAgo.getDate() - 1825);
    const formattedDate = formatDateForMySQL(fiveYearsAgo);
    
    const [result] = await pool.query(`
      DELETE FROM messages 
      WHERE timestamp < ? AND isDeleted = 0
    `, [formattedDate]);
    
    if (result.affectedRows > 0) {
      console.log(`[자동 정리] ${result.affectedRows}개의 5년 이상 오래된 메시지 삭제 완료`);
    }
  } catch (error) {
    console.error('[자동 정리 오류] 메시지 정리 실패:', error);
  }
};

// 매일 자정에 실행
schedule.scheduleJob('0 0 * * *', cleanupOldMessages);

// 서버 시작 시 한 번 실행 (테스트)
// cleanupOldMessages();

console.log('✅ 메시지 자동 정리 스케줄러 설정 완료 (매일 자정 실행)');

/**
 * ============================================================
 * WebSocket 기반 푸시 알림 시스템 (병원 자체 서버)
 * ============================================================
 */

// WebSocket 연결된 사용자 관리
const connectedUsers = new Map(); // userId -> Set(WebSocket)

// 대기 중인 푸시 알림 저장소 (메모리 기반)
const pendingNotifications = new Map(); // userId -> Array of notifications

/**
 * WebSocket 서버 설정
 * HTTP 서버와 동일한 포트에서 실행
 */
let httpServer;
let useHttps = false;

if (process.env.USE_HTTPS === 'true') {
  // 자체 서명 인증서 경로 (로컬 테스트 인증서)
  const certPath = path.join(__dirname, '..', 'certs', 'cert.pem');
  const keyPath = path.join(__dirname, '..', 'certs', 'key.pem');
  
  // Let's Encrypt 인증서 경로 (우선 시도하지만 실패 시 자체 서명 인증서 사용)
  const certPathLetEncrypt = '/etc/letsencrypt/live/192.168.0.230/fullchain.pem';
  const keyPathLetEncrypt = '/etc/letsencrypt/live/192.168.0.230/privkey.pem';
  
  let finalCertPath = certPath;
  let finalKeyPath = keyPath;
  
  // Let's Encrypt 인증서를 읽을 수 있는지 확인 (권한 체크)
  if (fs.existsSync(certPathLetEncrypt) && fs.existsSync(keyPathLetEncrypt)) {
    try {
      fs.accessSync(keyPathLetEncrypt, fs.constants.R_OK);
      finalCertPath = certPathLetEncrypt;
      finalKeyPath = keyPathLetEncrypt;
      console.log('✅ Let\'s Encrypt SSL 인증서 감지 (프로덕션)');
    } catch (error) {
      console.warn('⚠️  Let\'s Encrypt 인증서 접근 권한 없음, 자체 서명 인증서 사용');
    }
  }
  
  if (fs.existsSync(finalCertPath) && fs.existsSync(finalKeyPath)) {
    try {
      const cert = fs.readFileSync(finalCertPath);
      const key = fs.readFileSync(finalKeyPath);
      httpServer = https.createServer({ cert, key }, app);
      useHttps = true;
      console.log('✅ HTTPS 인증서 로드 완료 (WSS 모바일 알림 지원)');
    } catch (error) {
      console.warn('⚠️  SSL 인증서 로드 실패:', error.message);
      httpServer = http.createServer(app);
    }
  } else {
    console.warn('⚠️  SSL 인증서를 찾을 수 없습니다. HTTP로 실행합니다.');
    httpServer = http.createServer(app);
  }
} else {
  httpServer = http.createServer(app);
}

// 서버 시작 (HTTPS)
const server = httpServer.listen(PORT, '0.0.0.0', () => {
  const protocol = useHttps ? 'HTTPS/WSS' : 'HTTP/WS';
  console.log(`🚀 HTTPS 서버 실행 중 (포트: ${PORT})`);
  console.log(`   - 브라우저 접속: ${useHttps ? 'https' : 'http'}://[IP]:${PORT}`);
  console.log(`   - WebSocket: ${useHttps ? 'wss' : 'ws'}://[IP]:${PORT}`);
})

// HTTP 리다이렉트 서버 (포트 80 → 443)
// 개발/테스트 환경에서는 HTTP 포트 3001도 함께 열기
if (useHttps) {
  const httpRedirectServer = http.createServer(app);
  httpRedirectServer.listen(3001, '0.0.0.0', () => {
    console.log(`🚀 HTTP 서버 실행 중 (포트: 3001, 테스트/APK용)`);
    console.log(`   - 브라우저 접속: http://[IP]:3001`);
    console.log(`   - WebSocket: ws://[IP]:3001`);
  });
}

// WebSocket 서버 초기화
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
  console.log('📡 새로운 WebSocket 연결이 들어옵니다...');
  
  // URL 쿼리 파라미터에서 userId 추출 (안드로이드 클라이언트용)
  const url = new URL(req.url, `http://${req.headers.host}`);
  let userId = url.searchParams.get('userId');
  
  const clientIp = req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  console.log(`🔗 연결 요청 상세 정보:`);
  console.log(`   - userId: ${userId || 'null (아직 미등록)'}`);
  console.log(`   - 클라이언트 IP: ${clientIp}`);
  console.log(`   - User-Agent: ${userAgent}`);
  console.log(`   - 현재 온라인 사용자: ${connectedUsers.size}`);
  
  // 연결과 동시에 userId가 있으면 자동 등록
  if (userId && userId !== 'null' && userId !== '') {
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(ws);
    console.log(`✅ 자동 등록 완료: ${userId} (연결 수: ${connectedUsers.get(userId).size})`);
    
    ws.send(JSON.stringify({
      type: 'REGISTER_SUCCESS',
      userId,
      timestamp: new Date().toISOString(),
      message: '푸시 알림 준비 완료 (자동 등록)'
    }));
  }

  /**
   * 클라이언트로부터 메시지 수신
   */
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'REGISTER':
          // 사용자 등록 (메시지로도 받을 수 있음)
          if (message.userId) {
            userId = message.userId;
          }
          
          if (!userId) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'userId가 필요합니다'
            }));
            ws.close();
            return;
          }
          
          if (!connectedUsers.has(userId)) {
            connectedUsers.set(userId, new Set());
          }
          connectedUsers.get(userId).add(ws);
          
          console.log(`✅ 사용자 등록 완료: ${userId} (연결 수: ${connectedUsers.get(userId).size})`);
          
          // 연결 확인 응답
          ws.send(JSON.stringify({
            type: 'REGISTER_SUCCESS',
            userId,
            timestamp: new Date().toISOString(),
            message: '푸시 알림 준비 완료'
          }));
          break;

        case 'PING':
          // 하트비트 응답
          ws.send(JSON.stringify({
            type: 'PONG',
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          console.log('알 수 없는 메시지 타입:', message.type);
      }
    } catch (error) {
      console.error('메시지 처리 오류:', error);
    }
  });

  /**
   * 연결 종료
   */
  ws.on('close', () => {
    if (userId && connectedUsers.has(userId)) {
      const userSockets = connectedUsers.get(userId);
      userSockets.delete(ws);
      
      if (userSockets.size === 0) {
        connectedUsers.delete(userId);
        console.log(`❌ 사용자 연결 해제: ${userId}`);
      } else {
        console.log(`⚠️  ${userId}의 한 연결이 종료됨 (남은 연결: ${userSockets.size})`);
      }
    }
  });

  /**
   * 연결 오류
   */
  ws.on('error', (error) => {
    console.error('WebSocket 오류:', error.message);
  });
});

/**
 * 특정 사용자에게 푸시 알림 전송
 */
async function sendPushNotificationToUser(userId, notification) {
  const userSockets = connectedUsers.get(userId);
  
  // APK 환경: HTTP 폴링도 지원하기 위해 항상 pendingNotifications에 저장
  // (WebSocket 연결 여부와 관계없이)
  if (!pendingNotifications.has(userId)) {
    pendingNotifications.set(userId, []);
  }
  pendingNotifications.get(userId).push({
    ...notification,
    sentAt: new Date().toISOString()
  });
  
  console.log(`💾 대기 알림 저장: ${userId} (총 ${pendingNotifications.get(userId).length}개, WebSocket: ${userSockets && userSockets.size > 0 ? '온라인' : '오프라인'})`);
  
  // Firebase FCM으로 전송 (포그라운드 + 백그라운드)
  if (firebaseInitialized) {
    try {
      // 메모리에서 먼저 확인 (빠름)
      const fcmTokenKey = `fcm_token_${userId}`;
      let fcmToken = global[fcmTokenKey];
      
      // 메모리에 없으면 DB에서 조회
      if (!fcmToken && pool) {
        try {
          const [rows] = await pool.query(
            'SELECT token FROM fcm_tokens WHERE user_id = ? LIMIT 1',
            [userId]
          );
          if (rows.length > 0) {
            fcmToken = rows[0].token;
            console.log(`📦 DB에서 FCM 토큰 조회: ${userId}`);
          }
        } catch (dbError) {
          console.warn(`⚠️ DB 토큰 조회 실패: ${dbError.message}`);
        }
      }
      
      if (fcmToken) {
        const message = {
          token: fcmToken,
          notification: {
            title: notification.title || 'Messenger',
            body: notification.body || notification.content || ''
          },
          data: {
            senderId: notification.senderId || '',
            senderName: notification.senderName || '',
            content: notification.content || notification.body || '',
            title: notification.title || 'Messenger',
            type: notification.type || 'MESSAGE'
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'messenger_notifications'
            }
          }
        };
        
        const response = await admin.messaging().send(message);
        console.log(`✅ FCM으로 푸시 전송 성공: ${userId} (Message ID: ${response})`);
      } else {
        console.warn(`⚠️ 사용자 ${userId}의 FCM 토큰이 없습니다. (메모리/DB 모두 확인)`);
        // 웹소켓이 있으면 WebSocket으로 전송
        if (userSockets && userSockets.size > 0) {
          console.log(`   → WebSocket으로 대체 전송 시도`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ FCM 전송 실패: ${userId} - ${error.message}`);
    }
  }
  
  // WebSocket 연결이 있으면 실시간으로도 전송 (포그라운드용)
  if (userSockets && userSockets.size > 0) {
    let sentCount = 0;
    userSockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'NOTIFICATION',
          ...notification,
          sentAt: new Date().toISOString()
        }));
        sentCount++;
      }
    });
    
    console.log(`📡 WebSocket으로 ${sentCount}개 전송 (${userId})`);
    
    return {
      success: true,
      method: 'FCM + WebSocket',
      sentCount,
      userId
    };
  }
  
  return {
    success: true,
    method: 'FCM + Polling',
    userId
  };
}

/**
 * 모든 사용자에게 브로드캐스트 알림 전송
 */
function broadcastNotification(notification) {
  let sentCount = 0;
  let failedCount = 0;

  connectedUsers.forEach((userSockets, userId) => {
    userSockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'NOTIFICATION',
          ...notification,
          sentAt: new Date().toISOString()
        }));
        sentCount++;
      } else {
        failedCount++;
      }
    });
  });

  console.log(`📡 브로드캐스트: ${sentCount}명에게 알림 전송 (실패: ${failedCount})`);

  return {
    success: sentCount > 0,
    sentCount,
    failedCount,
    totalUsers: connectedUsers.size
  };
}

/**
 * POST /api/push/send
 * 특정 사용자에게 푸시 알림 전송
 */
app.post('/api/push/send', (req, res) => {
  try {
    const { userId, title, body, data = {} } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ 
        error: 'userId, title, body는 필수입니다' 
      });
    }

    const result = sendPushNotificationToUser(userId, {
      title,
      body,
      data
    });

    res.json(result);
  } catch (error) {
    console.error('푸시 알림 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/push/broadcast
 * 모든 온라인 사용자에게 브로드캐스트 알림 전송
 */
app.post('/api/push/broadcast', (req, res) => {
  try {
    const { title, body, data = {} } = req.body;

    if (!title || !body) {
      return res.status(400).json({ 
        error: 'title과 body는 필수입니다' 
      });
    }

    const result = broadcastNotification({
      title,
      body,
      data
    });

    res.json(result);
  } catch (error) {
    console.error('브로드캐스트 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/push/stats
 * 푸시 알림 시스템 통계
 */
app.get('/api/push/stats', (req, res) => {
  try {
    let totalConnections = 0;
    let userCount = 0;

    connectedUsers.forEach(userSockets => {
      totalConnections += userSockets.size;
      userCount++;
    });

    res.json({
      success: true,
      onlineUsers: userCount,
      totalConnections,
      averageConnectionsPerUser: userCount > 0 ? (totalConnections / userCount).toFixed(2) : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/push/test
 * 푸시 서비스 상태 확인
 */
app.get('/api/push/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ 푸시 알림 서비스 정상 작동',
    service: 'WebSocket 기반 푸시 알림',
    server: `병원 자체 서버 (ws://localhost:${PORT})`,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/push/debug
 * 푸시 시스템 상세 진단 정보
 */
app.get('/api/push/debug', (req, res) => {
  try {
    const debugInfo = {
      serverInfo: {
        port: PORT,
        baseUrl: getBaseUrl(req),
        wsUrl: `ws://${process.env.HOSTNAME || 'localhost'}:${PORT}`,
        timestamp: new Date().toISOString()
      },
      connectionStats: {
        totalOnlineUsers: connectedUsers.size,
        totalConnections: Array.from(connectedUsers.values()).reduce((sum, sockets) => sum + sockets.size, 0),
        users: []
      },
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime()
      }
    };

    // 온라인 사용자 목록
    connectedUsers.forEach((sockets, userId) => {
      debugInfo.connectionStats.users.push({
        userId,
        connections: sockets.size,
        status: sockets.size > 0 ? 'online' : 'offline'
      });
    });

    res.json(debugInfo);
  } catch (error) {
    console.error('진단 정보 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/push/test/send
 * 테스트용 푸시 알림 전송
 */
app.post('/api/push/test/send', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId는 필수입니다' });
    }

    console.log(`\n📨 테스트 푸시 알림 전송: ${userId}`);
    
    const result = sendPushNotificationToUser(userId, {
      title: '테스트 푸시 알림',
      body: `${new Date().toLocaleTimeString()} - WebSocket 연결이 정상입니다`,
      data: { type: 'TEST', timestamp: new Date().toISOString() }
    });

    console.log(`결과:`, result);
    
    res.json({
      success: result.success,
      message: result.success 
        ? `✅ ${result.sentCount}개의 연결로 알림 전송 완료`
        : `❌ 사용자 '${userId}'가 온라인 상태가 아닙니다`,
      ...result
    });
  } catch (error) {
    console.error('테스트 푸시 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/push/test-send
 * 테스트 알림 전송
 */
app.post('/api/push/test-send', (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId는 필수입니다' });
    }

    const result = sendPushNotificationToUser(userId, {
      title: '🎉 테스트 알림',
      body: '병원 자체 서버 푸시 알림이 정상 작동합니다!',
      data: {
        type: 'test',
        message: 'Hospital Messenger 푸시 알림 테스트'
      }
    });

    res.json(result);
  } catch (error) {
    console.error('테스트 알림 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/push/pending/:userId
 * 사용자 ID로 대기 중인 푸시 알림 조회 (HTTP Polling용 - Android APK)
 */
app.get('/api/push/pending/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = pendingNotifications.get(userId) || [];
    
    if (notifications.length > 0) {
      console.log(`📥 ${userId}의 대기 알림 ${notifications.length}개 반환`);
    }
    
    // 반환 후 삭제 (이미 조회한 것)
    pendingNotifications.delete(userId);
    
    res.json(notifications);
  } catch (error) {
    console.error('대기 알림 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});
/**
 * POST /api/push/register-token
 * FCM 토큰 등록 (Android 앱에서 호출)
 */
app.post('/api/push/register-token', (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    
    if (!userId || !fcmToken) {
      return res.status(400).json({ 
        error: 'userId와 fcmToken은 필수입니다' 
      });
    }
    
    // 토큰을 메모리에 저장 (프로덕션에서는 DB에 저장)
    const tokenKey = `fcm_token_${userId}`;
    global[tokenKey] = fcmToken;
    
    // fcmNotification 모듈에도 저장
    fcmNotification.saveUserToken(userId, fcmToken);
    
    console.log(`🔐 FCM 토큰 등록: ${userId} (${fcmToken.substring(0, 20)}...)`);
    
    res.json({ 
      success: true,
      message: 'FCM 토큰 등록 완료',
      userId
    });
  } catch (error) {
    console.error('FCM 토큰 등록 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ================================
 * 📱 FCM 푸시 알림 API (완전한 버전)
 * ================================
 */

/**
 * POST /api/fcm/save-token
 * 클라이언트(안드로이드 앱)에서 FCM 토큰 저장
 */
app.post('/api/fcm/save-token', (req, res) => {
  try {
    const { userId, token } = req.body;
    
    if (!userId || !token) {
      return res.status(400).json({ 
        error: 'userId와 token은 필수입니다' 
      });
    }
    
    fcmNotification.saveUserToken(userId, token);
    
    console.log(`✅ FCM 토큰 저장: ${userId}`);
    res.status(200).json({ 
      message: "토큰이 성공적으로 저장되었습니다.",
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('토큰 저장 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fcm/send-to-user
 * 특정 사용자에게 푸시 알림 전송
 * 
 * 요청 바디:
 * {
 *   "userId": "user123",
 *   "title": "문서 승인",
 *   "body": "당신의 문서가 승인되었습니다",
 *   "data": { "docId": "123", "action": "approve" }
 * }
 */
app.post('/api/fcm/send-to-user', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        error: 'Firebase가 초기화되지 않았습니다. serviceAccountKey.json을 확인하세요.' 
      });
    }

    const { userId, title, body, data } = req.body;
    
    if (!userId || !title || !body) {
      return res.status(400).json({ 
        error: 'userId, title, body는 필수입니다' 
      });
    }

    const result = await fcmNotification.sendNotificationToUser(
      userId,
      title,
      body,
      data || {}
    );

    res.json(result);
  } catch (error) {
    console.error('FCM 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fcm/send-to-multiple
 * 여러 사용자에게 푸시 알림 전송
 * 
 * 요청 바디:
 * {
 *   "userIds": ["user1", "user2", "user3"],
 *   "title": "긴급공지",
 *   "body": "새로운 공지사항이 있습니다",
 *   "data": { "type": "notice" }
 * }
 */
app.post('/api/fcm/send-to-multiple', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        error: 'Firebase가 초기화되지 않았습니다.' 
      });
    }

    const { userIds, title, body, data } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        error: 'userIds는 필수 배열입니다' 
      });
    }
    if (!title || !body) {
      return res.status(400).json({ 
        error: 'title과 body는 필수입니다' 
      });
    }

    const results = await fcmNotification.sendNotificationToMultipleUsers(
      userIds,
      title,
      body,
      data || {}
    );

    res.json({
      success: true,
      totalUsers: userIds.length,
      results: results
    });
  } catch (error) {
    console.error('복수 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fcm/broadcast
 * 모든 사용자에게 브로드캐스트 알림 전송
 */
app.post('/api/fcm/broadcast', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        error: 'Firebase가 초기화되지 않았습니다.' 
      });
    }

    const { title, body, data } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ 
        error: 'title과 body는 필수입니다' 
      });
    }

    const result = await fcmNotification.broadcastNotification(
      title,
      body,
      data || {}
    );

    res.json(result);
  } catch (error) {
    console.error('브로드캐스트 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fcm/send-to-token
 * 특정 토큰으로 직접 알림 전송 (테스트용)
 */
app.post('/api/fcm/send-to-token', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        error: 'Firebase가 초기화되지 않았습니다.' 
      });
    }

    const { token, title, body, data } = req.body;
    
    if (!token || !title || !body) {
      return res.status(400).json({ 
        error: 'token, title, body는 필수입니다' 
      });
    }

    const result = await fcmNotification.sendNotificationToToken(
      token,
      title,
      body,
      data || {}
    );

    res.json(result);
  } catch (error) {
    console.error('토큰 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fcm/user-tokens/:userId
 * 사용자의 등록된 모든 FCM 토큰 조회 (디버깅용)
 */
app.get('/api/fcm/user-tokens/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const tokens = fcmNotification.getUserTokens(userId);
    
    res.json({
      userId,
      tokenCount: tokens.length,
      tokens: tokens.map(t => ({
        token: t.substring(0, 30) + '...',
        fullToken: t // 필요시 전체 토큰도 제공
      }))
    });
  } catch (error) {
    console.error('토큰 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fcm/all-users
 * 등록된 모든 사용자의 토큰 수 조회 (디버깅용)
 */
app.get('/api/fcm/all-users', (req, res) => {
  try {
    const allTokens = fcmNotification.userTokens;
    const userCount = Object.keys(allTokens).length;
    const totalTokens = Object.values(allTokens).reduce((sum, tokens) => sum + tokens.length, 0);
    
    const users = Object.entries(allTokens).map(([userId, tokens]) => ({
      userId,
      tokenCount: tokens.length
    }));

    res.json({
      totalUsers: userCount,
      totalTokens: totalTokens,
      users: users
    });
  } catch (error) {
    console.error('전체 사용자 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/fcm/user-tokens/:userId
 * 사용자의 모든 토큰 삭제
 */
app.delete('/api/fcm/user-tokens/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    delete fcmNotification.userTokens[userId];
    
    console.log(`🗑️ 사용자 ${userId}의 모든 토큰 삭제됨`);
    res.json({
      success: true,
      message: `사용자 ${userId}의 토큰이 삭제되었습니다`
    });
  } catch (error) {
    console.error('토큰 삭제 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fcm/test-push
 * 테스트 푸시 알림 전송 (디버깅용)
 * 
 * 요청 바디:
 * {
 *   "userId": "user123",
 *   "title": "테스트",
 *   "body": "테스트 알림입니다",
 *   "data": { "url": "/notice/123" }
 * }
 */
app.post('/api/fcm/test-push', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        error: 'Firebase가 초기화되지 않았습니다. serviceAccountKey.json을 확인하세요.' 
      });
    }

    const { userId, title = '테스트 알림', body = '이것은 테스트 알림입니다', data = {} } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId는 필수입니다' 
      });
    }

    console.log(`🚀 테스트 푸시 전송: ${userId} - ${title}`);

    const result = await fcmNotification.sendNotificationToUser(
      userId,
      title,
      body,
      data
    );

    res.json({
      success: true,
      message: '테스트 푸시 알림 전송 완료',
      result
    });
  } catch (error) {
    console.error('테스트 푸시 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fcm/tokens/:userId
 * 사용자의 모든 FCM 토큰 조회
 */
app.get('/api/fcm/tokens/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [tokens] = await pool.query(
      'SELECT id, token, platform, device_name, created_at, last_used FROM fcm_tokens WHERE user_id = ? ORDER BY last_used DESC',
      [userId]
    );

    res.json({
      success: true,
      userId,
      count: tokens.length,
      tokens: tokens
    });
  } catch (error) {
    console.error('토큰 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fcm/latest-token/:userId
 * 사용자의 최신 FCM 토큰 조회 (가장 최근 사용)
 */
app.get('/api/fcm/latest-token/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [tokens] = await pool.query(
      'SELECT token, platform, device_name, created_at, last_used FROM fcm_tokens WHERE user_id = ? ORDER BY last_used DESC LIMIT 1',
      [userId]
    );

    if (tokens.length === 0) {
      return res.json({
        success: false,
        message: '등록된 토큰이 없습니다',
        userId,
        token: null
      });
    }

    const latestToken = tokens[0];
    res.json({
      success: true,
      userId,
      token: latestToken.token,
      platform: latestToken.platform,
      device_name: latestToken.device_name,
      created_at: latestToken.created_at,
      last_used: latestToken.last_used
    });
  } catch (error) {
    console.error('최신 토큰 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});