import {
  BrandAo3,
  FileTypeHtml,
  FileTypePdf,
  Gear,
  Ripple,
} from "@impower/impower-ui/components";
import type { IconComponent } from "@impower/impower-ui/components";
import { useRef, useState } from "preact/hooks";
import { downloadFile } from "../../utils/downloadFile";
import OptionButton from "../option-button/OptionButton";

export const propDefaults = {};
export type ShareScreenplayProps = Partial<typeof propDefaults>;

type ExportFormat = "pdf" | "html";
type Row = {
  key: ExportFormat | "copy-text" | "copy-skin";
  label: string;
  ext?: string;
  icon: IconComponent;
};

const ROWS: Row[] = [
  { key: "pdf", label: "Screenplay PDF", ext: ".pdf", icon: FileTypePdf },
  { key: "html", label: "Screenplay HTML", ext: ".html", icon: FileTypeHtml },
  { key: "copy-text", label: "Copy Work Text", icon: BrandAo3 },
  { key: "copy-skin", label: "Copy Work Skin", icon: BrandAo3 },
];

/**
 * "Screenplay" panel of the Share pane: PDF + HTML export rows, each
 * with an inline progress bar that scales horizontally while the export
 * runs. Copy-work rows are placeholders (no wiring in legacy either).
 *
 * Progress is rendered via `transform: scaleX(...)` so the animation runs
 * on the compositor and doesn't conflict with the row's own transitions.
 */
export default function ShareScreenplay(_props: ShareScreenplayProps) {
  const [progress, setProgress] = useState<Record<ExportFormat, number>>({
    pdf: 0,
    html: 0,
  });
  const [busy, setBusy] = useState<Record<ExportFormat, boolean>>({
    pdf: false,
    html: false,
  });
  const inFlight = useRef<Record<ExportFormat, boolean>>({
    pdf: false,
    html: false,
  });

  const runExport = async (format: ExportFormat) => {
    if (inFlight.current[format]) return;
    inFlight.current[format] = true;
    setBusy((b) => ({ ...b, [format]: true }));
    setProgress((p) => ({ ...p, [format]: 0 }));

    try {
      const { Workspace } = await import("../../workspace/Workspace");
      const store = (
        await import("../../workspace/WorkspaceStore")
      ).default.state.value;
      const projectId = store.project?.id;
      const projectName = store.project?.name;
      if (!projectId || !projectName) return;

      const programs = Object.values(
        (await Workspace.ls.getPrograms()) || {},
      );
      const onProgress = (value?: { percentage?: number }) => {
        const pct = (value?.percentage ?? 0) / 100;
        setProgress((p) => ({ ...p, [format]: pct }));
      };
      if (format === "pdf") {
        const pdf = await Workspace.print.exportPDF(programs, onProgress);
        downloadFile(`${projectName}.pdf`, "application/pdf", pdf);
      } else {
        const html = await Workspace.print.exportHTML(programs, onProgress);
        downloadFile(`${projectName}.html`, "text/html", html);
      }
    } finally {
      inFlight.current[format] = false;
      setBusy((b) => ({ ...b, [format]: false }));
      setProgress((p) => ({ ...p, [format]: 0 }));
    }
  };

  return (
    <div class="absolute inset-0 flex flex-col overflow-y-auto py-4">
      <nav class="flex flex-col">
        {ROWS.map((row) => {
          const Icon = row.icon;
          const isExport = row.key === "pdf" || row.key === "html";
          const fmt = isExport ? (row.key as ExportFormat) : null;
          const isBusy = fmt != null && busy[fmt];
          const pct = fmt != null ? progress[fmt] : 0;
          return (
            <OptionButton
              disabled={isBusy}
              onClick={fmt ? () => runExport(fmt) : undefined}
              class="overflow-hidden"
            >
              {/* Compositor-animated progress bar — sits below the
                  row content via z-index. Scales from the left edge. */}
              {fmt && (
                <span
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-0 origin-left bg-primary/15 transition-transform duration-100"
                  style={{ transform: `scaleX(${pct})` }}
                />
              )}
              <span class="relative z-[1] flex flex-row items-center gap-4">
                <Icon class="size-5" />
                <span>{row.label}</span>
              </span>
              <span class="relative z-[1] flex flex-row items-center gap-4 opacity-50">
                {row.ext}
                {/* Raw <button> (not <Button>) because this nests inside
                    the OptionButton row, which is itself a button. Manual
                    <Ripple /> keeps press feedback consistent. */}
                <button
                  type="button"
                  aria-label="Settings"
                  class="relative -mr-6 inline-flex size-12 cursor-pointer pointer-events-auto items-center justify-center overflow-hidden rounded-full text-foreground/50 hover:bg-foreground/5 hover:text-foreground active:bg-foreground/[0.12]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Gear class="size-5" />
                  <Ripple />
                </button>
              </span>
            </OptionButton>
          );
        })}
      </nav>
    </div>
  );
}
