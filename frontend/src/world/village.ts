import { villageMap } from './shared-map';
import { surveyLayout, type SurveyLayout } from './survey-layout';
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry,
  Group, RingGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  type BufferGeometry,
} from 'three';

export function villagePreview(map = villageMap) {
  const baseLayout = surveyLayout(map);
  if (!baseLayout) throw new Error('Unsupported survey layout: ' + map.id);
  const village = new Group();
  const bounds = new Group();
  bounds.visible = false;
  village.add(bounds);
  const viewpoints = new Map<string, { x: number; z: number }>();
  const box = new BoxGeometry();
  const crown = new DodecahedronGeometry(0.5);
  const trunk = new CylinderGeometry(.5, .5, 1, 6);
  const roof = new ConeGeometry(Math.SQRT1_2, 1, 4);
  roof.rotateY(Math.PI / 4);
  const materials = new Map<string, MeshStandardMaterial>();
  const wire = new MeshBasicMaterial({ color: '#382e54', wireframe: true });
  function shape(name: string, geometry: BufferGeometry, color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    let material = materials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({ color, flatShading: true });
      materials.set(color, material);
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    village.add(mesh);
    return mesh;
  }
  const survey = new Group();
  survey.visible = false;
  village.add(survey);
  const jailModel = new Group();
  jailModel.visible = false;
  village.add(jailModel);
  let serverJail: string | null | undefined;
  function placeJailModel(id: string | null, layout?: SurveyLayout) {
    const jail = (layout ?? baseLayout)?.jails.find(item => item.id === id);
    jailModel.visible = Boolean(jail);
    if (jail) {
      jailModel.position.set(jail.x, 0, jail.z);
      jailModel.scale.set(jail.width / 4, 1, jail.depth / 4);
    }
  }
  function setServerJail(id: string | null) {
    serverJail = id;
    placeJailModel(id);
  }
  function marker(name: string, offset: number, geometry: BufferGeometry, color: string) {
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color }));
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(offset, .09, 0);
    survey.add(mesh);
    return mesh;
  }
  const guard = marker('guard', 0, new RingGeometry(4.95, 5.05, 80), '#654e87');
  const sides = [-1, 1].map(side => ({
    side,
    rescue: marker('rescue', side * 2.5, new RingGeometry(.13, .35, 32), '#154c78'),
    release: marker('release', side * 3.5, new RingGeometry(0, .34, 4), '#a84120'),
  }));
  function inspectJail(id: string, layout?: SurveyLayout) {
    if (serverJail === undefined) placeJailModel(id, layout);
    const jail = (layout ?? baseLayout)?.jails.find(item => item.id === id);
    const point = jail ?? viewpoints.get(id);
    survey.visible = Boolean(point);
    if (!point) return;
    survey.position.set(point.x, 0, point.z);
    guard.scale.setScalar((jail?.guardRadius ?? 5) / 5);
    for (const [index, { side, rescue, release }] of sides.entries()) {
      const target = jail?.anchors[index];
      rescue.position.set(target ? target[0] - point.x : side * 2.5, .09, target ? target[1] - point.z : 0);
      const exit = jail?.releases?.[index];
      release.visible = !jail || !!exit;
      release.position.set(exit ? exit[0] - point.x : side * 3.5, .09, exit ? exit[1] - point.z : 0);
    }
  }
  const pads: { mesh: Mesh; position: Mesh['position']; scale: Mesh['scale'] }[] = [];
  function placeJails(layout?: SurveyLayout) {
    for (const pad of pads) {
      const jail = layout?.jails.find(item => item.id === pad.mesh.name);
      pad.mesh.position.copy(pad.position);
      pad.mesh.scale.copy(pad.scale);
      if (jail) {
        pad.mesh.position.set(jail.x, pad.position.y, jail.z);
        pad.mesh.scale.set(jail.width, pad.scale.y, jail.depth);
      }
    }
  }
  const policeSpawns = map.spawns.police.map(([x,,z]): [number, number] => [x,z]);
  const spawns = baseLayout.spawns;
  for (const collider of map.colliders) {
    const mesh = new Mesh(box, wire);
    mesh.name = collider.id;
    mesh.scale.set(...collider.size);
    mesh.position.set(...collider.center);
    bounds.add(mesh);
  }
  const volumes = new Map([...map.colliders,...map.hideZones].map(item => [item.id,item]));
  for (const object of map.objects) {
    const volume = volumes.get(object.id + '_box') ?? volumes.get(object.id + '_hide');
    if (!volume) throw new Error('Missing graybox dimensions for ' + object.id);
    const [w,h,d] = volume.size;
    const group = new Group();
    group.name = object.id;
    group.position.set(...object.pos);
    group.scale.set(...object.scale);
    group.rotation.y = object.yaw;
    village.add(group);
    function part(name: string, geometry: BufferGeometry, color: string, y: number, width: number, height: number, depth: number) {
      group.add(shape(name, geometry, color, 0, y, 0, width, height, depth));
    }
    if (object.asset.startsWith('house_')) {
      part('wall',box,'#e6d5a5',h*.3,w,h*.6,d);
      part('roof',roof,'#a84e35',h*.8,w,h*.4,d);
    } else if (object.asset.startsWith('tree_')) {
      part('trunk',trunk,'#77604a',h/2,w,h,d);
      part('crown',crown,'#52805b',h+1.1,3.4,3.2,3.4);
    } else if (object.asset === 'fence_segment') {
      part('fence',box,'#795947',h/2,w,h,d);
    } else {
      part(object.asset,crown,object.asset === 'haystack' ? '#cbad60' : '#609256',h/2,w,h,d);
    }
  }
  for (const jail of map.jails) {
    const [x,y,z] = jail.center;
    const mesh = shape(jail.id, box, '#ac89b0', x, y+.035, z, jail.size[0], .07, jail.size[1]);
    pads.push({mesh,position:mesh.position.clone(),scale:mesh.scale.clone()});
    viewpoints.set(jail.id,{x,z});
  }
  return { village, bounds, viewpoints, survey, inspectJail, placeJails, jailModel, setServerJail, spawns, policeSpawns, baseLayout };
}
