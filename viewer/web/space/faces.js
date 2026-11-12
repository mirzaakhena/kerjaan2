// A small picture of each person's face, for the list beside the yard. Drawn
// once, by a renderer of its own that is thrown away afterwards.
import * as THREE from 'three';
import { spawn } from './kit.js';

export function drawFaces(keys, size = 112) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return keys.map(() => ''); // the list then shows names only
  }
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f84bd, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  sun.position.set(-1, 2, 3);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-0.26, 0.26, 0.26, -0.26, 0.1, 10);
  const out = keys.map((key) => {
    const model = spawn(key);
    model.rotation.y = 0.45;
    scene.add(model);
    // the head is the top of the body; the hat, where there is one, is part of it
    const box = new THREE.Box3().setFromObject(model);
    const y = box.max.y - 0.21;
    camera.position.set(0, y + 0.12, 3);
    camera.lookAt(0, y, 0);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(model);
    return url;
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
