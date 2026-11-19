import { villageMap } from '../world/shared-map';
import {
  Color, DirectionalLight, Fog, GridHelper, Group, HemisphereLight, InstancedMesh, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';

// Chỉ là sân render F04; không phải map/collider hay rules authoritative.
export function createScene() {
  const scene = new Scene();
  scene.background = new Color('#dce6d5');
  scene.fog = new Fog('#dce6d5', 25, 100);
  const camera = new PerspectiveCamera(75, 1, 0.1, 150);
  // Camera cố định cho sân thử; M03 sẽ dùng vị trí/chiều cao từ shared.
  camera.position.set(0, 1.55, 12);
  scene.add(new HemisphereLight('#fff9e2', '#527046', 2.3));
  const sun = new DirectionalLight('#fff0c6', 2.5);
  sun.position.set(-15, 25, 10);
  scene.add(sun);
  const ground = new Mesh(
    new PlaneGeometry(...villageMap.size),
    new MeshStandardMaterial({ color: '#83a95a', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'render-test-ground';
  scene.add(ground);
  const grid = new GridHelper(villageMap.size[0], 40, '#546c3d', '#75944f');
  grid.position.y = 0.01;
  scene.add(grid);
  return { scene, camera };
}

export function createRenderer(container: HTMLElement) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.setAttribute('aria-label', 'Mặt đất sân thử 3D');
  container.append(renderer.domElement);
  return renderer;
}

export function resizeScene(renderer: WebGLRenderer, camera: PerspectiveCamera, width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  camera.aspect = safeWidth / safeHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(safeWidth, safeHeight, false);
}

export function disposeScene(scene: Scene | Group) {
  scene.traverse((object) => {
    if (object instanceof Mesh || object instanceof GridHelper) {
      if (object instanceof InstancedMesh) object.dispose();
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
  scene.clear();
}

