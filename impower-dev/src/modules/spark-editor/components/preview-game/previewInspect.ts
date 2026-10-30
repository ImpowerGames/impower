export interface PreviewInspector {
  readonly frame: HTMLIFrameElement | null;
  readonly doc: Document | null;
  readonly win: Window | null;
  $(selector: string): Element | null;
  $$(selector: string): Element[];
  deep(selector: string): Element[];
  game(): Element | null;
  html(selector?: string): string | null;
  perf(type?: string): PerformanceEntry[];
  ready(timeoutMs?: number): Promise<Document>;
  summary(): {
    mounted: boolean;
    sameOrigin: boolean;
    url: string | null;
    readyState: DocumentReadyState | null;
    gameChildren: number | null;
    resourceEntries: number | null;
  };
}

const GLOBAL_KEY = "__preview";

export function installPreviewInspector(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let warnedCrossOrigin = false;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const getFrame = (): HTMLIFrameElement | null =>
    document.querySelector<HTMLIFrameElement>("#iframe");

  const safe = <T>(read: () => T): T | null => {
    try {
      return read();
    } catch {
      if (!warnedCrossOrigin) {
        warnedCrossOrigin = true;
        console.warn(
          `[same-origin preview] window.${GLOBAL_KEY}: the preview iframe is ` +
            `cross-origin, so its DOM can't be inspected. Set ` +
            `VITE_SAME_ORIGIN_PREVIEW=1 in both impower-dev and ` +
            `sparkdown-player-app to enable same-origin embedding.`,
        );
      }
      return null;
    }
  };

  const getDoc = (): Document | null =>
    safe(() => getFrame()?.contentDocument ?? null);
  const getWin = (): Window | null =>
    safe(() => getFrame()?.contentWindow ?? null);

  const deepQueryAll = (root: ParentNode, selector: string): Element[] => {
    const out: Element[] = [];
    const visit = (node: ParentNode) => {
      node.querySelectorAll(selector).forEach((el) => out.push(el));
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          visit(el.shadowRoot);
        }
      });
    };
    visit(root);
    return out;
  };

  const inspector: PreviewInspector = {
    get frame() {
      return getFrame();
    },
    get doc() {
      return getDoc();
    },
    get win() {
      return getWin();
    },
    $(selector) {
      return getDoc()?.querySelector(selector) ?? null;
    },
    $$(selector) {
      return Array.from(getDoc()?.querySelectorAll(selector) ?? []);
    },
    deep(selector) {
      const doc = getDoc();
      return doc ? deepQueryAll(doc, selector) : [];
    },
    game() {
      return getDoc()?.querySelector("#game") ?? null;
    },
    html(selector) {
      const doc = getDoc();
      if (!doc) {
        return null;
      }
      if (selector) {
        return doc.querySelector(selector)?.outerHTML ?? null;
      }
      return doc.documentElement.outerHTML;
    },
    perf(type) {
      const win = getWin();
      if (!win) {
        return [];
      }
      return type
        ? win.performance.getEntriesByType(type)
        : win.performance.getEntries();
    },
    ready(timeoutMs = 10000) {
      const frame0 = getFrame();
      return new Promise<Document>((resolve, reject) => {
        const start = performance.now();
        const poll = () => {
          const current = getFrame();
          if (frame0 && current && current !== frame0) {
            reject(
              new Error(
                `[same-origin preview] ${GLOBAL_KEY}.ready(): the preview ` +
                  `iframe changed before it was ready`,
              ),
            );
            return;
          }
          const doc = getDoc();
          if (doc?.readyState === "complete" && doc.querySelector("#game")) {
            resolve(doc);
            return;
          }
          if (performance.now() - start > timeoutMs) {
            reject(
              new Error(
                `[same-origin preview] window.${GLOBAL_KEY}.ready() timed out ` +
                  `after ${timeoutMs}ms`,
              ),
            );
            return;
          }
          const id = setTimeout(() => {
            pendingTimers.delete(id);
            poll();
          }, 100);
          pendingTimers.add(id);
        };
        poll();
      });
    },
    summary() {
      const frame = getFrame();
      const doc = getDoc();
      const win = getWin();
      return {
        mounted: !!frame,
        sameOrigin: !!doc,
        url: safe(() => win?.location.href ?? null) ?? null,
        readyState: doc?.readyState ?? null,
        gameChildren: doc?.querySelector("#game")?.children.length ?? null,
        resourceEntries: win
          ? win.performance.getEntriesByType("resource").length
          : null,
      };
    },
  };

  (window as unknown as Record<string, unknown>)[GLOBAL_KEY] = inspector;
  console.info(
    `[same-origin preview] window.${GLOBAL_KEY} ready — inspect the live game ` +
      `DOM, e.g. ${GLOBAL_KEY}.game(), ${GLOBAL_KEY}.$('#game-ui'), ` +
      `${GLOBAL_KEY}.summary(), await ${GLOBAL_KEY}.ready().`,
  );

  return () => {
    pendingTimers.forEach(clearTimeout);
    pendingTimers.clear();
    if (
      (window as unknown as Record<string, unknown>)[GLOBAL_KEY] === inspector
    ) {
      delete (window as unknown as Record<string, unknown>)[GLOBAL_KEY];
    }
  };
}
