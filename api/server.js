const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_START_TIME = Date.now();

const usePostgres = !!process.env.DATABASE_URL;
let pool;

if (usePostgres) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  const sqlite = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
  // Polyfill pool object for SQLite
  pool = {
    query: (text, params) => {
      return new Promise((resolve, reject) => {
        const isSelect = text.trim().toUpperCase().startsWith('SELECT');
        const method = isSelect ? 'all' : 'run';
        
        // Convert Postgres-style $1, $2 to SQLite-style ?
        const sqliteText = text.replace(/\$(\d+)/g, '?');
        
        sqlite[method](sqliteText, params || [], function(err, result) {
          if (err) {
            console.error('SQLite Error:', err);
            return reject(err);
          }
          resolve({ 
            rows: isSelect ? result : [], 
            rowCount: isSelect ? result.length : this.changes 
          });
        });
      });
    },
    connect: async () => ({
      query: (text, params) => pool.query(text, params),
      release: () => {}
    })
  };
}

app.use(cors());
app.use(express.json());
app.set('json spaces', 2);
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate Limiters (abuse mitigation) ───────────────────────────────
// express-rate-limit trusts X-Forwarded-For by default when trust proxy
// is set; Railway/Render sit behind a proxy, so this must be enabled or
// every request will be bucketed under the same IP.
app.set('trust proxy', 1);

// Safety net: caps total traffic per IP across every /api route.
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', code: 'RATE_LIMITED' }
});
app.use('/api', generalApiLimiter);

// Status updates are the main abuse target (fake "full/available" spam).
// The 5km + daily-4 rules already limit legitimate use per device, so this
// window is generous for real pilgrims but blocks scripted hammering.
const statusUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '상태 변경 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', code: 'RATE_LIMITED' }
});

// Comment spam guard.
const commentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '댓글 작성이 너무 잦습니다. 잠시 후 다시 시도해주세요.', code: 'RATE_LIMITED' }
});

// Slows down device_id cycling (registering fresh device_ids to dodge the
// daily-4 limit) — doesn't fully prevent it, but adds real friction.
const deviceRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '기기 등록 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', code: 'RATE_LIMITED' }
});

// ── Albergue Seed Data ──────────────────────────────────────────
const coordsMap = {
  "Saint-Jean-Pied-de-Port": {lat: 43.163782, lng: -1.234724},
  "Roncesvalles": {lat: 43.0098, lng: -1.3197},
  "Camping Urrobi-Espinal": {lat: 42.9774, lng: -1.3533},
  "Zubiri": {lat: 42.9304, lng: -1.5032},
  "Larrasoana": {lat: 42.8887, lng: -1.5457},
  "Arre-Villava": {lat: 42.8306, lng: -1.6146},
  "Pamplona": {lat: 42.819046, lng: -1.641834},
  "Cizur Minor": {lat: 42.7937, lng: -1.6705},
  "Uterga": {lat: 42.7167, lng: -1.7483},
  "Obanos": {lat: 42.6828, lng: -1.7852},
  "Puente La Reina": {lat: 42.6734, lng: -1.81042},
  "Cirauqui": {lat: 42.6583, lng: -1.9056},
  "Lorca": {lat: 42.6681, lng: -1.9669},
  "Villatuerta": {lat: 42.6583, lng: -1.9961},
  "Estella": {lat: 42.6698, lng: -2.027443},
  "Ayegui": {lat: 42.6567, lng: -2.0461},
  "Villamajor de Monjardin": {lat: 42.6322, lng: -2.1006},
  "Los Arcos": {lat: 42.569059, lng: -2.194208},
  "Sansol": {lat: 42.5561, lng: -2.2611},
  "Torres del Rio": {lat: 42.5528, lng: -2.2711},
  "Viana": {lat: 42.5147, lng: -2.3719},
  "Logroño": {lat: 42.4627, lng: -2.4450},
  "Navarrete": {lat: 42.4286, lng: -2.5606},
  "(Ventosa) 4 km": {lat: 42.4042, lng: -2.6281},
  "Najera": {lat: 42.414966, lng: -2.734201},
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
  "Agés": {lat: 42.369419, lng: -3.479197},
  "Atapuerca": {lat: 42.3789, lng: -3.5042},
  "Cardeñuels - Riopico": {lat: 42.3592, lng: -3.6169},
  "Burgos": {lat: 42.34235, lng: -3.703716},
  "Villalbilla de Burgos": {lat: 42.3361, lng: -3.7806},
  "Tardajos": {lat: 42.3508, lng: -3.8183},
  "Hornillos del Camino": {lat: 42.338699, lng: -3.926032},
  "Hontanas": {lat: 42.3131, lng: -4.0450},
  "San Anton": {lat: 42.2961, lng: -4.0778},
  "Castrojeriz": {lat: 42.291033, lng: -4.131811},
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
  "Leon": {lat: 42.595142, lng: -5.568218},
  "Virgen del Camino": {lat: 42.5769, lng: -5.6386},
  "Villadangos del Paramo": {lat: 42.5161, lng: -5.7656},
  "(Villar de Mazarife) variante": {lat: 42.4636, lng: -5.7331},
  "Hospital de Orbigo": {lat: 42.4650, lng: -5.8822},
  "Astorga": {lat: 42.452865, lng: -6.051355},
  "Murias de Rechivaldo": {lat: 42.4497, lng: -6.1106},
  "Santa Catalina de Somoza": {lat: 42.4536, lng: -6.1664},
  "El Ganso": {lat: 42.4600, lng: -6.2150},
  "Rabanal del Camino": {lat: 42.4800, lng: -6.2842},
  "Foncabadon": {lat: 42.5028, lng: -6.3406},
  "Manjarin": {lat: 42.5153, lng: -6.3742},
  "El Acebo": {lat: 42.5317, lng: -6.4464},
  "Riego de Ambros": {lat: 42.5414, lng: -6.4822},
  "Molinaseca": {lat: 42.540836, lng: -6.526174},
  "Ponferrada": {lat: 42.54339, lng: -6.586304},
  "Cacabelos": {lat: 42.600205, lng: -6.731248},
  "Villafranca del Bierzo": {lat: 42.604576, lng: -6.806513},
  "Pereje": {lat: 42.6306, lng: -6.8406},
  "Trabadelo": {lat: 42.6481, lng: -6.8817},
  "La Portela de Valcarce": {lat: 42.6567, lng: -6.9158},
  "Ambasmestas": {lat: 42.6608, lng: -6.9275},
  "Vega de Valcarce": {lat: 42.6653, lng: -6.9469},
  "Ruitelan": {lat: 42.6739, lng: -6.9639},
  "La Faba": {lat: 42.6869, lng: -6.9953},
  "Laguna de Castilla": {lat: 42.7042, lng: -7.0208},
  "O Cebreiro": {lat: 42.707744, lng: -7.045798},
  "Hospital de la Condesa": {lat: 42.7247, lng: -7.0864},
  "Fonfria": {lat: 42.7483, lng: -7.1483},
  "Triacastela": {lat: 42.755236, lng: -7.235385},
  "Samos": {lat: 42.7317, lng: -7.3275},
  "Calvor": {lat: 42.7661, lng: -7.3692},
  "Sarria": {lat: 42.777426, lng: -7.413567},
  "Barbadelo": {lat: 42.7656, lng: -7.4606},
  "Ferreiros": {lat: 42.8258, lng: -7.5303},
  "Portomarin": {lat: 42.8081, lng: -7.6167},
  "Gonzar": {lat: 42.8339, lng: -7.6975},
  "Hospital de la Cruz": {lat: 42.8550, lng: -7.7664},
  "Ventas de Naron": {lat: 42.8589, lng: -7.7817},
  "Ligonde": {lat: 42.8681, lng: -7.8183},
  "Eirexe": {lat: 42.8722, lng: -7.8344},
  "Palas de Rei": {lat: 42.8731, lng: -7.8686},
  "San Xulian": {lat: 42.8800, lng: -7.9042},
  "Ponte Campana": {lat: 42.8842, lng: -7.9422},
  "Casanova Mato": {lat: 42.8872, lng: -7.9575},
  "Leboreiro": {lat: 42.8986, lng: -7.9867},
  "Melide": {lat: 42.9150, lng: -8.0169},
  "Ribadiso de Baixo": {lat: 42.9242, lng: -8.1342},
  "Arzua": {lat: 42.9272, lng: -8.1639},
  "Santa Irene": {lat: 42.918397, lng: -8.335662},
  "Arca O Pino": {lat: 42.907131, lng: -8.358718},
  "Monte del Gozo": {lat: 42.887464, lng: -8.498075},
  "Santiago de Compostela": {lat: 42.8806, lng: -8.5448},
  "De Santiago a Negreira": {lat: 42.9050, lng: -8.7369},
  "Vilaserio": {lat: 42.9242, lng: -8.8450},
  "Olveiroa": {lat: 42.9786, lng: -9.0442},
  "Cee": {lat: 42.9536, lng: -9.1883},
  "Corcubion Redonda": {lat: 42.9467, lng: -9.1936},
  "Fisterra": {lat: 42.9061, lng: -9.2636}
};

// Raw CSV data embedded for seeding
const albergueRows = [
  ["Ref. municipal (Saint-Jean-Pied-de-Port)","Saint-Jean-Pied-de-Port"],
  ["Collégiale / Auberge de Jeunesse (Roncesvalles)","Roncesvalles"],
  ["Auberge privée (Camping Urrobi-Espinal)","Camping Urrobi-Espinal"],
  ["Ref. municipal / Auberge privée Zaldiko (Zubiri)","Zubiri"],
  ["Ref. municipal (Larrasoana)","Larrasoana"],
  ["Ref. des Frères Maristes (Arre-Villava)","Arre-Villava"],
  ["Ref. Jésus et Maria / Ref. privé Paderborn (Pamplona)","Pamplona"],
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
  ["Ref. Ass. La Rioja / Albergue Municipal (Logroño)","Logroño"],
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
  ["Ref. mun. San Rafael / Ref. privé El Pajar (Agés)","Agés"],
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
  ["Ref. privé Las Aguadas (Murias de Rechivaldo)","Murias de Rechivaldo"],
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
  ["Ref. privé Das Anima (Ambasmestas)","Ambasmestas"],
  ["Ref. municipal / RP NS do Brazil (Vega de Valcarce)","Vega de Valcarce"],
  ["Ref. privé Potala (Ruitelan)","Ruitelan"],
  ["Ref. Ass. Allemande (La Faba)","La Faba"],
  ["Ref. privé (Laguna de Castilla)","Laguna de Castilla"],
  ["Ref. ACAG (O Cebreiro)","O Cebreiro"],
  ["Ref. ACAG (Hospital de la Condesa)","Hospital de la Condesa"],
  ["Ref. privé Reboleira (Fonfria)","Fonfria"],
  ["Ref. ACAG (Triacastela)","Triacastela"],
  ["Monastère Bénédictins (Samos)","Samos"],
  ["Ref. ACAG (Calvor)","Calvor"],
  ["Ref. ACAG (Sarria)","Sarria"],
  ["Ref. ACAG / Ref. privé Casa Carmen (Barbadelo)","Barbadelo"],
  ["Ref. ACAG / Ref. municipal (Ferreiros)","Ferreiros"],
  ["Raf privé Ferramanteiro / Ref. mun. Et Caminante (Portomarin)","Portomarin"],
  ["Ref. ACAG (Gonzar)","Gonzar"],
  ["Ref. ACAG (Hospital de la Cruz)","Hospital de la Cruz"],
  ["Ref. Privé Casa Molar / Ref Privé O Cruceiro (Ventas de Naron)","Ventas de Naron"],
  ["Ref ACAG (Ligonde)","Ligonde"],
  ["Ref.ACAG (Eirexe)","Eirexe"],
  ["Ref. ACAG / Ref. privé Buen Camino (Palas de Rei)","Palas de Rei"],
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
  ["Seminario Menor / Ref. privé Acuario (Santiago de Compostela)","Santiago de Compostela"],
  ["Ref. municipal (De Santiago a Negreira)","De Santiago a Negreira"],
  ["Ref. municipal (Vilaserio)","Vilaserio"],
  ["Ref. municipal (Olveiroa)","Olveiroa"],
  ["Protection Civile (Cee)","Cee"],
  ["Ref. Ass. Galega (Corcubion Redonda)","Corcubion Redonda"],
  ["Ref. municipal (Fisterra)","Fisterra"]
];

// ── Helpers ─────────────────────────────────────────────────────
const EDIT_RADIUS_KM = 5;

// Loose bounding box around the Camino Francés (SJPP → Fisterra), with a
// buffer for GPS drift and nearby towns. This is not meant to catch a
// determined spoofer — it just rejects the obviously-wrong cases (null
// island, swapped lat/lng, a phone stuck on a default/test location, etc.)
// before they ever reach the radius check.
const ROUTE_BOUNDS = { minLat: 41.5, maxLat: 43.8, minLng: -9.6, maxLng: -0.8 };

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Rejects coordinates that can't possibly be a real position along the
// Camino: wrong type, NaN/Infinity, out of valid lat/lng range, exact
// (0,0) "null island" (a classic sign of a missing/failed GPS read being
// sent as 0 instead of being omitted), or simply nowhere near the route.
function isPlausibleCoordinate(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < ROUTE_BOUNDS.minLat || lat > ROUTE_BOUNDS.maxLat) return false;
  if (lng < ROUTE_BOUNDS.minLng || lng > ROUTE_BOUNDS.maxLng) return false;
  return true;
}

function getMadridDate() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
}

// Adds a column to an existing table if it isn't there yet. Postgres has
// native "IF NOT EXISTS" support for this; SQLite doesn't, so we just
// attempt it and swallow the "duplicate column" error on repeat runs.
async function addColumnIfMissing(client, table, column, type) {
  const quotedTable = usePostgres ? `"${table}"` : table;
  try {
    if (usePostgres) {
      await client.query(`ALTER TABLE ${quotedTable} ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
    } else {
      await client.query(`ALTER TABLE ${quotedTable} ADD COLUMN ${column} ${type}`);
    }
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

// Normalizes the client IP so IPv4-mapped IPv6 addresses (::ffff:1.2.3.4,
// common behind some proxies) don't get treated as distinct from 1.2.3.4.
function getClientIp(req) {
  const ip = req.ip || '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

// ── Error Alerting (email) ─────────────────────────────────────────
// Configure via env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — any SMTP provider
//     (Gmail: smtp.gmail.com / 587, SMTP_USER = the gmail address,
//     SMTP_PASS = a 16-char Google "app password", NOT the login password)
//   ALERT_EMAIL_TO   — where alerts are sent (can be the same gmail)
//   ALERT_EMAIL_FROM — optional, defaults to SMTP_USER
// If these aren't set, alerting is silently disabled and everything just
// logs to console — the server must never fail to start or crash because
// email isn't configured.
const alertConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ALERT_EMAIL_TO);
let mailTransporter = null;
if (alertConfigured) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: (parseInt(process.env.SMTP_PORT) || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
} else {
  console.warn('⚠️ Email alerting disabled (SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO not fully set).');
}

// Per-subject cooldown so a crash loop or a repeating error sends one
// email, not hundreds — an inbox flooded with identical alerts gets
// ignored, which defeats the point.
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const lastAlertSentAt = new Map();

async function sendAlertEmail(subject, message) {
  console.error(`🚨 ALERT: ${subject} — ${message}`);
  if (!alertConfigured) return;

  const last = lastAlertSentAt.get(subject) || 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return;
  lastAlertSentAt.set(subject, Date.now());

  try {
    await mailTransporter.sendMail({
      from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL_TO,
      subject: `[MuniBed] ${subject}`,
      text: `${message}\n\nTime: ${new Date().toISOString()}`
    });
  } catch (mailErr) {
    // Don't let a broken mail config take down request handling — this is
    // already the fallback path, so just log it.
    console.error('Failed to send alert email:', mailErr.message);
  }
}

// ── DB Init ─────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    // Create Albergues table
    const tableQuery = usePostgres 
      ? `CREATE TABLE IF NOT EXISTS "Albergues" (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          status TEXT DEFAULT 'gray',
          "lastUpdated" TEXT DEFAULT '업데이트 없음'
        )`
      : `CREATE TABLE IF NOT EXISTS Albergues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          status TEXT DEFAULT 'gray',
          lastUpdated TEXT DEFAULT '업데이트 없음'
        )`;
    await client.query(tableQuery);

    // Seed Albergues only if empty
    const countResult = await client.query(usePostgres ? 'SELECT COUNT(*) as count FROM "Albergues"' : 'SELECT COUNT(*) as count FROM Albergues');
    const rows = countResult.rows;
    const count = parseInt(rows[0].count);
    if (count === 0) {
      console.log('Seeding Albergues data...');
      const defaultCoords = { lat: 42.5, lng: -4.0 };
      for (const [name, city] of albergueRows) {
        const coords = coordsMap[city] || defaultCoords;
        const insertQuery = usePostgres 
          ? 'INSERT INTO "Albergues" (name, lat, lng, status, "lastUpdated") VALUES ($1, $2, $3, $4, $5)'
          : 'INSERT INTO Albergues (name, lat, lng, status, lastUpdated) VALUES ($1, $2, $3, $4, $5)';
        await client.query(insertQuery, [name, coords.lat, coords.lng, 'gray', '업데이트 없음']);
      }
      console.log(`✅ Seeded ${albergueRows.length} albergues.`);
    }

    // Create Comments table
    const commentsTableQuery = usePostgres
      ? `CREATE TABLE IF NOT EXISTS "Comments" (
          id SERIAL PRIMARY KEY,
          albergue_id INTEGER NOT NULL,
          nickname TEXT NOT NULL,
          content TEXT NOT NULL,
          "createdAt" TEXT NOT NULL
        )`
      : `CREATE TABLE IF NOT EXISTS Comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          albergue_id INTEGER NOT NULL,
          nickname TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )`;
    await client.query(commentsTableQuery);

    // Create Devices table
    const devicesTableQuery = usePostgres
      ? `CREATE TABLE IF NOT EXISTS "Devices" (
          device_id TEXT PRIMARY KEY,
          origin_lat REAL,
          origin_lng REAL,
          created_at TEXT
        )`
      : `CREATE TABLE IF NOT EXISTS Devices (
          device_id TEXT PRIMARY KEY,
          origin_lat REAL,
          origin_lng REAL,
          created_at TEXT
        )`;
    await client.query(devicesTableQuery);

    // Create DailyUpdates table (tracks which albergues each device updated per day)
    const dailyUpdatesTableQuery = usePostgres
      ? `CREATE TABLE IF NOT EXISTS "DailyUpdates" (
          device_id TEXT NOT NULL,
          albergue_id INTEGER NOT NULL,
          update_date TEXT NOT NULL,
          PRIMARY KEY (device_id, albergue_id, update_date)
        )`
      : `CREATE TABLE IF NOT EXISTS DailyUpdates (
          device_id TEXT NOT NULL,
          albergue_id INTEGER NOT NULL,
          update_date TEXT NOT NULL,
          PRIMARY KEY (device_id, albergue_id, update_date)
        )`;
    await client.query(dailyUpdatesTableQuery);

    // Create PageVisits table — one row per calendar day (Madrid time),
    // with a running count of page loads that day. Admin-only metric
    // (how many times the page was loaded, not unique visitors); not
    // shown anywhere in the client UI.
    const pageVisitsTableQuery = usePostgres
      ? `CREATE TABLE IF NOT EXISTS "PageVisits" (
          visit_date TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0
        )`
      : `CREATE TABLE IF NOT EXISTS PageVisits (
          visit_date TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0
        )`;
    await client.query(pageVisitsTableQuery);

    // Create StatusHistory table — an append-only log of every status
    // change (who/when/from→to/where). Nothing reads this to gate
    // behavior yet; it exists so abuse or data-quality issues (a device
    // flip-flopping a status, several devices disagreeing, etc.) can be
    // investigated after the fact, and so a future multi-report trust
    // model has real data to build on.
    const statusHistoryTableQuery = usePostgres
      ? `CREATE TABLE IF NOT EXISTS "StatusHistory" (
          id SERIAL PRIMARY KEY,
          albergue_id INTEGER NOT NULL,
          device_id TEXT,
          ip_address TEXT,
          old_status TEXT,
          new_status TEXT NOT NULL,
          lat REAL,
          lng REAL,
          distance_km REAL,
          "createdAt" TEXT NOT NULL
        )`
      : `CREATE TABLE IF NOT EXISTS StatusHistory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          albergue_id INTEGER NOT NULL,
          device_id TEXT,
          ip_address TEXT,
          old_status TEXT,
          new_status TEXT NOT NULL,
          lat REAL,
          lng REAL,
          distance_km REAL,
          createdAt TEXT NOT NULL
        )`;
    await client.query(statusHistoryTableQuery);

    // ── Migrations: add ip_address tracking to existing tables ──────
    // Devices/DailyUpdates were created above without ip columns on
    // earlier deployments, so add them defensively. Postgres supports
    // "ADD COLUMN IF NOT EXISTS"; SQLite doesn't, so we probe first.
    await addColumnIfMissing(client, 'Devices', 'ip_address', 'TEXT');
    await addColumnIfMissing(client, 'Devices', 'reg_date', 'TEXT');
    await addColumnIfMissing(client, 'DailyUpdates', 'ip_address', 'TEXT');

    console.log('✅ Database initialized.');
  } finally {
    client.release();
  }
}

// ── API Routes ───────────────────────────────────────────────────

// GET health — for uptime monitors (Railway/Render/UptimeRobot/etc.) and
// for a human to sanity-check the deploy. Actually touches the DB rather
// than just returning 200, so a broken DB connection shows up as "down"
// instead of a false green.
app.get('/health', async (_req, res) => {
  try {
    await pool.query(usePostgres ? 'SELECT 1' : 'SELECT 1 as ok');
    res.json({
      status: 'ok',
      db: usePostgres ? 'postgres' : 'sqlite',
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendAlertEmail('Health check DB failure', err.message);
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// GET all albergues
app.get('/api/albergues', async (_req, res) => {
  try {
    const query = usePostgres 
      ? 'SELECT * FROM "Albergues" ORDER BY id'
      : 'SELECT * FROM Albergues ORDER BY id';
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// New device_ids registering from the same IP in one day are normal up to a
// point (a busy albergue's shared wifi can easily have a dozen pilgrims'
// phones behind one NAT address). Past that, it starts looking like someone
// clearing localStorage to cycle past the daily-4-albergue-per-device cap,
// so registration is throttled rather than hard-blocked.
const MAX_NEW_DEVICES_PER_IP_PER_DAY = 10;

// POST register device
app.post('/api/devices', deviceRegisterLimiter, async (req, res) => {
  const { device_id } = req.body;
  // Origin location is informational only (not used for any restriction),
  // so an implausible value is quietly dropped rather than rejected —
  // registration shouldn't fail over this.
  const origin_lat = isPlausibleCoordinate(req.body.origin_lat, req.body.origin_lng) ? req.body.origin_lat : null;
  const origin_lng = isPlausibleCoordinate(req.body.origin_lat, req.body.origin_lng) ? req.body.origin_lng : null;
  if (!device_id) return res.status(400).json({ error: 'device_id is required.' });
  try {
    const existingQuery = usePostgres
      ? 'SELECT device_id, origin_lat, origin_lng FROM "Devices" WHERE device_id = $1'
      : 'SELECT device_id, origin_lat, origin_lng FROM Devices WHERE device_id = $1';
    const existing = await pool.query(existingQuery, [device_id]);

    if (existing.rows.length > 0) {
      return res.json({
        registered: false,
        origin_lat: existing.rows[0].origin_lat,
        origin_lng: existing.rows[0].origin_lng
      });
    }

    const ip = getClientIp(req);
    const today = getMadridDate();

    if (ip) {
      const ipCountQuery = usePostgres
        ? 'SELECT COUNT(*) as count FROM "Devices" WHERE ip_address = $1 AND reg_date = $2'
        : 'SELECT COUNT(*) as count FROM Devices WHERE ip_address = $1 AND reg_date = $2';
      const ipCountResult = await pool.query(ipCountQuery, [ip, today]);
      const ipCount = parseInt(ipCountResult.rows[0]?.count || 0);
      if (ipCount >= MAX_NEW_DEVICES_PER_IP_PER_DAY) {
        console.warn(`⚠️ IP ${ip} hit new-device registration cap (${ipCount}) on ${today}.`);
        return res.status(429).json({
          error: '이 네트워크에서 오늘 등록 가능한 기기 수를 초과했습니다.',
          code: 'IP_DEVICE_LIMIT'
        });
      }
    }

    const now = new Date().toISOString();
    const insertQuery = usePostgres
      ? 'INSERT INTO "Devices" (device_id, origin_lat, origin_lng, created_at, ip_address, reg_date) VALUES ($1, $2, $3, $4, $5, $6)'
      : 'INSERT INTO Devices (device_id, origin_lat, origin_lng, created_at, ip_address, reg_date) VALUES ($1, $2, $3, $4, $5, $6)';
    await pool.query(insertQuery, [device_id, origin_lat ?? null, origin_lng ?? null, now, ip || null, today]);

    res.json({ registered: true, origin_lat: origin_lat ?? null, origin_lng: origin_lng ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record a page visit — called once per page load from the client.
// Just increments a per-day counter; no device_id, no auth. Admin-only
// metric, read back via GET /api/admin/visitors.
app.post('/api/visit', async (req, res) => {
  try {
    const today = getMadridDate();
    const selectQuery = usePostgres
      ? 'SELECT count FROM "PageVisits" WHERE visit_date = $1'
      : 'SELECT count FROM PageVisits WHERE visit_date = $1';
    const existing = await pool.query(selectQuery, [today]);

    if (existing.rows.length > 0) {
      const updateQuery = usePostgres
        ? 'UPDATE "PageVisits" SET count = count + 1 WHERE visit_date = $1'
        : 'UPDATE PageVisits SET count = count + 1 WHERE visit_date = $1';
      await pool.query(updateQuery, [today]);
    } else {
      const insertQuery = usePostgres
        ? 'INSERT INTO "PageVisits" (visit_date, count) VALUES ($1, 1)'
        : 'INSERT INTO PageVisits (visit_date, count) VALUES ($1, 1)';
      await pool.query(insertQuery, [today]);
    }

    res.json({ ok: true });
  } catch (err) {
    // Never let a metrics failure surface as a visible error client-side.
    res.status(500).json({ error: err.message });
  }
});

// PATCH albergue status
app.patch('/api/albergues/:id', statusUpdateLimiter, async (req, res) => {
  const { status, lastUpdated, device_id, lat, lng } = req.body;
  const { id } = req.params;
  if (!status || !lastUpdated) {
    return res.status(400).json({ error: 'status and lastUpdated are required.' });
  }
  try {
    // Get albergue location (+ current status, for the history log) for
    // the restriction check
    const algQuery = usePostgres
      ? 'SELECT lat, lng, status FROM "Albergues" WHERE id = $1'
      : 'SELECT lat, lng, status FROM Albergues WHERE id = $1';
    const algResult = await pool.query(algQuery, [id]);
    if (algResult.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const { lat: algLat, lng: algLng, status: oldStatus } = algResult.rows[0];

    // Captured inside the block below, needed afterwards for the
    // StatusHistory log entry.
    let reqIp = null;
    let distanceKm = null;

    // Editing requires the device's current position — without it there is
    // nothing to check the radius against, so we must reject, not allow.
    {
      reqIp = getClientIp(req);
      if (lat == null || lng == null) {
        return res.status(403).json({
          error: '현재 위치를 확인할 수 없습니다.',
          code: 'LOCATION_REQUIRED'
        });
      }

      if (!isPlausibleCoordinate(lat, lng)) {
        return res.status(400).json({
          error: '유효하지 않은 위치 정보입니다.',
          code: 'LOCATION_INVALID'
        });
      }

      distanceKm = haversineKm(lat, lng, algLat, algLng);
      if (distanceKm > EDIT_RADIUS_KM) {
        return res.status(403).json({
          error: `현재 위치에서 ${EDIT_RADIUS_KM}km 이상 떨어진 알베르게는 변경할 수 없습니다.`,
          code: 'LOCATION_RESTRICTED'
        });
      }

      // Daily limit: max 4 distinct albergues per device per day
      if (device_id) {
        const today = getMadridDate();
        const ip = reqIp;
        const alreadyUpdatedQuery = usePostgres
          ? 'SELECT 1 FROM "DailyUpdates" WHERE device_id = $1 AND albergue_id = $2 AND update_date = $3'
          : 'SELECT 1 FROM DailyUpdates WHERE device_id = $1 AND albergue_id = $2 AND update_date = $3';
        const alreadyUpdated = await pool.query(alreadyUpdatedQuery, [device_id, id, today]);

        if (alreadyUpdated.rows.length === 0) {
          // This is a new albergue for today — check the count
          const countQuery = usePostgres
            ? 'SELECT COUNT(*) as count FROM "DailyUpdates" WHERE device_id = $1 AND update_date = $2'
            : 'SELECT COUNT(*) as count FROM DailyUpdates WHERE device_id = $1 AND update_date = $2';
          const countResult = await pool.query(countQuery, [device_id, today]);
          const dailyCount = parseInt(countResult.rows[0]?.count || 0);

          if (dailyCount >= 4) {
            return res.status(429).json({
              error: '오늘 변경 가능한 알베르게 수(4개)를 초과했습니다.',
              code: 'DAILY_LIMIT_REACHED',
              remaining: 0
            });
          }

          // Secondary backstop keyed on IP rather than device_id: someone
          // clearing localStorage to get a fresh device_id resets the
          // per-device count above, but not this one. Threshold is well
          // above what one legitimate device needs, to stay clear of
          // shared-albergue-wifi false positives.
          if (ip) {
            const ipCountQuery = usePostgres
              ? 'SELECT COUNT(*) as count FROM "DailyUpdates" WHERE ip_address = $1 AND update_date = $2'
              : 'SELECT COUNT(*) as count FROM DailyUpdates WHERE ip_address = $1 AND update_date = $2';
            const ipCountResult = await pool.query(ipCountQuery, [ip, today]);
            const ipDailyCount = parseInt(ipCountResult.rows[0]?.count || 0);
            if (ipDailyCount >= 20) {
              console.warn(`⚠️ IP ${ip} hit the IP-wide daily update cap (${ipDailyCount}) on ${today}.`);
              return res.status(429).json({
                error: '이 네트워크에서 오늘 변경 가능한 횟수를 초과했습니다.',
                code: 'IP_DAILY_LIMIT_REACHED'
              });
            }
          }

          // Record this update
          const insertDailyQuery = usePostgres
            ? 'INSERT INTO "DailyUpdates" (device_id, albergue_id, update_date, ip_address) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING'
            : 'INSERT OR IGNORE INTO DailyUpdates (device_id, albergue_id, update_date, ip_address) VALUES ($1, $2, $3, $4)';
          await pool.query(insertDailyQuery, [device_id, id, today, ip || null]);
        }
      }
    }

    const query = usePostgres
      ? 'UPDATE "Albergues" SET status = $1, "lastUpdated" = $2 WHERE id = $3'
      : 'UPDATE Albergues SET status = $1, lastUpdated = $2 WHERE id = $3';
    const result = await pool.query(query, [status, lastUpdated, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found.' });

    // Log the change. This is best-effort audit trail, not a gate — a
    // logging failure should never block a successful status update.
    try {
      const historyQuery = usePostgres
        ? 'INSERT INTO "StatusHistory" (albergue_id, device_id, ip_address, old_status, new_status, lat, lng, distance_km, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)'
        : 'INSERT INTO StatusHistory (albergue_id, device_id, ip_address, old_status, new_status, lat, lng, distance_km, createdAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
      await pool.query(historyQuery, [
        id, device_id || null, reqIp || null, oldStatus || null, status,
        lat ?? null, lng ?? null, distanceKm ?? null, new Date().toISOString()
      ]);
    } catch (logErr) {
      console.error('StatusHistory log failed:', logErr.message);
    }

    res.json({ message: '업데이트 성공', updatedId: id, newStatus: status, newLastUpdated: lastUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET status change history — for after-the-fact abuse/data-quality review,
// not used by the client app. Disabled unless ADMIN_KEY is set in the
// environment, and requires it as a query param; with no key configured
// the route behaves as if it doesn't exist (404) rather than 401/403,
// so it doesn't advertise itself on a deployment nobody set this up for.
const ADMIN_KEY = process.env.ADMIN_KEY || null;
app.get('/api/admin/history', async (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(404).json({ error: 'Not found.' });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const conditions = [];
    const params = [];
    if (req.query.albergue_id) {
      params.push(req.query.albergue_id);
      conditions.push(`albergue_id = $${params.length}`);
    }
    if (req.query.device_id) {
      params.push(req.query.device_id);
      conditions.push(`device_id = $${params.length}`);
    }
    if (req.query.ip) {
      params.push(req.query.ip);
      conditions.push(`ip_address = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const table = usePostgres ? '"StatusHistory"' : 'StatusHistory';
    const orderCol = usePostgres ? '"createdAt"' : 'createdAt';
    const query = `SELECT * FROM ${table} ${where} ORDER BY ${orderCol} DESC LIMIT ${limit}`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET daily page-visit counts — admin-only (same ADMIN_KEY gate as
// /api/admin/history above). Not used by the client app.
app.get('/api/admin/visitors', async (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(404).json({ error: 'Not found.' });
  }
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const table = usePostgres ? '"PageVisits"' : 'PageVisits';
    const query = `SELECT * FROM ${table} ORDER BY visit_date DESC LIMIT ${days}`;
    const { rows } = await pool.query(query);
    const today = getMadridDate();
    const todayRow = rows.find(r => r.visit_date === today);
    res.json({
      today: today,
      today_count: todayRow ? parseInt(todayRow.count) : 0,
      days: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET comments for an albergue
app.get('/api/albergues/:id/comments', async (req, res) => {
  const albergueId = req.params.id;
  try {
    const query = usePostgres
      ? 'SELECT * FROM "Comments" WHERE albergue_id = $1 ORDER BY id DESC LIMIT 100'
      : 'SELECT * FROM Comments WHERE albergue_id = $1 ORDER BY id DESC LIMIT 100';
    const { rows } = await pool.query(query, [albergueId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST comment for an albergue
app.post('/api/albergues/:id/comments', commentLimiter, async (req, res) => {
  const albergueId = req.params.id;
  const { nickname, content } = req.body;
  if (!nickname || !content) {
    return res.status(400).json({ error: 'nickname and content are required.' });
  }
  const now = new Date();
  const createdAt = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  try {
    const query = usePostgres
      ? 'INSERT INTO "Comments" (albergue_id, nickname, content, "createdAt") VALUES ($1, $2, $3, $4) RETURNING *'
      : 'INSERT INTO Comments (albergue_id, nickname, content, createdAt) VALUES ($1, $2, $3, $4)';
    const result = await pool.query(query, [albergueId, nickname, content, createdAt]);
    const respRow = result.rows ? result.rows[0] : { albergueId, nickname, content, createdAt };
    res.json(respRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cron: Reset all statuses at midnight ────────────────────────
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Resetting all albergue statuses...');
  try {
    const query = usePostgres
      ? 'UPDATE "Albergues" SET status = \'gray\', "lastUpdated" = \'자정 일괄 초기화됨\''
      : 'UPDATE Albergues SET status = \'gray\', lastUpdated = \'자정 일괄 초기화됨\'';
    const result = await pool.query(query);
    console.log(`✅ Reset ${result.rowCount} albergues.`);
  } catch (err) {
    console.error('Reset failed:', err.message);
  }
}, {
  timezone: 'Europe/Madrid'
});

// ── Stale Data Reset (runs on startup to cover missed cron) ─────
async function resetStaleStatuses() {
  const today = getMadridDate();
  try {
    // Reset any albergue whose lastUpdated is not from today and not already gray
    const query = usePostgres
      ? `UPDATE "Albergues" SET status = 'gray', "lastUpdated" = '자정 일괄 초기화됨'
         WHERE status != 'gray' AND "lastUpdated" NOT LIKE $1`
      : `UPDATE Albergues SET status = 'gray', lastUpdated = '자정 일괄 초기화됨'
         WHERE status != 'gray' AND lastUpdated NOT LIKE $1`;
    const result = await pool.query(query, [`${today}%`]);
    if (result.rowCount > 0) {
      console.log(`✅ Startup reset: cleared ${result.rowCount} stale albergue statuses.`);
    }
  } catch (err) {
    console.error('Startup reset failed:', err.message);
    sendAlertEmail('Startup stale-status reset failed', err.message);
  }
}

// ── Process-level crash guards ─────────────────────────────────────
// These fire on bugs that slip past every route's own try/catch (a sync
// throw outside a handler, a rejected promise nobody awaited). Node's own
// advice is not to keep running after uncaughtException — state can be
// corrupted — so this alerts and exits; Railway/Render restart the
// process automatically, so a real crash means one email + a brief
// restart, not silent downtime.
process.on('uncaughtException', async (err) => {
  await sendAlertEmail('Uncaught exception — server restarting', err.stack || err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  sendAlertEmail('Unhandled promise rejection', message);
});

// ── Start ────────────────────────────────────────────────────────
initDB().then(async () => {
  await resetStaleStatuses();
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`========================================`);
  });
}).catch(async err => {
  console.error('DB initialization failed:', err);
  await sendAlertEmail('DB initialization failed — server did not start', err.message);
  process.exit(1);
});
