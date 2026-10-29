(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./score.js'), require('./game.js'));
  else root.FarkelBot = factory(root.FarkelScore, root.FarkelGame);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, G) {
  // Which dice to keep: the scoring subset that is worth the most once the dice left to roll are counted.
  function chooseKeep(g) {
    const idx = g.dice.map((v, i) => (g.locked[i] ? null : i)).filter(i => i !== null);
    let best = null, bv = -Infinity;
    for (let m = 1; m < (1 << idx.length); m++) {
      const pick = idx.filter((_, b) => (m >> b) & 1);
      const pts = S.scoreDice(pick.map(i => g.dice[i]));
      if (pts === null) continue;
      const left = idx.length - pick.length;
      const v = pts + (left === 0 ? 400 : left * 60);
      if (v > bv) { bv = v; best = pick; }
    }
    return best;
  }

  // After keeping `pick`, should the bot bank?
  function shouldBank(g, pick) {
    const pts = S.scoreDice(pick.map(i => g.dice[i]));
    const left = g.dice.filter((v, i) => !g.locked[i]).length - pick.length;
    const total = g.turnScore + pts;
    const p = g.players[g.current];
    if (left === 0) return false;                       // hot dice: roll six more
    if (!p.opened && total < G.OPEN) return false;
    if (g.finalFor !== null) {                          // last turn: keep going until in the lead
      const lead = Math.max(...g.players.map((q, i) => (i === g.current ? 0 : q.total)));
      return p.total + total > lead && left <= 3 ? true : p.total + total > lead + 1500;
    }
    const need = { 1: 300, 2: 350, 3: 450, 4: 700, 5: 1500 }[left];
    return total >= need;
  }

  return { chooseKeep, shouldBank };
});
