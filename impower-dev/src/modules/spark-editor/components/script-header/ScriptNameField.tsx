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
    <input
      {...props}
      type="text"
      data-script-name
      aria-label="Script name"
      title="Rename this script"
      spellcheck={false}
      autocomplete="off"
      maxLength={120}
      size={Math.max(4, Math.min(40, draft.length + 1))}
      class={className}
    />
  );
}
