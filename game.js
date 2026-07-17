const { CHARACTERS } = require('./characters');
const { MAPS, isWalkable, roomNameAt } = require('./maps');
const bots = require('./bots');

// Fázis-időzítések (ms)
const T = {
  ROLE_REVEAL: 6000,
  PLAY: 80000,
  DISCUSSION: 40000,
  VOTE: 22000,
  VOTE_RESULT: 7000
};

const MAX_ROUNDS = 6;
const TASKS_PER_PLAYER = 4;
const KILL_RANGE = 70;
const KILL_COOLDOWN = 18000;
const REPORT_RANGE = 130;
const TASK_RANGE = 90;
const VISION = 250;           // látótávolság (szemtanúkhoz is)
const TICK_MS = 100;

class Game {
  constructor(room, io, mapId) {
    this.room = room;
    this.io = io;
    this.map = MAPS[mapId] || MAPS.dragonstone;
    this.phase = 'lobby';
    this.round = 0;
    this.bodies = [];
    this.nextBodyId = 1;
    this.killCooldownUntil = 0;
    this.winner = null;
    this.timer = null;
    this.tickTimer = null;
    this.phaseEndsAt = 0;
    this.meetingContext = null; // { reporter, body } vagy null (időzített tanács)
    this.taskProgress = { done: 0, total: 0 };
  }

  get alive() { return this.room.players.filter(p => p.alive); }
  get killer() { return this.room.players.find(p => p.role === 'killer'); }

  emit(ev, d) { this.io.to(this.room.code).emit(ev, d); }
  toPlayer(p, ev, d) { if (!p.isBot && p.socketId) this.io.to(p.socketId).emit(ev, d); }

  // ---------- INDÍTÁS ----------
  start() {
    const players = this.room.players;
    const pool = [...CHARACTERS].sort(() => Math.random() - 0.5);
    players.forEach((p, i) => {
      p.character = pool[i];
      p.alive = true;
      p.vote = null;
      // szétszórt kezdőpozíciók a spawn körül
      const ang = (i / players.length) * Math.PI * 2;
      p.x = this.map.spawn.x + Math.cos(ang) * 80;
      p.y = this.map.spawn.y + Math.sin(ang) * 80;
    });

    // pontosan 1 gyilkos (az Arctalan)
    const killer = players[Math.floor(Math.random() * players.length)];
    players.forEach(p => { p.role = p === killer ? 'killer' : 'crew'; });

    // feladatok kiosztása (a gyilkos kamu-feladatokat kap, azok nem számítanak)
    const tp = this.map.taskPoints;
    players.forEach(p => {
      const shuffled = [...tp].sort(() => Math.random() - 0.5);
      p.tasks = shuffled.slice(0, TASKS_PER_PLAYER).map(t => ({ id: t.id, room: t.room, done: false }));
    });
    this.taskProgress = {
      done: 0,
      total: players.filter(p => p.role === 'crew').length * TASKS_PER_PLAYER
    };

    players.forEach(p => { if (p.isBot) bots.initBot(p, this); });

    this.setPhase('roleReveal', T.ROLE_REVEAL);
    players.forEach(p => {
      this.toPlayer(p, 'roleInfo', {
        role: p.role,
        tasks: p.tasks,
        killCooldown: KILL_COOLDOWN
      });
    });
    this.emit('mapData', this.map);
    this.timer = setTimeout(() => this.startRound(), T.ROLE_REVEAL);
  }

  setPhase(phase, dur) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + dur;
    this.emit('gameState', this.publicState());
  }

  publicState() {
    return {
      phase: this.phase,
      round: this.round,
      maxRounds: MAX_ROUNDS,
      mapId: this.map.id,
      mapLabel: this.map.label,
      phaseEndsAt: this.phaseEndsAt,
      winner: this.winner,
      taskProgress: this.taskProgress,
      meeting: this.meetingContext ? {
        reporterName: this.meetingContext.reporter ? this.meetingContext.reporter.character.name : null,
        victimName: this.meetingContext.body ? this.meetingContext.body.victimCharacter : null,
        room: this.meetingContext.body ? this.meetingContext.body.room : null
      } : null,
      players: this.room.players.map(p => ({
        id: p.id, name: p.name, isBot: p.isBot, alive: p.alive,
        character: p.character,
        votedFor: this.phase === 'vote' ? (p.vote !== null) : undefined,
        revealedRole: (!p.alive || this.winner) ? p.role : undefined
      }))
    };
  }

  // ---------- JÁTÉK-KÖR (mozgás fázis) ----------
  startRound() {
    this.round++;
    this.bodies = [];
    this.meetingContext = null;
    this.killCooldownUntil = Date.now() + 12000; // a kör elején védettség
    this.room.players.forEach(p => { p.vote = null; });
    this.setPhase('play', T.PLAY);
    this.systemMsg(`${this.round}. kör – A Tanács szétszéled. Végezzétek a feladataitokat... és vigyázzatok magatokra.`);

    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.timer = setTimeout(() => this.convene(null, null, 'A kör lejárt'), T.PLAY);
  }

  tick() {
    if (this.phase !== 'play') return;
    this.room.players.filter(p => p.isBot && p.alive).forEach(p => bots.botTick(p, this, TICK_MS));
    this.emit('tick', {
      players: this.alive.map(p => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })),
      bodies: this.bodies,
      killCooldownUntil: this.killCooldownUntil
    });
  }

  move(playerId, x, y) {
    const p = this.room.players.find(q => q.id === playerId);
    if (!p || !p.alive || this.phase !== 'play') return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (!isWalkable(this.map, x, y)) return;
    p.x = x; p.y = y;
  }

  // ---------- FELADATOK ----------
  taskDone(playerId, taskId) {
    const p = this.room.players.find(q => q.id === playerId);
    if (!p || !p.alive || this.phase !== 'play') return;
    const task = (p.tasks || []).find(t => t.id === taskId && !t.done);
    if (!task) return;
    const tp = this.map.taskPoints.find(t => t.id === taskId);
    if (!tp || Math.hypot(p.x - tp.x, p.y - tp.y) > TASK_RANGE + 20) return;
    task.done = true;
    if (p.role === 'crew') {
      this.taskProgress.done++;
      this.emit('gameState', this.publicState());
      if (this.taskProgress.done >= this.taskProgress.total) {
        this.endGame('crew', 'Minden küldetés teljesült!');
      }
    }
    this.toPlayer(p, 'tasksUpdate', p.tasks);
  }

  // ---------- GYILKOSSÁG ----------
  kill(killerId, targetId) {
    const k = this.room.players.find(q => q.id === killerId);
    const v = this.room.players.find(q => q.id === targetId);
    if (!k || !v || this.phase !== 'play') return;
    if (k.role !== 'killer' || !k.alive || !v.alive || v.id === k.id) return;
    if (Date.now() < this.killCooldownUntil) return;
    if (Math.hypot(k.x - v.x, k.y - v.y) > KILL_RANGE) return;

    v.alive = false;
    this.killCooldownUntil = Date.now() + KILL_COOLDOWN;
    const room = roomNameAt(this.map, v.x, v.y);
    this.bodies.push({
      id: 'b' + (this.nextBodyId++),
      x: Math.round(v.x), y: Math.round(v.y),
      victimId: v.id, victimName: v.name,
      victimCharacter: v.character.name,
      sigil: v.character.sigil, room
    });
    this.toPlayer(v, 'youDied', {});

    // szemtanúk: élő játékosok látótávon belül
    this.alive.filter(w => w.id !== k.id &&
      Math.hypot(w.x - k.x, w.y - k.y) < VISION)
      .forEach(w => {
        if (w.isBot) bots.botWitnessKill(w, k, v, room, this);
        else this.toPlayer(w, 'witnessedKill', { killerId: k.id, victimId: v.id, room });
      });

    if (k.isBot) bots.botAfterKill(k, this);
    this.emit('gameState', this.publicState());
    this.checkWin();
  }

  // ---------- JELENTÉS / TANÁCS ----------
  report(playerId, bodyId) {
    const p = this.room.players.find(q => q.id === playerId);
    if (!p || !p.alive || this.phase !== 'play') return;
    const b = this.bodies.find(x => x.id === bodyId);
    if (!b || Math.hypot(p.x - b.x, p.y - b.y) > REPORT_RANGE) return;
    this.convene(p, b, null);
  }

  convene(reporter, body, reason) {
    if (this.phase !== 'play') return;
    clearTimeout(this.timer);
    clearInterval(this.tickTimer);
    this.meetingContext = { reporter, body };
    this.room.players.forEach(p => { p.vote = null; });

    // a bot-emlékek frissítése a tanács előtt
    this.room.players.filter(p => p.isBot && p.alive).forEach(p => bots.botPrepareMeeting(p, this));

    this.setPhase('discussion', T.DISCUSSION);
    if (body) {
      this.systemMsg(`🔔 ${reporter.character.name} holttestet talált: ${body.victimCharacter} (${body.room})! A Tanács összeül.`);
    } else {
      this.systemMsg(`🔔 ${reason || 'A kör véget ért'} – a Tanács összeül.${this.bodies.length ? ' Hiányzók: ' + this.bodies.map(b => b.victimCharacter).join(', ') : ' Mindenki él.'}`);
    }

    // bot hozzászólások
    this.alive.filter(p => p.isBot).forEach(p => {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (this.phase !== 'discussion' || !p.alive) return;
          const msg = bots.botMeetingChat(p, this);
          if (msg) this.chatMsg(p, msg);
        }, 2500 + Math.random() * (T.DISCUSSION - 10000));
      }
    });

    this.timer = setTimeout(() => this.startVote(), T.DISCUSSION);
  }

  startVote() {
    this.setPhase('vote', T.VOTE);
    this.systemMsg('⚖️ Szavazás! Ki az Arctalan? (Kihagyni is lehet.)');
    this.alive.filter(p => p.isBot).forEach(p => {
      setTimeout(() => {
        if (this.phase !== 'vote' || !p.alive || p.vote) return;
        p.vote = bots.botMeetingVote(p, this) || 'skip';
        this.emit('gameState', this.publicState());
        this.checkAllVoted();
      }, 2000 + Math.random() * 12000);
    });
    this.timer = setTimeout(() => this.resolveVote(), T.VOTE);
  }

  castVote(playerId, targetId) {
    const p = this.room.players.find(q => q.id === playerId);
    if (!p || !p.alive || this.phase !== 'vote') return;
    if (targetId !== 'skip') {
      const t = this.room.players.find(q => q.id === targetId);
      if (!t || !t.alive || t.id === p.id) return;
    }
    p.vote = targetId;
    this.emit('gameState', this.publicState());
    this.checkAllVoted();
  }

  checkAllVoted() {
    if (this.alive.every(p => p.vote)) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.resolveVote(), 1200);
    }
  }

  resolveVote() {
    if (this.phase !== 'vote') return;
    const tally = {};
    this.alive.forEach(p => {
      if (p.vote && p.vote !== 'skip') tally[p.vote] = (tally[p.vote] || 0) + 1;
    });
    let eliminated = null;
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (entries.length && (entries.length === 1 || entries[0][1] > entries[1][1])) {
      eliminated = this.room.players.find(p => p.id === entries[0][0]);
      eliminated.alive = false;
      this.toPlayer(eliminated, 'youDied', {});
    }

    this.phase = 'voteResult';
    this.phaseEndsAt = Date.now() + T.VOTE_RESULT;
    this.emit('voteResult', {
      tally,
      eliminated: eliminated ? {
        id: eliminated.id, name: eliminated.name,
        role: eliminated.role, character: eliminated.character
      } : null
    });
    this.emit('gameState', this.publicState());
    this.systemMsg(eliminated
      ? `${eliminated.character.name} (${eliminated.name}) a tengerbe vettetett! ${eliminated.role === 'killer' ? 'Ő VOLT AZ ARCTALAN! ⚔️' : 'Ártatlan volt... 😔'}`
      : 'Nem született döntés – senkit sem száműztek.');

    this.timer = setTimeout(() => {
      if (this.checkWin()) return;
      if (this.round >= MAX_ROUNDS) {
        this.endGame('killer', `Az Arctalan túlélt ${MAX_ROUNDS} kört, és eltűnt az éjszakában...`);
        return;
      }
      this.startRound();
    }, T.VOTE_RESULT);
  }

  // ---------- GYŐZELEM ----------
  checkWin() {
    const k = this.killer;
    if (!k.alive) { this.endGame('crew', 'Az Arctalan lelepleződött!'); return true; }
    if (this.alive.length <= 2) { this.endGame('killer', 'Már csak ketten maradtak... és az egyikük az Arctalan.'); return true; }
    return false;
  }

  endGame(winner, reason) {
    if (this.winner) return;
    clearTimeout(this.timer);
    clearInterval(this.tickTimer);
    this.winner = winner;
    this.phase = 'gameOver';
    this.emit('gameState', this.publicState());
    this.systemMsg(winner === 'crew'
      ? `🏆 A TANÁCS GYŐZÖTT! ${reason}`
      : `🗡️ AZ ARCTALAN GYŐZÖTT! ${reason}`);
  }

  // ---------- CHAT ----------
  systemMsg(text) { this.emit('chat', { system: true, text, ts: Date.now() }); }
  chatMsg(player, text) {
    this.emit('chat', {
      system: false, playerId: player.id, name: player.name,
      character: player.character ? player.character.name : null,
      color: player.character ? player.character.color : '#ccc',
      text, ts: Date.now()
    });
  }

  destroy() { clearTimeout(this.timer); clearInterval(this.tickTimer); }
}

module.exports = { Game, VISION, KILL_RANGE, REPORT_RANGE, TASK_RANGE, KILL_COOLDOWN };
