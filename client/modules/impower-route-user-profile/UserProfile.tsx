import styled from "@emotion/styled";
import {
  Avatar,
  Button,
  Container,
  Dialog,
  DialogTitle,
  IconButton,
  Link,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Typography,
} from "@material-ui/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import LogoFlatColor from "../../resources/logos/logo-flat-color.svg";
import { AggData } from "../impower-data-state/types/interfaces/aggData";
import { VirtualizedItem } from "../impower-react-virtualization";
import { useRouter } from "../impower-router";
import { UserContext } from "../impower-user/contexts/userContext";

const StyledPaper = styled(Paper)`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(3, 4)};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(2, 2)};
    box-shadow: none;
  }
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
`;

const StyledFollowerDataTitleTypography = styled(Typography)`
  text-align: left;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledFollowerDataLink = styled(Link)`
  text-align: left;
  padding-left: ${(props): string => props.theme.spacing(2)};
  cursor: pointer;
`;

const StyledFollowerDataContainer = styled(Container)`
  padding-top: ${(props): string => props.theme.spacing(4)};
`;

const StyledFollowerDataEntryContainer = styled(Container)`
  display: flex;
`;

const StyledContainer = styled(Container)`
  padding-bottom: ${(props): string => props.theme.spacing(4)};
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StyledLogo = styled(LogoFlatColor as any)`
  width: 56px;
  height: 56px;
`;
StyledLogo.displayName = "StyledLogo";

interface LinkedUserData {
  username?: string;
  icon?: string;
  hex?: string;
}

interface FollowerDataLinkProps {
  data: LinkedUserData[];
  onClick: () => void;
}

const FollowerDataLink = React.memo(
  (props: FollowerDataLinkProps): JSX.Element | null => {
    const { data, onClick } = props;
    const maxNamesToDisplay = 3;

    if (!data || data.length === 0) {
      return <StyledFollowerDataLink>No one</StyledFollowerDataLink>;
    }
    let nameString = data[0].username;

    // Construct the link string with usernames using various limit combinations.
    if (data.length === 1) {
      nameString = data[0].username;
    } else if (data.length === 2) {
      nameString = data[0].username;
      nameString += ` and ${data[1].username}`;
    } else {
      nameString = data[0].username;
      for (
        let i = 1;
        i < maxNamesToDisplay - 2 || i < data.length - 2;
        i += 1
      ) {
        nameString += `, ${data[i].username}`;
      }

      if (data.length < maxNamesToDisplay) {
        nameString += `, and ${data[data.length - 1].username}`;
      } else if (data.length === maxNamesToDisplay) {
        nameString += `, ${data[data.length - 2].username}, and ${
          data[data.length - 1].username
        }`;
      } else {
        const lastNameIndex = data.length - maxNamesToDisplay + 1;
        nameString += `, ${data[lastNameIndex].username} and ${lastNameIndex} more`;
      }
    }
    return (
      <StyledFollowerDataLink onClick={onClick}>
        {nameString}
      </StyledFollowerDataLink>
    );
  }
);

interface UserProfileFormProps {
  username: string;
  bio: string;
}

const UserProfileForm = React.memo(
  (props: UserProfileFormProps): JSX.Element | null => {
    const { username, bio } = props;
    return (
      <StyledContainer maxWidth="sm">
        <StyledTitleTypography variant="h5">{username}</StyledTitleTypography>
        <StyledTitleTypography variant="body2">{bio}</StyledTitleTypography>
      </StyledContainer>
    );
  }
);

interface LinkedUserDataDialogProps {
  onClose: () => void;
  open: boolean;
  data: LinkedUserData[];
  header: string;
}

function LinkedUserDataDialog(props: LinkedUserDataDialogProps): JSX.Element {
  const { onClose, data, header, open } = props;
  const router = useRouter();
  const itemSize = 64;

  if (!data) {
    return <></>;
  }

  const handleClose = (): void => {
    onClose();
  };

  const handleListItemClick = (username: string): void => {
    handleClose();
    router.push(`/u/${username}`);
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>{header}</DialogTitle>
      {data.map((d, index) => {
        const username = d?.username;
        const icon = d?.icon;
        const hex = d?.hex;
        return (
          <VirtualizedItem key={username} index={index} minHeight={itemSize}>
            <ListItem
              button
              onClick={(): void => handleListItemClick(username)}
            >
              <ListItemAvatar>
                <Avatar src={icon} alt={username} sx={{ bgcolor: hex }}>
                  {username?.[0]?.toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={username} />
            </ListItem>
          </VirtualizedItem>
        );
      })}
    </Dialog>
  );
}

interface UserProfileProps {
  username: string;
  bio: string;
  icon: string;
  hex: string;
  canEdit?: boolean;
}

const UserProfile = React.memo(
  (props: UserProfileProps): JSX.Element | null => {
    const { username, bio, icon, hex, canEdit } = props;
    const router = useRouter();
    const [userState] = useContext(UserContext);
    const timeLoaded = useMemo(() => new Date().getTime(), []);
    const [popupDisplayed, setPopupDisplayed] = useState<boolean>(false);
    const [followers, setFollowers] = useState<LinkedUserData[]>();
    const [following, setFollowing] = useState<LinkedUserData[]>();
    const [connections, setConnections] = useState<LinkedUserData[]>();
    const [popupHeader, setPopupHeader] = useState<string>();
    const [popupData, setPopupData] = useState<LinkedUserData[]>();

    const k_myFollowersLabel = "My Followers";
    const k_myFollowingLabel = "I'm Following";
    const k_myConnectionsLabel = "My Connections";

    const handleFollowers = useCallback(async (): Promise<void> => {
      const { uid } = userState;
      if (!uid) {
        return;
      }
      const DataStateRead = (
        await import("../impower-data-state/classes/dataStateRead")
      ).default;
      const snapshot = await new DataStateRead(
        "users",
        uid,
        "agg",
        "follows",
        "data"
      ).get();
      const data: { [id: string]: AggData } = snapshot.val();
      if (!data) {
        return;
      }
      const followerData = [];
      Object.values(data)?.forEach((element) => {
        if (element.a) {
          const elementData: LinkedUserData = {
            username: element.a.u,
            icon: element.a.i,
            hex: element.a.h,
          };
          followerData.push(elementData);
        }
      });
      setFollowers(followerData);
    }, [userState]);

    const handleFollowing = useCallback(async (): Promise<void> => {
      const { uid } = userState;
      if (!uid) {
        return;
      }
      const DataStateRead = (
        await import("../impower-data-state/classes/dataStateRead")
      ).default;
      const snapshot = await new DataStateRead(
        "users",
        uid,
        "agg",
        "my_follows",
        "data"
      ).get();
      const data: { [id: string]: AggData } = snapshot.val();
      if (!data) {
        return;
      }
      const followingData = [];
      Object.values(data)?.forEach((element) => {
        if (element.a) {
          const elementData: LinkedUserData = {
            username: element.a.u,
            icon: element.a.i,
            hex: element.a.h,
          };
          followingData.push(elementData);
        }
      });
      setFollowing(followingData);
    }, [userState]);

    const handleConnections = useCallback(async (): Promise<void> => {
      const { uid } = userState;
      if (!uid) {
        return;
      }
      const DataStateRead = (
        await import("../impower-data-state/classes/dataStateRead")
      ).default;
      const snapshot = await new DataStateRead(
        "users",
        uid,
        "agg",
        "connects",
        "data"
      ).get();
      const data: { [id: string]: AggData } = snapshot.val();
      if (!data) {
        return;
      }
      const connectionData = [];
      Object.values(data)?.forEach((element) => {
        if (element.a) {
          const elementData: LinkedUserData = {
            username: element.a.u,
            icon: element.a.i,
            hex: element.a.h,
          };
          connectionData.push(elementData);
        }
      });
      setConnections(connectionData);
    }, [userState]);

    useEffect(() => {
      if (canEdit && timeLoaded) {
        handleFollowers();
        handleFollowing();
        handleConnections();
      }
    }, [
      timeLoaded,
      canEdit,
      handleFollowers,
      handleFollowing,
      handleConnections,
    ]);

    const displayPopup = (data: LinkedUserData[], header: string): void => {
      setPopupDisplayed(true);
      setPopupData(data);
      setPopupHeader(header);
    };

    const handleUserProfileEdit = (): void => {
      router.push(`/profile`);
    };

    const handleFollowerClick = (): void => {
      displayPopup(followers, k_myFollowersLabel);
    };

    const handleFollowingClick = (): void => {
      displayPopup(following, k_myFollowingLabel);
    };

    const handleConnectedClick = (): void => {
      displayPopup(connections, k_myConnectionsLabel);
    };

    const handleClose = (): void => {
      setPopupDisplayed(false);
    };

    const RenderMyFollowData = (): JSX.Element => {
      return (
        <StyledFollowerDataContainer maxWidth="sm">
          <StyledFollowerDataEntryContainer>
            <StyledFollowerDataTitleTypography variant="body2">
              {k_myFollowersLabel}:
            </StyledFollowerDataTitleTypography>
            <FollowerDataLink data={followers} onClick={handleFollowerClick} />
          </StyledFollowerDataEntryContainer>
          <StyledFollowerDataEntryContainer>
            <StyledFollowerDataTitleTypography variant="body2">
              {k_myFollowingLabel}:
            </StyledFollowerDataTitleTypography>
            <FollowerDataLink data={following} onClick={handleFollowingClick} />
          </StyledFollowerDataEntryContainer>
          <StyledFollowerDataEntryContainer>
            <StyledFollowerDataTitleTypography variant="body2">
              {k_myConnectionsLabel}:
            </StyledFollowerDataTitleTypography>
            <FollowerDataLink
              data={connections}
              onClick={handleConnectedClick}
            />
          </StyledFollowerDataEntryContainer>
        </StyledFollowerDataContainer>
      );
    };

    return (
      <StyledPaper>
        <IconButton>
          <Avatar src={icon} alt={username} sx={{ bgcolor: hex }}>
            {username?.[0]?.toUpperCase()}
          </Avatar>
        </IconButton>
        <UserProfileForm username={username} bio={bio} />
        {canEdit && (
          <Button variant="contained" onClick={handleUserProfileEdit}>
            Edit
          </Button>
        )}
        {canEdit && RenderMyFollowData()}
        <LinkedUserDataDialog
          data={popupData}
          header={popupHeader}
          open={popupDisplayed}
          onClose={handleClose}
        />
      </StyledPaper>
    );
  }
);

export default UserProfile;
