import { LoadingBar } from "@impower/impower-ui/components";
import { useEffect, useRef } from "preact/hooks";
import type { ScreenplayPreviewController as ScreenplayPreviewControllerType } from "./ScreenplayPreviewController";
import cssText from "./sparkdown-screenplay-preview.css";

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

        // Light-DOM: the custom element is a normal ancestor in the same tree,
        // so `closest()` finds it directly. (For shadow:true we'd need
        // getRootNode().host instead since closest doesn't pierce shadow.)
        const realHost = root.closest(
          "sparkdown-screenplay-preview",
        ) as HTMLElement | null;
        if (!realHost) return;

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
    <div class="root" ref={rootRef}>
      <style>{cssText}</style>
      <LoadingBar
        containerRef={loadingRef}
        class="absolute top-0 left-0 right-0 z-10 transition-opacity duration-250"
      />
      <div class="preview-pane" ref={previewRef} />
    </div>
  );
}
