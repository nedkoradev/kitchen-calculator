import {canRemoveLayer, placeLayer, positionedLoad} from './transport-layers.mjs';

const fits = (x, z, w, d, area) => x >= 0 && z >= 0 && x + w <= area.w && z + d <= area.d;
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
export const stackHeight = stack => stack.positioned
  ? Math.max(0, ...stack.layers.map(layer => layer.y + layer.thickness))
  : stack.layers.reduce((total, layer) => total + layer.thickness, 0);

function orientations(part, area) {
  return area.rotate && part.w !== part.d ? [part, {...part, w: part.d, d: part.w}] : [part];
}

function supported(layers, area) {
  let height = 0;
  for (const [index, layer] of layers.entries()) {
    const below = layers[index - 1];
    if (below && (layer.w > below.w || layer.d > below.d)) return false;
    height += layer.thickness;
  }
  return height <= area.height;
}

export function placeStack(stacks, stack, x, z, area) {
  const position = {...stack, x, z};
  return fits(x, z, stack.w, stack.d, area) &&
    !stacks.some(other => other !== stack && overlaps(position, other));
}

export function transferPanel(stacks, source, index, target, slot, part, area) {
  if (source?.positioned || target.positioned) {
    if (source === target || (source?.positioned && !canRemoveLayer(source.layers, index))) return false;
    if (target.positioned) {
      const candidate = placeLayer(target.layers, part, {w: target.w, d: target.d,
        height: area.height, rotate: area.rotate});
      if (!candidate) return false;
      target.layers.push(candidate);
      target.layers.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
      if (source) source.layers.splice(index, 1);
      if (source && !source.layers.length) stacks.splice(stacks.indexOf(source), 1);
      return true;
    }
  }
  const from = source ? [...source.layers] : null;
  if (from) from.splice(index, 1);
  const destination = source === target ? from : [...target.layers];
  if (source === target && slot > index) slot--;
  for (const candidate of orientations(part, area)) {
    const layers = [...destination];
    layers.splice(slot, 0, candidate);
    const base = layers[0];
    if (!supported(layers, area) || base.w > target.w || base.d > target.d) continue;
    if (source && source !== target) source.layers = from;
    target.layers = layers;
    if (source && !source.layers.length) stacks.splice(stacks.indexOf(source), 1);
    return true;
  }
  return false;
}

export function startStack(stacks, source, index, part, x, z, area) {
  const obstacles = source?.layers.length === 1 ? stacks.filter(stack => stack !== source) : stacks;
  for (const candidate of orientations(part, area)) {
    const stack = {x, z, w: candidate.w, d: candidate.d, layers: []};
    if (placeStack(obstacles, stack, x, z, area) &&
        transferPanel(stacks, source, index, stack, 0, candidate, area)) {
      stacks.push(stack);
      return stack;
    }
  }
  return null;
}

const byFootprint = (a, b) => b.w * b.d - a.w * a.d;
const byLongEdge = (a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d) || byFootprint(a, b);

export function planTransport(parts, area, order = byFootprint, preferRotated = false, fillHighest = false) {
  const stacks = [], remaining = [];
  const ordered = [...parts].sort((a, b) => (area.byGroup ? a.group.localeCompare(b.group) : 0) ||
    order(a, b));
  for (const part of ordered) {
    const candidates = orientations(part, area);
    if (preferRotated) candidates.reverse();
    let placement;
    for (const stack of stacks) {
      if (area.byGroup && stack.layers[0].group !== part.group) continue;
      const top = stack.layers.at(-1);
      const height = stackHeight(stack) + part.thickness;
      if (height > area.height || (placement && height <= placement.height)) continue;
      for (const candidate of candidates) {
        if (candidate.w > top.w || candidate.d > top.d) continue;
        placement = {stack, candidate, height};
        break;
      }
      if (placement && !fillHighest) break;
    }
    if (placement) {
      placement.stack.layers.push(placement.candidate);
      continue;
    }
    // A feasible edge belongs at the origin or immediately after another stack.
    const xs = [...new Set([0, ...stacks.map(stack => stack.x + stack.w)])].sort((a, b) => a - b);
    const zs = [...new Set([0, ...stacks.map(stack => stack.z + stack.d)])].sort((a, b) => a - b);
    let position;
    if (part.thickness <= area.height) {
      outer: for (const z of zs) for (const x of xs) for (const candidate of candidates) {
        const stack = {x, z, w: candidate.w, d: candidate.d, layers: [candidate]};
        if (placeStack(stacks, stack, x, z, area)) {
          position = stack;
          break outer;
        }
      }
    }
    if (position) stacks.push(position);
    else remaining.push({...part, reason: part.thickness > area.height ? 'Над допустимата височина' :
      candidates.some(candidate => fits(0, 0, candidate.w, candidate.d, area))
        ? 'Няма свободно място или подходяща опора' : 'Извън товарните габарити'});
  }
  return {stacks, remaining};
}

const scoreLoads = candidate => candidate.reduce((total, load, index) => total + (candidate.length - index) *
      load.stacks.reduce((volume, stack) => volume +
        stack.layers.reduce((sum, part) => sum + part.w * part.d * part.thickness, 0), 0), 0);

export function planTransportLoads(parts, area) {
  const remaining = [];
  const eligible = parts.filter(part => {
    const reason = part.thickness > area.height ? 'Над допустимата височина' :
      orientations(part, area).some(candidate => fits(0, 0, candidate.w, candidate.d, area))
        ? null : 'Извън товарните габарити';
    if (reason) remaining.push({...part, reason});
    return !reason;
  });
  // Try two priorities and, when allowed, both starting orientations.
  // Rank by trip count first, then by volume packed into earlier trips.
  let loads;
  let bestScore;
  for (const [order, preferRotated, fillHighest] of [[byFootprint, false, false],
    [byFootprint, false, true], [byLongEdge, false, true],
    ...(area.rotate ? [[byFootprint, true, true], [byLongEdge, true, true]] : [])]) {
    const candidate = [];
    let pending = eligible;
    while (pending.length) {
      const load = planTransport(pending, area, order, preferRotated, fillHighest);
      candidate.push(load);
      pending = load.remaining;
    }
    const score = scoreLoads(candidate);
    if (!loads || candidate.length < loads.length || (candidate.length === loads.length && score > bestScore)) {
      loads = candidate;
      bestScore = score;
    }
    if (loads.length <= 1) break;
  }
  if (!area.byGroup && loads.length > 1) {
    for (const order of [byFootprint, byLongEdge, (a, b) => b.thickness - a.thickness || byFootprint(a, b)]) {
      const candidate = [];
      let pending = [...eligible].sort(order);
      while (pending.length && candidate.length < loads.length) {
        const load = positionedLoad(pending, area);
        candidate.push(load);
        pending = load.remaining;
      }
      if (pending.length) continue;
      // Try to absorb the tail by repacking one earlier load at a time.
      const tail = candidate.at(-1);
      if (candidate.length > 1) {
        const tailParts = tail.stacks[0].layers;
        for (const load of candidate.slice(0, -1).slice(0, 8)) {
          const attempt = positionedLoad([...load.stacks[0].layers, ...tailParts].sort(order), area);
          if (attempt.remaining.length) continue;
          load.stacks = attempt.stacks;
          candidate.pop();
          break;
        }
      }
      const score = scoreLoads(candidate);
      if (candidate.length < loads.length || (candidate.length === loads.length && score > bestScore)) {
        loads = candidate;
        bestScore = score;
      }
      if (loads.length === 1) break;
    }
  }
  return {loads, remaining};
}

export function transportWeight(parts) {
  return parts.reduce((total, part) => ({
    kg: total.kg + (part.kg ?? 0),
    known: total.known + Number(part.kg != null),
  }), {kg: 0, known: 0});
}
