import {t} from './i18n.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {placeStack, stackHeight} from './transport-layout.mjs';

export function createTransportView(host, onSelect, onMove, onPanelDrop) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef3f9');
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 1000000);
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', t('3D изглед на транспортната подредба'));
  host.append(canvas);
  const labels = document.createElement('div');
  labels.className = 'transportCanvasLabels';
  host.append(labels);
  const controls = new OrbitControls(camera, canvas);
  controls.addEventListener('change', draw);
  const boxes = new THREE.Group();
  scene.add(boxes);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let layout, area, selected, annotations = [], drag;

  function draw() {
    renderer.render(scene, camera);
    const point = new THREE.Vector3();
    for (const {node, position} of annotations) {
      point.copy(position).project(camera);
      node.hidden = point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      node.style.left = ((point.x + 1) * 50) + '%';
      node.style.top = ((1 - point.y) * 50) + '%';
    }
  }

  const observer = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
    draw();
  });
  observer.observe(host);

  function aim(view = '3d') {
    if (!area) return;
    const size = Math.max(area.w, area.d, ...layout.stacks.map(stackHeight));
    controls.target.set(area.w / 2, 0, area.d / 2);
    const distance = size * 2 / Math.min(1, camera.aspect);
    const offset = view === 'top' ? [0, distance, .01]
      : view === 'side' ? [0, 0, distance] : [distance * .75, distance * .65, distance * .75];
    camera.position.copy(controls.target).add(new THREE.Vector3(...offset));
    controls.update();
    draw();
  }

  function clear() {
    for (const mesh of [...boxes.children]) {
      mesh.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      boxes.remove(mesh);
    }
    labels.replaceChildren();
    annotations = [];
  }

  function box(w, h, d, x, y, z, color, stack) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color}));
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({color: '#496178'})));
    mesh.position.set(x, y, z);
    mesh.userData.stack = stack;
    boxes.add(mesh);
  }

  function annotation(text, position) {
    const label = document.createElement('span');
    label.textContent = text;
    labels.append(label);
    annotations.push({node: label, position});
  }

  function dimension(start, end, length, tick) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const vector = b.clone().sub(a);
    const direction = vector.clone().normalize();
    const head = Math.min(tick, length / 3);
    const material = new THREE.LineBasicMaterial({color: '#19334e'});
    const points = [a, b];
    const wing = new THREE.Vector3(1, 0, 1);
    wing.addScaledVector(direction, -wing.dot(direction)).normalize().multiplyScalar(head * .4);
    for (const [tip, inward] of [[a, 1], [b, -1]]) {
      const base = tip.clone().addScaledVector(direction, head * inward);
      points.push(tip, base.clone().add(wing), tip, base.clone().sub(wing));
    }
    boxes.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
    annotation(length + t(' мм'), a.clone().lerp(b, .5));
  }

  function loadDimensions(stacks) {
    const left = Math.min(...stacks.map(stack => stack.x));
    const front = Math.min(...stacks.map(stack => stack.z));
    const right = Math.max(...stacks.map(stack => stack.x + stack.w));
    const back = Math.max(...stacks.map(stack => stack.z + stack.d));
    const height = Math.max(...stacks.map(stackHeight));
    const margin = Math.max(right - left, back - front) * .08;
    dimension([left, 1, back + margin], [right, 1, back + margin], right - left, margin * .4);
    dimension([left - margin, 1, front], [left - margin, 1, back], back - front, margin * .4);
    dimension([right + margin, 0, back], [right + margin, height, back], height, margin * .4);
  }

  function update(nextLayout, nextArea, active, options, resetCamera = false) {
    layout = nextLayout;
    area = nextArea;
    selected = active;
    clear();
    box(area.w, 4, area.d, area.w / 2, -2, area.d / 2, '#d0ddeb');
    for (const [index, stack] of layout.stacks.entries()) {
      let y = 0;
      const layerGap = options.layers && stack === selected
        ? Math.min(30, Math.max(area.w, area.d) * .4 / stack.layers.length) : 0;
      for (const [index, layer] of stack.layers.entries()) {
        const x = stack.x + (stack.positioned ? layer.x + layer.w / 2 : stack.w / 2);
        const z = stack.z + (stack.positioned ? layer.z + layer.d / 2 : stack.d / 2);
        const level = stack.positioned ? layer.y + index * layerGap : y;
        box(layer.w, layer.thickness, layer.d, x, level + layer.thickness / 2,
          z, layer.id === options.partId ? '#f3a248' : stack === selected ? '#a0c9ee' : layer.color, stack);
        if (layerGap && options.labels) annotation(layer.label,
          new THREE.Vector3(x + layer.w / 2, level + layer.thickness / 2, z));
        y += layer.thickness + layerGap;
      }
      const top = stack.layers.at(-1);
      if (options.labels && !layerGap) annotation(t('Купчина ') + (index + 1) + ' · ' + top.label,
        new THREE.Vector3(stack.x + stack.w / 2, stackHeight(stack), stack.z + stack.d / 2));
    }
    if (options.dimensions && layout.stacks.length) loadDimensions(layout.stacks);
    if (resetCamera) aim();
    else draw();
  }

  function cast(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
  }

  function hitStack() {
    return ray.intersectObjects(boxes.children.filter(object => object.isMesh), false).find(hit => hit.object.userData.stack)?.object.userData.stack;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !layout) return;
    cast(event);
    const stack = hitStack();
    if (!stack) return;
    onSelect(stack);
    if (!event.shiftKey) return;
    const point = ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (!point) return;
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    drag = {stack, x: point.x - stack.x, z: point.z - stack.z};
  }, true);

  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    cast(event);
    const point = ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (!point) return;
    drag.destination = {x: Math.round(point.x - drag.x), z: Math.round(point.z - drag.z)};
    canvas.dataset.drop = placeStack(layout.stacks, drag.stack, drag.destination.x, drag.destination.z, area)
      ? 'valid' : 'invalid';
  });
  function endDrag(event) {
    if (!drag) return;
    const {stack, destination} = drag;
    drag = null;
    controls.enabled = true;
    delete canvas.dataset.drop;
    if (event.type === 'pointerup' && destination) onMove(stack, destination.x, destination.z);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('dragover', event => {
    cast(event);
    if (hitStack() || ray.ray.intersectsPlane(floor)) event.preventDefault();
  });
  canvas.addEventListener('drop', event => {
    cast(event);
    const stack = hitStack();
    const point = ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (stack || point) {
      event.preventDefault();
      onPanelDrop(stack, point);
    }
  });

  return {update, aim, dispose() {
    observer.disconnect();
    controls.dispose();
    clear();
    renderer.dispose();
    renderer.forceContextLoss();
    host.replaceChildren();
  }};
}
