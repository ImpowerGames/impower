import { SidebarLayout } from "@impower/impower-ui/components";
import { useLayout, useRailDefault } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { RAIL_COMPACT_WIDTH, RAIL_WIDTH } from "../../workspace/railWidths";
import workspace from "../../workspace/WorkspaceStore";
import ShellRail from "./ShellRail";
import TopBar from "./TopBar";

export default function DesktopShell({
  children,
}: {
  children: ComponentChildren;
}) {
  const compact = useLayout() === "compact";
  const railDefault = useRailDefault();
  const shell = useComputed(() => workspace.state.value.shell).value;
  const railWidth = compact ? shell?.railCompactWidth : shell?.railWidth;

  const onWidthChange = async (width: number | undefined) => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (compact) {
      Workspace.window.setRailCompactWidth(width);
    } else {
      Workspace.window.setRailWidth(width);
    }
  };

  const limits = compact
    ? {
        default:
          railDefault === "full"
            ? RAIL_COMPACT_WIDTH.full
            : RAIL_COMPACT_WIDTH.collapsed,
        min: RAIL_COMPACT_WIDTH.full,
        max: RAIL_COMPACT_WIDTH.full,
        collapsed: RAIL_COMPACT_WIDTH.collapsed,
        reserve: RAIL_COMPACT_WIDTH.reserve,
      }
    : RAIL_WIDTH;

  return (
    <SidebarLayout
      width={railWidth ?? limits.default}
      defaultWidth={limits.default}
      minWidth={limits.min}
      maxWidth={limits.max}
      collapsedWidth={limits.collapsed}
      reserve={limits.reserve}
      onWidthChange={onWidthChange}
      resizeLabel="Resize sidebar"
      header={<TopBar />}
      sidebar={<ShellRail />}
    >
      {children}
    </SidebarLayout>
  );
}
