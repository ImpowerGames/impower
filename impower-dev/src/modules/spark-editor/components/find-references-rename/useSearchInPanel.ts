import { useSidebarCollapsed } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";

export default function useSearchInPanel() {
  const layout = useLayout();
  const collapsed = useSidebarCollapsed();
  return layout === "phone" || (layout === "compact" && collapsed);
}
