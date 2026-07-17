# 🗡️ Az Arctalan

Trónok harca témájú **Among Us-stílusú** játék — multiplayer Socket.IO-val, botokkal is játszható.

## Indítás

```
npm install
npm start
```

Utána nyisd meg: **http://localhost:3000**

## Játékmenet

- 4–10 játékos (emberek + botok). Egyikük az **Arctalan** (a gyilkos), a többiek a Tanács tagjai.
- **Két pálya:** 🐉 Sárkánykő (8 terem: Trónterem, Térképterem, Bástya, Aegon kertje, Nagy Csarnok, Sárkányüreg, Konyha, Kikötő) és ❄️ Deres (6 terem) — a házigazda választ a lobbyban. Változatos méretű termek, folyosók, felülnézetes 2D, WASD/nyilak mozgás, korlátozott látótávolság.
- **Élő díszletek:** kóborló vármacska Aegon kertjében, köröző sirályok és ringatózó gumikacsa a Kikötőben, gőzölgő kondér a Konyhában, felszálló lávaszikrák a Sárkányüregben.
- **Küldetések:** minden tanácstag 4 feladatot kap (arany rombuszok a termekben). Odamész, E-vel elindítod, 3 mp állva teljesíted. Az Arctalan csak álca-feladatokat kap.
- **Gyilkosság:** az Arctalan Q-val öl a közelben (18 mp cooldown). A holttest ott marad — aki megtalálja, R-rel jelenti, és összeül a Tanács.
- **Tanácskozás:** vita (chat) + szavazás. Akire a legtöbb szavazat esik, azt száműzik, és kiderül a szerepe. Kihagyni is lehet a szavazást.
- **6 kör:** minden kör 80 mp mozgás, utána automatikus tanácskozás (vagy előbb, ha holttestet jelentenek).

**Győzelem**
- A Tanács nyer: az Arctalan kiszavazásával, vagy ha minden küldetés elkészül.
- Az Arctalan nyer: ha túléli a 6 kört, vagy ha már csak ketten maradnak.

## Botok

A házigazda adhat hozzá botokat, három nehézségi szinten. A botok mozognak a pályán, feladatokat végeznek, jelentik a holttesteket, a tanácsban elmondják, mit láttak ("Láttam! Ő ölte meg a Kriptánál!"), gyanú alapján szavaznak — és ha egy chatüzenetben megnevezel egy karaktert, azt vádként értelmezik.

- **Könnyű:** lassan reagál; gyilkosként szemtanúk előtt is öl.
- **Közepes:** figyeli a környezetét; gyilkosként max 1 szemtanút kockáztat.
- **Nehéz:** gyilkosként csak tanúk nélkül öl, utána elmenekül a helyszínről, a tanácsban terel és visszavádol.

## Felépítés

- `server/server.js` — Express + Socket.IO, szobák, lobby, pályaválasztás
- `server/game.js` — játéklogika: körök, gyilkosság, jelentés, tanács, győzelem
- `server/bots.js` — bot AI: útkeresés, vadászat, szemtanú-emlékek, chat, szavazás
- `server/maps.js` — a két pálya (termek, folyosók, feladatpontok, navigációs gráf)
- `server/characters.js` — GoT karakterek (az anapioficeandfire.com adatain alapuló beépített lista)
- `public/gfx.js` — procedurális grafika: kőpadló-textúrák, terem-díszletek, fáklya/láva/víz effektek, karakter-sprite-ok
- `public/` — frontend: canvas-renderelés, HUD, tanács UI, chat
- `visual.test.js` — fejlesztői eszköz: headless Edge-dzsel képernyőképeket készít a játékról (`node visual.test.js`, futó szerver mellett)

Ha játék közben valaki kilép, a helyét automatikusan egy közepes bot veszi át. Halottként szellem-nézetben az egész pályát látod.
