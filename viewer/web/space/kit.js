// The models: three CC0 kits by Kenney (kits/*/LICENSE.txt), loaded once and
// handed out as copies. Every model of a kit shares one material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/assets/space/kits/';
const loader = new GLTFLoader();
const loaded = new Map(); // 'kit/name' -> gltf
const materials = new Map(); // kit -> material

function settle(kit, gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!materials.has(kit)) {
      const m = o.material;
      m.metalness = 0;
      m.roughness = 0.85;
      m.side = THREE.FrontSide;
      materials.set(kit, m);
    }
    o.material = materials.get(kit);
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

// keys: 'pirate/barrel', 'people/character-worker', ...
export async function loadKit(keys, onProgress = () => {}) {
  let done = 0;
  await Promise.all(keys.map(async (key) => {
    const gltf = await loader.loadAsync(`${BASE}${key}.glb`);
    settle(key.split('/')[0], gltf);
    loaded.set(key, gltf);
    onProgress(++done / keys.length);
  }));
}

export function spawn(key) {
  const gltf = loaded.get(key);
  if (!gltf) throw new Error(`model not loaded: ${key}`);
  return key.startsWith('people/') ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
}

export const clipsOf = (key) => loaded.get(key).animations;
export const materialOf = (kit) => materials.get(kit);
