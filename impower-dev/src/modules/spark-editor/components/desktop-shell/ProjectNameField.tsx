import { useComputed } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

export default function ProjectNameField() {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const ready = useComputed(
    () =>
      !!workspace.state.value.project?.name &&
      !!workspace.state.value.sync?.status,
  ).value;

  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);

  useLayoutEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = async (value: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.window.finishEditingProjectName(value);
    setDraft(workspace.state.peek().project?.name || "");
  };

  if (!ready) {
    return (
      <span class="skeleton-sheen block h-6 w-40 rounded-full text-transparent">
        Untitled story
      </span>
    );
  }

  return (
    <div class="relative h-6 w-[400px] max-w-full rounded-control control-overlay focus-within-edge">
      <input
        type="text"
        aria-label="Project name"
        maxLength={120}
        value={draft}
        class="h-full w-full rounded-control border border-transparent bg-transparent px-1.5 py-0.5 text-[14px]/[18px] font-semibold text-ink outline-none placeholder:text-placeholder not-focus:fade-edge"
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onFocus={(e) => {
          cancelled.current = false;
          (e.target as HTMLInputElement).select();
          void import("../../workspace/Workspace").then(({ Workspace }) => {
            Workspace.window.startEditingProjectName();
          });
        }}
        onBlur={(e) => {
          const value = cancelled.current
            ? name
            : (e.target as HTMLInputElement).value;
          cancelled.current = false;
          void commit(value);
        }}
        onKeyDown={(e) => {
          const input = e.target as HTMLInputElement;
          if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelled.current = true;
            setDraft(name);
            input.blur();
          }
        }}
      />
    </div>
  );
}
