import { surveyLayout, type SurveyLayout } from './survey-layout';
import { reviewPositions, type Reference } from './review-positions';
import { Box3, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Vector3, type Group } from 'three';

function vector(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

export function readBoxes(text: string): Box3[] {
  return boxesFromMap(JSON.parse(text));
}
function boxesFromMap(map: unknown): Box3[] {
  if (!map || typeof map !== 'object' || !('colliders' in map) || !Array.isArray(map.colliders)) {
    throw new Error('File cần có danh sách colliders.');
  }
  const ids = new Set<string>();
  return map.colliders.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== 'object' ||
        !('id' in entry) || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id) ||
        !('center' in entry) || !vector(entry.center) ||
        !('size' in entry) || !vector(entry.size) || entry.size.some(n => n <= 0)) {
      throw new Error('Kiểm tra ID, tâm và kích thước vật cản thứ ' + (index + 1) + '.');
    }
    ids.add(entry.id);
    return new Box3().setFromCenterAndSize(new Vector3(...entry.center), new Vector3(...entry.size));
  });
}

// Batch all twelve edges per box into one draw call.
function edges(boxes: Box3[]) {
  const positions: number[] = [];
  for (const { min, max } of boxes) {
    const corners = Array.from({ length: 8 }, (_, i) => [
      i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z,
    ]);
    for (let i = 0; i < 8; i++) {
      for (const axis of [1, 2, 4]) {
        if (!(i & axis)) positions.push(...corners[i]!, ...corners[i | axis]!);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

export function mountColliderReview(parent: Group, controls: HTMLElement, reference: Reference, onBoxes: (boxes: Box3[] | null, layout?: SurveyLayout) => void) {
  const overlay = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#007d83', depthTest: false }));
  overlay.renderOrder = 2;
  parent.add(overlay);
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  label.append('Đối chiếu vật cản từ JSON ', input);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Gỡ lớp đối chiếu';
  reset.hidden = true;
  const coordinates = document.createElement('details');
  coordinates.hidden = true;
  controls.append(label, status, coordinates, reset);
  let revision = 0;
  function clear() {
    revision++;
    overlay.visible = false;
    overlay.geometry.dispose();
    overlay.geometry = new BufferGeometry();
    input.value = '';
    reset.hidden = true;
    status.textContent = '';
    coordinates.hidden = true;
    coordinates.replaceChildren();
    onBoxes(null);
  }
  reset.onclick = clear;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    clear();
    const version = revision;
    try {
      if (file.size > 2097152) throw new Error('Chọn file JSON dưới 2 MiB.');
      const map: unknown = JSON.parse(await file.text());
      const boxes = boxesFromMap(map);
      if (version !== revision) return;
      overlay.geometry.dispose();
      overlay.geometry = edges(boxes);
      overlay.visible = true;
      reset.hidden = false;
      const { matched, notes } = reviewPositions(map as Record<string, unknown>, reference);
      const summary = document.createElement('summary');
      summary.textContent = 'Tọa độ so với village-v1 · ' + matched + ' điểm khớp · ' + notes.length + ' mục cần xem';
      const list = document.createElement('ul');
      for (const note of notes) {
        const item = document.createElement('li');
        item.textContent = note;
        list.append(item);
      }
      coordinates.append(summary, list);
      coordinates.hidden = false;
      const layout = surveyLayout(map);
      onBoxes(boxes, layout);
      status.textContent = file.name + ' · ' + boxes.length + ' khung xanh ngọc. ' + (layout ? 'Tuyến JSON dùng điểm xuất phát, nhà giam và điểm cứu trong file.' : 'Dùng mốc village-v1. Chế độ tọa độ JSON cần map phẳng 80 × 80, 4 điểm xuất phát cướp và đủ 3 nhà giam với hai điểm cứu Tây/Đông.');
    } catch (error) {
      if (version === revision) status.textContent = error instanceof SyntaxError ? 'Không đọc được cú pháp JSON.' : String(error);
    }
  };
  return () => {
    revision++;
    parent.remove(overlay);
    overlay.geometry.dispose();
    overlay.material.dispose();
  };
}




