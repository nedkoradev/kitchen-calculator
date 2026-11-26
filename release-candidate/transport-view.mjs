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
  canvas.setAttribute('aria-label', '3D изглед на транспортната подредба');
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

  function update(nextLayout, nextArea, active, options, resetCamera = false) {
    layout = nextLayout;
    area = nextArea;
    selected = active;
    clear();
    box(area.w, 4, area.d, area.w / 2, -2, area.d / 2, '#d0ddeb');
    for (const [index, stack] of layout.stacks.entries()) {
      let y = 0;
      for (const layer of stack.layers) {
        box(layer.w, layer.thickness, layer.d, stack.x + stack.w / 2, y + layer.thickness / 2,
          stack.z + stack.d / 2, stack === selected ? '#a0c9ee' : layer.color, stack);
        y += layer.thickness;
      }
      const top = stack.layers.at(-1);
      const text = [
        options.labels ? 'Купчина ' + (index + 1) + ' · ' + top.label : '',
        options.dimensions ? [stack.w, stack.d, y].join(' × ') + ' мм' : '',
      ].filter(Boolean).join(' | ');
      if (text) {
        const node = document.createElement('span');
        node.textContent = text;
        labels.append(node);
        annotations.push({node, position: new THREE.Vector3(stack.x + stack.w / 2, y, stack.z + stack.d / 2)});
      }
    }
    if (resetCamera) aim();
    else draw();
  }

  function cast(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
  }

  function hitStack() {
    return ray.intersectObjects(boxes.children, false).find(hit => hit.object.userData.stack)?.object.userData.stack;
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
    const stack = hitStack();
    if (stack) event.preventDefault();
  });
  canvas.addEventListener('drop', event => {
    cast(event);
    const stack = hitStack();
    if (stack) {
      event.preventDefault();
      onPanelDrop(stack);
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
