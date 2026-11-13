// Puts the board into the yard. Every ticket has a token: a rolled drawing
// while it is paper, a ship once it is being built. When the board says a
// ticket is somewhere else, the director has the people carry it there, one
// step at a time; the yard may lag behind the board, it never runs ahead.
import { picture, nextStep, FLEET } from './plan.js';
// (What is drawn comes through `world.make`, so this module runs without a scene: tests/viewer.test.mjs.)

const BERTH_Y = 0.28;
const DRAFT = 0.75;
const BUSY = 3; // with this many jobs waiting, a person is not asked for more: the token is just put in place
export const short = (s, n = 36) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

export class Director {
  constructor(scene, world, cast) {
    this.scene = scene;
    this.w = world;
    this.cast = cast; // { courier, planner, foreman, wrights: [4], inspector, crane, keeper }
    this.tokens = new Map();
    this.slipOf = world.slips.map(() => null);
    this.anchorOf = world.anchors.map(() => null);
    this.fleet = []; // tokens at anchor, oldest first
    this.pic = null;
    this.turn = 0; // whose hull the inspector goes to next
    this.mails = 0; // orders the courier has still to fetch from the mail boat
    this.sweep = 0;
  }

  // Ask a person to do something when they are free; resolves when it is done.
  job(actor, run) {
    return new Promise((done) => { actor.jobs.push({ run, done }); });
  }

  update(D) {
    const first = !this.pic;
    const pic = this.pic = picture(D);
    // A ticket missing from one look may be a file caught half-written: it is kept, and forgotten
    // only when it has stayed away (see `frame`).
    for (const [id, tok] of this.tokens) tok.gone = pic.byId.has(id) ? 0 : tok.gone || 0.001;
    const fresh = [];
    for (const p of pic.tickets) {
      const tok = this.tokens.get(p.id);
      if (tok) { this.notice(tok, tok.pic, p); tok.pic = p; continue; }
      // a ticket first seen while the page is open came by the mail boat, whatever its status
      const made = { id: p.id, pic: p, place: first ? null : 'mail', obj: null, ship: null, slip: -1, anchor: -1, busy: false, gone: 0, shown: p.build, creep: p.build, breaking: false };
      this.tokens.set(p.id, made);
      if (first) fresh.push(made);
    }
    // oldest landed first, so the newest ends at the last anchor taken
    fresh.sort((a, b) => a.pic.landed - b.pic.landed || (a.id < b.id ? -1 : 1));
    for (const tok of fresh) this.put(tok, tok.pic.place);
    this.advance();
    this.w.setFlags(pic.needs);
  }

  // ----- where a token is -----

  forget(tok) {
    this.clear(tok);
    this.tokens.delete(tok.id);
  }

  clear(tok) {
    if (tok.obj) { this.scene.remove(tok.obj); tok.obj = null; }
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
    tok.breaking = false;
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
    ship.o.position.set(this.w.slips[k].x, BERTH_Y, -6.4);
    tok.shown = 0.04;
    tok.creep = tok.pic.build;
    ship.setBuild(tok.shown);
    ship.setRigged(false);
    tok.place = 'slip';
  }

  // Put a token where it belongs, with no story.
  put(tok, place) {
    const reserved = tok.place === 'queue' ? tok.slip : -1;
    this.clear(tok);
    if (place === 'slip') {
      const k = reserved >= 0 ? reserved : this.slipOf.indexOf(null);
      if (k >= 0) {
        this.berth(tok, k);
        tok.shown = tok.pic.build;
        return;
      }
      place = 'queue'; // every slip is taken: its drawing waits on the board until one is free
    }
    if (place === 'shelf' || place === 'queue') {
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

  // Drawings on the shelf and on the queue board take the slots in order.
  layout() {
    const fill = (place, slots, by) => {
      const list = [...this.tokens.values()].filter((t) => t.place === place && t.obj).sort(by);
      list.forEach((t, i) => {
        const s = slots[i];
        t.obj.visible = !!s;
        if (s) { t.obj.position.set(s.x, s.y, s.z); t.obj.rotation.set(0, s.ry, 0); }
      });
    };
    fill('shelf', this.w.shelfSlots, (a, b) => (a.id < b.id ? -1 : 1));
    fill('queue', this.w.queueSlots, (a, b) => a.pic.order - b.pic.order || (a.id < b.id ? -1 : 1));
  }

  // ----- carrying a token one step nearer to where the board has it -----

  advance() {
    for (const tok of this.tokens.values()) {
      if (tok.busy || tok.gone) continue;
      let step = nextStep(tok.place, tok.pic.place);
      if (!step) continue;
      // landed before it ever had a slip: it takes none from those at work
      if (tok.pic.place === 'bay' && tok.place !== 'slip') step = 'reset';
      if (step === 'start') {
        // the slip is taken here and now, so two that start in one look never get the same one
        const k = this.slipOf.indexOf(null);
        if (k < 0) continue; // waits for a slip
        this.slipOf[k] = tok;
        tok.slip = k;
      }
      tok.busy = true;
      Promise.resolve()
        .then(() => this[step](tok))
        .catch((e) => { console.error(`${step} ${tok.id}:`, e); this.put(tok, tok.pic.place); })
        .finally(() => {
          tok.busy = false;
          this.advance();
        });
    }
    this.layout();
  }

  reset(tok) { this.put(tok, tok.pic.place); }

  // mail -> shelf: the courier meets the mail boat and files the order
  async deliver(tok) {
    const { courier } = this.cast;
    if (courier.jobs.length < BUSY) {
      this.mails++;
      this.w.mailIn();
      await this.job(courier, async (a) => {
        a.doing = 'walking out to the mail boat';
        await a.goTo(this.w.stations.pierEnd);
        await a.act('pick-up', 1.2);
        a.hold(this.w.make.scroll());
        a.say('!', 2);
        a.doing = `carrying the order “${short(tok.pic.title)}” to the office`;
        await a.goTo(this.w.stations.shelf);
        await a.act('interact-right', 1);
        a.hold(null);
      });
      if (!--this.mails) this.w.mailOut();
    }
    this.put(tok, 'shelf');
  }

  // shelf -> queue: the draughtsman draws it up and pins it on the board
  async plan(tok) {
    const { planner } = this.cast;
    if (planner.jobs.length < BUSY) {
      await this.job(planner, async (a) => {
        a.doing = `fetching the order “${short(tok.pic.title)}”`;
        await a.goTo(this.w.stations.shelf);
        await a.act('pick-up', 1.2);
        if (tok.obj) { this.scene.remove(tok.obj); tok.obj = null; }
        a.hold(this.w.make.scroll());
        await a.goTo(this.w.stations.drafting);
        a.hold(null);
        a.doing = `drawing the plan for “${short(tok.pic.title)}”`;
        await a.act('interact-right', 3.5, { repeat: true });
        a.say('…', 2.5);
        await a.act('idle', 2.5);
        await a.act('interact-left', 2.5, { repeat: true });
        a.hold(this.w.make.scroll());
        a.doing = `pinning “${short(tok.pic.title)}” on the queue`;
        await a.goTo({ ...this.w.stations.queue, x: this.w.stations.queue.x - 1 });
        await a.act('interact-right', 1.2);
        a.hold(null);
      });
    }
    this.put(tok, 'queue');
  }

  // queue -> slip: the foreman takes the drawing to a free slip and the keel is laid
  async start(tok) {
    const { foreman, wrights } = this.cast;
    const k = tok.slip; // taken for it in `advance`, kept while the foreman walks
    if (k < 0) return this.put(tok, tok.pic.place);
    if (foreman.jobs.length < BUSY) {
      await this.job(foreman, async (a) => {
        a.doing = `taking “${short(tok.pic.title)}” off the queue`;
        await a.goTo({ ...this.w.stations.queue, x: this.w.stations.queue.x + 1 });
        await a.act('interact-left', 1.2);
        if (tok.obj) { this.scene.remove(tok.obj); tok.obj = null; }
        a.hold(this.w.make.scroll());
        a.doing = `taking “${short(tok.pic.title)}” to slip ${k + 1}`;
        await a.goTo(this.w.slips[k].spots[0]);
        await a.act('interact-right', 1);
        a.hold(null);
        wrights[k].say('!', 2);
      });
    }
    this.clear(tok);
    this.berth(tok, k);
  }

  // slip -> bay: down the ramp, out to an anchor; the oldest ship at anchor sails away
  async launch(tok) {
    const { crane, wrights, inspector } = this.cast;
    const k = tok.slip;
    const ship = tok.ship;
    if (!ship || crane.jobs.length >= BUSY) return this.put(tok, 'bay');
    await this.job(crane, async (a) => {
      a.doing = `launching “${short(tok.pic.title)}”`;
      this.w.crane.aim = 0.2;
      await a.goTo(this.w.slips[k].spots[7]);
      await a.act('interact-left', 1.6);
      tok.shown = 1;
      ship.setBuild(1);
      ship.setRigged(true);
      wrights[k].say('✓', 3);
      inspector.say('✓', 3);
      await this.w.move(ship.o, { z: 0.5 }, 2.6);
      await this.w.move(ship.o, { z: 10.5, y: this.w.sea - DRAFT }, 4.2);
      a.say('✓', 2.5);
      await a.act('emote-yes', 1.8);
    });
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
    const o = ship.o;
    const heading = Math.atan2(at.x - o.position.x, at.z - o.position.z);
    await this.w.move(o, { ry: heading }, 1.6);
    await this.w.move(o, { x: at.x, z: at.z }, 3 + Math.hypot(at.x - o.position.x, at.z - o.position.z) / 3.2);
    await this.w.move(o, { ry: at.ry }, 2);
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

  // anywhere -> scrap: a hull is broken up for timber, a drawing is thrown out
  async scrap(tok) {
    const { courier, wrights } = this.cast;
    const title = short(tok.pic.title);
    if (tok.ship && tok.slip >= 0 && wrights[tok.slip].jobs.length < BUSY) {
      const k = tok.slip;
      await this.job(wrights[k], async (a) => {
        a.doing = `breaking up “${title}”`;
        await a.goTo(this.w.slips[k].spots[k % 2 ? 5 : 1]);
        tok.breaking = true;
        await a.act('attack-melee-right', 3.5, { repeat: true });
        a.hold(this.w.make.plank());
        a.doing = 'carrying the timber back';
        await a.goTo(this.w.stations.timber);
        await a.act('interact-right', 0.9);
        a.hold(null);
      });
    } else if (tok.obj && courier.jobs.length < BUSY) {
      const from = tok.place === 'queue' ? this.w.stations.queue : this.w.stations.shelf;
      await this.job(courier, async (a) => {
        a.doing = `taking the cancelled order “${title}” away`;
        await a.goTo(from);
        await a.act('pick-up', 1.2);
        if (tok.obj) { this.scene.remove(tok.obj); tok.obj = null; }
        a.hold(this.w.make.scroll());
        await a.goTo({ ...this.w.stations.timber, x: this.w.stations.timber.x + 3.5 });
        await a.act('interact-right', 0.9);
        a.hold(null);
      });
    }
    this.put(tok, 'scrap');
  }

  // ----- what changes while a ticket stays where it is -----

  notice(tok, was, now) {
    if (tok.place !== 'slip' || tok.slip < 0 || tok.busy) return;
    if (now.rejected > was.rejected) this.verdict(tok, false);
    else if (now.rigged && !was.rigged) this.verdict(tok, true);
  }

  verdict(tok, pass) {
    const { inspector, wrights } = this.cast;
    const k = tok.slip;
    if (!pass) tok.creep = 0;
    if (inspector.jobs.length >= BUSY) return;
    this.job(inspector, async (a) => {
      if (tok.slip !== k || tok.place !== 'slip') return; // the hull has left since
      a.doing = pass ? `passing “${short(tok.pic.title)}”` : `sending “${short(tok.pic.title)}” back`;
      await a.goTo(this.w.slips[k].spots[3]);
      if (tok.slip !== k || tok.place !== 'slip') return;
      await a.act('interact-right', 1.2);
      a.say(pass ? '✓' : '✗', 3);
      wrights[k].say(pass ? '✓' : '?', 3);
      await a.act(pass ? 'emote-yes' : 'emote-no', 2);
    });
  }

  // The token on a slip, once its keel is laid.
  onSlip(k) {
    const tok = this.slipOf[k];
    return tok && tok.ship && tok.place === 'slip' && !tok.breaking && !tok.gone ? tok : null;
  }

  // The ship under review that has a reviewer on it, if any.
  underReview() {
    const list = this.slipOf.filter((t) => t && t.ship && t.place === 'slip' && !t.gone && t.pic.reviewer !== 'away');
    return list.length ? list[this.turn++ % list.length] : null; // each in turn
  }

  frame(dt) {
    // once a second: forget the tickets that have been off the board for a while
    this.sweep += dt;
    if (this.sweep >= 1) {
      for (const tok of [...this.tokens.values()]) {
        if (!tok.gone) continue;
        tok.gone += this.sweep;
        if (tok.gone > 4 && !tok.busy) this.forget(tok);
      }
      this.sweep = 0;
    }
    this.slipOf.forEach((tok, k) => {
      const slip = this.w.slips[k];
      if (!tok || !tok.ship || tok.place !== 'slip') { slip.lamp(null); slip.label(tok ? `${tok.id.slice(8)} ${tok.pic.title}` : ''); return; }
      const p = tok.pic;
      // the hull creeps up while someone works on it, so a long step still shows as work
      if (p.status === 'in_progress' && p.worker === 'working') tok.creep = Math.min(0.9, Math.max(tok.creep, p.build) + dt / 360);
      const landed = p.status === 'done'; // on its way down the ramp
      const goal = tok.breaking ? 0 : landed || p.status === 'review' ? 1 : Math.max(p.build, tok.creep);
      tok.shown += (goal - tok.shown) * Math.min(1, dt * (tok.breaking ? 1.2 : 0.5));
      tok.ship.setBuild(landed ? 1 : tok.shown);
      tok.ship.setRigged(landed || (p.rigged && tok.shown > 0.97));
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
