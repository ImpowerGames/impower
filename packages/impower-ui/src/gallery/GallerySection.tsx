import type { ComponentChildren, FunctionComponent } from "preact";

export type GalleryEntry = {
  title: string;
  exports: readonly string[];
  Demo: FunctionComponent;
};

export function GallerySection({ entry }: { entry: GalleryEntry }) {
  const { Demo } = entry;
  return (
    <section id={entry.title} class="space-y-4">
      <h2 class="text-lg font-medium">
        <code class="rounded bg-surface px-2 py-0.5 font-mono text-sm">
          {entry.title}
        </code>
      </h2>
      <p class="text-xs text-foreground/60">
        Exports:{" "}
        {entry.exports.length > 12
          ? `${entry.exports.length}, each named below`
          : entry.exports.join(", ")}
      </p>
      <Demo />
    </section>
  );
}

export function GalleryRow({
  label,
  children,
}: {
  label: string;
  children: ComponentChildren;
}) {
  return (
    <div>
      <div class="mb-1.5 text-xs text-foreground/60">{label}</div>
      {children}
    </div>
  );
}
