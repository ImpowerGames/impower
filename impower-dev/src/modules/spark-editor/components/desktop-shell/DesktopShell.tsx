import { SidebarLayout } from "@impower/impower-ui/components";
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

export default function DesktopShell({
  children,
}: {
  children: ComponentChildren;
}) {
  const railWidth = useComputed(
    () => workspace.state.value.shell?.railWidth,
  ).value;

  const onWidthChange = async (width: number | undefined) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.setRailWidth(width);
  };

  return (
    <SidebarLayout
      width={railWidth}
      defaultWidth={RAIL_WIDTH.default}
      minWidth={RAIL_WIDTH.min}
      maxWidth={RAIL_WIDTH.max}
      collapsedWidth={RAIL_WIDTH.collapsed}
      reserve={RAIL_WIDTH.reserve}
      onWidthChange={onWidthChange}
      resizeLabel="Resize sidebar"
      header={<TopBar />}
      sidebar={<ShellRail />}
    >
      {children}
    </SidebarLayout>
  );
}
