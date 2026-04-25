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
