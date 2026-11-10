import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

const setListState = (
  read: (
    lists: NonNullable<typeof workspace.current.lists>,
  ) => Partial<NonNullable<typeof workspace.current.lists>>,
) =>
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    Workspace.window.setListState(read(workspace.state.peek().lists ?? {})),
  );

export function useTabQuery(tab: string): [string, (query: string) => void] {
  const [query, setQuery] = useState(
    () => workspace.state.peek().lists?.scriptsQueries?.[tab] ?? "",
  );
  const change = useCallback(
    (next: string) => {
      setQuery(next);
      setListState((lists) => ({
        scriptsQueries: { ...lists.scriptsQueries, [tab]: next },
      }));
    },
    [tab],
  );
  return [query, change];
}

export function useSavedScroll(tab: string) {
  const top = useRef(workspace.state.peek().lists?.scriptsScrolls?.[tab] ?? 0);
  const attached = useRef<HTMLDivElement | null>(null);
  const onScroll = useRef(() => {
    top.current = attached.current?.scrollTop ?? top.current;
  });

  useEffect(
    () => () => {
      attached.current?.removeEventListener("scroll", onScroll.current);
      const saved = workspace.state.peek().lists?.scriptsScrolls?.[tab] ?? 0;
      if (top.current !== saved) {
        const scrolled = top.current;
        setListState((lists) => ({
          scriptsScrolls: { ...lists.scriptsScrolls, [tab]: scrolled },
        }));
      }
    },
    [tab],
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
