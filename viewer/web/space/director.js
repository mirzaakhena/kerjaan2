// Puts the board into the yard. Every ticket has a token: a rolled drawing
// while it is paper, a ship once it is being built. The director plays the
// trail of each ticket: every event in its turn, one scene at a time per
// ticket, with a clock of its own. The yard may lag behind the board, it never
// runs ahead; behind by much, it plays faster; behind by too much, it is put
// as the board is now, with no story (the limits are in plan.js).
import { picture, nextStep, FLEET, placeOf, seen, sameSeen, play, buildOf, paceOf, joins } from './plan.js';
// (What is drawn comes through `world.make`, so this module runs without a scene: tests/viewer.test.mjs.)

const BERTH_Y = 0.28;
const DRAFT = 0.75;
const LEVEL = 0.02; // a hull this near to its height has stopped moving
const FADE = 2; // seconds a cancelled token takes to fade away
const BUSY = 3; // with this many jobs waiting, a person is not asked for more: the token is just put in place
export const LAP = [0, 3, 7, 4]; // once round a hull: down one side, back by the street, down the other
const MEET = 6; // where on the slip the shipwright hears the verdict
const PINNED = { shelf: 'shelf', queue: 'queue', ready: 'queue' }; // where the drawing of a ticket lies
export const short = (s, n = 36) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

export class Director {
  constructor(scene, world, cast) {
    this.scene = scene;
    this.w = world;
    this.cast = cast; // { courier, planner, foreman, wrights: [one for each slip], inspector, crane, keeper }
    this.crew = () => {}; // set by the page: have this many shipwrights, one for each slip
    this.want = world.slips.length; // how many slips the board has places for; a slip beyond them takes no new hull
    this.tokens = new Map();
    this.slipOf = world.slips.map(() => null);
    this.anchorOf = world.anchors.map(() => null);
    this.fleet = []; // tokens at anchor, oldest first
    this.pic = null; // the board as last read
    this.early = []; // events of a ticket the board has not shown yet
    this.strange = new Set(); // tickets on the board that no event has brought, seen once
    this.ahead = 0; // the server's clock minus this page's
    this.speed = 1;
    this.clock = () => Date.now();
    this.ask = null; // set by the page: read the board again soon
    this.turn = 0; // whose hull the inspector goes to next
    this.party = null; // the order boat that has not left yet, and the orders it brings
    this.walk = null; // the architect's walk to the todo table that orders can still join
    this.sweep = 0;
  }

  // Ask a person to do something when they are free; resolves when it is done.
  // A person on such a job keeps the yard's pace (`hurry`), not their own.
  // With `at` (when the event behind it happened), it goes before the waiting jobs of later events.
  job(actor, run, at = null) {
    return new Promise((done) => {
      const job = { run: async (a) => { a.hurry = true; try { await run(a); } finally { a.hurry = false; } }, done, at };
      const i = at === null ? -1 : actor.jobs.findIndex((j) => j.at != null && j.at > at);
      if (i < 0) actor.jobs.push(job); else actor.jobs.splice(i, 0, job);
    });
  }

  // A move in the yard's time: shorter when the yard is catching up.
  move(o, to, secs) { return this.w.move(o, to, secs / this.speed); }

  // `D` is the board as it is now. `trail` is what happened since the last
  // read: { now, events, reread }, read after `D` (so it holds everything `D`
  // shows); without it only what is live on the board is taken over.
  update(D, trail = null) {
    const first = !this.pic;
    const pic = this.pic = picture(D);
    this.fit();
    // A ticket missing from one look may be a file caught half-written: it is kept, and forgotten
    // only when it has stayed away (see `frame`).
    for (const [id, tok] of this.tokens) {
      const p = pic.byId.get(id);
      tok.gone = p ? 0 : tok.gone || 0.001;
      if (p) { tok.board = p; this.look(tok); }
    }
    if (first) {
      // a page just opened shows the board as it is: no history is played
      const fresh = pic.tickets.map((p) => this.token(p, seen(p)));
      // oldest landed first, so the newest ends at the last anchor taken
      fresh.sort((a, b) => a.pic.landed - b.pic.landed || (a.id < b.id ? -1 : 1));
      for (const tok of fresh) this.put(tok, tok.pic.place);
    }
    if (trail) this.feed(pic, trail, first);
    this.pump();
    this.w.setFlags(pic.needs);
  }

  token(p, see) {
    const tok = { id: p.id, board: p, see, pic: null, place: null, obj: null, ship: null, slip: -1, anchor: -1, slot: null, busy: false, gone: 0, shown: 0, todo: [], playing: null, run: 0, odd: false, risen: null, rig: false, stay: false, meet: null, lapped: false, hook: null, drop: 0 };
    this.look(tok);
    tok.shown = tok.pic.build;
    tok.rig = tok.pic.rigged;
    this.tokens.set(p.id, tok);
    return tok;
  }

  // What the people and the page see of a ticket: the board for what is live
  // (who is on it, their step, a test, a question), the yard's own account for
  // where it is and how far it is built.
  look(tok) {
    const { status, rigged, rejected, crit } = tok.see;
    const place = placeOf(tok.see);
    tok.pic = { ...tok.board, status, place, rigged, rejected, crit, build: place === 'ready' ? 0 : buildOf(status, crit) };
    if (!rigged) tok.rig = false; // sails come down at once; they go up in the scene of the pass
  }

  // ----- the slips: as many as the board has places -----

  // The first slip free for a new hull; -1 when every one is taken.
  freeSlip() {
    for (let k = 0; k < Math.min(this.want, this.slipOf.length); k++) if (!this.slipOf[k]) return k;
    return -1;
  }

  // As many slips as `max_parallel`, and a shipwright for each. A slip that is to go stays while a ticket holds
  // it (and so do those before it: slips are taken away from the end); it takes no new one. Nothing is laid out
  // anew while a hull is on its way down a slipway.
  fit() {
    if (!this.pic) return;
    this.want = this.pic.docks;
    let n = this.want;
    this.slipOf.forEach((tok, k) => { if (tok) n = Math.max(n, k + 1); });
    if (n === this.slipOf.length && n === this.w.slips.length) return;
    for (const tok of this.tokens.values()) if (tok.adrift) return;
    if (this.w.setDocks) this.w.setDocks(n);
    this.crew(n);
    while (this.slipOf.length < n) this.slipOf.push(null);
    this.slipOf.length = n;
    // every hull goes with its slip
    this.slipOf.forEach((tok, k) => { if (tok && tok.ship && tok.place === 'slip') { tok.ship.o.position.x = this.w.slips[k].x; tok.ship.o.position.z = this.w.slips[k].z; } });
    this.layout();
  }

  // ----- the trail -----

  feed(pic, trail, first) {
    this.ahead = (trail.now || this.clock()) - this.clock();
    let again = first; // what happened between the two first reads is seen in the next
    const fed = new Set();
    const events = [...this.early, ...(trail.events || [])];
    this.early = [];
    for (const e of events) {
      let tok = this.tokens.get(e.ticket);
      if (!tok) {
        const p = pic.byId.get(e.ticket);
        if (!p) {
          // the board was read a moment before the trail: the ticket is in the next look, or never
          if (!e.waited) { this.early.push({ ...e, waited: true }); again = true; }
          continue;
        }
        if (e.event === 'created') {
          // it comes by the order boat, as blank as it was written
          tok = this.token(p, { status: 'backlog', crit: p.crit.map((c) => ({ ...c, done: false, void: false })), rigged: false, rejected: 0 });
          tok.place = 'mail';
          tok.born = e.at;
        } else {
          tok = this.token(p, seen(p));
          this.put(tok, tok.pic.place);
        }
      } else if (e.event === 'created' && tok.place !== 'mail') continue;
      tok.todo.push(e);
      fed.add(tok.id);
    }
    // On the board, and no event brought it (a file put there by hand): seen twice, it is put in place.
    const strange = new Set();
    for (const p of pic.tickets) {
      if (this.tokens.has(p.id)) continue;
      if (trail.reread || this.strange.has(p.id)) { const tok = this.token(p, seen(p)); this.put(tok, tok.pic.place); } else { strange.add(p.id); again = true; }
    }
    this.strange = strange;
    // The yard and the board differ and no event says why (a file changed by hand, an event this
    // yard does not know): seen twice, the ticket is put as the board has it.
    for (const tok of this.tokens.values()) {
      if (fed.has(tok.id) || tok.todo.length || tok.busy || tok.gone || sameSeen(tok.see, seen(tok.board))) { tok.odd = false; continue; }
      if (!tok.odd) { tok.odd = true; again = true; continue; }
      this.settle(tok);
    }
    if (trail.reread) this.catchUp(); // the server no longer knows where this page had read to
    if (again && this.ask) this.ask();
  }

  // Put a ticket as the board has it now, with no story; what was still to be played is dropped.
  settle(tok) {
    tok.run++; // a scene still running for it stops at its next step
    tok.todo = [];
    tok.playing = null;
    tok.odd = false;
    tok.see = seen(tok.board);
    this.look(tok);
    tok.rig = tok.pic.rigged;
    tok.stay = false;
    tok.meet = null;
    // a hull that stays on its slip is not rebuilt, unless a launch cut short has left it down the ramp
    // (or a drawing was in somebody's hands)
    if (tok.place !== tok.pic.place || tok.adrift) this.put(tok, tok.pic.place);
    else if (tok.risen) { const done = tok.risen; tok.risen = null; done(); }
  }

  catchUp() {
    this.early = [];
    for (const tok of this.tokens.values()) if (!tok.gone) this.settle(tok);
    if (this.ask) this.ask();
  }

  // How far the yard's clock is behind the board's: the age of the oldest event not yet played out.
  lag() {
    let oldest = Infinity;
    for (const e of this.early) oldest = Math.min(oldest, e.at);
    for (const tok of this.tokens.values()) {
      if (tok.gone) continue;
      const at = tok.playing ?? tok.todo[0]?.at;
      if (at < oldest) oldest = at;
    }
    return oldest === Infinity ? 0 : Math.max(0, this.clock() + this.ahead - oldest);
  }

  // ----- where a token is -----

  forget(tok) {
    this.clear(tok);
    this.tokens.delete(tok.id);
  }

  clear(tok) {
    if (tok.risen) { const done = tok.risen; tok.risen = null; done(); } // nobody waits for a hull that is gone
    if (tok.obj) { this.scene.remove(tok.obj); tok.obj = null; }
    this.stow(tok);
    tok.slot = null;
    if (tok.ship) {
      this.w.floatOff(tok.ship.o);
      this.scene.remove(tok.ship.o);
      tok.ship.dispose();
      tok.ship = null;
    }
    if (tok.slip >= 0) { this.slipOf[tok.slip] = null; tok.slip = -1; }
    if (tok.anchor >= 0) { this.anchorOf[tok.anchor] = null; tok.anchor = -1; }
    const i = this.fleet.indexOf(tok);
    if (i >= 0) this.fleet.splice(i, 1);
    tok.adrift = false;
  }

  // The anchor is taken in, with no story.
  stow(tok) {
    if (tok.hook) { this.scene.remove(tok.hook.o); tok.hook = null; }
    tok.drop = 0;
  }

  launchShip(tok) {
    tok.ship = this.w.make.ship(tok.pic.size, tok.pic.livery);
    tok.ship.o.userData.ticket = tok.id;
    this.scene.add(tok.ship.o);
    return tok.ship;
  }

  berth(tok, k) {
    this.slipOf[k] = tok;
    tok.slip = k;
    const ship = this.launchShip(tok);
    ship.o.position.set(this.w.slips[k].x, BERTH_Y, this.w.slips[k].z);
    tok.shown = 0.04;
    ship.setBuild(tok.shown);
    ship.setRigged(false);
    tok.place = 'slip';
  }

  // Put a token where it belongs, with no story.
  put(tok, place) {
    const mine = tok.slip; // a slip it holds already is kept
    this.clear(tok);
    if (place === 'slip' || place === 'ready') {
      const k = mine >= 0 ? mine : this.freeSlip();
      if (k >= 0 && place === 'slip') {
        this.berth(tok, k);
        tok.shown = tok.pic.build;
        return;
      }
      if (k >= 0) { this.slipOf[k] = tok; tok.slip = k; } // its name is up; its drawing still lies on the todo table
      else place = 'queue'; // every slip is taken: its drawing waits on the todo table until one is free
    }
    if (place === 'shelf' || place === 'queue' || place === 'ready') {
      tok.obj = this.w.make.scroll();
      tok.obj.userData.ticket = tok.id;
      tok.obj.visible = false; // until `layout` gives it a slot
      this.scene.add(tok.obj);
    }
    if (place === 'bay' && this.pic.fleet.includes(tok.id)) {
      if (this.fleet.length >= FLEET) { const old = this.fleet[0]; this.clear(old); }
      const a = this.anchorOf.indexOf(null);
      const at = this.w.anchors[a];
      const ship = this.launchShip(tok);
      ship.setBuild(1);
      ship.setRigged(true);
      ship.o.position.set(at.x, this.w.sea - DRAFT, at.z);
      ship.o.rotation.y = at.ry;
      this.w.floatOn(ship.o, DRAFT);
      this.anchorOf[a] = tok;
      tok.anchor = a;
      this.fleet.push(tok);
    }
    tok.place = place;
    this.layout();
  }

  // Drawings on the order board and on the todo table take the slots in order. On the table, in the
  // order of the queue: in the front row what may start, in the back row what waits for another
  // ticket. One that changes row or place on the table slides there.
  layout() {
    const on = (place, by) => [...this.tokens.values()].filter((t) => PINNED[t.place] === place && t.obj).sort(by);
    const fill = (list, slots) => list.forEach((t, i) => {
      const s = slots[i] || null;
      const was = t.slot;
      t.slot = s;
      t.obj.visible = !!s;
      if (!s || s === was) return;
      if (was && PINNED[t.place] === 'queue') { this.w.move(t.obj, { x: s.x, y: s.y, z: s.z }, 0.9); return; }
      t.obj.position.set(s.x, s.y, s.z);
      t.obj.rotation.set(0, s.ry, 0);
    });
    fill(on('shelf', (a, b) => (a.id < b.id ? -1 : 1)), this.w.shelfSlots);
    // those whose slip is ready come first: they are the next to be fetched
    const table = on('queue', (a, b) => (b.place === 'ready') - (a.place === 'ready') || a.pic.order - b.pic.order || (a.id < b.id ? -1 : 1));
    for (const t of table) if (t.obj.userData.tie) t.obj.userData.tie(t.pic.waiting);
    fill(table.filter((t) => !t.pic.waiting), this.w.queueSlots);
    fill(table.filter((t) => t.pic.waiting), this.w.waitSlots);
  }

  // ----- playing the trail: one event of a ticket at a time, each to its end -----

  // The one step that brings a token nearer to where the yard's account has it; null when it is
  // there, or must wait for a slip.
  stepFor(tok) {
    const step = nextStep(tok.place, tok.pic.place);
    // landed before it ever had a slip: it takes none from those at work
    if (step && tok.pic.place === 'bay' && tok.place !== 'slip') return 'reset';
    if (step === 'prepare' && tok.slip < 0 && this.freeSlip() < 0) return null; // waits for a slip, as a drawing
    return step;
  }

  // How high the hull of a token on a slip is to stand; null when it has none there.
  goal(tok) {
    if (tok.place !== 'slip' || !tok.ship) return null;
    if (tok.stay) return tok.shown; // sent back: it stands as it stood until the inspector has said so
    return tok.pic.status === 'done' ? 1 : tok.pic.build; // done: on its way down the ramp
  }

  uneven(tok) {
    const goal = this.goal(tok);
    return goal !== null && Math.abs(goal - tok.shown) > LEVEL;
  }

  // Resolves when the hull stands as high as it should (`frame` moves it).
  rise(tok) {
    return new Promise((done) => { tok.risen = done; });
  }

  pump() {
    for (const tok of this.tokens.values()) {
      if (tok.busy || tok.gone) continue;
      // events with no scene are over at once; the first that has one is played to its end
      let verdict = null, at = null, played = false;
      while (tok.todo.length && !verdict && !this.stepFor(tok) && !this.uneven(tok)) {
        const e = tok.todo.shift();
        verdict = play(tok.see, e);
        this.look(tok);
        at = e.at;
        played = true;
      }
      if (!verdict && !this.stepFor(tok) && !this.uneven(tok)) {
        // all of it shown: the board may have been read before the last of these events
        if (played && this.ask) this.ask();
        continue;
      }
      tok.busy = true;
      tok.playing = at;
      tok.stay = verdict === 'reject';
      const run = tok.run;
      const live = () => tok.run === run;
      this.story(tok, verdict, live)
        .catch((e) => { console.error(`scene ${tok.id}:`, e); if (live()) this.put(tok, tok.pic.place); })
        .finally(() => {
          tok.stay = false;
          tok.busy = false;
          tok.playing = null;
          if (!tok.todo.length && this.ask) this.ask();
          this.pump();
        });
    }
    this.layout();
  }

  // Carry the token to where the event left it, step by step; then the scene of the review, if the
  // event was one. `scene` is what `play` said: 'handed', 'pass', 'reject' or 'cheer'.
  async story(tok, scene, live) {
    for (let step; live() && (step = this.stepFor(tok));) {
      if (step === 'prepare' && tok.slip < 0) {
        // the slip is taken here and now, so two that start in one look never get the same one
        const k = this.freeSlip();
        this.slipOf[k] = tok;
        tok.slip = k;
      }
      await this[step](tok, live);
    }
    // a hull that an event raised or lowered is seen to move before the next event plays
    if (live() && this.uneven(tok)) await this.rise(tok);
    if (scene && live() && tok.place === 'slip') {
      if (scene === 'handed') await this.handed(tok, live);
      else if (scene === 'cheer') await this.cheer(tok, live);
      else await this.verdict(tok, scene === 'pass', live);
    }
    if (!live()) return;
    tok.rig = tok.pic.rigged; // whatever became of the scene, the sails are as the event left them
    // sent back: the hull comes down once the inspector has said so
    tok.stay = false;
    if (this.uneven(tok)) await this.rise(tok);
  }

  reset(tok) { this.put(tok, tok.pic.place); }

  // mail -> shelf: the order comes with its party by the order boat, and the courier files them all
  async deliver(tok, live) {
    // a boat that has left, or whose last order is too old, is not joined: the next one comes when it is gone
    while (this.party && !joins(this.party, tok.born)) await this.party.gone;
    const party = this.party || this.sail();
    party.last = tok.born;
    party.titles.push(tok.pic.title);
    await party.filed;
    if (live()) this.put(tok, 'shelf');
  }

  // One boat and one walk of the courier for a whole party. In from the open sea; the courier goes
  // out only once it lies at the pier, takes the one crate, and the boat leaves by the other side.
  sail() {
    const { courier } = this.cast;
    const party = this.party = { last: 0, open: true, titles: [], filed: null, gone: null };
    let left;
    party.gone = new Promise((done) => { left = done; });
    const leave = async () => {
      party.open = false;
      try { await this.w.mailOut(this.speed); } finally {
        if (this.party === party) this.party = null;
        left();
      }
    };
    party.filed = (async () => {
      try {
        await this.w.mailIn(this.speed);
        await this.job(courier, async (a) => {
          a.doing = 'walking out to the order boat';
          await a.goTo(this.w.stations.pierEnd);
          await a.act('pick-up', 1.2);
          this.w.mailTake();
          a.hold(this.w.make.crate());
          a.say('!', 2);
          leave();
          const n = party.titles.length;
          a.doing = n > 1 ? `carrying ${n} new orders to the office` : `carrying the order “${short(party.titles[0])}” to the office`;
          await a.goTo(this.w.stations.shelf);
          await a.act('interact-right', 1);
          a.hold(null);
        });
      } finally {
        if (party.open) leave(); // nobody came for it
      }
    })().catch((e) => console.error('order boat:', e));
    return party;
  }

  // shelf -> queue: the architect takes the order off the order board and lays it on the todo table.
  // Orders that became todo about the same time go in one walk: each joins the walk that has not
  // left the order board yet.
  async plan(tok, live) {
    const { planner } = this.cast;
    let walk = this.walk;
    if (!walk && planner.jobs.length < BUSY) {
      walk = this.walk = { load: [], done: null };
      walk.done = this.job(planner, async (a) => {
        a.doing = 'taking orders off the order board';
        await a.goTo(this.w.stations.shelf);
        await a.act('pick-up', 1.2);
        this.walk = null; // an order that comes now is for the next walk
        const load = walk.load.filter((x) => x.live());
        if (!load.length) return;
        for (const x of load) if (x.tok.obj) { this.scene.remove(x.tok.obj); x.tok.obj = null; x.tok.adrift = true; }
        a.hold(this.w.make.scroll());
        a.doing = load.length === 1 ? `carrying “${short(load[0].tok.pic.title)}” to the todo table` : `carrying ${load.length} orders to the todo table`;
        await a.goTo(this.w.stations.queue);
        a.doing = load.length === 1 ? `laying “${short(load[0].tok.pic.title)}” on the todo table` : `laying ${load.length} orders on the todo table`;
        for (const x of load) {
          await a.act('interact-right', 0.8);
          if (x.live()) this.put(x.tok, 'queue');
        }
        a.hold(null);
      });
    }
    if (walk) {
      walk.load.push({ tok, live });
      await walk.done;
    }
    if (live() && tok.place !== 'queue') this.put(tok, 'queue');
  }

  // queue -> ready (`k2 start`): a slip is made ready for the ticket and its name put up. The foreman looks in
  // and greets the slip's shipwright; he carries nothing. The drawing stays on the todo table.
  async prepare(tok) {
    const { foreman, wrights } = this.cast;
    const k = tok.slip; // taken for it in `story`
    if (k < 0) return this.put(tok, tok.pic.place);
    tok.place = 'ready';
    this.layout();
    if (foreman.jobs.length >= BUSY) return;
    await this.job(foreman, async (a) => {
      a.doing = `having slip ${k + 1} made ready for “${short(tok.pic.title)}”`;
      if (this.w.slips[k]) await a.goTo(this.w.slips[k].spots[4]);
      a.say('!', 2);
      if (wrights[k]) wrights[k].say('!', 2);
      await a.act('emote-yes', 1.6);
    });
  }

  // ready -> slip (a worker is sent): the slip's own shipwright walks to the queue, takes the drawing and
  // carries it back; the keel is laid when he is there, not before.
  async fetch(tok, live) {
    const k = tok.slip;
    if (k < 0) return this.put(tok, tok.pic.place);
    const wright = this.cast.wrights[k];
    if (wright && wright.jobs.length < BUSY) {
      await this.job(wright, async (a) => {
        a.doing = `fetching the drawing of “${short(tok.pic.title)}”`;
        await a.goTo({ ...this.w.stations.queue, x: this.w.stations.queue.x + 1.2 });
        await a.act('interact-left', 1.2);
        if (live() && tok.obj) { this.scene.remove(tok.obj); tok.obj = null; }
        a.hold(this.w.make.scroll());
        a.doing = `carrying “${short(tok.pic.title)}” to slip ${k + 1}`;
        if (this.w.slips[k]) await a.goTo(this.w.slips[k].spots[0]);
        await a.act('interact-right', 1);
        a.hold(null);
      });
    }
    if (!live() || tok.slip !== k) return;
    this.clear(tok);
    this.berth(tok, k);
  }

  // slip -> bay: down the ramp, out to an anchor; the oldest ship at anchor sails away
  async launch(tok, live) {
    const { crane, wrights, inspector } = this.cast;
    const k = tok.slip;
    const ship = tok.ship;
    if (!ship || crane.jobs.length >= BUSY) return this.put(tok, 'bay');
    await this.job(crane, async (a) => {
      a.doing = `launching “${short(tok.pic.title)}”`;
      this.w.crane.aim = 0.2;
      await a.goTo(this.w.slips[k].spots[7]);
      await a.act('interact-left', 1.6);
      if (!live()) return;
      tok.adrift = true;
      tok.shown = 1;
      ship.setBuild(1);
      ship.setRigged(true);
      if (wrights[k]) wrights[k].say('✓', 3);
      inspector.say('✓', 3);
      await this.move(ship.o, { z: 0.5 }, 2.6 * Math.max(1, (0.5 - ship.o.position.z) / 6.9)); // further from the back row
      await this.move(ship.o, { z: 10.5, y: this.w.sea - DRAFT }, 4.2);
      a.say('✓', 2.5);
      await a.act('emote-yes', 1.8);
    });
    if (!live()) return;
    tok.adrift = false;
    this.stow(tok);
    this.slipOf[k] = null;
    tok.slip = -1;
    tok.place = 'bay';
    this.w.floatOn(ship.o, DRAFT);
    if (this.fleet.length >= FLEET) this.sailAway(this.fleet[0]);
    const n = this.anchorOf.indexOf(null);
    const at = this.w.anchors[n];
    this.anchorOf[n] = tok;
    tok.anchor = n;
    this.fleet.push(tok);
    this.pump(); // the slip is free: a drawing that waited for one may start
    const o = ship.o;
    const heading = Math.atan2(at.x - o.position.x, at.z - o.position.z);
    await this.move(o, { ry: heading }, 1.6);
    await this.move(o, { x: at.x, z: at.z }, 3 + Math.hypot(at.x - o.position.x, at.z - o.position.z) / 3.2);
    await this.move(o, { ry: at.ry }, 2);
  }

  // The oldest ship leaves the bay: out to the open edge, smaller and smaller.
  sailAway(tok) {
    const i = this.fleet.indexOf(tok);
    if (i >= 0) this.fleet.splice(i, 1);
    if (tok.anchor >= 0) { this.anchorOf[tok.anchor] = null; tok.anchor = -1; }
    const ship = tok.ship;
    if (!ship) return;
    tok.ship = null;
    const o = ship.o;
    this.w.move(o, { ry: 0 }, 1.5)
      .then(() => this.w.move(o, { z: 25.4, s: 0.02 }, 5))
      .then(() => { this.w.floatOff(o); this.scene.remove(o); ship.dispose(); });
  }

  // anywhere -> scrap: no story. The token fades slowly out of sight where it is, and the place it
  // held is free at once. Nobody walks or works for it.
  scrap(tok) {
    const o = tok.ship ? tok.ship.o : tok.obj;
    const ship = tok.ship;
    tok.ship = null; // `put` must not take the thing away: it is left to fade
    tok.obj = null;
    this.put(tok, 'scrap');
    if (!o) return;
    this.w.fade(o, FADE).then(() => {
      if (ship) { this.w.floatOff(o); ship.dispose(); }
      this.scene.remove(o);
    });
  }

  // ----- what changes while a ticket stays where it is -----

  // Handed over for review: the shipwright jumps for joy. The inspector has this hull still to go round.
  async handed(tok, live) {
    const k = tok.slip;
    tok.lapped = false;
    if (!this.cast.wrights[k]) return;
    await this.job(this.cast.wrights[k], async (a) => {
      if (!live() || tok.slip !== k) return;
      a.doing = `handing “${short(tok.pic.title)}” over for inspection`;
      a.say('🥳', 3);
      await a.act('jump', 2.2, { repeat: true });
    });
  }

  // Passed with no reviewer (the light lane, or accepted by the owner): the shipwright jumps for
  // joy and the sails go up. No inspector comes: the yard does not show what did not happen.
  async cheer(tok, live) {
    const k = tok.slip;
    if (!this.cast.wrights[k]) { tok.rig = true; return; }
    await this.job(this.cast.wrights[k], async (a) => {
      if (!live() || tok.slip !== k) return;
      a.doing = `“${short(tok.pic.title)}” passed: setting the sails`;
      tok.rig = true;
      a.say('🥳', 3);
      await a.act('jump', 2.2, { repeat: true });
    });
  }

  // The verdict, at the hull. The shipwright waits at the slip; the inspector comes (however many
  // hulls wait for him: one after the other, in the order of their events), goes round the hull if
  // he has not yet, and walks up to the shipwright. Passed: a few words, the sails go up, the
  // shipwright is glad. Sent back: ❌, the shipwright is sad and goes back to work.
  async verdict(tok, pass, live) {
    const { inspector, wrights } = this.cast;
    const k = tok.slip;
    const wright = wrights[k], side = this.w.slips[k].spots, at = side[MEET];
    const title = `“${short(tok.pic.title)}”`;
    const there = () => live() && tok.slip === k && tok.place === 'slip'; // the hull has not left since
    tok.meet = MEET; // the shipwright stays there between the jobs (cast.js)
    try {
      // both are asked at once: the inspector's turn is taken by when the verdict was given, not by
      // how fast a shipwright walks
      const waiting = wright && this.job(wright, async (a) => {
        if (!there()) return;
        a.doing = `waiting for the inspector's word on ${title}`;
        await a.goTo({ ...at, face: 0 });
      });
      const given = this.job(inspector, async (a) => {
        if (!there()) return;
        if (!tok.lapped) {
          a.doing = `inspecting ${title}`;
          for (const i of LAP) {
            await a.goTo(side[i]);
            if (!there()) return;
            await a.act('interact-right', 1.2);
          }
          tok.lapped = true;
        }
        a.doing = pass ? `passing ${title}` : `sending ${title} back`;
        await a.goTo({ x: at.x, z: at.z + 1.4, face: Math.PI });
        if (!there()) return;
        if (pass) {
          a.say('💬', 2.2);
          await a.act('interact-right', 2.2, { repeat: true });
          a.say('✓', 3);
          await a.act('emote-yes', 1.6);
        } else {
          a.say('❌', 3.5);
          await a.act('emote-no', 2.4);
        }
      }, tok.playing);
      await waiting;
      await given;
    } finally {
      tok.meet = null;
    }
    if (!there()) return;
    if (pass) tok.rig = true;
    else tok.stay = false;
    if (wright) await this.job(wright, async (a) => {
      if (!there()) return;
      if (pass) {
        a.doing = `${title} passed`;
        a.say('😄', 3);
        await a.act('jump', 2.2, { repeat: true });
      } else {
        a.doing = `${title} was sent back`;
        a.say('😢', 3.5);
        await a.act('emote-no', 2.6);
        a.doing = `back to work on ${title}`;
        await a.goTo(side[k % 2 ? 5 : 1]);
        await a.act('attack-melee-right', 2, { repeat: true });
      }
    });
  }

  // The anchor of a hull on a slip: down while it has passed and is held or stopped, up again
  // (and stowed) once it is let go. Read from the board as it is: no event says a hold was lifted.
  moor(tok, k, dt) {
    const down = tok.rig && tok.pic.status === 'review' && tok.pic.moored;
    if (!down && !tok.hook) return;
    if (!tok.hook) {
      tok.hook = this.w.make.anchor(this.w.slips[k]);
      this.scene.add(tok.hook.o);
    }
    tok.drop = Math.max(0, Math.min(1, tok.drop + (down ? 1 : -1) * dt * this.speed * 0.7));
    tok.hook.at(this.w.slips[k]); // the slips may have been laid out anew
    tok.hook.set(tok.drop);
    if (!down && tok.drop <= 0) { this.scene.remove(tok.hook.o); tok.hook = null; }
  }

  // The token on a slip, once its keel is laid.
  onSlip(k) {
    const tok = this.slipOf[k];
    return tok && tok.ship && tok.place === 'slip' && !tok.gone ? tok : null;
  }

  // The ship under review that has a reviewer on it, if any.
  underReview() {
    const list = this.slipOf.filter((t) => t && t.ship && t.place === 'slip' && !t.gone && t.pic.status === 'review' && t.pic.reviewer !== 'away');
    return list.length ? list[this.turn++ % list.length] : null; // each in turn
  }

  frame(dt) {
    const pace = paceOf(this.lag());
    this.speed = pace || 1;
    if (!pace) this.catchUp(); // too far behind for a story
    // once a second: forget the tickets that have been off the board for a while
    this.sweep += dt;
    if (this.sweep >= 1) {
      this.fit(); // a slip that was to go has lost its ship, or a hull has reached the water
      for (const tok of [...this.tokens.values()]) {
        if (!tok.gone) continue;
        tok.gone += this.sweep;
        if (tok.gone > 4 && !tok.busy) this.forget(tok);
      }
      this.sweep = 0;
    }
    this.slipOf.forEach((tok, k) => {
      const slip = this.w.slips[k];
      if (!slip) return;
      if (!tok || !tok.ship || tok.place !== 'slip') { slip.lamp(null); slip.label(tok ? `${tok.id.slice(8)} ${tok.pic.title}` : ''); return; }
      const p = tok.pic;
      const landed = p.status === 'done'; // on its way down the ramp
      // the hull stands as high as the criteria met: it moves when one is met, taken back or struck out
      const goal = this.goal(tok);
      tok.shown += (goal - tok.shown) * Math.min(1, dt * this.speed * 0.5);
      if (tok.risen && !this.uneven(tok)) { const done = tok.risen; tok.risen = null; done(); }
      tok.ship.setBuild(landed ? 1 : tok.shown);
      tok.ship.setRigged(landed || tok.rig);
      this.moor(tok, k, dt);
      slip.lamp(p.testing);
      slip.label(`${tok.id.slice(8)} ${p.title}`);
    });
  }

  // What a click can land on: every ship and every drawing.
  pickables() {
    const out = [];
    for (const tok of this.tokens.values()) {
      if (tok.ship) out.push(tok.ship.o);
      if (tok.obj && tok.obj.visible) out.push(tok.obj);
    }
    return out;
  }
}

// What the architect does while no ticket is in their hands. For as long as the board says the
// planner is at work, they stand at the order board and read the orders; while a question of the
// planner waits for the owner they show a "?", and between two turns of the planner they stay
// there, still, until every such question is answered. Otherwise this is no duty (cast.js).
export async function plannerDuty(a, w, dir) {
  const now = () => (dir && dir.pic ? dir.pic.planner : null);
  const due = (p) => !!p && (p.reading || p.asks > 0);
  if (!due(now())) return false;
  await a.goTo(w.stations.reading);
  const p = now();
  if (!due(p)) return true; // over while they walked
  if (p.asks) a.say('?', 3.4);
  if (p.reading) {
    a.doing = p.step ? `reading the orders: ${p.step}` : 'reading the orders';
    await a.act('interact-right', 2.6, { repeat: true });
  } else {
    a.doing = `waiting for the owner's answer to ${p.asks === 1 ? 'a question' : `${p.asks} questions`} about the orders`;
    await a.act('idle', 2.6);
  }
  return true;
}
