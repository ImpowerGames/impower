import type { ComponentChildren } from "preact";

export default function LibraryToolbar({ children }: { children: ComponentChildren }) {
  return (
    <div class="flex flex-none items-center gap-2.5 pt-4 pb-2 [:root[data-layout=desktop]_&]:pb-3">{children}</div>
  );
}
