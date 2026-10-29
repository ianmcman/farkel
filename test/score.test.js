const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreDice, hasScoring } = require('../site/score.js');

test('singles and triples', () => {
  assert.equal(scoreDice([1]), 100);
  assert.equal(scoreDice([5]), 50);
  assert.equal(scoreDice([1, 5]), 150);
  assert.equal(scoreDice([2, 2, 2]), 200);
  assert.equal(scoreDice([6, 6, 6]), 600);
  assert.equal(scoreDice([1, 1, 1]), 1000);
  assert.equal(scoreDice([5, 5, 5]), 500);
  assert.equal(scoreDice([3, 3, 3, 1]), 400);
});

test('four, five and six of a kind', () => {
  assert.equal(scoreDice([4, 4, 4, 4]), 1000);
  assert.equal(scoreDice([4, 4, 4, 4, 4]), 2000);
  assert.equal(scoreDice([2, 2, 2, 2, 2, 2]), 3000);
  assert.equal(scoreDice([1, 1, 1, 1]), 1100);
  assert.equal(scoreDice([5, 5, 5, 5]), 1000);
});

test('special six-dice hands', () => {
  assert.equal(scoreDice([1, 2, 3, 4, 5, 6]), 1500);
  assert.equal(scoreDice([2, 2, 3, 3, 4, 4]), 1500);
  assert.equal(scoreDice([2, 2, 2, 2, 3, 3]), 1500);
  assert.equal(scoreDice([2, 2, 2, 3, 3, 3]), 2500);
});

test('a non-scoring die makes the selection invalid', () => {
  assert.equal(scoreDice([2, 3]), null);
  assert.equal(scoreDice([1, 2]), null);
  assert.equal(scoreDice([2, 2, 1]), null);
  assert.equal(scoreDice([]), null);
});

test('hasScoring', () => {
  assert.equal(hasScoring([2, 3, 4, 6, 2, 3]), false);
  assert.equal(hasScoring([2, 3, 4, 6, 2, 5]), true);
  assert.equal(hasScoring([3, 3, 3, 2]), true);
  assert.equal(hasScoring([2, 2, 3, 3, 4, 4]), true);
  assert.equal(hasScoring([2, 2, 3, 3]), false);
});
