import LoadingBar from "@impower/impower-ui/loading-bar";
import { useEffect, useRef } from "preact/hooks";
import type { ScreenplayPreviewController as ScreenplayPreviewControllerType } from "./ScreenplayPreviewController";
import cssText from "./sparkdown-screenplay-preview.css?raw";

export const propDefaults = {
  scrollMargin: null as string | null,
};

export type SparkdownScreenplayPreviewProps = Partial<typeof propDefaults>;

export default function SparkdownScreenplayPreview({
  scrollMargin,
}: SparkdownScreenplayPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const loading = loadingRef.current;
    const preview = previewRef.current;
    if (!root || !loading || !preview) return;

    let controller: ScreenplayPreviewControllerType | undefined;
    let cancelled = false;

    import("./ScreenplayPreviewController").then(
      ({ ScreenplayPreviewController }) => {
        if (cancelled) return;

        // Host = the <sparkdown-screenplay-preview> custom-element ancestor
        // when used via the element wrapper (vscode-sparkdown), else the
        // component's own root element when rendered directly as a Preact
        // component (impower-dev).
        const realHost =
          (root.closest(
            "sparkdown-screenplay-preview",
          ) as HTMLElement | null) ?? root;

        controller = new ScreenplayPreviewController(
          realHost,
          { preview, loading },
          { scrollMargin: scrollMargin ?? "" },
        );
        controller.setup();
      },
    );

    return () => {
      cancelled = true;
      controller?.dispose();
    };
  }, [scrollMargin]);

  return (
    <div class="sparkdown-screenplay-preview-root" ref={rootRef}>
      <style>{cssText}</style>
      <LoadingBar
        containerRef={loadingRef}
        class="absolute top-0 left-0 right-0 z-10 transition-opacity duration-250"
      />
      <div class="preview-pane" ref={previewRef} />
    </div>
  );
}
