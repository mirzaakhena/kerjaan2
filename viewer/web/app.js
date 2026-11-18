// The viewer's pages. Everything shown comes from the server's JSON; nothing
// here changes the board. The address holds what is open: the tab, the
// filters, the ticket.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dur = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}h ${pad(m)}m` : m ? `${m}m ${pad(r)}s` : `${r}s`;
  };
  const clock = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };
  const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const timeOf = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const parts = location.pathname.split('/').filter(Boolean);
  const PROJECT = parts[0] === 'p' && parts[1] ? decodeURIComponent(parts[1]) : null;
  const api = (p) => fetch(p, { cache: 'no-store' }).then(async (r) => {
    const body = await r.json().catch(() => ({ error: `the viewer answered ${r.status}` }));
    if (!r.ok) throw new Error(body.error || `the viewer answered ${r.status}`);
    return body;
  });

  let D = null; // the board, as the server last sent it
  let skew = 0; // server clock minus this device's
  let problem = '';
  let connected = false;
  const now = () => Date.now() + skew;
  const byId = () => new Map((D?.tickets || []).map((t) => [t.id, t]));

  // ----- what is open, kept in the address -----
  const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancel'];
  const TABS = ['control', 'board', 'history'];
  const read = () => {
    const q = new URLSearchParams(location.search);
    return {
      tab: TABS.includes(q.get('tab')) ? q.get('tab') : 'control',
      q: q.get('q') || '',
      lane: q.get('lane') || '',
      hide: new Set(q.has('hide') ? q.get('hide').split(',').filter(Boolean) : ['cancel']),
      ticket: /^\d{12}$/.test(q.get('t') || '') ? q.get('t') : null,
      pane: ['contract', 'record', 'timeline'].includes(q.get('pane')) ? q.get('pane') : 'contract',
    };
  };
  let ui = read();
  function go(change, push = true) {
    ui = { ...ui, ...change };
    const q = new URLSearchParams();
    if (ui.tab !== 'control') q.set('tab', ui.tab);
    if (ui.q) q.set('q', ui.q);
    if (ui.lane) q.set('lane', ui.lane);
    const hide = [...ui.hide].sort().join(',');
    if (hide !== 'cancel') q.set('hide', hide);
    if (ui.ticket) { q.set('t', ui.ticket); if (ui.pane !== 'contract') q.set('pane', ui.pane); }
    const url = `${location.pathname}${q.toString() ? `?${q}` : ''}`;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  window.addEventListener('popstate', () => { ui = read(); if (ui.tab !== 'board') closeReplay(); render(); openDrawer(); });

  // ----- small pieces -----
  const tid = (id) => `<span class="tid" title="${id}">${id.slice(0, 8)}·<b>${id.slice(8)}</b></span>`;
  const lane = (l) => { const n = { light: 1, standard: 2, strict: 3 }[l] || 0; return `<span class="tag" title="lane ${esc(l)}"><span class="bars">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>${esc(l)}</span>`; };
  const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\b(\d{12})\b/g, (m) => (byId().has(m) ? `<a href="?t=${m}" data-open="${m}">${m}</a>` : m));
  const pills = (t) => (t.criteria.length ? `<span class="pills" title="Done when">${t.criteria.map((c) => `<i class="${c.void ? 'void' : c.done ? 'done' : ''}"></i>`).join('')}<b>${t.criteria.filter((c) => c.done).length}/${t.criteria.filter((c) => !c.void).length}</b></span>` : '');
  function badges(t, long) {
    const b = t.badges || {}, out = [];
    if (b.questions) out.push(`<span class="badge" title="open questions">? ${b.questions}${long ? ' question' : ''}</span>`);
    if (b.assumptions) out.push(`<span class="badge" title="assumptions you have not seen">≈ ${b.assumptions}${long ? ' assumed' : ''}</span>`);
    if (b.manual) out.push(`<span class="badge" title="manual checks waiting for you">✋ ${b.manual}${long ? ' by hand' : ''}</span>`);
    if (b.followups) out.push(`<span class="badge plain" title="follow-up proposals waiting for you">→ ${b.followups}${long ? ' follow-up' : ''}</span>`);
    if (b.unmerged) out.push(`<span class="badge" title="passed, not merged yet">⚠ not merged</span>`);
    if (t.state?.rejections) out.push(`<span class="badge bad" title="rejected by the reviewer">↺ ${long ? 'rejected ' : ''}${t.state.rejections}</span>`);
    return out.join(' ');
  }
  const running = () => D.tickets.filter((t) => t.run);

  const eventText = window.K2Trail.eventText;

  // ----- top bar -----
  let projects = [];
  function renderTop() {
    const top = $('#top');
    if (!PROJECT) { top.innerHTML = '<h1>k2</h1><span class="readouts"><span class="live">read-only</span></span>'; return; }
    if (!D) { top.innerHTML = `<h1><a href="/">k2</a><span class="sl">/</span>${esc(PROJECT)}</h1>`; return; }
    const start = new Date(now()); start.setHours(0, 0, 0, 0);
    const landed = D.tickets.filter((t) => t.landed && t.landed >= start.getTime()).length;
    const trees = D.tickets.filter((t) => t.worktree).length;
    const test = D.live.locks.find((l) => l.name === 'test');
    top.innerHTML = `<h1><a href="/">k2</a><span class="sl">/</span>${esc(D.project)}</h1>
      <nav class="tabs" role="tablist">${[['control', 'Control room'], ['board', 'Board'], ['history', 'History']].map(([k, label]) => `<button class="tab" role="tab" aria-selected="${ui.tab === k}" data-tab="${k}">${label}</button>`).join('')}</nav><a class="tab" href="/p/${encodeURIComponent(D.project)}/space">Shipyard</a>
      <div class="readouts">
        <span class="ro"><span>landed today</span><b>${landed}</b></span>
        <span class="ro"><span>worktrees</span><b>${trees}${D.orphans.length ? `<small class="warn"> · ${D.orphans.length} orphan</small>` : ''}</b></span>
        <span class="ro"><span>test turn</span><b>${test ? (test.ticket ? test.ticket.slice(8) : 'held') : 'free'}</b></span>
        <span class="ro run" title="agents at work now"><span>running</span><b>${running().length + (D.live.planner ? 1 : 0)}</b></span>
        <span class="ro" title="tickets in flight that take a place, of max_parallel"><span>places</span><b>${D.places.used}<small>/${D.places.max}</small></b></span>
        <span class="ro need"><span>need you</span><b>${D.inbox.length}</b></span>
        ${projects.length > 1 ? `<select class="field" id="project" aria-label="Project">${projects.map((p) => `<option ${p.name === D.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
        <span class="live"><span class="dot ${connected ? 'blink' : 'off'}"></span><span id="clock"></span></span>
      </div>`;
  }

  // ----- control room -----
  const GROUPS = [
    ['questions', '?', 'Questions', true, ['blocking question', 'question']],
    ['held', '⚠', 'Merge held', true, ['not merged']],
    ['manual', '✋', 'Manual checks', true, ['manual check']],
    ['assumptions', '≈', 'New assumptions', true, ['assumption']],
    ['followups', '→', 'Follow-up proposals', false, ['follow-up']],
    ['trouble', '!', 'Stuck, stopped or rejected twice', false, ['stuck', 'stopped', 'rejected twice', 'contract changed']],
  ];
  function viewControl() {
    const ids = byId();
    const groups = GROUPS.map(([key, glyph, label, always, kinds]) => {
      const list = D.inbox.filter((i) => kinds.includes(i.kind));
      if (!list.length && !always) return '';
      if (!list.length) return `<details class="group zero"><summary><span class="glyph">${glyph}</span>${label}<span class="n">0</span></summary></details>`;
      return `<details class="group ${key === 'trouble' ? 'trouble' : ''}" data-keep="g-${key}" ${['questions', 'held', 'trouble'].includes(key) ? 'open' : ''}>
        <summary><span class="glyph">${glyph}</span>${label}<span class="n">${list.length}</span></summary>
        ${list.map((i) => `<button class="item" data-open="${i.id}" data-pane="record">
          <span class="row">${tid(i.id)} ${i.key ? `<b>${esc(i.key)}</b>` : ''} ${i.kind === 'blocking question' ? '<span class="badge">blocking</span>' : ''}${key === 'trouble' ? `<span class="badge bad">${esc(i.kind)}</span>` : ''}</span>
          <span class="ititle">${esc(i.title)}</span>
          <span class="itext">${esc(i.text)}</span></button>`).join('')}
      </details>`;
    }).join('');

    const limit = D.settings.stuck_after_minutes;
    const agents = running().map((t) => {
      const r = t.run, act = D.live.agents[t.id], test = D.live.tests[t.id];
      const bringing = t.state.passed && t.state.needs;
      const frac = r.since ? (now() - r.since) / (limit * 60000) : 0;
      const [what] = t.last ? eventText(t.last) : [''];
      return `<article class="agent ${frac >= 1 ? 'stuck' : bringing ? 'warn' : ''}">
        <div class="head"><button class="title" data-open="${t.id}">${esc(t.title)}</button>${r.since ? `<span class="el" title="on this step; the foreman calls an agent stuck at ${limit} min"><span data-clock="${r.since}"></span><small> / ${limit}:00</small></span>` : ''}</div>
        <div class="meter"><i data-meter="${r.since || ''}" style="width:${Math.min(100, frac * 100).toFixed(1)}%"></i></div>
        <div class="row"><span class="role"><span class="dot blink ${frac >= 1 ? 'red' : bringing ? 'amber' : ''}"></span>${esc(r.role)}</span>${tid(t.id)} ${lane(t.fm.lane)} <span class="tag">${esc(r.model || 'session model')}</span> ${t.state.round > 1 ? `<span class="tag">round ${Number(t.state.round)}</span>` : ''} ${badges(t)}</div>
        <div class="act">
          ${bringing ? `<p class="notice">bringing main in${t.state.conflict ? ': conflict with main' : ''}</p>` : ''}
          ${act ? `<p>${esc(act.step)}${act.at ? ` <span class="dim">· <span data-since="${act.at}"></span> ago</span>` : ''}</p>${act.command && act.command !== act.step ? `<p class="cmd">$ ${esc(act.command)}</p>` : ''}`
            : `<p class="dim">${what ? `last on the trail: ${esc(what)}${t.last.at ? ` · <span data-since="${t.last.at}"></span> ago` : ''}` : 'no step seen yet'}</p>`}
          ${test ? `<details data-keep="test-${t.id}"><summary><span class="dim">tests</span> running <span data-since="${test.since}"></span> <span class="dim">·</span> <span class="q" data-quiet="${test.lastOutput}">last output <span></span> ago</span> <span class="dim">▸ output</span></summary><pre>${esc(test.tail.join('\n'))}</pre></details>` : ''}
        </div>
        <p class="wt">${esc(t.worktree || 'no worktree')}${t.state.slot ? ` · slot ${Number(t.state.slot)}` : ''}</p>
      </article>`;
    }).join('');

    // The planner works on the whole backlog, not on one ticket: a card of its own, first.
    const pl = D.live.planner;
    const planner = pl ? `<article class="agent planner">
        <div class="head"><span class="title">Planning the backlog</span><span class="el" title="since the planner was sent, or last resumed"><span data-clock="${pl.since}"></span></span></div>
        <div class="row"><span class="role"><span class="dot blink"></span>planner</span> <span class="tag">${esc(pl.model || 'session model')}</span></div>
        <div class="act">${pl.step ? `<p>${esc(pl.step)}${pl.at ? ` <span class="dim">· <span data-since="${pl.at}"></span> ago</span>` : ''}</p>${pl.command && pl.command !== pl.step ? `<p class="cmd">$ ${esc(pl.command)}</p>` : ''}` : '<p class="dim">no step seen yet</p>'}</div>
        <p class="wt">no ticket of its own: it reads the backlog and fills the queue</p>
      </article>` : '';
    const atWork = running().length + (pl ? 1 : 0);

    const todo = D.queue.order.map((id) => ids.get(id)).filter(Boolean);
    const why = (t, i) => {
      if (t.waits?.length) return [`starts after ${t.waits.map((w) => w.slice(8)).join(', ')} lands`, true];
      if (t.fm.solo === 'true') return ['solo: starts when nothing else is running', true];
      if (D.queue.pause.includes(t.id)) return ['pause before: waits for your go', true];
      return [i === 0 ? 'starts when a place is free' : 'in line', false];
    };
    const mq = D.mergeQueue.map((id) => ids.get(id)).filter(Boolean);
    const held = D.tickets.filter((t) => t.status === 'review' && t.state?.passed && (t.state.held || t.state.stopped));
    const link = (t, cls, text, reason, hold) => `<li><span class="node ${cls}">${text}</span><div>
        <button class="linkish ct" data-open="${t.id}">${esc(t.title)}</button>
        <div class="row">${tid(t.id)} ${lane(t.fm.lane)}</div>
        <p class="why ${hold ? 'hold' : ''}">${esc(reason)}</p></div></li>`;

    return `<div class="room">
      <section class="panel" style="--c:var(--in_progress)">
        <div class="panel-head"><h2>Waiting for you</h2><span class="count">${D.inbox.length}</span></div>
        <div class="scroll" data-keep="s-inbox">${groups}</div>
        <p class="panel-foot">Read-only. Settle these in your Claude session, for example “${D.inbox[0] ? `${D.inbox[0].kind} ${D.inbox[0].id.slice(8)}` : 'manual check 0412'}: …”.</p>
      </section>
      <section class="panel" style="--c:var(--done)">
        <div class="panel-head"><h2>Running now</h2><span class="count">${atWork} at work · ${D.places.used} of ${D.places.max} places taken</span></div>
        <div class="scroll agents" data-keep="s-agents">${planner + agents || '<p class="empty">No agent is working.</p>'}</div>
      </section>
      <div class="side">
        <section class="panel" style="--c:var(--review)">
          <div class="panel-head"><h2>Merge queue</h2><span class="count">${mq.length} passed</span></div>
          <ol class="chain scroll" data-keep="s-mq">
            ${mq.map((t, i) => link(t, i === 0 ? 'go' : '', i + 1, i === 0 ? (t.state.needs ? (t.run ? `holds the turn · its ${t.run.role} is bringing main in` : `holds the turn · main moved: waits for its ${t.state.needs}`) : 'holds the turn · ready to land') : `lands after ${mq[0].id.slice(8)}`, false)).join('')}
            ${held.map((t) => link(t, 'off', '–', `out of the queue · ${t.state.held ? `held: ${t.state.held}` : `stopped: ${t.state.stopped}`}`, true)).join('')}
            ${mq.length || held.length ? '' : '<li class="empty" style="display:block;border:0;background:none">Nothing waits to land.</li>'}
          </ol>
        </section>
        <section class="panel" style="--c:var(--todo)">
          <div class="panel-head"><h2>Next up</h2><span class="count">${todo.length} todo</span></div>
          ${D.queue.goal ? `<p class="goal">Goal · ${esc(D.queue.goal)}</p>` : ''}
          <ol class="chain scroll" data-keep="s-todo">${todo.map((t, i) => { const [reason, hold] = why(t, i); return link(t, '', i + 1, reason, hold); }).join('') || '<li class="empty" style="display:block;border:0;background:none">todo is empty.</li>'}</ol>
        </section>
      </div>
    </div>`;
  }

  // ----- board -----
  const DONE_SHOWN = 60;
  let doneAll = false;
  function cardState(t) {
    if (t.run) return `<span class="state"><span class="dot blink"></span>${esc(t.run.role)}${t.run.since ? ` · <span data-since="${t.run.since}"></span>` : ''}</span>`;
    if (t.state?.stopped) return `<span class="state"><span class="dot red"></span>stopped: waits for you</span>`;
    if (t.status === 'review' && t.state?.held) return `<span class="state"><span class="dot amber"></span>held for you</span>`;
    if (t.status === 'review' && t.state?.passed) { const i = D.mergeQueue.indexOf(t.id); return i >= 0 ? `<span class="state">merge queue no. ${i + 1}</span>` : ''; }
    if (t.status === 'review') return `<span class="state">waits for its reviewer</span>`;
    if (t.status === 'in_progress') return `<span class="state">no agent on it now</span>`;
    if (t.status === 'todo') { const i = D.queue.order.indexOf(t.id); return i >= 0 ? `<span class="state">queue no. ${i + 1}</span>` : ''; }
    return '';
  }
  // The board's columns: the live board, or, in a replay, the board as it was.
  function columns(rs) {
    const needle = ui.q.toLowerCase();
    const match = (t) => (!ui.lane || t.fm.lane === ui.lane) && (!needle || t.title.toLowerCase().includes(needle) || t.id.includes(needle));
    return STATUSES.filter((s) => !ui.hide.has(s)).map((s) => {
      let list;
      if (rs) {
        // newest in the column first: a card that arrives is seen arriving
        list = [...R.model.tickets.values()].filter((t) => rs.get(t.id)?.status === s && match(t)).sort((a, b) => rs.get(b.id).since - rs.get(a.id).since || b.id.localeCompare(a.id));
      } else {
        list = D.tickets.filter((t) => t.status === s && match(t));
        if (s === 'done') list = list.sort((a, b) => (b.landed || 0) - (a.landed || 0) || b.id.localeCompare(a.id));
        if (s === 'todo') list = list.sort((a, b) => D.queue.order.indexOf(a.id) - D.queue.order.indexOf(b.id));
      }
      const shown = s === 'done' && !doneAll ? list.slice(0, DONE_SHOWN) : list;
      return `<section class="panel col" data-s="${s}">
        <div class="panel-head"><h2>${s.replace('_', ' ')}</h2><span class="count">${list.length}</span></div>
        <div class="scroll cards" data-keep="c-${s}">${shown.map((t) => (rs ? replayCard(t, rs.get(t.id)) : `<button class="card ${t.run ? 'running' : ''}" data-open="${t.id}">
            <span class="toprow"><span>${tid(t.id)}</span><span>${esc(t.fm.type)}${t.fm.priority !== 'medium' ? ' · ' + esc(t.fm.priority) : ''}</span></span>
            <span class="ctitle">${esc(t.title)}</span>
            <span class="row">${lane(t.fm.lane)}${t.fm.solo === 'true' ? '<span class="tag">solo</span>' : ''}${(t.fm.labels || []).map((l) => `<span class="tag">${esc(l)}</span>`).join('')}${pills(t)}</span>
            ${badges(t, true) ? `<span class="row">${badges(t, true)}</span>` : ''}
            ${cardState(t)}
          </button>`)).join('') || '<p class="empty">nothing here</p>'}
          ${shown.length < list.length ? `<button class="more" data-done-all>Show ${list.length - shown.length} more</button>` : ''}</div>
      </section>`;
    }).join('');
  }
  // A card in a replay says only what was true then: the last line of its trail.
  function replayCard(t, at) {
    const [what] = at.step === 'untracked' && (!at.last || at.last.at <= at.since) ? ['Moved outside the trail'] : at.last ? eventText(at.last) : ['–'];
    return `<button class="card" data-open="${t.id}" data-rid="${t.id}">
        <span class="toprow"><span>${tid(t.id)}</span><span>${esc(t.fm.type)}${t.fm.priority && t.fm.priority !== 'medium' ? ' · ' + esc(t.fm.priority) : ''}</span></span>
        <span class="ctitle">${esc(t.title)}</span>
        <span class="row">${lane(t.fm.lane)}</span>
        <span class="state">${esc(what)}${at.last ? ` · ${esc(stamp(at.last.at).slice(5, 16))}` : ''}</span>
      </button>`;
  }
  function viewBoard() {
    const rs = R?.model ? R.model.at(R.model.real(R.v)) : null;
    const count = (s) => (rs ? [...rs.values()].filter((x) => x.status === s).length : D.tickets.filter((t) => t.status === s).length);
    return `<div class="tools">
        <input class="field" type="search" id="f-q" placeholder="Search title or ID…" value="${esc(ui.q)}" aria-label="Search title or ID">
        <select class="field" id="f-lane" aria-label="Lane"><option value="">all lanes</option>${['light', 'standard', 'strict'].map((l) => `<option ${ui.lane === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="label">Columns</span>${STATUSES.map((s) => `<button class="colbtn" data-s="${s}" data-col="${s}" aria-pressed="${!ui.hide.has(s)}"><i></i>${s.replace('_', ' ')} <b data-count="${s}">${count(s)}</b></button>`).join('')}
        ${R ? '' : '<button class="colbtn replay-btn" id="r-open" title="Play the whole history of this board, from before its first ticket to now">▶ Replay</button>'}
      </div>
      ${R ? replayBar() : ''}
      <div class="board ${R ? 'replaying' : ''}" id="board">${columns(rs) || '<p class="empty">Every column is hidden.</p>'}</div>`;
  }

  // ----- the replay of the board -----
  // History-milliseconds per real millisecond.
  const SPEEDS = [[60, '1 min/s'], [300, '5 min/s'], [1200, '20 min/s'], [3600, '1 h/s']];
  const HOLD = 1200; // ms the empty board is shown before the first ticket arrives
  const SKIP_SAID = 10 * 60000; // a skipped stretch this long or longer is said on the bar
  let R = null; // { model, v, playing, speed, last, dragging, shown, flying, newer, raf }
  const stamp = (ms) => { const d = new Date(ms); return `${dayOf(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  function replayBar() {
    if (R.error) return `<div class="replay" id="replay"><span class="rtag">Replay</span><span class="rnote bad">${esc(R.error)}</span><button class="colbtn" id="r-exit">Back to live</button></div>`;
    if (!R.model) return `<div class="replay" id="replay"><span class="rtag">Replay</span><span class="rnote">Reading the whole history…</span><button class="colbtn" id="r-exit">Back to live</button></div>`;
    const m = R.model;
    return `<div class="replay" id="replay" role="group" aria-label="Replay of the board's history">
        <span class="rtag" title="What the board shows is its history, not the board now">Replay · history</span>
        <button class="colbtn" id="r-play" aria-label="Play">▶ Play</button>
        <select class="field" id="r-speed" aria-label="Speed">${SPEEDS.map(([v, label]) => `<option value="${v}" ${v === R.speed ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="rclock" id="r-clock" aria-live="off"></span>
        <input type="range" id="r-pos" min="0" max="${m.length}" step="1" value="${R.v}" aria-label="Point in the history">
        <span class="rnote" id="r-note"></span>
        <button class="colbtn" id="r-exit">Back to live</button>
        <span class="rspan">${esc(stamp(m.start + 3000).slice(0, 16))} → ${esc(stamp(m.end).slice(0, 16))} · ${m.events.length} events</span>
      </div>`;
  }
  function openReplay() {
    R = { model: null, v: 0, playing: false, speed: 300, last: 0, dragging: false, shown: new Map(), flying: new Set(), newer: false, raf: 0 };
    const mine = R;
    render();
    api(`/api/p/${encodeURIComponent(PROJECT)}/history`).then((h) => {
      if (R !== mine) return;
      R.model = window.K2Replay.make(h);
      R.playing = true;
      R.wait = HOLD;
      render();
      play();
    }).catch((e) => { if (R === mine) { R.error = e.message; render(); } });
  }
  function closeReplay() {
    if (!R) return;
    cancelAnimationFrame(R.raf);
    for (const g of document.querySelectorAll('.ghost')) g.remove();
    R = null;
  }
  function play() {
    if (!R?.model) return;
    cancelAnimationFrame(R.raf);
    R.last = 0;
    const step = (ts) => {
      if (!R?.model || !R.playing) return;
      const dt = R.last ? ts - R.last : 0;
      // the empty board, and the end of a replay played again, are held a moment before the clock runs
      if (R.wait > 0) R.wait -= dt;
      else if (!R.dragging) R.v = Math.min(R.model.length, R.v + dt * R.speed);
      R.last = ts;
      if (R.v >= R.model.length) R.playing = false;
      paintReplay(true);
      if (R.playing) R.raf = requestAnimationFrame(step);
    };
    R.raf = requestAnimationFrame(step);
  }
  // The clock, the bar, and the cards when the board of that moment differs from the one shown.
  function paintReplay(animate) {
    if (!R?.model || ui.tab !== 'board') return;
    const m = R.model, t = m.real(R.v), rs = m.at(t);
    const c = $('#r-clock'); if (c) c.textContent = stamp(t);
    const pos = $('#r-pos'); if (pos && !R.dragging) pos.value = R.v;
    const pb = $('#r-play');
    if (pb) { const label = R.playing ? 'Pause' : R.v >= m.length ? 'Play again' : 'Play'; pb.textContent = `${R.playing ? '❚❚' : '▶'} ${label}`; pb.setAttribute('aria-label', label); }
    const q = m.quietAt(R.v), note = $('#r-note');
    if (note) {
      note.textContent = q && q.to - q.from >= SKIP_SAID ? `⏩ ${dur(q.to - q.from)} with no event, skipped` : R.v >= m.length ? 'This is the board as it was when the replay opened.' : '';
      if (R.newer) note.textContent += `${note.textContent ? ' · ' : ''}The board moved since: back to live shows it.`;
    }
    const sig = [...rs].map(([id, x]) => `${id}:${x.status}:${x.last ? x.last.at + x.last.event : ''}`).join('|');
    if (sig === R.sig) return;
    R.sig = sig;
    const board = $('#board');
    if (!board) return;
    const before = new Map();
    if (animate) for (const el of board.querySelectorAll('[data-rid]')) before.set(el.dataset.rid, el.getBoundingClientRect());
    const kept = {};
    for (const el of board.querySelectorAll('[data-keep]')) kept[el.dataset.keep] = el.scrollTop;
    board.innerHTML = columns(rs) || '<p class="empty">Every column is hidden.</p>';
    for (const el of board.querySelectorAll('[data-keep]')) if (kept[el.dataset.keep] !== undefined) el.scrollTop = kept[el.dataset.keep];
    for (const s of STATUSES) { const b = $(`[data-count="${s}"]`); if (b) b.textContent = [...rs.values()].filter((x) => x.status === s).length; }
    const was = R.shown;
    R.shown = new Map([...rs].map(([id, x]) => [id, x.status]));
    for (const id of R.flying) { const el = board.querySelector(`[data-rid="${id}"]`); if (el) el.style.visibility = 'hidden'; }
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [id, status] of R.shown) {
      const el = board.querySelector(`[data-rid="${id}"]`);
      if (!el) continue;
      if (!was.has(id)) { el.classList.add('born'); continue; }
      const from = before.get(id);
      if (was.get(id) === status || !from) continue;
      fly(id, el, from);
    }
  }
  // A card that changed column flies from where it was to where it is now.
  function fly(id, el, from) {
    const to = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.classList.add('ghost');
    g.removeAttribute('data-open');
    g.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px`;
    document.body.append(g);
    el.style.visibility = 'hidden';
    R.flying.add(id);
    const mine = R;
    const done = () => {
      g.remove();
      if (R !== mine) return;
      R.flying.delete(id);
      const now = document.querySelector(`#board [data-rid="${id}"]`);
      if (now) now.style.visibility = '';
    };
    const a = g.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` }], { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)' });
    a.onfinish = done;
    a.oncancel = done;
  }

  // ----- history -----
  function viewHistory() {
    const done = D.tickets.filter((t) => t.status === 'done' && t.landed).map((t) => ({ t, ms: t.started ? t.landed - t.started : null })).sort((a, b) => b.t.landed - a.t.landed);
    if (!done.length) return '<p class="note">Nothing has landed on main yet.</p>';
    const med = (list) => { const v = list.map((d) => d.ms).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
    const rej = done.filter((d) => d.t.rejected).length, integ = done.filter((d) => d.t.broughtIn).length;
    const days = [...new Set(done.map((d) => dayOf(d.t.landed)))];
    const lanes = ['light', 'standard', 'strict'];
    const chart = days.slice(0, 14);
    const max = Math.max(...chart.map((day) => done.filter((d) => dayOf(d.t.landed) === day).length), 1);
    const dayRows = chart.map((day) => { const list = done.filter((d) => dayOf(d.t.landed) === day); return `<div class="barrow"><span>${day.slice(5)}</span><div class="bar" style="width:${(list.length / max) * 100}%">${lanes.map((l) => { const n = list.filter((d) => d.t.fm.lane === l).length; return n ? `<div class="l-${l}" style="flex:${n}" title="${l} ${n}"></div>` : ''; }).join('')}</div><b>${list.length}</b></div>`; }).join('');
    const lmax = Math.max(...lanes.map((l) => done.filter((d) => d.t.fm.lane === l).length), 1);
    const laneRows = lanes.map((l) => { const list = done.filter((d) => d.t.fm.lane === l); const m = med(list); return `<div class="barrow"><span>${l}</span><div class="bar" style="width:${(list.length / lmax) * 100}%"><div class="l-${l}" style="flex:1"></div></div><b>${list.length}</b></div>${m !== null ? `<p class="barnote">median ${dur(m)} from start to main</p>` : ''}`; }).join('');
    const rows = days.map((day) => `<tr class="day"><td colspan="7">${day}</td></tr>` + done.filter((d) => dayOf(d.t.landed) === day).map((d) => `<tr>
        <td>${timeOf(d.t.landed)}</td>
        <td><button class="linkish" data-open="${d.t.id}">${esc(d.t.title)}</button> ${badges(d.t, true)}</td>
        <td>${tid(d.t.id)}</td><td>${esc(d.t.fm.lane)}</td>
        <td class="num">${d.ms !== null ? dur(d.ms) : '–'}</td><td class="num">${d.t.rejected || '–'}</td><td class="num">${d.t.broughtIn || '–'}</td></tr>`).join('')).join('');
    const m = med(done);
    return `<div class="hist"><div class="hist-left">
        <section class="panel" style="--c:var(--done)"><div class="stats">
          <div class="stat"><b>${done.length}</b><span>landed on main</span></div>
          <div class="stat"><b>${m !== null ? dur(m) : '–'}</b><span>median, start to main</span></div>
          <div class="stat"><b>${rej}<small> of ${done.length}</small></b><span>rejected once or more</span></div>
          <div class="stat"><b>${integ}<small> of ${done.length}</small></b><span>had to bring main in</span></div>
        </div></section>
        <section class="box"><h3>Landed per day</h3>${dayRows}<div class="key"><span><i class="l-light"></i>light</span><span><i class="l-standard"></i>standard</span><span><i class="l-strict"></i>strict</span></div></section>
        <section class="box"><h3>By lane</h3>${laneRows}</section>
      </div>
      <section class="box scrolls" data-keep="s-log"><h3>Landed tickets</h3>
        <div class="tablewrap"><table><thead><tr><th>Time</th><th>Ticket</th><th>ID</th><th>Lane</th><th class="num">Start to main</th><th class="num">Rejected</th><th class="num">Main brought in</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section></div>`;
  }

  // ----- home -----
  function viewHome() {
    if (!projects.length) return `<div class="home"><p class="note">No board under this folder yet. A project appears here as soon as <code>k2 init</code> makes its board.</p></div>`;
    return `<div class="home"><h2>Boards</h2><div class="projects">${projects.map((p) => `<a class="project" href="/p/${encodeURIComponent(p.name)}/">
        <div class="name">${esc(p.name)}${p.path && p.path !== p.name && p.path !== '.' ? `<span class="where">${esc(p.path)}</span>` : ''}${p.running ? `<span class="badge good">${p.running} running</span>` : ''}${p.needs ? `<span class="badge">${p.needs} need you</span>` : ''}</div>
        ${p.error ? `<p class="err">${esc(p.error)}</p>` : `<div class="counts">${STATUSES.map((s) => `<span data-s="${s}"><i></i>${s.replace('_', ' ')} ${p.counts[s]}</span>`).join('')}</div>`}
      </a>`).join('')}</div></div>`;
  }

  // ----- the ticket drawer -----
  const OPEN = ['unseen', 'open', 'blocking', 'waiting'];
  // Each section of the contract and the record is [key, title, html, open count];
  // the rail on the drawer's left jumps to them, the way VS Code's activity bar does.
  const SECS = [['assumptions', 'Assumptions'], ['questions', 'Questions'], ['manual', 'Manual checks'], ['followups', 'Follow-ups'], ['decisions', 'Decisions'], ['review', 'Review']];
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    background: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" class="fill"/>'),
    repro: svg('<path d="M9 7a3 3 0 0 1 6 0"/><rect x="7" y="8" width="10" height="12" rx="5"/><path d="M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2M12 11v8"/>'),
    request: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    criteria: svg('<path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8"/>'),
    scope: svg('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
    details: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".6" class="fill"/><circle cx="3.5" cy="12" r=".6" class="fill"/><circle cx="3.5" cy="18" r=".6" class="fill"/>'),
    assumptions: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
    questions: svg('<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><circle cx="12" cy="17.2" r=".6" class="fill"/>'),
    manual: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
    followups: svg('<path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>'),
    decisions: svg('<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>'),
    review: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    handoff: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  };
  let detail = null; // the open ticket in full
  const COPY = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>');
  const COPIED = svg('<path d="m5 12 5 5 9-10"/>');
  // The clipboard API needs a secure page; over --lan the page is plain http,
  // so the old way through a hidden textarea is the fallback.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy refused'));
  }
  let pinned = null; // the section last jumped to, until the reader scrolls by hand
  function paneContract(t) {
    const sec = (key, title, body) => [key, title, body && body.split(/\n{2,}/).map((p) => `<p>${rich(p).replace(/\n/g, '<br>')}</p>`).join('')];
    const crit = t.criteria.length && ['criteria', `Done when · ${t.criteria.filter((c) => c.done).length} of ${t.criteria.filter((c) => !c.void).length}`, `<ul class="crit">${t.criteria.map((c) => `<li><span class="tick ${c.done ? 'done' : ''}"></span><span class="${c.void ? 'void' : ''}">${c.owner ? '<span class="owner">owner</span>' : ''}${rich(c.text.replace(/^\(owner\)\s*/i, ''))}</span></li>`).join('')}</ul>`];
    const list = (a) => (a && a.length ? a.map(rich).join(', ') : '–');
    return [sec('background', 'Background', t.sections.background), sec('repro', 'How to reproduce', t.sections.repro), sec('request', 'Request', t.sections.request), crit, sec('scope', 'Out of scope', t.sections.scope),
      ['details', 'Details', `<dl class="facts">
        <dt>Type</dt><dd>${esc(t.fm.type)} · ${esc(t.fm.priority)} priority${t.fm.solo === 'true' ? ' · solo' : ''}</dd>
        <dt>Created</dt><dd>${esc(t.fm.created)}</dd><dt>Labels</dt><dd>${list(t.fm.labels)}</dd><dt>Blocked by</dt><dd>${list(t.fm.blocked_by)}</dd><dt>Related</dt><dd>${list(t.fm.related)}</dd>
        <dt>Touches</dt><dd>${t.fm.touches?.length ? esc(t.fm.touches.join(', ')) : '–'}</dd>${t.worktree ? `<dt>Worktree</dt><dd>${esc(t.worktree)}</dd>` : ''}
      </dl>`]].filter((x) => x && x[2]);
  }
  function paneRecord(t) {
    const tone = (s) => (['confirmed', 'answered', 'ok', 'ticketed'].includes(s) ? 'good' : OPEN.includes(s) ? '' : ['failed', 'overturned'].includes(s) ? 'bad' : 'plain');
    const out = SECS.map(([key, title]) => {
      const list = t.record[key] || [];
      return [key, title, list.map((e) => `<div class="entry ${OPEN.includes(e.status) ? 'open' : ''}">
        ${e.key ? `<div class="eh"><span class="key">${esc(e.key)}</span><span class="badge ${tone(e.status)}">${esc(e.status)}</span></div>` : ''}
        <p>${rich(e.text)}</p>${(e.sub || []).map((s) => `<p class="sub">${rich(s)}</p>`).join('')}</div>`).join(''), list.filter((e) => OPEN.includes(e.status)).length];
    });
    if (t.record.handoff) out.push(['handoff', 'Handoff', `<p>${rich(t.record.handoff)}</p>`]);
    return out.filter((x) => x[2]);
  }
  function sectioned(secs, empty) {
    if (!secs.length) return `<div class="drawer-body"><p class="empty">${empty}</p></div>`;
    const rail = `<nav class="rail" aria-label="Sections">${secs.map(([key, title, , n]) => `<button data-jump="${key}" title="${esc(title.replace(/ ·.*/, ''))}" aria-label="${esc(title.replace(/ ·.*/, ''))}${n ? `, ${n} open` : ''}">${ICONS[key] || ''}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</nav>`;
    return `${rail}<div class="drawer-body">${secs.map(([key, title, html]) => `<div data-sec="${key}"><h3>${title}</h3>${html}</div>`).join('')}</div>`;
  }
  // Which icon is lit: the section jumped to, else the last whose top has
  // reached the top of the pane, else (scrolled to the end) the last one.
  function spy() {
    const body = $('.drawer-body'), rail = $('.rail');
    if (!body || !rail) return;
    const secs = [...body.querySelectorAll('[data-sec]')];
    let cur = secs[0]?.dataset.sec;
    if (pinned && secs.some((s) => s.dataset.sec === pinned)) cur = pinned;
    else if (body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) cur = secs.at(-1).dataset.sec;
    else for (const s of secs) if (s.offsetTop - body.scrollTop <= 24) cur = s.dataset.sec;
    for (const b of rail.querySelectorAll('[data-jump]')) b.dataset.jump === cur ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current');
  }
  function jump(key) {
    const body = $('.drawer-body'), sec = body && $(`[data-sec="${key}"]`, body);
    if (!sec) return;
    pinned = key;
    body.scrollTo({ top: sec.offsetTop - 16, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    spy();
  }
  function paneTimeline(t) {
    let day = '';
    if (!t.log.length) return '<div class="drawer-body"><p class="empty">No trail yet.</p></div>';
    return `<div class="drawer-body"><ol class="timeline">${t.log.map((e) => {
      const [what, det, tone] = eventText(e);
      const d = String(e.t).slice(0, 10), head = d !== day ? `<li class="dayhead">${esc(d)}</li>` : '';
      day = d;
      return `${head}<li><time>${esc(String(e.t).slice(11))}</time><span class="mark ${tone || ''}"></span><div><b>${esc(what)}</b>${det ? `<div class="det">${esc(det)}</div>` : ''}${e.by ? `<div class="det">by ${esc(e.by)}</div>` : ''}</div></li>`;
    }).join('')}</ol></div>`;
  }
  const PANES = { contract: ['Contract', (t) => sectioned(paneContract(t), 'Nothing written yet.')], record: ['Record', (t) => sectioned(paneRecord(t), 'Nothing recorded yet.')], timeline: ['Timeline', paneTimeline] };
  function renderDrawer(focus) {
    const root = $('#drawer-root');
    if (!ui.ticket) { root.innerHTML = ''; return; }
    const keep = $('.drawer-body', root)?.scrollTop || 0;
    if (!detail || detail.id !== ui.ticket) {
      root.innerHTML = `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-top"><div><h2>${detail?.error ? esc(detail.error) : 'Loading…'}</h2></div><button class="xbtn" data-close aria-label="Close">✕</button></div></aside>`;
      return;
    }
    const t = detail;
    const open = ['questions', 'assumptions', 'manual', 'followups'].reduce((n, k) => n + (t.record[k] || []).filter((e) => OPEN.includes(e.status)).length, 0);
    const lightT = byId().get(t.id);
    root.innerHTML = `<div class="scrim" data-close></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="Ticket ${t.id}">
        <div class="drawer-top"><div><p class="idline">${tid(t.id)}<button class="copy" data-copy="${esc(t.id)}" title="Copy ticket ID" aria-label="Copy ticket ID ${esc(t.id)}">${COPY}</button></p><h2>${esc(t.title)}</h2></div><span class="status" data-s="${t.status}">${t.status.replace('_', ' ')}</span><button class="xbtn" data-close aria-label="Close">✕</button></div>
        <div class="drawer-meta">${lane(t.fm.lane)} ${badges(lightT || t, true)}</div>
        <div class="dtabs" role="tablist">${Object.entries(PANES).map(([k, [label]]) => `<button class="dtab" role="tab" aria-selected="${ui.pane === k}" data-pane-tab="${k}">${label}${k === 'record' && open ? `<span class="n">${open} open</span>` : ''}${k === 'timeline' ? `<span class="n">${t.log.length}</span>` : ''}</button>`).join('')}</div>
        <div class="drawer-main">${PANES[ui.pane][1](t)}</div>
      </aside>`;
    if (focus) $('.xbtn', root).focus(); else $('.drawer-body', root).scrollTop = keep;
    spy();
  }
  function openDrawer(focus = true) {
    if (detail?.id !== ui.ticket) pinned = null;
    if (!ui.ticket) { detail = null; return renderDrawer(); }
    const id = ui.ticket;
    renderDrawer(focus);
    api(`/api/p/${encodeURIComponent(PROJECT)}/ticket/${id}`).then((t) => { if (ui.ticket === id) { const first = !detail || detail.id !== id; detail = t; renderDrawer(first && focus); } })
      .catch((e) => { if (ui.ticket === id) { detail = { id: null, error: e.message }; renderDrawer(); } });
  }

  // ----- drawing, and what survives a redraw -----
  const VIEWS = { control: viewControl, board: viewBoard, history: viewHistory };
  function render() {
    const view = $('#view');
    const kept = {};
    for (const el of view.querySelectorAll('[data-keep]')) kept[el.dataset.keep] = el.tagName === 'DETAILS' ? { open: el.open } : { top: el.scrollTop };
    const active = document.activeElement?.id === 'f-q' ? document.activeElement.selectionStart : null;
    renderTop();
    const banner = problem ? `<p class="banner">${esc(problem)}</p>` : D?.broken?.length ? `<p class="banner">${D.broken.map((b) => `Cannot read ${esc(b.file)}: ${esc(b.error)}`).join('<br>')}</p>` : '';
    view.innerHTML = banner + (!PROJECT ? viewHome() : D ? VIEWS[ui.tab]() : problem ? '' : '<p class="note">Loading…</p>');
    for (const el of view.querySelectorAll('[data-keep]')) {
      const k = kept[el.dataset.keep];
      if (!k) continue;
      if (el.tagName === 'DETAILS') el.open = k.open; else el.scrollTop = k.top;
    }
    if (active !== null) { const el = $('#f-q'); if (el) { el.focus(); el.setSelectionRange(active, active); } }
    document.title = PROJECT ? `${D && D.inbox.length ? `(${D.inbox.length}) ` : ''}${PROJECT} · k2` : 'k2';
    tick();
    if (R?.model && ui.tab === 'board') { R.sig = null; paintReplay(false); }
  }
  // The board was read again. A replay on show is left as it is: what is new
  // waits for the way back to the live board.
  function redraw() {
    if (R && ui.tab === 'board' && $('#replay')) { renderTop(); tick(); paintReplay(false); return; }
    render();
  }
  function tick() {
    const n = now();
    for (const el of document.querySelectorAll('[data-since]')) el.textContent = dur(n - Number(el.dataset.since));
    for (const el of document.querySelectorAll('[data-clock]')) el.textContent = clock(n - Number(el.dataset.clock));
    if (D) for (const el of document.querySelectorAll('[data-meter]')) if (el.dataset.meter) el.style.width = `${Math.min(100, ((n - Number(el.dataset.meter)) / (D.settings.stuck_after_minutes * 60000)) * 100).toFixed(1)}%`;
    for (const el of document.querySelectorAll('[data-quiet]')) {
      const quiet = n - Number(el.dataset.quiet);
      el.lastElementChild.textContent = dur(quiet);
      el.className = `q ${quiet >= 300000 ? 'bad' : quiet >= 60000 ? 'warn' : 'ok'}`;
    }
    const c = $('#clock');
    if (c) { const d = new Date(n); c.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
  }

  // ----- loading and following -----
  function loadProjects() {
    return api('/api/projects').then((r) => { projects = r.projects; }).catch((e) => { if (!PROJECT) problem = e.message; });
  }
  let loading = null;
  let again = false;
  function loadState() {
    if (loading) { again = true; return loading; }
    loading = api(`/api/p/${encodeURIComponent(PROJECT)}/state`).then((s) => { D = s; skew = s.now - Date.now(); problem = ''; })
      .catch((e) => { problem = e.message; })
      .finally(() => { loading = null; redraw(); if (again) { again = false; return loadState(); } });
    return loading;
  }
  function follow() {
    const es = new EventSource(`/api/p/${encodeURIComponent(PROJECT)}/events`);
    es.onopen = () => { connected = true; loadState(); };
    es.onerror = () => {
      connected = false;
      renderTop();
      tick();
      if (es.readyState === EventSource.CLOSED) { es.close(); setTimeout(follow, 3000); loadState(); }
    };
    es.addEventListener('board', () => { if (R) R.newer = true; loadState().then(() => { if (ui.ticket) openDrawer(false); }); });
    es.addEventListener('live', (e) => { if (!D) return; D.live = JSON.parse(e.data); skew = D.live.now - Date.now(); if (ui.tab === 'control') render(); else { renderTop(); tick(); } });
  }

  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); go({ ticket: open.dataset.open, pane: open.dataset.pane || 'contract' }); openDrawer(); return; }
    if (e.target.closest('[data-close]')) { go({ ticket: null }); openDrawer(); return; }
    const pt = e.target.closest('[data-pane-tab]');
    if (pt) { pinned = null; go({ pane: pt.dataset.paneTab }, false); renderDrawer(); $('.drawer-body').scrollTop = 0; return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      copyText(cp.dataset.copy).then(() => {
        cp.innerHTML = COPIED; cp.classList.add('done'); cp.title = 'Copied';
        setTimeout(() => { cp.innerHTML = COPY; cp.classList.remove('done'); cp.title = 'Copy ticket ID'; }, 1500);
      }, () => { cp.title = 'Could not copy'; });
      return;
    }
    const j = e.target.closest('[data-jump]');
    if (j) { jump(j.dataset.jump); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { if (tab.dataset.tab !== 'board') closeReplay(); go({ tab: tab.dataset.tab }); render(); return; }
    if (e.target.closest('#r-open')) { openReplay(); return; }
    if (e.target.closest('#r-exit')) { closeReplay(); render(); return; }
    if (e.target.closest('#r-play') && R?.model) {
      if (R.playing) { R.playing = false; cancelAnimationFrame(R.raf); paintReplay(false); return; }
      if (R.v >= R.model.length) { R.v = 0; R.wait = HOLD; paintReplay(false); }
      R.playing = true; play(); return;
    }
    const col = e.target.closest('[data-col]');
    if (col) { const hide = new Set(ui.hide); hide.has(col.dataset.col) ? hide.delete(col.dataset.col) : hide.add(col.dataset.col); go({ hide }, false); render(); return; }
    if (e.target.closest('[data-done-all]')) { doneAll = true; render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.ticket) { go({ ticket: null }); openDrawer(); } });
  // A jump keeps its icon lit until the reader scrolls the pane by hand.
  document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('drawer-body')) spy(); }, true);
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) document.addEventListener(ev, (e) => {
    if (pinned && e.target.closest?.('.drawer-body') && !(ev === 'keydown' && e.key === 'Escape')) { pinned = null; spy(); }
  }, { passive: true });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'f-q') { go({ q: e.target.value }, false); render(); }
    if (e.target.id === 'f-lane') { go({ lane: e.target.value }, false); render(); }
    // scrubbing shows the board of that moment at once, with no card flying
    if (e.target.id === 'r-pos' && R?.model) { R.v = Number(e.target.value); paintReplay(false); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'r-speed' && R) R.speed = Number(e.target.value); });
  document.addEventListener('pointerdown', (e) => { if (e.target.id === 'r-pos' && R) R.dragging = true; });
  document.addEventListener('pointerup', () => { if (R) R.dragging = false; });
  document.addEventListener('pointercancel', () => { if (R) R.dragging = false; });
  document.addEventListener('change', (e) => { if (e.target.id === 'project') location.href = `/p/${encodeURIComponent(e.target.value)}/`; });

  setInterval(tick, 1000);
  if (PROJECT) {
    render();
    loadProjects().then(renderTop);
    loadState().then(() => openDrawer());
    follow();
    setInterval(() => loadProjects().then(() => { renderTop(); tick(); }), 15000);
  } else {
    const refresh = () => loadProjects().then(render);
    refresh();
    setInterval(refresh, 5000);
  }
})();
