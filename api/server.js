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

const fs = require('fs');
const { parse } = require('csv-parse/sync');

// DB 초기화 및 연결
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('데이터베이스 연결 실패:', err.message);
  } else {
    console.log('SQLite 데이터베이스에 성공적으로 연결되었습니다.');
    
    db.serialize(() => {
      // 테이블 생성
      db.run(`
        CREATE TABLE IF NOT EXISTS Albergues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          status TEXT DEFAULT 'gray',
          lastUpdated TEXT DEFAULT '업데이트 없음'
        )
      `);
      
      // 데이터가 없는 경우 자동 임포트
      db.get("SELECT COUNT(*) as count FROM Albergues", (err, row) => {
        if (err) {
          console.error('데이터 확인 실패:', err.message);
        } else if (row.count === 0) {
          console.log('데이터가 비어있습니다. CSV 파일에서 데이터를 임포트합니다...');
          try {
            const csvFilePath = path.resolve(__dirname, 'full_data.csv');
            if (fs.existsSync(csvFilePath)) {
              const csvData = fs.readFileSync(csvFilePath, 'utf8');
              const records = parse(csvData, { columns: true, skip_empty_lines: true });
              
              const startPoint = { lat: 43.1636, lng: -1.2374 };
              const endPoint = { lat: 42.8806, lng: -8.5448 };
              
              const stmt = db.prepare('INSERT INTO Albergues (name, lat, lng, status, lastUpdated) VALUES (?, ?, ?, ?, ?)');
              records.forEach((record, i) => {
                const city = record.ville;
                const name = `${record.refuges} (${city})`;
                const progress = i / (records.length - 1 || 1);
                const latOffset = Math.sin(progress * Math.PI) * 0.3;
                const lat = startPoint.lat + (endPoint.lat - startPoint.lat) * progress + latOffset;
                const lng = startPoint.lng + (endPoint.lng - startPoint.lng) * progress;
                stmt.run(name, lat, lng, 'gray', '업데이트 없음');
              });
              stmt.finalize();
              console.log(`${records.length}개의 숙소 정보를 성공적으로 임포트했습니다.`);
            }
          } catch (importErr) {
            console.error('데이터 임포트 실패:', importErr.message);
          }
        } else {
          console.log(`현재 ${row.count}개의 숙소 정보가 존재합니다.`);
        }
      });
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
