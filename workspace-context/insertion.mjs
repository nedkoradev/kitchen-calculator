import {axes, bounds, canPlace, dimensions} from '../geometry.mjs';
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

function shifted(parts, offset) {
  return parts.map(part => ({...part, x: part.x + offset.x, y: part.y + offset.y, z: part.z + offset.z}));
}

function axisOffsets(axis, parts, obstacles, room, extent) {
  const dimension = dimensions[axis];
  const origin = axis === 'y' ? 0 : -room[dimension] / 2;
  const leading = extent.min - origin;
  const last = Math.floor(room[dimension] - (extent.max - extent.min));
  const candidates = new Set([0, last, Math.floor(leading), Math.ceil(leading)]);
  // A collision-free region starts or ends when a member meets an obstacle face.
  // Round away from that obstacle to the editor's whole-mm leading-face grid.
  for (const part of parts) {
    for (const obstacle of obstacles) {
      const halfPart = part[dimension] / 2;
      const halfObstacle = obstacle[dimension] / 2;
      const gap = obstacle[axis] - part[axis];
      candidates.add(Math.floor(leading + gap - halfObstacle - halfPart));
      candidates.add(Math.ceil(leading + gap + halfObstacle + halfPart));
    }
  }
  return [...candidates].filter(value => value >= 0 && value <= last)
    .map(value => value - leading)
    .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
}

function placement(parts, scene) {
  const zero = {x: 0, y: 0, z: 0};
  const extent = Object.fromEntries(axes.map(axis => [axis, bounds(parts, axis)]));
  // Check internal pairs even for a model without a room. Normalize into a tight
  // temporary room so the check is independent of the model's saved position.
  const normalized = {x: -(extent.x.min + extent.x.max) / 2, y: -extent.y.min,
    z: -(extent.z.min + extent.z.max) / 2};
  const ownRoom = Object.fromEntries(axes.map(axis =>
    [dimensions[axis], Math.ceil(extent[axis].max - extent[axis].min)]));
  if (!canPlace(shifted(parts, normalized), [], ownRoom)) {
    throw new Error('Моделът съдържа невалидни размери или застъпване между детайли.');
  }
  if (!scene.room) return zero;
  const obstacles = scene.parts.map(item => item.part);
  if (canPlace(parts, obstacles, scene.room)) return zero;

  // The generator's placeCabinet() searches X/Z at one height. A library
  // assembly can use room on any level, including between obstacle faces.
  const [xs, ys, zs] = axes.map(axis => axisOffsets(axis, parts, obstacles, scene.room, extent[axis]));
  for (const y of ys) {
    for (const z of zs) {
      for (const x of xs) {
        const offset = {x, y, z};
        if (canPlace(shifted(parts, offset), obstacles, scene.room)) return offset;
      }
    }
  }
  throw new Error('Няма свободно място за модела в стаята.');
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
