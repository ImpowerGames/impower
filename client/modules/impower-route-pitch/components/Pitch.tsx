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
  const [activeTab, setActiveTab] = useState<PitchToolbarTab>("Trending");

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
      setActiveTab(tab);
      if (followedTags === null) {
        setShouldDisplayFollowingPitches(false);
      }
      if (followedTags?.length > 0) {
        setShouldDisplayFollowingPitches(true);
      }
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

  return (
    <StyledPitch style={style}>
      <StyledApp>
        <PitchTabsToolbar value={activeTab} onChange={handleChangeTab} />
        <BetaBanner />
        <StyledListArea key={activeTab}>
          {activeTab === "Following" && !shouldDisplayFollowingPitches ? (
            <PitchFollowTags onReload={handleReloadFollowing} />
          ) : (
            <>
              <PitchList
                config={config}
                icons={icons}
                pitchDocs={pitchDocs}
                tab={activeTab}
                sortOptions={SORT_OPTIONS}
                onFollowMore={handleFollowMore}
                searchingPlaceholder={
                  <EmptyPitchList
                    loading
                    loadingMessage={`Searching...`}
                    emptySubtitle1={emptySubtitle1}
                    emptySubtitle2={emptySubtitle2}
                  />
                }
                emptyPlaceholder={
                  <EmptyPitchList
                    loading={pitchDocs === undefined}
                    loadedImage={emptyImage}
                    filterLabel={filterLabel}
                    emptySubtitle1={emptySubtitle1}
                    emptySubtitle2={emptySubtitle2}
                    emptyLabelStyle={emptyLabelStyle}
                    searchLabelStyle={searchLabelStyle}
                  />
                }
                offlinePlaceholder={
                  <AnimatedWarningMascotIllustration
                    message={`Looks like you're offline`}
                  />
                }
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
