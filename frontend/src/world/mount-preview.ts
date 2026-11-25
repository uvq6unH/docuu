import type { SurveyLayout } from './survey-layout';
import type { Result } from './compare-routes';
import { mountColliderReview } from './collider-review';
import { Box3, BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three';
import { surveyRoute } from './survey-route';
import type { PerspectiveCamera } from 'three';

import type { villagePreview } from './village';

export function mountPreview(world: ReturnType<typeof villagePreview>, camera: PerspectiveCamera, panel: HTMLElement) {
  const { village, bounds, viewpoints, inspectJail, placeJails, spawns, policeSpawns, baseLayout } = world;

  const controls = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Khảo sát làng village-v1';
  const label = document.createElement('label');
  label.textContent = 'Góc nhìn ';
  label.htmlFor = 'survey-view';
  const select = document.createElement('select');
  select.id = 'survey-view';
  select.add(new Option('Từ sân', 'yard'));
  select.add(new Option('Toàn cảnh', 'overview'));
  for (const id of viewpoints.keys()) select.add(new Option('Vị trí ' + id, id));
  const guide = document.createElement('p');
  guide.hidden = true;
  guide.textContent = 'Vòng xanh: điểm cứu · Hình thoi cam: điểm thả · Vòng tím: vùng canh 5 m.';
  const routeLabel = document.createElement('label');
  routeLabel.hidden = true;
  const routes = document.createElement('select');
  routeLabel.append('Tuyến cứu ', routes);
  routes.add(new Option('Chỉ xem nhà giam', ''));
  for (const [index] of spawns.entries()) {
    for (const side of [-1, 1]) {
      routes.add(new Option('Xuất phát ' + (index + 1) + ' → ' + (side < 0 ? 'Tây' : 'Đông'), index + '/' + side));
    }
  }
  const distance = document.createElement('span');
  routeLabel.append(distance);
  const line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: '#9d2242' }));
  village.add(line);
  const report = document.createElement('details');
  report.hidden = true;
  let worker: Worker | undefined;
  let comparing = false;
  let layout: SurveyLayout | undefined;
  let results: Result[] = [];
  function updateView() {
    line.visible = false;
    distance.textContent = '';
    const point = layout?.jails.find(jail => jail.id === select.value) ?? viewpoints.get(select.value);
    inspectJail(select.value, layout);
    const selected = (layout ?? baseLayout).jails.find(jail => jail.id === select.value);
    const releaseHint = !selected || selected.releases?.length ? 'Hình thoi cam: điểm thả · ' : '';
    guide.textContent = 'Vòng xanh: điểm cứu · ' + releaseHint + 'Vòng tím: vùng canh ' + (selected?.guardRadius ?? 5) + ' m.';
    guide.hidden = !point;
    routeLabel.hidden = !point;
    if (point && routes.value) {
      const [index, side] = routes.value.split('/').map(Number);
      const spawn = spawns[index!];
      const footprint = village.getObjectByName(select.value);
      if (spawn && footprint) {
        const obstacles = [...bounds.children, footprint].map(object => new Box3().setFromObject(object));
        const row = results.find(r => r.jail === select.value && r.option === routes.value);
        const path = comparing ? (row?.path ?? []) : surveyRoute(spawn, point, side!, obstacles, selected?.anchors[side === -1 ? 0 : 1], selected?.guardRadius);
        if (path.length) {
          const vertices = path.map(([x, z]) => new Vector3(x, .18, z));
          line.geometry.dispose();
          line.geometry = new BufferGeometry().setFromPoints(vertices);
          line.visible = true;
          let meters = 0;
          for (let i = 1; i < vertices.length; i++) meters += vertices[i]!.distanceTo(vertices[i - 1]!);
          distance.textContent = ' · ' + meters.toLocaleString('vi-VN') + ' m';
          const center = new Box3().setFromPoints(vertices).getCenter(new Vector3());
          if (document.pointerLockElement) return;
          camera.position.set(center.x, 42, center.z + 12);
          camera.lookAt(center);
          return;
        }
        distance.textContent = comparing && !row ? ' · Chờ kết quả đối chiếu' : ' · Chưa tìm thấy đường';
      }
    }
    if (document.pointerLockElement) return;
    if (point) {
      camera.position.set(point.x, 4, point.z + 7);
      camera.lookAt(point.x, 0, point.z);
    } else if (select.value === 'overview') {
      camera.position.set(0, 56, 32);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(0, 1.55, 12);
      camera.rotation.set(0, 0, 0, 'YXZ');
    }
  }
  select.onchange = updateView;
  routes.onchange = updateView;
  label.append(select);
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.onchange = () => { bounds.visible = toggle.checked; };
  const boundsLabel = document.createElement('label');
  boundsLabel.append(toggle, ' Khung vật cản dự kiến');
  controls.append(legend, label, boundsLabel, routeLabel, guide);
  const planar = (box: Box3) => ({
    min: [box.min.x, box.min.z] as const, max: [box.max.x, box.max.z] as const,
  });
  const originalJails = [...viewpoints].map(([id, point]) => ({
    id, ...point, footprint: planar(new Box3().setFromObject(village.getObjectByName(id)!)),
  }));
  const removeReview = mountColliderReview(village, controls, { robber: spawns, police: policeSpawns, jails: new Map(baseLayout.jails.map(j => [j.id, j])) }, (boxes, importedLayout) => {
    layout = importedLayout;
    placeJails(layout);
    worker?.terminate();
    worker = undefined;
    results = [];
    comparing = boxes !== null;
    report.hidden = !comparing;
    report.replaceChildren();
    updateView();
    if (!boxes) return;
    const summary = document.createElement('summary');
    summary.textContent = 'Đang kiểm tra các tuyến…';
    report.append(summary);
    const active = new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = (event: MessageEvent<Result[]>) => {
      if (worker !== active) return;
      results = event.data;
      const blocked = results.filter(r => r.after === null).length;
      const changed = results.filter(r => r.after !== null && r.before !== r.after).length;
      summary.textContent = results.length + ' tuyến · ' + blocked + ' bị chặn · ' + changed + ' đổi độ dài';
      const list = document.createElement('ul');
      for (const r of results) {
        const entry = document.createElement('li');
        const option = Array.from(routes.options).find(o => o.value === r.option);
        const meters = (value: number | null) => value === null ? 'bị chặn' : value.toLocaleString('vi-VN') + ' m';
        entry.textContent = r.jail + ' · ' + option?.text + ' · village-v1 ' + meters(r.before) + ' → JSON ' + meters(r.after);
        list.append(entry);
      }
      report.append(list);
      active.terminate();
      updateView();
    };
    active.onerror = () => {
      if (worker !== active) return;
      summary.textContent = 'Không tính được tuyến. Hãy gỡ lớp đối chiếu rồi thử lại.';
      active.terminate();
    };
    active.postMessage({
      spawns,
      jails: originalJails,
      baseline: baseLayout,
      original: bounds.children.map(object => planar(new Box3().setFromObject(object))),
      imported: boxes.map(planar),
      layout,
    });
  });
  controls.append(report);
  panel.append(controls);
  return () => {
    worker?.terminate();
    worker = undefined;
    removeReview();
    controls.remove();
    village.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  };
}










