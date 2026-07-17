// Bot AI az Among Us-stílusú játékhoz.
//  easy:   lassan reagál, a gyilkos bot szemtanúk előtt is öl
//  medium: figyeli a környezetét, a gyilkos max 1 szemtanút kockáztat
//  hard:   a gyilkos csak tanúk nélkül öl és elmenekül; a botok jól kombinálnak

const { roomNameAt, findPath } = require('./maps');

const VISION = 250;
const KILL_RANGE = 70;
const TASK_RANGE = 90;
const BOT_SPEED = 145;        // px/s
const TASK_TIME = 3000;

function initBot(bot, game) {
  bot.botState = {
    path: [],
    tasking: null,          // { taskId, until }
    lookAt: 0,
    repathAt: 0,
    lastSeen: {},           // playerId -> { room, ts }
    sawKill: null,          // { killerId, room, victimName }
    suspicion: {},
    accusedMe: {},
    saidThisMeeting: 0,
    fleeUntil: 0
  };
}

function fp(game, bot, x, y) { return findPath(game.map, bot.x, bot.y, x, y); }

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ---------- MOZGÁS-TICK ----------
function botTick(bot, game, dtMs) {
  const s = bot.botState;
  const now = Date.now();

  // körülnézés: kit látok, van-e holttest
  if (now > s.lookAt) {
    s.lookAt = now + 600;
    game.alive.forEach(q => {
      if (q.id === bot.id) return;
      if (Math.hypot(q.x - bot.x, q.y - bot.y) < VISION) {
        s.lastSeen[q.id] = { room: roomNameAt(game.map, q.x, q.y), ts: now };
      }
    });
    // holttest felfedezése (a gyilkos a sajátját nem jelenti, hard szinten biztos nem)
    const body = game.bodies.find(b => Math.hypot(b.x - bot.x, b.y - bot.y) < VISION - 40);
    if (body && !(bot.role === 'killer' && bot.difficulty !== 'easy')) {
      const delay = { easy: 1800, medium: 900, hard: 400 }[bot.difficulty] || 1000;
      setTimeout(() => {
        if (game.phase === 'play' && bot.alive && game.bodies.includes(body)) {
          game.report(bot.id, body.id);
        }
      }, delay);
      return;
    }
  }

  // feladat végzése: állni kell
  if (s.tasking) {
    if (now >= s.tasking.until) {
      game.taskDone(bot.id, s.tasking.taskId);
      s.tasking = null;
    }
    return;
  }

  // gyilkos: vadászat, ha lejárt a cooldown
  if (bot.role === 'killer' && now >= game.killCooldownUntil && now >= s.fleeUntil) {
    const prey = game.alive
      .filter(q => q.id !== bot.id)
      .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
    if (prey) {
      const d = Math.hypot(prey.x - bot.x, prey.y - bot.y);
      if (d < KILL_RANGE - 8) {
        const witnesses = game.alive.filter(w =>
          w.id !== bot.id && w.id !== prey.id &&
          Math.hypot(w.x - bot.x, w.y - bot.y) < VISION).length;
        const maxW = { easy: 99, medium: 1, hard: 0 }[bot.difficulty];
        if (witnesses <= maxW) {
          game.kill(bot.id, prey.id);
          return;
        }
      } else {
        const huntRange = { easy: 500, medium: 800, hard: 2200 }[bot.difficulty];
        if (d < huntRange) {
          if (now > s.repathAt) {
            s.repathAt = now + 900;
            s.path = fp(game, bot, prey.x, prey.y);
          }
          walk(bot, game, dtMs);
          return;
        }
      }
    }
  }

  // következő feladat (a gyilkos is "feladatozik" álcának)
  if (!s.path.length) {
    const next = (bot.tasks || []).find(t => !t.done);
    if (next) {
      const tp = game.map.taskPoints.find(t => t.id === next.id);
      s.path = fp(game, bot, tp.x, tp.y);
      s.goalTask = next.id;
    } else {
      const rm = pick(game.map.rooms);
      s.path = fp(game, bot, rm.cx + (Math.random() - 0.5) * 120, rm.cy + (Math.random() - 0.5) * 80);
      s.goalTask = null;
    }
  }

  walk(bot, game, dtMs);

  // odaértünk a feladathoz?
  if (!s.path.length && s.goalTask) {
    const tp = game.map.taskPoints.find(t => t.id === s.goalTask);
    if (tp && Math.hypot(bot.x - tp.x, bot.y - tp.y) < TASK_RANGE) {
      s.tasking = { taskId: s.goalTask, until: now + TASK_TIME };
    }
    s.goalTask = null;
  }
}

function walk(bot, game, dtMs) {
  const s = bot.botState;
  if (!s.path.length) return;
  const t = s.path[0];
  const dx = t.x - bot.x, dy = t.y - bot.y;
  const d = Math.hypot(dx, dy);
  const step = BOT_SPEED * dtMs / 1000;
  if (d <= step) {
    bot.x = t.x; bot.y = t.y;
    s.path.shift();
  } else {
    bot.x += dx / d * step;
    bot.y += dy / d * step;
  }
}

// ---------- ESEMÉNYEK ----------
function botWitnessKill(bot, killer, victim, room, game) {
  const s = bot.botState;
  s.sawKill = { killerId: killer.id, room, victimName: victim.character.name };
  s.suspicion[killer.id] = (s.suspicion[killer.id] || 0) + 10;
  // a szemtanú jelenti a holttestet (easy bot lassabban kapcsol)
  const delay = { easy: 3000, medium: 1200, hard: 600 }[bot.difficulty] || 1500;
  setTimeout(() => {
    if (game.phase !== 'play' || !bot.alive) return;
    const body = game.bodies.find(b => b.victimId === victim.id);
    if (body) game.report(bot.id, body.id);
  }, delay);
}

function botAfterKill(killer, game) {
  // menekülés egy távoli terembe
  const s = killer.botState;
  const far = [...game.map.rooms]
    .sort((a, b) => Math.hypot(b.cx - killer.x, b.cy - killer.y) - Math.hypot(a.cx - killer.x, a.cy - killer.y))[0];
  s.path = fp(game, killer, far.cx, far.cy);
  s.goalTask = null;
  s.fleeUntil = Date.now() + 8000;
}

function botHearAccusation(bot, accuserId, accusedId) {
  const s = bot.botState;
  if (!s) return;
  if (accusedId === bot.id) { s.accusedMe[accuserId] = true; return; }
  if (bot.difficulty === 'easy') return;
  s.suspicion[accusedId] = (s.suspicion[accusedId] || 0) + 0.6;
}

// ---------- TANÁCSKOZÁS ----------
function botPrepareMeeting(bot, game) {
  const s = bot.botState;
  s.saidThisMeeting = 0;
  if (bot.difficulty === 'easy') return;
  const now = Date.now();
  // aki a holttest termében járt az utóbbi fél percben, az gyanús
  game.bodies.forEach(b => {
    game.alive.forEach(q => {
      if (q.id === bot.id) return;
      const seen = s.lastSeen[q.id];
      if (seen && seen.room === b.room && now - seen.ts < 30000) {
        s.suspicion[q.id] = (s.suspicion[q.id] || 0) + 2;
      }
    });
  });
}

const TPL = {
  witness: [
    'LÁTTAM! {K} ölte meg {V}-t a(z) {R} környékén! Esküszöm az öreg istenekre!',
    '{K} volt az! A saját szememmel láttam a(z) {R}-nál! Szavazzatok rá!'
  ],
  foundBody: [
    'Én találtam meg {V} holttestét a(z) {R}-ban. Még meleg volt...',
    '{V} a(z) {R}-ban fekszik. Ki járt arra?!'
  ],
  suspect: [
    '{NAME} ott ólálkodott a(z) {R} környékén nem sokkal előtte...',
    'Utoljára {NAME}-t láttam arrafelé. Nagyon gyanús.',
    'Nem vádolok senkit, de {NAME} pont ott volt.'
  ],
  alibi: [
    'Én végig a(z) {R}-ban dolgoztam a feladatomon.',
    'Engem kihagyhattok, a(z) {R}-ban voltam egész körben.'
  ],
  noInfo: [
    'Semmit sem láttam, a feladataimat végeztem.',
    'Nekem nincs információm. Ne kapkodjuk el a szavazást.',
    'Valar morghulis... de ki keze által?'
  ],
  defend: [
    'Én?! {NAME} csak terelni akar! Én végig dolgoztam!',
    'Ez nevetséges. Ha engem száműztök, az Arctalan nevetni fog.',
    'Rossz nyomon jártok. Figyeljétek inkább {NAME}-t!'
  ],
  killerDeflect: [
    'Szerintem {NAME} volt. Túl csendes.',
    'Én messze jártam onnan. {NAME} viszont pont arra ment...',
    'Gyorsan találjuk meg, mielőtt újra lecsap! {NAME}, hol voltál?'
  ]
};

function botMeetingChat(bot, game) {
  const s = bot.botState;
  if (s.saidThisMeeting >= 2) return null;
  s.saidThisMeeting++;
  const ctx = game.meetingContext || {};
  const others = game.alive.filter(q => q.id !== bot.id);
  if (!others.length) return null;

  const myRoom = roomNameAt(game.map, bot.x, bot.y);
  const nameOf = id => {
    const q = game.room.players.find(p => p.id === id);
    return q ? q.character.name : '???';
  };

  // ha megvádoltak, védekezünk
  const accuserId = Object.keys(s.accusedMe).find(id => game.alive.some(q => q.id === id));
  if (accuserId && Math.random() < 0.7) {
    delete s.accusedMe[accuserId];
    return pick(TPL.defend).replace('{NAME}', nameOf(accuserId));
  }

  if (bot.role === 'killer') {
    // terelés: a leggyanúsabbnak tartott ártatlanra mutogat
    const target = pick(others);
    const t = Math.random();
    if (t < 0.5) return pick(TPL.killerDeflect).replace('{NAME}', target.character.name);
    if (t < 0.8) return pick(TPL.alibi).replace('{R}', myRoom);
    return pick(TPL.noInfo);
  }

  if (s.sawKill && game.alive.some(q => q.id === s.sawKill.killerId)) {
    const msg = pick(TPL.witness)
      .replace('{K}', nameOf(s.sawKill.killerId))
      .replace('{V}', s.sawKill.victimName)
      .replace('{R}', s.sawKill.room);
    broadcastAccusation(game, bot, s.sawKill.killerId, 2.5);
    return msg;
  }

  if (ctx.reporter && ctx.reporter.id === bot.id && ctx.body) {
    return pick(TPL.foundBody).replace('{V}', ctx.body.victimCharacter).replace('{R}', ctx.body.room);
  }

  const [topId, topVal] = Object.entries(s.suspicion)
    .filter(([id]) => game.alive.some(q => q.id === id))
    .sort((a, b) => b[1] - a[1])[0] || [null, 0];
  if (topId && topVal >= 2 && bot.difficulty !== 'easy') {
    const seen = s.lastSeen[topId];
    broadcastAccusation(game, bot, topId, 0.8);
    return pick(TPL.suspect)
      .replace('{NAME}', nameOf(topId))
      .replace('{R}', seen ? seen.room : myRoom);
  }

  return Math.random() < 0.4
    ? pick(TPL.alibi).replace('{R}', myRoom)
    : pick(TPL.noInfo);
}

function broadcastAccusation(game, accuser, accusedId, weight) {
  game.room.players.filter(p => p.isBot && p.alive && p.id !== accuser.id).forEach(p => {
    const s = p.botState;
    if (!s || p.difficulty === 'easy') return;
    if (accusedId === p.id) { s.accusedMe[accuser.id] = true; return; }
    s.suspicion[accusedId] = (s.suspicion[accusedId] || 0) + weight;
  });
}

function botMeetingVote(bot, game) {
  const s = bot.botState;
  const others = game.alive.filter(q => q.id !== bot.id);
  if (!others.length) return 'skip';

  if (bot.role === 'killer') {
    // aki vádolt minket, arra; különben a "tömeg" gyanúsítottjára vagy skip
    const accuser = others.find(q => s.accusedMe[q.id]);
    if (accuser) return accuser.id;
    return Math.random() < 0.5 ? pick(others).id : 'skip';
  }

  if (s.sawKill && others.some(q => q.id === s.sawKill.killerId)) return s.sawKill.killerId;

  if (bot.difficulty === 'easy') {
    return Math.random() < 0.5 ? pick(others).id : 'skip';
  }

  const [topId, topVal] = Object.entries(s.suspicion)
    .filter(([id]) => others.some(q => q.id === id))
    .sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const threshold = bot.difficulty === 'hard' ? 1.5 : 0.8;
  if (topId && topVal >= threshold) return topId;
  return 'skip';
}

module.exports = {
  initBot, botTick, botWitnessKill, botAfterKill,
  botPrepareMeeting, botMeetingChat, botMeetingVote, botHearAccusation
};
