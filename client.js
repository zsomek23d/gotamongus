const socket = io();
const $ = id => document.getElementById(id);

// ---------- ÁLLAPOT ----------
let myId = null;
let myRole = null;
let myTasks = [];
let lobby = null;
let state = null;        // gameState
let map = null;          // mapData
let live = { players: [], bodies: [], killCooldownUntil: 0 };
let me = { x: 0, y: 0, alive: true };
let myVote = null;
let taskingNow = null;   // { taskId, startedAt }
let witnessedFlashUntil = 0;

const PLAYER_R = 22;
const SPEED = 210;        // px/s
const VISION = 250;
const KILL_RANGE = 70;
const REPORT_RANGE = 130;
const TASK_RANGE = 90;
const TASK_TIME = 3000;

const MAP_EMOJI = { dragonstone: '🐉', winterfell: '❄️' };

// ---------- KÉPERNYŐK ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
}

// ---------- MENÜ ----------
$('btn-create').onclick = () => {
  socket.emit('createRoom', { name: $('inp-name').value }, res => {
    if (res.ok) { myId = res.playerId; showScreen('lobby'); }
    else $('menu-error').textContent = res.error;
  });
};
$('btn-join').onclick = () => {
  socket.emit('joinRoom', { code: $('inp-code').value, name: $('inp-name').value }, res => {
    if (res.ok) { myId = res.playerId; showScreen('lobby'); }
    else $('menu-error').textContent = res.error;
  });
};

// ---------- LOBBY ----------
socket.on('lobby', l => {
  lobby = l;
  $('lobby-code').textContent = l.code;
  const isHost = l.hostId === myId;
  $('host-controls').classList.toggle('hidden', !isHost);

  const ms = $('map-select');
  ms.innerHTML = '';
  l.maps.forEach(m => {
    const d = document.createElement('div');
    d.className = 'map-card' + (m.id === l.mapId ? ' selected' : '') + (isHost ? '' : ' disabled');
    d.innerHTML = `<span class="map-emoji">${MAP_EMOJI[m.id] || '🗺️'}</span><b>${esc(m.label)}</b>`;
    if (isHost) d.onclick = () => socket.emit('setMap', { mapId: m.id });
    ms.appendChild(d);
  });

  const ul = $('lobby-players');
  ul.innerHTML = '';
  l.players.forEach(p => {
    const li = document.createElement('li');
    const diffText = { easy: 'könnyű', medium: 'közepes', hard: 'nehéz' }[p.difficulty] || '';
    li.innerHTML = `<span>${p.isBot ? '🤖 ' : '👤 '}${esc(p.name)}${p.isBot ? ` <span class="tag">${diffText} bot</span>` : ''}</span>` +
      `<span>${p.id === l.hostId ? '<span class="tag host">házigazda</span>' : ''}` +
      `${p.isBot && isHost ? ` <button class="btn btn-small" data-rm="${p.id}">✕</button>` : ''}</span>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = () => socket.emit('removeBot', { playerId: b.dataset.rm });
  });
  $('lobby-hint').textContent = l.players.length < l.minPlayers
    ? `Még ${l.minPlayers - l.players.length} résztvevő kell (botokat is hozzáadhatsz).`
    : 'Készen álltok? A házigazda indíthat!';
});

$('btn-addbot').onclick = () => socket.emit('addBot', { difficulty: $('sel-difficulty').value });
$('btn-start').onclick = () => socket.emit('startGame');
$('btn-copy').onclick = () => navigator.clipboard.writeText(lobby ? lobby.code : '');
socket.on('errorMsg', msg => alert(msg));
socket.on('backToLobby', () => { resetGameUi(); showScreen('lobby'); });

// ---------- JÁTÉK-ESEMÉNYEK ----------
socket.on('mapData', m => { map = m; GFX.build(m); });

// mozgás-irány és -állapot követése az animációhoz
const motion = {}; // playerId -> { facing, moving, lastX, lastY, lastMoveTs }
function trackMotion(id, x, y) {
  const m = motion[id] || (motion[id] = { facing: 1, moving: false, lastX: x, lastY: y, lastMoveTs: 0 });
  const dx = x - m.lastX, dy = y - m.lastY;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    if (Math.abs(dx) > 0.5) m.facing = dx > 0 ? 1 : -1;
    m.lastMoveTs = Date.now();
  }
  m.moving = Date.now() - m.lastMoveTs < 160;
  m.lastX = x; m.lastY = y;
  return m;
}

socket.on('roleInfo', info => {
  myRole = info.role;
  myTasks = info.tasks;
  renderTaskList();
});

socket.on('tasksUpdate', tasks => { myTasks = tasks; renderTaskList(); });

socket.on('youDied', () => { me.alive = false; });

socket.on('witnessedKill', () => {
  witnessedFlashUntil = Date.now() + 900;
  const f = $('kill-flash');
  f.classList.remove('hidden');
  f.style.animation = 'none'; void f.offsetWidth; f.style.animation = '';
  setTimeout(() => f.classList.add('hidden'), 900);
});

socket.on('tick', t => {
  live = t;
  const mine = t.players.find(p => p.id === myId);
  if (mine && !inputActive()) { me.x = mine.x; me.y = mine.y; }
});

let prevPhase = null;
socket.on('gameState', s => {
  state = s;
  showScreen('game');
  const sp = s.players.find(p => p.id === myId);
  if (sp) me.alive = sp.alive;

  renderHud();
  renderMeeting();
  startTimerBar();

  if (s.phase === 'roleReveal' && prevPhase !== 'roleReveal') {
    const mine = s.players.find(p => p.id === myId);
    if (mine) { /* pozíció az első tickben jön */ }
    setTimeout(showRoleOverlay, 300); // roleInfo után
  }
  if (s.phase === 'play' && prevPhase !== 'play') {
    myVote = null; taskingNow = null;
    $('overlay').classList.add('hidden');
  }
  if (s.phase === 'gameOver') showGameOverOverlay();
  prevPhase = s.phase;
});

socket.on('voteResult', ({ tally, eliminated }) => {
  renderMeeting(tally, eliminated);
});

// ---------- HUD ----------
function renderHud() {
  $('hud-round').textContent = state.round;
  $('hud-maxrounds').textContent = state.maxRounds;
  $('hud-tasks').textContent = `${state.taskProgress.done}/${state.taskProgress.total}`;
  $('hud-map').textContent = (MAP_EMOJI[state.mapId] || '') + ' ' + state.mapLabel;
  const badge = $('role-badge');
  if (myRole) {
    badge.classList.remove('hidden');
    badge.className = myRole;
    badge.textContent = myRole === 'killer' ? '🗡️ Te vagy az Arctalan' : '🛡️ Tanácstag vagy';
  }
  const hint = $('phase-hint');
  if (state.phase === 'play') {
    hint.textContent = me.alive
      ? (myRole === 'killer' ? 'Vadássz... de ne hagyj tanút.' : 'Végezd a feladataidat! (WASD / nyilak)')
      : '👻 Szellemként figyeled az eseményeket...';
  } else hint.textContent = '';
}

function renderTaskList() {
  const el = $('tasklist');
  if (!myTasks.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<h4>' + (myRole === 'killer' ? '📜 Álca-feladatok' : '📜 Küldetéseid') + '</h4>' +
    myTasks.map(t => `<div class="${t.done ? 't-done' : 't-open'}">${t.done ? '✔' : '○'} ${esc(t.room)}</div>`).join('');
}

// ---------- IDŐZÍTŐ ----------
let timerInt = null, phaseDur = 0;
function startTimerBar() {
  clearInterval(timerInt);
  phaseDur = Math.max(1, state.phaseEndsAt - Date.now());
  const upd = () => {
    const rem = Math.max(0, state.phaseEndsAt - Date.now());
    $('timer-bar').style.width = (rem / phaseDur * 100) + '%';
    if (rem <= 0) clearInterval(timerInt);
  };
  upd();
  timerInt = setInterval(upd, 1000);
}

// ---------- INPUT / MOZGÁS ----------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'e') tryTask();
  if (e.key.toLowerCase() === 'r') tryReport();
  if (e.key.toLowerCase() === 'q') tryKill();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function inputActive() {
  return keys['w'] || keys['a'] || keys['s'] || keys['d'] ||
         keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'];
}

function walkable(x, y) {
  if (!map) return false;
  const m = 14;
  return map.rooms.concat(map.corridors).some(r =>
    x >= r.x + m && x <= r.x + r.w - m && y >= r.y + m && y <= r.y + r.h - m);
}

let lastSent = 0;
function updateMovement(dt) {
  if (!state || state.phase !== 'play' || !me.alive || !map) return;
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy);
  const nx = me.x + dx / len * SPEED * dt;
  const ny = me.y + dy / len * SPEED * dt;
  // tengelyenkénti csúszás a falak mentén
  if (walkable(nx, ny)) { me.x = nx; me.y = ny; }
  else if (walkable(nx, me.y)) { me.x = nx; }
  else if (walkable(me.x, ny)) { me.y = ny; }
  if (taskingNow) { taskingNow = null; hideTaskProgress(); } // mozgás megszakítja a feladatot

  const now = performance.now();
  if (now - lastSent > 70) {
    lastSent = now;
    socket.emit('move', { x: Math.round(me.x), y: Math.round(me.y) });
  }
}

// ---------- AKCIÓK ----------
function nearestOwnTask() {
  if (!map) return null;
  let best = null;
  myTasks.filter(t => !t.done).forEach(t => {
    const tp = map.taskPoints.find(x => x.id === t.id);
    if (!tp) return;
    const d = Math.hypot(me.x - tp.x, me.y - tp.y);
    if (d < TASK_RANGE && (!best || d < best.d)) best = { tp, d };
  });
  return best ? best.tp : null;
}
function nearestBody() {
  let best = null;
  live.bodies.forEach(b => {
    const d = Math.hypot(me.x - b.x, me.y - b.y);
    if (d < REPORT_RANGE && (!best || d < best.d)) best = { b, d };
  });
  return best ? best.b : null;
}
function nearestVictim() {
  if (myRole !== 'killer') return null;
  let best = null;
  live.players.forEach(p => {
    if (p.id === myId) return;
    const d = Math.hypot(me.x - p.x, me.y - p.y);
    if (d < KILL_RANGE && (!best || d < best.d)) best = { p, d };
  });
  return best ? best.p : null;
}

function tryTask() {
  if (!state || state.phase !== 'play' || !me.alive || taskingNow) return;
  const tp = nearestOwnTask();
  if (!tp) return;
  taskingNow = { taskId: tp.id, startedAt: Date.now() };
  $('task-progress').classList.remove('hidden');
}
function hideTaskProgress() { $('task-progress').classList.add('hidden'); }

function tryReport() {
  if (!state || state.phase !== 'play' || !me.alive) return;
  const b = nearestBody();
  if (b) socket.emit('report', { bodyId: b.id });
}
function tryKill() {
  if (!state || state.phase !== 'play' || !me.alive || myRole !== 'killer') return;
  if (Date.now() < live.killCooldownUntil) return;
  const v = nearestVictim();
  if (v) socket.emit('kill', { targetId: v.id });
}

$('btn-task').onclick = tryTask;
$('btn-report').onclick = tryReport;
$('btn-kill').onclick = tryKill;

function updateActionBar() {
  const playing = state && state.phase === 'play' && me.alive;
  $('btn-task').classList.toggle('hidden', !(playing && nearestOwnTask() && !taskingNow));
  $('btn-report').classList.toggle('hidden', !(playing && nearestBody()));
  const killBtn = $('btn-kill');
  if (playing && myRole === 'killer') {
    killBtn.classList.remove('hidden');
    const cd = Math.max(0, live.killCooldownUntil - Date.now());
    if (cd > 0) {
      killBtn.disabled = true;
      killBtn.innerHTML = `🗡️ Ölés (${Math.ceil(cd / 1000)}s)`;
    } else {
      killBtn.disabled = !nearestVictim();
      killBtn.innerHTML = '🗡️ Ölés <kbd>Q</kbd>';
    }
  } else killBtn.classList.add('hidden');

  // feladat-folyamat
  if (taskingNow) {
    const el = Date.now() - taskingNow.startedAt;
    $('task-progress-bar').style.width = Math.min(100, el / TASK_TIME * 100) + '%';
    const tp = map.taskPoints.find(x => x.id === taskingNow.taskId);
    if (Math.hypot(me.x - tp.x, me.y - tp.y) > TASK_RANGE) { taskingNow = null; hideTaskProgress(); }
    else if (el >= TASK_TIME) {
      socket.emit('taskDone', { taskId: taskingNow.taskId });
      const t = myTasks.find(x => x.id === taskingNow.taskId);
      if (t) t.done = true;
      renderTaskList();
      taskingNow = null; hideTaskProgress();
    }
  }
}

// ---------- TANÁCSKOZÁS UI ----------
function renderMeeting(tally, eliminated) {
  const panel = $('meeting');
  const inMeeting = state && ['discussion', 'vote', 'voteResult'].includes(state.phase);
  panel.classList.toggle('hidden', !inMeeting);
  if (!inMeeting) return;

  const mt = state.meeting;
  $('meeting-title').textContent =
    state.phase === 'discussion' ? '🔔 A Tanács összeült' :
    state.phase === 'vote' ? '⚖️ Szavazás' : '📜 Az ítélet';
  $('meeting-sub').textContent = mt && mt.victimName
    ? `${mt.reporterName} holttestet talált: ${mt.victimName} (${mt.room})`
    : 'A kör lejárt. Ki a gyanús?';

  const cont = $('meeting-players');
  cont.innerHTML = '';
  const canVote = state.phase === 'vote' && me.alive;
  state.players.forEach(p => {
    const d = document.createElement('div');
    const votable = canVote && p.alive && p.id !== myId;
    d.className = 'm-player' + (p.alive ? '' : ' dead') + (votable ? ' votable' : '') +
      (myVote === p.id ? ' myvote' : '');
    const tallyN = tally ? tally[p.id] : null;
    d.innerHTML = `
      <div class="m-sigil" style="border-color:${p.character.color}">${p.character.sigil}</div>
      <div><div class="m-name">${esc(p.character.name)}${p.id === myId ? ' (te)' : ''}</div>
      <div class="m-char">${esc(p.name)}${p.isBot ? ' 🤖' : ''}</div></div>
      <div class="m-right">
        ${p.revealedRole ? `<span class="role-reveal-tag ${p.revealedRole}">${p.revealedRole === 'killer' ? 'Arctalan' : 'tanácstag'}</span>` : ''}
        ${tallyN ? `<span class="m-tally">${tallyN}</span>` : ''}
        ${state.phase === 'vote' && p.votedFor ? '<span class="m-voted">✓</span>' : ''}
      </div>`;
    if (votable) d.onclick = () => { myVote = p.id; socket.emit('castVote', { targetId: p.id }); renderMeeting(); };
    cont.appendChild(d);
  });

  const skip = $('btn-skip');
  skip.classList.toggle('hidden', !canVote);
  skip.onclick = () => { myVote = 'skip'; socket.emit('castVote', { targetId: 'skip' }); renderMeeting(); };
  if (myVote === 'skip') skip.classList.add('btn-gold'); else skip.classList.remove('btn-gold');
}

// ---------- CANVAS ----------
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let lastFrame = performance.now();

function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resize);

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state && !['lobby'].includes(state.phase) && map) {
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) resize();
    updateMovement(dt);
    updateActionBar();
    draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw() {
  const W = canvas.width, H = canvas.height;
  const t = performance.now();
  ctx.clearRect(0, 0, W, H);

  // kamera: élőként követ, halottként az egész pálya látszik
  let scale, camX, camY;
  if (me.alive) {
    scale = Math.min(1.1, Math.max(0.7, Math.min(W / 1400, H / 900)));
    camX = me.x - W / 2 / scale;
    camY = me.y - H / 2 / scale;
  } else {
    scale = Math.min(W / map.width, H / map.height) * 0.95;
    camX = (map.width - W / scale) / 2;
    camY = (map.height - H / scale) / 2;
  }
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  // háttér a pályán kívül
  ctx.fillStyle = '#0c0910';
  ctx.fillRect(camX, camY, W / scale, H / scale);

  // előrenderelt pálya + élő effektek (fáklyák, láva, víz)
  const layer = GFX.staticLayer();
  if (layer) ctx.drawImage(layer, 0, 0);
  GFX.drawEffects(ctx, t);

  // feladatpontok: rúnakövek
  map.taskPoints.forEach(tp => {
    const mine = myTasks.some(x => x.id === tp.id && !x.done);
    GFX.drawTaskPoint(ctx, tp.x, tp.y, mine, t);
  });

  // holttestek
  live.bodies.forEach(b => {
    const victim = state.players.find(q => q.id === b.victimId);
    GFX.drawDeadBody(ctx, b.x, b.y, victim ? victim.character : null, t);
    ctx.fillStyle = 'rgba(224,90,78,0.9)';
    ctx.font = 'bold 13px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(b.victimCharacter, b.x, b.y + 40);
  });

  // játékosok
  const meLive = me.alive;
  live.players.forEach(p => {
    const sp = state.players.find(q => q.id === p.id);
    if (!sp) return;
    const isMe = p.id === myId;
    const px = isMe ? me.x : p.x;
    const py = isMe ? me.y : p.y;
    // élőként csak látótávon belül látod a többieket
    if (meLive && !isMe && Math.hypot(px - me.x, py - me.y) > VISION + 40) return;

    const mo = trackMotion(p.id, px, py);
    GFX.drawCharacter(ctx, px, py, sp.character, {
      t, moving: mo.moving, facing: mo.facing, isMe
    });
    ctx.fillStyle = isMe ? '#d4af37' : '#e8dcc0';
    ctx.font = 'bold 13px Georgia';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(sp.character.name, px, py - 48);
    ctx.shadowBlur = 0;
  });

  ctx.restore();

  // sötétség (látótáv) élő játékosnál
  if (meLive) {
    const cx = W / 2, cy = H / 2;
    const g = ctx.createRadialGradient(cx, cy, VISION * scale * 0.8, cx, cy, VISION * scale * 1.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- OVERLAY-EK ----------
function showRoleOverlay() {
  if (!state) return;
  const mine = state.players.find(p => p.id === myId);
  const box = $('overlay-box');
  box.innerHTML = `
    <h2>${mine ? esc(mine.character.sigil + ' ' + mine.character.name) : ''}</h2>
    <div class="role-big ${myRole}">${myRole === 'killer' ? '🗡️ AZ ARCTALAN' : '🛡️ TANÁCSTAG'}</div>
    <p>${myRole === 'killer'
      ? 'Öld meg a Tanács tagjait, és ne bukj le! Ha túlélsz 6 kört, vagy már csak ketten maradtok, győztél. A "feladataid" csak álcák.'
      : 'Teljesítsd a küldetéseidet (arany rombuszok), jelentsd a holttesteket, és leplezd le az Arctalant, mielőtt mindenkit megöl!'}</p>
    <p class="hint">Mozgás: WASD / nyilak · Feladat: E · Jelentés: R${myRole === 'killer' ? ' · Ölés: Q' : ''}</p>`;
  $('overlay').classList.remove('hidden');
  setTimeout(() => { if (state && state.phase !== 'gameOver') $('overlay').classList.add('hidden'); }, 5500);
}

function showGameOverOverlay() {
  const box = $('overlay-box');
  const killer = state.players.find(p => p.revealedRole === 'killer');
  const iWon = (state.winner === 'killer') === (myRole === 'killer');
  const isHost = lobby && lobby.hostId === myId;
  box.innerHTML = `
    <h2>${state.winner === 'crew' ? '🏆 A Tanács győzött!' : '🗡️ Az Arctalan győzött!'}</h2>
    <div class="role-big ${iWon ? 'crew' : 'killer'}">${iWon ? 'GYŐZTÉL!' : 'Vesztettél...'}</div>
    <p>Az Arctalan: ${killer ? esc(killer.character.name) + ' (' + esc(killer.name) + ')' : '?'}</p>
    ${isHost ? '<button id="btn-again" class="btn btn-gold">Új játék</button>' : '<p class="hint">A házigazda indíthat új játékot.</p>'}`;
  $('overlay').classList.remove('hidden');
  const again = $('btn-again');
  if (again) again.onclick = () => socket.emit('playAgain');
}

function resetGameUi() {
  $('chat-log').innerHTML = '';
  $('overlay').classList.add('hidden');
  $('meeting').classList.add('hidden');
  $('role-badge').classList.add('hidden');
  $('tasklist').innerHTML = '';
  myRole = null; myTasks = []; state = null; map = null;
  me = { x: 0, y: 0, alive: true };
  myVote = null; taskingNow = null; prevPhase = null;
  live = { players: [], bodies: [], killCooldownUntil: 0 };
}

// ---------- CHAT ----------
socket.on('chat', msg => {
  const log = $('chat-log');
  const div = document.createElement('div');
  div.className = 'chat-msg' + (msg.system ? ' system' : '');
  if (msg.system) div.textContent = msg.text;
  else {
    const who = msg.character ? `${msg.character}` : msg.name;
    div.innerHTML = `<span class="who" style="color:${msg.color}">${esc(who)}:</span> ${esc(msg.text)}`;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
});

function sendChat() {
  const inp = $('inp-chat');
  if (!inp.value.trim()) return;
  socket.emit('chat', { text: inp.value });
  inp.value = '';
}
$('btn-chat').onclick = sendChat;
$('inp-chat').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

// pozíció-lekérdezés automatizált tesztekhez
window.__pos = () => ({ x: me.x, y: me.y, alive: me.alive, phase: state ? state.phase : null });

// ---------- SEGÉD ----------
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
