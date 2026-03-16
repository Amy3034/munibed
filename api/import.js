const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const csvData = fs.readFileSync(path.resolve(__dirname, 'data.csv'), 'utf8');
const lines = csvData.trim().split('\n');
const headers = lines.shift().split(',');

db.serialize(() => {
  // 기존 데이터 삭제 (중복 방지)
  db.run('DELETE FROM Albergues');
  
  const stmt = db.prepare('INSERT INTO Albergues (name, lat, lng, status, lastUpdated) VALUES (?, ?, ?, ?, ?)');
  
  lines.forEach(line => {
    const parts = line.split(',');
    if (parts.length === 5) {
      stmt.run(parts[0], parseFloat(parts[1]), parseFloat(parts[2]), parts[3], parts[4]);
    }
  });
  
  stmt.finalize(() => {
    console.log('CSV 데이터가 성공적으로 데이터베이스에 삽입되었습니다.');
    db.close();
  });
});
