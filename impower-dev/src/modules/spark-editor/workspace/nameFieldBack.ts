type BackEntry = { close: () => void; href: string; index?: number };

type NavigationLike = {
  currentEntry?: { index: number } | null;
  entries?: () => { sameDocument: boolean }[];
};

const navigationApi = (): NavigationLike | undefined =>
  (globalThis as { navigation?: NavigationLike }).navigation;

const keepBackInDocument = () => {
  const navigation = navigationApi();
  const index = navigation?.currentEntry?.index;
  if (typeof index !== "number" || typeof navigation?.entries !== "function") {
    return;
  }
  const previous = navigation.entries()[index - 1];
  if (!previous?.sameDocument) {
    window.history.pushState(window.history.state, "", window.location.href);
  }
};

const entries: BackEntry[] = [];

let returnTo: number | undefined;

const historyIndex = (): number | undefined => {
  const index = navigationApi()?.currentEntry?.index;
  return typeof index === "number" && index >= 0 ? index : undefined;
};

export function watchBack(close: () => void): () => void {
  keepBackInDocument();
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
  return returnTo !== undefined && historyIndex() !== returnTo;
}

export function interceptBack(): boolean {
  if (returnTo !== undefined) {
    const arrived = historyIndex() === returnTo;
    returnTo = undefined;
    if (arrived) {
      return true;
    }
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
    returnTo = entry.index;
    window.history.go(entry.index! - index);
  } else if (window.location.href !== entry.href) {
    window.history.pushState(window.history.state, "", entry.href);
  }
  entry.close();
  return true;
}
