import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import CircularProgress from "@material-ui/core/CircularProgress";
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import { OutlinedInputProps } from "@material-ui/core/OutlinedInput";
import {
  AutocompleteGroupedOption,
  AutocompleteInputChangeReason,
} from "@material-ui/core/useAutocomplete";
import { useAutocomplete } from "@material-ui/unstyled/AutocompleteUnstyled";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import MagnifyingGlassRegularIcon from "../../../../resources/icons/regular/magnifying-glass.svg";
import XmarkRegularIcon from "../../../../resources/icons/regular/xmark.svg";
import { debounce } from "../../../impower-core";
import {
  DocumentSnapshot,
  escapeURI,
  QuerySnapshot,
  TagDocument,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import {
  NavigationContext,
  navigationSetSearchbar,
} from "../../../impower-navigation";
import navigationSetTransitioning from "../../../impower-navigation/utils/navigationSetTransitioning";
import { useRouter } from "../../../impower-router";
import useIOS from "../../hooks/useIOS";
import useVisualViewport from "../../hooks/useVisualViewport";
import { getBaseRoute } from "../../utils/getBaseRoute";
import SelectOption from "../inputs/SelectOption";
import VirtualizedAutocompleteGroup from "../inputs/VirtualizedAutocompleteGroup";
import SearchInput from "./SearchInput";

const StyledScrollBlocker = styled.div<{ dialog?: boolean }>(
  ({ dialog }) => `
  touch-action: none;
  overscroll-behavior: contain;
  * {
    touch-action: none;
    overscroll-behavior: contain;
  }
  & ul {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
  & ul * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
  position: ${dialog ? "fixed" : "absolute"};
  ${
    dialog
      ? `top: 0; left: 0; height: 100vh; width: 100vw;`
      : "max-height: 250px; width: 100%;"
  };
  z-index: 1;
`
);

const StyledRoot = styled.div`
  width: 100%;
  z-index: 1;
`;

const StyledInputArea = styled.div<{ dialog?: boolean }>(
  ({ dialog }) => `
  position: relative;
  display: flex;

  ${dialog ? `padding: 12px 8px 8px 8px;` : ""}`
);

const StyledBackground = styled.div(
  ({ theme }) => `
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: ${theme.spacing(6)};
  background-color: ${theme.palette.primary.main};
`
);

const StyledListbox = styled.ul<{ dialog?: boolean }>(
  ({ dialog, theme }) => `
  background-color: ${theme.palette.mode === "dark" ? "#141414" : "#fff"};

  width: 100%;
  padding: 0;
  list-style: none;

  overflow-y: auto;
  touch-action: none;
  overscroll-behavior: contain;

  position: absolute;
  border-radius: ${dialog ? "0" : "4px"};
  margin: ${dialog ? "5px" : "2px"} 0 0 0;
  max-height: ${dialog ? "height: 100vh" : "250px"};
  ${dialog ? `height: calc(100vh - ${theme.minHeight.navigationBar});` : ""};
  box-shadow: ${dialog ? "none" : theme.shadows[3]};
  &::-webkit-scrollbar {
    ${dialog ? `display: none;` : ""}
  }
  ${dialog ? `scrollbar-width: none;` : ""}
`
);

const StyledOverflowForcer = styled.div(
  ({ theme }) => `
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(100vh - ${theme.minHeight.navigationBar} + 1px);
`
);

const StyledIconButton = styled(IconButton)`
  color: inherit;
  display: none;
  .Mui-focused & {
    display: inline-flex;
  }
`;

const StyledBackIconButton = styled(IconButton)(
  ({ theme }) => `
  color: white;
  width: ${theme.spacing(5)};
  height: ${theme.spacing(5)};
  margin-right: ${theme.spacing(1)};
`
);

const StyledLogoSpacer = styled.div(
  ({ theme }) => `
 width: ${theme.spacing(5)};
 height: ${theme.spacing(5)};
 margin-right: ${theme.spacing(1)};
 `
);

const StyledStartAdornmentArea = styled.div(
  () => `
position: relative;
 `
);

const StyledCircularProgressArea = styled.div(
  () => `
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
 `
);

const StyledCircularProgress = styled(CircularProgress)(
  ({ theme }) => `
  min-width: ${theme.spacing(4)};
  min-height: ${theme.spacing(4)};
 `
);

interface SearchAutocompleteInputProps {
  searching?: boolean;
  dialog?: boolean;
  placeholder?: string;
  InputProps?: OutlinedInputProps;
  open?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onClear?: (e: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent) => void;
}

const SearchAutocompleteInput = React.memo(
  (props: SearchAutocompleteInputProps) => {
    const {
      searching,
      dialog,
      placeholder,
      open,
      InputProps,
      inputRef,
      onClear,
      onClose,
    } = props;
    const theme = useTheme();
    return (
      <StyledInputArea
        dialog={dialog}
        style={{
          maxWidth: `calc(${theme.spacing(14)} + ${
            theme.breakpoints.values.sm
          }px)`,
          margin: "auto",
        }}
      >
        <StyledBackground />
        {dialog && open && (
          <StyledBackIconButton onClick={onClose}>
            <FontIcon aria-label={`Back`} size={24}>
              <ArrowLeftRegularIcon />
            </FontIcon>
          </StyledBackIconButton>
        )}
        <SearchInput
          placeholder={placeholder}
          {...InputProps}
          inputRef={inputRef}
          startAdornment={
            <StyledStartAdornmentArea>
              <FontIcon
                aria-label={`Search`}
                color={
                  open
                    ? theme.palette.secondary.main
                    : theme.palette.secondary.light
                }
              >
                <MagnifyingGlassRegularIcon />
              </FontIcon>
              {searching && (
                <StyledCircularProgressArea>
                  <StyledCircularProgress color="secondary" size={32} />
                </StyledCircularProgressArea>
              )}
            </StyledStartAdornmentArea>
          }
          endAdornment={
            <StyledIconButton onClick={onClear}>
              <FontIcon
                aria-label={`Clear`}
                size={16}
                color={theme.palette.secondary.main}
              >
                <XmarkRegularIcon />
              </FontIcon>
            </StyledIconButton>
          }
        />
        {dialog && open && <StyledLogoSpacer />}
        <Divider absolute />
      </StyledInputArea>
    );
  }
);

interface SearchAutocompleteListBoxProps {
  dialog?: boolean;
  inputValue?: string;
  placeholder?: string;
  listboxProps?: React.HTMLAttributes<HTMLUListElement>;
  groups?: AutocompleteGroupedOption<string>[];
  keyboardSpacerStyle?: React.CSSProperties;
  getOptionProps: ({
    option,
    index,
  }: {
    option: string;
    index: number;
  }) => React.HTMLAttributes<HTMLLIElement>;
}

const SearchAutocompleteListBox = React.memo(
  (props: SearchAutocompleteListBoxProps) => {
    const {
      dialog,
      inputValue,
      placeholder,
      listboxProps,
      groups,
      keyboardSpacerStyle,
      getOptionProps,
    } = props;
    const theme = useTheme();
    return (
      <StyledListbox {...listboxProps} dialog={dialog}>
        {dialog && <StyledOverflowForcer />}
        {groups.map((group) => (
          <VirtualizedAutocompleteGroup key={group.key} {...group}>
            {group.options.map(
              (option, index): React.ReactNode => (
                <SelectOption
                  key={option}
                  option={option}
                  inputValue={inputValue}
                  placeholderLabel={placeholder}
                  renderOptionIcon={(option: string): JSX.Element => (
                    <FontIcon aria-label={option} color={theme.colors.black40}>
                      <MagnifyingGlassRegularIcon />
                    </FontIcon>
                  )}
                  {...getOptionProps({ option, index })}
                  style={{
                    pointerEvents: !option ? "none" : undefined,
                    maxWidth: theme.breakpoints.values.sm,
                    margin: "auto",
                    color: "black",
                  }}
                />
              )
            )}
          </VirtualizedAutocompleteGroup>
        ))}
        <div style={keyboardSpacerStyle} />
      </StyledListbox>
    );
  }
);

interface SearchAutocompleteProps {
  dialog?: boolean;
  label?: string;
  placeholder?: string;
  value?: string;
  style?: React.CSSProperties;
}

const SearchAutocomplete = (props: SearchAutocompleteProps): JSX.Element => {
  const { dialog, value, label, placeholder, style } = props;

  const stateRef = useRef<string>(value || "");
  const [state, setState] = useState<string>(stateRef.current);
  const [openState, setOpenState] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>(stateRef.current);
  const [options, setOptions] = useState<string[]>(placeholder ? [""] : []);
  const [viewportArea, setViewportArea] = useState<HTMLDivElement>();
  const inputValueRef = useRef<string>();
  const inputRef = useRef<HTMLInputElement>();
  const closingRef = useRef<boolean>();

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const searching = navigationState?.search?.searching;

  const visualViewportSupported = useVisualViewport(viewportArea);
  const ios = useIOS();

  const keyboardSpacerStyle = useMemo(
    () => ({
      height: dialog && ios && !visualViewportSupported ? "50vh" : 0,
    }),
    [dialog, ios, visualViewportSupported]
  );

  const router = useRouter();

  useEffect(() => {
    stateRef.current = value || "";
    inputValueRef.current = stateRef.current;
    setState(stateRef.current);
    setInputValue(inputValueRef.current);
  }, [value]);

  const handleIsOptionEqualToValue = useCallback(
    (option: string, value: string): boolean => {
      if (!option) {
        return false;
      }
      return option === value;
    },
    []
  );

  const handleGroupBy = useCallback((): string => {
    return "";
  }, []);

  const handleSearchQuery = useCallback(async (): Promise<void> => {
    if (closingRef.current) {
      return;
    }
    const value = inputValueRef.current;

    if (!value) {
      setOptions([""]);
      return;
    }

    const DataStoreRead = (
      await import("../../../impower-data-store/classes/dataStoreRead")
    ).default;
    const DataStoreQuery = (
      await import("../../../impower-data-store/classes/dataStoreQuery")
    ).default;

    const docGet = new DataStoreRead("tags", value).get<TagDocument>();

    const queryRef = new DataStoreQuery("tags");
    let queryFilter = queryRef.where(
      "terms",
      "array-contains",
      `name#${value.toLowerCase()}`
    );
    const collection = window.location.pathname.startsWith("/pitch")
      ? "games"
      : "";
    if (!collection) {
      return;
    }
    if (collection) {
      queryFilter = queryFilter.orderBy(`${collection}`, "desc");
    }
    const queryGet = queryFilter.limit(10).get<TagDocument>();

    const promises: [
      Promise<DocumentSnapshot<TagDocument>>,
      Promise<QuerySnapshot<TagDocument>>
    ] = [docGet, queryGet];
    promises.push();

    const [docSnapshot, querySnapshot] = await Promise.all(promises);

    const results = new Set<string>();
    results.add(value);
    if (docSnapshot.exists()) {
      results.add(docSnapshot.id);
    }
    querySnapshot.docs.forEach((s) => {
      if (s.exists()) {
        results.add(s.id);
      }
    });
    setOptions(Array.from(results));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDebouncedInputChange = useCallback(
    debounce(handleSearchQuery, 200),
    [handleSearchQuery]
  );

  const handleInputChange = useCallback(
    (
      event: React.ChangeEvent,
      value: string,
      reason: AutocompleteInputChangeReason
    ): void => {
      if (reason === "input") {
        inputValueRef.current = value || "";
        setInputValue(inputValueRef.current);
        handleDebouncedInputChange();
      } else if (reason === "clear") {
        inputValueRef.current = value || "";
        setInputValue(inputValueRef.current);
        setOptions([""]);
      }
    },
    [handleDebouncedInputChange]
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.f !== prevState?.f) {
        setOpenState(currState?.f === "search");
      }
    },
    []
  );
  const [openFieldDialog, closeFieldDialog] = useDialogNavigation(
    "f",
    handleBrowserNavigation
  );

  const handleOpen = useCallback((): void => {
    if (dialog && closingRef.current) {
      return;
    }
    closingRef.current = false;
    setOptions([stateRef.current || ""]);
    setOpenState(true);
    if (dialog) {
      openFieldDialog("search");
    }
  }, [dialog, openFieldDialog]);

  const handleClose = useCallback(async () => {
    window.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    });
    closingRef.current = true;
    setOpenState(false);
    if (dialog) {
      closeFieldDialog();
    }
  }, [closeFieldDialog, dialog]);

  const handleSearchChange = useCallback(
    async (event: React.ChangeEvent, value: string) => {
      if (!value) {
        return;
      }
      window.requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.blur();
        }
      });
      closingRef.current = true;
      setOpenState(false);
      if (dialog) {
        closeFieldDialog();
      }
      const newSearch = value || "";
      stateRef.current = newSearch;
      inputValueRef.current = stateRef.current;
      setState(stateRef.current);
      setInputValue(inputValueRef.current);
      // wait a bit for dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      closingRef.current = false;
      const baseRoute = getBaseRoute(router.route);
      const link = `${baseRoute}/search/${escapeURI(newSearch)}`;
      if (window.location.pathname.endsWith(link)) {
        return;
      }
      navigationDispatch(navigationSetTransitioning(true));
      navigationDispatch(
        navigationSetSearchbar({ value: newSearch, searching: true })
      );
      await router.push(link);
    },
    [closeFieldDialog, dialog, navigationDispatch, router]
  );

  const {
    getRootProps,
    getInputProps,
    getListboxProps,
    getOptionProps,
    groupedOptions,
  } = useAutocomplete({
    value: state || "",
    inputValue: inputValue || "",
    options,
    selectOnFocus: true,
    blurOnSelect: true,
    freeSolo: true,
    clearOnBlur: true,
    openOnFocus: true,
    open: openState,
    onOpen: handleOpen,
    onClose: dialog ? undefined : handleClose,
    groupBy: handleGroupBy,
    isOptionEqualToValue: handleIsOptionEqualToValue,
    onInputChange: handleInputChange,
    onChange: handleSearchChange,
  });

  const rootProps = getRootProps();
  const inputProps = getInputProps() as OutlinedInputProps;
  const { ref, ...InputProps } = inputProps;
  const listboxProps = getListboxProps();
  const groups = groupedOptions as AutocompleteGroupedOption<string>[];

  const handleClear = useCallback(
    (e: React.MouseEvent): void => {
      handleInputChange(e as unknown as React.ChangeEvent, "", "clear");
    },
    [handleInputChange]
  );

  const handleInputRef = useCallback(
    (instance: HTMLInputElement): void => {
      if (instance) {
        inputRef.current = instance;
        window.requestAnimationFrame(() => {
          if (instance) {
            instance.focus();
            instance.select();
          }
        });
        if (ref) {
          if (typeof ref === "function") {
            ref(instance);
            return;
          }
          (ref as { current: HTMLInputElement }).current = instance;
        }
      }
    },
    [ref]
  );

  const handleViewportAreaRef = useCallback(
    (instance: HTMLDivElement): void => {
      if (instance) {
        setViewportArea(instance);
      }
    },
    []
  );

  return (
    <StyledScrollBlocker
      dialog={dialog && openState}
      ref={handleViewportAreaRef}
    >
      <StyledRoot style={style} {...rootProps}>
        <SearchAutocompleteInput
          searching={searching}
          dialog={dialog && openState}
          placeholder={label}
          open={openState}
          InputProps={InputProps}
          inputRef={handleInputRef}
          onClear={handleClear}
          onClose={handleClose}
        />
        {openState && (
          <SearchAutocompleteListBox
            dialog={dialog}
            inputValue={inputValue}
            placeholder={placeholder}
            listboxProps={listboxProps}
            groups={groups}
            keyboardSpacerStyle={keyboardSpacerStyle}
            getOptionProps={getOptionProps}
          />
        )}
      </StyledRoot>
    </StyledScrollBlocker>
  );
};

export default SearchAutocomplete;
