const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { parse } = require('csv-parse/sync');

// Dynamic import for node-fetch (ES Module in v3+)
async function startImport() {
    const fetch = (await import('node-fetch')).default;

    const dbPath = path.resolve(__dirname, 'database.sqlite');
    const db = new sqlite3.Database(dbPath);

    console.log('Reading full_data.csv...');
    const csvData = fs.readFileSync(path.resolve(__dirname, 'full_data.csv'), 'utf8');
    
    const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true
    });

    console.log(`Found ${records.length} records. Starting geocoding... This will take a moment.`);
    
    // Function to fetch coordinates
    async function getCoordinates(city) {
        let query = city;
        if (city === "Saint-Jean-Pied-de-Port") {
             query = "Saint-Jean-Pied-de-Port, France";
        } else {
            query = `${city.replace(/\(.*?\)/g, '').trim()}, Spain`;
        }

        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'CaminoAlbergueApp/1.0' }
            });
            const data = await response.json();
            
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
        } catch (error) {
            console.error(`Error geocoding ${city}:`, error);
        }
        
        return { lat: 0, lng: 0 };
    }

    // Wrap db operations in promises for sequential execution
    const runDelete = () => new Promise((resolve, reject) => {
        db.run('DELETE FROM Albergues', function(err) {
            if (err) reject(err);
            else resolve();
        });
    });

    const runInsert = (name, lat, lng, status, lastUpdated) => new Promise((resolve, reject) => {
        db.run('INSERT INTO Albergues (name, lat, lng, status, lastUpdated) VALUES (?, ?, ?, ?, ?)', 
            [name, lat, lng, status, lastUpdated], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });

    try {
        await runDelete();
        console.log('Cleared existing data.');

        const delay = ms => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            let city = record.ville;
            let name = `${record.refuges} (${city})`;
            
            console.log(`[${i+1}/${records.length}] Processing: ${city}...`);
            
            let coords = await getCoordinates(city);
            
            await runInsert(name, coords.lat, coords.lng, 'gray', '업데이트 없음');

            // 1.2s delay to respect Nominatim usage policy (1 req/sec limits)
            await delay(1200); 
        }

        console.log('Finished importing full route data!');
    } catch (e) {
        console.error("Database error:", e);
    } finally {
        db.close();
    }
}

startImport();
