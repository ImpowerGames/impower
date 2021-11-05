import styled from "@emotion/styled";
import {
  Avatar,
  Button,
  IconButton,
  Paper,
  Tab,
  Typography,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { ConfigParameters } from "../impower-config";
import { getDataStoreKey, ProjectDocument } from "../impower-data-store";
import { SvgData } from "../impower-icon";
import { Fallback, Tabs } from "../impower-route";
import PitchList from "../impower-route-pitch/components/PitchList";
import { UserContext, userDoConnect, userUndoConnect } from "../impower-user";

const SORT_OPTIONS: ["new", "rating", "rank"] = ["new", "rating", "rank"];

const ContributionList = dynamic(
  () => import("../impower-route-pitch/components/ContributionList"),
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

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledLoadingArea = styled.div`
  display: flex;
  flex-direction: column;
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

interface ProfileProps {
  config?: ConfigParameters;
  icons?: { [name: string]: SvgData };
  id: string;
  username: string;
  bio: string;
  icon: string;
  hex: string;
  isCurrentUser?: boolean;
  pitchDocs?: { [id: string]: ProjectDocument };
}

const Profile = React.memo((props: ProfileProps): JSX.Element | null => {
  const {
    config,
    icons,
    id,
    username,
    bio,
    icon,
    hex,
    isCurrentUser,
    pitchDocs,
  } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { connects, my_connects } = userState;

  const connectedFrom =
    connects !== undefined && id ? Boolean(connects?.[id]) : undefined;
  const connectedTo =
    my_connects !== undefined && id
      ? Boolean(my_connects?.[getDataStoreKey("users", id)])
      : undefined;

  const [connectedToState, setConnectedToState] = useState(connectedTo);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    setConnectedToState(connectedTo);
  }, [connectedTo]);

  const handleConnect = useCallback(() => {
    const newConnectedTo = !connectedToState;
    setConnectedToState(newConnectedTo);
    if (newConnectedTo) {
      userDispatch(userDoConnect("users", id));
    } else {
      userDispatch(userUndoConnect("users", id));
    }
  }, [connectedToState, id, userDispatch]);

  const handleChange = useCallback((e: React.ChangeEvent, value: number) => {
    setTabIndex(value);
  }, []);

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          <StyledDetailsArea>
            <IconButton>
              <Avatar src={icon} alt={username} sx={{ bgcolor: hex }}>
                {username?.[0]?.toUpperCase()}
              </Avatar>
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
              <StyledButton
                variant="outlined"
                size="large"
                color={connectedToState ? "inherit" : undefined}
                onClick={handleConnect}
              >
                {connectedToState && connectedFrom
                  ? `Connected!`
                  : connectedToState
                  ? `Requested`
                  : "Connect"}
              </StyledButton>
            )}
            {bio && (
              <StyledBioTypography variant="body2">{bio}</StyledBioTypography>
            )}
          </StyledDetailsArea>
          {id !== null && isCurrentUser !== undefined && (
            <>
              <StyledTabs
                value={tabIndex}
                onChange={handleChange}
                variant="fullWidth"
              >
                <StyledTab value={0} label={`Pitches`} />
                <StyledTab value={1} label={`Contributions`} />
              </StyledTabs>
              {tabIndex === 0 ? (
                <PitchList
                  config={config}
                  icons={icons}
                  pitchDocs={pitchDocs}
                  creator={id}
                  sortOptions={SORT_OPTIONS}
                  compact
                  emptyLabel={`No Pitches`}
                  searchingPlaceholder={
                    <StyledLoadingArea>
                      <Fallback disableShrink />
                    </StyledLoadingArea>
                  }
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
                />
              )}
            </>
          )}
        </StyledPaper>
      </StyledContainer>
    </>
  );
});

export default Profile;
