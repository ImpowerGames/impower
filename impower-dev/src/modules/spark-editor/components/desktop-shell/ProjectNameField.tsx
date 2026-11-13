import { textFieldPurposeAttributes } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import { useNameField } from "./naming";
import { workspaceWindow } from "./workspaceWindow";

export default function ProjectNameField() {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const ready = useComputed(
    () =>
      !!workspace.state.value.project?.name &&
      !!workspace.state.value.sync?.status,
  ).value;

  const { props } = useNameField({
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

  if (!ready) {
    return (
      <span class="skeleton-sheen block h-6 w-40 rounded-full text-transparent in-data-[layout=phone]:h-[18px] in-data-[layout=phone]:w-28">
        Untitled story
      </span>
    );
  }

  return (
    <div class="relative h-6 w-[400px] max-w-full rounded-control control-overlay focus-within-edge in-data-[layout=phone]:h-5 in-data-[layout=phone]:w-full">
      <label class="inline-hit-up size-full">
        <input
          {...props}
          {...textFieldPurposeAttributes("text")}
          aria-label="Project name"
          maxLength={120}
          class="h-full w-full rounded-control border border-transparent bg-transparent px-1.5 py-0.5 text-[14px]/[18px] font-semibold text-ink outline-none in-data-[layout=phone]:text-[12px]/[1.4] placeholder:text-placeholder not-focus:fade-edge"
        />
      </label>
    </div>
  );
}
