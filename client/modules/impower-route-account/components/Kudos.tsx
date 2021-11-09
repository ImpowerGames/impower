import styled from "@emotion/styled";
import { CircularProgress, Divider, Typography } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Tab from "@material-ui/core/Tab";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { NavigationContext } from "../../impower-navigation";
import { Tabs } from "../../impower-route";
import StaticContributionList from "../../impower-route-pitch/components/StaticContributionList";
import StaticPitchList from "../../impower-route-pitch/components/StaticPitchList";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";

const StyledContainer = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledPaper = styled(Paper)`
  flex: 1;
  padding: 0;
  width: 100%;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  border-radius: 0;

  ${(props): string => props.theme.breakpoints.down("sm")} {
    box-shadow: none;
  }
  display: flex;
  flex-direction: column;
`;

const StyledTabsArea = styled.div`
  position: sticky;
  top: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: white;
  z-index: 1;
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledLoadingArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgressArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

const StyledListArea = styled.div`
  flex: 1;
  position: relative;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
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

const Kudos = React.memo((): JSX.Element | null => {
  const [navigationState] = useContext(NavigationContext);
  const transitioning = navigationState?.transitioning;
  const [userState] = useContext(UserContext);
  const [tabIndex, setTabIndex] = useState(
    typeof window !== "undefined" && window.location.search === "?t=requested"
      ? 1
      : 0
  );
  const [pitchKeys, setPitchKeys] = useState<string[]>();
  const [contributionKeys, setContributionKeys] = useState<string[]>();

  const { my_kudos } = userState;

  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent, value: number) => {
      setTabIndex(value);
      if (value === 0) {
        router.replace(`?t=pitches`);
      } else {
        router.replace(`?t=contributions`);
      }
    },
    [router]
  );

  useEffect(() => {
    if (my_kudos === undefined) {
      return;
    }
    if (pitchKeys || contributionKeys) {
      return;
    }
    const newPitchKeys = [];
    const newContributionKeys = [];
    Object.keys(my_kudos || {})
      .reverse()
      .forEach((key) => {
        const path = key.split("%");
        const targetCollection = path[path.length - 2];
        const targetId = path[path.length - 1];
        if (targetCollection?.startsWith("pitched_")) {
          newPitchKeys.push(targetId);
        }
        if (targetCollection === "contributions") {
          const pitchId = path[path.length - 3];
          newContributionKeys.push(`${pitchId}%${targetId}`);
        }
      });
    setPitchKeys(newPitchKeys);
    setContributionKeys(newContributionKeys);
  }, [contributionKeys, my_kudos, pitchKeys]);

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          {transitioning ? (
            <StyledLoadingArea>
              <StyledCircularProgress color="secondary" size={32} />
            </StyledLoadingArea>
          ) : (
            <>
              <StyledTabsArea>
                <StyledDivider absolute />
                <StyledTabs
                  value={tabIndex}
                  onChange={handleChange}
                  variant="fullWidth"
                >
                  <StyledTab value={0} label={`PITCHES`} />
                  <StyledTab value={1} label={`CONTRIBUTIONS`} />
                </StyledTabs>
              </StyledTabsArea>
              <StyledListArea>
                {tabIndex === 0 && pitchKeys ? (
                  <StaticPitchList
                    compact
                    pitchKeys={pitchKeys}
                    emptyLabel={`No Pitches`}
                    loadingPlaceholder={
                      <StyledLoadingArea>
                        <StyledCircularProgress color="secondary" size={32} />
                      </StyledLoadingArea>
                    }
                    offlinePlaceholder={
                      <StyledOfflineArea>
                        <StyledOfflineTypography variant="h6">{`Looks like you're offline.`}</StyledOfflineTypography>
                      </StyledOfflineArea>
                    }
                  />
                ) : tabIndex === 1 && contributionKeys ? (
                  <StaticContributionList
                    contributionKeys={contributionKeys}
                    emptyLabel={`No Contributions`}
                    noMoreLabel={`That's all for now!`}
                  />
                ) : (
                  <StyledCircularProgressArea>
                    <StyledCircularProgress color="secondary" size={32} />
                  </StyledCircularProgressArea>
                )}
              </StyledListArea>
            </>
          )}
        </StyledPaper>
      </StyledContainer>
    </>
  );
});

export default Kudos;
