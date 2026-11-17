type BackEntry = { close: () => void; href: string };

const entries: BackEntry[] = [];

export function watchBack(close: () => void): () => void {
  const entry: BackEntry = { close, href: window.location.href };
  entries.push(entry);
  return () => {
    const index = entries.indexOf(entry);
    if (index >= 0) {
      entries.splice(index, 1);
    }
  };
}

export function interceptBack(): boolean {
  const entry = entries.pop();
  if (!entry) {
    return false;
  }
  if (window.location.href !== entry.href) {
    window.history.pushState(window.history.state, "", entry.href);
  }
  entry.close();
  return true;
}
