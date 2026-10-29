# Farkel

Farkel for phones and desktops. Hot-seat for 1 to 4 players, against a bot, or online in a room with a four-letter code. No accounts, no database, no dependencies.

Live at https://farkel.ianmcmanus.net

## Rules

- Roll six dice and tap the ones that score, then roll the rest or bank the points.
- 1 is 100, 5 is 50. Three of a kind is the face x 100 (three 1s: 1000). Four, five, six of a kind: 1000, 2000, 3000.
- 1-2-3-4-5-6, three pairs, or four of a kind plus a pair: 1500. Two triples: 2500.
- A roll with nothing that scores is a Farkel: the turn's points are lost.
- Score with all six dice for hot dice and roll all six again.
- You need 500 in a single turn to get on the board. The first player past 10,000 gives everyone else one last turn.

## Online play

Create a room, share the code or the invite link, and the host starts the game once 2 to 4 players are in. The server owns the dice and enforces turns; clients send actions (`roll`, `select`, `keep`, `bank`, `next`) and receive the full state over Server-Sent Events. Each player has a random token that never appears in any state. Rooms live in memory, expire after two hours idle, and are lost on restart. After a Farkel the next player starts on its own after six seconds.

| Route | Purpose |
| --- | --- |
| `POST /api/rooms` | Create a room. Returns `{ code, token }`. |
| `POST /api/rooms/:code/join` | Join a room. Returns `{ token }`. |
| `POST /api/rooms/:code/start` | Host starts the game (`x-token` header). |
| `POST /api/rooms/:code/act` | Play an action (`x-token` header). |
| `GET /api/rooms/:code/events?token=` | Event stream of the player's view. |
| `GET /healthz` | Returns `ok`. |

Behind a reverse proxy, turn off response buffering for the event stream (`proxy_buffering off`).

## Run it

Node 22 or newer, nothing to install.

```bash
npm start
```

Serves on http://localhost:8080 (`PORT` changes it). With Docker:

```bash
docker build -t farkel .
docker run -p 8080:8080 farkel
```

## Tests

```bash
npm test
```

## Structure

| Path | What it does |
| --- | --- |
| `site/score.js` | Scoring for a set of dice, and whether a roll has anything that scores. |
| `site/game.js` | Turn state: roll, select, lock, bank, farkle, last round. Pure functions. |
| `site/bot.js` | Bot: keeps the scoring dice worth the most and banks by dice left. |
| `site/app.js` | Screens, dice animation, bot driver. |
| `site/sw.js`, `site/manifest.webmanifest` | Installable PWA; the game works offline. |
| `site/online.js` | Online client: lobby, invite link, event stream, reconnect. |
| `server/rooms.js` | In-memory room store; runs `game.js` as the referee. |
| `server/server.js` | Static files, room API, event stream, CSP and `/healthz`. |

The page is a PWA. Bump `CACHE` in `site/sw.js` on every deploy that changes static files.
