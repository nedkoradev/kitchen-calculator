import {axes, bounds, canPlace, dimensions} from '../geometry.mjs';
import {placeCabinet} from '../cabinet-generator.mjs';
import {identifier} from '../document-format/model.mjs';

const boardCatalog = {pdc: 'pdcMaterials', back: 'backMaterials', worktop: 'worktops'};
const groupFields = ['assembly', 'constructorCabinet'];

export const comparableJson = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);

function groupIds(scene) {
  return new Set([...Object.keys(scene.groups), ...scene.parts.flatMap(({part}) =>
    [...groupFields.map(key => part[key]), ...(part.assemblyStack ?? [])].filter(id => id != null))]);
}

function placement(parts, scene) {
  if (!scene.room) return {x: 0, y: 0, z: 0};
  const obstacles = scene.parts.map(item => item.part);
  if (parts.every(part => canPlace([part], obstacles, scene.room))) return {x: 0, y: 0, z: 0};
  const envelope = {};
  for (const axis of axes) {
    const {min, max} = bounds(parts, axis);
    envelope[axis] = (min + max) / 2;
    envelope[dimensions[axis]] = Math.ceil(max - min);
  }
  // Place the assembly as a single footprint. Internal relationships remain unchanged.
  const [{part: placed}] = placeCabinet([{part: envelope}], obstacles, scene.room, {preferSideBySide: true});
  return {x: placed.x - envelope.x, y: placed.y - envelope.y, z: placed.z - envelope.z};
}

export function insertIntoScene(scene, model, nextId) {
  if (!model.parts.length) throw new TypeError('Cannot insert an empty model');
  const offset = placement(model.parts.map(item => item.part), scene);
  const used = new Set([
    ...groupIds(scene), ...groupIds(model),
    ...scene.parts.map(item => item.part.key), ...model.parts.map(item => item.part.key),
  ]);
  function allocate() {
    const id = identifier(nextId());
    if (used.has(id)) throw new TypeError('Duplicate generated scene ID');
    used.add(id);
    return id;
  }

  const groups = new Map([...groupIds(model)].map(id => [id, allocate()]));
  for (const [id, name] of Object.entries(model.groups)) {
    Object.defineProperty(scene.groups, groups.get(id), {value: name, enumerable: true, writable: true, configurable: true});
  }

  const indexMaps = new Map();
  function remapIndex(catalog, index) {
    if (index == null || index === '') return index;
    const numeric = Number(index);
    if (!indexMaps.has(catalog)) indexMaps.set(catalog, new Map());
    const indices = indexMaps.get(catalog);
    if (!indices.has(numeric)) {
      const material = model.materials[catalog][numeric];
      const signature = comparableJson(material);
      const target = scene.materials[catalog];
      let mapped = target.findIndex(entry => comparableJson(entry) === signature);
      if (mapped === -1) {
        mapped = target.length;
        target.push(material);
      }
      indices.set(numeric, mapped);
    }
    return indices.get(numeric);
  }

  for (const item of model.parts) {
    const {part, finish} = item;
    part.key = allocate();
    for (const axis of axes) part[axis] += offset[axis];
    for (const key of groupFields) if (part[key] != null) part[key] = groups.get(part[key]);
    if (part.assemblyStack) part.assemblyStack = part.assemblyStack.map(id => id === null ? null : groups.get(id));
    if (finish?.material != null) finish.material = remapIndex(boardCatalog[finish.materialType ?? 'pdc'], finish.material);
    if (finish?.edges) finish.edges = finish.edges.map(index => remapIndex('edgeMaterials', index));
    scene.parts.push(item);
  }
  return scene;
}
