// ============================================================
//  GFX – procedurális Trónok harca grafika (canvas)
//  Statikus réteg: kőpadló, falak, terem-díszletek (előrenderelve)
//  Dinamikus réteg: fáklyaláng, lávaizzás, víz, karakterek
// ============================================================
const GFX = (() => {

  // determinisztikus véletlen, hogy a díszlet ne "ugráljon"
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f));
    const b = Math.min(255, Math.max(0, (n & 255) * f));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // ---------- TÉMÁK ----------
  const THEMES = {
    dragonstone: {
      rock: '#1f1a26', rockHi: '#332b3d',
      floor: '#453c52', floorVar: 0.22,
      corridor: '#3c3447',
      wallEdge: '#0c0910', wallHi: '#5a4d6b',
      accent: '#a03830', banner: '#8a2222', bannerSigil: '🐉',
      torch: true, emberCracks: true
    },
    winterfell: {
      rock: '#1c2126', rockHi: '#2e373e',
      floor: '#46525c', floorVar: 0.18,
      corridor: '#3c464f',
      wallEdge: '#0b0e11', wallHi: '#5c6b78',
      accent: '#6b7d8c', banner: '#46586b', bannerSigil: '🐺',
      torch: true, emberCracks: false
    }
  };

  // ============================================================
  //  STATIKUS RÉTEG
  // ============================================================
  let staticCanvas = null;
  let dyn = null; // dinamikus effektek pozíciói { torches, cracks, water, braziers, candles }

  function build(map) {
    const th = THEMES[map.id] || THEMES.dragonstone;
    const cv = document.createElement('canvas');
    cv.width = map.width; cv.height = map.height;
    const c = cv.getContext('2d');
    const rnd = mulberry32(map.id === 'dragonstone' ? 1337 : 777);
    dyn = {
      torches: [], cracks: [], waters: [], braziers: [], candles: [],
      gulls: [], steams: [], ducks: [], cat: null, theme: th
    };

    // ---- külső szikla / háttér ----
    c.fillStyle = th.rock;
    c.fillRect(0, 0, map.width, map.height);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * map.width, y = rnd() * map.height, r = 4 + rnd() * 26;
      c.fillStyle = rnd() < 0.5 ? shade(th.rock, 0.75 + rnd() * 0.3) : th.rockHi;
      c.globalAlpha = 0.16;
      c.beginPath(); c.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 7); c.fill();
    }
    c.globalAlpha = 1;

    // ---- folyosók ----
    map.corridors.forEach(cor => {
      c.fillStyle = th.corridor;
      c.fillRect(cor.x, cor.y, cor.w, cor.h);
      // kőlapok
      const horiz = cor.w > cor.h;
      const step = 46;
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2;
      if (horiz) {
        for (let x = cor.x + step; x < cor.x + cor.w; x += step) {
          c.beginPath(); c.moveTo(x, cor.y + 4); c.lineTo(x, cor.y + cor.h - 4); c.stroke();
        }
      } else {
        for (let y = cor.y + step; y < cor.y + cor.h; y += step) {
          c.beginPath(); c.moveTo(cor.x + 4, y); c.lineTo(cor.x + cor.w - 4, y); c.stroke();
        }
      }
      // szegély
      c.strokeStyle = th.wallHi; c.lineWidth = 3;
      c.strokeRect(cor.x + 1, cor.y + 1, cor.w - 2, cor.h - 2);
      // fáklya a folyosó közepén
      dyn.torches.push({ x: cor.x + cor.w / 2, y: cor.y + (horiz ? 6 : cor.h / 2), small: true });
    });

    // ---- termek ----
    map.rooms.forEach(rm => {
      drawRoomFloor(c, rm, th, rnd);
      drawRoomWalls(c, rm, th);
      decorate(c, rm, map, th, rnd);
      // fáklyák a sarkokban
      [[36, 36], [rm.w - 36, 36], [36, rm.h - 36], [rm.w - 36, rm.h - 36]].forEach(([ox, oy]) => {
        dyn.torches.push({ x: rm.x + ox, y: rm.y + oy });
        // fali tartó
        c.fillStyle = '#3a2d1a';
        c.fillRect(rm.x + ox - 3, rm.y + oy - 2, 6, 12);
      });
      drawRoomLabel(c, rm, th);
    });

    staticCanvas = cv;
    return cv;
  }

  function drawRoomFloor(c, rm, th, rnd) {
    const T = 40;
    for (let ty = 0; ty < rm.h; ty += T) {
      for (let tx = 0; tx < rm.w; tx += T) {
        const v = 1 - th.floorVar / 2 + rnd() * th.floorVar;
        c.fillStyle = shade(th.floor, v);
        c.fillRect(rm.x + tx, rm.y + ty, Math.min(T, rm.w - tx), Math.min(T, rm.h - ty));
      }
    }
    // fugák
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5;
    for (let tx = T; tx < rm.w; tx += T) {
      c.beginPath(); c.moveTo(rm.x + tx, rm.y); c.lineTo(rm.x + tx, rm.y + rm.h); c.stroke();
    }
    for (let ty = T; ty < rm.h; ty += T) {
      c.beginPath(); c.moveTo(rm.x, rm.y + ty); c.lineTo(rm.x + rm.w, rm.y + ty); c.stroke();
    }
    // kopás-foltok
    for (let i = 0; i < 14; i++) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.beginPath();
      c.ellipse(rm.x + rnd() * rm.w, rm.y + rnd() * rm.h, 8 + rnd() * 30, 5 + rnd() * 16, rnd() * 3, 0, 7);
      c.fill();
    }
  }

  function drawRoomWalls(c, rm, th) {
    c.strokeStyle = th.wallEdge; c.lineWidth = 10;
    c.strokeRect(rm.x - 3, rm.y - 3, rm.w + 6, rm.h + 6);
    c.strokeStyle = th.wallHi; c.lineWidth = 2.5;
    c.strokeRect(rm.x + 2, rm.y + 2, rm.w - 4, rm.h - 4);
  }

  function drawRoomLabel(c, rm, th) {
    c.font = 'bold 20px Georgia';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillText(rm.name, rm.cx + 1, rm.y + 27);
    c.fillStyle = 'rgba(216,196,150,0.8)';
    c.fillText(rm.name, rm.cx, rm.y + 26);
    // díszvonal a felirat alatt
    c.strokeStyle = shade(th.accent, 1.3); c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(rm.cx - 60, rm.y + 34); c.lineTo(rm.cx + 60, rm.y + 34);
    c.stroke();
  }

  // ============================================================
  //  TEREM-DÍSZLETEK (Sárkánykő)
  // ============================================================
  function decorate(c, rm, map, th, rnd) {
    const fn = DECOR[rm.name];
    if (fn) fn(c, rm, th, rnd);
    else genericDecor(c, rm, th, rnd);
  }

  function genericDecor(c, rm, th, rnd) {
    // szőnyeg + két láda
    c.fillStyle = shade(th.accent, 0.7); c.globalAlpha = 0.5;
    c.fillRect(rm.cx - 70, rm.cy - 40, 140, 90);
    c.globalAlpha = 1;
    drawCrate(c, rm.x + 40, rm.y + rm.h - 60);
    drawCrate(c, rm.x + rm.w - 70, rm.y + 50);
  }

  function drawBanner(c, x, y, color, sigil) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x - 16, y); c.lineTo(x + 16, y);
    c.lineTo(x + 16, y + 52); c.lineTo(x, y + 64); c.lineTo(x - 16, y + 52);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = shade(color, 1.6);
    c.fillRect(x - 18, y - 4, 36, 5);
    c.font = '18px serif'; c.textAlign = 'center';
    c.fillText(sigil, x, y + 34);
  }

  function drawCrate(c, x, y) {
    c.fillStyle = '#4a3820';
    c.fillRect(x, y, 30, 26);
    c.strokeStyle = '#2c2113'; c.lineWidth = 2;
    c.strokeRect(x, y, 30, 26);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30, y + 26);
    c.moveTo(x + 30, y); c.lineTo(x, y + 26); c.stroke();
  }

  function drawBarrel(c, x, y) {
    c.fillStyle = '#5a4426';
    c.beginPath(); c.ellipse(x, y, 13, 16, 0, 0, 7); c.fill();
    c.strokeStyle = '#2c2113'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#8a6d3b';
    c.beginPath(); c.ellipse(x, y, 13, 6, 0, 0, 7); c.stroke();
  }

  const DECOR = {
    // ---- SÁRKÁNYKŐ ----
    'Trónterem': (c, rm, th) => {
      // vörös szőnyeg a trónig
      c.fillStyle = '#5c1414';
      c.fillRect(rm.cx - 30, rm.y + 46, 60, rm.h - 120);
      c.strokeStyle = '#8a6d3b'; c.lineWidth = 2;
      c.strokeRect(rm.cx - 30, rm.y + 46, 60, rm.h - 120);
      // emelvény
      c.fillStyle = '#221b28';
      c.fillRect(rm.cx - 66, rm.y + rm.h - 96, 132, 60);
      c.strokeStyle = '#3d3348'; c.strokeRect(rm.cx - 66, rm.y + rm.h - 96, 132, 60);
      // a szálkás obszidián trón
      const tx = rm.cx, ty = rm.y + rm.h - 66;
      c.fillStyle = '#0d0a12';
      c.beginPath();
      c.moveTo(tx - 26, ty + 22);
      c.lineTo(tx - 30, ty - 18); c.lineTo(tx - 18, ty - 6); c.lineTo(tx - 12, ty - 34);
      c.lineTo(tx - 4, ty - 12); c.lineTo(tx, ty - 44); c.lineTo(tx + 4, ty - 12);
      c.lineTo(tx + 12, ty - 34); c.lineTo(tx + 18, ty - 6); c.lineTo(tx + 30, ty - 18);
      c.lineTo(tx + 26, ty + 22);
      c.closePath(); c.fill();
      c.strokeStyle = '#4a3f5c'; c.lineWidth = 1.5; c.stroke();
      // zászlók
      drawBanner(c, rm.x + 60, rm.y + 40, th.banner, th.bannerSigil);
      drawBanner(c, rm.x + rm.w - 60, rm.y + 40, th.banner, th.bannerSigil);
      // parázstartók az emelvény mellett
      dyn.braziers.push({ x: rm.cx - 90, y: rm.y + rm.h - 70 }, { x: rm.cx + 90, y: rm.y + rm.h - 70 });
    },

    'Térképterem': (c, rm, th, rnd) => {
      // a Festett Asztal (Westeros-forma)
      const x = rm.cx, y = rm.cy + 14;
      c.fillStyle = '#4a3820';
      c.fillRect(x - 110, y - 62, 220, 124);
      c.strokeStyle = '#2c2113'; c.lineWidth = 4;
      c.strokeRect(x - 110, y - 62, 220, 124);
      // "térkép" az asztalon
      c.fillStyle = '#7a6b4a';
      c.fillRect(x - 100, y - 52, 200, 104);
      // Westeros sziluett (stilizált)
      c.fillStyle = '#5c7a4a';
      c.beginPath();
      c.moveTo(x - 60, y - 44);
      c.bezierCurveTo(x - 20, y - 52, x + 30, y - 40, x + 40, y - 20);
      c.bezierCurveTo(x + 55, y, x + 30, y + 20, x + 40, y + 40);
      c.bezierCurveTo(x + 10, y + 48, x - 30, y + 40, x - 40, y + 20);
      c.bezierCurveTo(x - 60, y, x - 40, y - 20, x - 60, y - 44);
      c.closePath(); c.fill();
      c.strokeStyle = '#3c5232'; c.stroke();
      // jelölő-figurák a térképen
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? '#8a2f2a' : '#d4af37';
        c.beginPath(); c.arc(x - 40 + rnd() * 80, y - 30 + rnd() * 60, 4, 0, 7); c.fill();
      }
      // gyertyák az asztal sarkain
      dyn.candles.push({ x: x - 104, y: y - 56 }, { x: x + 104, y: y - 56 },
                       { x: x - 104, y: y + 56 }, { x: x + 104, y: y + 56 });
      // könyvespolc
      c.fillStyle = '#3a2c18'; c.fillRect(rm.x + 14, rm.y + 44, 16, 90);
      for (let i = 0; i < 5; i++) {
        c.fillStyle = ['#6b3a2a', '#3a4a6b', '#4a6b3a', '#6b5a2a', '#5a3a5a'][i];
        c.fillRect(rm.x + 16, rm.y + 48 + i * 17, 12, 13);
      }
    },

    'Sárkányüreg': (c, rm, th, rnd) => {
      // sötétebb, barlangos padló-folt
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(rm.cx, rm.cy, rm.w * 0.42, rm.h * 0.38, 0, 0, 7); c.fill();
      // lávarepedések (dinamikusan izzanak)
      for (let i = 0; i < 5; i++) {
        const pts = [];
        let px = rm.x + 40 + rnd() * (rm.w - 80), py = rm.y + 50 + rnd() * (rm.h - 100);
        for (let s = 0; s < 5; s++) {
          pts.push({ x: px, y: py });
          px += (rnd() - 0.5) * 90; py += (rnd() - 0.5) * 60;
          px = Math.max(rm.x + 20, Math.min(rm.x + rm.w - 20, px));
          py = Math.max(rm.y + 44, Math.min(rm.y + rm.h - 20, py));
        }
        dyn.cracks.push(pts);
      }
      // sárkánykoponya (oldalnézet, jobbra néz)
      const sx = rm.cx + 55, sy = rm.cy - 6;
      c.save();
      c.translate(sx, sy);
      // szarvak hátrafelé
      c.fillStyle = '#8f8878';
      [[-0.5, 0], [-0.15, -6]].forEach(([rot, oy]) => {
        c.save(); c.translate(-28, -14 + oy); c.rotate(rot);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(-26, -10, -34, -26);
        c.quadraticCurveTo(-22, -16, -6, -8);
        c.closePath(); c.fill();
        c.restore();
      });
      // agykoponya
      c.fillStyle = '#d3ccbc';
      c.beginPath();
      c.moveTo(-38, 2);
      c.quadraticCurveTo(-40, -22, -14, -24);
      c.quadraticCurveTo(6, -26, 18, -14);
      c.lineTo(52, -4);                       // orrnyereg
      c.quadraticCurveTo(56, 2, 50, 4);       // orrhegy
      c.lineTo(-30, 10);
      c.closePath(); c.fill();
      c.strokeStyle = '#6b6355'; c.lineWidth = 2; c.stroke();
      // felső fogsor
      c.fillStyle = '#e8e2d2';
      for (let i = 0; i < 6; i++) {
        const fx = 8 + i * 7;
        c.beginPath();
        c.moveTo(fx, 4 + i * 0); c.lineTo(fx + 3, 12); c.lineTo(fx + 6, 4);
        c.closePath(); c.fill();
      }
      // alsó állkapocs (kissé nyitva)
      c.fillStyle = '#c3bcac';
      c.beginPath();
      c.moveTo(-26, 12);
      c.quadraticCurveTo(4, 20, 44, 14);
      c.lineTo(40, 20);
      c.quadraticCurveTo(0, 28, -24, 18);
      c.closePath(); c.fill();
      c.strokeStyle = '#6b6355'; c.lineWidth = 1.5; c.stroke();
      // szemüreg + orrnyílás
      c.fillStyle = '#17131c';
      c.beginPath(); c.ellipse(-10, -8, 8, 10, -0.2, 0, 7); c.fill();
      c.beginPath(); c.ellipse(38, -2, 3.5, 2.5, 0.3, 0, 7); c.fill();
      // repedés a koponyán
      c.strokeStyle = '#8f8878'; c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-24, -18); c.lineTo(-18, -10); c.lineTo(-22, -4);
      c.stroke();
      c.restore();
      // szétszórt csontok
      for (let i = 0; i < 7; i++) {
        const bx = rm.x + 30 + rnd() * (rm.w - 60), by = rm.y + 50 + rnd() * (rm.h - 80);
        c.save(); c.translate(bx, by); c.rotate(rnd() * 3);
        c.strokeStyle = '#a89f8e'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke();
        c.fillStyle = '#a89f8e';
        c.beginPath(); c.arc(-8, 0, 3, 0, 7); c.arc(8, 0, 3, 0, 7); c.fill();
        c.restore();
      }
      // sárkánytojások
      [[rm.x + 50, rm.cy + 60, '#2f4f3a'], [rm.x + 76, rm.cy + 74, '#4a2f2f'], [rm.x + 40, rm.cy + 86, '#c9a227']].forEach(([ex, ey, col]) => {
        c.fillStyle = col;
        c.beginPath(); c.ellipse(ex, ey, 10, 14, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; c.stroke();
      });
    },

    'Kikötő': (c, rm, th, rnd) => {
      // víz a terem alsó sávjában
      const wy = rm.y + rm.h - 110;
      dyn.waters.push({ x: rm.x + 6, y: wy, w: rm.w - 12, h: 104 });
      c.fillStyle = '#12222e';
      c.fillRect(rm.x + 6, wy, rm.w - 12, 104);
      // gumikacsa 🦆 (Sárkánykő legféltettebb titka)
      dyn.ducks.push({ x: rm.cx - 120, y: wy + 60 });
      // sirályok köröznek a kikötő fölött
      dyn.gulls.push({ cx: rm.cx - 60, cy: wy - 60, r: 100, ph: 0 },
                     { cx: rm.cx + 90, cy: wy - 90, r: 70, ph: 2.5 });
      // móló (deszkák) a víz fölött
      c.fillStyle = '#4a3820';
      c.fillRect(rm.cx - 40, wy - 4, 80, 60);
      for (let i = 1; i < 6; i++) {
        c.strokeStyle = '#2c2113'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(rm.cx - 40, wy - 4 + i * 10); c.lineTo(rm.cx + 40, wy - 4 + i * 10); c.stroke();
      }
      // csónak
      c.fillStyle = '#3a2c18';
      c.beginPath();
      c.moveTo(rm.cx + 70, wy + 40);
      c.quadraticCurveTo(rm.cx + 100, wy + 56, rm.cx + 130, wy + 40);
      c.quadraticCurveTo(rm.cx + 100, wy + 46, rm.cx + 70, wy + 40);
      c.closePath(); c.fill();
      // rakomány
      drawBarrel(c, rm.x + 44, rm.y + 60);
      drawBarrel(c, rm.x + 74, rm.y + 66);
      drawCrate(c, rm.x + rm.w - 80, rm.y + 50);
      drawCrate(c, rm.x + rm.w - 110, rm.y + 62);
      // kötélbakok
      [[rm.cx - 60, wy - 12], [rm.cx + 60, wy - 12]].forEach(([bx, by]) => {
        c.fillStyle = '#5a4a30';
        c.beginPath(); c.arc(bx, by, 6, 0, 7); c.fill();
      });
      // háló
      c.strokeStyle = 'rgba(150,130,90,0.4)'; c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(rm.x + 20 + i * 12, rm.cy - 40); c.lineTo(rm.x + 44 + i * 12, rm.cy + 10); c.stroke();
        c.beginPath(); c.moveTo(rm.x + 60 - i * 12, rm.cy - 40); c.lineTo(rm.x + 30 - i * 4, rm.cy + 4); c.stroke();
      }
    },

    'Aegon kertje': (c, rm, th, rnd) => {
      // fűfoltok
      for (let i = 0; i < 22; i++) {
        c.fillStyle = `rgba(90,${120 + rnd() * 40 | 0},70,0.28)`;
        c.beginPath();
        c.ellipse(rm.x + 30 + rnd() * (rm.w - 60), rm.y + 50 + rnd() * (rm.h - 80),
          14 + rnd() * 28, 8 + rnd() * 14, rnd() * 3, 0, 7);
        c.fill();
      }
      // tavacska
      const px = rm.cx + rm.w * 0.22, py = rm.cy + rm.h * 0.18;
      c.fillStyle = '#152836';
      c.beginPath(); c.ellipse(px, py, 52, 34, 0.2, 0, 7); c.fill();
      c.strokeStyle = '#3c4a3a'; c.lineWidth = 4; c.stroke();
      dyn.waters.push({ x: px - 48, y: py - 30, w: 96, h: 60 });
      // görcsös fák
      [[rm.x + 60, rm.y + 80], [rm.x + rm.w - 70, rm.y + 70], [rm.x + 70, rm.y + rm.h - 70]].forEach(([tx, ty], i) => {
        c.strokeStyle = '#3a2c1e'; c.lineWidth = 7; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(tx, ty + 18);
        c.quadraticCurveTo(tx + (i % 2 ? 8 : -8), ty, tx + (i % 2 ? -4 : 6), ty - 16);
        c.stroke();
        c.fillStyle = i === 2 ? 'rgba(140,60,60,0.85)' : 'rgba(70,100,60,0.9)';
        [[0, -26, 20], [-14, -16, 13], [14, -18, 14]].forEach(([ox, oy, r]) => {
          c.beginPath(); c.arc(tx + ox, ty + oy, r, 0, 7); c.fill();
        });
      });
      // virágok
      for (let i = 0; i < 16; i++) {
        c.fillStyle = ['#c05a7a', '#d4af37', '#7a6bc0', '#c0552a'][i % 4];
        c.beginPath();
        c.arc(rm.x + 40 + rnd() * (rm.w - 80), rm.y + 60 + rnd() * (rm.h - 90), 2.5, 0, 7);
        c.fill();
      }
      // kő sárkányszobor (kicsit kopott)
      const gx = rm.cx - rm.w * 0.2, gy = rm.cy - 20;
      c.fillStyle = '#5c5866';
      c.fillRect(gx - 16, gy + 10, 32, 12);                       // talapzat
      c.beginPath(); c.ellipse(gx, gy - 2, 12, 9, 0, 0, 7); c.fill();  // test
      c.beginPath();
      c.moveTo(gx + 6, gy - 8); c.quadraticCurveTo(gx + 18, gy - 20, gx + 14, gy - 26);
      c.lineTo(gx + 20, gy - 22); c.quadraticCurveTo(gx + 20, gy - 10, gx + 10, gy - 2);
      c.closePath(); c.fill();                                    // nyak+fej
      // szárny
      c.beginPath();
      c.moveTo(gx - 4, gy - 8); c.lineTo(gx - 16, gy - 22); c.lineTo(gx - 2, gy - 12);
      c.closePath(); c.fill();
      // pad
      c.fillStyle = '#4a3820';
      c.fillRect(rm.cx - 30, rm.y + rm.h - 56, 60, 8);
      c.fillRect(rm.cx - 26, rm.y + rm.h - 48, 6, 10);
      c.fillRect(rm.cx + 20, rm.y + rm.h - 48, 6, 10);
      // itt lakik a vármacska
      dyn.cat = {
        home: rm, x: rm.cx, y: rm.cy + 40,
        tx: rm.cx + 60, ty: rm.cy + 60, face: 1
      };
    },

    'Konyha': (c, rm, th, rnd) => {
      // nagy munkaasztal
      c.fillStyle = '#4a3820';
      c.fillRect(rm.cx - 80, rm.cy - 20, 160, 56);
      c.strokeStyle = '#2c2113'; c.lineWidth = 3;
      c.strokeRect(rm.cx - 80, rm.cy - 20, 160, 56);
      // kenyerek, sajt, hal az asztalon
      c.fillStyle = '#b8863c';
      c.beginPath(); c.ellipse(rm.cx - 50, rm.cy, 14, 8, 0.2, 0, 7); c.fill();
      c.beginPath(); c.ellipse(rm.cx - 20, rm.cy + 14, 12, 7, -0.2, 0, 7); c.fill();
      c.fillStyle = '#e0c04e';   // sajt
      c.beginPath();
      c.moveTo(rm.cx + 16, rm.cy + 12); c.lineTo(rm.cx + 44, rm.cy + 4);
      c.lineTo(rm.cx + 44, rm.cy + 18); c.closePath(); c.fill();
      c.fillStyle = '#7a95a8';   // hal
      c.beginPath(); c.ellipse(rm.cx + 50, rm.cy - 8, 16, 5, 0.1, 0, 7); c.fill();
      c.beginPath();
      c.moveTo(rm.cx + 64, rm.cy - 8); c.lineTo(rm.cx + 72, rm.cy - 13); c.lineTo(rm.cx + 72, rm.cy - 3);
      c.closePath(); c.fill();
      // egérke lesi a sajtot
      c.fillStyle = '#8a8492';
      c.beginPath(); c.ellipse(rm.cx + 58, rm.cy + 22, 5, 3, 0, 0, 7); c.fill();
      c.beginPath(); c.arc(rm.cx + 62, rm.cy + 20, 2, 0, 7); c.fill();
      c.strokeStyle = '#8a8492'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(rm.cx + 53, rm.cy + 22); c.quadraticCurveTo(rm.cx + 46, rm.cy + 24, rm.cx + 44, rm.cy + 20); c.stroke();
      // kondér a tűzön (gőzölög)
      const kx = rm.x + 60, ky = rm.y + 70;
      c.fillStyle = '#c04818';
      c.beginPath(); c.ellipse(kx, ky + 14, 18, 6, 0, 0, 7); c.fill();   // parázs
      c.fillStyle = '#26222c';
      c.beginPath(); c.ellipse(kx, ky, 20, 14, 0, 0, 7); c.fill();       // üst
      c.fillStyle = '#3c5a3c';
      c.beginPath(); c.ellipse(kx, ky - 8, 15, 4, 0, 0, 7); c.fill();    // rotyogó lé
      c.strokeStyle = '#1a171f'; c.lineWidth = 3;
      c.beginPath(); c.arc(kx, ky - 4, 22, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); // fogantyú
      dyn.steams.push({ x: kx, y: ky - 12 });
      dyn.braziers.push({ x: kx, y: ky + 14 });
      // lógó kolbászok a felső fal mentén
      for (let i = 0; i < 5; i++) {
        const sx = rm.cx - 40 + i * 26;
        c.strokeStyle = '#2c2113'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(sx, rm.y + 12); c.lineTo(sx, rm.y + 24); c.stroke();
        c.strokeStyle = '#8a3c2a'; c.lineWidth = 5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sx, rm.y + 26); c.lineTo(sx, rm.y + 44); c.stroke();
      }
      // hordó + zsákok
      drawBarrel(c, rm.x + rm.w - 50, rm.y + rm.h - 60);
      c.fillStyle = '#9a8a6a';
      c.beginPath(); c.ellipse(rm.x + rm.w - 90, rm.y + rm.h - 50, 13, 16, 0.15, 0, 7); c.fill();
      c.strokeStyle = '#6b5c42'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(rm.x + rm.w - 96, rm.y + rm.h - 64); c.lineTo(rm.x + rm.w - 84, rm.y + rm.h - 64); c.stroke();
    },

    'Nagy Csarnok': (c, rm, th) => {
      // hosszú asztalok két sorban, padokkal
      [-64, 64].forEach(oy => {
        const y = rm.cy + oy - 14;
        c.fillStyle = '#4a3820';
        c.fillRect(rm.cx - 120, y, 240, 30);
        c.strokeStyle = '#2c2113'; c.lineWidth = 3;
        c.strokeRect(rm.cx - 120, y, 240, 30);
        c.fillStyle = '#3a2c18';
        c.fillRect(rm.cx - 120, y - 12, 240, 8);
        c.fillRect(rm.cx - 120, y + 34, 240, 8);
        // kupák, tálak
        for (let i = 0; i < 5; i++) {
          c.fillStyle = i % 2 ? '#8a7a4a' : '#6b5a3a';
          c.beginPath(); c.arc(rm.cx - 96 + i * 48, y + 15, 5, 0, 7); c.fill();
        }
      });
      // kandalló a felső falnál
      c.fillStyle = '#1c1620';
      c.fillRect(rm.cx - 36, rm.y + 40, 72, 26);
      c.strokeStyle = '#3d3348'; c.lineWidth = 3;
      c.strokeRect(rm.cx - 36, rm.y + 40, 72, 26);
      dyn.braziers.push({ x: rm.cx, y: rm.y + 56, wide: true });
      // zászlók
      drawBanner(c, rm.x + 46, rm.y + 40, th.banner, th.bannerSigil);
      drawBanner(c, rm.x + rm.w - 46, rm.y + 40, th.banner, th.bannerSigil);
    },

    'Bástya': (c, rm, th, rnd) => {
      // lőrés-minta a falak mentén
      c.fillStyle = th.wallHi;
      for (let x = rm.x + 20; x < rm.x + rm.w - 20; x += 40) {
        c.fillRect(x, rm.y + 8, 20, 6);
        c.fillRect(x, rm.y + rm.h - 14, 20, 6);
      }
      // fegyverállvány
      c.fillStyle = '#3a2c18';
      c.fillRect(rm.x + 30, rm.cy - 40, 10, 80);
      for (let i = 0; i < 4; i++) {
        const ly = rm.cy - 30 + i * 20;
        c.strokeStyle = '#8a8a92'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(rm.x + 40, ly); c.lineTo(rm.x + 78, ly - 6); c.stroke();
        c.fillStyle = '#5a4a30';
        c.fillRect(rm.x + 36, ly - 2, 8, 4);
      }
      // pajzsok a falon
      [[rm.x + rm.w - 60, rm.y + 70], [rm.x + rm.w - 60, rm.y + 130], [rm.x + rm.w - 60, rm.y + 190]].forEach(([sx, sy], i) => {
        c.fillStyle = ['#7c1f1f', '#c9a227', '#2f4f3a'][i];
        c.beginPath();
        c.moveTo(sx - 14, sy - 16); c.lineTo(sx + 14, sy - 16);
        c.lineTo(sx + 14, sy + 4); c.lineTo(sx, sy + 18); c.lineTo(sx - 14, sy + 4);
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.stroke();
      });
      // katapult-kövek
      for (let i = 0; i < 5; i++) {
        c.fillStyle = '#4a4550';
        c.beginPath();
        c.arc(rm.cx + 40 + (i % 3) * 22, rm.cy + 60 + Math.floor(i / 3) * 20, 9, 0, 7);
        c.fill();
      }
    }
  };

  // ============================================================
  //  DINAMIKUS EFFEKTEK (minden képkockán)
  // ============================================================
  function drawEffects(c, t) {
    if (!dyn) return;
    // fáklyalángok + fényudvar
    c.save();
    dyn.torches.forEach((tor, i) => {
      const fl = Math.sin(t / 90 + i * 2.7) * 0.5 + Math.sin(t / 41 + i) * 0.3;
      const s = tor.small ? 0.7 : 1;
      // fényudvar
      const R = (58 + fl * 8) * s;
      const g = c.createRadialGradient(tor.x, tor.y, 4, tor.x, tor.y, R);
      g.addColorStop(0, 'rgba(255,170,60,0.30)');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      c.fillStyle = g;
      c.fillRect(tor.x - R, tor.y - R, R * 2, R * 2);
      // láng
      c.fillStyle = '#ff9b2e';
      c.beginPath();
      c.ellipse(tor.x, tor.y - 4 * s, 4 * s, (8 + fl * 2.5) * s, fl * 0.2, 0, 7);
      c.fill();
      c.fillStyle = '#ffe08a';
      c.beginPath();
      c.ellipse(tor.x, tor.y - 3 * s, 2 * s, (4.5 + fl) * s, 0, 0, 7);
      c.fill();
    });

    // parázstartók
    dyn.braziers.forEach((b, i) => {
      const fl = Math.sin(t / 70 + i * 1.9) * 0.5 + 0.5;
      const R = b.wide ? 70 : 46;
      const g = c.createRadialGradient(b.x, b.y, 4, b.x, b.y, R + fl * 10);
      g.addColorStop(0, 'rgba(255,120,40,0.38)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = g;
      c.fillRect(b.x - R - 12, b.y - R - 12, (R + 12) * 2, (R + 12) * 2);
      c.fillStyle = '#2c2530';
      c.beginPath(); c.ellipse(b.x, b.y + 4, b.wide ? 26 : 11, 5, 0, 0, 7); c.fill();
      c.fillStyle = `rgba(255,${140 + fl * 60 | 0},50,0.9)`;
      c.beginPath(); c.ellipse(b.x, b.y - 2, b.wide ? 20 : 8, 6 + fl * 3, 0, 0, 7); c.fill();
    });

    // gyertyák
    dyn.candles.forEach((cd, i) => {
      const fl = Math.sin(t / 60 + i * 3.1) * 0.5 + 0.5;
      c.fillStyle = '#d8cfb8';
      c.fillRect(cd.x - 2, cd.y - 6, 4, 8);
      c.fillStyle = `rgba(255,200,90,${0.75 + fl * 0.25})`;
      c.beginPath(); c.ellipse(cd.x, cd.y - 9, 2, 3.5 + fl, 0, 0, 7); c.fill();
    });

    // lávarepedések
    if (dyn.cracks.length) {
      const pulse = Math.sin(t / 600) * 0.5 + 0.5;
      dyn.cracks.forEach((pts, i) => {
        const a = 0.5 + 0.5 * Math.sin(t / 500 + i * 1.3);
        c.strokeStyle = `rgba(255,${90 + a * 70 | 0},20,${0.55 + a * 0.4})`;
        c.lineWidth = 3 + a * 2;
        c.shadowColor = 'rgba(255,100,20,0.9)';
        c.shadowBlur = 12 + pulse * 10;
        c.beginPath();
        c.moveTo(pts[0].x, pts[0].y);
        for (let s = 1; s < pts.length; s++) c.lineTo(pts[s].x, pts[s].y);
        c.stroke();
        c.shadowBlur = 0;
      });
    }

    // vizek (tenger, tavacska)
    dyn.waters.forEach(w => {
      c.save();
      c.beginPath(); c.rect(w.x, w.y, w.w, w.h); c.clip();
      const rows = Math.max(3, Math.floor(w.h / 14));
      for (let i = 0; i < rows; i++) {
        const yy = w.y + 10 + i * 12 + Math.sin(t / 800 + i) * 3;
        c.strokeStyle = `rgba(120,180,210,${0.10 + 0.06 * Math.sin(t / 400 + i * 2)})`;
        c.lineWidth = 2;
        c.beginPath();
        for (let x = w.x; x <= w.x + w.w; x += 24) {
          const y2 = yy + Math.sin(x / 40 + t / 500 + i) * 3;
          x === w.x ? c.moveTo(x, y2) : c.lineTo(x, y2);
        }
        c.stroke();
      }
      c.restore();
    });

    // felszálló lávaszikrák a repedésekből
    dyn.cracks.forEach((pts, ci) => {
      for (let k = 0; k < 3; k++) {
        const seed = ci * 7 + k * 13;
        const cycle = 2600 + (seed % 5) * 400;
        const ph = ((t + seed * 331) % cycle) / cycle;   // 0..1
        const p = pts[(seed + Math.floor((t + seed * 331) / cycle)) % pts.length];
        const x = p.x + Math.sin(ph * 9 + seed) * 6;
        const y = p.y - ph * 46;
        c.fillStyle = `rgba(255,${120 + (seed % 80)},30,${(1 - ph) * 0.8})`;
        c.beginPath(); c.arc(x, y, 2.2 * (1 - ph * 0.5), 0, 7); c.fill();
      }
    });

    // gőz (kondér)
    dyn.steams.forEach((s, si) => {
      for (let k = 0; k < 4; k++) {
        const cycle = 2200 + k * 300;
        const ph = ((t + k * 700 + si * 500) % cycle) / cycle;
        const x = s.x + Math.sin(ph * 6 + k) * (4 + ph * 8);
        const y = s.y - ph * 40;
        c.fillStyle = `rgba(220,220,230,${(1 - ph) * 0.30})`;
        c.beginPath(); c.arc(x, y, 3 + ph * 7, 0, 7); c.fill();
      }
    });

    // sirályok köröznek
    dyn.gulls.forEach(g => {
      const a = t / 2400 + g.ph;
      const x = g.cx + Math.cos(a) * g.r;
      const y = g.cy + Math.sin(a) * g.r * 0.45;
      const flap = Math.sin(t / 120 + g.ph) * 4;
      c.strokeStyle = 'rgba(230,230,235,0.9)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(x - 8, y - flap);
      c.quadraticCurveTo(x - 3, y + 2, x, y);
      c.quadraticCurveTo(x + 3, y + 2, x + 8, y - flap);
      c.stroke();
      // árnyék a vízen
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.beginPath(); c.ellipse(x, g.cy + g.r * 0.5 + 24, 6, 2, 0, 0, 7); c.fill();
    });

    // gumikacsa ringatózik
    dyn.ducks.forEach(d => {
      const bobY = Math.sin(t / 600) * 3;
      const tilt = Math.sin(t / 800) * 0.12;
      c.save();
      c.translate(d.x, d.y + bobY);
      c.rotate(tilt);
      c.fillStyle = '#f2c832';
      c.beginPath(); c.ellipse(0, 0, 11, 8, 0, 0, 7); c.fill();     // test
      c.beginPath(); c.arc(7, -8, 5.5, 0, 7); c.fill();             // fej
      c.fillStyle = '#e07820';
      c.beginPath();
      c.moveTo(11, -8); c.lineTo(17, -6.5); c.lineTo(11, -5.5);
      c.closePath(); c.fill();                                      // csőr
      c.fillStyle = '#1a140d';
      c.beginPath(); c.arc(8.5, -9, 1.1, 0, 7); c.fill();           // szem
      c.restore();
    });

    // a vármacska kóborol
    if (dyn.cat) {
      const cat = dyn.cat;
      if (!cat.lastT) cat.lastT = t;
      const dt = Math.min(100, t - cat.lastT);
      cat.lastT = t;
      const dx = cat.tx - cat.x, dy = cat.ty - cat.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        if (!cat.restUntil) cat.restUntil = t + 1500 + Math.random() * 4000;
        if (t > cat.restUntil) {
          cat.restUntil = 0;
          cat.tx = cat.home.x + 30 + Math.random() * (cat.home.w - 60);
          cat.ty = cat.home.y + 50 + Math.random() * (cat.home.h - 80);
        }
      } else {
        const sp = 0.05 * dt;
        cat.x += dx / d * sp;
        cat.y += dy / d * sp;
        cat.face = dx > 0 ? 1 : -1;
      }
      const moving = d >= 6;
      c.save();
      c.translate(cat.x, cat.y);
      c.scale(cat.face || 1, 1);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(0, 6, 9, 3, 0, 0, 7); c.fill();
      c.fillStyle = '#4a4550';
      c.beginPath(); c.ellipse(0, 0, 9, 5.5, 0, 0, 7); c.fill();    // test
      c.beginPath(); c.arc(8, -4, 4.5, 0, 7); c.fill();             // fej
      // fülek
      c.beginPath();
      c.moveTo(5, -7); c.lineTo(6, -11); c.lineTo(8.5, -8);
      c.moveTo(11, -8); c.lineTo(12.5, -11); c.lineTo(13, -7);
      c.fill();
      // farok leng
      const tw = Math.sin(t / (moving ? 180 : 500)) * 5;
      c.strokeStyle = '#4a4550'; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-8, -1);
      c.quadraticCurveTo(-14, -6 + tw, -16, -12 + tw);
      c.stroke();
      // szemek
      c.fillStyle = '#c9e04e';
      c.beginPath(); c.arc(9.5, -5, 1, 0, 7); c.fill();
      c.restore();
    }
    c.restore();
  }

  // ============================================================
  //  KARAKTEREK
  // ============================================================
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  const SKINS = ['#e8c39e', '#d9a97c', '#c68e5f', '#f0d0ae'];
  const HAIRS = ['#2b2118', '#4a3218', '#7a5a2a', '#c9c2b4', '#8a2f2a', '#1a1a1a', '#d8cfb8'];

  function drawCharacter(c, x, y, ch, opts) {
    const t = opts.t || 0;
    const moving = opts.moving;
    const face = opts.facing || 1;           // 1 = jobbra, -1 = balra
    const bob = moving ? Math.sin(t / 90) * 2.2 : Math.sin(t / 600) * 0.8;
    const h = hashCode(ch.name);
    const skin = SKINS[h % SKINS.length];
    const hair = HAIRS[(h >> 3) % HAIRS.length];
    const cloak = ch.color;
    const tunic = shade(ch.color, 0.55);

    c.save();
    c.translate(x, y);
    c.scale(1.5, 1.5);

    // árnyék
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0, 20, 16, 6, 0, 0, 7); c.fill();

    if (opts.isMe) {
      const g = c.createRadialGradient(0, 6, 6, 0, 6, 34);
      g.addColorStop(0, 'rgba(212,175,55,0.25)');
      g.addColorStop(1, 'rgba(212,175,55,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 6, 34, 0, 7); c.fill();
    }

    c.translate(0, bob);
    c.scale(face, 1);

    // lábak
    const step = moving ? Math.sin(t / 90) * 5 : 0;
    c.fillStyle = '#241c14';
    c.beginPath(); c.ellipse(-5, 18, 4.5, 6, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(5, 18 - step * 0.6, 4.5, 6, 0, 0, 7); c.fill();

    // köpeny (lengedezik járás közben)
    const sway = moving ? Math.sin(t / 90 + 1.5) * 3 : Math.sin(t / 700) * 1.2;
    c.fillStyle = shade(cloak, 0.8);
    c.beginPath();
    c.moveTo(-11, -6);
    c.quadraticCurveTo(-16 - sway, 8, -12 - sway, 20);
    c.lineTo(10 - sway * 0.5, 19);
    c.quadraticCurveTo(14, 6, 11, -6);
    c.closePath(); c.fill();

    // törzs (tunika)
    c.fillStyle = tunic;
    c.beginPath();
    c.moveTo(-10, -8);
    c.quadraticCurveTo(-12, 8, -8, 15);
    c.lineTo(8, 15);
    c.quadraticCurveTo(12, 8, 10, -8);
    c.closePath(); c.fill();
    // öv
    c.fillStyle = '#3a2c18';
    c.fillRect(-9, 5, 18, 4);
    c.fillStyle = '#c9a227';
    c.fillRect(-2, 5, 4, 4);
    // váll-lapok
    c.fillStyle = shade(cloak, 1.15);
    c.beginPath(); c.ellipse(-9, -7, 5, 4, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(9, -7, 5, 4, 0, 0, 7); c.fill();

    // fej
    c.fillStyle = skin;
    c.beginPath(); c.arc(1, -17, 8.5, 0, 7); c.fill();
    // haj: kupak a fej tetején, az arc szabadon marad
    c.fillStyle = hair;
    c.beginPath();
    c.arc(1, -18, 8.7, Math.PI * 0.85, Math.PI * 2.05);
    c.closePath(); c.fill();
    // kis tincs hátul
    c.beginPath();
    c.ellipse(-6, -13, 3, 4.5, 0.4, 0, 7);
    c.fill();
    // szem
    c.fillStyle = '#1a140d';
    c.beginPath(); c.arc(4.5, -17, 1.3, 0, 7); c.fill();

    c.restore();

    // címer-bross (nem tükröződik)
    c.font = '15px serif';
    c.textAlign = 'center';
    c.fillText(ch.sigil, x, y + 4 + bob * 1.5);
  }

  function drawDeadBody(c, x, y, ch, t) {
    c.save();
    c.translate(x, y);
    // vértócsa
    const grow = Math.min(1, ((t || 0) % 1e9) / 1); // statikus méret
    c.fillStyle = 'rgba(110,14,14,0.75)';
    c.beginPath(); c.ellipse(2, 8, 26, 13, 0.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(70,8,8,0.6)';
    c.beginPath(); c.ellipse(-6, 10, 12, 6, -0.3, 0, 7); c.fill();

    c.rotate(1.35);
    // fekvő test
    c.fillStyle = shade(ch ? ch.color : '#666', 0.6);
    c.beginPath();
    c.moveTo(-10, -6);
    c.quadraticCurveTo(-13, 6, -8, 14);
    c.lineTo(8, 14);
    c.quadraticCurveTo(12, 6, 10, -6);
    c.closePath(); c.fill();
    // fej
    c.fillStyle = '#d9b28c';
    c.beginPath(); c.arc(0, -13, 7, 0, 7); c.fill();
    // lábak
    c.fillStyle = '#241c14';
    c.beginPath(); c.ellipse(-4, 18, 4, 6, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(5, 17, 4, 6, 0.3, 0, 7); c.fill();
    c.restore();

    // tőr a testben
    c.save();
    c.translate(x + 4, y - 4);
    c.rotate(-0.6);
    c.fillStyle = '#b8b8c0';
    c.fillRect(-1.5, -12, 3, 12);
    c.fillStyle = '#3a2c18';
    c.fillRect(-5, -14, 10, 3.5);
    c.restore();
  }

  // feladatpont: izzó rúnakő
  function drawTaskPoint(c, x, y, active, t) {
    c.save();
    c.translate(x, y);
    if (active) {
      const pulse = Math.sin(t / 250) * 0.5 + 0.5;
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 26 + pulse * 8);
      g.addColorStop(0, 'rgba(212,175,55,0.5)');
      g.addColorStop(1, 'rgba(212,175,55,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 34, 0, 7); c.fill();
    }
    // kő
    c.fillStyle = active ? '#4a4030' : '#38333c';
    c.beginPath();
    c.moveTo(-10, 8); c.lineTo(-7, -8); c.lineTo(0, -12); c.lineTo(8, -7); c.lineTo(10, 8);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.stroke();
    // rúna
    c.strokeStyle = active ? `rgba(255,215,110,${0.7 + Math.sin(t / 250) * 0.3})` : 'rgba(160,150,130,0.35)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -8); c.lineTo(0, 4); c.moveTo(-4, -4); c.lineTo(4, 0); c.moveTo(4, -4); c.lineTo(-4, 0);
    c.stroke();
    c.restore();
  }

  return { build, drawEffects, drawCharacter, drawDeadBody, drawTaskPoint, staticLayer: () => staticCanvas };
})();
