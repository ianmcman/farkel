const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoomStore } = require('../server/rooms.js');

const seq = vals => { let i = 0; return () => (vals[i++ % vals.length] - 1) / 6 + 0.01; };

function room(rng, opts = {}) {
  const s = createRoomStore({ rng, farkleDelayMs: null, ...opts });
  const a = s.create('Ann');
  const b = s.join(a.code, 'Bob');
  s.start(a.code, a.token);
  return { s, code: a.code, A: a.token, B: b.token };
}

test('only the host starts, and needs two players', () => {
  const s = createRoomStore();
  const a = s.create('Ann');
  assert.throws(() => s.start(a.code, a.token), /at least 2/);
  const b = s.join(a.code, 'Bob');
  assert.throws(() => s.start(a.code, b.token), /host/);
  s.start(a.code, a.token);
  assert.throws(() => s.join(a.code, 'Cy'), /in progress/);
});

test('room holds four players', () => {
  const s = createRoomStore();
  const a = s.create('A');
  ['B', 'C', 'D'].forEach(n => s.join(a.code, n));
  assert.throws(() => s.join(a.code, 'E'), /full/);
});

test('names are trimmed and limited', () => {
  const s = createRoomStore();
  assert.throws(() => s.create('   '), /empty/);
  const a = s.create('  ' + 'x'.repeat(30));
  assert.equal(s.view(a.code, a.token).players[0].name.length, 20);
});

test('turn order is enforced and a full turn banks to the next player', () => {
  const { s, code, A, B } = room(seq([1, 1, 1, 2, 3, 4]));
  assert.throws(() => s.act(code, B, { type: 'roll' }), /Not your turn/);
  s.act(code, A, { type: 'roll' });
  [0, 1, 2].forEach(i => s.act(code, A, { type: 'select', index: i }));
  s.act(code, A, { type: 'bank' });
  const v = s.view(code, B);
  assert.equal(v.game.current, 1);
  assert.equal(v.game.players[0].total, 1000);
  s.act(code, B, { type: 'roll' });
});

test('keep locks the selection and rolls the rest', () => {
  const { s, code, A } = room(seq([1, 5, 2, 3, 4, 6, 2, 2, 2, 6]));
  s.act(code, A, { type: 'roll' });
  s.act(code, A, { type: 'select', index: 0 });
  s.act(code, A, { type: 'keep' });
  const g = s.view(code, A).game;
  assert.equal(g.turnScore, 100);
  assert.deepEqual(g.locked.slice(0, 2), [true, false]);
});

test('a farkle clears itself after the delay', async () => {
  const { s, code, A } = room(seq([2, 3, 4, 6, 2, 3]), { farkleDelayMs: 20 });
  let n = 0;
  s.subscribe(code, () => n++);
  s.act(code, A, { type: 'roll' });
  assert.equal(s.view(code, A).game.phase, 'farkled');
  await new Promise(r => setTimeout(r, 80));
  const g = s.view(code, A).game;
  assert.equal(g.phase, 'roll');
  assert.equal(g.current, 1);
  assert.ok(n >= 2);
});

test('invalid tokens and unknown rooms', () => {
  const { s, code } = room();
  assert.throws(() => s.view(code, 'nope'), /Invalid token/);
  assert.throws(() => s.view('ZZZZ', 'x'), /not found/);
});

test('sweep removes idle rooms', () => {
  let t = 0;
  const s = createRoomStore({ now: () => t });
  const a = s.create('Ann');
  t = 3 * 60 * 60 * 1000;
  s.sweep();
  assert.throws(() => s.view(a.code, a.token), /not found/);
});
