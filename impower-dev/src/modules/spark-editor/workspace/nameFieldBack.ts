const open = new Set<() => void>();

export function watchBack(discard: () => void): () => void {
  open.add(discard);
  return () => {
    open.delete(discard);
  };
}

export function discardOnBack() {
  for (const discard of [...open].reverse()) {
    open.delete(discard);
    discard();
  }
}
