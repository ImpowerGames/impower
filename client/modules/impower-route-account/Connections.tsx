import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  OutlinedInput,
  useMediaQuery,
} from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Tab from "@material-ui/core/Tab";
import Typography from "@material-ui/core/Typography";
import {
  AutocompleteCloseReason,
  AutocompleteInputChangeReason,
  useAutocomplete,
} from "@material-ui/unstyled/AutocompleteUnstyled";
import React, { useCallback, useContext, useMemo, useState } from "react";
import MagnifyingGlassRegularIcon from "../../resources/icons/regular/magnifying-glass.svg";
import XmarkRegularIcon from "../../resources/icons/regular/xmark.svg";
import { abbreviateAge, abbreviateCount } from "../impower-config";
import { AggData } from "../impower-data-state";
import { FontIcon } from "../impower-icon";
import { Tabs } from "../impower-route";
import Avatar from "../impower-route/components/elements/Avatar";
import { useRouter } from "../impower-router";
import { UserContext, userDoConnect } from "../impower-user";
import userRejectConnect from "../impower-user/utils/userRejectConnect";

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

const StyledHeaderTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(2, 0, 1, 0)};
  text-align: center;
`;

const StyledSearchRoot = styled.div`
  margin: ${(props): string => props.theme.spacing(2, 2, 0, 2)};
  ${(props): string => props.theme.breakpoints.down("sm")} {
    margin: ${(props): string => props.theme.spacing(2, 1, 0, 1)};
  }
  display: flex;
`;

const StyledOutlinedInput = styled(OutlinedInput)`
  flex: 1;
  & input[type="search"]::-webkit-search-decoration,
  input[type="search"]::-webkit-search-cancel-button,
  input[type="search"]::-webkit-search-results-button,
  input[type="search"]::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }
`;

const StyledList = styled(List)`
  min-height: 100%;
`;

const StyledListItemButton = styled(ListItemButton)`
  max-width: 100%;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledListItemText = styled(ListItemText)`
  & .MuiListItemText-secondary {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledIconArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledItemDivider = styled(Divider)`
  width: calc(100% - 72px);
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
const StyledListArea = styled.div(
  () => `
  flex: 1;
  position: relative;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
   `
);

const StyledEmptyTypography = styled(Typography)`
  opacity: 0.6;
`;

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(0, 0.5)};
  flex-shrink: 0;
`;

const StyledIconButton = styled(IconButton)`
  color: inherit;
  display: none;
  .Mui-focused & {
    display: inline-flex;
  }
`;

const Connections = React.memo((): JSX.Element | null => {
  const [userState, userDispatch] = useContext(UserContext);
  const [tabIndex, setTabIndex] = useState(
    typeof window !== "undefined" && window.location.search === "?t=requested"
      ? 1
      : 0
  );
  const [searchValue, setSearchValue] = useState<string>("");
  const [searchInputValue, setSearchInputValue] = useState<string>("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);

  const { connects, my_connects } = userState;

  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent, value: number) => {
      setTabIndex(value);
      if (value === 0) {
        router.replace(`?t=connected`);
      } else {
        router.replace(`?t=requested`);
      }
    },
    [router]
  );

  const connections = useMemo(
    () =>
      connects !== undefined && my_connects !== undefined
        ? Object.entries(connects || {}).filter(
            ([id]) => my_connects?.[`users%${id}`]
          )
        : undefined,
    [connects, my_connects]
  );

  const requests = useMemo(
    () =>
      connects !== undefined && my_connects !== undefined
        ? Object.entries(connects || {}).filter(
            ([id, data]) => !my_connects?.[`users%${id}`] && !data.r
          )
        : undefined,
    [connects, my_connects]
  );

  const acceptedCountLabel = connections
    ? `${abbreviateCount(connections.length)} `
    : "";

  const requestedAccountLabel = requests
    ? `${abbreviateCount(requests.length)} `
    : "";

  const handleClick = useCallback(
    async (e: React.MouseEvent, id: string, data: AggData) => {
      setLoading(true);
      await router.push(`/u/${data?.a?.u}`);
      setLoading(false);
    },
    [router]
  );

  const handleBlockRipplePropogation = useCallback(
    (e: React.MouseEvent | React.TouchEvent): void => {
      e.stopPropagation();
    },
    []
  );

  const handleIgnore = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      userDispatch(userRejectConnect("users", id));
    },
    [userDispatch]
  );

  const handleConnect = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      userDispatch(userDoConnect("users", id));
    },
    [userDispatch]
  );

  const handleInputChange = useCallback(
    (
      event: React.ChangeEvent,
      value: string,
      reason: AutocompleteInputChangeReason
    ): void => {
      if (reason === "input") {
        setSearchInputValue(value || "");
      } else if (reason === "clear") {
        setSearchInputValue(value || "");
      }
    },
    []
  );

  const handleClear = useCallback(
    (e: React.MouseEvent): void => {
      handleInputChange(e as unknown as React.ChangeEvent, "", "clear");
    },
    [handleInputChange]
  );

  const handleGetOptionLabel = useCallback((option: [string, AggData]) => {
    const [, data] = option;
    return data?.a?.u || "";
  }, []);

  const handleSearchChange = useCallback(
    async (event: React.ChangeEvent, value: string) => {
      setSearchValue(value);
    },
    []
  );

  const handleSearchOpen = useCallback(async () => {
    setSearching(true);
  }, []);

  const handleSearchClose = useCallback(
    async (
      event: React.SyntheticEvent<Element, Event>,
      reason: AutocompleteCloseReason
    ) => {
      if (reason !== "blur") {
        setSearching(false);
      }
    },
    []
  );

  const options = useMemo(
    () => (tabIndex === 0 ? connections || [] : requests || []),
    [tabIndex, connections, requests]
  );

  const { getRootProps, getInputProps, groupedOptions } = useAutocomplete({
    value: searchValue || "",
    inputValue: searchInputValue || "",
    options,
    selectOnFocus: true,
    blurOnSelect: true,
    freeSolo: true,
    clearOnBlur: true,
    open: searching,
    onOpen: handleSearchOpen,
    onClose: handleSearchClose,
    onInputChange: handleInputChange,
    onChange: handleSearchChange,
    getOptionLabel: handleGetOptionLabel,
  });

  const rootProps = getRootProps();
  const inputProps = getInputProps();

  const filteredConnections = useMemo(
    () => (searching ? (groupedOptions as [string, AggData][]) : connections),
    [connections, groupedOptions, searching]
  );
  const filteredRequests = useMemo(
    () => (searching ? (groupedOptions as [string, AggData][]) : requests),
    [requests, groupedOptions, searching]
  );

  const theme = useTheme();
  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          {loading ? (
            <StyledCircularProgressArea>
              <StyledCircularProgress color="secondary" size={32} />
            </StyledCircularProgressArea>
          ) : (
            <>
              <StyledHeaderTypography
                id="account"
                variant="h6"
              >{`Your Connections`}</StyledHeaderTypography>
              <StyledTabs
                value={tabIndex}
                onChange={handleChange}
                variant="fullWidth"
              >
                <StyledTab value={0} label={`${acceptedCountLabel}CONNECTED`} />
                <StyledTab
                  value={1}
                  label={`${requestedAccountLabel}REQUESTED`}
                />
              </StyledTabs>
              <StyledSearchRoot {...rootProps}>
                <StyledOutlinedInput
                  placeholder="Search Usernames"
                  startAdornment={
                    <StyledIconArea>
                      <FontIcon aria-label={`Search Usernames`} size={16}>
                        <MagnifyingGlassRegularIcon />
                      </FontIcon>
                    </StyledIconArea>
                  }
                  endAdornment={
                    <StyledIconButton onClick={handleClear}>
                      <FontIcon
                        aria-label={`Clear`}
                        size={16}
                        color={theme.palette.secondary.main}
                      >
                        <XmarkRegularIcon />
                      </FontIcon>
                    </StyledIconButton>
                  }
                  inputProps={{ ...inputProps, type: "search" }}
                />
              </StyledSearchRoot>
              <StyledListArea>
                {tabIndex === 0 && connections ? (
                  connections.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {filteredConnections.map(([id, data]) => (
                        <ListItem
                          key={id}
                          alignItems="flex-start"
                          disablePadding
                        >
                          <StyledListItemButton
                            onClick={(e): void => {
                              handleClick(e, id, data);
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar
                                alt={data?.a?.u}
                                src={data?.a?.i}
                                backgroundColor={data?.a?.h}
                              />
                            </ListItemAvatar>
                            <StyledListItemText
                              primary={data?.a?.u}
                              secondary={`${
                                belowSmBreakpoint ? "" : "connected with you — "
                              }${abbreviateAge(new Date(data?.t))}`}
                            />
                          </StyledListItemButton>
                          <StyledItemDivider variant="inset" absolute />
                        </ListItem>
                      ))}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">{`No connections`}</StyledEmptyTypography>
                    </>
                  )
                ) : tabIndex === 1 && requests ? (
                  requests.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {filteredRequests.map(([id, data]) => (
                        <ListItem
                          key={id}
                          alignItems="flex-start"
                          disablePadding
                        >
                          <StyledListItemButton
                            onClick={(e): void => {
                              handleClick(e, id, data);
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar
                                alt={data?.a?.u}
                                src={data?.a?.i}
                                backgroundColor={data?.a?.h}
                              />
                            </ListItemAvatar>
                            <StyledListItemText
                              primary={data?.a?.u}
                              secondary={`${
                                belowSmBreakpoint ? "" : "wants to connect — "
                              }${abbreviateAge(new Date(data?.t))}`}
                            />
                            <StyledButton
                              onMouseDown={handleBlockRipplePropogation}
                              onTouchStart={handleBlockRipplePropogation}
                              onClick={(e): void => {
                                handleIgnore(e, id);
                              }}
                            >{`Ignore`}</StyledButton>
                            <StyledButton
                              variant="outlined"
                              onMouseDown={handleBlockRipplePropogation}
                              onTouchStart={handleBlockRipplePropogation}
                              onClick={(e): void => {
                                handleConnect(e, id);
                              }}
                            >{`Connect`}</StyledButton>
                          </StyledListItemButton>
                          <StyledItemDivider variant="inset" absolute />
                        </ListItem>
                      ))}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">{`No requests`}</StyledEmptyTypography>
                    </>
                  )
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

export default Connections;
