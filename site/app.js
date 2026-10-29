(function () {
  'use strict';
  const S = window.FarkelScore, G = window.FarkelGame, B = window.FarkelBot;
  const KEY_NAMES = 'farkel_names', KEY_SAVED = 'farkel_saved_game';
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const $ = id => document.getElementById(id);

  let game = null, net = null, rolling = false, botTimer = null, botPhase = 'select', landing = new Set();
  let note = null;                                  // { text, cls } shown in the status line for one render

  const screens = { start: $('screen-start'), online: $('screen-online'), lobby: $('screen-lobby'), game: $('screen-game'), end: $('screen-end') };
  function show(name) { Object.keys(screens).forEach(k => { screens[k].hidden = k !== name; }); }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
  };
  const save = () => (game && !G.isOver(game) ? store.set(KEY_SAVED, game) : store.del(KEY_SAVED));
  const fmt = n => n.toLocaleString('en-US');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Start screen ---
  function renderInputs(names) {
    const box = $('player-inputs');
    box.innerHTML = '';
    names.forEach((name, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      const input = document.createElement('input');
      input.type = 'text'; input.value = name; input.maxLength = 20; input.placeholder = `Player ${i + 1}`;
      input.setAttribute('aria-label', `Player ${i + 1} name`);
      row.appendChild(input);
      if (names.length > 1) {
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn btn-outline'; rm.textContent = '✕';
        rm.setAttribute('aria-label', `Remove player ${i + 1}`);
        rm.addEventListener('click', () => { const v = values(); v.splice(i, 1); renderInputs(v); });
        row.appendChild(rm);
      }
      box.appendChild(row);
    });
    $('btn-add').disabled = names.length >= 4;
  }
  const values = () => [...document.querySelectorAll('#player-inputs input')].map(i => i.value);
  function cleanNames() { return values().map((n, i) => n.trim() || `Player ${i + 1}`).slice(0, 4); }

  function checkResume() {
    const s = store.get(KEY_SAVED);
    const ok = s && Array.isArray(s.players) && s.players.length && s.phase !== 'over';
    $('resume-banner').hidden = !ok;
    if (ok) $('resume-details').textContent = s.players.map(p => `${p.name} ${fmt(p.total)}`).join(', ');
  }

  function start(names, botIndex) {
    game = G.newGame(names);
    if (botIndex !== undefined) game.players[botIndex].bot = true;
    botPhase = 'select'; note = null;
    save(); show('game'); render();
  }

  // --- Rendering ---
  function dieEl(i, g, canPick) {
    const v = g.dice[i];
    if (!v) { const s = document.createElement('div'); s.className = 'slot'; return s; }
    const b = document.createElement('button');
    b.type = 'button';
    const kept = g.locked[i], sel = g.sel[i];
    b.className = 'die' + (kept ? ' kept' : '') + (sel ? ' sel' : '') + (g.phase === 'farkled' && !rolling ? ' dead' : '') +
      (rolling && !kept ? ' rolling' : '') + (landing.has(i) ? ' land' : '');
    b.dataset.index = i;
    b.setAttribute('aria-label', `Die ${i + 1}: ${v}${kept ? ', kept' : sel ? ', selected' : ''}`);
    b.setAttribute('aria-pressed', sel ? 'true' : 'false');
    b.disabled = !canPick || kept;
    PIPS[v] && [0, 1, 2, 3, 4, 5, 6, 7, 8].forEach(p => {
      const pip = document.createElement('span');
      pip.className = 'pip ' + (PIPS[v].includes(p) ? 'pip-on' : 'pip-off');
      b.appendChild(pip);
    });
    if (canPick && !kept) b.addEventListener('click', () => {
      if (net) { net.send({ type: 'select', index: i }); return; }
      note = null; G.toggle(game, i); save(); render();
    });
    return b;
  }

  function render() {
    const g = game;
    if (!g) return;
    const cur = g.players[g.current], isBot = !net && Boolean(cur.bot);
    const myTurn = net ? net.you === g.current : !isBot;
    const canPick = myTurn && g.phase === 'pick' && !rolling;
    const farkled = g.phase === 'farkled' && !rolling;

    const sb = $('scoreboard');
    sb.innerHTML = '';
    g.players.forEach((p, i) => {
      const c = document.createElement('div');
      c.className = 'chip' + (i === g.current ? ' turn' : '');
      const n = document.createElement('span'); n.className = 'chip-name'; n.textContent = p.name;
      const t = document.createElement('span'); t.className = 'chip-total'; t.textContent = fmt(p.total);
      c.append(n, t);
      if (!p.opened) { const o = document.createElement('span'); o.className = 'chip-off'; o.textContent = `needs ${G.OPEN}`; c.appendChild(o); }
      sb.appendChild(c);
    });

    const sel = g.sel.some(Boolean) ? G.selectionScore(g) : 0;
    $('turn-score').textContent = fmt(g.turnScore + (sel || 0));

    const dice = $('dice');
    dice.innerHTML = '';
    dice.classList.toggle('busted', farkled);
    for (let i = 0; i < G.DICE; i++) dice.appendChild(dieEl(i, g, canPick));

    // status line
    const st = $('status');
    let text = '', cls = '';
    if (note && !rolling) { text = note.text; cls = note.cls; }
    else if (farkled) { text = `Farkel! ${g.players[g.lastEvent.player].name} loses ${fmt(g.lastEvent.lost)} points.`; cls = 'bad'; }
    else if (!myTurn && g.phase !== 'farkled') text = `${cur.name} is playing…`;
    else if (g.phase === 'roll') text = `${lastLine(g)}${cur.name}, roll to start your turn.`;
    else if (rolling) text = '';
    else if (!g.sel.some(Boolean)) text = 'Tap the dice that score.';
    else if (sel === null) text = 'Every selected die has to score.';
    else if (!cur.opened && g.turnScore + sel < G.OPEN) text = `Need ${G.OPEN} in one turn to get on the board.`;
    st.textContent = text; st.className = 'status ' + cls;

    // buttons
    const roll = $('btn-roll'), bank = $('btn-bank');
    roll.classList.remove('wide'); bank.hidden = false; bank.classList.remove('btn-bank-ready');
    if (farkled || (g.phase === 'farkled' && rolling)) {
      roll.textContent = 'Next player'; roll.disabled = !myTurn || rolling; bank.hidden = true; roll.classList.add('wide');
    } else if (g.phase === 'roll') {
      roll.textContent = 'Roll'; roll.disabled = !myTurn || rolling; bank.hidden = true; roll.classList.add('wide');
    } else {
      const again = sel !== null && sel > 0;
      roll.replaceChildren(document.createTextNode(g.locked.filter(Boolean).length + (again ? g.sel.filter(Boolean).length : 0) === G.DICE ? 'Hot dice! Roll 6' : 'Roll again'));
      if (again) { const s = document.createElement('small'); s.textContent = `keep ${g.sel.filter(Boolean).length}`; roll.appendChild(s); }
      roll.disabled = !myTurn || rolling || !again;
      const can = myTurn && !rolling && G.canBank(g);
      bank.replaceChildren(document.createTextNode('Bank'));
      if (can) { const s = document.createElement('small'); s.textContent = fmt(g.turnScore + sel); bank.appendChild(s); bank.classList.add('btn-bank-ready'); }
      bank.disabled = !can;
    }
    maybeBot();
  }

  // The result of the previous turn, shown while the next player has not rolled yet.
  function lastLine(g) {
    const e = g.lastEvent;
    if (!e || g.dice.some(Boolean)) return '';
    const who = g.players[e.player].name;
    return e.type === 'bank' ? `${who} banked ${fmt(e.points)}. ` : `${who} farkeled and lost ${fmt(e.lost)}. `;
  }

  // --- Actions ---
  // Rolls the game dice, then tumbles the free ones and settles them left to right.
  function animateRoll(done) {
    const was = game.locked.every(Boolean) ? [0, 1, 2, 3, 4, 5] : game.locked.map((l, i) => (l ? -1 : i)).filter(i => i >= 0);
    G.roll(game);
    save();
    playRoll(was, done);
  }

  // The tumble: the dice in `was` spin, then settle left to right on the values already in `game`.
  function playRoll(was, done) {
    if (reduced()) { render(); if (done) done(); return; }
    rolling = true;
    render();
    const stopAt = {};
    was.forEach((d, n) => { stopAt[d] = 450 + n * 90; });
    const start = Date.now();
    const tick = () => {
      const t = Date.now() - start;
      document.querySelectorAll('#dice .die').forEach(btn => {
        const i = Number(btn.dataset.index);
        if (!(i in stopAt)) return;
        if (t >= stopAt[i]) {
          if (btn.classList.contains('rolling')) { btn.classList.remove('rolling'); face(btn, game.dice[i]); }
        } else face(btn, Math.floor(Math.random() * 6) + 1);
      });
    };
    tick();
    const iv = setInterval(tick, 70);
    setTimeout(() => {
      clearInterval(iv); rolling = false; landing = new Set(was); render(); landing = new Set();
      if (done) done();
    }, 450 + was.length * 90 + 60);
  }
  function face(btn, v) {
    btn.querySelectorAll('.pip').forEach((pip, p) => { pip.className = 'pip ' + (PIPS[v].includes(p) ? 'pip-on' : 'pip-off'); });
  }

  function keepAndRoll() {
    if (net) { net.send({ type: 'keep' }); return; }
    G.lock(game);
    if (game.hot) note = { text: 'Hot dice! Six fresh dice.', cls: 'good' };
    animateRoll();
  }
  function bankNow() {
    if (net) { net.send({ type: 'bank' }); return; }
    G.bank(game);
    save();
    if (G.isOver(game)) { store.del(KEY_SAVED); endScreen(); return; }
    render();
  }

  $('btn-roll').addEventListener('click', () => {
    if (!game || rolling) return;
    note = null;
    if (net) { net.send({ type: game.phase === 'farkled' ? 'next' : 'roll' }); return; }
    if (game.phase === 'farkled') { G.nextAfterFarkle(game); save(); if (G.isOver(game)) endScreen(); else render(); }
    else if (game.phase === 'roll') animateRoll();
    else if (game.phase === 'pick') keepAndRoll();
  });
  $('btn-bank').addEventListener('click', () => { if (game && !rolling && (net || G.canBank(game))) bankNow(); });

  // --- Bot ---
  function maybeBot() {
    if (net || botTimer || rolling || !game || screens.game.hidden || game.phase === 'over' || !game.players[game.current].bot) return;
    const ref = game;
    botTimer = setTimeout(() => {
      botTimer = null;
      if (game === ref && !screens.game.hidden) botStep();
    }, game.phase === 'farkled' ? 1600 : 800);
  }
  function botStep() {
    const g = game;
    note = null;
    if (g.phase === 'farkled') { G.nextAfterFarkle(g); save(); if (G.isOver(g)) endScreen(); else render(); return; }
    if (g.phase === 'roll') { botPhase = 'select'; animateRoll(); return; }
    if (botPhase === 'select') {
      botPick = B.chooseKeep(g);
      botPick.forEach(i => G.toggle(g, i));
      botPhase = 'act';
      render();
    } else {
      botPhase = 'select';
      const pick = botPick;
      if (B.shouldBank(g, pick) && G.canBank(g)) bankNow();
      else keepAndRoll();
    }
  }
  let botPick = [];

  // --- End ---
  function endScreen() {
    const online = Boolean(net);
    $('btn-again').hidden = online;
    $('btn-setup').hidden = online;
    $('btn-leave-end').hidden = !online;
    const sorted = [...game.players].sort((a, b) => b.total - a.total);
    $('winner-text').textContent = `${G.winner(game).name} wins!`;
    const body = $('standings');
    body.innerHTML = '';
    sorted.forEach((p, i) => {
      const tr = document.createElement('tr');
      [String(i + 1), p.name, fmt(p.total)].forEach(t => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      body.appendChild(tr);
    });
    show('end');
  }

  // --- Wiring ---
  $('btn-add').addEventListener('click', () => { const v = values(); if (v.length < 4) { v.push(`Player ${v.length + 1}`); renderInputs(v); } });
  $('setup-form').addEventListener('submit', e => { e.preventDefault(); const n = cleanNames(); store.set(KEY_NAMES, n); start(n); });
  $('btn-bot').addEventListener('click', () => {
    const name = (values()[0] || '').trim() || 'Player 1';
    store.set(KEY_NAMES, [name]);
    start([name, 'Bot'], 1);
  });
  $('btn-resume').addEventListener('click', () => {
    const s = store.get(KEY_SAVED);
    if (s && s.phase !== 'over') { game = s; botPhase = 'select'; show('game'); render(); }
  });
  $('btn-discard').addEventListener('click', () => { store.del(KEY_SAVED); $('resume-banner').hidden = true; });
  const dlg = (d, open) => { if (open) { if (d.showModal) d.showModal(); else d.hidden = false; } else if (d.close) d.close(); else d.hidden = true; };
  $('btn-rules').addEventListener('click', () => dlg($('rules-dialog'), true));
  $('btn-rules-start').addEventListener('click', () => dlg($('rules-dialog'), true));
  $('btn-close-rules').addEventListener('click', () => dlg($('rules-dialog'), false));
  $('btn-menu').addEventListener('click', () => dlg($('menu-dialog'), true));
  $('btn-close-menu').addEventListener('click', () => dlg($('menu-dialog'), false));
  $('btn-quit').addEventListener('click', () => {
    dlg($('menu-dialog'), false);
    if (net) { if (confirm('Leave this online room?')) net.leave(); return; }
    if (confirm('Leave this game and return to setup?')) { renderInputs(store.get(KEY_NAMES) || ['Player 1']); checkResume(); show('start'); }
  });
  $('btn-again').addEventListener('click', () => {
    const bot = game.players.findIndex(p => p.bot);
    start(game.players.map(p => p.name), bot >= 0 ? bot : undefined);
  });
  $('btn-leave-end').addEventListener('click', () => { if (net) net.leave(); });
  $('btn-setup').addEventListener('click', () => { renderInputs(store.get(KEY_NAMES) || ['Player 1']); checkResume(); show('start'); });

  // --- Online (driven by online.js) ---
  // Which dice just rolled, judged from the previous and the new server state.
  function rolledDice(prev, g) {
    if (!prev || g.phase === 'roll' || g.phase === 'over') return [];
    const free = g.locked.map((l, i) => (l ? -1 : i)).filter(i => i >= 0);
    if (prev.phase === 'roll') return free;
    if (prev.phase === 'pick' && prev.current === g.current && g.locked.filter(Boolean).length !== prev.locked.filter(Boolean).length) return free;
    return [];
  }

  window.FarkelApp = {
    showScreen(name) { show(name); },
    enterOnline(view, send, leave) {
      const prev = net ? game : null;
      net = { send, leave, you: view.you };
      game = view.game;
      if (view.phase === 'over') { endScreen(); return; }
      show('game');
      const was = rolledDice(prev, game);
      if (was.length) playRoll(was); else render();
    },
    exitOnline() { net = null; game = null; rolling = false; },
    leave() { if (net) net.leave(); },
    status(text) { note = { text, cls: 'bad' }; if (game) render(); }
  };

  const saved = store.get(KEY_NAMES);
  renderInputs(Array.isArray(saved) && saved.length && saved.length <= 4 ? saved : ['Player 1']);
  checkResume();
  show('start');
})();
