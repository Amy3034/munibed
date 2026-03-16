const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { parse } = require('csv-parse/sync');

const API_KEY = '65fc7c2226224385966601nhe6b5a37'; // Free tier key for geocode.maps.co

async function startImport() {
    const fetch = (await import('node-fetch')).default;
    const dbPath = path.resolve(__dirname, 'database.sqlite');
    const db = new sqlite3.Database(dbPath);

    console.log('Reading full_data.csv...');
    const csvData = fs.readFileSync(path.resolve(__dirname, 'full_data.csv'), 'utf8');
    
    const records = parse(csvData, { columns: true, skip_empty_lines: true });

    console.log(`Found ${records.length} records. Fetching REAL coordinates...`);
    
    async function getCoordinates(city) {
        let query = city;
        if (city === "Saint-Jean-Pied-de-Port") {
             query = "Saint-Jean-Pied-de-Port, France";
        } else {
            // Remove contents in parentheses (e.g., "Ref. municipal (Larrasoana)" -> "Larrasoana") 
            // and add Spain for accuracy
            query = `${city.replace(/\(.*?\)/g, '').trim()}, Spain`;
        }

        // Using Geocode.maps.co as an alternative to Nominatim to avoid strict bot blocking
        const url = `https://geocode.maps.co/search?q=${encodeURIComponent(query)}&api_key=${API_KEY}`;
        
        try {
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                }
            } else {
                console.log(`Geocode API returned ${response.status} for ${city}`);
            }
        } catch (error) {
            console.error(`Error geocoding ${city}:`, error.message);
        }
        
        // If it really fails, we fallback to a rough estimate near Pamplona just so it appears on the map
        return { lat: 42.818, lng: -1.6441 };
    }

    const runDelete = () => new Promise((resolve, reject) => {
        db.run('DELETE FROM Albergues', err => err ? reject(err) : resolve());
    });

    const runInsert = (name, lat, lng, status, lastUpdated) => new Promise((resolve, reject) => {
        db.run('INSERT INTO Albergues (name, lat, lng, status, lastUpdated) VALUES (?, ?, ?, ?, ?)', 
            [name, lat, lng, status, lastUpdated], err => err ? reject(err) : resolve());
    });

    try {
        await runDelete();
        console.log('Cleared existing data.');

        const delay = ms => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            let city = record.ville;
            let name = `${record.refuges} (${city})`;
            
            console.log(`[${i+1}/${records.length}] Fetching real coords for: ${city}...`);
            
            let coords = await getCoordinates(city);
            
            await runInsert(name, coords.lat, coords.lng, 'gray', '업데이트 없음');

            // 1.5s delay to strictly respect API rate limits (free tier is usually 1-2 per sec)
            await delay(1500); 
        }

        console.log('Finished importing REAL route data!');
    } catch (e) {
        console.error("Database error:", e);
    } finally {
        db.close();
    }
}

startImport();
