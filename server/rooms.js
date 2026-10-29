const crypto = require('node:crypto');
const game = require('../site/game.js');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 300;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function cleanName(name) {
  if (typeof name !== 'string') throw httpError(400, 'Name must be a string');
  const trimmed = name.trim().slice(0, 20).trim();
  if (!trimmed) throw httpError(400, 'Name cannot be empty');
  return trimmed;
}

function createRoomStore(options = {}) {
  const rng = options.rng;
  const now = options.now || (() => Date.now());
  const farkleDelay = options.farkleDelayMs === undefined ? 6000 : options.farkleDelayMs;
  const rooms = new Map();

  function generateCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    } while (rooms.has(code));
    return code;
  }

  function getRoom(code) {
    const room = typeof code === 'string' ? rooms.get(code.toUpperCase()) : null;
    if (!room) throw httpError(404, 'Room not found');
    return room;
  }

  function notify(room) {
    for (const sub of room.subscribers) {
      try { sub(); } catch { /* a dead stream must not stop the rest */ }
    }
  }

  const newToken = () => crypto.randomBytes(16).toString('hex');

  function create(name) {
    const validName = cleanName(name);
    if (rooms.size >= MAX_ROOMS) throw httpError(503, 'Too many rooms right now. Try again later.');
    const code = generateCode();
    const token = newToken();
    rooms.set(code, { code, phase: 'lobby', players: [{ name: validName, token, watch: newToken() }], game: null, lastActivity: now(), subscribers: new Set(), timer: null });
    return { code, token, watch: rooms.get(code).players[0].watch };
  }

  function join(code, name) {
    const room = getRoom(code);
    if (room.phase !== 'lobby') throw httpError(409, 'Cannot join game in progress');
    if (room.players.length >= 4) throw httpError(409, 'Room is full');
    const token = newToken();
    const watch = newToken();
    room.players.push({ name: cleanName(name), token, watch });
    room.lastActivity = now();
    notify(room);
    return { token, watch };
  }

  function playerIndex(room, token) {
    const i = room.players.findIndex(p => p.token === token);
    if (i === -1) throw httpError(403, 'Invalid token');
    return i;
  }

  function start(code, token) {
    const room = getRoom(code);
    if (playerIndex(room, token) !== 0) throw httpError(403, 'Only the host can start the game');
    if (room.phase !== 'lobby') throw httpError(409, 'Game already started');
    if (room.players.length < 2) throw httpError(409, 'Need at least 2 players to start');
    room.phase = 'playing';
    room.game = game.newGame(room.players.map(p => p.name));
    room.lastActivity = now();
    notify(room);
  }

  // After a farkle the next player starts on its own, so a player who left cannot stall the room.
  function scheduleFarkleClear(room) {
    clearTimeout(room.timer);
    if (farkleDelay === null) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      if (room.game && room.game.phase === 'farkled') {
        game.nextAfterFarkle(room.game);
        room.lastActivity = now();
        notify(room);
      }
    }, farkleDelay);
    room.timer.unref();
  }

  function act(code, token, action) {
    const room = getRoom(code);
    const idx = playerIndex(room, token);
    if (room.phase !== 'playing') throw httpError(409, 'Game is not in playing phase');
    if (idx !== room.game.current) throw httpError(409, 'Not your turn');
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw httpError(400, 'Malformed action');
    const g = room.game;
    try {
      switch (action.type) {
        case 'roll':
          game.roll(g, rng);
          if (g.phase === 'farkled') scheduleFarkleClear(room);
          break;
        case 'select':
          if (!Number.isInteger(action.index)) throw new Error('Invalid die index');
          game.toggle(g, action.index);
          break;
        case 'keep':                                    // keep the selected dice and roll the rest
          game.lock(g);
          game.roll(g, rng);
          if (g.phase === 'farkled') scheduleFarkleClear(room);
          break;
        case 'bank':
          game.bank(g);
          break;
        case 'next':
          game.nextAfterFarkle(g);
          break;
        default:
          throw new Error('Unknown action type');
      }
    } catch (err) {
      throw httpError(400, err.message);
    }
    if (game.isOver(g)) room.phase = 'over';
    room.lastActivity = now();
    notify(room);
  }

  // The event stream goes in a URL, so it takes a read-only `watch` token; only `token` can act.
  function view(code, watch) {
    const room = getRoom(code);
    const idx = room.players.findIndex(p => p.watch === watch);
    if (idx === -1) throw httpError(403, 'Invalid token');
    return {
      code: room.code,
      phase: room.phase,
      players: room.players.map(p => ({ name: p.name })),
      you: idx,
      host: idx === 0,
      game: room.game ? JSON.parse(JSON.stringify(room.game)) : null
    };
  }

  function subscribe(code, fn) {
    const room = getRoom(code);
    room.subscribers.add(fn);
    return () => { room.subscribers.delete(fn); };
  }

  function sweep() {
    const t = now();
    for (const [code, room] of rooms) {
      const idle = t - room.lastActivity;
      if (idle > 2 * 60 * 60 * 1000 || (room.phase === 'lobby' && idle > 30 * 60 * 1000)) {
        clearTimeout(room.timer);
        rooms.delete(code);
      }
    }
  }

  return { create, join, start, act, view, subscribe, sweep };
}

module.exports = { createRoomStore };
