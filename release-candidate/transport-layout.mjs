const fits = (x, z, w, d, area) => x >= 0 && z >= 0 && x + w <= area.w && z + d <= area.d;
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
export const stackHeight = stack => stack.layers.reduce((total, layer) => total + layer.thickness, 0);

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

export function planTransport(parts, area) {
  const stacks = [], remaining = [];
  const ordered = [...parts].sort((a, b) => (area.byGroup ? a.group.localeCompare(b.group) : 0) ||
    b.w * b.d - a.w * a.d);
  for (const part of ordered) {
    const candidates = orientations(part, area);
    const target = stacks.find(stack => (!area.byGroup || stack.layers[0].group === part.group) &&
      candidates.some(candidate => supported([...stack.layers, candidate], area)));
    if (target) {
      transferPanel(stacks, null, -1, target, target.layers.length, part, area);
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

export function planTransportLoads(parts, area) {
  const loads = [];
  const remaining = [];
  let pending = parts.filter(part => {
    const reason = part.thickness > area.height ? 'Над допустимата височина' :
      orientations(part, area).some(candidate => fits(0, 0, candidate.w, candidate.d, area))
        ? null : 'Извън товарните габарити';
    if (reason) remaining.push({...part, reason});
    return !reason;
  });
  while (pending.length) {
    const load = planTransport(pending, area);
    loads.push(load);
    pending = load.remaining;
  }
  return {loads, remaining};
}

export function transportWeight(parts) {
  return parts.reduce((total, part) => ({
    kg: total.kg + (part.kg ?? 0),
    known: total.known + Number(part.kg != null),
  }), {kg: 0, known: 0});
}
