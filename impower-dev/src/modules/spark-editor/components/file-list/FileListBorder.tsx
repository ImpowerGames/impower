import type { ComponentChildren } from "preact";

/**
 * Dashed-border empty-state container for FileList. Mirrors the legacy
 * `<se-file-list-border>` slot — centered icon + label inside a rounded
 * dashed-border box with 70% opacity.
 */
export default function FileListBorder({
  children,
}: {
  children?: ComponentChildren;
}) {
  return (
    <div class="fl-empty-border mx-6 mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-solid border-white text-base opacity-70">
      <style>{`
        /* Thin out the empty-state icon stroke. Our SVG components hard-
           code stroke-width="2" on each path; the legacy used <s-icon
           stroke-width="1"> for the empty-state to keep it light. CSS
           selectors beat the SVG presentation attribute, so we can rewrite
           it here without changing the icon component itself. */
        .fl-empty-border svg path { stroke-width: 1; }
      `}</style>
      {children}
    </div>
  );
}
