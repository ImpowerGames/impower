import {
  BookIcon,
  Button,
  CheckIcon,
  ChevronLeftIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import { finishNaming, useNaming } from "../desktop-shell";
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
  const naming = useNaming() === "script";

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
        <Button
          variant="quiet"
          size="icon"
          data-script-status={problemColor ? "problems" : "clean"}
          aria-label="Show problems"
          title="Show problems"
          class="-ml-1.5 min-w-9 [&_svg]:size-5"
          onClick={() =>
            withWorkspace((w) =>
              w.window.executeEditorCommand(filename, "problems"),
            )
          }
        >
          <BookIcon class={problemColor || "text-accent"} />
        </Button>
        <span class={cn("flex min-w-0 flex-1 flex-col", desktop && "gap-0.5")}>
          {filename === MAIN_SCRIPT ? (
            <strong data-script-name class={cn(nameClass, "fade-edge")}>
              Main
            </strong>
          ) : (
            <ScriptNameField
              filename={filename}
              name={name}
              class={cn(
                "inline-hit -ml-1.5 h-[calc(1lh+4px)] w-fit max-w-full rounded-control border border-transparent font-semibold text-ink hover:border-edge has-focus-visible:border-accent has-focus-visible:bg-panel",
                desktop
                  ? "text-[17px] leading-[1.3]"
                  : "text-[14px] leading-[1.35]",
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
          onClick={finishNaming}
        >
          <CheckIcon />
          Done
        </Button>
      ) : (
        <Button
          class={
            desktop
              ? "min-w-[62px] bg-transparent px-2.5 text-[12px] font-normal text-accent"
              : "min-w-[60px] border-transparent bg-transparent px-2 text-[12px] font-normal text-accent"
          }
          onClick={() => withWorkspace((w) => w.window.browseScripts())}
        >
          Browse scripts
        </Button>
      )}
    </header>
  );
}
