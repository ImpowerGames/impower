import styled from "@emotion/styled";
import {
  CircularProgress,
  Divider,
  ListItem,
  ListItemButton,
  Paper,
  Tab,
} from "@material-ui/core";
import React, { useCallback, useContext, useState } from "react";
import { abbreviateAge, abbreviateCount } from "../../impower-config";
import { Tabs } from "../../impower-route";
import Avatar from "../../impower-route/components/elements/Avatar";
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

//Flex 0 - means only take up as much space as the content needs
//Flex 1 - means this element should try to take up as much space as possible
//Flex 2 - flex is a scalar relative to the other Flex elements, so if you want content to take up twice as much space, give the first Flex 1, and the bigger one Flex 2

const StyledTabsArea = styled.div`
  position: sticky;
  top: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: white;
  z-index: 1;
`;

const StyledDivider = styled(Divider)``;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledListItemButton = styled(ListItemButton)`
  max-width: 100%;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledListItem = styled(ListItem)``;

const getNotificationMessage = (type: string) => {
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
  const { notifications } = userState;
  // This is called deconstructing an object, shorthand for const notifications = userState.notifications, and allows you to create variables based on the state of multiple properties of the same Object

  //Create array of notification entries so we can iterate over it
  const notificationEntries = Object.entries(notifications || {});

  //Filter takes in an array and only returns values where the function passed into the filter returns true
  const unreadNotificationCount = notificationEntries.filter(
    ([, data]) => !data.r
  ).length;

  //define a state variable for which tab is currently selected,
  //state variables allow you to story data in memory outside the scope of the current functional component
  //initialize at zero with the useState function with parameter 0,
  //we can use the setSelectedTabIndex function to update the state value
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

  const loading = notifications === undefined;

  const unreadNotificationCountLabel = notifications
    ? `${abbreviateCount(unreadNotificationCount)} `
    : "";

  return (
    <>
      <StyledContainer>
        <StyledPaper>
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
          {loading ? (
            <StyledLoadingArea>
              <StyledCircularProgress color="secondary" />
            </StyledLoadingArea>
          ) : (
            <>
              {notificationEntries.reverse().map(([id, data]) => (
                <StyledListItem key={id} alignItems="flex-start" disablePadding>
                  <StyledListItemButton
                    onClick={(e): void => {
                      // handleClick(e, id, data);
                    }}
                  >
                    {/** Notification entries are already sorted by time accending, so need to reverse the order these are displayed*/}
                    {/* Inline declaration of a method passed in as a parameter into the map function, Shorthand for: 
              const func = ([key, value]) => (<div>{`${value.c} read: ${value.r}`}</div>) */}
                    {/** We dont want the footer to shift downwards (cummulative layout shift) suddenly when the user notifications loads*/}
                    {/** notifications || {} says if notifications returns null or undefined (falsey) use an empty object instead of the notification object*/}
                    {/** Otherwise we will error if we give the Object.entries function an undefined object*/}
                    {/** Long form is the ternary statement (notifications !== undefined && notifications !== null && notificiatons !== false  && notifications !== "" && notifications !== 0 ? notifcations : {})*/}
                    {/** Medium form is shorter ternary statement (notifications ? notifcations : {})*/}
                    <Avatar
                      alt={data?.a?.u}
                      src={data?.a?.i}
                      backgroundColor={data?.a?.h}
                    />
                    {/** value?.x is equivalent to value ? value.x : undefined*/}
                    {/** This checks whether an object is null or undefined before accessing its properties,
                     * if it is null or undefiend, return undefined for the property (which is allowed) instead of giving an error */}
                    <div>{data?.a?.u}</div>
                    <div>{getNotificationMessage(data?.type)}</div>
                    {/** Can use inline ternary statement for this switch instead of pulling this out as a method*/}
                    <div>{abbreviateAge(new Date(data?.t))}</div>
                    <div>{data?.r}</div>
                  </StyledListItemButton>
                </StyledListItem>
              ))}
            </>
          )}
        </StyledPaper>
      </StyledContainer>
    </>
  );
});

export default Notifications;
