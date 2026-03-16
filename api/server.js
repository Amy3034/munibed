const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.set('json spaces', 2);
app.use(express.static(path.join(__dirname, 'public')));

// ── PostgreSQL Pool ─────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ── Albergue Seed Data ──────────────────────────────────────────
const coordsMap = {
  "Saint-Jean-Pied-de-Port": {lat: 43.1636, lng: -1.2374},
  "Roncevaux": {lat: 43.0098, lng: -1.3197},
  "Camping Urrobi-Espinal": {lat: 42.9774, lng: -1.3533},
  "Zubiri": {lat: 42.9304, lng: -1.5032},
  "Larrasoana": {lat: 42.8887, lng: -1.5457},
  "Arre-Villava": {lat: 42.8306, lng: -1.6146},
  "Pampelune": {lat: 42.8125, lng: -1.6458},
  "Cizur Minor": {lat: 42.7937, lng: -1.6705},
  "Uterga": {lat: 42.7167, lng: -1.7483},
  "Obanos": {lat: 42.6828, lng: -1.7852},
  "Puente La Reina": {lat: 42.6718, lng: -1.8136},
  "Cirauqui": {lat: 42.6583, lng: -1.9056},
  "Lorca": {lat: 42.6681, lng: -1.9669},
  "Villatuerta": {lat: 42.6583, lng: -1.9961},
  "Estella": {lat: 42.6717, lng: -2.0308},
  "Ayegui": {lat: 42.6567, lng: -2.0461},
  "Villamajor de Monjardin": {lat: 42.6322, lng: -2.1006},
  "Los Arcos": {lat: 42.5694, lng: -2.1833},
  "Sansol": {lat: 42.5561, lng: -2.2611},
  "Torres del Rio": {lat: 42.5528, lng: -2.2711},
  "Viana": {lat: 42.5147, lng: -2.3719},
  "Logroño": {lat: 42.4627, lng: -2.4450},
  "Navarrete": {lat: 42.4286, lng: -2.5606},
  "(Ventosa) 4 km": {lat: 42.4042, lng: -2.6281},
  "Najera": {lat: 42.4178, lng: -2.7350},
  "Azofra": {lat: 42.4228, lng: -2.8028},
  "Santo Domingo de la Calzada": {lat: 42.4419, lng: -2.9536},
  "Grañon": {lat: 42.4497, lng: -3.0275},
  "Redecilla del Camino": {lat: 42.4361, lng: -3.0642},
  "Viloria de Rioja": {lat: 42.4239, lng: -3.1067},
  "Villamayor del Rio": {lat: 42.4161, lng: -3.1369},
  "Belorado": {lat: 42.4192, lng: -3.1897},
  "Tosantos": {lat: 42.4067, lng: -3.2425},
  "Espinosa del Camino": {lat: 42.3994, lng: -3.2769},
  "Villafranca Montes de Oca": {lat: 42.3872, lng: -3.3131},
  "San Juan de Ortega": {lat: 42.3769, lng: -3.4267},
  "Agès": {lat: 42.3756, lng: -3.4739},
  "Atapuerca": {lat: 42.3789, lng: -3.5042},
  "Cardeñuels - Riopico": {lat: 42.3592, lng: -3.6169},
  "Burgos": {lat: 42.3439, lng: -3.6969},
  "Villalbilla de Burgos": {lat: 42.3361, lng: -3.7806},
  "Tardajos": {lat: 42.3508, lng: -3.8183},
  "Hornillos del Camino": {lat: 42.3392, lng: -3.9219},
  "Hontanas": {lat: 42.3131, lng: -4.0450},
  "San Anton": {lat: 42.2961, lng: -4.0778},
  "Castrojeriz": {lat: 42.2878, lng: -4.1378},
  "Puente Fitero San Nicolas": {lat: 42.2742, lng: -4.2542},
  "Itero de la Vega": {lat: 42.2842, lng: -4.2611},
  "Boadilla del Camino": {lat: 42.2597, lng: -4.3481},
  "Fromista": {lat: 42.2667, lng: -4.4069},
  "Poblacion de Campos": {lat: 42.2722, lng: -4.4539},
  "Villalcazar de Sirga": {lat: 42.3164, lng: -4.5422},
  "Carrion de los Condes": {lat: 42.3389, lng: -4.6028},
  "Calzadilla de la Cueza": {lat: 42.3197, lng: -4.7931},
  "Ledigos": {lat: 42.3389, lng: -4.8561},
  "Terradillos de Los Templarios": {lat: 42.3411, lng: -4.8889},
  "San Nicolas del Real Carnino": {lat: 42.3503, lng: -4.9542},
  "Sahagun": {lat: 42.3719, lng: -5.0319},
  "Calzada del Coto": {lat: 42.3908, lng: -5.0803},
  "Bercianos del Camino": {lat: 42.3831, lng: -5.1436},
  "El Burgo Ranero": {lat: 42.4239, lng: -5.2217},
  "Rellegos": {lat: 42.4828, lng: -5.3528},
  "Mansilla de las Mulas": {lat: 42.4969, lng: -5.4161},
  "Villarente": {lat: 42.5186, lng: -5.4856},
  "Arcahueja": {lat: 42.5458, lng: -5.5297},
  "Leon": {lat: 42.5987, lng: -5.5671},
  "Virgen del Camino": {lat: 42.5769, lng: -5.6386},
  "Villadangos del Paramo": {lat: 42.5161, lng: -5.7656},
  "(Villar de Mazarife) variante": {lat: 42.4636, lng: -5.7331},
  "Hospital de Orbigo": {lat: 42.4650, lng: -5.8822},
  "Astorga": {lat: 42.4550, lng: -6.0594},
  "Murias de Rechivaldo": {lat: 42.4497, lng: -6.1106},
  "Santa Catalina de Somoza": {lat: 42.4536, lng: -6.1664},
  "El Ganso": {lat: 42.4600, lng: -6.2150},
  "Rabanal del Camino": {lat: 42.4800, lng: -6.2842},
  "Foncabadon": {lat: 42.5028, lng: -6.3406},
  "Manjarin": {lat: 42.5153, lng: -6.3742},
  "El Acebo": {lat: 42.5317, lng: -6.4464},
  "Riego de Ambros": {lat: 42.5414, lng: -6.4822},
  "Molinaseca": {lat: 42.5381, lng: -6.5200},
  "Ponferrada": {lat: 42.5464, lng: -6.5908},
  "Cacabelos": {lat: 42.5986, lng: -6.7258},
  "Villafranca del Bierzo": {lat: 42.6067, lng: -6.8111},
  "Pereje": {lat: 42.6306, lng: -6.8406},
  "Trabadelo": {lat: 42.6481, lng: -6.8817},
  "La Portela de Valcarce": {lat: 42.6567, lng: -6.9158},
  "Ambanastas": {lat: 42.6608, lng: -6.9275},
  "Vega de Valcarce": {lat: 42.6653, lng: -6.9469},
  "Ruitelan": {lat: 42.6739, lng: -6.9639},
  "La Faba": {lat: 42.6869, lng: -6.9953},
  "Laguna de Castilla": {lat: 42.7042, lng: -7.0208},
  "O Cebreiro": {lat: 42.7114, lng: -7.0433},
  "Hospital de la Condesa": {lat: 42.7247, lng: -7.0864},
  "Fonfria": {lat: 42.7483, lng: -7.1483},
  "Triacastela": {lat: 42.7567, lng: -7.2431},
  "Samos": {lat: 42.7317, lng: -7.3275},
  "(Calvor) 12 km": {lat: 42.7661, lng: -7.3692},
  "Sarria": {lat: 42.7806, lng: -7.4147},
  "Barbadelo": {lat: 42.7656, lng: -7.4606},
  "Ferreiros": {lat: 42.8258, lng: -7.5303},
  "Portomarin": {lat: 42.8081, lng: -7.6167},
  "Gonzar": {lat: 42.8339, lng: -7.6975},
  "Hospital de la Cruz": {lat: 42.8550, lng: -7.7664},
  "Ventas de Naron": {lat: 42.8589, lng: -7.7817},
  "Ligonde": {lat: 42.8681, lng: -7.8183},
  "Eirexe": {lat: 42.8722, lng: -7.8344},
  "Palas del Rei": {lat: 42.8731, lng: -7.8686},
  "San Xulian": {lat: 42.8800, lng: -7.9042},
  "Ponte Campana": {lat: 42.8842, lng: -7.9422},
  "Casanova Mato": {lat: 42.8872, lng: -7.9575},
  "Leboreiro": {lat: 42.8986, lng: -7.9867},
  "Melide": {lat: 42.9150, lng: -8.0169},
  "Ribadiso de Baixo": {lat: 42.9242, lng: -8.1342},
  "Arzua": {lat: 42.9272, lng: -8.1639},
  "Santa Irene": {lat: 42.9153, lng: -8.3242},
  "Arca O Pino": {lat: 42.9067, lng: -8.3619},
  "Monte del Gozo": {lat: 42.8886, lng: -8.4947},
  "Santiago de Compostella": {lat: 42.8806, lng: -8.5448},
  "De Santiago à Negreira": {lat: 42.9050, lng: -8.7369},
  "Vilaserio": {lat: 42.9242, lng: -8.8450},
  "Olveiroa": {lat: 42.9786, lng: -9.0442},
  "Cee": {lat: 42.9536, lng: -9.1883},
  "Corcubion Redonda": {lat: 42.9467, lng: -9.1936},
  "Fisterra": {lat: 42.9061, lng: -9.2636}
};

// Raw CSV data embedded for seeding
const albergueRows = [
  ["Ref. municipal (Saint-Jean-Pied-de-Port)","Saint-Jean-Pied-de-Port"],
  ["Collégiale / Auberge de Jeunesse (Roncevaux)","Roncevaux"],
  ["Auberge privée (Camping Urrobi-Espinal)","Camping Urrobi-Espinal"],
  ["Ref. municipal / Auberge privée Zaldiko (Zubiri)","Zubiri"],
  ["Ref. municipal (Larrasoana)","Larrasoana"],
  ["Ref. des Frères Maristes (Arre-Villava)","Arre-Villava"],
  ["Ref. Jésus et Maria / Ref. privé Paderborn (Pampelune)","Pampelune"],
  ["Ref. privé Roncal (Cizur Minor)","Cizur Minor"],
  ["Ref. prive Ana Calvo (Uterga)","Uterga"],
  ["USDA Privé (Obanos)","Obanos"],
  ["Ref. Padres Reparadores / Ref. privé Jakue (Puente La Reina)","Puente La Reina"],
  ["Ref. privé Maralotx / Ref. paroissial (Cirauqui)","Cirauqui"],
  ["Ref. privé Ramon / RP La Bodega del Camino (Lorca)","Lorca"],
  ["Ref. prive Arandigoyen (Villatuerta)","Villatuerta"],
  ["Ref. Asso. Estella / Ref. Asso. Anfas (Estella)","Estella"],
  ["Ref.Mun.San Cipriano (Ayegui)","Ayegui"],
  ["Ref. paroissial / Ref. privé Hollandais (Villamajor de Monjardin)","Villamajor de Monjardin"],
  ["Ref. municipal / Raf privé Atharli (Los Arcos)","Los Arcos"],
  ["Ref. Privé Arcadi y Nines (Sansol)","Sansol"],
  ["Ref. privé Casa Man (Torres del Rio)","Torres del Rio"],
  ["Ref. mun. Munoz (Viana)","Viana"],
  ["Ref. Ass. La Rioja / Ref. mun. Munoz (Logroño)","Logroño"],
  ["Ref. privé El Cantaro (Navarrete)","Navarrete"],
  ["Ref. privé San Saturnino ((Ventosa) 4 km)","(Ventosa) 4 km"],
  ["Ref. Ass. Najera / Ref. La Juderia (Najera)","Najera"],
  ["Ref. municipal (Azofra)","Azofra"],
  ["Ref. Casa. Del Santo / Ref. abbaye Cistercienne (Santo Domingo de la Calzada)","Santo Domingo de la Calzada"],
  ["Ref. paroissial (Grañon)","Grañon"],
  ["Ref. mun, San Lazaro (Redecilla del Camino)","Redecilla del Camino"],
  ["Rel. privé Acacia y Orieta (Viloria de Rioja)","Viloria de Rioja"],
  ["Ref. prive San Luis (Villamayor del Rio)","Villamayor del Rio"],
  ["Ref. paroissial / Refuge mun. El Corro (Belorado)","Belorado"],
  ["Ref.privé A Santiago / Ref. paroissial (Tosantos)","Tosantos"],
  ["Ref. privé La Campana (Espinosa del Camino)","Espinosa del Camino"],
  ["Ref. municipal (Villafranca Montes de Oca)","Villafranca Montes de Oca"],
  ["Ref. paroissial San Juan (San Juan de Ortega)","San Juan de Ortega"],
  ["Ref. mun. San Rafael / Ref. privé El Pajar (Agès)","Agès"],
  ["Ref. privé La Hutte / Ref, privé Rocio Garcia (Atapuerca)","Atapuerca"],
  ["Ref. municipal (Cardeñuels - Riopico)","Cardeñuels - Riopico"],
  ["Ref. Asso Burgos / Ref privé Emmaus (Burgos)","Burgos"],
  ["Ref. municipal (Villalbilla de Burgos)","Villalbilla de Burgos"],
  ["Ref. municipal (Tardajos)","Tardajos"],
  ["Ref. municipal (Hornillos del Camino)","Hornillos del Camino"],
  ["Ref. municipal / Raf privé Puntido (Hontanas)","Hontanas"],
  ["Ref. association (San Anton)","San Anton"],
  ["Ref, municipal / Ref. Privé Casa Nostra (Castrojeriz)","Castrojeriz"],
  ["Ref. municipal / Ref. San Nicolas (Puente Fitero San Nicolas)","Puente Fitero San Nicolas"],
  ["Ref. municipal / Ref. privé Itero (Itero de la Vega)","Itero de la Vega"],
  ["Ref. municipal / Centre Tourisme rural (Boadilla del Camino)","Boadilla del Camino"],
  ["Ref.municipal (Fromista)","Fromista"],
  ["Ref.municipal (Poblacion de Campos)","Poblacion de Campos"],
  ["Ref. prive Aurea (Villalcazar de Sirga)","Villalcazar de Sirga"],
  ["Ref. paroissial / Ref. privé Clarisses (Carrion de los Condes)","Carrion de los Condes"],
  ["Ref. prive Camino Real (Calzadilla de la Cueza)","Calzadilla de la Cueza"],
  ["Ref. privé El Palomar (Ledigos)","Ledigos"],
  ["Ref. privé J. de Molay / Ref privélos Templarios (Terradillos de Los Templarios)","Terradillos de Los Templarios"],
  ["Ref. privé Laganares (San Nicolas del Real Carnino)","San Nicolas del Real Carnino"],
  ["Ref. municipal Cluny / Ref. privé Viatoris (Sahagun)","Sahagun"],
  ["Ref. municipal (Calzada del Coto)","Calzada del Coto"],
  ["Ref. par.Casa rectoral / Ref. Ass. Léon (Bercianos del Camino)","Bercianos del Camino"],
  ["Ref. privé El Nogal / Centre turismo rural (El Burgo Ranero)","El Burgo Ranero"],
  ["Ref. municipal (Rellegos)","Rellegos"],
  ["Ref. municipal (Mansilla de las Mulas)","Mansilla de las Mulas"],
  ["Ref. privé San Pelayo (Villarente)","Villarente"],
  ["Ref. privé La Torre (Arcahueja)","Arcahueja"],
  ["Ref. municipal / Ref. Bénédictines (Leon)","Leon"],
  ["Ref. municipal (Virgen del Camino)","Virgen del Camino"],
  ["Ref. municipal (Villadangos del Paramo)","Villadangos del Paramo"],
  ["Ref. privé San Anton / Ref. privé Tio Pepe ((Villar de Mazarife) variante)","(Villar de Mazarife) variante"],
  ["Ref. mun. El Camping / Ref. paroissial (Hospital de Orbigo)","Hospital de Orbigo"],
  ["Ref. Siervas de Maria / Ref. municipal (Astorga)","Astorga"],
  ["Rof. privé Las Aguadas (Murias de Rechivaldo)","Murias de Rechivaldo"],
  ["Ref. municipal (Santa Catalina de Somoza)","Santa Catalina de Somoza"],
  ["Ref. municipal (El Ganso)","El Ganso"],
  ["Ref. Asso. Gaucelmo / Ref. privé N.S. del Pilar (Rabanal del Camino)","Rabanal del Camino"],
  ["Ref. paroissial / RP Monte Irago (Foncabadon)","Foncabadon"],
  ["Ref. privé Martinez (Manjarin)","Manjarin"],
  ["Ref. privé Florez (El Acebo)","El Acebo"],
  ["Ref. privé (Riego de Ambros)","Riego de Ambros"],
  ["Ref. municipal / RP Santa Marina (Molinaseca)","Molinaseca"],
  ["Ref. paroissial (Ponferrada)","Ponferrada"],
  ["Ref. municipal (Cacabelos)","Cacabelos"],
  ["Ref. municipal / Ref: prive Jato (Villafranca del Bierzo)","Villafranca del Bierzo"],
  ["Ref. municipal (Pereje)","Pereje"],
  ["Ref.municipal (Trabadelo)","Trabadelo"],
  ["Centre tourisme rural (La Portela de Valcarce)","La Portela de Valcarce"],
  ["Ref. privé Das Anima (Ambanastas)","Ambanastas"],
  ["Ref. municipal / RP NS do Brazil (Vega de Valcarce)","Vega de Valcarce"],
  ["Ref. privé Potala (Ruitelan)","Ruitelan"],
  ["Ref. Ass. Allemande (La Faba)","La Faba"],
  ["Ref. privé (Laguna de Castilla)","Laguna de Castilla"],
  ["Ref. ACAG (O Cebreiro)","O Cebreiro"],
  ["Ref. ACAG (Hospital de la Condesa)","Hospital de la Condesa"],
  ["Ref. privé Reboleira (Fonfria)","Fonfria"],
  ["Ref. ACAG (Triacastela)","Triacastela"],
  ["Monastère Bénédictins (Samos)","Samos"],
  ["Ref. ACAG ((Calvor) 12 km)","(Calvor) 12 km"],
  ["Ref. ACAG (Sarria)","Sarria"],
  ["Ref. ACAG / Ref. privé Casa Carmen (Barbadelo)","Barbadelo"],
  ["Ref. ACAG / Ref. municipal (Ferreiros)","Ferreiros"],
  ["Raf privé Ferramanteiro / Ref. mun. Et Caminante (Portomarin)","Portomarin"],
  ["Ref. ACAG (Gonzar)","Gonzar"],
  ["Ref. ACAG (Hospital de la Cruz)","Hospital de la Cruz"],
  ["Ref. Privé Casa Molar / Ref Privé O Cruceiro (Ventas de Naron)","Ventas de Naron"],
  ["Ref ACAG (Ligonde)","Ligonde"],
  ["Ref.ACAG (Eirexe)","Eirexe"],
  ["Ref.ACAG / Ref. prive Buen Camino (Palas del Rei)","Palas del Rei"],
  ["RP O Abrigadoiro (San Xulian)","San Xulian"],
  ["Ref. privé Casa Domingo (Ponte Campana)","Ponte Campana"],
  ["Ref. ACAG (Casanova Mato)","Casanova Mato"],
  ["Ref. municipal (Leboreiro)","Leboreiro"],
  ["Ref. ACAG (Melide)","Melide"],
  ["Ref. ACAG (Ribadiso de Baixo)","Ribadiso de Baixo"],
  ["Ref. ACAG (Arzua)","Arzua"],
  ["Ref. ACAG / Ref, privé Calvo (Santa Irene)","Santa Irene"],
  ["Ref. ACAG (Arca O Pino)","Arca O Pino"],
  ["Ref. ACAG (Monte del Gozo)","Monte del Gozo"],
  ["Séminaire Menor / Ref. privé Acuario (Santiago de Compostella)","Santiago de Compostella"],
  ["Ref. municipal (De Santiago à Negreira)","De Santiago à Negreira"],
  ["Ref. municipal (Vilaserio)","Vilaserio"],
  ["Ref. municipal (Olveiroa)","Olveiroa"],
  ["Protection Civile (Cee)","Cee"],
  ["Ref. Ass. Galega (Corcubion Redonda)","Corcubion Redonda"],
  ["Ref. municipal (Fisterra)","Fisterra"]
];

// ── DB Init ─────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    // Create Albergues table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Albergues" (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        status TEXT DEFAULT 'gray',
        "lastUpdated" TEXT DEFAULT '업데이트 없음'
      )
    `);

    // Seed Albergues only if empty
    const { rows } = await client.query('SELECT COUNT(*) FROM "Albergues"');
    if (parseInt(rows[0].count) === 0) {
      console.log('Seeding Albergues data...');
      const defaultCoords = { lat: 42.5, lng: -4.0 };
      for (const [name, city] of albergueRows) {
        const coords = coordsMap[city] || defaultCoords;
        await client.query(
          'INSERT INTO "Albergues" (name, lat, lng, status, "lastUpdated") VALUES ($1, $2, $3, $4, $5)',
          [name, coords.lat, coords.lng, 'gray', '업데이트 없음']
        );
      }
      console.log(`✅ Seeded ${albergueRows.length} albergues.`);
    }

    // Create Comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Comments" (
        id SERIAL PRIMARY KEY,
        nickname TEXT NOT NULL,
        content TEXT NOT NULL,
        "createdAt" TEXT NOT NULL
      )
    `);

    console.log('✅ Database initialized.');
  } finally {
    client.release();
  }
}

// ── API Routes ───────────────────────────────────────────────────

// GET all albergues
app.get('/api/albergues', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "Albergues" ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH albergue status
app.patch('/api/albergues/:id', async (req, res) => {
  const { status, lastUpdated } = req.body;
  const { id } = req.params;
  if (!status || !lastUpdated) {
    return res.status(400).json({ error: 'status and lastUpdated are required.' });
  }
  try {
    const result = await pool.query(
      'UPDATE "Albergues" SET status = $1, "lastUpdated" = $2 WHERE id = $3',
      [status, lastUpdated, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: '업데이트 성공', updatedId: id, newStatus: status, newLastUpdated: lastUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET comments
app.get('/api/comments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "Comments" ORDER BY id DESC LIMIT 100');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST comment
app.post('/api/comments', async (req, res) => {
  const { nickname, content } = req.body;
  if (!nickname || !content) {
    return res.status(400).json({ error: 'nickname and content are required.' });
  }
  const now = new Date();
  const createdAt = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  try {
    const { rows } = await pool.query(
      'INSERT INTO "Comments" (nickname, content, "createdAt") VALUES ($1, $2, $3) RETURNING *',
      [nickname, content, createdAt]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cron: Reset all statuses at 2am ────────────────────────────
cron.schedule('0 2 * * *', async () => {
  console.log('⏰ Resetting all albergue statuses...');
  try {
    const result = await pool.query(
      'UPDATE "Albergues" SET status = \'gray\', "lastUpdated" = \'새벽 2시 일괄 초기화됨\''
    );
    console.log(`✅ Reset ${result.rowCount} albergues.`);
  } catch (err) {
    console.error('Reset failed:', err.message);
  }
});

// ── Start ────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`========================================`);
  });
}).catch(err => {
  console.error('DB initialization failed:', err);
  process.exit(1);
});
