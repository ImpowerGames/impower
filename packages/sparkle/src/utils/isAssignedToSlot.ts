export const isAssignedToSlot = (n: Node, name?: string): boolean => {
  if (!name) {
    return !(n instanceof HTMLElement) || n.getAttribute("slot") == null;
  }
  return n instanceof HTMLElement && n.getAttribute("slot") === name;
};
