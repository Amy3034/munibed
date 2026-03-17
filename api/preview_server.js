const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  ["Ref. privé Maralotx / Ref. paroissial (Cirauqui)","Cirauqui"]
];

let dummyAlbergues = albergueRows.map((row, index) => ({
  id: index + 1,
  name: row[0],
  lat: 43 - (index * 0.1),
  lng: -1 - (index * 0.1),
  status: index % 3 === 0 ? 'green' : (index % 3 === 1 ? 'red' : 'gray'),
  lastUpdated: '방금 전'
}));

let dummyComments = [];

app.get('/api/albergues', (req, res) => res.json(dummyAlbergues));
app.patch('/api/albergues/:id', (req, res) => {
  const { status, lastUpdated } = req.body;
  const item = dummyAlbergues.find(a => a.id === parseInt(req.params.id));
  if (item) {
    item.status = status;
    item.lastUpdated = lastUpdated;
    res.json({ message: '업데이트 성공' });
  } else {
    res.status(404).send('Not found');
  }
});

app.get('/api/albergues/:id/comments', (req, res) => {
    const aid = req.params.id;
    res.json(dummyComments.filter(c => c.albergue_id == aid));
});

app.post('/api/albergues/:id/comments', (req, res) => {
  const c = { id: Date.now(), albergue_id: req.params.id, ...req.body, createdAt: '방금 전' };
  dummyComments.push(c);
  res.json(c);
});

app.listen(PORT, () => {
  console.log(`Preview server with new features running on http://localhost:${PORT}`);
});
