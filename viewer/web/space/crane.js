// The slewing crane at the head of every slip (F4 of the showroom: the classic
// crane on a narrow foot, at the corner of its own slip). Pure: no scene, so
// where it stands and how it moves are tested in Node; world.js only draws it.
//
// It never turns further than from the water (its jib along the scaffold) to
// the stern quarter of its own hull. So its jib stays over its own slip, its
// counterweight over the street, and neither comes near a neighbour, a mast
// of its own hull, or the sails of the ship next door. What it lifts is
// stacked on the scaffold, right under the jib when it is parked.
//
// What it is told (`aim`):
//   'work'  the worker of the ticket is at work: it carries a piece to the hull,
//           holds it there a while, carries it back, and again;
//   'hold'  a hull stands there and nobody works on it: it stops where it is;
//   'park'  no hull, or one that passed: the piece goes back, the jib turns to
//           the water, the hook goes up. Only then are the sails set.
// `deliver` is one piece set down in the hull, whatever it was told: the
// promise resolves when the piece is in.

export const FOOT = 0.45; // half the side of its foot
export const PIVOT = 7.8; // how high the arm turns
// the arm along its own length from the mast, [from, to, half its width, from how high, to how high]: jib, cab, counterweight
export const ARM = [[-2.2, 5.4, 0.2, 7.6, 8], [-0.65, 0.65, 0.6, 7.75, 8.85], [-3.3, -1.9, 0.55, 7.1, 8.1]];
export const CRATE = { x: 0.43, z: 0.52, h: 0.62 }; // the piece, half its sides and its height; the hook swivels, so it keeps its bearing
export const CARRY = 5.2; // how high the underside of the piece travels: over scaffold and hull
export const PLANK = 3.34; // the top of the scaffold, where the pieces are stacked
const STACK = { a: 0, r: 2.5, y: PLANK + CRATE.h + 0.02 }; // the hook takes the piece on top of the one that lies there
const HULL = { a: -0.38, r: 5 }; // over the deck abaft the mainmast: as far as the jib turns, and the hook runs out
const SWAY = [{ a: -0.31, r: 4.8 }, { a: -0.38, r: 5 }, { a: -0.33, r: 4.6 }, { a: -0.38, r: 5 }]; // how it holds a piece over the hull

// How high the deck lies where a piece is set down, by the size of the hull, in the model's own measure:
// nothing of a hull without its sails stands higher under the piece.
export const DECK = { small: 2.12, medium: 2.32, large: 2.62 };

// Where the crane of the slip `d` (of `yardOf`) stands, where its pieces are stacked and where it sets one down.
export function craneAt(d) {
  const x = d.x + 3.05, z = d.z - 12;
  return { x, z, stack: { x, z: z + STACK.r }, drop: { x: x + Math.sin(HULL.a) * HULL.r, z: z + Math.cos(HULL.a) * HULL.r } };
}

// What of it is in the air at a pose { a, r, y, load }: the parts of the arm as strips from (ax, az) to (bx, bz),
// half as wide as `w`, between the heights y0 and y1; the hook's cable; and the piece, if it carries one.
export function reach(c, p) {
  const sin = Math.sin(p.a), cos = Math.cos(p.a);
  const x = c.x + sin * p.r, z = c.z + cos * p.r;
  return {
    arm: ARM.map(([s0, s1, w, y0, y1]) => ({ ax: c.x + sin * s0, az: c.z + cos * s0, bx: c.x + sin * s1, bz: c.z + cos * s1, w, y0, y1 })),
    cable: { x, z, y0: p.y + CRATE.h, y1: PIVOT - 0.3 },
    load: p.load ? { x0: x - CRATE.x, x1: x + CRATE.x, z0: z - CRATE.z, z1: z + CRATE.z, y0: p.y, y1: p.y + CRATE.h } : null,
  };
}

const ease = (u) => u * u * (3 - 2 * u);

export class Crane {
  constructor() {
    this.pace = 1; // the yard's own: faster when it is behind the board
    this.orders = []; // pieces asked for and not yet set down
    this.waiting = []; // who waits for it to be parked
    this.reset();
  }

  // Parked at once, with no story.
  reset() {
    this.cancel();
    this.goal = 'park';
    Object.assign(this, { a: STACK.a, r: STACK.r, y: CARRY, load: false, at: 'stack', legs: [], fresh: false, swayed: 0, piece: null });
    this.settle();
  }

  // Nobody waits for a piece any more.
  cancel() { for (const o of this.orders.splice(0)) o.done(); }

  // Its slip is gone.
  retire() { this.cancel(); this.goal = 'park'; for (const done of this.waiting.splice(0)) done(); }

  aim(goal) {
    if (goal === 'park') this.cancel(); // no piece goes to a hull with its sails up, or to no hull at all
    this.goal = goal;
  }

  // One piece into the hull. `deck()` says how high it comes to lie, asked when the piece is over the hull.
  deliver(deck = () => 2) {
    return new Promise((done) => { this.orders.push({ deck, done }); });
  }

  get parked() { return this.goal === 'park' && !this.load && this.at === 'stack' && !this.legs.length; }
  // Whether anything of it moves.
  get still() { return !this.legs.length; }
  whenParked() { return this.parked ? Promise.resolve() : new Promise((done) => { this.waiting.push(done); }); }
  settle() { if (this.parked) for (const done of this.waiting.splice(0)) done(); }

  // What is drawn: the pose, and the piece just set down ({ y, k }: k from 1 to 0 as it is taken into the hull).
  get pose() { return { a: this.a, r: this.r, y: this.y, load: this.load }; }

  leg(to, secs, then) { this.legs.push({ to, secs, then, t: 0, from: null }); }
  swing(to, secs, at) { this.leg({ a: to.a, r: to.r, y: CARRY }, secs, () => { this.at = at; }); }
  take() {
    this.leg({ y: STACK.y }, 1.3, () => { this.load = true; this.fresh = true; this.swayed = 0; });
    this.leg({}, 0.4);
    this.leg({ y: CARRY }, 1.3);
  }
  putBack() {
    this.leg({ y: STACK.y }, 1.3, () => { this.load = false; });
    this.leg({ y: CARRY }, 1.3);
  }

  // The next thing to do, when the last is done. One short thing at a time, so that a new word is heard soon.
  plan() {
    const stack = this.at === 'stack';
    if (this.goal === 'park') {
      if (this.load) return stack ? this.putBack() : this.swing(STACK, 3, 'stack');
      if (!stack) this.swing(STACK, 3, 'stack');
      return;
    }
    if (this.orders.length) {
      if (!this.load) return stack ? this.take() : this.swing(STACK, 2.5, 'stack');
      if (stack) return this.swing(HULL, 3, 'hull');
      const order = this.orders[0];
      this.leg({ ...HULL, y: Math.max(1, Math.min(CARRY, order.deck())) }, 1.5, () => {
        this.load = false;
        this.piece = { y: this.y, k: 1 };
        this.orders.shift();
        order.done();
      });
      this.leg({ y: CARRY }, 1.2);
      return;
    }
    if (this.goal !== 'work') return; // it stands as it is
    if (!this.load) {
      if (!stack) return this.swing(STACK, 4, 'stack');
      this.leg({}, 2);
      return this.take();
    }
    if (stack) return this.fresh ? this.swing(HULL, 6, 'hull') : this.putBack();
    // over the hull: held there, moved a little, then carried back
    if (this.swayed < SWAY.length) return this.leg({ ...SWAY[this.swayed++], y: this.swayed % 2 ? CARRY - 0.7 : CARRY }, 2.6);
    this.fresh = false;
    this.swing(STACK, 6, 'stack');
  }

  step(dt) {
    dt *= this.pace;
    if (this.piece && (this.piece.k -= dt / 0.9) <= 0) this.piece = null;
    while (dt > 0) {
      if (!this.legs.length) this.plan();
      const leg = this.legs[0];
      if (!leg) break;
      leg.from ??= { a: this.a, r: this.r, y: this.y };
      const left = (1 - leg.t) * leg.secs;
      const used = Math.min(dt, left);
      leg.t = leg.secs > 0 ? Math.min(1, leg.t + used / leg.secs) : 1;
      dt -= used;
      const k = ease(leg.t);
      for (const key of ['a', 'r', 'y']) if (leg.to[key] !== undefined) this[key] = leg.from[key] + (leg.to[key] - leg.from[key]) * k;
      if (leg.t < 1) break;
      for (const key of ['a', 'r', 'y']) if (leg.to[key] !== undefined) this[key] = leg.to[key];
      this.legs.shift();
      if (leg.then) leg.then();
    }
    this.settle();
  }
}
