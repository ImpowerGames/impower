import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import IconButton from "@material-ui/core/IconButton";
import Input from "@material-ui/core/Input";
import Typography from "@material-ui/core/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ArrowDownRegularIcon from "../../../../resources/icons/regular/arrow-down.svg";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import ArrowUpRegularIcon from "../../../../resources/icons/regular/arrow-up.svg";
import AsteriskRegularIcon from "../../../../resources/icons/regular/asterisk.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import FontCaseRegularIcon from "../../../../resources/icons/regular/font-case.svg";
import MagnifyingGlassRegularIcon from "../../../../resources/icons/regular/magnifying-glass.svg";
import ShareAllRegularIcon from "../../../../resources/icons/regular/share-all.svg";
import ShareRegularIcon from "../../../../resources/icons/regular/share.svg";
import XmarkRegularIcon from "../../../../resources/icons/regular/xmark.svg";
import AsteriskSolidIcon from "../../../../resources/icons/solid/asterisk.svg";
import FontCaseSolidIcon from "../../../../resources/icons/solid/font-case.svg";
import format from "../../../impower-config/utils/format";
import { FontIcon } from "../../../impower-icon";
import { useScrollParent } from "../../../impower-react-virtualization";
import { TextField } from "../../../impower-route";
import { SearchAction } from "../../../impower-script-editor";

const StyledKeyboardTrigger = styled.input`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
`;

const StyledFixedSpacer = styled.div`
  margin-top: env(safe-area-inset-top, 0);
`;

const StyledEngineToolbar = styled.div`
  pointer-events: none;
  min-width: 0;
  white-space: nowrap;
  color: inherit;
  background-color: inherit;
  margin-right: ${(props): string => props.theme.spacing(1)};
  top: 0;
  left: 0;
  right: 0;

  padding-top: env(safe-area-inset-top, 0);
  transition: box-shadow 0.2s ease;
`;

const StyledEngineToolbarContent = styled.div``;

const StyledTopArea = styled.div`
  display: flex;
  align-items: stretch;
  min-height: ${(props): string => props.theme.minHeight.panelHeaderTitle};
  z-index: 2;
`;

const StyledFixableArea = styled.div`
  min-height: ${(props): string => props.theme.minHeight.panelHeaderTitle};
  background-color: transparent;
  color: inherit;
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  position: relative;
`;

const StyledFixableContent = styled.div`
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  position: relative;
`;

const StyledEngineConsoleToolbarContent = styled.div`
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
`;

const StyledHeaderLeftButtonArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledHeaderRightButtonArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledHeaderContextButtonArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledSearchTextField = styled(TextField)`
  pointer-events: auto;
  flex: 1;
  border-bottom-color: inherit;
  caret-color: inherit;

  & .MuiFormLabel-root {
    color: inherit;
  }

  & .MuiInputBase-root {
    border-bottom-color: inherit;
    color: inherit;
    caret-color: inherit;
  }

  & .MuiInput-underline:before {
    border-bottom-color: inherit;
    right: -${(props): string => props.theme.spacing(10)};
  }

  & .MuiInput-underline:after {
    right: -${(props): string => props.theme.spacing(10)};
  }

  & .MuiInput-underline:hover:not(.Mui-disabled):before {
    border-bottom-color: inherit;
  }

  & input {
    color: inherit;
    caret-color: inherit;
    padding-top: ${(props): string => props.theme.spacing(1)};
    padding-bottom: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledReplaceTextField = styled(TextField)`
  pointer-events: auto;
  flex: 1;
  border-bottom-color: inherit;
  caret-color: inherit;

  & .MuiFormLabel-root {
    color: inherit;
  }

  & .MuiInputBase-root {
    border-bottom-color: inherit;
    color: inherit;
    caret-color: inherit;
  }

  & .MuiInput-underline:before {
    border-bottom-color: inherit;
  }

  & .MuiInput-underline:after {
  }

  & .MuiInput-underline:hover:not(.Mui-disabled):before {
    border-bottom-color: inherit;
  }

  & input {
    color: inherit;
    caret-color: inherit;
    padding-top: ${(props): string => props.theme.spacing(1)};
    padding-bottom: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledHeaderMiddleArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
`;

const StyledSearchArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledSearchFieldArea = styled.div`
  flex: 1;
  display: flex;
`;

const StyledHeadCheckbox = styled(Checkbox)`
  pointer-events: auto;
  margin: 0;
  padding: ${(props): string => props.theme.spacing(0.5)};
  color: inherit;
  opacity: 0.5;
  &.MuiCheckbox-colorSecondary.Mui-checked {
    color: inherit;
  }
`;

const StyledContextButton = styled(Button)`
  pointer-events: auto;
  &.MuiButton-root.Mui-disabled {
    color: inherit;
    opacity: 0.2;
  }
`;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
  color: inherit;
  margin: ${(props): string => props.theme.spacing(0.5)};
  padding: 0;
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

const StyledToggleButton = styled(IconButton)`
  pointer-events: auto;
  color: inherit;
  margin: ${(props): string => props.theme.spacing(0.5)};
  padding: 0;
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
  border-radius: ${(props): string => props.theme.spacing(1)};
`;

const StyledHeaderContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
`;

const StyledHeaderNameTypography = styled(Typography)`
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  margin: ${(props): string => props.theme.spacing(0, -1)};
  padding: ${(props): string => props.theme.spacing(0, 1)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  white-space: pre;
`;

interface EngineToolbarLayoutProps {
  minHeight: number;
  leftChildren?: React.ReactNode;
  middleChildren?: React.ReactNode;
  rightChildren?: React.ReactNode;
  rotateChildren?: React.ReactNode;
  rotateStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  rightStyle?: React.CSSProperties;
  backgroundColor?: string;
}

const EngineToolbarLayout = React.memo(
  (props: EngineToolbarLayoutProps): JSX.Element => {
    const {
      minHeight,
      leftChildren,
      middleChildren,
      rightChildren,
      rotateChildren,
      rotateStyle,
      headerStyle,
      leftStyle,
      rightStyle,
      backgroundColor,
    } = props;
    return (
      <StyledEngineConsoleToolbarContent
        style={{
          backgroundColor,
          minHeight,
          ...headerStyle,
        }}
      >
        <StyledHeaderLeftButtonArea style={leftStyle}>
          {leftChildren}
        </StyledHeaderLeftButtonArea>
        <StyledHeaderMiddleArea>{middleChildren}</StyledHeaderMiddleArea>
        {rightChildren && (
          <StyledHeaderRightButtonArea style={rightStyle}>
            {rightChildren}
          </StyledHeaderRightButtonArea>
        )}
        {rotateChildren && (
          <StyledHeaderContextButtonArea
            style={{ minWidth: minHeight, ...rotateStyle }}
          >
            {rotateChildren}
          </StyledHeaderContextButtonArea>
        )}
      </StyledEngineConsoleToolbarContent>
    );
  }
);

interface EngineToolbarContentProps {
  type: "default" | "context" | "search" | "filter";
  moreIcon?: React.ReactNode;
  backIcon?: React.ReactNode;
  minHeight: number;
  searchQuery?: SearchAction;
  selectedPaths?: string[];
  paths?: string[];
  backLabel: string;
  selectedLabel: string;
  contextOptions?: string[];
  moreLabel: string;
  doneLabel: string;
  clearLabel: string;
  searchLabel: string;
  replaceLabel: string;
  title: React.ReactNode;
  leftChildren?: React.ReactNode;
  titleStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  rightStyle?: React.CSSProperties;
  rotateStyle?: React.CSSProperties;
  backButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  clearButtonStyle?: React.CSSProperties;
  doneButtonStyle?: React.CSSProperties;
  backButtonBackgroundStyle?: React.CSSProperties;
  searchButtonBackgroundStyle?: React.CSSProperties;
  moreButtonBackgroundStyle?: React.CSSProperties;
  clearButtonBackgroundStyle?: React.CSSProperties;
  doneButtonBackgroundStyle?: React.CSSProperties;
  isSelectAllowed: (path: string) => boolean;
  onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeselectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClickMoreOption: (e: React.MouseEvent, option: string) => void;
  onBack?: (e: React.MouseEvent) => void;
  onDone: (e: React.MouseEvent) => void;
  onSearch: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    searchQuery?: SearchAction
  ) => void;
  onMore: (e: React.MouseEvent) => void;
}

const EngineToolbarContent = React.memo(
  (props: PropsWithChildren<EngineToolbarContentProps>): JSX.Element => {
    const {
      type,
      moreIcon = <EllipsisVerticalRegularIcon />,
      backIcon,
      minHeight,
      searchQuery,
      selectedPaths,
      paths,
      backLabel,
      selectedLabel,
      contextOptions,
      moreLabel,
      doneLabel,
      clearLabel,
      searchLabel,
      replaceLabel,
      title,
      leftChildren,
      titleStyle,
      headerStyle,
      leftStyle,
      rightStyle,
      rotateStyle,
      backButtonStyle,
      moreButtonStyle,
      searchButtonStyle,
      clearButtonStyle,
      doneButtonStyle,
      children,
      isSelectAllowed,
      onSelectAll,
      onDeselectAll,
      onClickMoreOption,
      onBack,
      onDone,
      onSearch,
      onMore,
    } = props;

    const theme = useTheme();
    const searchInputRef = useRef<HTMLInputElement>();
    const searchQueryRef = useRef(searchQuery);

    const handleOpenSearch = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          ...(searchQueryRef.current || {}),
          search: "",
          action: "search",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleCloseSearch = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = null;
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleSearchChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>, action = "search") => {
        searchQueryRef.current = {
          ...(searchQueryRef.current || {}),
          search: e.target.value,
          action,
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleSearchFieldKeyUp = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const changeEvent =
            e as unknown as React.ChangeEvent<HTMLInputElement>;
          if (e.shiftKey) {
            handleSearchChange(changeEvent, "find_previous");
          } else {
            handleSearchChange(changeEvent, "find_next");
          }
        }
      },
      [handleSearchChange]
    );

    const handleReplaceFieldKeyUp = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const changeEvent =
            e as unknown as React.ChangeEvent<HTMLInputElement>;
          handleSearchChange(changeEvent, "replace");
        }
      },
      [handleSearchChange]
    );

    const handleReplaceChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          replace: e.target.value,
          action: "search",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleSearchInputRef = useCallback((instance: HTMLInputElement) => {
      if (instance) {
        searchInputRef.current = instance;
        instance.focus();
        window.setTimeout(() => instance.focus(), 100);
      }
    }, []);

    const handleSearchClear = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          ...(searchQueryRef.current || {}),
          search: "",
          action: "search",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      },
      [onSearch]
    );

    const handleChangeSearchCaseSensitive = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          caseSensitive: !searchQueryRef.current?.caseSensitive,
          action: "search",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleChangeSearchRegex = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          regexp: !searchQueryRef.current?.regexp,
          action: "search",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleFindPrevious = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          action: "find_previous",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleFindNext = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          action: "find_next",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleReplace = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          action: "replace",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleReplaceAll = useCallback(
      (e: React.MouseEvent) => {
        searchQueryRef.current = {
          search: "",
          ...(searchQueryRef.current || {}),
          action: "replace_all",
        };
        if (onSearch) {
          onSearch(e, searchQueryRef.current);
        }
      },
      [onSearch]
    );

    const handleCheckboxChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        if (checked) {
          if (onSelectAll) {
            onSelectAll(e);
          }
        } else if (onDeselectAll) {
          onDeselectAll(e);
        }
      },
      [onDeselectAll, onSelectAll]
    );

    const selectablePaths = useMemo(
      () =>
        type === "context"
          ? isSelectAllowed
            ? paths?.filter((path) => isSelectAllowed(path))
            : paths
          : [],
      [isSelectAllowed, paths, type]
    );

    if (type === "context" && contextOptions?.length === 1) {
      return (
        <EngineToolbarLayout
          minHeight={minHeight}
          leftChildren={
            <StyledHeadCheckbox
              indeterminate={
                selectedPaths?.length > 0 &&
                selectedPaths.length < selectablePaths?.length
              }
              checked={
                selectablePaths.length > 0 &&
                selectedPaths?.length === selectablePaths?.length
              }
              onChange={handleCheckboxChange}
              style={{ minWidth: minHeight }}
            />
          }
          middleChildren={
            <StyledHeaderContent>
              <StyledHeaderNameTypography
                style={{
                  opacity: 0.6,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {format(selectedLabel, {
                  count: selectedPaths.length,
                })}
              </StyledHeaderNameTypography>
            </StyledHeaderContent>
          }
          rightChildren={
            <StyledContextButton
              disabled={selectedPaths.length === 0}
              variant="text"
              color="secondary"
              onClick={(e): void => onClickMoreOption(e, contextOptions[0])}
            >
              {contextOptions[0]}
            </StyledContextButton>
          }
          rotateChildren={
            <StyledIconButton
              color="inherit"
              onClick={onDone}
              style={{ ...doneButtonStyle }}
            >
              <FontIcon
                aria-label={doneLabel}
                size={theme.fontSize.smallIcon}
                style={{ opacity: 0.5 }}
              >
                <XmarkRegularIcon />
              </FontIcon>
            </StyledIconButton>
          }
          headerStyle={headerStyle}
          leftStyle={leftStyle}
          rightStyle={rightStyle}
        />
      );
    }

    if (type === "search" || type === "filter") {
      return (
        <EngineToolbarLayout
          minHeight={minHeight}
          leftChildren={
            onSearch ? (
              <StyledIconButton
                color="inherit"
                onClick={handleCloseSearch}
                style={{ ...backButtonStyle }}
              >
                <FontIcon
                  aria-label={backLabel}
                  size={theme.fontSize.smallIcon}
                  style={{ opacity: 0.5 }}
                >
                  <ArrowLeftRegularIcon />
                </FontIcon>
              </StyledIconButton>
            ) : undefined
          }
          middleChildren={
            <StyledSearchArea>
              <StyledSearchFieldArea>
                <StyledSearchTextField
                  inputRef={handleSearchInputRef}
                  placeholder={searchLabel}
                  value={searchQueryRef.current?.search}
                  variant="standard"
                  InputComponent={Input}
                  name="search"
                  autoComplete="off"
                  autoFocus
                  onChange={handleSearchChange}
                  onKeyUp={handleSearchFieldKeyUp}
                  fullWidth
                />
                {clearLabel && (
                  <StyledIconButton
                    color="inherit"
                    onClick={handleSearchClear}
                    style={{ ...clearButtonStyle }}
                  >
                    <FontIcon
                      aria-label={clearLabel}
                      size={theme.fontSize.smallIcon}
                      style={{ opacity: 0.5 }}
                    >
                      <XmarkRegularIcon />
                    </FontIcon>
                  </StyledIconButton>
                )}
                <StyledToggleButton
                  color="inherit"
                  onClick={handleChangeSearchCaseSensitive}
                  style={{
                    backgroundColor: searchQueryRef.current?.caseSensitive
                      ? theme.colors.black50
                      : undefined,
                    opacity: searchQueryRef.current?.caseSensitive
                      ? undefined
                      : 0.5,
                  }}
                >
                  <FontIcon
                    aria-label={`Match Case`}
                    size={theme.fontSize.smallIcon}
                  >
                    {searchQueryRef.current?.caseSensitive ? (
                      <FontCaseSolidIcon />
                    ) : (
                      <FontCaseRegularIcon />
                    )}
                  </FontIcon>
                </StyledToggleButton>
                <StyledToggleButton
                  color="inherit"
                  onClick={handleChangeSearchRegex}
                  style={{
                    backgroundColor: searchQueryRef.current?.regexp
                      ? theme.colors.black50
                      : undefined,
                    opacity: searchQueryRef.current?.regexp ? undefined : 0.5,
                  }}
                >
                  <FontIcon
                    aria-label={`Use Regular Expression`}
                    size={theme.fontSize.smallIcon}
                  >
                    {searchQueryRef.current?.regexp ? (
                      <AsteriskSolidIcon />
                    ) : (
                      <AsteriskRegularIcon />
                    )}
                  </FontIcon>
                </StyledToggleButton>
                {type !== "filter" && (
                  <>
                    <StyledIconButton
                      color="inherit"
                      onClick={handleFindPrevious}
                    >
                      <FontIcon
                        aria-label={`Find Previous`}
                        size={theme.fontSize.smallIcon}
                        style={{ opacity: 0.5 }}
                      >
                        <ArrowUpRegularIcon />
                      </FontIcon>
                    </StyledIconButton>
                    <StyledIconButton color="inherit" onClick={handleFindNext}>
                      <FontIcon
                        aria-label={`Find Next`}
                        size={theme.fontSize.smallIcon}
                        style={{ opacity: 0.5 }}
                      >
                        <ArrowDownRegularIcon />
                      </FontIcon>
                    </StyledIconButton>
                  </>
                )}
              </StyledSearchFieldArea>
              {replaceLabel && (
                <StyledSearchFieldArea>
                  <StyledReplaceTextField
                    placeholder={replaceLabel}
                    value={searchQueryRef.current?.replace}
                    variant="standard"
                    autoComplete="off"
                    InputComponent={Input}
                    fullWidth
                    onChange={handleReplaceChange}
                    onKeyUp={handleReplaceFieldKeyUp}
                  />
                  <StyledIconButton color="inherit" onClick={handleReplace}>
                    <FontIcon
                      aria-label={`Replace`}
                      size={theme.fontSize.smallIcon}
                      style={{ opacity: 0.5 }}
                    >
                      <ShareRegularIcon />
                    </FontIcon>
                  </StyledIconButton>
                  <StyledIconButton color="inherit" onClick={handleReplaceAll}>
                    <FontIcon
                      aria-label={`Replace All`}
                      size={theme.fontSize.smallIcon}
                      style={{ opacity: 0.5 }}
                    >
                      <ShareAllRegularIcon />
                    </FontIcon>
                  </StyledIconButton>
                </StyledSearchFieldArea>
              )}
            </StyledSearchArea>
          }
          headerStyle={headerStyle}
          leftStyle={leftStyle}
          rightStyle={rightStyle}
          rotateStyle={rotateStyle}
        />
      );
    }
    return (
      <EngineToolbarLayout
        minHeight={minHeight}
        leftChildren={
          onBack ? (
            <StyledIconButton
              color="inherit"
              onClick={onBack}
              style={{ ...backButtonStyle }}
            >
              <FontIcon
                aria-label={backLabel}
                size={theme.fontSize.smallIcon}
                style={{ opacity: 0.5 }}
              >
                {backIcon}
              </FontIcon>
            </StyledIconButton>
          ) : (
            leftChildren
          )
        }
        middleChildren={
          title && (
            <StyledHeaderContent>
              {typeof title === "string" ? (
                <StyledHeaderNameTypography
                  variant="h6"
                  style={{ fontSize: "1.375rem", ...titleStyle }}
                >
                  {title}
                </StyledHeaderNameTypography>
              ) : (
                title
              )}
            </StyledHeaderContent>
          )
        }
        rightChildren={
          <>
            {children}
            {onSearch && (
              <StyledIconButton
                color="inherit"
                onClick={handleOpenSearch}
                style={{
                  opacity: 0.5,
                  ...searchButtonStyle,
                }}
              >
                <FontIcon
                  aria-label={searchLabel}
                  size={theme.fontSize.smallerIcon}
                >
                  <MagnifyingGlassRegularIcon />
                </FontIcon>
              </StyledIconButton>
            )}
          </>
        }
        rotateChildren={
          onMore && (
            <StyledIconButton
              color="inherit"
              onClick={onMore}
              style={{
                opacity: 0.5,
                ...moreButtonStyle,
              }}
            >
              <FontIcon aria-label={moreLabel} size={theme.fontSize.smallIcon}>
                {moreIcon}
              </FontIcon>
            </StyledIconButton>
          )
        }
        headerStyle={headerStyle}
        leftStyle={leftStyle}
        rightStyle={rightStyle}
      />
    );
  }
);

interface EngineToolbarProps {
  headerRef?: React.Ref<HTMLElement>;
  type: "default" | "context" | "search" | "filter";
  moreIcon?: React.ReactNode;
  backIcon?: React.ReactNode;
  minHeight: number;
  searchQuery?: SearchAction;
  selectedPaths?: string[];
  paths?: string[];
  backLabel?: string;
  selectedLabel?: string;
  contextOptions?: string[];
  moreLabel?: string;
  doneLabel?: string;
  clearLabel?: string;
  searchLabel?: string;
  replaceLabel?: string;
  title?: React.ReactNode;
  titleStyle?: React.CSSProperties;
  fixableContentStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  rightStyle?: React.CSSProperties;
  rotateStyle?: React.CSSProperties;
  backButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  clearButtonStyle?: React.CSSProperties;
  doneButtonStyle?: React.CSSProperties;
  stickyStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  sticky?: "always" | "collapsible" | "never";
  leftChildren?: React.ReactNode;
  rightChildren?: React.ReactNode;
  belowBreakpoint?: boolean;
  isSelectAllowed?: (path: string) => boolean;
  onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeselectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClickMoreOption?: (e: React.MouseEvent, option: string) => void;
  onBack?: (e: React.MouseEvent) => void;
  onDone?: (e: React.MouseEvent) => void;
  onSearch?: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    searchQuery?: SearchAction
  ) => void;
  onMore?: (e: React.MouseEvent) => void;
}

const EngineToolbar = (props: EngineToolbarProps): JSX.Element => {
  const {
    headerRef,
    type,
    minHeight,
    searchQuery,
    selectedPaths,
    paths,
    moreIcon,
    backIcon,
    backLabel,
    selectedLabel,
    contextOptions,
    moreLabel,
    doneLabel,
    clearLabel,
    searchLabel,
    replaceLabel,
    title,
    fixableContentStyle,
    titleStyle,
    headerStyle,
    leftStyle,
    rightStyle,
    rotateStyle,
    backButtonStyle,
    moreButtonStyle,
    searchButtonStyle,
    clearButtonStyle,
    doneButtonStyle,
    stickyStyle,
    style,
    sticky,
    leftChildren,
    rightChildren,
    belowBreakpoint,
    isSelectAllowed,
    onSelectAll,
    onDeselectAll,
    onClickMoreOption,
    onBack,
    onDone,
    onSearch,
    onMore,
  } = props;

  const [headerArea, setHeaderArea] = useState<HTMLElement>();
  const [scrolledDown, setScrolledDown] = useState(false);
  const keyboardTriggerRef = useRef<HTMLInputElement>();

  const scrollParent = useScrollParent(headerArea);

  useEffect(() => {
    const onScroll = (): void => {
      const scrollY =
        scrollParent === document.documentElement
          ? window.scrollY
          : scrollParent.scrollTop;
      setScrolledDown(scrollY > 0);
    };
    if (!scrollParent) {
      return (): void => null;
    }
    if (scrollParent === document.documentElement) {
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      scrollParent.addEventListener("scroll", onScroll, { passive: true });
    }
    return (): void => {
      if (scrollParent === document.documentElement) {
        window.removeEventListener("scroll", onScroll);
      } else {
        scrollParent.removeEventListener("scroll", onScroll);
      }
    };
  }, [scrollParent]);

  const handleHeaderAreaRef = useCallback(
    (instance: HTMLDivElement): void => {
      if (instance) {
        setHeaderArea(instance);
      }
      if (headerRef) {
        if (typeof headerRef === "function") {
          headerRef(instance);
        } else {
          (headerRef as { current: HTMLElement }).current = instance;
        }
      }
    },
    [headerRef]
  );

  const handleSearch = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
      searchQuery?: SearchAction
    ) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (keyboardTriggerRef.current) {
        keyboardTriggerRef.current.focus();
      }
      onSearch?.(e, searchQuery);
    },
    [onSearch]
  );

  const theme = useTheme();

  const position =
    style?.position ||
    (stickyStyle?.position as "sticky" | "fixed" | "absolute");

  return (
    <>
      <StyledKeyboardTrigger aria-hidden="true" ref={keyboardTriggerRef} />
      <StyledFixedSpacer
        style={{
          display:
            position === "fixed" || position === "absolute"
              ? undefined
              : "none",
          minHeight,
        }}
      />
      <StyledEngineToolbar
        ref={handleHeaderAreaRef}
        style={{
          position,
          marginRight:
            belowBreakpoint || position === "sticky" ? 0 : theme.spacing(1),
          ...style,
          ...(sticky === "always"
            ? stickyStyle
            : sticky === "collapsible" && scrolledDown
            ? (stickyStyle as React.CSSProperties)
            : {}),
          boxShadow:
            sticky === "always" || sticky === "collapsible"
              ? scrolledDown
                ? stickyStyle?.boxShadow || style?.boxShadow
                : style?.boxShadow
              : style?.boxShadow,
        }}
      >
        <StyledEngineToolbarContent style={{ minHeight }}>
          <StyledTopArea>
            <StyledFixableArea>
              <StyledFixableContent
                style={{
                  ...fixableContentStyle,
                }}
              >
                <EngineToolbarContent
                  key={type}
                  type={type}
                  minHeight={minHeight}
                  searchQuery={searchQuery}
                  selectedPaths={selectedPaths}
                  paths={paths}
                  moreIcon={moreIcon}
                  backIcon={backIcon}
                  backLabel={backLabel}
                  selectedLabel={selectedLabel}
                  contextOptions={contextOptions}
                  moreLabel={moreLabel}
                  doneLabel={doneLabel}
                  clearLabel={clearLabel}
                  searchLabel={searchLabel}
                  replaceLabel={replaceLabel}
                  title={title}
                  titleStyle={titleStyle}
                  headerStyle={headerStyle}
                  leftStyle={leftStyle}
                  rightStyle={rightStyle}
                  rotateStyle={rotateStyle}
                  backButtonStyle={backButtonStyle}
                  moreButtonStyle={moreButtonStyle}
                  searchButtonStyle={searchButtonStyle}
                  clearButtonStyle={clearButtonStyle}
                  doneButtonStyle={doneButtonStyle}
                  leftChildren={leftChildren}
                  isSelectAllowed={isSelectAllowed}
                  onSelectAll={onSelectAll}
                  onDeselectAll={onDeselectAll}
                  onClickMoreOption={onClickMoreOption}
                  onBack={onBack}
                  onDone={onDone}
                  onSearch={handleSearch}
                  onMore={onMore}
                >
                  {rightChildren}
                </EngineToolbarContent>
              </StyledFixableContent>
            </StyledFixableArea>
          </StyledTopArea>
        </StyledEngineToolbarContent>
      </StyledEngineToolbar>
    </>
  );
};

export default EngineToolbar;
