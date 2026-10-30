import { Ripple } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type HeaderTitleButtonProps = Partial<typeof propDefaults>;

export default function HeaderTitleButton(_p: HeaderTitleButtonProps) {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const syncState = useComputed(
    () => workspace.state.value.sync?.status || "",
  ).value;

  const ready = name && syncState;

  const [draft, setDraft] = useState(name);
  useLayoutEffect(() => {
    setDraft(name);
  }, [name]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const commit = async (value: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (value != null) {
      await Workspace.window.finishEditingProjectName(value);
    }
  };

  return (
    <div class="flex w-full flex-row items-center">

      <div
        class="relative -mx-1 h-7 flex-1 overflow-hidden rounded px-1 text-foreground hover:bg-foreground/5"
        style={{ maxWidth: "600px" }}
      >
        <div class="absolute inset-y-0 inset-x-1">
          {ready ? (
            <input
              ref={inputRef}
              type="text"
              aria-label="Project Name"
              value={draft}
              class="w-full bg-transparent text-lg font-medium text-foreground outline-none placeholder:text-engine-700"
              onInput={(e) =>
                setDraft((e.target as HTMLInputElement).value)
              }
              onFocus={(e) => {
                (e.target as HTMLInputElement).select();
                import("../../workspace/Workspace").then(({ Workspace }) => {
                  Workspace.window.startEditingProjectName();
                });
              }}
              onBlur={(e) => {
                void commit((e.target as HTMLInputElement).value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          ) : (
            <span class="skeleton-sheen block w-full rounded-full text-lg font-medium leading-[1.2] text-transparent">
              Untitled Game
            </span>
          )}
        </div>

        <Ripple />
      </div>
    </div>
  );
}
