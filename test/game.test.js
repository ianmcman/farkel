const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../site/game.js');

const seq = vals => { let i = 0; return () => (vals[i++] - 1) / 6 + 0.01; };

function setup(vals, names = ['A', 'B']) {
  const g = G.newGame(names);
  G.roll(g, seq(vals));
  return g;
}

test('a roll with nothing scoring is a farkle that loses the turn score', () => {
  const g = G.newGame(['A', 'B']);
  g.turnScore = 700;
  G.roll(g, seq([2, 3, 4, 6, 2, 3]));
  assert.equal(g.phase, 'farkled');
  assert.equal(g.turnScore, 0);
  G.nextAfterFarkle(g);
  assert.equal(g.current, 1);
  assert.equal(g.phase, 'roll');
});

test('select, lock and roll the rest', () => {
  const g = setup([1, 5, 2, 3, 4, 6]);
  assert.equal(g.phase, 'pick');
  G.toggle(g, 2);
  assert.equal(G.selectionScore(g), null);
  G.toggle(g, 2);
  G.toggle(g, 0);
  assert.equal(G.selectionScore(g), 100);
  G.lock(g);
  assert.equal(g.turnScore, 100);
  assert.deepEqual(g.locked, [true, false, false, false, false, false]);
  G.roll(g, seq([1, 1, 2, 3, 4]));
  assert.equal(g.dice[0], 1);                       // the locked die is not rerolled
});

test('using all six dice gives hot dice: six fresh dice', () => {
  const g = setup([1, 1, 1, 5, 5, 5]);
  [0, 1, 2, 3, 4, 5].forEach(i => G.toggle(g, i));
  assert.equal(G.selectionScore(g), 2500);
  G.lock(g);
  assert.equal(g.hot, true);
  G.roll(g, seq([2, 3, 4, 6, 2, 3]));
  assert.equal(g.turnScore, 0);                     // a farkle on the fresh six wipes the turn
  assert.equal(g.phase, 'farkled');
});

test('the first bank needs 500', () => {
  const g = setup([1, 5, 2, 3, 4, 6]);
  G.toggle(g, 0);
  assert.equal(G.canBank(g), false);
  const h = setup([1, 1, 1, 2, 3, 4]);
  [0, 1, 2].forEach(i => G.toggle(h, i));
  assert.equal(G.canBank(h), true);
  G.bank(h);
  assert.equal(h.players[0].total, 1000);
  assert.equal(h.current, 1);
});

test('crossing 10000 gives everyone else one last turn', () => {
  const g = G.newGame(['A', 'B', 'C']);
  g.players.forEach(p => { p.opened = true; });
  g.players[1].total = 9800;
  g.current = 1;
  G.roll(g, seq([1, 1, 2, 3, 4, 6]));
  [0, 1].forEach(i => G.toggle(g, i));
  G.bank(g);
  assert.equal(g.players[1].total, 10000);
  assert.equal(g.finalFor, 1);
  assert.equal(g.current, 2);
  G.roll(g, seq([5, 2, 3, 4, 6, 6]));
  G.toggle(g, 0);
  G.bank(g);
  assert.equal(g.current, 0);
  G.roll(g, seq([5, 2, 3, 4, 6, 6]));
  G.toggle(g, 0);
  G.bank(g);
  assert.equal(G.isOver(g), true);
  assert.equal(G.winner(g).name, 'B');
});

test('cannot bank a selection that includes a dead die', () => {
  const g = setup([1, 5, 2, 3, 4, 6]);
  G.toggle(g, 0); G.toggle(g, 2);
  assert.equal(G.canBank(g), false);
  assert.throws(() => G.bank(g));
});
