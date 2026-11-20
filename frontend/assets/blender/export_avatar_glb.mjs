import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCharacterModel } from '../../src/player/character-avatar.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '../../public/models');

// Polyfill FileReader for Node.js GLTFExporter binary export
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    }).catch(err => {
      if (this.onerror) this.onerror(err);
    });
  }
}
globalThis.FileReader = NodeFileReader;

async function exportGlb(name, scene) {
  const exporter = new GLTFExporter();
  const glb = await new Promise((res, rej) => {
    exporter.parse(scene, res, rej, { binary: true });
  });
  const filePath = resolve(outputDir, `${name}.glb`);
  writeFileSync(filePath, Buffer.from(glb));
  console.log(`Exported ${name}.glb (${glb.byteLength} bytes) to ${filePath}`);
}

async function main() {
  console.log('Building low-poly 3D avatar GLBs...');

  // 1. Police Avatar
  const policeAvatar = createCharacterModel('POLICE');
  const policeScene = new THREE.Scene();
  policeScene.add(policeAvatar.root);
  await exportGlb('avatar_police', policeScene);

  // 2. Robber Avatar
  const robberAvatar = createCharacterModel('ROBBER');
  const robberScene = new THREE.Scene();
  robberScene.add(robberAvatar.root);
  await exportGlb('avatar_robber', robberScene);

  // 3. Unified Avatar (Police default, accessories included)
  const unifiedScene = new THREE.Scene();
  const avatar = createCharacterModel('POLICE');
  avatar.root.name = 'avatar';
  unifiedScene.add(avatar.root);
  await exportGlb('avatar', unifiedScene);

  console.log('Successfully exported all avatar models!');
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
