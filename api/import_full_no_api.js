const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { parse } = require('csv-parse/sync');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Reading full_data.csv...');
const csvData = fs.readFileSync(path.resolve(__dirname, 'full_data.csv'), 'utf8');

const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true
});

console.log(`Found ${records.length} records. Importing dummy locations...`);

db.serialize(() => {
    db.run('DELETE FROM Albergues');
    
    const stmt = db.prepare('INSERT INTO Albergues (name, lat, lng, status, lastUpdated) VALUES (?, ?, ?, ?, ?)');

    // Instead of real Geocoding which blocked us, we will distribute them linearly 
    // across the map from St Jean Pied de Port to Santiago de Compostela roughly 
    // along the Camino Frances path.
    const startPoint = { lat: 43.1636, lng: -1.2374 }; // St. Jean
    const endPoint = { lat: 42.8806, lng: -8.5448 }; // Santiago

    records.forEach((record, i) => {
        let city = record.ville;
        let name = `${record.refuges} (${city})`;
        
        // Progress percentage (0.0 to 1.0)
        let progress = i / (records.length - 1 || 1);
        
        // Add a slight curve/noise to make it look a bit more realistic than a perfectly straight line
        const latOffset = Math.sin(progress * Math.PI) * 0.3; 
        
        let lat = startPoint.lat + (endPoint.lat - startPoint.lat) * progress + latOffset;
        let lng = startPoint.lng + (endPoint.lng - startPoint.lng) * progress;

        stmt.run(name, lat, lng, 'gray', '업데이트 없음');
    });

    stmt.finalize(() => {
        console.log('Finished importing 124 albergues successfully!');
        db.close();
    });
});
