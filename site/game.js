(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./score.js'));
  else root.FarkelGame = factory(root.FarkelScore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  const TARGET = 10000, OPEN = 500, DICE = 6;

  function newGame(names) {
    if (!names || !names.length) throw new Error('Must provide at least one player');
    return {
      players: names.map(name => ({ name, total: 0, opened: false })),
      current: 0,
      dice: new Array(DICE).fill(0),
      locked: new Array(DICE).fill(false),
      sel: new Array(DICE).fill(false),
      turnScore: 0,
      phase: 'roll',          // roll: waiting for a roll; pick: choose scoring dice; farkled: busted, waiting for next; over
      hot: false,             // the last lock used all six dice
      finalFor: null,         // player who crossed the target; everyone else gets one more turn
      lastEvent: null
    };
  }

  const isOver = g => g.phase === 'over';
  const free = g => g.dice.map((v, i) => (g.locked[i] ? null : i)).filter(i => i !== null);

  function roll(g, rng = Math.random) {
    if (g.phase !== 'roll') throw new Error('Cannot roll now');
    if (g.locked.every(Boolean)) g.locked = g.locked.map(() => false);
    for (const i of free(g)) g.dice[i] = Math.floor(rng() * 6) + 1;
    g.sel = g.sel.map(() => false);
    g.hot = false;
    if (!S.hasScoring(free(g).map(i => g.dice[i]))) {
      g.phase = 'farkled';
      g.lastEvent = { type: 'farkle', player: g.current, lost: g.turnScore };
      g.turnScore = 0;
    } else {
      g.phase = 'pick';
    }
    return g;
  }

  function toggle(g, i) {
    if (g.phase !== 'pick') throw new Error('Nothing to pick');
    if (i < 0 || i >= DICE || g.locked[i]) throw new Error('Invalid die');
    g.sel[i] = !g.sel[i];
    return g;
  }

  // Points for the selected dice, or null if nothing is selected or a selected die does not count.
  function selectionScore(g) {
    const vals = g.dice.filter((v, i) => g.sel[i]);
    return S.scoreDice(vals);
  }

  function lock(g) {
    const pts = selectionScore(g);
    if (g.phase !== 'pick' || pts === null) throw new Error('Select scoring dice first');
    g.turnScore += pts;
    g.locked = g.locked.map((l, i) => l || g.sel[i]);
    g.sel = g.sel.map(() => false);
    g.hot = g.locked.every(Boolean);
    g.phase = 'roll';
    return g;
  }

  function canBank(g) {
    if (g.phase !== 'pick' && g.phase !== 'roll') return false;
    if (g.phase === 'roll' && g.turnScore === 0) return false;
    const any = g.sel.some(Boolean);
    const pts = any ? selectionScore(g) : 0;
    if (pts === null) return false;
    const total = g.turnScore + pts;
    if (total <= 0) return false;
    return g.players[g.current].opened || total >= OPEN;
  }

  function bank(g) {
    if (!canBank(g)) throw new Error('Cannot bank');
    if (g.sel.some(Boolean)) lock(g);
    const p = g.players[g.current];
    p.total += g.turnScore;
    p.opened = true;
    g.lastEvent = { type: 'bank', player: g.current, points: g.turnScore };
    if (p.total >= TARGET && g.finalFor === null) g.finalFor = g.current;
    return endTurn(g);
  }

  function endTurn(g) {
    g.turnScore = 0;
    g.locked = g.locked.map(() => false);
    g.sel = g.sel.map(() => false);
    g.dice = g.dice.map(() => 0);
    g.hot = false;
    const next = (g.current + 1) % g.players.length;
    if (g.finalFor !== null && next === g.finalFor) {
      g.phase = 'over';
    } else {
      g.current = next;
      g.phase = 'roll';
    }
    return g;
  }

  function nextAfterFarkle(g) {
    if (g.phase !== 'farkled') throw new Error('No farkle to clear');
    return endTurn(g);
  }

  function winner(g) {
    return g.players.reduce((b, p) => (!b || p.total > b.total ? p : b), null);
  }

  return { TARGET, OPEN, DICE, newGame, roll, toggle, selectionScore, lock, bank, canBank, nextAfterFarkle, isOver, winner };
});
