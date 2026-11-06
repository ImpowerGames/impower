import { useLayoutEffect, useRef, useState } from "preact/hooks";

export type ScriptNameFieldProps = {
  filename: string;
  name: string;
  class?: string;
  onNamingChange?: (naming: boolean) => void;
};

export default function ScriptNameField({
  filename,
  name,
  class: className,
  onNamingChange,
}: ScriptNameFieldProps) {
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);

  useLayoutEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = async (value: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    const result = await Workspace.window.renameScript(filename, value);
    if (result.status !== "renamed") {
      setDraft(name);
    }
  };

  return (
    <span data-script-name-box class={className}>
      <input
        type="text"
        data-script-name
        aria-label="Script name"
        title="Rename this script"
        spellcheck={false}
        autocomplete="off"
        maxLength={120}
        size={Math.max(4, Math.min(40, draft.length + 1))}
        value={draft}
        class="truncate border-0 bg-transparent px-1.5 text-inherit outline-none"
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onFocus={(e) => {
          cancelled.current = false;
          (e.target as HTMLInputElement).select();
          onNamingChange?.(true);
        }}
        onBlur={(e) => {
          const value = cancelled.current
            ? name
            : (e.target as HTMLInputElement).value;
          cancelled.current = false;
          onNamingChange?.(false);
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
    </span>
  );
}
