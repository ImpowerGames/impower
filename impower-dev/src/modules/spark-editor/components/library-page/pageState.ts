import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

type Lists = NonNullable<typeof workspace.current.lists>;

export type QueriesKey = "scriptsQueries" | "assetsQueries";

export type ScrollsKey = "scriptsScrolls" | "assetsScrolls";

export type LayoutsKey = "assetsLayouts";

export type FolderLayout = "portrait" | "landscape" | "small" | "rows";

export const LEGACY_TILES = "tiles";

export type StoredFolderLayout = FolderLayout | typeof LEGACY_TILES;

const STORED_FOLDER_LAYOUTS: readonly unknown[] = ["portrait", "landscape", "small", "rows", LEGACY_TILES];

const isStoredFolderLayout = (value: unknown): value is StoredFolderLayout => STORED_FOLDER_LAYOUTS.includes(value);

type Intents = typeof import("../../workspace/Workspace").Workspace;

let intents: Intents | undefined;

const loadIntents = () =>
  import("../../workspace/Workspace").then(({ Workspace }) => (intents = Workspace));

const setListState = (read: (lists: Lists) => Partial<Lists>) => {
  const apply = (loaded: Intents) => loaded.window.setListState(read(workspace.state.peek().lists ?? {}));
  if (intents) {
    apply(intents);
  } else {
    void loadIntents().then(apply);
  }
};

export function useTabQuery(
  key: QueriesKey,
  tab: string,
): [string, (query: string) => void] {
  const [query, setQuery] = useState(
    () => workspace.state.peek().lists?.[key]?.[tab] ?? "",
  );
  const change = useCallback(
    (next: string) => {
      setQuery(next);
      setListState((lists) => ({
        [key]: { ...lists[key], [tab]: next },
      }));
    },
    [key, tab],
  );
  return [query, change];
}

export function useFolderLayout(
  key: LayoutsKey,
  folder: string,
): [StoredFolderLayout | undefined, (layout: FolderLayout) => void] {
  const saved = workspace.state.value.lists?.[key]?.[folder];
  const change = useCallback(
    (next: FolderLayout) =>
      setListState((lists) => ({
        [key]: { ...lists[key], [folder]: next },
      })),
    [key, folder],
  );
  return [isStoredFolderLayout(saved) ? saved : undefined, change];
}

const SCROLL_SAVE_INTERVAL = 500;

const savedTop = (key: ScrollsKey, tab: string) => workspace.state.peek().lists?.[key]?.[tab] ?? 0;

export function useSavedScroll(key: ScrollsKey, tab: string) {
  const top = useRef(savedTop(key, tab));
  const attached = useRef<HTMLDivElement | null>(null);
  const shown = useRef({ key, tab });
  const settled = useRef(true);
  if (shown.current.key !== key || shown.current.tab !== tab) {
    settled.current = false;
  }
  const restored = useRef<{
    element: HTMLDivElement;
    key: ScrollsKey;
    tab: string;
  } | null>(null);

  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(() => {
    clearTimeout(pending.current);
    pending.current = undefined;
    const { key: shownKey, tab: shownTab } = shown.current;
    const scrolled = top.current;
    if (scrolled !== savedTop(shownKey, shownTab)) {
      setListState((lists) => ({
        [shownKey]: { ...lists[shownKey], [shownTab]: scrolled },
      }));
    }
  });
  const onScroll = useRef(() => {
    if (!settled.current || !attached.current) {
      return;
    }
    top.current = attached.current.scrollTop;
    pending.current ??= setTimeout(save.current, SCROLL_SAVE_INTERVAL);
  });

  useEffect(() => {
    if (shown.current.key !== key || shown.current.tab !== tab) {
      save.current();
      shown.current = { key, tab };
      top.current = savedTop(key, tab);
      if (attached.current) {
        attached.current.scrollTop = top.current;
        restored.current = { element: attached.current, key, tab };
      }
    }
    settled.current = true;
  }, [key, tab]);

  useEffect(() => {
    void loadIntents();
    const leave = () => save.current();
    const hide = () => {
      if (document.visibilityState === "hidden") {
        save.current();
      }
    };
    window.addEventListener("pagehide", leave, true);
    document.addEventListener("visibilitychange", hide, true);
    return () => {
      window.removeEventListener("pagehide", leave, true);
      document.removeEventListener("visibilitychange", hide, true);
      save.current();
      attached.current?.removeEventListener("scroll", onScroll.current);
    };
  }, []);

  return useCallback((element: HTMLDivElement | null) => {
    if (element === attached.current) {
      return;
    }
    attached.current?.removeEventListener("scroll", onScroll.current);
    attached.current = element;
    if (element) {
      const { key: shownKey, tab: shownTab } = shown.current;
      const last = restored.current;
      if (
        last?.element === element &&
        last.key === shownKey &&
        last.tab === shownTab
      ) {
        if (settled.current) {
          top.current = element.scrollTop;
        }
      } else {
        element.scrollTop = top.current;
        restored.current = { element, key: shownKey, tab: shownTab };
      }
      element.addEventListener("scroll", onScroll.current, { passive: true });
    }
  }, []);
}
