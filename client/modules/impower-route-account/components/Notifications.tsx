import styled from "@emotion/styled";
import {
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemButton,
  Paper,
  Tab,
  Typography,
} from "@material-ui/core";
import React, { useCallback, useContext, useMemo, useState } from "react";
import { abbreviateAge, abbreviateCount } from "../../impower-config";
import { Tabs } from "../../impower-route";
import Avatar from "../../impower-route/components/elements/Avatar";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import BellSolidIcon from "../../../resources/icons/solid/bell.svg";
import { AggData } from "../../impower-data-state";
import ConnectionListItem from "./ConnectionListItem";

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

const StyledContainer = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
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

const StyledItemDivider = styled(Divider)`
  width: calc(100% - 72px);
`;

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

    if (notificationData.type === "connects") {
      return (
        <ConnectionListItem
          id={uid}
          data={connectFromData}
          connectStatus={connectToData ? "connected" : "incoming"}
          notificationStatus={notificationData?.r ? "read" : "unread"}
          onLoading={onLoading}
        />
      );
    }

    return null;
  }
);

const getNotificationMessage = (type: string): string => {
  if (type === "connects") {
    return "wants to connect";
  }
  if (type === "follows") {
    return "followed you";
  }
  return "";
};

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

  const connections = useMemo(
    () =>
      connects !== undefined && my_connects !== undefined
        ? Object.entries(connects || {}).filter(
            ([id]) => my_connects?.[`users%${id}`]
          )
        : undefined,
    [connects, my_connects]
  );

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
