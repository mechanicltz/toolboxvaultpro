export type LocationNode = {
  id: string;
  name: string;
  parent_id?: string | null;
  children: LocationNode[];
  depth: number;
  path: string;
};

export function buildLocationTree(flat: any[]): LocationNode[] {
  const byId: Record<string, LocationNode> = {};
  flat.forEach((l) => {
    byId[l.id] = {
      id: l.id,
      name: l.name,
      parent_id: l.parent_id || null,
      children: [],
      depth: 0,
      path: l.name,
    };
  });
  const roots: LocationNode[] = [];
  Object.values(byId).forEach((n) => {
    if (n.parent_id && byId[n.parent_id]) {
      byId[n.parent_id].children.push(n);
    } else {
      roots.push(n);
    }
  });
  const setDepth = (node: LocationNode, depth: number, parentPath: string) => {
    node.depth = depth;
    node.path = parentPath ? `${parentPath} → ${node.name}` : node.name;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach((c) => setDepth(c, depth + 1, node.path));
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach((r) => setDepth(r, 0, ""));
  return roots;
}

export function flattenLocationTree(roots: LocationNode[]): LocationNode[] {
  const out: LocationNode[] = [];
  const walk = (n: LocationNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export function findLocationPath(flat: any[], id: string | null | undefined): string {
  if (!id) return "";
  const tree = buildLocationTree(flat);
  const all = flattenLocationTree(tree);
  return all.find((n) => n.id === id)?.path || "";
}

/**
 * Build a { id -> "Main › Drawer 1" } map for all locations using the given
 * separator. Cheap to call once per render and look up per row.
 */
export function buildLocationPathMap(
  flat: any[],
  sep: string = " › ",
): Record<string, string> {
  const byId: Record<string, any> = {};
  (flat || []).forEach((l) => {
    if (l && l.id) byId[l.id] = l;
  });
  const cache: Record<string, string> = {};
  const pathFor = (id: string, guard = 0): string => {
    if (cache[id]) return cache[id];
    const node = byId[id];
    if (!node || guard > 30) return "";
    const parent = node.parent_id && byId[node.parent_id];
    const p = parent ? `${pathFor(node.parent_id, guard + 1)}${sep}${node.name}` : node.name;
    cache[id] = p;
    return p;
  };
  Object.keys(byId).forEach((id) => pathFor(id));
  return cache;
}

/** Walk up to the top-level ancestor id for a given location id. */
export function topAncestorId(
  flat: any[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const byId: Record<string, any> = {};
  (flat || []).forEach((l) => {
    if (l && l.id) byId[l.id] = l;
  });
  let cur = byId[id];
  let guard = 0;
  while (cur && cur.parent_id && byId[cur.parent_id] && guard++ < 30) {
    cur = byId[cur.parent_id];
  }
  return cur ? cur.id : id;
}

