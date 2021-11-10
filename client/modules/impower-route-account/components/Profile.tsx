import styled from "@emotion/styled";
import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Tab,
  Typography,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import NextLink from "next/link";
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
  position: sticky;
  top: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: white;
  z-index: 1;
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledLoadingArea = styled.div`
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

  const [navigationState] = useContext(NavigationContext);
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
      <StyledLoadingArea>
        <StyledCircularProgress disableShrink color="inherit" size={48} />
      </StyledLoadingArea>
    ),
    []
  );

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
                  <NextLink href={`/account#profile`} passHref prefetch={false}>
                    <StyledButton
                      variant="outlined"
                      size="large"
                    >{`Edit Profile`}</StyledButton>
                  </NextLink>
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
