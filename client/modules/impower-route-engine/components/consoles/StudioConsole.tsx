import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Typography, useMediaQuery } from "@material-ui/core";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { MemberAccess, MemberData } from "../../../impower-data-state";
import { layout } from "../../../impower-route";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import {
  EngineConsoleType,
  studioConsoles,
} from "../../../impower-route/types/info/console";
import MembersConsole from "./MembersConsole";
import ProjectsConsole from "./ProjectsConsole";
import SettingsConsole from "./SettingsConsole";

const StyledConsoleArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  min-height: calc(
    100vh - ${(props): string => props.theme.minHeight.navigationBar} -
      ${(props): string => props.theme.minHeight.navigationTabs}
  );
`;

const StyledEmptyLabelTypography = styled(Typography)`
  font-size: ${(props): string => props.theme.fontSize.large};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  padding-top: ${(props): string => props.theme.spacing(4)};
  display: flex;
  align-items: center;
  text-align: center;
`;

interface StudioProjectsConsoleProps {
  studioMemberships: {
    [docId: string]: MemberData;
  };
  projectMemberships: {
    [docId: string]: MemberData;
  };
  scrollParent?: HTMLElement;
  studioId: string;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
}

const StudioProjectsConsole = React.memo(
  (props: StudioProjectsConsoleProps): JSX.Element | null => {
    const {
      studioMemberships,
      projectMemberships,
      scrollParent,
      studioId,
      stickyStyle,
      fixedStyle,
    } = props;

    return (
      <ProjectsConsole
        scrollParent={scrollParent}
        studioId={studioId}
        studioMemberships={studioMemberships}
        projectMemberships={projectMemberships}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
      />
    );
  }
);

interface SharedProjectsConsoleProps {
  studioMemberships: {
    [docId: string]: MemberData;
  };
  projectMemberships: {
    [docId: string]: MemberData;
  };
  scrollParent?: HTMLElement;
  studioId: string;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
}

const SharedProjectsConsole = React.memo(
  (props: SharedProjectsConsoleProps): JSX.Element | null => {
    const {
      studioMemberships,
      projectMemberships,
      scrollParent,
      studioId,
      stickyStyle,
      fixedStyle,
    } = props;

    return (
      <ProjectsConsole
        scrollParent={scrollParent}
        studioId={studioId}
        projectMemberships={projectMemberships}
        studioMemberships={studioMemberships}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
        emptyLabel={
          <StyledEmptyLabelTypography>{`(Projects you've been added to will appear here)`}</StyledEmptyLabelTypography>
        }
      />
    );
  }
);

interface ConsoleProps {
  scrollParent?: HTMLElement;
  type: EngineConsoleType;
  uid: string;
  studioId: string;
  studioMemberships: {
    [docId: string]: MemberData;
  };
  projectMemberships: {
    [docId: string]: MemberData;
  };
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
  onDeleting?: () => void;
  onDeleted?: () => void;
  onDeletionFailed?: () => void;
}

const Console = React.memo((props: ConsoleProps): JSX.Element | null => {
  const {
    scrollParent,
    type,
    uid,
    studioId,
    studioMemberships,
    projectMemberships,
    stickyStyle,
    fixedStyle,
    onDeleting,
    onDeleted,
    onDeletionFailed,
  } = props;

  const studioProjectMemberships = useMemo(() => {
    if (projectMemberships === undefined) {
      return undefined;
    }
    if (projectMemberships === null) {
      return null;
    }
    const memberships = {};
    Object.entries(projectMemberships).forEach(([id, data]) => {
      if (data?.s?.id === studioId) {
        memberships[id] = data;
      }
    });
    return memberships;
  }, [projectMemberships, studioId]);

  const sharedProjectMemberships = useMemo(() => {
    if (projectMemberships === undefined) {
      return undefined;
    }
    if (!projectMemberships) {
      return null;
    }
    const memberships = {};
    Object.entries(projectMemberships).forEach(([id, data]) => {
      if (projectMemberships[id]?._createdBy !== uid) {
        memberships[id] = data;
      }
    });
    return memberships;
  }, [projectMemberships, uid]);

  const theme = useTheme();

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  if (type === EngineConsoleType.Projects) {
    if (studioId?.toLowerCase() === "shared") {
      return (
        <SharedProjectsConsole
          studioMemberships={studioMemberships}
          projectMemberships={sharedProjectMemberships}
          scrollParent={scrollParent}
          studioId={studioId}
          stickyStyle={stickyStyle}
          fixedStyle={fixedStyle}
        />
      );
    }
    return (
      <StudioProjectsConsole
        studioMemberships={studioMemberships}
        projectMemberships={studioProjectMemberships}
        scrollParent={scrollParent}
        studioId={studioId}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
      />
    );
  }
  if (type === EngineConsoleType.Members) {
    return (
      <MembersConsole
        scrollParent={scrollParent}
        studioId={studioId}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
      />
    );
  }
  if (type === EngineConsoleType.Settings) {
    return (
      <SettingsConsole
        studioId={studioId}
        onDeleting={onDeleting}
        onDeleted={onDeleted}
        onDeletionFailed={onDeletionFailed}
      />
    );
  }
  return null;
});

interface StudioConsoleProps {
  uid: string;
  studioId: string;
  studioMemberships: { [id: string]: MemberData };
  projectMemberships: { [id: string]: MemberData };
  onDeleting?: () => void;
  onDeleted?: () => void;
  onDeletionFailed?: () => void;
}

const StudioConsole = React.memo((props: StudioConsoleProps) => {
  const {
    uid,
    studioId,
    studioMemberships,
    projectMemberships,
    onDeleting,
    onDeleted,
    onDeletionFailed,
  } = props;
  const router = useRouter();
  const [scrollParent, setScrollParent] = useState<HTMLElement>();
  const [consoleIndex, setConsoleIndex] = useState<number>();

  const studioMemberDoc = useMemo(() => {
    if (studioMemberships === undefined) {
      return undefined;
    }
    if (studioMemberships === null) {
      return null;
    }
    return studioMemberships[studioId];
  }, [studioId, studioMemberships]);

  const consoles =
    studioId?.toLowerCase() === "shared"
      ? studioConsoles.filter(
          (console) =>
            console.type !== EngineConsoleType.Members &&
            console.type !== EngineConsoleType.Settings
        )
      : studioMemberDoc?.access === MemberAccess.Editor ||
        studioMemberDoc?.access === MemberAccess.Viewer
      ? studioConsoles.filter(
          (console) => console.type !== EngineConsoleType.Settings
        )
      : studioConsoles;

  const validConsoleIndex =
    consoleIndex !== undefined && consoleIndex >= 0 ? consoleIndex : 0;
  const activeConsoleType = consoles[validConsoleIndex]?.type;

  const tabs = consoles.map((console) => console.tab);

  const theme = useTheme();

  const belowXsBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

  const sidebarWidth = belowXsBreakpoint
    ? 0
    : layout.size.minWidth.navigationBar;
  const tabsHeight = 48;

  const buttonSpacing = 8 * 3;
  const fixedStyle = {
    left: sidebarWidth + buttonSpacing,
    right: buttonSpacing,
    bottom: buttonSpacing,
  };

  const consoleStickyStyle = useMemo(
    () => ({
      position: "sticky",
      zIndex: 3,
      boxShadow: theme.shadows[3],
      top: tabsHeight,
      left: sidebarWidth,
    }),
    [sidebarWidth, theme.shadows, tabsHeight]
  );

  useEffect(() => {
    setScrollParent(document.documentElement);
  }, []);

  useEffect(() => {
    const { query } = router as { query: { t?: string } };
    const index = query?.t ? tabs.indexOf(query.t) : 0;
    setConsoleIndex(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <StyledConsoleArea>
      <Console
        type={activeConsoleType}
        studioMemberships={studioMemberships}
        projectMemberships={projectMemberships}
        uid={uid}
        scrollParent={scrollParent}
        studioId={studioId}
        fixedStyle={fixedStyle}
        stickyStyle={consoleStickyStyle}
        onDeleting={onDeleting}
        onDeleted={onDeleted}
        onDeletionFailed={onDeletionFailed}
      />
    </StyledConsoleArea>
  );
});

export default StudioConsole;
