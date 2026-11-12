import { type NodeType } from "@lezer/common";

const expandedScopes = new WeakMap<NodeType, string>();

export const recordExpandedScope = (type: NodeType, scope: string) => {
  expandedScopes.set(type, scope);
};

export const expandedScopeOf = (type: NodeType): string | undefined =>
  expandedScopes.get(type);
