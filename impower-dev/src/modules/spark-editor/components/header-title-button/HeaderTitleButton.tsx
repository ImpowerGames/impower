import { Ripple } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type HeaderTitleButtonProps = Partial<typeof propDefaults>;

/**
 * Editable project name in the top header. Controlled input — selects
 * all on focus, commits via `Workspace.window.finishEditingProjectName`
 * on blur or Enter. Shows a skeleton placeholder until both the project
 * name and sync state have loaded.
 */
export default function HeaderTitleButton(_p: HeaderTitleButtonProps) {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const syncState = useComputed(
    () => workspace.state.value.sync?.status || "",
  ).value;

  const ready = name && syncState;

  // Controlled draft — reset whenever the persisted name changes so an
  // external rename (e.g., sync pull) updates the input.
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
      {/* `style={{ maxWidth: '600px' }}` instead of Tailwind `max-w-[600px]`
          because sparkle's `* { max-width: 100% }` (in @layer normalize)
          ends up beating Tailwind's layered utilities in this cascade.

          The wrapper is INVISIBLE by default (no bg) — only the
          <Ripple /> wave reveals the box shape on click, just like
          main. `px-1` (4px) padding pushes the input text in from
          the wrapper edges, paired with `-mx-1` so the wrapper
          extends 4px OUTSIDE the text area on each side; that way
          the text stays visually aligned with the caption below
          (which has no padding/box). The ripple wave fills this
          padded area and is clipped to the rounded box by
          `overflow-hidden`. Mirrors the legacy s-input's
          `bg-color="none"` + `p="0 4" m="0 -4"` + ripple. */}
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
            /* `<s-skeleton>` shape: a full-width pill (rounded-full) with the
               `skeleton-sheen` animated gradient. Transparent text sizes the
               pill's height; `leading-[1.2]` overrides `text-lg`'s 28px
               line-height to a tighter 1.2 so the pill is 21px tall — matches
               the legacy `<s-skeleton>` rendering exactly. */
            <span class="skeleton-sheen block w-full rounded-full text-lg font-medium leading-[1.2] text-transparent">
              Untitled Game
            </span>
          )}
        </div>
        {/* Material ripple — paints the press wave on click. Lives in
            the `relative + overflow-hidden` container above so the
            wave is clipped to the input's rounded bounds. Matches the
            legacy `<s-input ... ripple-color="white">`. */}
        <Ripple />
      </div>
    </div>
  );
}
