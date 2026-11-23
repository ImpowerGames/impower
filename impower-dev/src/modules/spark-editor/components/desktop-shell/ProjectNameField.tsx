import { cn, TextField } from "@impower/impower-ui/components";
import { useCoarsePointer } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import { useLayoutEffect } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import { useNameField } from "./naming";
import { workspaceWindow } from "./workspaceWindow";

const NAME_TEXT =
  "h-full w-full rounded-control border border-transparent bg-transparent px-1.5 py-0.5 text-[14px]/[18px] font-semibold text-ink outline-none in-data-[layout=phone]:rounded-none in-data-[layout=compact]:rounded-none in-data-[layout=phone]:border-0 in-data-[layout=compact]:border-0 in-data-[layout=phone]:p-0 in-data-[layout=compact]:p-0 in-data-[layout=phone]:text-[12px]/[1.3] in-data-[layout=compact]:text-[12px]/[1.3] in-data-[layout=phone]:[--fade:24px] in-data-[layout=compact]:[--fade:24px]";

export default function ProjectNameField() {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const ready = useComputed(
    () =>
      !!workspace.state.value.project?.name &&
      !!workspace.state.value.sync?.status,
  ).value;
  const coarse = useCoarsePointer();

  const { naming, props } = useNameField({
    field: "project",
    name,
    onFocus: () => {
      void workspaceWindow().then((win) => win.startEditingProjectName());
    },
    onCommit: async (value) => {
      await (await workspaceWindow()).finishEditingProjectName(value);
      return workspace.state.peek().project?.name || "";
    },
  });

  const shown = coarse && !naming;

  useLayoutEffect(() => {
    if (coarse && naming && ready) {
      props.ref.current?.focus();
    }
  }, [coarse, naming, ready]);

  if (!ready) {
    return (
      <span class="skeleton-sheen block h-6 w-40 rounded-full text-transparent in-data-[layout=phone]:h-[18px] in-data-[layout=compact]:h-[18px] in-data-[layout=phone]:w-28 in-data-[layout=compact]:w-28">
        Untitled story
      </span>
    );
  }

  return (
    <div
      class={cn(
        "relative h-6 w-[400px] max-w-full rounded-control in-data-[layout=phone]:h-[15.6px] in-data-[layout=compact]:h-[15.6px] in-data-[layout=phone]:w-full in-data-[layout=compact]:w-full in-data-[layout=phone]:rounded-none in-data-[layout=compact]:rounded-none",
        !shown && "control-overlay focus-within-edge",
        naming && "z-[3]",
      )}
    >
      {shown ? (
        <span data-project-name class={cn(NAME_TEXT, "flex items-center fade-edge")}>
          {name}
        </span>
      ) : (
        <label class="inline-hit-up size-full">
          <TextField
            {...props}
            frame="inset"
            size="inherit"
            font="inherit"
            purpose="text"
            aria-label="Project name"
            maxLength={120}
            class={cn(NAME_TEXT, "placeholder:text-placeholder not-focus:fade-edge")}
          />
        </label>
      )}
    </div>
  );
}
