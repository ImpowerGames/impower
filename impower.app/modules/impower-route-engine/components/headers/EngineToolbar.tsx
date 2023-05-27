import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Input from "@mui/material/Input";
import Typography from "@mui/material/Typography";
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
import {
  SearchLineQuery,
  SearchTextQuery,
} from "../../../impower-script-editor";

const StyledKeyboardTrigger = styled.input`
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  font-size: 16px;
  opacity: 0;
  pointer-events: none;
`;

const StyledFixedSpacer = styled.div`
  margin-top: env(safe-area-inset-top, 0);
`;

const StyledEngineToolbar = styled.div<{
  sticky?: "always" | "collapsible" | "never";
}>`
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

  & {
    touch-action: ${(props): string =>
      props.sticky === "always" ? "none" : "auto"};
    overscroll-behavior: ${(props): string =>
      props.sticky === "always" ? "contain" : "auto"};
  }
  & * {
    touch-action: ${(props): string =>
      props.sticky === "always" ? "none" : "auto"};
    overscroll-behavior: ${(props): string =>
      props.sticky === "always" ? "contain" : "auto"};
  }
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
  contextButtonAreaRef?: React.Ref<HTMLDivElement>;
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
      contextButtonAreaRef,
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
            ref={contextButtonAreaRef}
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
  contextButtonAreaRef?: React.Ref<HTMLDivElement>;
  type: "default" | "context" | "search_text" | "search_line" | "filter_text";
  moreIcon?: React.ReactNode;
  backIcon?: React.ReactNode;
  minHeight: number;
  searchTextQuery?: SearchTextQuery;
  searchLineQuery?: SearchTextQuery;
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
  isSelectAllowed?: (path: string) => boolean;
  onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeselectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClickMoreOption: (e: React.MouseEvent, option: string) => void;
  onBack?: (e: React.MouseEvent) => void;
  onDone?: (e: React.MouseEvent) => void;
  onSearchText?: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    query?: SearchTextQuery
  ) => void;
  onSearchLine?: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    query?: SearchLineQuery
  ) => void;
  onClickSearchButton?: (e: React.MouseEvent) => void;
  onMore?: (e: React.MouseEvent) => void;
}

const EngineToolbarContent = React.memo(
  (props: PropsWithChildren<EngineToolbarContentProps>): JSX.Element => {
    const {
      contextButtonAreaRef,
      type,
      moreIcon = <EllipsisVerticalRegularIcon />,
      backIcon,
      minHeight,
      searchTextQuery,
      searchLineQuery,
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
      onSearchText,
      onSearchLine,
      onClickSearchButton,
      onMore,
    } = props;

    const theme = useTheme();
    const searchInputRef = useRef<HTMLInputElement>();
    const searchTextQueryRef = useRef(searchTextQuery);
    const searchLineQueryRef = useRef(searchLineQuery);

    const handleOpenSearchText = useCallback(
      (e: React.MouseEvent) => {
        onClickSearchButton?.(e);
        searchTextQueryRef.current = {
          ...(searchTextQueryRef.current || {}),
          search: "",
          action: "search",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onClickSearchButton, onSearchText]
    );

    const handleCloseSearchText = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = null;
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleSearchTextChange = useCallback(
      (
        e: React.ChangeEvent<HTMLInputElement>,
        action:
          | "replace"
          | "search"
          | "find_next"
          | "find_previous"
          | "replace_all" = "search"
      ) => {
        searchTextQueryRef.current = {
          ...(searchTextQueryRef.current || {}),
          search: e.target.value,
          action,
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleSearchTextFieldKeyUp = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const changeEvent =
            e as unknown as React.ChangeEvent<HTMLInputElement>;
          if (e.shiftKey) {
            handleSearchTextChange(changeEvent, "find_previous");
          } else {
            handleSearchTextChange(changeEvent, "find_next");
          }
        }
      },
      [handleSearchTextChange]
    );

    const handleReplaceTextFieldKeyUp = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const changeEvent =
            e as unknown as React.ChangeEvent<HTMLInputElement>;
          handleSearchTextChange(changeEvent, "replace");
        }
      },
      [handleSearchTextChange]
    );

    const handleReplaceChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          replace: e.target.value,
          action: "search",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleSearchInputRef = useCallback((instance: HTMLInputElement) => {
      if (instance) {
        searchInputRef.current = instance;
        instance.focus();
        window.setTimeout(() => instance.focus(), 100);
      }
    }, []);

    const handleSearchTextClear = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          ...(searchTextQueryRef.current || {}),
          search: "",
          action: "search",
        };
        onSearchText?.(e, searchTextQueryRef.current);
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      },
      [onSearchText]
    );

    const handleChangeSearchCaseSensitive = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          caseSensitive: !searchTextQueryRef.current?.caseSensitive,
          action: "search",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleChangeSearchRegex = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          regexp: !searchTextQueryRef.current?.regexp,
          action: "search",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleFindPrevious = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          action: "find_previous",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleFindNext = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          action: "find_next",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleReplace = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          action: "replace",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleReplaceAll = useCallback(
      (e: React.MouseEvent) => {
        searchTextQueryRef.current = {
          search: "",
          ...(searchTextQueryRef.current || {}),
          action: "replace_all",
        };
        onSearchText?.(e, searchTextQueryRef.current);
      },
      [onSearchText]
    );

    const handleSearchLineClear = useCallback(
      (e: React.MouseEvent) => {
        searchLineQueryRef.current = {
          ...(searchLineQueryRef.current || {}),
          search: "",
        };
        onSearchLine?.(e, searchLineQueryRef.current);
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      },
      [onSearchLine]
    );

    const handleCloseSearchLine = useCallback(
      (e: React.MouseEvent) => {
        searchLineQueryRef.current = null;
        onSearchLine?.(e, searchLineQueryRef.current);
      },
      [onSearchLine]
    );

    const handleSearchLineChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        searchLineQueryRef.current = {
          ...(searchLineQueryRef.current || {}),
          search: e.target.value,
        };
        onSearchLine?.(e, searchLineQueryRef.current);
      },
      [onSearchLine]
    );

    const handleSearchLineFieldKeyUp = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const event = e as unknown as React.MouseEvent<HTMLInputElement>;
          handleCloseSearchLine(event);
        }
      },
      [handleCloseSearchLine]
    );

    const handleCheckboxChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        if (checked) {
          onSelectAll?.(e);
        } else {
          onDeselectAll?.(e);
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
          contextButtonAreaRef={contextButtonAreaRef}
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
              onClick={(e): void => onClickMoreOption?.(e, contextOptions[0])}
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

    if (
      type === "search_text" ||
      type === "search_line" ||
      type === "filter_text"
    ) {
      return (
        <EngineToolbarLayout
          contextButtonAreaRef={contextButtonAreaRef}
          minHeight={minHeight}
          leftChildren={
            onSearchText ? (
              <StyledIconButton
                color="inherit"
                onClick={
                  type === "search_text"
                    ? handleCloseSearchText
                    : type === "search_line"
                    ? handleCloseSearchLine
                    : undefined
                }
                style={{ ...backButtonStyle }}
              >
                <FontIcon
                  aria-label={backLabel}
                  size={theme.fontSize.smallerIcon}
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
                  value={
                    type === "search_text"
                      ? searchTextQueryRef.current?.search
                      : type === "search_line"
                      ? searchLineQueryRef.current?.search
                      : undefined
                  }
                  variant="standard"
                  InputComponent={Input}
                  name="search"
                  autoComplete="off"
                  autoFocus
                  onChange={
                    type === "search_text"
                      ? handleSearchTextChange
                      : type === "search_line"
                      ? handleSearchLineChange
                      : undefined
                  }
                  onKeyUp={
                    type === "search_text"
                      ? handleSearchTextFieldKeyUp
                      : type === "search_line"
                      ? handleSearchLineFieldKeyUp
                      : undefined
                  }
                  fullWidth
                />
                {clearLabel && (
                  <StyledIconButton
                    color="inherit"
                    onClick={
                      type === "search_text"
                        ? handleSearchTextClear
                        : type === "search_line"
                        ? handleSearchLineClear
                        : undefined
                    }
                    style={{ ...clearButtonStyle }}
                  >
                    <FontIcon
                      aria-label={clearLabel}
                      size={theme.fontSize.smallerIcon}
                      style={{ opacity: 0.5 }}
                    >
                      <XmarkRegularIcon />
                    </FontIcon>
                  </StyledIconButton>
                )}
                {(type === "search_text" || type === "filter_text") && (
                  <>
                    <StyledToggleButton
                      color="inherit"
                      onClick={handleChangeSearchCaseSensitive}
                      style={{
                        backgroundColor: searchTextQueryRef.current
                          ?.caseSensitive
                          ? theme.colors.black50
                          : undefined,
                        opacity: searchTextQueryRef.current?.caseSensitive
                          ? undefined
                          : 0.5,
                      }}
                    >
                      <FontIcon
                        aria-label={`Match Case`}
                        size={theme.fontSize.smallerIcon}
                      >
                        {searchTextQueryRef.current?.caseSensitive ? (
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
                        backgroundColor: searchTextQueryRef.current?.regexp
                          ? theme.colors.black50
                          : undefined,
                        opacity: searchTextQueryRef.current?.regexp
                          ? undefined
                          : 0.5,
                      }}
                    >
                      <FontIcon
                        aria-label={`Use Regular Expression`}
                        size={theme.fontSize.smallerIcon}
                      >
                        {searchTextQueryRef.current?.regexp ? (
                          <AsteriskSolidIcon />
                        ) : (
                          <AsteriskRegularIcon />
                        )}
                      </FontIcon>
                    </StyledToggleButton>
                  </>
                )}
                {type === "search_text" && (
                  <>
                    <StyledIconButton
                      color="inherit"
                      onClick={handleFindPrevious}
                    >
                      <FontIcon
                        aria-label={`Find Previous`}
                        size={theme.fontSize.smallerIcon}
                        style={{ opacity: 0.85 }}
                      >
                        <ArrowUpRegularIcon />
                      </FontIcon>
                    </StyledIconButton>
                    <StyledIconButton color="inherit" onClick={handleFindNext}>
                      <FontIcon
                        aria-label={`Find Next`}
                        size={theme.fontSize.smallerIcon}
                        style={{ opacity: 0.85 }}
                      >
                        <ArrowDownRegularIcon />
                      </FontIcon>
                    </StyledIconButton>
                  </>
                )}
              </StyledSearchFieldArea>
              {type === "search_text" && replaceLabel && (
                <StyledSearchFieldArea>
                  <StyledReplaceTextField
                    placeholder={replaceLabel}
                    value={searchTextQueryRef.current?.replace}
                    variant="standard"
                    autoComplete="off"
                    InputComponent={Input}
                    fullWidth
                    onChange={handleReplaceChange}
                    onKeyUp={handleReplaceTextFieldKeyUp}
                  />
                  <StyledIconButton color="inherit" onClick={handleReplace}>
                    <FontIcon
                      aria-label={`Replace`}
                      size={theme.fontSize.smallerIcon}
                      style={{ opacity: 0.85 }}
                    >
                      <ShareRegularIcon />
                    </FontIcon>
                  </StyledIconButton>
                  <StyledIconButton color="inherit" onClick={handleReplaceAll}>
                    <FontIcon
                      aria-label={`Replace All`}
                      size={theme.fontSize.smallerIcon}
                      style={{ opacity: 0.85 }}
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
        contextButtonAreaRef={contextButtonAreaRef}
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
            {(onSearchText || onSearchLine) && (
              <StyledIconButton
                color="inherit"
                onClick={handleOpenSearchText}
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
  contextButtonAreaRef?: React.Ref<HTMLDivElement>;
  type: "default" | "context" | "search_text" | "search_line" | "filter_text";
  moreIcon?: React.ReactNode;
  backIcon?: React.ReactNode;
  minHeight: number;
  searchTextQuery?: SearchTextQuery;
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
  onClickSearchButton?: (e: React.MouseEvent) => void;
  onBack?: (e: React.MouseEvent) => void;
  onDone?: (e: React.MouseEvent) => void;
  onSearchText?: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    query?: SearchTextQuery
  ) => void;
  onSearchLine?: (
    e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent,
    query?: SearchLineQuery
  ) => void;
  onMore?: (e: React.MouseEvent) => void;
}

const EngineToolbar = (props: EngineToolbarProps): JSX.Element => {
  const {
    headerRef,
    contextButtonAreaRef,
    type,
    minHeight,
    searchTextQuery,
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
    onClickSearchButton,
    isSelectAllowed,
    onSelectAll,
    onDeselectAll,
    onClickMoreOption,
    onBack,
    onDone,
    onSearchText,
    onSearchLine,
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

  const handleClickSearchButton = useCallback(
    (e: React.MouseEvent) => {
      onClickSearchButton?.(e);
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (keyboardTriggerRef.current) {
        keyboardTriggerRef.current.focus();
      }
    },
    [onClickSearchButton]
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
        className={position === "fixed" ? "mui-fixed" : undefined}
        sticky={sticky}
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
                  contextButtonAreaRef={contextButtonAreaRef}
                  key={type}
                  type={type}
                  minHeight={minHeight}
                  searchTextQuery={searchTextQuery}
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
                  onSearchText={onSearchText}
                  onSearchLine={onSearchLine}
                  onClickSearchButton={handleClickSearchButton}
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
