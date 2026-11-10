import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import TreeToggle from "./TreeToggle";

function TreeToggleDemo() {
  const [expanded, setExpanded] = useState({ open: true, closed: false });
  return (
    <div class="space-y-4">
      <GalleryRow label="Open and closed branches (press to toggle)">
        <div class="flex items-center gap-2">
          {(["open", "closed"] as const).map((branch) => (
            <TreeToggle
              key={branch}
              expanded={expanded[branch]}
              label={`${expanded[branch] ? "Collapse" : "Expand"} the ${branch} branch`}
              onToggle={() =>
                setExpanded((current) => ({ ...current, [branch]: !current[branch] }))
              }
            />
          ))}
        </div>
      </GalleryRow>
    </div>
  );
}

export const treeToggleGallery: GalleryEntry = {
  title: "TreeToggle",
  exports: ["TreeToggle", "treeToggleVariants"],
  Demo: TreeToggleDemo,
};
