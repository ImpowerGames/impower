import styled from "@emotion/styled";
import { CircularProgress, Divider, Typography } from "@material-ui/core";
import Tab from "@material-ui/core/Tab";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { abbreviateCount } from "../../impower-config";
import format from "../../impower-config/utils/format";
import { AggData } from "../../impower-data-state";
import { NavigationContext } from "../../impower-navigation";
import { Tabs } from "../../impower-route";
import StaticContributionList from "../../impower-route-pitch/components/StaticContributionList";
import StaticPitchList from "../../impower-route-pitch/components/StaticPitchList";
import { UserContext } from "../../impower-user";

const StyledContainer = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledPaper = styled.div`
  flex: 1;
  width: 100%;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  display: flex;
  flex-direction: column;
  background-color: white;
`;

const StyledTabsArea = styled.div`
  position: relative;
  background-color: white;
  z-index: 1;
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledListArea = styled.div`
  flex: 1;
  min-width: 0;
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

const StyledLoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
`;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

const StyledDivider = styled(Divider)``;

const StyledOfflineArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
  z-index: 1;
`;

const StyledOfflineTypography = styled(Typography)`
  opacity: 0.6;
`;

const tabLabels = [
  "{count:PITCH|PITCHES}",
  "{count:CONTRIBUTION|CONTRIBUTIONS}",
];

const Kudos = React.memo((): JSX.Element | null => {
  const [navigationState] = useContext(NavigationContext);
  const transitioning = navigationState?.transitioning;
  const [userState] = useContext(UserContext);
  const [tabIndex, setTabIndex] = useState(
    typeof window !== "undefined" &&
      window.location.search?.toLowerCase() === "?t=contributions"
      ? 1
      : 0
  );
  const [pitchDataEntries, setPitchDataEntries] =
    useState<[string, AggData][]>();
  const [contributionDataEntries, setContributionDataEntries] =
    useState<[string, AggData][]>();

  const { my_kudos } = userState;

  const handleChange = useCallback((e: React.ChangeEvent, value: number) => {
    setTabIndex(value);
    if (value === 0) {
      window.history.replaceState(window.history.state, "", `/kudos?t=pitches`);
    } else {
      window.history.replaceState(
        window.history.state,
        "",
        `/kudos?t=contributions`
      );
    }
  }, []);

  const handleRefresh = useCallback(() => {
    const newPitchDataEntries: [string, AggData][] = [];
    const newContributionDataEntries: [string, AggData][] = [];
    Object.entries(my_kudos || {}).forEach(([key, data]) => {
      const path = key.split("%");
      const targetCollection = path[path.length - 2];
      const targetId = path[path.length - 1];
      if (key?.startsWith("pitched_projects")) {
        if (targetCollection?.startsWith("pitched_projects")) {
          newPitchDataEntries.push([targetId, data]);
        }
        if (targetCollection === "contributions") {
          const pitchId = path[path.length - 3];
          const contributionKey = `${pitchId}%${targetId}`;
          newContributionDataEntries.push([contributionKey, data]);
        }
      }
    });
    setPitchDataEntries(newPitchDataEntries);
    setContributionDataEntries(newContributionDataEntries);
  }, [my_kudos]);

  useEffect(() => {
    if (my_kudos === undefined) {
      return;
    }
    if (pitchDataEntries || contributionDataEntries) {
      return;
    }
    handleRefresh();
  }, [contributionDataEntries, handleRefresh, my_kudos, pitchDataEntries]);

  const loadingPlaceholder = useMemo(
    () => (
      <StyledLoadingOverlay>
        <StyledCircularProgress color="secondary" />
      </StyledLoadingOverlay>
    ),
    []
  );

  const pitchCount = pitchDataEntries?.length;
  const pitchCountLabel = pitchCount ? `${abbreviateCount(pitchCount)} ` : "";

  const contributionCount = contributionDataEntries?.length;
  const contributionCountLabel = contributionCount
    ? `${abbreviateCount(contributionCount)} `
    : "";

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          {transitioning ? (
            loadingPlaceholder
          ) : (
            <>
              <StyledTabsArea>
                <StyledDivider absolute />
                <StyledTabs
                  value={tabIndex}
                  onChange={handleChange}
                  variant="fullWidth"
                >
                  <StyledTab
                    value={0}
                    label={`${pitchCountLabel}${format(tabLabels[0], {
                      count: pitchCount || 0,
                    })}`}
                  />
                  <StyledTab
                    value={1}
                    label={`${contributionCountLabel}${format(tabLabels[1], {
                      count: contributionCount || 0,
                    })}`}
                  />
                </StyledTabs>
              </StyledTabsArea>
              <StyledListArea>
                <StyledListContent>
                  {tabIndex === 0 && pitchDataEntries ? (
                    <StaticPitchList
                      compact
                      pitchDataEntries={pitchDataEntries}
                      emptyLabel={`No Kudoed Pitches`}
                      loadingPlaceholder={loadingPlaceholder}
                      offlinePlaceholder={
                        <StyledOfflineArea>
                          <StyledOfflineTypography variant="h6">{`Looks like you're offline.`}</StyledOfflineTypography>
                        </StyledOfflineArea>
                      }
                      hideAddToolbar
                      onRefresh={handleRefresh}
                    />
                  ) : tabIndex === 1 && contributionDataEntries ? (
                    <StaticContributionList
                      contributionDataEntries={contributionDataEntries}
                      emptyLabel={`No Kudoed Contributions`}
                      noMoreLabel={`That's all for now!`}
                      loadingPlaceholder={loadingPlaceholder}
                      onRefresh={handleRefresh}
                    />
                  ) : (
                    loadingPlaceholder
                  )}
                </StyledListContent>
              </StyledListArea>
            </>
          )}
        </StyledPaper>
      </StyledContainer>
    </>
  );
});

export default Kudos;
