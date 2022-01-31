import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import IconButton from "@material-ui/core/IconButton";
import Input from "@material-ui/core/Input";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import MagnifyingGlassRegularIcon from "../../../../resources/icons/regular/magnifying-glass.svg";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import format from "../../../impower-config/utils/format";
import { FontIcon } from "../../../impower-icon";
import { useStickyStyle } from "../../../impower-react-virtualization";
import { TextField } from "../../../impower-route";

const StyledFixedSpacer = styled.div`
  margin-top: env(safe-area-inset-top, 0);
`;

const StyledEngineToolbar = styled.div`
  pointer-events: none;
  min-width: 0;
  white-space: nowrap;
  color: inherit;
  background-color: inherit;
  padding: ${(props): string => props.theme.spacing(0, 2)};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
  top: 0;
  left: 0;
  right: 0;

  padding-top: env(safe-area-inset-top, 0);
`;

const StyledEngineToolbarContent = styled.div``;

const StyledTopArea = styled.div`
  display: flex;
  align-items: stretch;
  min-height: ${(props): string => props.theme.minHeight.panelHeaderTitle};
  z-index: 2;
`;

const StyledFixableArea = styled(Paper)`
  min-height: ${(props): string => props.theme.minHeight.panelHeaderTitle};
  background-color: transparent;
  color: inherit;
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  border-radius: 0;
  box-shadow: ${(props): string => props.theme.shadows[0]};
  position: relative;
`;

const StyledFixableContent = styled.div`
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  position: relative;
  padding: ${(props): string => props.theme.spacing(0, 1)};
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
    right: -${(props): string => props.theme.spacing(8)};
  }

  & .MuiInput-underline:after {
    right: -${(props): string => props.theme.spacing(8)};
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

const StyledHeadCheckbox = styled(Checkbox)`
  margin: 0;
  padding: ${(props): string => props.theme.spacing(0.5)};
  color: inherit;
  opacity: 0.5;
  pointer-events: auto;
  &.MuiCheckbox-colorSecondary.Mui-checked {
    color: inherit;
  }
`;

const StyledContextButton = styled(Button)`
  &.MuiButton-root.Mui-disabled {
    color: inherit;
    opacity: 0.2;
  }
`;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
  color: inherit;
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
        <StyledHeaderLeftButtonArea style={{ ...leftStyle }}>
          {leftChildren}
        </StyledHeaderLeftButtonArea>
        <StyledHeaderMiddleArea>{middleChildren}</StyledHeaderMiddleArea>
        {rightChildren && (
          <StyledHeaderRightButtonArea
            style={{ minWidth: minHeight, ...rightStyle }}
          >
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
  type: "default" | "context" | "search";
  moreIcon?: React.ReactNode;
  backIcon?: React.ReactNode;
  minHeight: number;
  search?: string;
  selectedPaths?: string[];
  paths?: string[];
  backLabel: string;
  selectedLabel: string;
  contextOptions?: string[];
  moreLabel: string;
  doneLabel: string;
  clearLabel: string;
  searchLabel: string;
  title: string;
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
  onCloseSearch: (e: React.MouseEvent) => void;
  onOpenSearch: (e: React.MouseEvent) => void;
  onSearch: (value: string) => void;
  onMore: (e: React.MouseEvent) => void;
}

const EngineToolbarContent = React.memo(
  (props: PropsWithChildren<EngineToolbarContentProps>): JSX.Element => {
    const {
      type,
      moreIcon = <EllipsisVerticalRegularIcon />,
      backIcon,
      minHeight,
      search,
      selectedPaths,
      paths,
      backLabel,
      selectedLabel,
      contextOptions,
      moreLabel,
      doneLabel,
      clearLabel,
      searchLabel,
      title,
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
      onCloseSearch,
      onOpenSearch,
      onSearch,
      onMore,
    } = props;

    const theme = useTheme();
    const searchInputRef = useRef<HTMLInputElement>();

    const handleSearchChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (onSearch) {
          onSearch(e.target.value);
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

    const handleSearchClear = useCallback(() => {
      if (onSearch) {
        onSearch("");
      }
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, [onSearch]);

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
                <XmarkSolidIcon />
              </FontIcon>
            </StyledIconButton>
          }
          headerStyle={headerStyle}
          leftStyle={leftStyle}
          rightStyle={rightStyle}
        />
      );
    }

    if (type === "search") {
      return (
        <EngineToolbarLayout
          minHeight={minHeight}
          leftChildren={
            onCloseSearch ? (
              <StyledIconButton
                color="inherit"
                onClick={onCloseSearch}
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
            <StyledSearchTextField
              inputRef={handleSearchInputRef}
              placeholder={searchLabel}
              value={search}
              variant="standard"
              InputComponent={Input}
              autoFocus
              onChange={handleSearchChange}
              fullWidth
            />
          }
          rotateChildren={
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
                <XmarkSolidIcon />
              </FontIcon>
            </StyledIconButton>
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
          ) : undefined
        }
        middleChildren={
          title && (
            <StyledHeaderContent>
              <StyledHeaderNameTypography
                variant="h6"
                style={{ fontSize: "1.375rem", ...titleStyle }}
              >
                {title}
              </StyledHeaderNameTypography>
            </StyledHeaderContent>
          )
        }
        rightChildren={
          <>
            {children}
            {onOpenSearch && (
              <StyledIconButton
                color="inherit"
                onClick={onOpenSearch}
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
  scrollParent?: HTMLElement;
  type: "default" | "context" | "search";
  moreIcon?: React.ReactNode;
  backIcon?: React.ReactNode;
  minHeight: number;
  search?: string;
  selectedPaths?: string[];
  paths?: string[];
  backLabel?: string;
  selectedLabel?: string;
  contextOptions?: string[];
  moreLabel?: string;
  doneLabel?: string;
  clearLabel?: string;
  searchLabel?: string;
  title?: string;
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
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
  style?: React.CSSProperties;
  sticky?: "always" | "collapsible" | "never";
  stickyOffset?: number;
  rightChildren?: React.ReactNode;
  belowBreakpoint?: boolean;
  isSelectAllowed?: (path: string) => boolean;
  onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeselectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClickMoreOption?: (e: React.MouseEvent, option: string) => void;
  onBack?: (e: React.MouseEvent) => void;
  onDone?: (e: React.MouseEvent) => void;
  onOpenSearch?: (e: React.MouseEvent) => void;
  onCloseSearch?: (e: React.MouseEvent) => void;
  onSearch?: (value: string) => void;
  onMore?: (e: React.MouseEvent) => void;
}

const EngineToolbar = (props: EngineToolbarProps): JSX.Element => {
  const {
    scrollParent,
    type,
    minHeight,
    search,
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
    stickyOffset,
    rightChildren,
    belowBreakpoint,
    isSelectAllowed,
    onSelectAll,
    onDeselectAll,
    onClickMoreOption,
    onBack,
    onDone,
    onOpenSearch,
    onCloseSearch,
    onSearch,
    onMore,
  } = props;

  const [headerArea, setHeaderArea] = useState<HTMLDivElement>();

  useStickyStyle(headerArea, scrollParent, stickyStyle, sticky, stickyOffset);

  const handleHeaderAreaRef = useCallback((instance: HTMLDivElement): void => {
    if (instance) {
      setHeaderArea(instance);
    }
  }, []);

  const theme = useTheme();

  const position =
    style?.position ||
    (stickyStyle?.position as "sticky" | "fixed" | "absolute");

  return (
    <>
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
          paddingLeft: belowBreakpoint ? theme.spacing(0) : undefined,
          paddingRight: belowBreakpoint ? theme.spacing(0) : undefined,
          ...style,
        }}
      >
        <StyledEngineToolbarContent style={{ minHeight }}>
          <StyledTopArea>
            <StyledFixableArea elevation={0}>
              <StyledFixableContent
                style={{
                  padding: belowBreakpoint ? theme.spacing(0) : undefined,
                  ...fixableContentStyle,
                }}
              >
                <EngineToolbarContent
                  key={type}
                  type={type}
                  minHeight={minHeight}
                  search={search}
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
                  isSelectAllowed={isSelectAllowed}
                  onSelectAll={onSelectAll}
                  onDeselectAll={onDeselectAll}
                  onClickMoreOption={onClickMoreOption}
                  onBack={onBack}
                  onDone={onDone}
                  onOpenSearch={onOpenSearch}
                  onCloseSearch={onCloseSearch}
                  onSearch={onSearch}
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
