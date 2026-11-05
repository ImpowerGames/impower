import {
  BookIcon,
  Button,
  CheckIcon,
  ChevronLeftIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import { useState } from "preact/hooks";
import { splitScriptPath } from "../../utils/nameRules";
import { useSettings } from "../../workspace/settings/useSettings";
import { useEditorScrolled } from "../../workspace/useActiveEditor";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";
import ScriptNameField from "./ScriptNameField";

export type ScriptHeaderProps = {
  filename?: string;
};

const MAIN_SCRIPT = "main.sd";

const withWorkspace = (
  action: (
    workspace: (typeof import("../../workspace/Workspace"))["Workspace"],
  ) => void,
) => {
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    action(Workspace),
  );
};

export default function ScriptHeader({
  filename = MAIN_SCRIPT,
}: ScriptHeaderProps) {
  const layout = useLayout();
  const desktop = layout === "desktop";
  const phone = layout === "phone";
  const { preferences, setPreference } = useSettings();
  const lineNumbers = preferences.lineNumbers;
  const problemColor = useDiagnosticColor(filename);
  const scrolled = useEditorScrolled(filename);
  const [naming, setNaming] = useState(false);

  const { folder, name } = splitScriptPath(filename);
  const nameClass = cn(
    "block min-w-0 max-w-full truncate font-semibold leading-[1.3] text-ink",
    desktop ? "text-[17px]" : "text-[14px] leading-[1.35]",
  );

  return (
    <header
      data-script-header
      class={cn(
        "relative z-10 flex flex-none items-center gap-2.5 bg-workspace",
        desktop
          ? "h-[68px] min-h-[68px] py-2 pr-[22px] pl-3"
          : "h-12 min-h-12 pr-4 pl-1.5",
        "motion-safe:transition-shadow motion-safe:duration-150",
        scrolled && "shadow-[0_7px_10px_-4px_var(--editor-sticky-shadow)]",
      )}
    >
      <Button
        variant="disclosure"
        size="glyph"
        aria-label="Show line numbers"
        title={lineNumbers ? "Hide line numbers" : "Show line numbers"}
        aria-pressed={lineNumbers}
        onClick={() => setPreference("lineNumbers", !lineNumbers)}
      >
        <ChevronLeftIcon />
      </Button>
      <div
        class={cn(
          "flex min-h-11 min-w-0 flex-1 items-center",
          desktop ? "gap-3" : "h-12 gap-2.5",
        )}
      >
        {problemColor ? (
          <Button
            variant="quiet"
            size="icon"
            data-script-status="problems"
            aria-label="Show problems"
            title="Show problems"
            class={cn("-ml-1.5 min-w-9 [&_svg]:size-5", problemColor)}
            onClick={() =>
              withWorkspace((w) =>
                w.window.executeEditorCommand(filename, "problems"),
              )
            }
          >
            <BookIcon />
          </Button>
        ) : (
          <span
            data-script-status="clean"
            aria-hidden="true"
            class="-ml-1.5 inline-flex min-h-11 min-w-9 flex-none items-center justify-center text-accent [&_svg]:size-5"
          >
            <BookIcon />
          </span>
        )}
        <span class={cn("flex min-w-0 flex-1 flex-col", desktop && "gap-0.5")}>
          {filename === MAIN_SCRIPT ? (
            <strong data-script-name class={cn(nameClass, "fade-edge")}>
              Main
            </strong>
          ) : (
            <ScriptNameField
              filename={filename}
              name={name}
              onNamingChange={setNaming}
              class={cn(
                nameClass,
                "-ml-1.5 rounded-control border border-transparent bg-transparent px-1.5 py-px outline-none hover:border-edge focus-visible:border-accent focus-visible:bg-panel",
              )}
            />
          )}
          {folder && (
            <span
              data-script-folder
              class="truncate text-[11px] leading-[1.3] text-muted"
            >
              {folder}
            </span>
          )}
        </span>
      </div>
      {phone && naming ? (
        <Button
          variant="primary"
          aria-label="Keep the script's name"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
        >
          <CheckIcon />
          Done
        </Button>
      ) : (
        <Button
          class={cn(
            "bg-transparent text-[12px] font-normal text-accent",
            desktop ? "min-w-[62px] px-2.5" : "min-w-[60px] border-transparent px-2",
          )}
          onClick={() => withWorkspace((w) => w.window.browseScripts())}
        >
          Browse scripts
        </Button>
      )}
    </header>
  );
}
