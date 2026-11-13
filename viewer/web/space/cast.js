// Who works in the yard. Each person does, in this order: a job the director
// asked for (a ticket being carried somewhere), else their duty (what the
// board says is going on right now), else a chore that keeps the yard alive
// and claims nothing about any ticket.
import { Actor } from './actor.js';
import { plank } from './world.js';
import { short, plannerDuty } from './director.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const near = (st, dx = 1.5) => ({ ...st, x: st.x + rnd(-dx, dx) });

export const PEOPLE = ['people/character-male-c', 'people/character-male-e', 'people/character-worker', 'people/character-male-b', 'people/character-male-f', 'people/character-female-c', 'people/character-male-a', 'people/character-female-d', 'people/character-female-b', 'people/character-male-g'];

async function think(a, what) {
  a.doing = what;
  a.say('…', 3);
  await a.act('idle', rnd(2.5, 4));
}

// ----- chores: true of the yard, silent about tickets -----

const chores = {
  courier: [
    async (a, w) => { a.doing = 'watching for the mail boat'; await a.goTo(near(w.stations.pierEnd, 0.6)); await a.wait(rnd(3, 6)); },
    async (a, w) => { a.doing = 'tidying the order shelf'; await a.goTo(w.stations.shelf); await a.act('interact-right', rnd(2, 4), { repeat: true }); },
    async (a, w) => { a.doing = 'minding the office'; await a.goTo(w.stations.orders); await a.wait(rnd(3, 6)); },
  ],
  planner: [
    async (a, w) => { a.doing = 'sharpening pencils'; await a.goTo(w.stations.drafting); await a.act('interact-left', rnd(2, 4), { repeat: true }); },
    async (a, w) => { await a.goTo(w.stations.drafting); await think(a, 'studying old drawings'); },
  ],
  foreman: [
    async (a, w) => { a.doing = 'looking over the todo table'; await a.goTo(near(w.stations.queue)); await a.wait(rnd(3, 5)); },
    async (a, w) => { const k = Math.floor(rnd(0, 4)); a.doing = `looking in on slip ${k + 1}`; await a.goTo(w.slips[k].spots[pick([0, 4])]); await a.wait(rnd(2, 4)); },
    async (a, w) => { a.doing = 'watching the launch ramps'; await a.goTo(w.stations.edge); await a.wait(rnd(3, 5)); },
    async (a, w) => { await a.goTo(near(w.stations.timber, 2)); await think(a, 'counting the timber'); },
  ],
  wright: [
    async (a, w, k) => {
      a.doing = 'stocking the slip with timber';
      await a.goTo(near(w.stations.timber, 2));
      await a.act('pick-up', 1.2);
      a.hold(plank());
      await a.goTo(pick(w.slips[k].spots));
      await a.act('interact-right', 0.9);
      a.hold(null);
    },
    async (a, w, k) => { a.doing = 'checking the scaffold'; await a.goTo(pick(w.slips[k].spots)); await a.act('interact-left', rnd(2, 4), { repeat: true }); },
    async (a, w, k) => { a.doing = 'sweeping the slip'; await a.goTo(pick(w.slips[k].spots)); await a.wait(rnd(2, 4)); },
  ],
  inspector: [
    async (a, w) => { a.doing = 'keeping the inspection book'; await a.goTo(w.stations.inspection); await a.act('interact-left', rnd(3, 5), { repeat: true }); },
    async (a, w) => { a.doing = 'checking the timber stock'; await a.goTo(near(w.stations.timber, 2.5)); await a.act('interact-right', 2); },
    async (a, w) => { a.doing = 'walking the quay'; await a.goTo(near(w.stations.walk, 8)); await a.wait(rnd(2, 4)); },
  ],
  crane: [
    async (a, w) => { a.doing = 'oiling the crane'; await a.goTo(w.stations.crane); w.crane.aim = rnd(-0.9, 1.3); await a.act('interact-left', rnd(3, 5), { repeat: true }); },
    async (a, w) => { a.doing = 'moving a load'; await a.goTo(w.stations.crane); w.crane.aim = rnd(-0.9, 1.3); await a.act('interact-right', rnd(3, 5), { repeat: true }); },
    async (a, w) => { a.doing = 'fetching rope'; await a.goTo(near(w.stations.timber, 3)); await a.act('pick-up', 1.2); },
  ],
  keeper: [
    async (a, w) => { a.doing = 'tending the light'; await a.goTo(w.stations.lighthouse); await a.act('interact-right', rnd(2, 4), { repeat: true }); },
    async (a, w) => { a.doing = 'watching the bay'; await a.goTo(w.stations.bench); await a.act('sit', rnd(5, 8)); },
  ],
};

// ----- duties: what the board says is going on -----

// A shipwright belongs to one slip. While a worker agent is on that ticket the
// shipwright builds, and says the agent's own last step.
async function wrightDuty(a, w, dir, k) {
  const tok = dir.onSlip(k);
  if (!tok) return false;
  const p = tok.pic, title = `“${short(p.title)}”`;
  const side = w.slips[k].spots;
  if (p.status === 'done') {
    a.doing = `seeing ${title} off`;
    await a.goTo(side[pick([3, 7])]);
    a.say('✓', 2.5);
    await a.act('emote-yes', 2);
    await a.wait(rnd(1, 2));
  } else if (p.worker === 'stuck') {
    a.doing = `stuck on ${title}`;
    await a.goTo(pick(side));
    a.say('?', 3);
    await a.act('emote-no', 2.2);
    await a.wait(1.5);
  } else if (p.asked && p.worker === 'away') {
    a.doing = `waiting for the owner's answer on ${title}`;
    await a.goTo(side[0]);
    a.say('?', 3);
    await a.act('sit', rnd(4, 6));
  } else if (p.testing && p.status === 'in_progress') {
    a.doing = `testing ${title}`;
    await a.goTo(pick(side));
    a.say('…', 2.5);
    await a.act('interact-left', rnd(3, 5), { repeat: true });
  } else if (p.worker === 'working') {
    a.doing = p.step ? `${title}: ${p.step}` : `building ${title}`;
    await a.goTo(pick(side));
    await a.act(pick(['attack-melee-right', 'attack-melee-left', 'interact-right']), rnd(3, 6), { repeat: true });
  } else if (p.status === 'review') {
    a.doing = p.rigged ? `${title} passed: waiting for the launch` : p.reviewer !== 'away' ? `standing by while ${title} is inspected` : `waiting for the inspector on ${title}`;
    await a.goTo(side[pick([0, 4])]);
    await a.wait(rnd(3, 5));
  } else {
    a.doing = `waiting for word on ${title}`;
    await a.goTo(pick(side));
    await a.wait(rnd(3, 5));
  }
  return true;
}

// The inspector walks round the hull a reviewer agent is on.
async function inspectorDuty(a, w, dir) {
  const tok = dir.underReview();
  if (!tok) return false;
  const p = tok.pic, title = `“${short(p.title)}”`;
  a.doing = p.reviewer === 'stuck' ? `stuck on the inspection of ${title}` : p.step ? `inspecting ${title}: ${p.step}` : `inspecting ${title}`;
  await a.goTo(pick(w.slips[tok.slip].spots));
  if (p.reviewer === 'stuck') { a.say('?', 3); await a.act('emote-no', 2.2); return true; }
  await a.wait(rnd(1, 2));
  await a.act('interact-right', rnd(1.5, 3), { repeat: true });
  return true;
}

// The crane operator makes ready for the ship that holds the turn to land.
async function craneDuty(a, w, dir) {
  const next = dir.pic && dir.pic.launchNext && dir.pic.byId.get(dir.pic.launchNext);
  if (!next) return false;
  a.doing = `making ready to launch “${short(next.title)}”`;
  await a.goTo(w.stations.crane);
  w.crane.aim = rnd(-0.4, 0.6);
  await a.act('interact-left', rnd(3, 5), { repeat: true });
  return true;
}

// The keeper signals the owner while something waits for them.
async function keeperDuty(a, w, dir) {
  const n = dir.pic ? dir.pic.needs : 0;
  if (!n) return false;
  a.doing = `signalling the owner: ${n} ${n === 1 ? 'thing waits' : 'things wait'} for you`;
  await a.goTo(w.stations.lighthouse);
  a.say('!', 3);
  await a.act('interact-right', rnd(2, 4), { repeat: true });
  await a.wait(rnd(1, 3));
  return true;
}

const CAST = [
  { key: 0, name: 'Courier', role: 'courier', at: 'orders', chores: chores.courier },
  { key: 1, name: 'Naval Architect', role: 'planner', at: 'drafting', chores: chores.planner, duty: plannerDuty },
  { key: 2, name: 'Foreman', role: 'foreman', at: 'queue', chores: chores.foreman },
  ...[3, 4, 5, 6].map((key, k) => ({ key, name: `Shipwright ${k + 1}`, role: 'wright', slip: k, chores: chores.wright, duty: wrightDuty })),
  { key: 7, name: 'Inspector', role: 'inspector', at: 'inspection', chores: chores.inspector, duty: inspectorDuty },
  { key: 8, name: 'Crane operator', role: 'crane', at: 'crane', chores: chores.crane, duty: craneDuty },
  { key: 9, name: 'Keeper', role: 'keeper', at: 'bench', chores: chores.keeper, duty: keeperDuty },
];

// One thing at a time, for ever: an actor has one walk and one wait, so
// nothing else may drive it while this loop does.
async function day(c, a, w, director) {
  for (;;) {
    try {
      const job = a.jobs.shift();
      if (job) {
        try { await job.run(a); } finally { a.hold(null); job.done(); }
      } else if (!(c.duty && await c.duty(a, w, director(), c.slip))) {
        await pick(c.chores)(a, w, c.slip);
      }
    } catch (e) {
      console.error(`${c.name}:`, e);
      a.hold(null);
      await a.wait(2);
    }
  }
}

// `director` is a function: the director is made after the people it directs.
export function startCast(scene, world, director) {
  const actors = CAST.map((c) => {
    const at = c.slip === undefined ? world.stations[c.at] : world.slips[c.slip].spots[c.slip % 2 ? 5 : 1];
    const actor = new Actor({ key: PEOPLE[c.key], name: c.name, role: c.role, at });
    scene.add(actor.root);
    actor.key = PEOPLE[c.key];
    return actor;
  });
  const by = (role) => actors.filter((a) => a.role === role);
  const cast = { courier: by('courier')[0], planner: by('planner')[0], foreman: by('foreman')[0], wrights: by('wright'), inspector: by('inspector')[0], crane: by('crane')[0], keeper: by('keeper')[0] };
  const begin = () => CAST.forEach((c, i) => { day(c, actors[i], world, director); });
  return { actors, cast, begin };
}
