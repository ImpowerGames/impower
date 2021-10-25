import { useCallback, useEffect, useMemo, useState } from "react";
import HistoryState from "../classes/historyState";

export const useDialogNavigation = (
  param: string,
  onBrowserChange?: (query: Record<string, unknown>) => void,
  onQueryChange?: (query: Record<string, unknown>) => void
): [(value: string, title?: string) => void, () => void] => {
  const [memoizedParam] = useState(param);

  const handleOpen = useCallback(
    async (value: string, title?: string): Promise<void> => {
      if (typeof value !== "string") {
        return;
      }
      HistoryState.instance.opening = true;
      HistoryState.instance.closing = false;
      const query = HistoryState.instance.query || window.history.state.query;
      const newValue = value;
      const newQuery = newValue
        ? { ...query, [memoizedParam]: newValue }
        : { ...query };
      HistoryState.instance.query = newQuery;
      HistoryState.instance.queryListeners.forEach((listener) =>
        listener?.(newQuery)
      );
      window.history.pushState(
        { ...(window.history.state || {}), query: newQuery },
        title
      );
      // wait a bit for popstate listeners to trigger
      await new Promise((resolve) => window.setTimeout(resolve, 1));
      HistoryState.instance.opening = false;
      HistoryState.instance.closing = false;
    },
    [memoizedParam]
  );

  const handleClose = useCallback(async (): Promise<void> => {
    const query = HistoryState.instance.query || window.history.state.query;
    if (!query?.[memoizedParam]) {
      return;
    }
    HistoryState.instance.opening = false;
    HistoryState.instance.closing = true;
    window.history.back();
    // wait a bit for popstate listeners to trigger
    await new Promise((resolve) => window.setTimeout(resolve, 1));
    const newQuery = { ...query };
    delete newQuery[memoizedParam];
    HistoryState.instance.queryListeners.forEach((listener) =>
      listener?.(newQuery)
    );
    HistoryState.instance.query = newQuery;
    HistoryState.instance.opening = false;
    HistoryState.instance.closing = false;
  }, [memoizedParam]);

  useEffect(() => {
    HistoryState.instance.query = window.history.state.query;
  }, []);

  useEffect(() => {
    if (onBrowserChange) {
      HistoryState.instance.browserListeners.push(onBrowserChange);
    }
    return (): void => {
      if (onBrowserChange) {
        HistoryState.instance.browserListeners =
          HistoryState.instance.browserListeners.filter(
            (x) => x !== onBrowserChange
          );
      }
    };
  }, [onBrowserChange]);

  useEffect(() => {
    if (onQueryChange) {
      HistoryState.instance.queryListeners.push(onQueryChange);
    }
    return (): void => {
      if (onQueryChange) {
        HistoryState.instance.queryListeners =
          HistoryState.instance.queryListeners.filter(
            (x) => x !== onQueryChange
          );
      }
    };
  }, [onQueryChange]);

  return useMemo(() => [handleOpen, handleClose], [handleClose, handleOpen]);
};
