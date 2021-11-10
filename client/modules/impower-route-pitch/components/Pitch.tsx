import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConfigParameters } from "../../impower-config";
import { ProjectDocument } from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { BetaBanner } from "../../impower-route";
import { UserContext } from "../../impower-user";
import AddPitchToolbar from "./AddPitchToolbar";
import PitchList from "./PitchList";
import PitchTabsToolbar, { PitchToolbarTab } from "./PitchTabsToolbar";

const SORT_OPTIONS: ["rank", "new"] = ["rank", "new"];

const EmptyPitchList = dynamic(() => import("./EmptyPitchList"), {
  ssr: false,
});

const AnimatedHappyMascot = dynamic(
  () =>
    import("../../impower-route/components/illustrations/AnimatedHappyMascot"),
  {
    ssr: false,
  }
);

const AnimatedWarningMascotIllustration = dynamic(
  () =>
    import(
      "../../impower-route/components/illustrations/AnimatedWarningMascotIllustration"
    ),
  { ssr: false }
);

const PitchFollowTags = dynamic(() => import("./PitchFollowTags"), {
  ssr: false,
});

const StyledPitch = styled.div`
  height: 100vh;
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
  padding-top: calc(
    ${(props): string => props.theme.minHeight.navigationBar} +
      ${(props): string => props.theme.minHeight.navigationTabs}
  );
`;

const StyledListArea = styled.div`
  flex: 1;
  min-width: 0;
  background-color: ${(props): string => props.theme.colors.lightForeground};
  align-items: center;
  display: flex;
  flex-direction: column;
`;

interface PitchProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  style?: React.CSSProperties;
}

const Pitch = React.memo((props: PitchProps): JSX.Element => {
  const { config, icons, pitchDocs, style } = props;

  const [shouldDisplayFollowingPitches, setShouldDisplayFollowingPitches] =
    useState<boolean>();
  const [activeTab, setActiveTab] = useState<PitchToolbarTab>(
    typeof window !== "undefined" &&
      window.location.search?.toLowerCase() === "?t=following"
      ? "Following"
      : typeof window !== "undefined" &&
        window.location.search?.toLowerCase() === "?t=top"
      ? "Top"
      : "Trending"
  );
  const [allowReload, setAllowReload] = useState(!pitchDocs);

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const transitioning = navigationState?.transitioning;
  const [userState] = useContext(UserContext);
  const { my_follows } = userState;
  const followedTags = useMemo(
    () =>
      my_follows
        ? Object.entries(my_follows)
            .filter(([, v]) => v.g === "tags")
            .map(([target]) => target.split("%").slice(-1).join(""))
        : (my_follows as null | undefined),
    [my_follows]
  );

  const loadedFollowedTags = followedTags !== undefined;

  useEffect(() => {
    navigationDispatch(navigationSetTransitioning(false));
  }, [navigationDispatch]);

  useEffect(() => {
    if (followedTags === undefined) {
      return;
    }
    if (followedTags === null) {
      setShouldDisplayFollowingPitches(false);
    }
    if (followedTags?.length > 0) {
      setShouldDisplayFollowingPitches(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFollowedTags]);

  const handleChangeTab = useCallback(
    (tab: PitchToolbarTab): void => {
      setAllowReload(true);
      setActiveTab(tab);
      if (followedTags === null) {
        setShouldDisplayFollowingPitches(false);
      }
      if (followedTags?.length > 0) {
        setShouldDisplayFollowingPitches(true);
      }
      window.history.replaceState(
        window.history.state,
        "",
        `/pitch?t=${tab.toLowerCase()}`
      );
    },
    [followedTags]
  );

  const handleReloadFollowing = useCallback(async (): Promise<void> => {
    setShouldDisplayFollowingPitches(true);
  }, []);

  const handleFollowMore = useCallback((open: boolean): void => {
    setShouldDisplayFollowingPitches(!open);
  }, []);

  const emptyImage = useMemo(() => <AnimatedHappyMascot />, []);
  const emptySubtitle1 = `Got an idea?`;
  const emptySubtitle2 = `Why not pitch it?`;
  const searchLabel = `now.`;

  const filterLabel = `pitches`;
  const emptyLabelStyle: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
    }),
    []
  );
  const searchLabelStyle: React.CSSProperties = useMemo(
    () => ({ fontWeight: 700 }),
    []
  );

  const loadingPlaceholder = useMemo(
    () => (
      <EmptyPitchList
        loading
        loadingMessage={`Loading...`}
        emptySubtitle1={emptySubtitle1}
        emptySubtitle2={emptySubtitle2}
      />
    ),
    [emptySubtitle1, emptySubtitle2]
  );

  return (
    <StyledPitch style={style}>
      <StyledApp>
        <PitchTabsToolbar value={activeTab} onChange={handleChangeTab} />
        <BetaBanner />
        <StyledListArea>
          {transitioning ? (
            loadingPlaceholder
          ) : activeTab === "Following" && !shouldDisplayFollowingPitches ? (
            <PitchFollowTags
              loadingPlaceholder={loadingPlaceholder}
              onReload={handleReloadFollowing}
            />
          ) : (
            <>
              <PitchList
                config={config}
                icons={icons}
                pitchDocs={pitchDocs}
                tab={activeTab}
                sortOptions={SORT_OPTIONS}
                allowReload={allowReload}
                loadingPlaceholder={loadingPlaceholder}
                emptyPlaceholder={
                  <EmptyPitchList
                    loading={pitchDocs === undefined}
                    loadedImage={emptyImage}
                    filterLabel={filterLabel}
                    emptySubtitle1={emptySubtitle1}
                    emptySubtitle2={emptySubtitle2}
                    searchLabel={searchLabel}
                    emptyLabelStyle={emptyLabelStyle}
                    searchLabelStyle={searchLabelStyle}
                  />
                }
                offlinePlaceholder={
                  <AnimatedWarningMascotIllustration
                    message={`Looks like you're offline`}
                  />
                }
                onFollowMore={handleFollowMore}
              />
              <AddPitchToolbar
                config={config}
                icons={icons}
                hidden={
                  activeTab === "Following" &&
                  (!followedTags || followedTags.length === 0)
                }
              />
            </>
          )}
        </StyledListArea>
      </StyledApp>
    </StyledPitch>
  );
});

export default Pitch;
