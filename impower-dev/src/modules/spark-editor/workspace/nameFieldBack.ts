type BackEntry = { close: () => void; href: string; index?: number };

type NavigationLike = { currentEntry?: { index: number } | null };

const entries: BackEntry[] = [];

let returning = false;

const historyIndex = (): number | undefined => {
  const index = (globalThis as { navigation?: NavigationLike }).navigation
    ?.currentEntry?.index;
  return typeof index === "number" && index >= 0 ? index : undefined;
};

export function watchBack(close: () => void): () => void {
  const entry: BackEntry = {
    close,
    href: window.location.href,
    index: historyIndex(),
  };
  entries.push(entry);
  return () => {
    const index = entries.indexOf(entry);
    if (index >= 0) {
      entries.splice(index, 1);
    }
  };
}

export function returningFromBack(): boolean {
  return returning;
}

export function interceptBack(): boolean {
  if (returning) {
    returning = false;
    return true;
  }
  const entry = entries[entries.length - 1];
  if (!entry) {
    return false;
  }
  const index = historyIndex();
  const known = entry.index !== undefined && index !== undefined;
  if (known && index > entry.index!) {
    return false;
  }
  entries.pop();
  if (known && index < entry.index!) {
    returning = true;
    window.history.go(entry.index! - index);
  } else if (window.location.href !== entry.href) {
    window.history.pushState(window.history.state, "", entry.href);
  }
  entry.close();
  return true;
}
