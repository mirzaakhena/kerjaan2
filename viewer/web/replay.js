// The replay of a board: its whole history, as `/api/p/<name>/history` gives
// it, laid on a clock that can be played, paused and scrubbed. Pure: the Board
// tab draws what `at` says, and the tests read it the same way.
//
// Two clocks: the board's own (real time, `t`) and the replay's (`v`, in the
// same milliseconds), where a quiet stretch longer than `quiet` counts only
// `quiet`. The replay starts a moment before the first ticket exists and ends
// at the last line of the trail, where every ticket is in the column it is in now.
(function (root) {
  const LEAD = 3000; // the empty board, before the first ticket
  const QUIET = 3 * 60000; // a gap with no event plays as at most this much

  function make(history, { quiet = QUIET } = {}) {
    const tickets = new Map(history.tickets.map((t) => [t.id, t]));
    const events = history.events.filter((e) => tickets.has(e.ticket) && Number.isFinite(e.at));
    const times = [...new Set([...events.map((e) => e.at), ...history.tickets.flatMap((t) => t.steps.map((s) => s.at))])].sort((a, b) => a - b);
    const first = times.length ? times[0] : history.now;
    const start = first - LEAD;
    const end = times.length ? times[times.length - 1] : first;
    // the clock in pieces: from real `t` to replay `v`, each piece played at its own rate
    const pieces = [];
    let v = 0;
    let prev = start;
    for (const t of times) {
      const gap = t - prev;
      if (gap <= 0) continue;
      const span = Math.min(gap, quiet);
      pieces.push({ t0: prev, t1: t, v0: v, v1: v + span, quiet: gap > quiet });
      v += span;
      prev = t;
    }
    const length = v;
    const piece = (key, x) => {
      let lo = 0;
      let hi = pieces.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pieces[mid][key + '1'] < x) lo = mid + 1;
        else hi = mid;
      }
      return pieces[lo];
    };
    const real = (x) => {
      if (!pieces.length) return end;
      if (x <= 0) return start;
      if (x >= length) return end;
      const p = piece('v', x);
      return p.t0 + ((x - p.v0) / (p.v1 - p.v0)) * (p.t1 - p.t0);
    };
    const virt = (t) => {
      if (!pieces.length || t >= end) return length;
      if (t <= start) return 0;
      const p = piece('t', t);
      return p.v0 + ((t - p.t0) / (p.t1 - p.t0)) * (p.v1 - p.v0);
    };
    // the quiet stretch the replay is passing through at `x`, if it is in one
    const quietAt = (x) => {
      if (!pieces.length || x <= 0 || x >= length) return null;
      const p = piece('v', x);
      return p.quiet ? { from: p.t0, to: p.t1 } : null;
    };
    const mine = new Map();
    for (const e of events) (mine.get(e.ticket) || mine.set(e.ticket, []).get(e.ticket)).push(e);

    // The board as it was at real time `t`: each ticket that existed then,
    // its column, since when, and the last line of its trail.
    function at(t) {
      const out = new Map();
      for (const tk of history.tickets) {
        let step = null;
        for (const s of tk.steps) if (s.at <= t) step = s; else break;
        if (!step) continue;
        let last = null;
        for (const e of mine.get(tk.id) || []) if (e.at <= t) last = e; else break;
        out.set(tk.id, { status: step.status, since: step.at, step: step.event, last });
      }
      return out;
    }
    return { start, end, length, real, virt, quietAt, at, tickets, events, moves: history.tickets.reduce((n, t) => n + t.steps.length, 0) };
  }

  root.K2Replay = { make, QUIET, LEAD };
})(typeof window !== 'undefined' ? window : globalThis);
