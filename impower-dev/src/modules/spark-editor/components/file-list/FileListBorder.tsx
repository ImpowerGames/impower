import type { ComponentChildren } from "preact";

export default function FileListBorder({
  children,
}: {
  children?: ComponentChildren;
}) {
  return (
    <div class="fl-empty-border mx-6 mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-solid border-edge text-base opacity-70">
      {children}
    </div>
  );
}
