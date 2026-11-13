// One person in the yard. A routine drives it with a few verbs that each
// return a promise: goTo, act, wait. Nothing here knows the board.
import * as THREE from 'three';
import { spawn, clipsOf } from './kit.js';
import { route } from './world.js';

const SCALE = 2.5;
const SPEED = 2.5;
const ONCE = new Set(['pick-up', 'emote-yes', 'emote-no', 'interact-right', 'interact-left', 'attack-melee-right', 'attack-melee-left', 'sit']);

// Walking with the arms held out in front: the legs of `walk`, the arms of `holding-both`.
const carryClips = new Map();
function carryClip(key) {
  if (!carryClips.has(key)) {
    const clips = clipsOf(key);
    const walk = THREE.AnimationClip.findByName(clips, 'walk');
    const hold = THREE.AnimationClip.findByName(clips, 'holding-both');
    const arms = (t) => t.name.startsWith('arm-');
    carryClips.set(key, new THREE.AnimationClip('carry', walk.duration, [...walk.tracks.filter((t) => !arms(t)), ...hold.tracks.filter(arms)].map((t) => t.clone())));
  }
  return carryClips.get(key);
}

// Feelings and the inspector's ❌ are drawn as the pictures they are, and larger: they are to be
// read from where the camera usually stands.
const FACES = new Set(['🥳', '😄', '😢', '❌', '💬']);
const bubbles = new Map();
function bubbleTexture(glyph) {
  if (!bubbles.has(glyph)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#2a2f45';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 54, 46, 0.62 * Math.PI, 0.38 * Math.PI);
    g.lineTo(64, 124);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = { '?': '#c77800', '!': '#1e7bd6', '✓': '#138f67', '✗': '#d1342f' }[glyph] || '#2a2f45';
    g.font = FACES.has(glyph) ? '70px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' : '700 64px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(glyph, 64, 58);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    bubbles.set(glyph, t);
  }
  return bubbles.get(glyph);
}

export class Actor {
  constructor({ key, name, role, at }) {
    this.name = name;
    this.role = role;
    this.doing = '';
    this.lane = (Math.random() - 0.5) * 1.6;
    this.root = new THREE.Group();
    this.root.position.set(at.x, 0, at.z);
    this.model = spawn(key);
    this.model.scale.setScalar(SCALE);
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of [...clipsOf(key), carryClip(key)]) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.heading = at.face || 0;
    this.root.rotation.y = this.heading;
    this.path = null;
    this.timer = null;
    this.held = null;
    this.jobs = []; // what the director asked for, done in turn (cast.js)
    // what a click lands on: larger than the body, never drawn
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 1.7), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.hit.position.y = 1.25;
    this.hit.userData.actor = this;
    this.root.add(this.hit);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.bubble.position.y = 3.05;
    this.bubble.visible = false;
    this.bubble.renderOrder = 5;
    this.root.add(this.bubble);
    this.bubbleLeft = 0;
    this.play('idle');
  }

  get position() { return this.root.position; }

  play(name, repeat = !ONCE.has(name)) {
    if (!this.actions[name]) console.warn(`${this.name}: no movement called "${name}"`);
    const next = this.actions[name] || this.actions.idle;
    if (next === this.current) return;
    next.reset();
    next.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = name === 'walk' || name === 'carry' ? 1.25 : 1;
    next.fadeIn(0.18).play();
    if (this.current) this.current.fadeOut(0.18);
    this.current = next;
  }

  // Something in the hands (an Object3D), or nothing.
  hold(item) {
    if (this.held) this.root.remove(this.held);
    this.held = item || null;
    if (item) {
      item.position.set(0, 1.02, 0.6);
      this.root.add(item);
    }
    // arms out with a load, down without one
    if (!this.path) {
      if (item && this.current === this.actions.idle) this.play('holding-both');
      if (!item && this.current === this.actions['holding-both']) this.play('idle');
    }
  }

  say(glyph, seconds = 2.5) {
    const first = !this.bubble.material.map;
    this.bubble.material.map = bubbleTexture(glyph);
    if (first) this.bubble.material.needsUpdate = true;
    this.bubble.visible = true;
    this.bubbleLeft = seconds;
    this.bubbleAge = 0;
    this.bubbleSize = FACES.has(glyph) ? 3.4 : 1.15;
    this.bubble.position.y = 2.475 + this.bubbleSize / 2; // its point stays above the head
  }

  face(angle) { this.heading = angle; }

  wait(seconds) {
    return new Promise((done) => { this.timer = { left: seconds, done }; });
  }

  // Walk to a place ({x, z, face?}), by the lanes and the street.
  goTo(to) {
    const pts = route({ x: this.root.position.x, z: this.root.position.z }, to, this.lane);
    this.play(this.held ? 'carry' : 'walk');
    return new Promise((done) => {
      this.path = { pts, done: () => { if (to.face !== undefined) this.heading = to.face; this.play(this.held ? 'holding-both' : 'idle'); done(); } };
    });
  }

  // Play a movement for a while, then stand again.
  async act(name, seconds, { repeat } = {}) {
    this.play(name, repeat);
    await this.wait(seconds);
    this.play(this.held ? 'holding-both' : 'idle');
  }

  update(dt) {
    if (this.path) {
      const p = this.root.position;
      let step = SPEED * dt;
      while (step > 0 && this.path) {
        const to = this.path.pts[0];
        const dx = to.x - p.x, dz = to.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001) this.heading = Math.atan2(dx, dz);
        if (d <= step) {
          p.x = to.x; p.z = to.z;
          step -= d;
          this.path.pts.shift();
          if (!this.path.pts.length) { const done = this.path.done; this.path = null; done(); }
        } else {
          p.x += (dx / d) * step; p.z += (dz / d) * step;
          step = 0;
        }
      }
    }
    if (this.timer) {
      this.timer.left -= dt;
      if (this.timer.left <= 0) { const done = this.timer.done; this.timer = null; done(); }
    }
    let turn = this.heading - this.root.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.root.rotation.y += turn * Math.min(1, dt * 9);
    if (this.bubble.visible) {
      this.bubbleLeft -= dt;
      this.bubbleAge += dt;
      const s = this.bubbleSize * Math.min(1, this.bubbleAge * 6) * Math.min(1, Math.max(0, this.bubbleLeft * 5));
      this.bubble.scale.set(s, s, 1);
      if (this.bubbleLeft <= 0) this.bubble.visible = false;
    }
    this.mixer.update(dt);
  }
}
