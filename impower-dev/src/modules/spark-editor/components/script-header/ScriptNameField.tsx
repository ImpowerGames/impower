import { textFieldPurposeAttributes } from "@impower/impower-ui/components";
import { useNameField } from "../desktop-shell";

export type ScriptNameFieldProps = {
  filename: string;
  name: string;
  class?: string;
};

export default function ScriptNameField({
  filename,
  name,
  class: className,
}: ScriptNameFieldProps) {
  const { draft, props } = useNameField({
    field: "script",
    name,
    onCommit: async (value) => {
      const { Workspace } = await import("../../workspace/Workspace");
      const result = await Workspace.window.renameScript(filename, value);
      return result.status === "renamed" ? undefined : name;
    },
  });

  return (
    <span data-script-name-box class={className}>
      <input
        {...props}
        {...textFieldPurposeAttributes("literal")}
        data-script-name
        aria-label="Script name"
        title="Rename this script"
        maxLength={120}
        size={Math.max(4, Math.min(40, draft.length + 1))}
        class="border-0 bg-transparent px-1.5 text-inherit outline-none not-focus:fade-edge"
      />
    </span>
  );
}
