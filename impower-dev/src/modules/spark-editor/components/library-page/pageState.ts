import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

type Lists = NonNullable<typeof workspace.current.lists>;

export type QueriesKey = "scriptsQueries" | "assetsQueries";

export type ScrollsKey = "scriptsScrolls" | "assetsScrolls";

const setListState = (read: (lists: Lists) => Partial<Lists>) =>
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    Workspace.window.setListState(read(workspace.state.peek().lists ?? {})),
  );

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

export function useSavedScroll(key: ScrollsKey, tab: string) {
  const top = useRef(workspace.state.peek().lists?.[key]?.[tab] ?? 0);
  const attached = useRef<HTMLDivElement | null>(null);
  const onScroll = useRef(() => {
    top.current = attached.current?.scrollTop ?? top.current;
  });

  const shown = useRef({ key, tab });

  useEffect(() => {
    if (shown.current.key !== key || shown.current.tab !== tab) {
      shown.current = { key, tab };
      top.current = workspace.state.peek().lists?.[key]?.[tab] ?? 0;
      if (attached.current) {
        attached.current.scrollTop = top.current;
      }
    }
    return () => {
      const saved = workspace.state.peek().lists?.[key]?.[tab] ?? 0;
      if (top.current !== saved) {
        const scrolled = top.current;
        setListState((lists) => ({
          [key]: { ...lists[key], [tab]: scrolled },
        }));
      }
    };
  }, [key, tab]);

  useEffect(
    () => () => attached.current?.removeEventListener("scroll", onScroll.current),
    [],
  );

  return useCallback((element: HTMLDivElement | null) => {
    if (element === attached.current) {
      return;
    }
    attached.current?.removeEventListener("scroll", onScroll.current);
    attached.current = element;
    if (element) {
      element.scrollTop = top.current;
      element.addEventListener("scroll", onScroll.current, { passive: true });
    }
  }, []);
}
