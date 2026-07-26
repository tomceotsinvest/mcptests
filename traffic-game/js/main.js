/* ============ GRIDLOCK — game bootstrap, campaign, loop & saves ============ */
'use strict';
(function (TG) {
  const { M, fmt } = TG;
  const $ = (id) => document.getElementById(id);

  /* ================= CAMPAIGN ================= */
  const CAMPAIGN = [
    {
      id: 'village', name: 'Millbrook Village', desc: 'A sleepy village with one clogged crossroads. Learn the basics.',
      gen: { style: 'suburb', size: 'village', seed: 11, population: 3500, motorway: false, rail: false, riverEnabled: false },
      budget: 120000,
      objectives: [
        { id: 'cong', desc: 'Keep congestion below 30%', check: s => s.stats.avgCongestion < 0.3, hold: true },
        { id: 'score', desc: 'Reach a score of 500', check: s => s.score >= 500 },
        { id: 'day', desc: 'Survive 2 full days', check: s => s.day >= 3 }
      ],
      tutorial: true
    },
    {
      id: 'suburb', name: 'Ashford Meadows', desc: 'A suburban town where everyone drives to the same office park.',
      gen: { style: 'suburb', size: 'small', seed: 23, population: 9000, motorway: false },
      budget: 220000,
      objectives: [
        { id: 'cong', desc: 'Keep congestion below 30%', check: s => s.stats.avgCongestion < 0.3, hold: true },
        { id: 'transit', desc: 'Open a public transport line', check: s => s.transit.lines.length >= 1 },
        { id: 'score', desc: 'Reach a score of 600', check: s => s.score >= 600 }
      ]
    },
    {
      id: 'dense', name: 'Carlton City', desc: 'A dense grid city. Rush hour is a wall of red.',
      gen: { style: 'grid', size: 'medium', seed: 37, population: 22000 },
      budget: 400000,
      objectives: [
        { id: 'cong', desc: 'Congestion below 35% at rush hour', check: s => s.stats.avgCongestion < 0.35, hold: true },
        { id: 'transit', desc: '12% of trips by green transport', check: s => s.stats.tripsTotal > 200 && (s.stats.transitTrips + s.stats.bikeTrips + s.stats.walkTrips) / s.stats.tripsTotal >= 0.12 },
        { id: 'score', desc: 'Reach a score of 650', check: s => s.score >= 650 }
      ]
    },
    {
      id: 'historic', name: 'Old Thornbury', desc: 'A historic European city — narrow, tangled streets that cannot all be widened.',
      gen: { style: 'organic', size: 'medium', seed: 53, population: 20000, motorway: false },
      budget: 350000,
      objectives: [
        { id: 'ped', desc: 'Pedestrianise 3 streets', check: s => [...s.net.roads.values()].filter(r => r.ped).length >= 3 },
        { id: 'cong', desc: 'Keep congestion below 35%', check: s => s.stats.avgCongestion < 0.35, hold: true },
        { id: 'score', desc: 'Reach a score of 650', check: s => s.score >= 650 }
      ]
    },
    {
      id: 'amgrid', name: 'New Grantham', desc: 'A large American-style grid with a motorway that dumps traffic downtown.',
      gen: { style: 'grid', size: 'large', seed: 71, population: 32000 },
      budget: 500000,
      objectives: [
        { id: 'speed', desc: 'Average network speed above 25 km/h', check: s => s.stats.avgSpeedNow > 6.95, hold: true },
        { id: 'transit', desc: 'Carry 500 transit trips', check: s => s.stats.transitTrips >= 500 },
        { id: 'score', desc: 'Reach a score of 700', check: s => s.score >= 700 }
      ]
    },
    {
      id: 'mountain', name: 'High Redcliff', desc: 'A mountain city. Rock walls squeeze all traffic through a few passes.',
      gen: { style: 'mountain', size: 'medium', seed: 89, population: 18000, riverEnabled: false },
      budget: 420000,
      objectives: [
        { id: 'cong', desc: 'Keep congestion below 40%', check: s => s.stats.avgCongestion < 0.4, hold: true },
        { id: 'fail', desc: 'Failed trips under 4%', check: s => s.stats.tripsTotal > 300 && s.stats.tripsFailed / s.stats.tripsTotal < 0.04 },
        { id: 'score', desc: 'Reach a score of 700', check: s => s.score >= 700 }
      ]
    },
    {
      id: 'coastal', name: 'Port Silverton', desc: 'A coastal city: half the map is sea, and bridge capacity is everything.',
      gen: { style: 'coastal', size: 'large', seed: 97, population: 30000 },
      budget: 550000,
      objectives: [
        { id: 'cong', desc: 'Keep congestion below 35%', check: s => s.stats.avgCongestion < 0.35, hold: true },
        { id: 'happy', desc: 'Happiness above 70%', check: s => s.stats.happiness > 0.7 },
        { id: 'score', desc: 'Reach a score of 750', check: s => s.score >= 750 }
      ]
    }
  ];

  const ACHIEVEMENTS = {
    firstFix: { icon: '🔧', name: 'First response', desc: 'Make any change to the network.' },
    firstTransit: { icon: '🚌', name: 'Bus spotter', desc: 'Open your first public transport line.' },
    roundabout: { icon: '⭕', name: 'Magic roundabout', desc: 'Build a roundabout.' },
    greenWave: { icon: '🌊', name: 'Green wave', desc: 'Synchronise traffic signals.' },
    flowMaster: { icon: '🟢', name: 'Flow master', desc: 'Congestion below 15% with 300+ vehicles on the road.' },
    modeShift: { icon: '🚲', name: 'Mode shift', desc: '25% of trips by transit, bike or foot.' },
    score800: { icon: '⭐', name: 'City in motion', desc: 'Reach a score of 800.' },
    survivor: { icon: '🌪', name: 'Storm survivor', desc: 'Get through a heavy-rain rush hour without gridlock.' },
    tycoon: { icon: '💰', name: 'Balanced books', desc: 'Hold £1M in the bank.' },
    metroMayor: { icon: '🚇', name: 'Metro mayor', desc: 'Run 3 transit lines at once.' }
  };

  /* ================= GAME ================= */
  const game = {
    running: false,
    city: null, sim: null, renderer: null, tools: null, ui: null,
    level: null, levelIdx: -1,
    objectives: [],
    achievements: {},
    _objHold: {},
    _raf: 0, _lastFrame: 0, _acc: 0, _autosaveAt: 0,
    levelDone: false
  };
  window.game = game;

  for (const [id, a] of Object.entries(ACHIEVEMENTS)) game.achievements[id] = { ...a, unlocked: false };
  try {
    const saved = JSON.parse(localStorage.getItem('gridlock_achievements') || '{}');
    for (const id of Object.keys(saved)) if (game.achievements[id]) game.achievements[id].unlocked = true;
  } catch (e) { /* fresh start */ }

  game.checkAchievement = function (id) {
    const a = game.achievements[id];
    if (!a || a.unlocked) return;
    a.unlocked = true;
    game.ui.toast('🏆 Achievement: ' + a.name, a.desc, 'good');
    const store = {};
    for (const [k, v] of Object.entries(game.achievements)) if (v.unlocked) store[k] = 1;
    try { localStorage.setItem('gridlock_achievements', JSON.stringify(store)); } catch (e) {}
  };

  /* ---------- start with a generated/imported/loaded city ---------- */
  game.start = function (city, opts, simData) {
    game.city = city;
    TG.TransitSystem.resetIds();
    game.sim = TG.Sim(city, opts);
    game.sim.onNotify = (n) => game.ui.toast(n.title, n.body, n.level === 'info' ? 'info' : n.level, n.loc);
    game.sim.onDayEnd = () => { game.recordLeaderboard(); };
    if (simData) game.sim.applyJSON(simData);
    game.renderer.invalidateMinimap();
    game.renderer.selected = null;
    game.renderer.followVehicle = null;
    game.tools.undoStack.length = 0;
    game.tools.redoStack.length = 0;
    game.levelDone = false;
    game._objHold = {};
    game.ui.setLevelName(city.name + (game.level ? ' — ' + game.level.name : ''));
    game.ui.showSandboxTools(!!opts.sandbox);
    game.renderer.resize();
    game.renderer.fitBounds(city.net.bounds);
    $('startScreen').classList.add('hidden');
    game.ui.loading(false);
    game.running = true;
    game.ui.setSpeed(1);
    game._autosaveAt = performance.now() + 120000;
    // pre-warm: spawn some traffic so the city starts alive
    if (!simData) for (let i = 0; i < Math.min(250, city.zones.length * 10); i++) game.sim.spawnTrip();
    if (game.level && game.level.tutorial) startTutorial();
    game.ui.setTip('Toggle the congestion heatmap with H. Red roads are your enemies.');
  };

  game.onNetworkChanged = function () {
    game.renderer.invalidateMinimap();
    game.checkAchievement('firstFix');
  };

  game.restoreSnapshot = function (s) {
    const net = TG.Network.fromJSON(s.net);
    game.city.net = net;
    game.sim.net = net;
    game.sim.budget = s.budget;
    // drop all vehicles (their edges are gone); traffic respawns quickly
    for (const v of game.sim.vehicles) if (v.active) { v.active = false; v.edgeObj = null; v.route = null; v.line = null; }
    game.sim.freeVehicles = game.sim.vehicles.slice();
    game.sim.activeEdges.clear();
    // rebuild transit against the new net
    const tsData = s.transit;
    game.sim.transit = TG.TransitSystem(net);
    game.sim.transit.fromJSON(tsData);
    for (const line of game.sim.transit.lines) line.vehicles = [];
    game.renderer.invalidateMinimap();
    game.renderer.selected = null;
  };

  game.findVehicleAt = function (wx, wy, radius) {
    let best = null, bd = radius * radius;
    for (const e of game.sim.activeEdges) {
      const p0 = e.pts[0];
      if (M.dist2(p0.x, p0.y, wx, wy) > (e.len + radius) * (e.len + radius)) continue;
      for (const v of e.vehicles) {
        const p = M.polyAt(e.pts, M.clamp(v.pos, 0, e.len));
        const d = M.dist2(p.x, p.y, wx, wy);
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best;
  };

  /* ---------- objectives ---------- */
  game.updateObjectives = function () {
    if (!game.level) { game.ui.renderObjectives(null); return; }
    const s = game.sim;
    let allDone = true;
    for (const o of game.objectives) {
      if (o.hold) {
        // must hold true cumulatively for a full sim-day of samples
        const key = o.id;
        if (!game._objHold[key]) game._objHold[key] = { ok: 0, total: 0 };
        const hh = game._objHold[key];
        if (s.day >= 2 || s.time > 9 * 3600) {  // only measure after warm-up
          hh.total++;
          if (o.check(s)) hh.ok++;
        }
        const ratio = hh.total > 40 ? hh.ok / hh.total : 0;
        o.progress = hh.total > 40 ? Math.round(ratio * 100) + '% of the time' : 'measuring…';
        o.done = hh.total > 200 && ratio > 0.8;
      } else {
        // gate one-shot objectives until the first morning rush has been endured
        const warmedUp = s.day >= 2 || s.time > 10 * 3600;
        o.done = o.done || (warmedUp && o.check(s));
      }
      if (!o.done) allDone = false;
    }
    game.ui.renderObjectives(game.objectives);
    if (allDone && !game.levelDone) {
      game.levelDone = true;
      levelComplete();
    }
  };

  function levelComplete() {
    const s = game.sim;
    const stars = s.score >= 850 ? 3 : s.score >= 700 ? 2 : 1;
    saveProgress(game.level.id, stars, s.score);
    game.recordLeaderboard();
    game.ui.showModal(
      '<h2>🎉 Level complete — ' + game.level.name + '</h2>' +
      '<p style="font-size:28px;text-align:center;margin:14px 0;color:var(--accent2)">' + '★'.repeat(stars) + '<span style="opacity:.25">' + '★'.repeat(3 - stars) + '</span></p>' +
      '<p style="text-align:center;font-size:15px">Final score: <b>' + s.score + '</b></p>' +
      '<p style="text-align:center;font-size:12px;color:var(--text-dim)">All objectives met. The next city has been unlocked — or keep optimising this one.</p>' +
      '<div class="modal-actions"><button class="secondary" id="btnKeepPlaying">Keep playing</button><button id="btnNextLevel">Next city →</button></div>');
    $('btnKeepPlaying').addEventListener('click', () => game.ui.closeModal());
    $('btnNextLevel').addEventListener('click', () => {
      game.ui.closeModal();
      const ni = game.levelIdx + 1;
      if (ni < CAMPAIGN.length) game.startCampaignLevel(ni);
      else { game.ui.toast('🏆 Campaign complete!', 'You have untangled every city. Try sandbox or import a real one.', 'good'); }
    });
  }

  function progress() {
    try { return JSON.parse(localStorage.getItem('gridlock_progress') || '{}'); } catch (e) { return {}; }
  }
  function saveProgress(id, stars, score) {
    const p = progress();
    p[id] = { stars: Math.max(stars, (p[id] && p[id].stars) || 0), score: Math.max(score, (p[id] && p[id].score) || 0) };
    try { localStorage.setItem('gridlock_progress', JSON.stringify(p)); } catch (e) {}
  }

  game.leaderboard = function () {
    try { return JSON.parse(localStorage.getItem('gridlock_leaderboard') || '[]'); } catch (e) { return []; }
  };
  game.recordLeaderboard = function () {
    if (!game.sim || game.sim.score < 100) return;
    const lb = game.leaderboard();
    const name = game.city.name + (game.level ? ' (' + game.level.name + ')' : game.sim.sandbox ? ' (sandbox)' : '');
    const existing = lb.find(e => e.name === name);
    if (existing) { existing.score = Math.max(existing.score, game.sim.score); existing.date = new Date().toLocaleDateString(); }
    else lb.push({ name, score: game.sim.score, date: new Date().toLocaleDateString() });
    lb.sort((a, b) => b.score - a.score);
    try { localStorage.setItem('gridlock_leaderboard', JSON.stringify(lb.slice(0, 25))); } catch (e) {}
  };

  /* ---------- starting modes ---------- */
  game.startCampaignLevel = function (idx) {
    const lvl = CAMPAIGN[idx];
    game.level = lvl; game.levelIdx = idx;
    game.objectives = lvl.objectives.map(o => ({ ...o, done: false }));
    game.ui.loading(true, 'Generating ' + lvl.name + '…');
    setTimeout(() => {
      const city = TG.generateCity({ ...lvl.gen });
      city.name = lvl.name;
      game.start(city, { difficulty: $('difficulty').value, budget: lvl.budget, seed: lvl.gen.seed * 7 });
      game.ui.toast('🏙 ' + lvl.name, lvl.desc, 'info');
    }, 30);
  };

  game.startSandbox = function () {
    game.level = null; game.levelIdx = -1;
    game.objectives = [];
    const cfg = {
      style: $('sbxStyle').value, size: $('sbxSize').value,
      seed: +$('sbxSeed').value || 42, population: +$('sbxPop').value
    };
    game.ui.loading(true, 'Generating sandbox city…');
    setTimeout(() => {
      const city = TG.generateCity(cfg);
      game.start(city, { difficulty: $('difficulty').value, sandbox: true, seed: cfg.seed });
    }, 30);
  };

  game.startImport = async function () {
    const query = $('impSearch').value.trim();
    const coordsText = $('impCoords').value.trim();
    const status = $('importStatus');
    const coords = coordsText ? TG.osm.parseCoords(coordsText) : null;
    if (!query && !coords) { status.textContent = 'Enter a place name or coordinates first.'; return; }
    game.level = null; game.levelIdx = -1; game.objectives = [];
    try {
      status.textContent = 'Contacting OpenStreetMap…';
      const city = await TG.osm.importCity({
        query: query || undefined, coords,
        radius: +$('impRadius').value, population: +$('impPop').value,
        onStatus: (t) => { status.textContent = t; }
      });
      status.textContent = '';
      game.start(city, { difficulty: $('difficulty').value, sandbox: false, budget: 400000, seed: 5 });
      game.ui.toast('🌍 ' + city.name, city.net.roads.size + ' real roads imported. Map data © OpenStreetMap contributors.', 'good');
    } catch (err) {
      status.textContent = '❌ ' + (err && err.message ? err.message : 'Import failed') + '\nCheck your connection, or try a smaller radius / different place.';
    }
  };

  /* ---------- saves ---------- */
  const SAVE_KEY = (slot) => 'gridlock_save_' + slot;
  game.saveGame = function (slot) {
    const c = game.city;
    const data = {
      v: 1,
      meta: { name: c.name, day: game.sim.day, score: game.sim.score, date: new Date().toLocaleString(), levelIdx: game.levelIdx, difficulty: game.sim.difficulty, sandbox: game.sim.sandbox },
      city: {
        net: c.net.toJSON(),
        zones: c.zones, buildings: c.buildings, water: c.water, rocks: c.rocks || [],
        rail: c.rail, pois: c.pois, name: c.name, W: c.W, H: c.H
      },
      sim: game.sim.toJSON(),
      objectives: game.objectives.map(o => ({ id: o.id, done: o.done }))
    };
    try {
      localStorage.setItem(SAVE_KEY(slot), JSON.stringify(data));
      return true;
    } catch (e) {
      game.ui.toast('💾 Save failed', 'Storage full — the city may be too large for localStorage.', 'bad');
      return false;
    }
  };
  game.saveMeta = function (slot) {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY(slot)) || 'null');
      return d && d.meta;
    } catch (e) { return null; }
  };
  game.deleteSave = function (slot) { localStorage.removeItem(SAVE_KEY(slot)); };
  game.loadGame = function (slot) {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY(slot))); } catch (e) { return; }
    if (!data) return;
    game.ui.loading(true, 'Loading city…');
    setTimeout(() => {
      const cd = data.city;
      const net = TG.Network.fromJSON(cd.net);
      const city = { net, zones: cd.zones, buildings: cd.buildings, water: cd.water, rocks: cd.rocks, rail: cd.rail, pois: cd.pois, name: cd.name, W: cd.W, H: cd.H };
      if (data.meta.levelIdx >= 0) {
        game.level = CAMPAIGN[data.meta.levelIdx];
        game.levelIdx = data.meta.levelIdx;
        game.objectives = game.level.objectives.map(o => {
          const saved = (data.objectives || []).find(x => x.id === o.id);
          return { ...o, done: !!(saved && saved.done) };
        });
      } else { game.level = null; game.levelIdx = -1; game.objectives = []; }
      game.start(city, { difficulty: data.meta.difficulty, sandbox: data.meta.sandbox }, data.sim);
      game.ui.toast('📂 Loaded', city.name + ' — Day ' + game.sim.day, 'good');
    }, 30);
  };
  game.autosave = function () {
    if (game.running) game.saveGame('auto');
  };

  /* ---------- tutorial ---------- */
  function startTutorial() {
    const steps = [
      ['👋 Welcome, engineer', 'This village has one problem junction. Pause with SPACE and look around — drag to pan, scroll to zoom.'],
      ['🔥 Find the jam', 'Red roads on the heatmap (H) are congested. Click one with the Select tool (Q) to inspect it.'],
      ['🚦 Fix the junction', 'Try the Signals tool (T) on the busy crossroads, or build a Roundabout. Watch queues shrink.'],
      ['🛣 Add options', 'Build a Local road (R) to give drivers an alternative route around the centre.'],
      ['📈 Watch your score', 'Meet all objectives on the right to complete the level. Good luck!']
    ];
    let i = 0;
    const next = () => {
      if (i >= steps.length) return;
      game.ui.toast(steps[i][0], steps[i][1], 'info');
      game.ui.setTip(steps[i][1]);
      i++;
      if (i < steps.length) setTimeout(next, 22000);
    };
    setTimeout(next, 1200);
  }

  /* ---------- start screen ---------- */
  function initStartScreen() {
    document.querySelectorAll('.start-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.start-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.start-page').forEach(p => p.classList.add('hidden'));
        $('page-' + tab.dataset.tab).classList.remove('hidden');
        if (tab.dataset.tab === 'load') renderLoadSlots();
      });
    });
    // campaign cards
    const page = $('page-campaign');
    const prog = progress();
    page.innerHTML = '';
    CAMPAIGN.forEach((lvl, i) => {
      const unlocked = i === 0 || prog[CAMPAIGN[i - 1].id];
      const p = prog[lvl.id];
      const card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      card.innerHTML = '<div><b>' + (i + 1) + '. ' + lvl.name + '</b><small>' + lvl.desc + '</small></div>' +
        '<span class="stars">' + (p ? '★'.repeat(p.stars) + '<span style="opacity:.3">' + '★'.repeat(3 - p.stars) + '</span>' : unlocked ? 'NEW' : '🔒') + '</span>';
      if (unlocked) card.addEventListener('click', () => game.startCampaignLevel(i));
      page.appendChild(card);
    });
    $('btnStartSandbox').addEventListener('click', () => game.startSandbox());
    $('btnImport').addEventListener('click', () => game.startImport());
    $('sbxPop').addEventListener('input', () => $('sbxPopVal').textContent = fmt.int(+$('sbxPop').value));
    $('impPop').addEventListener('input', () => $('impPopVal').textContent = fmt.int(+$('impPop').value));
    renderLoadSlots();
  }
  function renderLoadSlots() {
    const box = $('loadSlots');
    box.innerHTML = '';
    let any = false;
    for (const slot of [1, 2, 3, 4, 'auto']) {
      const meta = game.saveMeta(slot);
      if (!meta) continue;
      any = true;
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = '<div><b>' + (slot === 'auto' ? 'Autosave' : 'Slot ' + slot) + '</b><small>' + meta.name + ' · Day ' + meta.day + ' · score ' + meta.score + ' · ' + meta.date + '</small></div><div class="slot-btns"><button>Load</button></div>';
      el.querySelector('button').addEventListener('click', () => game.loadGame(slot));
      box.appendChild(el);
    }
    if (!any) box.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:30px 0">No saved games yet. Play a city and it will autosave every couple of minutes.</p>';
  }

  /* ---------- achievement polling ---------- */
  function pollAchievements() {
    if (!game.running) return;
    const s = game.sim;
    if (s.stats.avgCongestion < 0.15 && s.activeVehicleCount() > 300) game.checkAchievement('flowMaster');
    const share = s.stats.tripsTotal > 100 ? (s.stats.transitTrips + s.stats.bikeTrips + s.stats.walkTrips) / s.stats.tripsTotal : 0;
    if (share > 0.25) game.checkAchievement('modeShift');
    if (s.score >= 800) game.checkAchievement('score800');
    if (!s.unlimitedMoney && s.budget >= 1000000) game.checkAchievement('tycoon');
    if (s.transit.lines.length >= 3) game.checkAchievement('metroMayor');
    if (s.weather === 'heavyrain') {
      const h = s.hour();
      if ((h > 8 && h < 9.5 || h > 17 && h < 19) && s.stats.avgCongestion < 0.35 && s.activeVehicleCount() > 150) game.checkAchievement('survivor');
    }
  }

  /* ---------- main loop ---------- */
  const SIM_DT_MS = 500;   // one sim step = 0.5 s of sim time at 1× speed
  function frame(now) {
    game._raf = requestAnimationFrame(frame);
    const dtMs = Math.min(100, now - (game._lastFrame || now));
    game._lastFrame = now;
    if (game.running) {
      const s = game.sim;
      if (!s.paused) {
        game._acc += dtMs * s.speed;
        let steps = 0;
        const maxSteps = s.speed >= 14 ? 40 : 10;
        while (game._acc >= SIM_DT_MS && steps < maxSteps) {
          s.step();
          game._acc -= SIM_DT_MS;
          steps++;
        }
        if (steps === maxSteps) game._acc = 0;   // cannot keep up — drop time, keep FPS
      }
      game.renderer.draw(game, dtMs);
      game.ui.updateHUD(now);
      if (now % 4000 < 20) pollAchievements();
      if (now > game._autosaveAt) {
        game._autosaveAt = now + 120000;
        game.autosave();
      }
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    game.renderer = TG.Renderer($('gameCanvas'), $('minimap'));
    game.ui = TG.UI(game);
    game.tools = TG.Tools(game);
    game.ui.initInput();
    game.ui.initToolbar();
    game.ui.initSearch();
    game.renderer.resize();
    initStartScreen();
    window.addEventListener('beforeunload', () => game.autosave());
    game._raf = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  TG.CAMPAIGN = CAMPAIGN;

})(window.TG);
