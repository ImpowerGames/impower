import styled from "@emotion/styled";
import {
  Button,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Tab,
  Typography,
  useMediaQuery,
} from "@material-ui/core";
import React, { useCallback, useContext, useMemo, useState } from "react";
import { useTheme } from "@emotion/react";
import { abbreviateAge, abbreviateCount } from "../../impower-config";
import { Tabs } from "../../impower-route";
import Avatar from "../../impower-route/components/elements/Avatar";
import { useRouter } from "../../impower-router";
import { UserContext, userReadNotification } from "../../impower-user";
import BellSolidIcon from "../../../resources/icons/solid/bell.svg";
import ExclamationSolidIcon from "../../../resources/icons/solid/exclamation.svg";
import CircleExclamationSolidIcon from "../../../resources/icons/solid/circle-exclamation.svg";
import { AggData } from "../../impower-data-state";
import ConnectionListItem from "./ConnectionListItem";

import { FontIcon } from "../../impower-icon";

// const DataStateWrite = (
//     await import("../../impower-data-state/classes/dataStateWrite")
//   ).default;
//   await Promise.all([
//     ...Object.entries(unreadNotifications).map(([id]) =>
//       new DataStateWrite(
//         "users",
//         uid,
//         "notifications",
//         "data",
//         id,
//         "r"
//       ).set(true)
//     ),
//   ]);

const nsfwLabel = "18+";
const removedLabel = "!";

const StyledContainer = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledDescriptionTextArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledNotificationCircle = styled.div`
  border-radius: 50%;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-width: ${(props): string => props.theme.spacing(5)};
  min-height: ${(props): string => props.theme.spacing(5)};
  width: ${(props): string => props.theme.spacing(5)};
  height: ${(props): string => props.theme.spacing(5)};
  max-width: ${(props): string => props.theme.spacing(5)};
  max-height: ${(props): string => props.theme.spacing(5)};
  margin-right: ${(props): string => props.theme.spacing(2)};
  color: white;
  font-weight: 700;
`;

const StyledPaper = styled(Paper)`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(2, 4, 0, 4)};
  width: 100%;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  border-radius: 0;

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(1, 0, 0, 0)};
    box-shadow: none;
  }
  display: flex;
  flex-direction: column;
`;

const StyledLoadingArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

// Flex 0 - means only take up as much space as the content needs
// Flex 1 - means this element should try to take up as much space as possible
// Flex 2 - flex is a scalar relative to the other Flex elements, so if you want content to take up twice as much space, give the first Flex 1, and the bigger one Flex 2

const StyledTabsArea = styled.div`
  position: sticky;
  top: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: white;
  z-index: 1;
`;

const StyledDivider = styled(Divider)``;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledListArea = styled.div`
  flex: 1;
  position: relative;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledList = styled(List)`
  min-height: 100%;
`;

const StyledEmptyTypography = styled(Typography)`
  opacity: 0.6;
`;

const StyledListItemButton = styled(ListItemButton)`
  max-width: 100%;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledListItem = styled(ListItem)``;

const StyledListItemText = styled(ListItemText)`
  & .MuiTypography-root {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const StyledItemDivider = styled(Divider)`
  width: calc(100% - 72px);
`;

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(0, 0.5)};
  flex-shrink: 0;
  min-width: 0;
`;

interface NotificationListItemIconProps {
  notificationData: AggData;
}

const NotificationListItemIcon = React.memo(
  (props: NotificationListItemIconProps): JSX.Element | null => {
    const { notificationData } = props;
    const theme = useTheme();
    if (notificationData.type === "flagged") {
      if (notificationData?.removed) {
        return (
          <StyledNotificationCircle
            style={{
              backgroundColor: "red",
            }}
          >
            {removedLabel}
          </StyledNotificationCircle>
        );
      }
      if (notificationData?.nsfw) {
        return (
          <StyledNotificationCircle
            style={{
              backgroundColor: "black",
            }}
          >
            {nsfwLabel}
          </StyledNotificationCircle>
        );
      }
      return (
        <ListItemAvatar>
          <Avatar backgroundColor={"black"} />
        </ListItemAvatar>
      );
    }
    return null;
  }
);

interface NotificationListItemSecondaryTextProps {
  notificationData: AggData;
  notificationStatus: "read" | "unread";
}

const NotificationListItemSecondaryText = React.memo(
  (props: NotificationListItemSecondaryTextProps): JSX.Element | null => {
    const { notificationData, notificationStatus } = props;

    const theme = useTheme();
    const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

    if (notificationData?.type === "flagged" && notificationData?.removed) {
      return (
        <StyledDescriptionTextArea
          style={{
            color:
              notificationStatus === "unread"
                ? theme.palette.secondary.main
                : undefined,
            fontWeight: notificationStatus === "unread" ? 600 : undefined,
          }}
        >
          {`${belowSmBreakpoint ? "" : "was removed — "}${abbreviateAge(
            new Date(notificationData?.t)
          )}`}
        </StyledDescriptionTextArea>
      );
    }

    if (notificationData?.type === "flagged" && notificationData?.nsfw) {
      return (
        <StyledDescriptionTextArea
          style={{
            color:
              notificationStatus === "unread"
                ? theme.palette.secondary.main
                : undefined,
            fontWeight: notificationStatus === "unread" ? 600 : undefined,
          }}
        >
          {`${belowSmBreakpoint ? "" : "was marked NSFW — "}${abbreviateAge(
            new Date(notificationData?.t)
          )}`}
        </StyledDescriptionTextArea>
      );
    }

    return null;
  }
);

interface NotificationListItemButtonProps {
  notificationData: AggData;
}

const NotificationListItemButtons = React.memo(
  (props: NotificationListItemButtonProps): JSX.Element | null => {
    const { notificationData } = props;

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    if (notificationData?.type === "flagged" && notificationData?.removed) {
      return (
        <StyledButton
          variant="outlined"
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
          onClick={handleBlockRipplePropogation}
        >
          {`WHY?`}
        </StyledButton>
      );
    }
    if (notificationData?.type === "flagged" && notificationData?.nsfw) {
      return (
        <StyledButton
          variant="outlined"
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
          onClick={handleBlockRipplePropogation}
        >
          {`WHY?`}
        </StyledButton>
      );
    }
    return null;
  }
);

interface NotificationListItemProps {
  uid: string;
  notificationData: AggData;
  connectFromData: AggData;
  connectToData: AggData;
  onLoading?: (isLoading: boolean) => void;
}

const NotificationListItem = React.memo(
  (props: NotificationListItemProps): JSX.Element | null => {
    const { uid, notificationData, connectFromData, connectToData, onLoading } =
      props;

    const theme = useTheme();

    const [, userDispatch] = useContext(UserContext);

    const router = useRouter();

    const handleClick = useCallback(
      async (e: React.MouseEvent, id: string, data: AggData) => {
        //if (data?.type === "flagged" && data?.r) {
        //  userDispatch(userReadNotification("flagged", data?.id , uid));
        //}
        onLoading?.(true);
        await router.push(`/p/${data?.id}`);
        onLoading?.(false);
      },
      [onLoading, router]
    );

    if (notificationData?.type === "connects") {
      return (
        <ConnectionListItem
          id={uid}
          data={connectFromData}
          connectStatus={connectToData ? "connected" : "incoming"}
          notificationStatus={notificationData?.r ? "read" : "unread"}
          displayReadStatus={true}
          onLoading={onLoading}
        />
      );
    }
    if (notificationData?.type === "flagged") {
      return (
        <StyledListItem
          style={{
            backgroundColor: notificationData?.r
              ? theme.palette.grey[100]
              : undefined,
          }}
          alignItems="flex-start"
          disablePadding
        >
          <StyledListItemButton
            onClick={(e): void => {
              handleClick(e, uid, notificationData);
            }}
          >
            <NotificationListItemIcon notificationData={notificationData} />
            <StyledListItemText
              primary={`Your Pitch: ${notificationData?.n}`}
              secondary={
                <NotificationListItemSecondaryText
                  notificationData={notificationData}
                  notificationStatus={notificationData?.r ? "read" : "unread"}
                />
              }
            />
            <NotificationListItemButtons notificationData={notificationData} />
          </StyledListItemButton>
          <StyledItemDivider variant="inset" absolute />
        </StyledListItem>
      );
    }
    return null;
  }
);

// Looping though an array: .map(x => x)
// Looping through an array of objects: .map((x) => '${x.variable1}, ${x.variable2}')
// Text needs to be wrapped in a div
const Notifications = React.memo(() => {
  // Grab userState from User Context Provider (Global Context) becasue  we need data about the user
  const [userState] = useContext(UserContext);

  // Specifically we need the notifications from the userState
  const { connects, my_connects, notifications } = userState;
  // This is called deconstructing an object, shorthand for const notifications = userState.notifications, and allows you to create variables based on the state of multiple properties of the same Object

  const [transitioning, setTransitioning] = useState(false);

  // Create array of notification entries so we can iterate over it
  const notificationEntries = Object.entries(notifications || {});

  // Filter takes in an array and only returns values where the function passed into the filter returns true
  const unreadNotifications = notificationEntries.filter(([, data]) => !data.r);

  // define a state variable for which tab is currently selected,
  // state variables allow you to story data in memory outside the scope of the current functional component
  // initialize at zero with the useState function with parameter 0,
  // we can use the setSelectedTabIndex function to update the state value
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const router = useRouter();

  // useCallback caches a function outside of the scope of the current functional component,
  // we tell it not to allocate a new function in memory unless the object in the dependency array has changed
  // in this case, the only dependency is the router (which controls the site url)
  const handleChange = useCallback(
    (e: React.ChangeEvent, value: number) => {
      setSelectedTabIndex(value);
      if (value === 0) {
        router.replace(`?t=all`);
      } else {
        router.replace(`?t=unread`);
      }
    },
    [router]
  );

  const unreadNotificationCountLabel = notifications
    ? `${abbreviateCount(unreadNotifications.length)} `
    : "";

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          {/** If notifications haven't loaded yet, show loading circle */}
          {transitioning ? (
            <StyledLoadingArea>
              <StyledCircularProgress color="secondary" />
            </StyledLoadingArea>
          ) : (
            <>
              <StyledTabsArea>
                <StyledDivider absolute />
                <StyledTabs
                  value={selectedTabIndex}
                  onChange={handleChange}
                  variant="fullWidth"
                >
                  <StyledTab value={0} label={`ALL`} />
                  <StyledTab
                    value={1}
                    label={`${unreadNotificationCountLabel}UNREAD`}
                  />
                </StyledTabs>
              </StyledTabsArea>
              <StyledListArea>
                {selectedTabIndex === 0 && notifications ? (
                  notificationEntries.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {notificationEntries.reverse().map(([id, data]) => {
                        const parts = id.split("%");
                        const uid = parts[parts.length - 1];
                        const connectToID = `users%${uid}`;
                        return (
                          <NotificationListItem
                            key={uid}
                            uid={uid}
                            notificationData={data}
                            connectFromData={connects?.[uid]}
                            connectToData={my_connects?.[connectToID]}
                            onLoading={setTransitioning}
                          />
                        );
                      })}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">
                        {`No Notifications`}
                      </StyledEmptyTypography>
                    </>
                  )
                ) : selectedTabIndex === 1 && notifications ? (
                  unreadNotifications.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {unreadNotifications.reverse().map(([id, data]) => {
                        const parts = id.split("%");
                        const uid = parts[parts.length - 1];
                        const connectToID = `users%${uid}`;
                        return (
                          <NotificationListItem
                            key={uid}
                            uid={uid}
                            notificationData={data}
                            connectFromData={connects?.[uid]}
                            connectToData={my_connects?.[connectToID]}
                            onLoading={setTransitioning}
                          />
                        );
                      })}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">
                        {`No New Notifications`}
                      </StyledEmptyTypography>
                    </>
                  )
                ) : (
                  <StyledLoadingArea>
                    <StyledCircularProgress color="secondary" />
                  </StyledLoadingArea>
                )}
              </StyledListArea>
            </>
          )}
        </StyledPaper>
      </StyledContainer>
    </>
  );
});

export default Notifications;
