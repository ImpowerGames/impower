import { Button, Download, Gamepad } from "@impower/impower-ui/components";
import { useRef, useState } from "preact/hooks";
import { downloadFile } from "../../utils/downloadFile";

export const propDefaults = {};
export type PreviewScreenplayToolbarProps = Partial<typeof propDefaults>;

/**
 * Top toolbar inside the screenplay preview pane:
 *   - "PDF" download button on the left — exports the active project's
 *     screenplay scripts to PDF, with an inline horizontal progress bar
 *     at the bottom edge that scales as the export advances.
 *   - "Screenplay Preview" centered title.
 *   - Gamepad-icon mode toggle on the right — switches preview to game.
 */
export default function PreviewScreenplayToolbar(
  _props: PreviewScreenplayToolbarProps,
) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inFlight = useRef(false);

  const onDownload = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setExporting(true);
    setProgress(0);
    try {
      const { Workspace } = await import("../../workspace/Workspace");
      const store = (
        await import("../../workspace/WorkspaceStore")
      ).default.state.value;
      const projectId = store.project?.id;
      const projectName = store.project?.name;
      if (!projectId || !projectName) return;
      const files = await Workspace.fs.getFiles(projectId);
      const scripts = Object.values(files)
        .filter((file) => file.type === "script")
        .map((file) => file.text || "");
      const pdf = await Workspace.print.exportPDF(scripts, (value) => {
        setProgress((value?.percentage ?? 0) / 100);
      });
      downloadFile(`${projectName}.pdf`, "application/pdf", pdf);
    } finally {
      inFlight.current = false;
      setExporting(false);
      setProgress(0);
    }
  };

  const onMode = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.changedPreviewMode("game");
  };

  return (
    <div class="sticky top-0 z-[1] flex h-12 flex-row items-center bg-engine-900">
      <Button
        variant="ghost"
        aria-label="Download PDF"
        onClick={onDownload}
        disabled={exporting}
        class="h-11 w-12 flex-col gap-0.5 rounded-full px-0 text-[11px] font-semibold text-primary"
      >
        <Download class="size-4" />
        PDF
      </Button>
      <div class="flex-1 text-center text-base text-foreground select-none">
        Screenplay Preview
      </div>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Preview Game"
        onClick={onMode}
        class="text-foreground/50 hover:text-foreground"
      >
        <Gamepad class="size-5" />
      </Button>
      {/* Progress bar — compositor-friendly transform: scaleX so the
          animation runs smoothly even while the export's main-thread
          work is busy. */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left bg-primary/70 transition-opacity"
        style={{
          opacity: exporting ? 1 : 0,
          transform: `scaleX(${progress})`,
        }}
      />
    </div>
  );
}
