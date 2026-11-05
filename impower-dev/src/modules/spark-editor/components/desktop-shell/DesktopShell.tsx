import { SidebarLayout } from "@impower/impower-ui/components";
import { useLayout, useRailDefault } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import workspace from "../../workspace/WorkspaceStore";
import ShellRail from "./ShellRail";
import TopBar from "./TopBar";

const RAIL_WIDTH = {
  default: 232,
  min: 180,
  max: 420,
  collapsed: 76,
  reserve: 624,
} as const;

const RAIL_COMPACT_WIDTH = {
  full: 190,
  collapsed: 76,
  reserve: 280,
} as const;

export default function DesktopShell({
  children,
}: {
  children: ComponentChildren;
}) {
  const compact = useLayout() === "compact";
  const railDefault = useRailDefault();
  const railWidth = useComputed(() =>
    compact
      ? workspace.state.value.shell?.railCompactWidth
      : workspace.state.value.shell?.railWidth,
  ).value;

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
      width={railWidth}
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
