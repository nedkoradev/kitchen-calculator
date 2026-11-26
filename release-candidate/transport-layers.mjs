// MaxRects on horizontal support planes. Each panel has a local x/y/z position.
const right = rect => rect.x + rect.w;
const back = rect => rect.z + rect.d;
const top = part => part.y + part.thickness;

function intersection(a, b) {
  const x = Math.max(a.x, b.x), z = Math.max(a.z, b.z);
  return {x, z, w: Math.min(right(a), right(b)) - x, d: Math.min(back(a), back(b)) - z};
}

function subtract(rect, part) {
  const overlap = intersection(rect, part);
  if (overlap.w <= 0 || overlap.d <= 0) return [rect];
  return [
    {...rect, w: overlap.x - rect.x}, {...rect, x: right(overlap), w: right(rect) - right(overlap)},
    {...rect, d: overlap.z - rect.z}, {...rect, z: back(overlap), d: back(rect) - back(overlap)},
  ].filter(box => box.w > 0 && box.d > 0);
}

const contains = (outer, inner) => inner.x >= outer.x && inner.z >= outer.z &&
  right(inner) <= right(outer) && back(inner) <= back(outer);

function fullySupported(part, layers) {
  if (part.y === 0) return true;
  const covered = layers.filter(other => top(other) === part.y).reduce((sum, other) => {
    const overlap = intersection(part, other);
    return sum + Math.max(0, overlap.w) * Math.max(0, overlap.d);
  }, 0);
  return covered === part.w * part.d;
}

export function canRemoveLayer(layers, index) {
  const supportedByRemoved = top(layers[index]);
  const others = layers.filter((_, i) => i !== index);
  return others.every(part => part.y !== supportedByRemoved || fullySupported(part, others));
}

export function placeLayer(layers, part, area) {
  const planes = [...new Set([0, ...layers.map(top)])].sort((a, b) => a - b);
  const shapes = area.rotate && part.w !== part.d ? [part, {...part, w: part.d, d: part.w}] : [part];
  for (const y of planes) {
    if (y + part.thickness > area.height) continue;
    const support = layers.filter(other => top(other) === y);
    if (y && !support.length) continue;
    let free = [{x: 0, z: 0, w: area.w, d: area.d}];
    for (const other of layers) {
      if (other.y >= y + part.thickness || top(other) <= y) continue;
      const split = free.flatMap(rect => subtract(rect, other));
      free = split.filter((rect, index) =>
        !split.some((outer, i) => i !== index && contains(outer, rect) &&
          (i < index || !contains(rect, outer))));
    }
    let best, score = Infinity;
    for (const rect of free) for (const shape of shapes) {
      if (shape.w > rect.w || shape.d > rect.d) continue;
      const xs = new Set([rect.x, right(rect) - shape.w]);
      const zs = new Set([rect.z, back(rect) - shape.d]);
      for (const surface of support) {
        xs.add(surface.x);
        xs.add(right(surface) - shape.w);
        zs.add(surface.z);
        zs.add(back(surface) - shape.d);
      }
      const waste = rect.w * rect.d - shape.w * shape.d;
      if (waste >= score) continue;
      search: for (const z of zs) for (const x of xs) {
        const candidate = {...shape, x, y, z};
        if (contains(rect, candidate) && fullySupported(candidate, support)) {
          best = candidate;
          score = waste;
          break search;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

export function positionedLoad(parts, area) {
  const layers = [], remaining = [];
  for (const part of parts) {
    const placement = placeLayer(layers, part, area);
    if (placement) layers.push(placement);
    else remaining.push(part);
  }
  layers.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  return {stacks: [{x: 0, z: 0, w: Math.max(...layers.map(right)), d: Math.max(...layers.map(back)),
    layers, positioned: true}], remaining};
}
