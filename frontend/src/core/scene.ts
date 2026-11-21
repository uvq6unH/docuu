import { villageMap } from '../world/shared-map';
import { createGroundMaterial } from '../world/ground-material';
import { createLandscapeDetail } from '../world/landscape-detail';
import {
  Color, DirectionalLight, Fog, GridHelper, Group, HemisphereLight, InstancedMesh, Mesh,
  ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';

// Chỉ là sân render F04; không phải map/collider hay rules authoritative.
export function createScene() {
  const scene = new Scene();
  scene.background = new Color('#c5dce0');
  scene.fog = new Fog('#c5dce0', 45, 125);
  const camera = new PerspectiveCamera(75, 1, 0.1, 150);
  // Camera cố định cho sân thử; M03 sẽ dùng vị trí/chiều cao từ shared.
  camera.position.set(0, 1.55, 12);
  scene.add(new HemisphereLight('#d9edff', '#82704c', 1.7));
  const sun = new DirectionalLight('#ffe0a8', 3.2);
  sun.position.set(-28, 40, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -54;
  sun.shadow.camera.right = sun.shadow.camera.top = 54;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.0002;
  scene.add(sun);
  const ground = new Mesh(
    new PlaneGeometry(...villageMap.size),
    createGroundMaterial(),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'render-test-ground';
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false;
  ground.updateMatrix();
  scene.add(ground);
  const grid = new GridHelper(villageMap.size[0], 40, '#546c3d', '#75944f');
  grid.position.y = 0.01;
  grid.visible = false;
  grid.matrixAutoUpdate = false;
  grid.updateMatrix();
  scene.add(grid);
  scene.add(createLandscapeDetail());
  return { scene, camera };
}

export function createRenderer(container: HTMLElement) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
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
      for (const material of materials) {
        if ('map' in material && material.map instanceof Object && 'dispose' in material.map) {
          (material.map as { dispose(): void }).dispose();
        }
        material.dispose();
      }
    }
  });
  scene.clear();
}

