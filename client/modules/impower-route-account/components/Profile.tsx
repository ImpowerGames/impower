import styled from "@emotion/styled";
import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Tab,
  Typography,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConfigParameters } from "../../impower-config";
import { getDataStoreKey } from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { Tabs } from "../../impower-route";
import PitchList from "../../impower-route-pitch/components/PitchList";
import Avatar from "../../impower-route/components/elements/Avatar";
import {
  UserContext,
  userDoConnect,
  userUndoConnect,
} from "../../impower-user";

const SORT_OPTIONS: ["new", "rating", "rank"] = ["new", "rating", "rank"];

const ContributionList = dynamic(
  () => import("../../impower-route-pitch/components/ContributionList"),
  { ssr: false }
);

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

const StyledDetailsArea = styled.div`
  padding: ${(props): string => props.theme.spacing(2, 1, 1, 1)};
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledUsernameTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledBioTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  margin: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledButton = styled(Button)`
  border-radius: 100px;
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

const StyledConnectArea = styled.div``;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

const StyledDivider = styled(Divider)``;

interface ProfileProps {
  config?: ConfigParameters;
  icons?: { [name: string]: SvgData };
  id: string;
  username: string;
  bio: string;
  icon: string;
  hex: string;
  isCurrentUser?: boolean;
}

const Profile = React.memo((props: ProfileProps): JSX.Element | null => {
  const { config, icons, id, username, bio, icon, hex, isCurrentUser } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { connects, my_connects, settings, isSignedIn } = userState;
  const account = settings?.account;
  const contact = account === undefined ? undefined : account?.contact || "";

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const transitioning = navigationState?.transitioning;

  const connectedFrom =
    connects !== undefined && id ? Boolean(connects?.[id]) : undefined;
  const connectedTo =
    my_connects !== undefined && id
      ? Boolean(my_connects?.[getDataStoreKey("users", id)])
      : undefined;

  const [connectedToState, setConnectedToState] = useState(connectedTo);
  const [tabIndex, setTabIndex] = useState(
    typeof window !== "undefined" &&
      window.location.search?.toLowerCase() === "?t=contributions"
      ? 1
      : 0
  );

  const [openAccountDialog] = useDialogNavigation("a");

  useEffect(() => {
    setConnectedToState(connectedTo);
  }, [connectedTo]);

  const handleConnect = useCallback(() => {
    if (!isSignedIn) {
      openAccountDialog("signup");
      return;
    }
    const newConnectedTo = !connectedToState;
    if (newConnectedTo) {
      if (!contact) {
        openAccountDialog(`contact_${id}`);
        return;
      }
      setConnectedToState(newConnectedTo);
      userDispatch(userDoConnect("users", id));
    } else {
      setConnectedToState(newConnectedTo);
      userDispatch(userUndoConnect("users", id));
    }
  }, [
    connectedToState,
    contact,
    id,
    isSignedIn,
    openAccountDialog,
    userDispatch,
  ]);

  const handleChange = useCallback(
    (e: React.ChangeEvent, value: number) => {
      setTabIndex(value);
      if (value === 0) {
        window.history.replaceState(
          window.history.state,
          "",
          `/u/${username}?t=pitches`
        );
      } else {
        window.history.replaceState(
          window.history.state,
          "",
          `/u/${username}?t=contributions`
        );
      }
    },
    [username]
  );

  const loadingPlaceholder = useMemo(
    () => (
      <StyledLoadingOverlay>
        <StyledCircularProgress color="secondary" />
      </StyledLoadingOverlay>
    ),
    []
  );

  const handleClickEditProfile = useCallback(async () => {
    navigationDispatch(navigationSetTransitioning(true));
    const router = (await import("next/router")).default;
    await router.push(`/account#profile`);
  }, [navigationDispatch]);

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          {transitioning ? (
            loadingPlaceholder
          ) : (
            <>
              <StyledDetailsArea>
                <IconButton>
                  <Avatar src={icon} alt={username} backgroundColor={hex} />
                </IconButton>
                {username && (
                  <StyledUsernameTypography variant="h5">
                    {username}
                  </StyledUsernameTypography>
                )}
                {id === null ? (
                  <StyledButton
                    variant="outlined"
                    size="large"
                    disabled
                  >{`User Doesn't Exist`}</StyledButton>
                ) : isCurrentUser === undefined ? (
                  <StyledButton
                    variant="outlined"
                    size="large"
                    disabled
                  >{`Loading`}</StyledButton>
                ) : isCurrentUser ? (
                  <StyledButton
                    variant="outlined"
                    size="large"
                    onClick={handleClickEditProfile}
                  >{`Edit Profile`}</StyledButton>
                ) : (
                  <StyledConnectArea>
                    <StyledButton
                      size="large"
                      color="secondary"
                      variant={connectedToState ? "outlined" : "contained"}
                      onClick={handleConnect}
                      disableElevation
                    >
                      {connectedToState && connectedFrom
                        ? `Connected!`
                        : connectedToState
                        ? `Requested`
                        : "Connect"}
                    </StyledButton>
                  </StyledConnectArea>
                )}
                {bio && (
                  <StyledBioTypography variant="body2">
                    {bio}
                  </StyledBioTypography>
                )}
              </StyledDetailsArea>
              {id !== null && isCurrentUser !== undefined && (
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
                    <StyledListContent>
                      {tabIndex === 0 ? (
                        <PitchList
                          config={config}
                          icons={icons}
                          creator={id}
                          sortOptions={SORT_OPTIONS}
                          compact
                          emptyLabel={`No Pitches`}
                          loadingPlaceholder={loadingPlaceholder}
                          offlinePlaceholder={
                            <StyledOfflineArea>
                              <StyledOfflineTypography variant="h6">{`Looks like you're offline.`}</StyledOfflineTypography>
                            </StyledOfflineArea>
                          }
                          hideAddToolbar
                        />
                      ) : (
                        <ContributionList
                          creator={id}
                          sortOptions={SORT_OPTIONS}
                          emptyLabel={`No Contributions`}
                          noMoreLabel={`That's all for now!`}
                          loadingPlaceholder={loadingPlaceholder}
                        />
                      )}
                    </StyledListContent>
                  </StyledListArea>
                </>
              )}
            </>
          )}
        </StyledPaper>
      </StyledContainer>
    </>
  );
});

export default Profile;
