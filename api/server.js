const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정: CodeSandbox 등 외부 클라이언트에서 API 요청이 가능하도록 CORS 허용
app.use(cors());
// JSON 형태의 요청 본문(body)을 파싱하기 위한 미들웨어
app.use(express.json());
// 브라우저에서 보기 좋게 JSON 출력을 들여쓰기(pretty print) 설정
app.set('json spaces', 2);
// public 폴더의 정적 파일 제공 (프론트엔드 연결)
app.use(express.static(path.join(__dirname, 'public')));

// DB 초기화 및 연결
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('데이터베이스 연결 실패:', err.message);
  } else {
    console.log('SQLite 데이터베이스에 성공적으로 연결되었습니다.');
    
    // 빈 테이블 생성 (초기 데이터 없음)
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS Albergues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        status TEXT DEFAULT 'gray',
        lastUpdated TEXT DEFAULT '업데이트 없음'
      )
    `;
    
    db.run(createTableQuery, (err) => {
      if (err) {
        console.error('테이블 생성 실패:', err.message);
      } else {
        console.log('Albergues 테이블 확인 완료.');
      }
    });
  }
});

// GET API: 전체 데이터 불러오기
app.get('/api/albergues', (req, res) => {
  const sql = 'SELECT * FROM Albergues';
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // 데이터 반환 (비어있으면 빈 배열이 반환됨)
    res.json(rows);
  });
});

// PATCH API: 특정 숙소의 상태(status)와 업데이트 시간(lastUpdated) 수정
app.patch('/api/albergues/:id', (req, res) => {
  const { status, lastUpdated } = req.body;
  const { id } = req.params;

  // 필수 필드 확인
  if (status === undefined || lastUpdated === undefined) {
    return res.status(400).json({ error: "status와 lastUpdated 값이 모두 필요합니다." });
  }

  const sql = 'UPDATE Albergues SET status = ?, lastUpdated = ? WHERE id = ?';
  const params = [status, lastUpdated, id];

  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // 만약 넘어온 id와 일치하는 데이터가 없다면
    if (this.changes === 0) {
      return res.status(404).json({ error: "해당 id를 가진 숙소를 찾을 수 없습니다." });
    }
    
    // 수정 성공 응답
    res.json({ 
      message: "성공적으로 업데이트 되었습니다.", 
      updatedId: id,
      newStatus: status,
      newLastUpdated: lastUpdated
    });
  });
});

// --------------------------------------------------------------------------
// 매일 새벽 2시에 모든 숙소 상태를 '미확인(gray)'로 초기화하는 크론(Cron) 스케줄러
// --------------------------------------------------------------------------
// '0 2 * * *' 의 의미: 매일 02시 00분에 실행 (서버 로컬 타임 기준)
cron.schedule('0 2 * * *', () => {
  console.log('⏰ [Cron Job] 매일 새벽 2시 정각: 모든 알베르게 상태를 초기화합니다.');
  
  const resetQuery = `UPDATE Albergues SET status = 'gray', lastUpdated = '새벽 2시 일괄 초기화됨'`;
  db.run(resetQuery, [], function(err) {
    if (err) {
      console.error('초기화 실패:', err.message);
    } else {
      console.log(`✅ [Cron Job] 총 ${this.changes}개의 숙소 상태가 'gray'로 성공적으로 초기화되었습니다.`);
    }
  });
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`서버가 성공적으로 실행되었습니다!`);
  console.log(`[서버 주소] http://localhost:${PORT}`);
  console.log(`[GET API] http://localhost:${PORT}/api/albergues`);
  console.log(`[PATCH API] http://localhost:${PORT}/api/albergues/:id`);
  console.log(`========================================`);
});
