import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Tab from "@material-ui/core/Tab";
import Typography from "@material-ui/core/Typography";
import { GetStaticPaths, GetStaticProps } from "next";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import getLocalizationConfigParameters from "../../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../../lib/getTagConfigParameters";
import { ConfigParameters } from "../../../modules/impower-config";
import ConfigCache from "../../../modules/impower-config/classes/configCache";
import { MemberAccess } from "../../../modules/impower-data-state";
import DataStoreCache from "../../../modules/impower-data-store/classes/dataStoreCache";
import { FontIcon } from "../../../modules/impower-icon";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetType,
} from "../../../modules/impower-navigation";
import {
  FadeAnimation,
  Fallback,
  Tabs,
  UnmountAnimation,
} from "../../../modules/impower-route";
import useBodyBackgroundColor from "../../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../modules/impower-route/hooks/useHTMLBackgroundColor";
import {
  engineConsoles,
  EngineConsoleType,
  studioConsoles,
} from "../../../modules/impower-route/types/info/console";
import { useRouter } from "../../../modules/impower-router";
import { UserContext } from "../../../modules/impower-user";
import PlusSolidIcon from "../../../resources/icons/solid/plus.svg";

const TagIconLoader = dynamic(
  () =>
    import("../../../modules/impower-route/components/elements/TagIconLoader"),
  { ssr: false }
);

const CircularProgress = dynamic(
  () => import("@material-ui/core/CircularProgress"),
  { ssr: false }
);

const StudioConsole = dynamic(
  () =>
    import(
      "../../../modules/impower-route-engine/components/consoles/StudioConsole"
    )
);

const deletingLabel = "Deleting Studio...";
const deletedLabel = "(Deleted Studio)";

const StyledStudioPage = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  background-color: ${(props): string => props.theme.colors.lightForeground};
  backface-visibility: hidden;
  height: 100vh;
`;

const StyledStudioPageContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  backface-visibility: hidden;
`;

const StyledApp = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
`;

const StyledFullscreenTopBackground = styled.div`
  background-color: ${(props): string => props.theme.palette.primary.main};
  height: ${(props): string => props.theme.minHeight.navigationTabs}
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
`;

const StyledToolbarArea = styled.div`
  position: relative;
  z-index: 3;
`;

const StyledToolbar = styled.div`
  display: flex;
  background-color: ${(props): string => props.theme.palette.primary.main};
  color: white;
  padding: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  top: 0;
  right: 0;
  left: 0;
  box-shadow: ${(props): string => props.theme.shadows[0]};
`;

const StyledToolbarContent = styled.div`
  max-width: calc(960px + ${(props): string => props.theme.spacing(3)});
  width: 100%;
  margin: auto;
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)`
  &:first-of-type {
    margin-left: ${(props): string => props.theme.spacing(2)};
  }
  &:last-of-type {
    margin-right: ${(props): string => props.theme.spacing(2)};
  }

  min-width: ${(props): string => props.theme.spacing(20)};
  padding: ${(props): string => props.theme.spacing(0, 3)};

  ${(props): string => props.theme.breakpoints.down("lg")} {
    min-width: ${(props): string => props.theme.spacing(15)};
    padding: ${(props): string => props.theme.spacing(0, 1)};
  }

  ${(props): string => props.theme.breakpoints.down("md")} {
    min-width: ${(props): string => props.theme.spacing(11)};
    padding: ${(props): string => props.theme.spacing(0, 1)};
  }

  ${(props): string => props.theme.breakpoints.down("sm")} {
    min-width: ${(props): string => props.theme.spacing(8)};
    padding: ${(props): string => props.theme.spacing(0, 1)};
  }
`;

const StyledMainTitleTypography = styled(Typography)`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  font-size: ${(props): string => props.theme.fontSize.large};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  min-height: ${(props): string => props.theme.spacing(8)};
  display: flex;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(0, 2)};
`;

const StyledDeletionArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const StyledDeletionLabelTypography = styled(Typography)`
  font-size: 1rem;
  padding-top: ${(props): string => props.theme.spacing(4)};
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
`;

const StyledCircularProgressArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgress = styled(CircularProgress)``;

const StyledButtonArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(1)};
`;

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
`;

interface StudioPageContentProps {
  studioId: string;
}

const StudioPageContent = React.memo((props: StudioPageContentProps) => {
  const { studioId } = props;
  const router = useRouter();
  const [userState] = useContext(UserContext);
  const { my_studio_memberships, studios } = userState;
  const [consoleIndex, setConsoleIndex] = useState<number>();
  const [deletionState, setDeletionState] = useState<"deleting" | "deleted">();

  const studioDoc = studios?.[studioId];

  const engineConsole = engineConsoles.find(
    (c) => c.type === EngineConsoleType.Studios
  );

  const { createTitle } = engineConsole;

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

  const tabsHeight = 48;

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    const { query } = router as { query: { t?: string } };
    const index = query?.t ? tabs.indexOf(query.t) : 0;
    setConsoleIndex(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleChangeTab = useCallback(
    (event: React.ChangeEvent, newValue: number): void => {
      router.replace(`/e/s/${studioId}?t=${tabs[newValue]}`, undefined, {
        shallow: true,
      });
      setConsoleIndex(newValue);
    },
    [studioId, router, tabs]
  );

  const loading =
    studioId?.toLowerCase() === "shared" ? false : Boolean(studioDoc);

  const handleDeleting = useCallback(() => {
    setDeletionState("deleting");
  }, []);

  const handleDeleted = useCallback(() => {
    setDeletionState("deleted");
  }, []);

  const handleDeletionFailed = useCallback(() => {
    setDeletionState(undefined);
  }, []);

  const handleCreate = useCallback(() => {
    router.push(
      `/e/s/${studioId}?t=${tabs[validConsoleIndex]}&mode=create-studio`
    );
  }, [router, studioId, tabs, validConsoleIndex]);

  if (!process.env.NEXT_PUBLIC_ORIGIN?.includes("localhost")) {
    return null;
  }

  if (deletionState === "deleting") {
    return (
      <StyledStudioPageContent>
        <StyledDeletionArea>
          <StyledCircularProgressArea>
            <StyledCircularProgress color="secondary" />
          </StyledCircularProgressArea>
          <StyledDeletionLabelTypography style={{ fontWeight: "bold" }}>
            {deletingLabel}
          </StyledDeletionLabelTypography>
        </StyledDeletionArea>
      </StyledStudioPageContent>
    );
  }

  if (deletionState === "deleted") {
    return (
      <StyledStudioPageContent>
        <StyledDeletionArea>
          <StyledDeletionLabelTypography>
            {deletedLabel}
          </StyledDeletionLabelTypography>
          <StyledButtonArea>
            <StyledButton
              variant="contained"
              color="secondary"
              size="large"
              onClick={handleCreate}
            >
              <StyledButtonIconArea>
                <FontIcon
                  aria-label={createTitle}
                  size={theme.fontSize.smallIcon}
                >
                  <PlusSolidIcon />
                </FontIcon>
              </StyledButtonIconArea>
              {createTitle}
            </StyledButton>
          </StyledButtonArea>
        </StyledDeletionArea>
      </StyledStudioPageContent>
    );
  }

  return (
    <StyledStudioPageContent>
      <StyledFullscreenTopBackground />
      <StyledApp>
        <StyledToolbarArea>
          <StyledToolbar>
            <StyledToolbarContent>
              <StyledMainTitleTypography variant="h6">
                {studioDoc?.name || `Shared With You`}
              </StyledMainTitleTypography>
            </StyledToolbarContent>
          </StyledToolbar>
        </StyledToolbarArea>
        <StyledToolbarArea
          style={{ height: tabsHeight, position: "sticky", top: 0, zIndex: 3 }}
        >
          <StyledToolbar>
            <StyledToolbarContent>
              <StyledTabs
                value={validConsoleIndex}
                variant="scrollable"
                indicatorColor="white"
                onChange={handleChangeTab}
              >
                {consoles.map((info) => (
                  <StyledTab
                    key={info.type}
                    label={info.name}
                    style={{
                      opacity: consoleIndex === undefined ? 0 : undefined,
                    }}
                  />
                ))}
              </StyledTabs>
            </StyledToolbarContent>
          </StyledToolbar>
        </StyledToolbarArea>
        {loading ? (
          <>
            <Fallback color="secondary" />
          </>
        ) : (
          <StudioConsole
            key={activeConsoleType}
            studioId={studioId}
            onDeleting={handleDeleting}
            onDeleted={handleDeleted}
            onDeletionFailed={handleDeletionFailed}
          />
        )}
      </StyledApp>
    </StyledStudioPageContent>
  );
});

interface StudioPageProps {
  config: ConfigParameters;
}

const StudioPage = React.memo((props: StudioPageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  const router = useRouter();
  const { sid } = router.query;
  const studioId = Array.isArray(sid) ? sid[0] : `${sid}`;

  const theme = useTheme();

  ConfigCache.instance.set(config);

  useBodyBackgroundColor(theme.palette.primary.main);
  useHTMLBackgroundColor(theme.palette.primary.main);

  useEffect(() => {
    navigationDispatch(navigationSetType("studio"));
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (process.env.NEXT_PUBLIC_ENVIRONMENT !== "development") {
    return null;
  }

  return (
    <>
      <StyledStudioPage>
        <UnmountAnimation>
          <FadeAnimation key={studioId} initial={0} animate={1} exit={0}>
            <StudioPageContent studioId={studioId} />
          </FadeAnimation>
        </UnmountAnimation>
      </StyledStudioPage>
      <TagIconLoader />
    </>
  );
});

export default StudioPage;

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: "blocking" };
};

export const getStaticProps: GetStaticProps<StudioPageProps> = async () => {
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  return {
    props: { config },
  };
};
