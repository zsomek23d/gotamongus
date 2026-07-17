// Kézzel tervezett pályák: változatos méretű termek, folyosókkal összekötve.
// A walkable terület = termek + folyosók téglalapjainak uniója.
// A folyosók 40 px-t belógnak a termekbe, hogy az ajtóknál átfedjen a járható terület.

function makeMap(id, label, theme, width, height, roomDefs, corDefs, spawnRoom) {
  const rooms = roomDefs.map(([name, x, y, w, h]) => ({
    name, x, y, w, h, cx: x + w / 2, cy: y + h / 2
  }));

  const corridors = [];
  const nodes = rooms.map((r, i) => ({ id: 'R' + i, x: r.cx, y: r.cy }));
  const edges = [];

  corDefs.forEach(([a, b, rect], j) => {
    const cor = { x: rect[0], y: rect[1], w: rect[2], h: rect[3] };
    corridors.push(cor);
    const nid = 'C' + j;
    nodes.push({ id: nid, x: cor.x + cor.w / 2, y: cor.y + cor.h / 2 });
    edges.push(['R' + a, nid], [nid, 'R' + b]);
  });

  // feladatpontok: nagy terembe 3, kicsibe 2
  const taskPoints = [];
  let tid = 0;
  rooms.forEach(rm => {
    const pts = [
      [rm.cx - rm.w * 0.28, rm.cy + rm.h * 0.24],
      [rm.cx + rm.w * 0.28, rm.cy - rm.h * 0.2]
    ];
    if (rm.w >= 500 || rm.h >= 400) pts.push([rm.cx + rm.w * 0.22, rm.cy + rm.h * 0.28]);
    pts.forEach(([x, y]) => {
      taskPoints.push({ id: id + '-t' + (tid++), x: Math.round(x), y: Math.round(y), room: rm.name });
    });
  });

  const sp = rooms.find(r => r.name === spawnRoom);
  return {
    id, label, theme, width, height,
    rooms, corridors, taskPoints, nodes, edges,
    spawn: { x: sp.cx, y: sp.cy }
  };
}

// ============ SÁRKÁNYKŐ (2600 x 1750) ============
const dragonstone = makeMap('dragonstone', 'Sárkánykő',
  { floor: '#453c52', accent: '#a03830' },
  2600, 1750,
  [
    // [név, x, y, szélesség, magasság]
    ['Térképterem',   150,  150, 420, 300],
    ['Trónterem',     950,  100, 640, 440],
    ['Bástya',       2000,  180, 420, 320],
    ['Aegon kertje',  180,  760, 380, 340],
    ['Nagy Csarnok',  980,  760, 560, 380],
    ['Sárkányüreg',   120, 1280, 620, 400],
    ['Konyha',       1050, 1330, 380, 280],
    ['Kikötő',       1950, 1180, 560, 430]
  ],
  [
    // [teremA index, teremB index, [x, y, w, h]]
    [0, 1, [530,  255, 460, 90]],   // Térképterem – Trónterem
    [1, 2, [1550, 295, 490, 90]],   // Trónterem – Bástya
    [0, 3, [315,  410, 90, 430]],   // Térképterem – Aegon kertje
    [1, 4, [1225, 500, 90, 340]],   // Trónterem – Nagy Csarnok
    [3, 4, [520,  885, 540, 90]],   // Aegon kertje – Nagy Csarnok
    [3, 5, [325, 1060, 90, 300]],   // Aegon kertje – Sárkányüreg
    [4, 6, [1195, 1100, 90, 310]],  // Nagy Csarnok – Konyha
    [5, 6, [700, 1425, 430, 90]],   // Sárkányüreg – Konyha
    [6, 7, [1390, 1395, 600, 90]],  // Konyha – Kikötő
    [2, 7, [2185, 460, 90, 760]]    // Bástya – Kikötő (hosszú fal menti folyosó)
  ],
  'Trónterem');

// ============ DERES (2400 x 1600) ============
const winterfell = makeMap('winterfell', 'Deres',
  { floor: '#46525c', accent: '#6b7d8c' },
  2400, 1600,
  [
    ['Kovácsműhely',  150,  150, 380, 280],
    ['Nagyterem',     900,  120, 560, 400],
    ['Istenerdő',    1850,  150, 400, 340],
    ['Kripta',        160,  780, 420, 540],
    ['Udvar',         950,  750, 520, 420],
    ['Üvegkert',     1830,  850, 430, 360]
  ],
  [
    [0, 1, [490,  245, 450, 90]],   // Kovácsműhely – Nagyterem
    [1, 2, [1420, 275, 470, 90]],   // Nagyterem – Istenerdő
    [0, 3, [295,  390, 90, 430]],   // Kovácsműhely – Kripta
    [1, 4, [1135, 480, 90, 310]],   // Nagyterem – Udvar
    [2, 5, [2005, 450, 90, 440]],   // Istenerdő – Üvegkert
    [3, 4, [540,  915, 450, 90]],   // Kripta – Udvar
    [4, 5, [1430, 955, 440, 90]]    // Udvar – Üvegkert
  ],
  'Nagyterem');

const MAPS = { dragonstone, winterfell };

// ---- geometria ----
function rectsOf(map) { return map.rooms.concat(map.corridors); }

function isWalkable(map, x, y, margin = 14) {
  return rectsOf(map).some(r =>
    x >= r.x + margin && x <= r.x + r.w - margin &&
    y >= r.y + margin && y <= r.y + r.h - margin);
}

function roomNameAt(map, x, y) {
  const rm = map.rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  return rm ? rm.name : 'folyosó';
}

// ---- útkeresés a gráfban (BFS) ----
function findPath(map, fromX, fromY, toX, toY) {
  const nearest = (x, y) => map.nodes.reduce((best, n) => {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    return !best || d < best.d ? { n, d } : best;
  }, null).n;
  const start = nearest(fromX, fromY), goal = nearest(toX, toY);

  const adj = {};
  map.nodes.forEach(n => adj[n.id] = []);
  map.edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });

  const prev = { [start.id]: null };
  const q = [start.id];
  while (q.length) {
    const cur = q.shift();
    if (cur === goal.id) break;
    for (const nb of adj[cur]) {
      if (!(nb in prev)) { prev[nb] = cur; q.push(nb); }
    }
  }
  if (!(goal.id in prev)) return [{ x: toX, y: toY }];

  const ids = [];
  for (let cur = goal.id; cur; cur = prev[cur]) ids.unshift(cur);
  if (prev[start.id] === null && ids[0] !== start.id) ids.unshift(start.id);
  const byId = Object.fromEntries(map.nodes.map(n => [n.id, n]));
  const path = ids.map(i => ({ x: byId[i].x, y: byId[i].y }));
  path.push({ x: toX, y: toY });
  return path;
}

module.exports = { MAPS, isWalkable, roomNameAt, findPath };
