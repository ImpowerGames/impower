import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  CircularProgress,
  Divider,
  IconButton,
  List,
  OutlinedInput,
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
import MagnifyingGlassRegularIcon from "../../../resources/icons/regular/magnifying-glass.svg";
import XmarkRegularIcon from "../../../resources/icons/regular/xmark.svg";
import { abbreviateCount } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import { FontIcon } from "../../impower-icon";
import { Tabs } from "../../impower-route";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import ConnectionListItem from "./ConnectionListItem";

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

const StyledTabsArea = styled.div`
  position: sticky;
  top: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: white;
  z-index: 1;
`;

const StyledTabs = styled(Tabs)``;

const StyledTab = styled(Tab)``;

const StyledIconArea = styled.div`
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

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
  align-items: center;
  justify-content: center;
`;

const StyledEmptyTypography = styled(Typography)`
  opacity: 0.6;
`;

const StyledIconButton = styled(IconButton)`
  color: inherit;
  display: none;
  .Mui-focused & {
    display: inline-flex;
  }
`;

const StyledDivider = styled(Divider)``;

const Connections = React.memo((): JSX.Element | null => {
  const [userState] = useContext(UserContext);
  const [tabIndex, setTabIndex] = useState(
    typeof window !== "undefined" &&
      window.location.search?.toLowerCase() === "?t=outgoing"
      ? 2
      : typeof window !== "undefined" &&
        window.location.search?.toLowerCase() === "?t=incoming"
      ? 1
      : 0
  );
  const [filterValue, setFilterValue] = useState<string>("");
  const [filterInputValue, setFilterInputValue] = useState<string>("");
  const [filtering, setFiltering] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const { connects, my_connects } = userState;

  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent, value: number) => {
      setTabIndex(value);
      if (value === 0) {
        router.replace(`?t=connected`);
      } else if (value === 1) {
        router.replace(`?t=incoming`);
      } else {
        router.replace(`?t=outgoing`);
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

  const incomingRequests = useMemo(
    () =>
      connects !== undefined && my_connects !== undefined
        ? Object.entries(connects || {}).filter(
            ([id, data]) => !my_connects?.[`users%${id}`] && !data.r
          )
        : undefined,
    [connects, my_connects]
  );

  const outgoingRequests = useMemo(
    () =>
      connects !== undefined && my_connects !== undefined
        ? Object.entries(my_connects || {})
            .map(([key, data]): [string, AggData] => [key.split("%")[1], data])
            .filter(([id, data]) => !connects?.[id] && !data.r)
        : undefined,
    [connects, my_connects]
  );

  const acceptedCountLabel = connections
    ? `${abbreviateCount(connections.length)} `
    : "";

  const incomingRequestsCountLabel = incomingRequests
    ? `${abbreviateCount(incomingRequests.length)} `
    : "";

  const outgoingRequestsCountLabel = outgoingRequests
    ? `${abbreviateCount(outgoingRequests.length)} `
    : "";

  const handleInputChange = useCallback(
    (
      event: React.ChangeEvent,
      value: string,
      reason: AutocompleteInputChangeReason
    ): void => {
      if (reason === "input") {
        setFilterInputValue(value || "");
      } else if (reason === "clear") {
        setFilterInputValue(value || "");
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
      setFilterValue(value);
    },
    []
  );

  const handleSearchOpen = useCallback(async () => {
    setFiltering(true);
  }, []);

  const handleSearchClose = useCallback(
    async (
      event: React.SyntheticEvent<Element, Event>,
      reason: AutocompleteCloseReason
    ) => {
      if (reason !== "blur") {
        setFiltering(false);
      }
    },
    []
  );

  const options = useMemo(
    () =>
      tabIndex === 0
        ? connections || []
        : tabIndex === 1
        ? incomingRequests || []
        : outgoingRequests || [],
    [tabIndex, connections, incomingRequests, outgoingRequests]
  );

  const { getRootProps, getInputProps, groupedOptions } = useAutocomplete({
    value: filterValue || "",
    inputValue: filterInputValue || "",
    options,
    selectOnFocus: true,
    blurOnSelect: true,
    freeSolo: true,
    clearOnBlur: true,
    open: filtering,
    onOpen: handleSearchOpen,
    onClose: handleSearchClose,
    onInputChange: handleInputChange,
    onChange: handleSearchChange,
    getOptionLabel: handleGetOptionLabel,
  });

  const rootProps = getRootProps();
  const inputProps = getInputProps();

  const filteredConnections = useMemo(
    () => (filtering ? (groupedOptions as [string, AggData][]) : connections),
    [connections, groupedOptions, filtering]
  );
  const filteredIncomingRequests = useMemo(
    () =>
      filtering ? (groupedOptions as [string, AggData][]) : incomingRequests,
    [incomingRequests, groupedOptions, filtering]
  );
  const filteredOutgoingRequests = useMemo(
    () =>
      filtering ? (groupedOptions as [string, AggData][]) : outgoingRequests,
    [outgoingRequests, groupedOptions, filtering]
  );

  const theme = useTheme();

  const showSearchbar =
    (tabIndex === 0 && connections?.length > 0) ||
    (tabIndex === 1 && incomingRequests?.length > 0) ||
    (tabIndex === 2 && outgoingRequests?.length > 0);

  return (
    <>
      <StyledContainer>
        <StyledPaper>
          {transitioning ? (
            <StyledLoadingArea>
              <StyledCircularProgress color="secondary" />
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
                  <StyledTab
                    value={0}
                    label={`${acceptedCountLabel}CONNECTED`}
                  />
                  <StyledTab
                    value={1}
                    label={`${incomingRequestsCountLabel}INCOMING`}
                  />
                  <StyledTab
                    value={2}
                    label={`${outgoingRequestsCountLabel}OUTGOING`}
                  />
                </StyledTabs>
              </StyledTabsArea>
              {showSearchbar && (
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
              )}
              <StyledListArea>
                {tabIndex === 0 && connections ? (
                  connections.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {filteredConnections.reverse().map(([id, data]) => (
                        <ConnectionListItem
                          key={id}
                          id={id}
                          data={data}
                          connectStatus="connected"
                          notificationStatus="read"
                          onLoading={setTransitioning}
                        />
                      ))}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">{`No connections`}</StyledEmptyTypography>
                    </>
                  )
                ) : tabIndex === 1 && incomingRequests ? (
                  incomingRequests.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {filteredIncomingRequests.reverse().map(([id, data]) => (
                        <ConnectionListItem
                          key={id}
                          id={id}
                          data={data}
                          connectStatus="incoming"
                          notificationStatus="read"
                          onLoading={setTransitioning}
                        />
                      ))}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">{`No incoming requests`}</StyledEmptyTypography>
                    </>
                  )
                ) : tabIndex === 2 && outgoingRequests ? (
                  outgoingRequests.length > 0 ? (
                    <StyledList sx={{ width: "100%" }}>
                      {filteredOutgoingRequests.reverse().map(([id, data]) => (
                        <ConnectionListItem
                          key={id}
                          id={id}
                          data={data}
                          connectStatus="outgoing"
                          notificationStatus="read"
                          onLoading={setTransitioning}
                        />
                      ))}
                    </StyledList>
                  ) : (
                    <>
                      <StyledEmptyTypography variant="subtitle1">{`No outgoing requests`}</StyledEmptyTypography>
                    </>
                  )
                ) : (
                  <StyledCircularProgressArea>
                    <StyledCircularProgress color="secondary" />
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
