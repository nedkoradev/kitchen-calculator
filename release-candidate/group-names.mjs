import {documentTree} from '../document-tree.mjs';

export function v3GroupNameMap(parts, names = {}) {
  const nameMap = new Map();
  const anonymousNames = new Map();
  let anonymousIndex = 0;
  const visit = nodes => {
    for (const node of nodes) {
      if (node.kind === 'group') {
        const value = names instanceof Map ? names.get(node.assembly) : names?.[node.assembly];
        const customName = typeof value === 'string' ? value.trim() : '';
        if (!nameMap.has(node.assembly)) {
          if (customName) nameMap.set(node.assembly, customName);
          else {
            if (!anonymousNames.has(node.assembly)) anonymousNames.set(node.assembly, `Група ${++anonymousIndex}`);
            nameMap.set(node.assembly, anonymousNames.get(node.assembly));
          }
        }
      }
      if (node.children) visit(node.children);
    }
  };
  visit(documentTree(parts, names));
  return nameMap;
}
