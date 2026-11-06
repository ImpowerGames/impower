/// <reference path="../../declaration.d.ts" />
import { LoadingBar } from "@impower/impower-ui/loading-bar";
import { useEffect, useRef } from "preact/hooks";
import type { ScreenplayConfig } from "../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import type {
  ScreenplayPreviewController as ScreenplayPreviewControllerType,
  ScreenplayPreviewOptions,
} from "./ScreenplayPreviewController";
import type { ScreenplayPick } from "./utils/screenplaySettings";
import cssText from "./sparkdown-screenplay-preview.css?raw";

export const propDefaults = {
  scrollMargin: null as string | null,
};

export type SparkdownScreenplayPreviewProps = Partial<typeof propDefaults> & {
  config?: ScreenplayConfig;
  paper?: "paper" | "theme";
  texture?: boolean;
  syncScroll?: boolean;
  playing?: boolean;
  picks?: Record<string, readonly ScreenplayPick[]>;
};

export default function SparkdownScreenplayPreview({
  scrollMargin,
  config,
  paper,
  texture,
  syncScroll = true,
  playing = false,
  picks,
}: SparkdownScreenplayPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ScreenplayPreviewControllerType>();
  const optionsRef = useRef<ScreenplayPreviewOptions>({});
  optionsRef.current = { config, syncScroll, playing, picks };

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

        const realHost =
          (root.closest(
            "sparkdown-screenplay-preview",
          ) as HTMLElement | null) ?? root;

        controller = new ScreenplayPreviewController(
          realHost,
          { preview, loading },
          { ...optionsRef.current, scrollMargin: scrollMargin ?? "" },
        );
        controllerRef.current = controller;
        controller.setup();
      },
    );

    return () => {
      cancelled = true;
      controllerRef.current = undefined;
      controller?.dispose();
    };
  }, [scrollMargin]);

  useEffect(() => {
    controllerRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    controllerRef.current?.setPicks(picks);
  }, [picks]);

  useEffect(() => {
    controllerRef.current?.setSyncScroll(syncScroll);
  }, [syncScroll]);

  useEffect(() => {
    controllerRef.current?.setPlaying(playing);
  }, [playing]);

  return (
    <div
      class="sparkdown-screenplay-preview-root"
      ref={rootRef}
      data-paper={paper}
      data-texture={texture ? "" : undefined}
    >
      <style>{cssText}</style>
      <LoadingBar
        containerRef={loadingRef}
        class="absolute top-0 left-0 right-0 z-10 transition-opacity duration-250"
      />
      <div class="preview-pane" ref={previewRef} />
    </div>
  );
}
