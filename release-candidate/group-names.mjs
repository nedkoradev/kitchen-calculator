function explicitName(names, id) {
  const value = names instanceof Map ? names.get(id) : names?.[id];
  return typeof value === 'string' ? value.trim() : '';
}

export function v3GroupDisplayNames(parts, names = {}) {
  const roots = [];
  const groups = new Map();
  const anonymousNames = new Map();
  let anonymousIndex = 0;

  for (const item of parts) {
    const part = item?.part ?? item;
    if (!part) continue;
    let children = roots;
    const path = [];
    for (const id of [part.assembly, ...(part.assemblyStack ?? []).slice().reverse()].filter(Boolean)) {
      if (path.includes(id)) continue;
      path.push(id);
      const key = JSON.stringify(path);
      let node = groups.get(key);
      if (!node) {
        const customName = explicitName(names, id);
        let name = customName;
        if (!name) {
          if (!anonymousNames.has(id)) anonymousNames.set(id, `Група ${++anonymousIndex}`);
          name = anonymousNames.get(id);
        }
        node = {assembly: id, name, count: 0, children: []};
        groups.set(key, node);
        children.push(node);
      }
      node.count++;
      children = node.children;
    }
  }

  const result = [];
  const collect = nodes => {
    for (const node of nodes) {
      result.push({assembly: node.assembly, name: node.name, count: node.count});
      collect(node.children);
    }
  };
  collect(roots);
  return result;
}

export function installV3GroupNames({getDocument}) {
  const list = document.getElementById('groupList');
  if (!list) return {refresh() {}, disconnect() {}};

  const refresh = () => {
    const documentState = getDocument?.();
    const nodes = v3GroupDisplayNames(documentState?.parts ?? [], documentState?.groups ?? {});
    const buttons = Array.from(list.querySelectorAll('[data-tree-kind="group"]'));
    for (let index = 0; index < buttons.length && index < nodes.length; index++) {
      const node = nodes[index];
      const label = `${node.name} (${node.count})`;
      const span = buttons[index].querySelector('span');
      if (span && span.textContent !== label) span.textContent = label;
      if (buttons[index].title !== label) buttons[index].title = label;
      const summary = buttons[index].closest('details')?.querySelector(':scope > summary');
      if (summary && summary.title !== node.name) summary.title = node.name;
    }
  };

  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(refresh)
    : null;
  observer?.observe(list, {childList: true, subtree: true, characterData: true});
  refresh();
  return {refresh, disconnect: () => observer?.disconnect()};
}
