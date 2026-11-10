import { useLayout } from "@impower/impower-ui/layout";
import { useEffect, useState } from "preact/hooks";
import { inspectAsset, inspectedAsset } from "../../utils/assetInspector";
import { writeUrlAsset } from "../../utils/urlAsset";
import workspace from "../../workspace/WorkspaceStore";
import FilePreviewOverlay, {
  type PreviewItem,
} from "../file-preview/FilePreviewOverlay";

const editUrl = (item: PreviewItem, url: string) => {
  const projectId = workspace.signals.projectId.peek();
  if (projectId) {
    void writeUrlAsset(projectId, item.path, url);
  }
};

export function useAssetPreview(items: PreviewItem[]) {
  const phone = useLayout() === "phone";
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => () => inspectAsset(null), []);

  useEffect(() => {
    const current = inspectedAsset.peek();
    if (!current) {
      return;
    }
    const fresh = items.find((item) => item.path === current.path);
    if (!fresh) {
      inspectAsset(null);
    } else if (
      fresh.src !== current.src ||
      fresh.size !== current.size ||
      fresh.modified !== current.modified ||
      fresh.url !== current.url
    ) {
      inspectAsset(fresh);
    }
  }, [items]);

  const open = (path: string) => {
    const at = items.findIndex((item) => item.path === path);
    if (at < 0) {
      return;
    }
    if (phone) {
      setIndex(at);
    } else {
      inspectAsset(items[at]!);
    }
  };

  const overlay = (
    <FilePreviewOverlay
      open={index != null && items[index] != null}
      items={items}
      index={index ?? 0}
      onIndexChange={setIndex}
      onClose={() => setIndex(null)}
      onEditUrl={editUrl}
    />
  );

  return { open, overlay };
}
