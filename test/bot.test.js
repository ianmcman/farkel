const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../site/game.js');
const B = require('../site/bot.js');

test('bot keeps a triple and a single 1 over a lone 5', () => {
  const g = G.newGame(['Bot']);
  g.dice = [1, 5, 2, 2, 2, 4]; g.phase = 'pick';
  const pick = B.chooseKeep(g);
  assert.deepEqual(pick.sort(), [0, 2, 3, 4]);
});

test('bot always rolls on hot dice and banks big scores with few dice left', () => {
  const g = G.newGame(['Bot']);
  g.players[0].opened = true;
  g.dice = [1, 1, 1, 5, 5, 5]; g.phase = 'pick';
  assert.equal(B.shouldBank(g, [0, 1, 2, 3, 4, 5]), false);
  g.dice = [1, 1, 1, 2, 3, 4]; 
  assert.equal(B.shouldBank(g, [0, 1, 2]), true);
});

test('a full bot game finishes with a winner', () => {
  const g = G.newGame(['Bot', 'Bot2']);
  let steps = 0;
  while (!G.isOver(g) && steps++ < 20000) {
    if (g.phase === 'farkled') { G.nextAfterFarkle(g); continue; }
    G.roll(g);
    while (g.phase === 'pick') {
      const pick = B.chooseKeep(g);
      pick.forEach(i => G.toggle(g, i));
      if (B.shouldBank(g, pick) && G.canBank(g)) { G.bank(g); break; }
      G.lock(g);
      G.roll(g);
    }
  }
  assert.equal(G.isOver(g), true);
  assert.ok(G.winner(g).total >= G.TARGET);
});
