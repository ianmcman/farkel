(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FarkelScore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Points for a set of dice in which every die must count, or null if any die does not.
  // Three of a kind: 1s are 1000, other faces are face x 100. Four, five and six of a kind: 1000, 2000, 3000.
  // 1-2-3-4-5-6 and three pairs: 1500. Four of a kind plus a pair: 1500. Two triples: 2500.
  const KIND = { 4: 1000, 5: 2000, 6: 3000 };

  function faceScore(face, c) {
    if (c === 0) return 0;
    if (face === 1) {
      if (c < 3) return c * 100;
      return c === 3 ? 1000 : Math.max(KIND[c], 1000 + (c - 3) * 100);
    }
    if (face === 5) {
      if (c < 3) return c * 50;
      return c === 3 ? 500 : Math.max(KIND[c], 500 + (c - 3) * 50);
    }
    if (c < 3) return null;
    return c === 3 ? face * 100 : KIND[c];
  }

  function counts(dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) c[d]++;
    return c;
  }

  function scoreDice(dice) {
    if (!dice.length) return null;
    const c = counts(dice);
    let generic = 0;
    for (let f = 1; f <= 6; f++) {
      const s = faceScore(f, c[f]);
      if (s === null) { generic = null; break; }
      generic += s;
    }
    let best = generic;
    if (dice.length === 6) {
      const nz = c.slice(1).filter(Boolean).sort().join('');
      let special = null;
      if (nz === '111111') special = 1500;
      else if (nz === '222') special = 1500;
      else if (nz === '24') special = 1500;
      else if (nz === '33') special = 2500;
      if (special !== null && (best === null || special > best)) best = special;
    }
    return best;
  }

  // True if at least one scoring subset exists among these dice.
  function hasScoring(dice) {
    const c = counts(dice);
    if (c[1] || c[5]) return true;
    for (let f = 2; f <= 6; f++) if (c[f] >= 3) return true;
    return dice.length === 6 && scoreDice(dice) !== null;
  }

  return { scoreDice, hasScoring };
});
