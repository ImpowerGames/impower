import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigParameters } from "../../impower-config";
import { ProjectDocument } from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { BetaBanner } from "../../impower-route";
import { UserContext } from "../../impower-user";
import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterLabel from "../utils/getRangeFilterLabel";
import AddPitchToolbar from "./AddPitchToolbar";
import EmptyPitchList from "./EmptyPitchList";
import PitchList from "./PitchList";
import PitchTabsToolbar, { PitchToolbarTab } from "./PitchTabsToolbar";

const SORT_OPTIONS: ["rank", "new"] = ["rank", "new"];

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
  position: relative;
`;

const StyledListContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
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

  const toolbarRef = useRef<HTMLDivElement>();
  const contentElRef = useRef<HTMLDivElement>();
  const listElRef = useRef<HTMLDivElement>();
  const loadingElRef = useRef<HTMLDivElement>();

  const shouldDisplayFollowingPitchesRef = useRef<boolean>();
  const [shouldDisplayFollowingPitches, setShouldDisplayFollowingPitches] =
    useState<boolean>(shouldDisplayFollowingPitchesRef.current);

  const [activeTab, setActiveTab] = useState<PitchToolbarTab>(
    typeof window !== "undefined" &&
      window.location.search?.toLowerCase() === "?t=following"
      ? "Following"
      : typeof window !== "undefined" &&
        window.location.search?.toLowerCase() === "?t=top"
      ? "Top"
      : "Trending"
  );

  const validPitchDocs = activeTab === "Trending" ? pitchDocs : undefined;

  const [allowReload, setAllowReload] = useState(!validPitchDocs);
  const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("d");
  const [reloading, setReloading] = useState(false);

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

  const showFollowTags =
    Object.keys(my_follows || {}).length === 0 ||
    !shouldDisplayFollowingPitches;

  useEffect(() => {
    navigationDispatch(navigationSetTransitioning(false));
  }, [navigationDispatch]);

  useEffect(() => {
    if (followedTags === undefined) {
      return;
    }
    if (followedTags === null) {
      shouldDisplayFollowingPitchesRef.current = false;
      setShouldDisplayFollowingPitches(
        shouldDisplayFollowingPitchesRef.current
      );
    }
    if (followedTags?.length > 0) {
      shouldDisplayFollowingPitchesRef.current = true;
      setShouldDisplayFollowingPitches(
        shouldDisplayFollowingPitchesRef.current
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFollowedTags]);

  const handleShowLoadingPlaceholder = useCallback(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (contentElRef.current) {
      contentElRef.current.style.overflow = "hidden";
    }
    if (listElRef.current) {
      listElRef.current.style.visibility = "hidden";
      listElRef.current.style.pointerEvents = "none";
    }
    if (loadingElRef.current) {
      loadingElRef.current.classList.add("animate");
      loadingElRef.current.style.visibility = null;
      loadingElRef.current.style.pointerEvents = null;
    }
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    setReloading(true);
  }, []);

  const handleChangeTab = useCallback(
    async (tab: PitchToolbarTab) => {
      if (followedTags === null) {
        shouldDisplayFollowingPitchesRef.current = false;
      }
      if (followedTags?.length > 0) {
        shouldDisplayFollowingPitchesRef.current = true;
      }
      if (toolbarRef.current) {
        toolbarRef.current.style.opacity =
          tab === "Following" && !shouldDisplayFollowingPitchesRef.current
            ? "0"
            : null;
      }
      await handleShowLoadingPlaceholder();
      setAllowReload(true);
      setActiveTab(tab);
      setShouldDisplayFollowingPitches(
        shouldDisplayFollowingPitchesRef.current
      );
      window.history.replaceState(
        window.history.state,
        "",
        `/pitch?t=${tab.toLowerCase()}`
      );
    },
    [followedTags, handleShowLoadingPlaceholder]
  );

  const handleReloadFollowing = useCallback(async (): Promise<void> => {
    shouldDisplayFollowingPitchesRef.current = true;
    setShouldDisplayFollowingPitches(shouldDisplayFollowingPitchesRef.current);
  }, []);

  const handleFollowMore = useCallback(
    (open: boolean): void => {
      shouldDisplayFollowingPitchesRef.current = !open;
      if (toolbarRef.current) {
        toolbarRef.current.style.opacity =
          activeTab === "Following" && !shouldDisplayFollowingPitchesRef.current
            ? "0"
            : null;
      }
      setShouldDisplayFollowingPitches(
        shouldDisplayFollowingPitchesRef.current
      );
    },
    [activeTab]
  );

  const emptyImage = useMemo(() => <AnimatedHappyMascot />, []);
  const emptySubtitle1 = `Got an idea?`;
  const emptySubtitle2 = `Why not pitch it?`;
  const searchLabel = `${
    activeTab === "Following" || activeTab === "Trending"
      ? `for now`
      : `for ${getRangeFilterLabel(rangeFilter)?.toLowerCase()}`
  }.`;

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

  const emptyPlaceholder = useMemo(
    () => (
      <EmptyPitchList
        loadedImage={emptyImage}
        filterLabel={filterLabel}
        emptySubtitle1={emptySubtitle1}
        emptySubtitle2={emptySubtitle2}
        searchLabel={searchLabel}
        emptyLabelStyle={emptyLabelStyle}
        searchLabelStyle={searchLabelStyle}
      />
    ),
    [
      emptyImage,
      emptyLabelStyle,
      emptySubtitle1,
      emptySubtitle2,
      filterLabel,
      searchLabel,
      searchLabelStyle,
    ]
  );

  const offlinePlaceholder = useMemo(
    () => (
      <AnimatedWarningMascotIllustration
        message={`Looks like you're offline`}
      />
    ),
    []
  );

  const handleRangeFilter = useCallback(
    (e: React.MouseEvent, value: DateRangeFilter) => {
      setRangeFilter(value);
    },
    []
  );

  const loading = transitioning;

  return (
    <StyledPitch style={style}>
      <StyledApp>
        <PitchTabsToolbar value={activeTab} onChange={handleChangeTab} />
        <BetaBanner />
        <StyledListArea>
          <StyledListContent>
            {loading ? (
              loadingPlaceholder
            ) : activeTab === "Following" && showFollowTags ? (
              <PitchFollowTags
                loadingPlaceholder={loadingPlaceholder}
                onReload={handleReloadFollowing}
              />
            ) : (
              <PitchList
                config={config}
                icons={icons}
                pitchDocs={validPitchDocs}
                tab={activeTab}
                sortOptions={SORT_OPTIONS}
                allowReload={allowReload}
                reloading={reloading}
                loadingPlaceholder={loadingPlaceholder}
                emptyPlaceholder={emptyPlaceholder}
                offlinePlaceholder={offlinePlaceholder}
                listElRef={listElRef}
                loadingElRef={loadingElRef}
                onFollowMore={handleFollowMore}
                onRangeFilter={handleRangeFilter}
                onReloading={setReloading}
              />
            )}
          </StyledListContent>
        </StyledListArea>
        {(activeTab !== "Following" || !showFollowTags) && (
          <AddPitchToolbar
            toolbarRef={toolbarRef}
            config={config}
            icons={icons}
          />
        )}
      </StyledApp>
    </StyledPitch>
  );
});

export default Pitch;
