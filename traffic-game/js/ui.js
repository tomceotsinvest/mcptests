/* ============ GRIDLOCK — UI, input & HUD ============ */
'use strict';
(function (TG) {
  const { M, fmt } = TG;
  const $ = (id) => document.getElementById(id);

  function UI(game) {
    const ui = { game };
    const R = () => game.renderer;
    const sim = () => game.sim;
    const canvas = $('gameCanvas');

    /* ================= INPUT ================= */
    let mouse = { x: 0, y: 0, downX: 0, downY: 0, down: false, panning: false, button: 0 };

    ui.initInput = function () {
      canvas.addEventListener('mousedown', (e) => {
        mouse.down = true; mouse.panning = false; mouse.button = e.button;
        mouse.downX = e.clientX; mouse.downY = e.clientY;
        mouse.x = e.clientX; mouse.y = e.clientY;
      });
      window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        if (mouse.down) {
          const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
          if (!mouse.panning && Math.hypot(e.clientX - mouse.downX, e.clientY - mouse.downY) > 5) {
            mouse.panning = true;
            canvas.classList.add('panning');
            R().followVehicle = null;
          }
          if (mouse.panning) R().panBy(dx, dy);
        }
        mouse.x = e.clientX; mouse.y = e.clientY;
        if (!game.running) return;
        const w = R().screenToWorld(sx, sy);
        game.tools.move(w.x, w.y);
        updateCursorHint(sx, sy, w);
      });
      window.addEventListener('mouseup', (e) => {
        if (!mouse.down) return;
        mouse.down = false;
        canvas.classList.remove('panning');
        if (mouse.panning) { mouse.panning = false; return; }
        if (e.target !== canvas || !game.running) return;
        const rect = canvas.getBoundingClientRect();
        const w = R().screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (e.button === 0) game.tools.click(w.x, w.y, e);
        else if (e.button === 2) game.tools.cancel();
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        R().zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.16 : 0.86);
      }, { passive: false });
      canvas.addEventListener('dblclick', (e) => {
        if (game.tools.stops) { game.tools.dblclick(); return; }
        const rect = canvas.getBoundingClientRect();
        const w = R().screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        R().centerOn(w.x, w.y, R().cam.tzoom * 1.9);
      });
      $('minimap').addEventListener('click', (e) => {
        const rect = $('minimap').getBoundingClientRect();
        const w = R().minimapToWorld(e.clientX - rect.left, e.clientY - rect.top, sim().net);
        R().centerOn(w.x, w.y);
      });

      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
          if (e.key === 'Escape') e.target.blur();
          return;
        }
        if (!game.running) return;
        const k = e.key.toLowerCase();
        if (e.ctrlKey || e.metaKey) {
          if (k === 'z') { e.preventDefault(); game.tools.undo(); }
          if (k === 'y') { e.preventDefault(); game.tools.redo(); }
          return;
        }
        switch (k) {
          case ' ': e.preventDefault(); ui.setSpeed(sim().paused ? sim().speed || 1 : 0); break;
          case '1': ui.setSpeed(1); break;
          case '2': ui.setSpeed(4); break;
          case '3': ui.setSpeed(14); break;
          case 'q': ui.pickTool('select'); break;
          case 'r': ui.pickTool('road-local'); break;
          case 'u': ui.pickTool('upgrade'); break;
          case 'x': ui.pickTool('delete'); break;
          case 't': ui.pickTool('lights'); break;
          case 'o': ui.pickTool('oneway'); break;
          case 'b': ui.pickTool('busroute'); break;
          case 'h': ui.toggleOverlay('heat'); break;
          case 'g': ui.showStatsModal(); break;
          case 'home': R().fitBounds(sim().net.bounds); break;
          case 'enter': game.tools.enter(); break;
          case 'escape':
            if (!$('modalRoot').classList.contains('hidden')) ui.closeModal();
            else if (!game.tools.cancel()) ui.showMenuModal();
            break;
          case 'f5': e.preventDefault(); ui.showSaveModal(); break;
        }
      });
      window.addEventListener('resize', () => R().resize());
    };

    function updateCursorHint(sx, sy, w) {
      const hint = $('cursorHint'), toolHint = $('toolHint');
      if (game.tools.hint) {
        toolHint.textContent = game.tools.hint;
        toolHint.classList.remove('hidden');
      } else toolHint.classList.add('hidden');
      // hover info for select tool
      if (game.tools.current === 'select' && !mouse.panning) {
        const hit = sim().net.nearestRoad(w.x, w.y, 25 / R().cam.zoom);
        if (hit) {
          const r = hit.road;
          let cong = 0, cnt = 0;
          for (const e of [r.fwd, r.bwd]) if (e) { cong += M.clamp(1 - e.avgSpeed / r.speed, 0, 1); cnt++; }
          hint.textContent = (r.name || TG.ROAD_TYPES[r.type].name) + ' · ' + fmt.kmh(r.speed) + ' · congestion ' + fmt.pct(cnt ? cong / cnt : 0);
          hint.style.left = (sx + 16) + 'px';
          hint.style.top = (sy + 12) + 'px';
          hint.classList.remove('hidden');
          return;
        }
      }
      hint.classList.add('hidden');
    }

    /* ================= TOOLBAR ================= */
    ui.initToolbar = function () {
      document.querySelectorAll('#toolbar .tool[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => ui.pickTool(btn.dataset.tool));
      });
      document.querySelectorAll('#toolbar .tool[data-ovl]').forEach(btn => {
        btn.addEventListener('click', () => ui.toggleOverlay(btn.dataset.ovl));
      });
      document.querySelectorAll('#toolbar .tool[data-sbx]').forEach(btn => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset.sbx;
          if (['accident', 'roadworks'].includes(kind)) { game.tools.setTool('sbx:' + kind); ui.syncToolButtons(); }
          else sandboxInstant(kind);
        });
      });
      function sandboxInstant(kind) {
        const map = {
          'event': () => sim().triggerEvent(),
          'weather': () => { sim().cycleWeather(true); ui.toast(TG.WEATHERS[sim().weather].icon + ' ' + TG.WEATHERS[sim().weather].name, '', 'info'); },
          'demand-up': () => { sim().demandFactor = Math.min(3, sim().demandFactor * 1.2); ui.toast('Demand ×' + sim().demandFactor.toFixed(2), '', 'info'); },
          'demand-down': () => { sim().demandFactor = Math.max(0.2, sim().demandFactor / 1.2); ui.toast('Demand ×' + sim().demandFactor.toFixed(2), '', 'info'); },
          'pop-up': () => { for (const z of sim().zones) if (z.type === 'residential') z.pop = Math.round(z.pop * 1.1); ui.toast('👥 Population +10%', 'Now ' + fmt.int(sim().population()), 'info'); }
        };
        if (map[kind]) map[kind]();
      }
      $('btnUndo').addEventListener('click', () => game.tools.undo());
      $('btnRedo').addEventListener('click', () => game.tools.redo());
      $('btnSave').addEventListener('click', () => ui.showSaveModal());
      $('btnStats').addEventListener('click', () => ui.showStatsModal());
      $('btnAchievements').addEventListener('click', () => ui.showAchievementsModal());
      $('btnMenu').addEventListener('click', () => ui.showMenuModal());
      $('btnPause').addEventListener('click', () => ui.setSpeed(0));
      $('btnPlay').addEventListener('click', () => ui.setSpeed(1));
      $('btnFast').addEventListener('click', () => ui.setSpeed(4));
      $('btnFaster').addEventListener('click', () => ui.setSpeed(14));
      $('bpClose').addEventListener('click', () => ui.closePanel());
    };

    ui.pickTool = function (name) {
      game.tools.setTool(name);
      ui.syncToolButtons();
      canvas.classList.toggle('tool-active', name !== 'select');
    };
    ui.syncToolButtons = function () {
      document.querySelectorAll('#toolbar .tool[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === game.tools.current);
      });
      document.querySelectorAll('#toolbar .tool[data-sbx]').forEach(btn => {
        btn.classList.toggle('active', 'sbx:' + btn.dataset.sbx === game.tools.current);
      });
    };
    ui.toggleOverlay = function (name) {
      const o = R().overlays;
      if (name === 'heat') o.heat = !o.heat;
      else if (name === 'pollution') { o.pollution = !o.pollution; if (o.pollution) o.noise = false; }
      else if (name === 'noise') { o.noise = !o.noise; if (o.noise) o.pollution = false; }
      else o[name] = !o[name];
      document.querySelectorAll('#toolbar .tool[data-ovl]').forEach(btn => {
        btn.classList.toggle('active', !!o[btn.dataset.ovl]);
      });
    };

    ui.setSpeed = function (s) {
      sim().paused = s === 0;
      if (s > 0) sim().speed = s;
      $('btnPause').classList.toggle('active', s === 0);
      $('btnPlay').classList.toggle('active', s === 1);
      $('btnFast').classList.toggle('active', s === 4);
      $('btnFaster').classList.toggle('active', s === 14);
    };

    /* ================= HUD ================= */
    let lastHud = 0;
    ui.updateHUD = function (now) {
      if (now - lastHud < 250) return;
      lastHud = now;
      const s = sim();
      $('clockTime').textContent = fmt.time(s.time);
      $('clockDay').textContent = s.dayName() + ' · Day ' + s.day;
      $('phaseLabel').textContent = s.phaseName();
      $('weatherIcon').textContent = TG.WEATHERS[s.weather].icon;
      $('daylightMarker').style.left = (s.time / 86400 * 100) + '%';
      const bc = $('chipBudget');
      bc.querySelector('b').textContent = s.unlimitedMoney ? '∞' : fmt.money(s.budget);
      bc.classList.toggle('bad', !s.unlimitedMoney && s.budget < 20000);
      $('chipPop').querySelector('b').textContent = fmt.int(s.population());
      const cong = s.stats.avgCongestion;
      const cc = $('chipCong');
      cc.querySelector('b').textContent = fmt.pct(cong);
      cc.classList.toggle('bad', cong > 0.5);
      cc.classList.toggle('good', cong < 0.2);
      $('chipScore').querySelector('b').textContent = s.score;

      // live stats panel
      const st = s.stats;
      const avgTT = st.tripsCompleted ? st.travelTimeSum / st.tripsCompleted : 0;
      const share = st.tripsTotal ? (st.transitTrips + st.bikeTrips + st.walkTrips) / st.tripsTotal : 0;
      $('liveStats').innerHTML =
        row('Vehicles on road', fmt.int(s.activeVehicleCount())) +
        row('Avg speed', fmt.kmh(st.avgSpeedNow), st.avgSpeedNow > 8 ? 'good' : st.avgSpeedNow > 4 ? 'warn' : 'bad') +
        row('Congestion', fmt.pct(cong), cong < 0.25 ? 'good' : cong < 0.5 ? 'warn' : 'bad') +
        row('Avg journey', fmt.dur(avgTT)) +
        row('Trips done', fmt.int(st.tripsCompleted)) +
        row('Failed trips', fmt.int(st.tripsFailed), st.tripsFailed > st.tripsCompleted * 0.05 ? 'bad' : '') +
        row('Green share', fmt.pct(share), share > 0.2 ? 'good' : '') +
        row('Happiness', fmt.pct(st.happiness), st.happiness > 0.65 ? 'good' : st.happiness > 0.4 ? 'warn' : 'bad') +
        row('CO₂ rate', Math.round(st.co2Rate * 10) / 10 + ' kg/min') +
        row('Accidents live', s.accidents.length, s.accidents.length ? 'warn' : '');
      // score
      let sb = '';
      for (const [k, v] of Object.entries(s.scoreParts)) sb += row(k, v);
      sb += row('<b>Total</b>', '<b>' + s.score + '</b>');
      $('scoreBreakdown').innerHTML = sb;

      drawSpark($('sparkCongestion'), s.stats.history.map(h => h.cong), 1, '#ff5560');
      drawSpark($('sparkSpeed'), s.stats.history.map(h => h.speed), 15, '#3ddc84');

      game.updateObjectives();
    };
    function row(k, v, cls) {
      return '<div class="stat-row"><span>' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>';
    }
    function drawSpark(cv, vals, maxV, color) {
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      const data = vals.slice(-144);
      if (data.length < 2) return;
      const mx = Math.max(maxV, ...data) * 1.05;
      c.strokeStyle = color; c.lineWidth = 1.5;
      c.beginPath();
      data.forEach((v, i) => {
        const x = i / (data.length - 1) * cv.width;
        const y = cv.height - (v / mx) * (cv.height - 4) - 2;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.stroke();
    }

    /* ================= NOTIFICATIONS ================= */
    ui.toast = function (title, body, level, loc) {
      const box = $('notifications');
      const el = document.createElement('div');
      el.className = 'notif ' + (level || 'info');
      el.innerHTML = '<b>' + title + '</b>' + (body ? '<small>' + body + '</small>' : '');
      if (loc) el.addEventListener('click', () => R().centerOn(loc.x, loc.y, 1.6));
      box.appendChild(el);
      while (box.children.length > 5) box.removeChild(box.firstChild);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 6000);
    };
    ui.setTip = function (text) { $('tipText').textContent = text; };

    /* ================= INSPECT / BOTTOM PANEL ================= */
    ui.inspectAt = function (wx, wy) {
      const v = game.findVehicleAt(wx, wy, 18 / R().cam.zoom + 6);
      if (v) { R().selected = { kind: 'vehicle', vehicle: v }; ui.showVehiclePanel(v); return; }
      const n = sim().net.nearestNode(wx, wy, 16 / R().cam.zoom + 5);
      if (n && (n.control !== 'none' || n.inn.length >= 3)) { R().selected = { kind: 'node', node: n }; ui.showNodePanel(n); return; }
      const hit = sim().net.nearestRoad(wx, wy, 25 / R().cam.zoom);
      if (hit) { R().selected = { kind: 'road', road: hit.road }; ui.showRoadPanel(hit.road); return; }
      ui.closePanel();
    };

    ui.showRoadPanel = function (r) {
      const bp = $('bottomPanel');
      bp.classList.remove('hidden');
      let cong = 0, cnt = 0, vehs = 0, queued = 0, speedSum = 0;
      for (const e of [r.fwd, r.bwd]) {
        if (!e) continue;
        cong += M.clamp(1 - e.avgSpeed / r.speed, 0, 1); cnt++;
        vehs += e.vehicles.length;
        speedSum += e.meas;
        for (const v of e.vehicles) if (v.vel < 1) queued++;
      }
      const c = cnt ? cong / cnt : 0;
      const t = TG.ROAD_TYPES[r.type];
      $('bpTitle').innerHTML = (r.name || t.name) + '<small>' + t.name + (r.bridge ? ' · bridge' : '') + (r.tunnel ? ' · tunnel' : '') + (r.ped ? ' · pedestrianised' : '') + (r.ltn ? ' · LTN' : '') + '</small>';
      $('bpBody').innerHTML =
        kv('Congestion', fmt.pct(c), c < 0.25 ? 'good' : c < 0.55 ? 'warn' : 'bad') +
        kv('Vehicles', vehs) + kv('Queued', queued, queued > 4 ? 'bad' : '') +
        kv('Avg speed', fmt.kmh(cnt ? speedSum / cnt : r.speed)) +
        kv('Limit', fmt.kmh(r.speed)) +
        kv('Lanes/dir', r.lanes + (r.busLane ? ' +🚌' : '') + (r.cycleLane ? ' +🚲' : '')) +
        kv('Direction', r.oneway === 0 ? 'Two-way' : r.oneway === 1 ? 'One-way →' : 'One-way ←') +
        kv('Length', Math.round(r.len) + ' m') +
        kv('Capacity', '~' + fmt.int(t.cap * r.lanes / t.lanes) + '/h') +
        kv('Accidents', r.accidentCount || 0) +
        kv('Status', r.closed ? 'CLOSED' : r.roadworks > 0 ? 'Roadworks' : 'Open', r.closed || r.roadworks > 0 ? 'bad' : 'good');
      const acts = $('bpActions');
      acts.innerHTML = '';
      const mk = (label, tool) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => {
          const mid = M.polyAt(r.pts, r.len / 2);
          const cur = game.tools.current;
          game.tools.setTool(tool);
          game.tools.click(mid.x, mid.y);
          game.tools.setTool(cur);
          ui.showRoadPanel(r);
        });
        acts.appendChild(b);
      };
      mk('⬆ Upgrade', 'upgrade'); mk('↔ One-way', 'oneway'); mk('🚌 Bus lane', 'buslane');
      mk('🚲 Cycle', 'cyclelane'); mk(r.closed ? '✅ Reopen' : '⛔ Close', 'close'); mk('🗑', 'delete');
      // suggestion
      let sug = '';
      if (c > 0.55) sug = queued > 6 ? 'Severe queuing. Consider an upgrade, a parallel route, or shifting demand to transit.' : 'Congested — check the junctions at each end; signals or a roundabout may help.';
      else if (r.speed < 8 && r.type !== 'local') sug = 'Speed limit is very low for this road class.';
      if (sug) ui.setTip('💡 ' + sug);
    };

    ui.showNodePanel = function (n) {
      const bp = $('bottomPanel');
      bp.classList.remove('hidden');
      const ctrl = { none: 'Uncontrolled', lights: 'Traffic signals', stop: 'Stop signs', roundabout: 'Roundabout' }[n.control];
      let waiting = 0;
      for (const eid of n.inn) {
        const e = sim().net.edges.get(eid);
        if (e) for (const v of e.vehicles) if (v.vel < 1 && v.pos > e.len - 40) waiting++;
      }
      $('bpTitle').innerHTML = 'Junction ' + n.id + '<small>' + ctrl + ' · ' + n.inn.length + ' approaches</small>';
      $('bpBody').innerHTML =
        kv('Control', ctrl) +
        kv('Approaches', n.inn.length) +
        kv('Cars waiting', waiting, waiting > 6 ? 'bad' : waiting > 2 ? 'warn' : 'good') +
        (n.signal ? kv('Cycle', n.signal.cycle + ' s') : '') +
        (n.railCrossing ? kv('Rail crossing', 'yes', 'warn') : '') +
        (n.crossing ? kv('Ped crossing', 'yes') : '');
      const acts = $('bpActions');
      acts.innerHTML = '';
      const mk = (label, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => { fn(); ui.showNodePanel(n); });
        acts.appendChild(b);
      };
      mk(n.control === 'lights' ? 'Remove signals' : '🚦 Signals', () => { const c = game.tools.current; game.tools.setTool('lights'); game.tools.click(n.x, n.y); game.tools.setTool(c); });
      if (n.control === 'lights') mk('⏱ Timings', () => ui.showTimingModal(n));
      mk(n.control === 'roundabout' ? 'Remove r.about' : '⭕ Roundabout', () => { const c = game.tools.current; game.tools.setTool('roundabout'); game.tools.click(n.x, n.y); game.tools.setTool(c); });
      mk(n.control === 'stop' ? 'Remove stops' : '🛑 Stop signs', () => { const c = game.tools.current; game.tools.setTool('stop'); game.tools.click(n.x, n.y); game.tools.setTool(c); });
    };

    ui.showVehiclePanel = function (v) {
      const bp = $('bottomPanel');
      bp.classList.remove('hidden');
      const elapsed = sim().time + sim().day * 86400 - v.spawnT;
      const delay = Math.max(0, elapsed - v.freeT);
      $('bpTitle').innerHTML = icon(v.type) + ' ' + v.type.charAt(0).toUpperCase() + v.type.slice(1) + ' #' + v.id +
        '<small>' + (v.line ? TG.LINE_TYPES[v.line.type].name + ' line ' + v.line.id : v.frustrated ? '😡 frustrated driver' : 'en route') + '</small>';
      $('bpBody').innerHTML =
        kv('Speed', fmt.kmh(v.vel)) +
        kv('Travelling', fmt.dur(elapsed)) +
        kv('Delay', fmt.dur(delay), delay > 300 ? 'bad' : delay > 100 ? 'warn' : 'good') +
        (v.route ? kv('Route left', (v.route.length - v.ri) + ' segments') : '') +
        kv('Mood', v.frustrated ? 'Fuming 😡' : delay > 60 ? 'Impatient 😒' : 'Calm 🙂');
      const acts = $('bpActions');
      acts.innerHTML = '';
      const b = document.createElement('button');
      b.textContent = R().followVehicle === v ? 'Stop following' : '🎥 Follow';
      b.addEventListener('click', () => { R().followVehicle = R().followVehicle === v ? null : v; ui.showVehiclePanel(v); });
      acts.appendChild(b);
    };
    function icon(t) { return { car: '🚗', van: '🚐', truck: '🚚', bus: '🚌', tram: '🚋', emergency: '🚑', taxi: '🚕' }[t] || '🚗'; }
    function kv(k, v, cls) { return '<div class="kv"><span class="k">' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>'; }
    ui.closePanel = function () { $('bottomPanel').classList.add('hidden'); R().selected = null; };

    /* ================= MODALS ================= */
    ui.showModal = function (html) {
      $('modalBox').innerHTML = html;
      $('modalRoot').classList.remove('hidden');
      sim() && (sim().paused = true);
      ui.setSpeed(0);
    };
    ui.closeModal = function () {
      $('modalRoot').classList.add('hidden');
      if (game.running) ui.setSpeed(1);
    };
    $('modalRoot').addEventListener('click', (e) => { if (e.target === $('modalRoot')) ui.closeModal(); });

    ui.showTimingModal = function (n) {
      const s = n.signal;
      if (!s) return;
      let html = '<h2>🚦 Signal timings — junction ' + n.id + '</h2><p style="font-size:12px;color:var(--text-dim)">Give more green time to the busier approaches. Total cycle: <b id="cycleTotal">' + s.cycle + '</b> s</p>';
      s.split.forEach((g, i) => {
        html += '<div class="timing-row"><span>Phase ' + (i + 1) + '</span><input type="range" min="6" max="60" value="' + g + '" data-phase="' + i + '"><b id="ph' + i + '">' + g + ' s</b></div>';
      });
      html += '<div class="timing-row"><span>Offset</span><input type="range" min="0" max="' + Math.max(10, s.cycle) + '" value="' + (s.offset || 0) + '" id="offsetRange"><b id="offVal">' + (s.offset || 0) + ' s</b></div>';
      html += '<div class="modal-actions"><button class="secondary" id="btnSyncLights">🔗 Sync nearby signals</button><button id="btnTimingDone">Done</button></div>';
      ui.showModal(html);
      $('modalBox').querySelectorAll('input[data-phase]').forEach(inp => {
        inp.addEventListener('input', () => {
          s.split[+inp.dataset.phase] = +inp.value;
          s.cycle = s.split.reduce((a, b) => a + b, 0);
          $('ph' + inp.dataset.phase).textContent = inp.value + ' s';
          $('cycleTotal').textContent = s.cycle;
        });
      });
      $('offsetRange').addEventListener('input', (e) => { s.offset = +e.target.value; $('offVal').textContent = s.offset + ' s'; });
      $('btnTimingDone').addEventListener('click', () => ui.closeModal());
      $('btnSyncLights').addEventListener('click', () => {
        // green wave: same cycle, offsets proportional to distance
        let count = 0;
        for (const other of sim().net.nodes.values()) {
          if (other === n || other.control !== 'lights' || !other.signal) continue;
          const d = M.dist(n.x, n.y, other.x, other.y);
          if (d < 450) {
            other.signal.split = s.split.slice(0, other.phaseCount);
            while (other.signal.split.length < other.phaseCount) other.signal.split.push(s.split[0] || 20);
            other.signal.cycle = other.signal.split.reduce((a, b) => a + b, 0);
            other.signal.offset = Math.round(d / 13) % other.signal.cycle;
            count++;
          }
        }
        ui.toast('🔗 Signals synchronised', count + ' nearby junctions now run a green wave.', 'good');
        game.checkAchievement('greenWave');
      });
    };

    ui.showStatsModal = function () {
      const h = sim().stats.history;
      let html = '<h2>📊 City statistics</h2>';
      const charts = [
        ['Congestion', h.map(x => x.cong), '#ff5560', 1],
        ['Average speed (m/s)', h.map(x => x.speed), '#3ddc84', 15],
        ['Vehicles on road', h.map(x => x.veh), '#38b6ff', 100],
        ['Trips completed', h.map(x => x.done), '#ffc233', 10],
        ['Public + green transport trips', h.map(x => x.transit), '#a855f7', 10],
        ['Budget', h.map(x => x.budget), '#3ddc84', 1000],
        ['Population', h.map(x => x.pop), '#38b6ff', 100],
        ['Happiness', h.map(x => x.happy), '#ffc233', 1],
        ['CO₂ rate', h.map(x => x.co2), '#8a97a8', 5],
        ['Score', h.map(x => x.score), '#38b6ff', 100]
      ];
      charts.forEach((c, i) => {
        html += '<div class="chart-label">' + c[0] + '</div><canvas id="chart' + i + '" width="600" height="70"></canvas>';
      });
      html += '<div class="modal-actions"><button id="btnStatsClose">Close</button></div>';
      ui.showModal(html);
      charts.forEach((c, i) => drawSpark($('chart' + i), c[1], c[3], c[2]));
      $('btnStatsClose').addEventListener('click', ui.closeModal);
    };

    ui.showAchievementsModal = function () {
      let html = '<h2>🏆 Achievements</h2>';
      for (const [id, a] of Object.entries(game.achievements)) {
        html += '<div class="ach ' + (a.unlocked ? 'unlocked' : '') + '"><span class="ach-ico">' + a.icon + '</span><div><b>' + a.name + '</b><small>' + a.desc + '</small></div></div>';
      }
      html += '<h4>Local leaderboard — best scores</h4>';
      const lb = game.leaderboard();
      if (!lb.length) html += '<p style="font-size:12px;color:var(--text-dim)">No completed sessions yet.</p>';
      lb.slice(0, 10).forEach((e, i) => {
        html += '<div class="stat-row" style="font-size:13px;padding:3px 4px"><span>' + (i + 1) + '. ' + e.name + ' <small style="color:var(--text-dim)">' + e.date + '</small></span><span class="v">' + e.score + '</span></div>';
      });
      html += '<div class="modal-actions"><button id="btnAchClose">Close</button></div>';
      ui.showModal(html);
      $('btnAchClose').addEventListener('click', ui.closeModal);
    };

    ui.showMenuModal = function () {
      let html = '<h2>☰ Menu</h2>' +
        '<div class="cat-tools" style="gap:8px">' +
        '<button class="tool" id="mResume">▶ Resume</button>' +
        '<button class="tool" id="mSave">💾 Save / Load</button>' +
        '<button class="tool" id="mStats">📊 Statistics</button>' +
        '<button class="tool" id="mHelp">❓ How to play</button>' +
        '<button class="tool" id="mNew">🏙 Main menu (new city)</button>' +
        '</div>';
      ui.showModal(html);
      $('mResume').addEventListener('click', ui.closeModal);
      $('mSave').addEventListener('click', ui.showSaveModal);
      $('mStats').addEventListener('click', ui.showStatsModal);
      $('mHelp').addEventListener('click', ui.showHelpModal);
      $('mNew').addEventListener('click', () => { game.autosave(); location.reload(); });
    };

    ui.showHelpModal = function () {
      ui.showModal('<h2>❓ How to play</h2>' +
        '<h4>Goal</h4><p style="font-size:13px;line-height:1.5">Cut congestion and travel times without wrecking the budget. More roads is rarely the answer — try junction control, one-way systems, public transport and demand management.</p>' +
        '<h4>Camera</h4><p style="font-size:13px;line-height:1.5">Drag to pan · scroll to zoom · double-click to zoom in · <kbd>Home</kbd> to fit the city · minimap click to jump.</p>' +
        '<h4>Workflow</h4><p style="font-size:13px;line-height:1.5">1. Watch the red roads on the congestion heatmap (<kbd>H</kbd>).<br>2. Inspect them (<kbd>Q</kbd>) to see queues and causes.<br>3. Fix junctions first: signals (<kbd>T</kbd>), timings, roundabouts.<br>4. Add capacity or alternatives: upgrades, one-ways (<kbd>O</kbd>), bus routes (<kbd>B</kbd>), metro.<br>5. Manage demand: LTNs, pedestrian streets, park &amp; ride, cycle lanes.</p>' +
        '<h4>Time</h4><p style="font-size:13px;line-height:1.5"><kbd>Space</kbd> pause · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> speeds. Rush hours are 7–9 and 16–19 on weekdays.</p>' +
        '<div class="modal-actions"><button id="btnHelpClose">Got it</button></div>');
      $('btnHelpClose').addEventListener('click', ui.closeModal);
    };

    /* ---------- save/load ---------- */
    ui.showSaveModal = function () {
      let html = '<h2>💾 Save / Load</h2>';
      for (let i = 1; i <= 4; i++) html += slotHtml(i);
      html += slotHtml('auto');
      html += '<div class="modal-actions"><button id="btnSaveClose" class="secondary">Close</button></div>';
      ui.showModal(html);
      for (let i = 1; i <= 4; i++) wireSlot(i);
      wireSlot('auto');
      $('btnSaveClose').addEventListener('click', ui.closeModal);
    };
    function slotHtml(i) {
      const meta = game.saveMeta(i);
      const label = i === 'auto' ? 'Autosave' : 'Slot ' + i;
      return '<div class="slot"><div><b>' + label + '</b><small>' + (meta ? meta.name + ' · Day ' + meta.day + ' · score ' + meta.score + ' · ' + meta.date : 'Empty') + '</small></div>' +
        '<div class="slot-btns">' +
        (i !== 'auto' ? '<button data-save="' + i + '">Save</button>' : '') +
        (meta ? '<button data-load="' + i + '">Load</button><button data-del="' + i + '">✕</button>' : '') +
        '</div></div>';
    }
    function wireSlot(i) {
      const box = $('modalBox');
      const sv = box.querySelector('[data-save="' + i + '"]');
      if (sv) sv.addEventListener('click', () => { game.saveGame(i); ui.showSaveModal(); ui.toast('💾 Saved', 'Slot ' + i, 'good'); });
      const ld = box.querySelector('[data-load="' + i + '"]');
      if (ld) ld.addEventListener('click', () => { ui.closeModal(); game.loadGame(i); });
      const dl = box.querySelector('[data-del="' + i + '"]');
      if (dl) dl.addEventListener('click', () => { game.deleteSave(i); ui.showSaveModal(); });
    }

    /* ================= SEARCH ================= */
    ui.initSearch = function () {
      const box = $('searchBox'), results = $('searchResults');
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
        if (e.key === 'Escape') { results.classList.add('hidden'); box.blur(); }
      });
      box.addEventListener('input', () => { if (box.value.length > 2) doSearch(); else results.classList.add('hidden'); });
      document.addEventListener('click', (e) => { if (!e.target.closest('.tb-group.grow')) results.classList.add('hidden'); });
      function doSearch() {
        const q = box.value.trim().toLowerCase();
        if (!q) return;
        const out = [];
        for (const r of sim().net.roads.values()) {
          if (r.name && r.name.toLowerCase().includes(q)) {
            out.push({ label: r.name, sub: TG.ROAD_TYPES[r.type].name, x: r.pts[0].x, y: r.pts[0].y });
            if (out.length > 8) break;
          }
        }
        for (const p of game.city.pois || []) {
          if (p.type.includes(q)) out.push({ label: p.type.charAt(0).toUpperCase() + p.type.slice(1), sub: 'Landmark', x: p.x, y: p.y });
        }
        for (const z of game.city.zones) {
          if (z.type.includes(q)) { out.push({ label: z.type + ' district', sub: 'Zone', x: z.cx, y: z.cy }); if (out.length > 12) break; }
        }
        results.innerHTML = out.length ? '' : '<div class="sr-item">No matches</div>';
        out.slice(0, 12).forEach(o => {
          const el = document.createElement('div');
          el.className = 'sr-item';
          el.innerHTML = o.label + '<small>' + o.sub + '</small>';
          el.addEventListener('click', () => { R().centerOn(o.x, o.y, 1.4); results.classList.add('hidden'); });
          results.appendChild(el);
        });
        results.classList.remove('hidden');
      }
    };

    /* ================= OBJECTIVES ================= */
    ui.renderObjectives = function (objs) {
      const ul = $('objectivesList');
      ul.innerHTML = '';
      if (!objs || !objs.length) { ul.innerHTML = '<li class="done">Free play — chase a high score!</li>'; return; }
      for (const o of objs) {
        const li = document.createElement('li');
        li.textContent = o.desc + (o.progress ? ' (' + o.progress + ')' : '');
        if (o.done) li.classList.add('done');
        ul.appendChild(li);
      }
    };

    ui.setLevelName = function (name) { $('levelName').textContent = name; };
    ui.showSandboxTools = function (show) { $('sandboxTools').classList.toggle('hidden', !show); };

    ui.loading = function (show, text) {
      $('loadingOverlay').classList.toggle('hidden', !show);
      if (text) $('loadingText').textContent = text;
    };

    return ui;
  }

  TG.UI = UI;

})(window.TG);
