const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Game } = require('./game');
const { BOT_NAMES } = require('./characters');
const { MAPS } = require('./maps');
const bots = require('./bots');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = new Map(); // code -> { code, hostId, mapId, players, game }

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;

function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

let nextId = 1;
function makePlayer(name, socketId, isBot, difficulty) {
  return {
    id: 'p' + (nextId++),
    name, socketId, isBot,
    difficulty: difficulty || null,
    character: null, role: null, alive: true,
    x: 0, y: 0, tasks: [], vote: null, botState: null
  };
}

function lobbyState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mapId: room.mapId,
    maps: Object.values(MAPS).map(m => ({ id: m.id, label: m.label })),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    players: room.players.map(p => ({
      id: p.id, name: p.name, isBot: p.isBot, difficulty: p.difficulty
    }))
  };
}

io.on('connection', socket => {
  let room = null;
  let me = null;

  socket.on('createRoom', ({ name }, cb) => {
    const code = makeCode();
    me = makePlayer((name || 'Névtelen').slice(0, 20), socket.id, false);
    room = { code, hostId: me.id, mapId: 'dragonstone', players: [me], game: null };
    rooms.set(code, room);
    socket.join(code);
    cb({ ok: true, code, playerId: me.id });
    io.to(code).emit('lobby', lobbyState(room));
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const r = rooms.get((code || '').toUpperCase().trim());
    if (!r) return cb({ ok: false, error: 'Nincs ilyen szoba.' });
    if (r.game && r.game.phase !== 'lobby') return cb({ ok: false, error: 'A játék már elkezdődött.' });
    if (r.players.length >= MAX_PLAYERS) return cb({ ok: false, error: 'A szoba megtelt.' });
    me = makePlayer((name || 'Névtelen').slice(0, 20), socket.id, false);
    room = r;
    room.players.push(me);
    socket.join(room.code);
    cb({ ok: true, code: room.code, playerId: me.id });
    io.to(room.code).emit('lobby', lobbyState(room));
  });

  const isHostInLobby = () =>
    room && me && me.id === room.hostId && (!room.game || room.game.phase === 'lobby');

  socket.on('setMap', ({ mapId }) => {
    if (!isHostInLobby() || !MAPS[mapId]) return;
    room.mapId = mapId;
    io.to(room.code).emit('lobby', lobbyState(room));
  });

  socket.on('addBot', ({ difficulty }) => {
    if (!isHostInLobby() || room.players.length >= MAX_PLAYERS) return;
    const used = room.players.map(p => p.name);
    const name = BOT_NAMES.find(n => !used.includes(n)) || 'Bot' + nextId;
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    room.players.push(makePlayer(name, null, true, diff));
    io.to(room.code).emit('lobby', lobbyState(room));
  });

  socket.on('removeBot', ({ playerId }) => {
    if (!isHostInLobby()) return;
    room.players = room.players.filter(p => !(p.id === playerId && p.isBot));
    io.to(room.code).emit('lobby', lobbyState(room));
  });

  socket.on('startGame', () => {
    if (!isHostInLobby()) return;
    if (room.players.length < MIN_PLAYERS) {
      socket.emit('errorMsg', `Legalább ${MIN_PLAYERS} játékos kell (adj hozzá botokat).`);
      return;
    }
    room.game = new Game(room, io, room.mapId);
    room.game.start();
  });

  // ---- játékbeli akciók ----
  socket.on('move', ({ x, y }) => { if (room && room.game && me) room.game.move(me.id, x, y); });
  socket.on('taskDone', ({ taskId }) => { if (room && room.game && me) room.game.taskDone(me.id, taskId); });
  socket.on('kill', ({ targetId }) => { if (room && room.game && me) room.game.kill(me.id, targetId); });
  socket.on('report', ({ bodyId }) => { if (room && room.game && me) room.game.report(me.id, bodyId); });
  socket.on('castVote', ({ targetId }) => { if (room && room.game && me) room.game.castVote(me.id, targetId); });

  socket.on('chat', ({ text }) => {
    if (!room || !me) return;
    text = String(text || '').slice(0, 200).trim();
    if (!text) return;
    if (room.game && room.game.phase !== 'lobby') {
      room.game.chatMsg(me, text);
      // ha egy emberi üzenet megnevez egy karaktert, a botok vádként értelmezik
      const lower = text.toLowerCase();
      const accused = room.players.find(p =>
        p.alive && p.id !== me.id && p.character &&
        lower.includes(p.character.name.toLowerCase().split(' ')[0]));
      if (accused) {
        room.players.filter(p => p.isBot && p.alive)
          .forEach(p => bots.botHearAccusation(p, me.id, accused.id));
      }
    } else {
      io.to(room.code).emit('chat', {
        system: false, playerId: me.id, name: me.name, color: '#ccc', text, ts: Date.now()
      });
    }
  });

  socket.on('playAgain', () => {
    if (!room || me.id !== room.hostId || !room.game || room.game.phase !== 'gameOver') return;
    room.game.destroy();
    room.game = null;
    room.players.forEach(p => {
      p.character = null; p.role = null; p.alive = true;
      p.tasks = []; p.vote = null; p.botState = null; p.x = 0; p.y = 0;
    });
    io.to(room.code).emit('backToLobby');
    io.to(room.code).emit('lobby', lobbyState(room));
  });

  socket.on('disconnect', () => {
    if (!room || !me) return;
    const inGame = room.game && !['lobby', 'gameOver'].includes(room.game.phase);
    if (inGame) {
      // játék közben a kilépő játékos helyét egy bot veszi át
      me.isBot = true;
      me.difficulty = 'medium';
      me.socketId = null;
      bots.initBot(me, room.game);
      room.game.systemMsg(`${me.name} elhagyta a játékot – egy bot veszi át a helyét.`);
      room.game.emit('gameState', room.game.publicState());
    } else {
      room.players = room.players.filter(p => p.id !== me.id);
      if (!room.players.some(p => !p.isBot)) {
        if (room.game) room.game.destroy();
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === me.id) {
        room.hostId = room.players.find(p => !p.isBot).id;
      }
      io.to(room.code).emit('lobby', lobbyState(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Az Arctalan fut: http://localhost:${PORT}`));
