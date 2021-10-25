import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Typography, useMediaQuery } from "@material-ui/core";
import { useRouter } from "next/router";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { MemberAccess, useAllDocs } from "../../../impower-data-state";
import { GameDocument, ResourceDocument } from "../../../impower-data-store";
import { layout } from "../../../impower-route";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import {
  EngineConsoleType,
  studioConsoles,
} from "../../../impower-route/types/info/console";
import { UserContext } from "../../../impower-user";
import GamesConsole from "./GamesConsole";
import MembersConsole from "./MembersConsole";
import ResourcesConsole from "./ResourcesConsole";
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

interface StudioGamesConsoleProps {
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

const StudioGamesConsole = React.memo(
  (props: StudioGamesConsoleProps): JSX.Element | null => {
    const { scrollParent, studioId, stickyStyle, fixedStyle } = props;

    const [userState] = useContext(UserContext);
    const { my_game_memberships } = userState;
    const gameIds = useMemo(() => {
      if (my_game_memberships === undefined) {
        return undefined;
      }
      if (my_game_memberships === null) {
        return null;
      }
      return Object.entries(my_game_memberships)
        .filter(([, doc]) => doc.studio === studioId)
        .map(([id]) => id);
    }, [my_game_memberships, studioId]);
    const gameDocs = useAllDocs<GameDocument>("games", gameIds);

    return (
      <GamesConsole
        scrollParent={scrollParent}
        studioId={studioId}
        gameDocs={gameDocs}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
      />
    );
  }
);

interface StudioResourcesConsoleProps {
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

const StudioResourcesConsole = React.memo(
  (props: StudioResourcesConsoleProps): JSX.Element | null => {
    const { scrollParent, studioId, stickyStyle, fixedStyle } = props;

    const [userState] = useContext(UserContext);
    const { my_resource_memberships } = userState;
    const resourceIds = useMemo(() => {
      if (my_resource_memberships === undefined) {
        return undefined;
      }
      if (my_resource_memberships === null) {
        return null;
      }
      return Object.entries(my_resource_memberships)
        .filter(([, doc]) => doc.studio === studioId)
        .map(([id]) => id);
    }, [my_resource_memberships, studioId]);
    const resourceDocs = useAllDocs<ResourceDocument>("resources", resourceIds);

    return (
      <ResourcesConsole
        scrollParent={scrollParent}
        studioId={studioId}
        resourceDocs={resourceDocs}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
      />
    );
  }
);

interface SharedGamesConsoleProps {
  scrollParent?: HTMLElement;
  uid: string;
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

const SharedGamesConsole = React.memo(
  (props: SharedGamesConsoleProps): JSX.Element | null => {
    const { scrollParent, uid, studioId, stickyStyle, fixedStyle } = props;

    const [userState] = useContext(UserContext);
    const { my_game_memberships } = userState;

    const gameIds = useMemo(
      () =>
        my_game_memberships === undefined
          ? undefined
          : my_game_memberships === null
          ? null
          : Object.keys(my_game_memberships),
      [my_game_memberships]
    );
    const gameDocs = useAllDocs<GameDocument>("games", gameIds);
    const sharedGameDocs = useMemo(() => {
      if (!gameDocs) {
        return undefined;
      }
      const sharedDocs = {};
      Object.entries(gameDocs).forEach(([id, doc]) => {
        if (gameDocs[id]?._createdBy !== uid) {
          sharedDocs[id] = doc;
        }
      });
      return sharedDocs;
    }, [gameDocs, uid]);

    return (
      <GamesConsole
        scrollParent={scrollParent}
        studioId={studioId}
        gameDocs={sharedGameDocs}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
        emptyLabel={
          <StyledEmptyLabelTypography>{`(Games you've been added to will appear here)`}</StyledEmptyLabelTypography>
        }
      />
    );
  }
);

interface SharedResourcesConsoleProps {
  scrollParent?: HTMLElement;
  uid: string;
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

const SharedResourcesConsole = React.memo(
  (props: SharedResourcesConsoleProps): JSX.Element | null => {
    const { scrollParent, uid, studioId, stickyStyle, fixedStyle } = props;

    const [userState] = useContext(UserContext);
    const { my_resource_memberships } = userState;

    const resourceIds = useMemo(
      () =>
        my_resource_memberships === undefined
          ? undefined
          : my_resource_memberships === null
          ? null
          : Object.keys(my_resource_memberships),
      [my_resource_memberships]
    );
    const resourceDocs = useAllDocs<ResourceDocument>("resources", resourceIds);
    const sharedResourceDocs = useMemo(() => {
      if (!resourceDocs) {
        return undefined;
      }
      const sharedDocs = {};
      Object.entries(resourceDocs).forEach(([id, doc]) => {
        if (resourceDocs[id]?._createdBy !== uid) {
          sharedDocs[id] = doc;
        }
      });
      return sharedDocs;
    }, [resourceDocs, uid]);

    return (
      <ResourcesConsole
        scrollParent={scrollParent}
        studioId={studioId}
        resourceDocs={sharedResourceDocs}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
        emptyLabel={
          <StyledEmptyLabelTypography>{`(Resources you've been added to will appear here)`}</StyledEmptyLabelTypography>
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
    stickyStyle,
    fixedStyle,
    onDeleting,
    onDeleted,
    onDeletionFailed,
  } = props;

  const theme = useTheme();

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  if (type === EngineConsoleType.Games) {
    if (studioId?.toLowerCase() === "shared") {
      return (
        <SharedGamesConsole
          scrollParent={scrollParent}
          uid={uid}
          studioId={studioId}
          stickyStyle={stickyStyle}
          fixedStyle={fixedStyle}
        />
      );
    }
    return (
      <StudioGamesConsole
        scrollParent={scrollParent}
        studioId={studioId}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
      />
    );
  }
  if (type === EngineConsoleType.Resources) {
    if (studioId?.toLowerCase() === "shared") {
      return (
        <SharedResourcesConsole
          scrollParent={scrollParent}
          uid={uid}
          studioId={studioId}
          stickyStyle={stickyStyle}
          fixedStyle={fixedStyle}
        />
      );
    }
    return (
      <StudioResourcesConsole
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
  studioId: string;
  onDeleting?: () => void;
  onDeleted?: () => void;
  onDeletionFailed?: () => void;
}

const StudioConsole = React.memo((props: StudioConsoleProps) => {
  const { studioId, onDeleting, onDeleted, onDeletionFailed } = props;
  const router = useRouter();
  const [userState] = useContext(UserContext);
  const { uid, my_studio_memberships } = userState;
  const [scrollParent, setScrollParent] = useState<HTMLElement>();
  const [consoleIndex, setConsoleIndex] = useState<number>();

  const studioMemberDoc = useMemo(() => {
    if (my_studio_memberships === undefined) {
      return undefined;
    }
    if (my_studio_memberships === null) {
      return null;
    }
    return my_studio_memberships[studioId];
  }, [studioId, my_studio_memberships]);

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

  const buttonSpacing = theme.spacing(3);
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
        key={activeConsoleType}
        type={activeConsoleType}
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
