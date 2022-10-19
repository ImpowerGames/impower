import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  Button,
  Card,
  CardActionArea,
  Checkbox,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Typography,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ArrowDownRegularIcon from "../../../../resources/icons/regular/arrow-down.svg";
import ArrowUpRegularIcon from "../../../../resources/icons/regular/arrow-up.svg";
import CheckRegularIcon from "../../../../resources/icons/regular/check.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import FilterRegularIcon from "../../../../resources/icons/regular/filter.svg";
import FolderRegularIcon from "../../../../resources/icons/regular/folder.svg";
import SquareRegularIcon from "../../../../resources/icons/regular/square.svg";
import FilterSolidIcon from "../../../../resources/icons/solid/filter.svg";
import PlusSolidIcon from "../../../../resources/icons/solid/plus.svg";
import SquareCheckSolidIcon from "../../../../resources/icons/solid/square-check.svg";
import UploadSolidIcon from "../../../../resources/icons/solid/upload.svg";
import { debounce, difference, StorageFile } from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import { TransparencyPattern } from "../../../impower-react-color-picker";
import { VirtualizedItem } from "../../../impower-react-virtualization";
import {
  DrawerMenu,
  Fallback,
  multiSelection,
  select,
  toggleSelection,
  UnmountAnimation,
} from "../../../impower-route";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import PeerTransition from "../../../impower-route/components/animations/PeerTransition";
import Avatar from "../../../impower-route/components/elements/Avatar";
import CornerFab from "../../../impower-route/components/fabs/CornerFab";
import ContextMenu from "../../../impower-route/components/popups/ContextMenu";
import { SearchTextQuery } from "../../../impower-script-editor";
import { UploadTask } from "../../../impower-storage";
import { UserContext } from "../../../impower-user";
import EngineToolbar from "../headers/EngineToolbar";

const Skeleton = dynamic(() => import("@material-ui/core/Skeleton"), {
  ssr: false,
});

export type Order = "asc" | "desc";

export interface CardDetail {
  label: string;
  displayed?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  filterable?: { [option: string]: string };
}

const StyledPaddingArea = styled.div`
  display: flex;
  justify-content: flex-start;

  padding: ${(props): string => props.theme.spacing(0, 2)};
  box-shadow: ${(props): string => props.theme.shadows[0]};
`;

const StyledCheckbox = styled(Checkbox)`
  margin: 0;
  padding: ${(props): string => props.theme.spacing(0.5)};
  color: white;
  &.MuiCheckbox-colorSecondary.Mui-checked {
    color: white;
  }
`;

const StyledButton = styled(Button)`
  pointer-events: auto;
  color: inherit;
  border-radius: inherit;
  border-radius: inherit;
  color: inherit;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
`;

const StyledMotionCardArea = styled(FadeAnimation)``;

const StyledCard = styled(Card)`
  position: relative;
  border-radius: 0;
  background-color: transparent;
  display: flex;
  min-width: 0;
  color: inherit;
`;

const StyledCardActionArea = styled(CardActionArea)<{
  component?: string;
}>``;

const StyledRow = styled.div`
  position: relative;
  display: flex;
  min-width: 0;
`;

const StyledDarkOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  background-color: ${(props): string => props.theme.colors.black20};
  pointer-events: none;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
`;

const StyledCell = styled.div`
  position: relative;
  p {
    margin: 0;
  }

  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const StyledCellArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  overflow: hidden;

  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
`;

const StyledIconArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
  display: flex;
  justify-content: stretch;
  align-items: stretch;
`;

const StyledIconContent = styled.div`
  border-radius: ${(props): string => props.theme.spacing(1)};
  position: relative;
  flex: 1;
`;

const StyledCaptionArea = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  opacity: 0.7;
  padding-top: ${(props): string => props.theme.spacing(0.25)};
`;

const StyledNameTypography = styled(Typography)`
  font-size: ${(props): string => props.theme.fontSize.regular};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledCaptionTypography = styled(Typography)`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  border-radius: inherit;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const StyledProgressBar = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
  transition: transform 0.2s ease;
`;

const StyledPercentageTypography = styled(Typography)`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledFontIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  align-items: center;
`;

const StyledDividerArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0.5)} 0;
`;

const StyledDivider = styled(Divider)``;

const StyledMain = styled(FadeAnimation)`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StyledPaper = styled(Paper)`
  margin-left: auto;
  margin-right: auto;
  width: 100%;
  overflow: hidden;
  position: relative;
`;

const StyledArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledMotionEmptyArea = styled(FadeAnimation)`
  margin-left: auto;
  margin-right: auto;
  overflow: hidden;
  position: relative;
  width: 100%;
  height: 100%;
`;

const StyledMotionEmptyContent = styled.div``;

const StyledUploadOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  border-radius: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  border-color: ${(props): string => props.theme.palette.secondary.main};
  border-width: 2px;
  border-style: dashed;
  font-size: ${(props): string => props.theme.fontSize.regular};
  z-index: 1;
`;

const StyledUploadOverlayBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  border-radius: inherit;
`;

const StyledUploadDropzone = styled.div`
  padding: ${(props): string => props.theme.spacing(3)};
  margin-left: ${(props): string => props.theme.spacing(3)};
  margin-right: ${(props): string => props.theme.spacing(3)};
  margin-top: ${(props): string => props.theme.spacing(2)};
  margin-bottom: ${(props): string => props.theme.spacing(13)};
  border-radius: ${(props): string => props.theme.spacing(2)};
  border: 1px solid white;
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
  position: relative;
`;

const StyledFilterSortButton = styled(Button)`
  color: inherit;
  opacity: 0.5;
  padding: 0;
  text-transform: none;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledFilterOption = styled.div``;

const StyledFilterSortTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(1, 3)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledButtonLeftIconArea = styled.div`
  display: flex;
  justify-content: center;
`;

const StyledButtonLeftTextArea = styled.div`
  display: flex;
  justify-content: center;
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledButtonRightIconArea = styled.div`
  display: flex;
  justify-content: center;
`;

const StyledButtonRightTextArea = styled.div`
  display: flex;
  justify-content: center;
  padding-left: ${(props): string => props.theme.spacing(2)};
`;

const StyledInput = styled.input`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: none;
  width: 100%;
  height: 100%;
`;

const StyledLabel = styled.label`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  cursor: pointer;
  border-radius: inherit;
  width: 100%;
  height: 100%;
  &:hover {
    background-color: rgba(48, 91, 128, 0.04);
  }
`;

interface UploadDropzoneProps {
  selectedColor?: string;
  draggingFile?: boolean;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const UploadDropzone = React.memo((props: UploadDropzoneProps): JSX.Element => {
  const {
    selectedColor,
    draggingFile,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  } = props;
  return (
    <StyledUploadDropzone
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        borderStyle: draggingFile ? "dashed" : undefined,
      }}
    >
      <StyledUploadOverlayBackground
        style={{
          backgroundColor: selectedColor,
          opacity: draggingFile ? 0.2 : 0,
        }}
      />
      Drop Files Here
    </StyledUploadDropzone>
  );
});

interface UploadOverlayProps {
  selectedColor: string;
}

const UploadOverlay = React.memo((props: UploadOverlayProps): JSX.Element => {
  const { selectedColor } = props;
  return (
    <StyledUploadOverlay>
      <StyledUploadOverlayBackground
        style={{ backgroundColor: selectedColor, opacity: 0.5 }}
      />
    </StyledUploadOverlay>
  );
});

interface OptionMenuProps {
  anchorEl?: Element | ((element: Element) => Element);
  open?: boolean;
  options?: string[];
  path?: string;
  getOptionLabel?: (option: string) => string;
  getOptionIcon?: (option: string) => React.ReactNode;
  isOptionUpload?: (option: string) => boolean;
  isOptionDisabled?: (paths: string[], option: string) => boolean;
  onClose?: (
    event: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element>
  ) => void;
  onClick?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    option?: string
  ) => void;
}

const OptionMenu = React.memo((props: OptionMenuProps): JSX.Element => {
  const {
    anchorEl,
    open,
    options,
    path,
    getOptionLabel,
    getOptionIcon,
    isOptionUpload,
    isOptionDisabled,
    onClose,
    onClick,
  } = props;
  const theme = useTheme();
  const getIcon = useCallback(
    (option: string): React.ReactNode =>
      getOptionIcon ? getOptionIcon(option) : undefined,
    [getOptionIcon]
  );
  const getLabel = useCallback(
    (option: string): string =>
      getOptionLabel && option ? getOptionLabel(option) : option,
    [getOptionLabel]
  );
  const isUpload = useCallback(
    (option: string): boolean =>
      isOptionUpload ? isOptionUpload(option) : undefined,
    [isOptionUpload]
  );
  const isDisabled = useCallback(
    (option: string): boolean =>
      isOptionDisabled ? isOptionDisabled([path], option) : undefined,
    [isOptionDisabled, path]
  );
  return (
    <DrawerMenu anchorEl={anchorEl} open={open} onClose={onClose}>
      {options &&
        options.map((option) =>
          option.startsWith("---") ? (
            <StyledDividerArea key={option}>
              <StyledDivider />
            </StyledDividerArea>
          ) : (
            <MenuItem
              key={option}
              disabled={isDisabled(option)}
              onClick={
                onClick && (!isUpload || !isUpload(option))
                  ? (e): void => onClick(e, option)
                  : undefined
              }
            >
              {getIcon(option) && (
                <StyledFontIconArea>
                  <FontIcon
                    aria-label={option}
                    size={theme.fontSize.optionIcon}
                    style={{ opacity: 0.5 }}
                  >
                    {getIcon(option)}
                  </FontIcon>
                </StyledFontIconArea>
              )}
              {getLabel(option)}
              {isUpload(option) && (
                <>
                  <StyledInput
                    id={`console-list-option-file-input-${path}`}
                    type="file"
                    onChange={
                      onClick ? (e): void => onClick(e, option) : undefined
                    }
                  />
                  <StyledLabel
                    htmlFor={`console-list-option-file-input-${path}`}
                  />
                </>
              )}
            </MenuItem>
          )
        )}
    </DrawerMenu>
  );
});

interface EngineConsoleHeaderProps {
  minHeight?: number;
  cardDetails?: { [key: string]: CardDetail };
  sortLabel: string;
  filterLabel: string;
  sortKey?: string;
  defaultFilters?: { [key: string]: string };
  activeFilters?: { [key: string]: string };
  sortOrder?: Order;
  dividerStyle?: React.CSSProperties;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onFilter?: (filters: { [key: string]: string }) => void;
  onSort?: (key: string, option: Order) => void;
}

const EngineConsoleHeader = React.memo(
  (props: EngineConsoleHeaderProps): JSX.Element => {
    const {
      minHeight,
      cardDetails,
      sortLabel,
      filterLabel,
      sortKey,
      defaultFilters,
      activeFilters,
      sortOrder,
      dividerStyle,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      onFilter,
      onSort,
    } = props;

    const filterMenuAnchorRef = useRef<HTMLButtonElement>();
    const sortMenuAnchorRef = useRef<HTMLButtonElement>();
    const menuAnchorRef = useRef<HTMLButtonElement>();
    const [menuOpenKey, setMenuOpenKey] = useState<"sort" | "filter">();
    const [menuOpen, setMenuOpen] = useState(false);

    const theme = useTheme();

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.m !== prevState?.m) {
          setMenuOpenKey((currState.m as "filter" | "sort") || null);
          setMenuOpen(Boolean(currState.m as "filter" | "sort"));
        }
      },
      []
    );
    const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
      "m",
      handleBrowserNavigation
    );

    const handleOpenMenu = useCallback(
      (e: React.MouseEvent, menu: "sort" | "filter"): void => {
        if (menu === "sort") {
          menuAnchorRef.current = sortMenuAnchorRef.current;
        }
        if (menu === "filter") {
          menuAnchorRef.current = filterMenuAnchorRef.current;
        }
        e.preventDefault();
        e.stopPropagation();
        setMenuOpenKey(menu);
        setMenuOpen(true);
        openMenuDialog(menu);
      },
      [openMenuDialog]
    );

    const handleOpenFilterMenu = useCallback(
      (e: React.MouseEvent): void => {
        handleOpenMenu(e, "filter");
      },
      [handleOpenMenu]
    );

    const handleOpenSortMenu = useCallback(
      (e: React.MouseEvent): void => {
        handleOpenMenu(e, "sort");
        closeMenuDialog();
      },
      [closeMenuDialog, handleOpenMenu]
    );

    const handleCloseMenu = useCallback((e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(false);
    }, []);

    const handleClickMenuItem = useCallback(
      (e: React.MouseEvent, key: string, option: string) => {
        e.preventDefault();
        e.stopPropagation();
        handleCloseMenu(e);
        if (menuOpenKey === "filter") {
          if (onFilter) {
            onFilter({ ...activeFilters, [key]: option });
          }
        }
        if (menuOpenKey === "sort") {
          if (onSort) {
            onSort(key, option as Order);
          }
        }
      },
      [activeFilters, handleCloseMenu, menuOpenKey, onFilter, onSort]
    );

    const filterableDetails = useMemo(
      () => Object.entries(cardDetails).filter(([, value]) => value.filterable),
      [cardDetails]
    );

    const sortableDetails = useMemo(
      () => Object.entries(cardDetails).filter(([, value]) => value.sortable),
      [cardDetails]
    );

    return (
      <StyledCard
        elevation={0}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          minHeight: minHeight * 0.75,
        }}
      >
        {defaultFilters && Object.keys(defaultFilters).length > 0 && (
          <StyledFilterSortButton
            ref={filterMenuAnchorRef}
            variant="text"
            onClick={handleOpenFilterMenu}
          >
            <StyledButtonLeftIconArea style={{ minWidth: minHeight }}>
              <FontIcon aria-label={filterLabel} size={theme.fontSize.regular}>
                {Object.entries(activeFilters).every(
                  ([key, value]) => value === defaultFilters[key]
                ) ? (
                  <FilterRegularIcon />
                ) : (
                  <FilterSolidIcon />
                )}
              </FontIcon>
            </StyledButtonLeftIconArea>
            <StyledButtonLeftTextArea>
              {Object.keys(activeFilters)
                .filter((key) => activeFilters[key] !== defaultFilters[key])
                .map((activeFilterKey) => activeFilters[activeFilterKey])
                .join(", ")}
            </StyledButtonLeftTextArea>
          </StyledFilterSortButton>
        )}
        <StyledSpacer />
        <StyledFilterSortButton
          ref={sortMenuAnchorRef}
          variant="text"
          onClick={handleOpenSortMenu}
        >
          <StyledButtonRightTextArea>
            {cardDetails[sortKey]?.label}
          </StyledButtonRightTextArea>
          <StyledButtonRightIconArea style={{ minWidth: minHeight }}>
            <FontIcon aria-label={sortLabel} size={theme.fontSize.regular}>
              {sortOrder === "asc" ? (
                <ArrowUpRegularIcon />
              ) : (
                <ArrowDownRegularIcon />
              )}
            </FontIcon>
          </StyledButtonRightIconArea>
        </StyledFilterSortButton>
        <DrawerMenu
          anchorEl={menuAnchorRef.current}
          open={menuOpen}
          onClose={handleCloseMenu}
        >
          {menuOpenKey === "filter" && (
            <>
              <StyledFilterSortTypography>
                {filterLabel}
              </StyledFilterSortTypography>
              {filterableDetails.map(([key, value]) => (
                <StyledFilterOption key={key}>
                  <StyledDividerArea>
                    <StyledDivider />
                  </StyledDividerArea>
                  {Object.keys(value.filterable).map((filterableOption) => (
                    <MenuItem
                      key={filterableOption}
                      onClick={(e): void =>
                        handleClickMenuItem(e, key, filterableOption)
                      }
                      selected={activeFilters[key] === filterableOption}
                      style={{
                        backgroundColor:
                          activeFilters[key] === filterableOption
                            ? "#edf3f8"
                            : undefined,
                        color:
                          activeFilters[key] === filterableOption
                            ? theme.palette.primary.main
                            : undefined,
                      }}
                    >
                      <StyledFontIconArea
                        style={{
                          minWidth: theme.spacing(4),
                          minHeight: theme.spacing(4),
                        }}
                      >
                        {activeFilters[key] === filterableOption && (
                          <FontIcon
                            aria-label={value.label}
                            size={theme.fontSize.regular}
                          >
                            <CheckRegularIcon />
                          </FontIcon>
                        )}
                      </StyledFontIconArea>
                      {filterableOption}
                    </MenuItem>
                  ))}
                </StyledFilterOption>
              ))}
            </>
          )}
          {menuOpenKey === "sort" && (
            <>
              <StyledFilterSortTypography>
                {sortLabel}
              </StyledFilterSortTypography>
              <StyledDividerArea>
                <StyledDivider />
              </StyledDividerArea>
              {sortableDetails.map(([key, value]) => (
                <MenuItem
                  key={key}
                  onClick={(e): void =>
                    handleClickMenuItem(
                      e,
                      key,
                      sortOrder === "asc" ? "desc" : "asc"
                    )
                  }
                  selected={sortKey === key}
                  style={{
                    backgroundColor: sortKey === key ? "#edf3f8" : undefined,
                    color:
                      sortKey === key ? theme.palette.primary.main : undefined,
                  }}
                >
                  <StyledFontIconArea
                    style={{
                      minWidth: theme.spacing(4),
                      minHeight: theme.spacing(4),
                    }}
                  >
                    {sortKey === key && (
                      <FontIcon
                        aria-label={value.label}
                        size={theme.fontSize.regular}
                      >
                        {sortOrder === "asc" ? (
                          <ArrowUpRegularIcon />
                        ) : (
                          <ArrowDownRegularIcon />
                        )}
                      </FontIcon>
                    )}
                  </StyledFontIconArea>
                  {value.label}
                </MenuItem>
              ))}
            </>
          )}
        </DrawerMenu>
        <StyledDivider absolute style={dividerStyle} />
      </StyledCard>
    );
  }
);

interface EngineConsoleFooterProps {
  minHeight?: number;
  label?: React.ReactNode;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const EngineConsoleFooter = React.memo(
  (props: EngineConsoleFooterProps): JSX.Element => {
    const { minHeight, label, onDragEnter, onDragLeave, onDragOver, onDrop } =
      props;
    const theme = useTheme();
    return (
      <StyledCard
        elevation={0}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          minHeight: minHeight * 0.75,
          padding: theme.spacing(0, 4),
          alignItems: "center",
          justifyContent: "flex-end",
          color: theme.palette.grey[400],
          fontSize: theme.typography.button.fontSize,
        }}
      >
        {label}
      </StyledCard>
    );
  }
);

interface EngineConsoleEmptyCardProps {
  minHeight: number;
  children?: React.ReactNode;
  dividerStyle?: React.CSSProperties;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const EngineConsoleEmptyCard = React.memo(
  (props: EngineConsoleEmptyCardProps): JSX.Element => {
    const {
      minHeight,
      dividerStyle,
      children,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    } = props;

    return (
      <StyledCard
        elevation={0}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{ minHeight }}
      >
        <StyledCellArea style={{ alignItems: "center", opacity: 0.5 }}>
          {children}
        </StyledCellArea>
        <StyledDivider absolute style={dividerStyle} />
      </StyledCard>
    );
  }
);

interface EngineConsoleCardItemContentProps {
  loading: boolean;
  cardDetails?: { [key: string]: CardDetail };
  height: number;
  rowImagePlaceholder?: string;
  rowPath?: string;
  rowNameKey?: string;
  rowImage?: string;
  rowIcon?: React.ReactNode;
  rowColor?: string;
  rowDisplayValues?: { [key: string]: string };
  iconColor?: string;
  selectedPaths?: string[];
  contextOptions?: string[];
  contextHeaderOpen?: boolean;
  paths?: string[];
  draggingFile?: boolean;
  uploadState?:
    | "pending"
    | "running"
    | "paused"
    | "success"
    | "canceled"
    | "error"
    | "ready";
  uploadBytesTransferred?: number;
  uploadTotalBytes?: number;
  selectedColor: string;
  loadingAnimation?: "fade" | "pulse" | "wave" | false;
  dividerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  onSelect?: (paths: string[]) => void;
  onClick?: (e: React.MouseEvent, path: string) => void;
  onMore?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    path: string,
    option: string
  ) => void;
  onContextMenu?: (e: React.MouseEvent, path: string) => void;
  onDragEnter?: (e: React.DragEvent, path: string) => void;
  onDragLeave?: (e: React.DragEvent, path: string) => void;
  onDragOver?: (e: React.DragEvent, path: string) => void;
  onDrop?: (e: React.DragEvent, path: string) => void;
  isContextAllowed?: (path: string) => boolean;
  getRowMoreOptions?: (path: string) => string[];
  getOptionIcon?: (option: string) => React.ReactNode;
  getOptionLabel?: (option: string) => string;
  isOptionUpload?: (option: string) => boolean;
  isOptionDisabled?: (paths: string[], option: string) => boolean;
}

const EngineConsoleItemCardContent = React.memo(
  (props: EngineConsoleCardItemContentProps): JSX.Element => {
    const {
      loading,
      cardDetails,
      height,
      rowPath = "",
      rowNameKey = "",
      rowImagePlaceholder,
      rowImage = "",
      rowIcon,
      rowColor = "",
      rowDisplayValues,
      iconColor = "white",
      selectedPaths,
      contextOptions,
      contextHeaderOpen,
      paths,
      draggingFile,
      uploadState,
      uploadBytesTransferred,
      uploadTotalBytes,
      selectedColor,
      loadingAnimation,
      dividerStyle,
      style,
      onSelect,
      onClick,
      onMore,
      onContextMenu,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      isContextAllowed,
      getRowMoreOptions,
      getOptionIcon,
      getOptionLabel,
      isOptionUpload,
      isOptionDisabled,
    } = props;

    const theme = useTheme();
    const isRowSelected = selectedPaths && selectedPaths.includes(rowPath);

    const canSelect =
      contextOptions?.length > 0 &&
      (!isContextAllowed || isContextAllowed(rowPath));
    const selectOnClick =
      canSelect && contextHeaderOpen && contextOptions?.length === 1;
    const toggleSelectOnClick = canSelect && contextOptions?.length > 1;

    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [menuOpen, setMenuOpen] = useState<boolean>();

    const handleClick = useCallback(
      (e: React.MouseEvent): void => {
        if (selectOnClick && onSelect) {
          onSelect(
            select(
              e,
              () => toggleSelection(rowPath, selectedPaths || []),
              () => toggleSelection(rowPath, selectedPaths || []),
              () => multiSelection(rowPath, selectedPaths, paths || [])
            )
          );
        } else if (onClick) {
          onClick(e, rowPath);
        }
      },
      [selectOnClick, rowPath, onSelect, selectedPaths, paths, onClick]
    );
    const handleDragOver = useCallback(
      (e: React.DragEvent): void => {
        if (onDragOver) {
          onDragOver(e, rowPath);
        }
      },
      [onDragOver, rowPath]
    );
    const handleDragEnter = useCallback(
      (e: React.DragEvent): void => {
        if (onDragEnter) {
          onDragEnter(e, rowPath);
        }
      },
      [onDragEnter, rowPath]
    );
    const handleDragLeave = useCallback(
      (e: React.DragEvent): void => {
        if (onDragLeave) {
          onDragLeave(e, rowPath);
        }
      },
      [onDragLeave, rowPath]
    );
    const handleDrop = useCallback(
      (e: React.DragEvent): void => {
        if (onDrop) {
          onDrop(e, rowPath);
        }
      },
      [onDrop, rowPath]
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        if (onSelect) {
          onSelect([rowPath]);
        }
        if (onSelect) {
          onContextMenu(e, rowPath);
        }
      },
      [onContextMenu, onSelect, rowPath]
    );

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.m !== prevState?.m) {
          setMenuOpen(currState.m === "options");
        }
      },
      []
    );
    const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
      "m",
      handleBrowserNavigation
    );

    const handleOpenMenu = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setMenuAnchor(e.currentTarget as HTMLElement);
        setMenuOpen(true);
        openMenuDialog("options");
      },
      [openMenuDialog]
    );

    const handleCloseMenu = useCallback(
      (
        e:
          | React.MouseEvent
          | React.KeyboardEvent
          | React.ChangeEvent<HTMLInputElement>
      ): void => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
        closeMenuDialog();
      },
      [closeMenuDialog]
    );

    const handleClickMenuItem = useCallback(
      (
        e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
        option: string
      ) => {
        e.preventDefault();
        e.stopPropagation();
        handleCloseMenu(e);
        if (onMore) {
          onMore(e, rowPath, option);
        }
      },
      [handleCloseMenu, onMore, rowPath]
    );

    const handleToggleSelect = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onSelect) {
          onSelect(
            select(
              e,
              () => toggleSelection(rowPath, selectedPaths || []),
              () => toggleSelection(rowPath, selectedPaths || []),
              () => multiSelection(rowPath, selectedPaths, paths || [])
            )
          );
        }
      },
      [onSelect, paths, rowPath, selectedPaths]
    );

    const uploadPercentage =
      uploadTotalBytes &&
      (uploadState === "pending" ||
        uploadState === "running" ||
        uploadState === "paused" ||
        uploadState === "success")
        ? Math.max(0, (uploadBytesTransferred / uploadTotalBytes) * 100)
        : undefined;

    const percentage =
      uploadPercentage !== undefined ? uploadPercentage : undefined;

    const rowName = rowDisplayValues?.[rowNameKey] || "";

    const moreOptions = useMemo(
      () => (getRowMoreOptions ? getRowMoreOptions(rowPath) : []),
      [getRowMoreOptions, rowPath]
    );

    return (
      <StyledMotionCardArea
        initial={1}
        animate={loading && loadingAnimation === "fade" ? 0.5 : 1}
        duration={0.1}
        style={style}
      >
        <StyledCard
          id={rowPath}
          elevation={0}
          onContextMenu={handleContextMenu}
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          aria-checked={isRowSelected}
          style={{
            minHeight: height,
            maxHeight: height,
          }}
        >
          <StyledBackground
            style={{
              backgroundColor: isRowSelected ? selectedColor : undefined,
              opacity: 0.5,
            }}
          />
          <StyledCardActionArea component="div">
            <StyledRow>
              <StyledCell
                style={{
                  marginRight: theme.spacing(2),
                }}
              >
                <StyledIconArea
                  style={{
                    minWidth: height,
                    minHeight: height,
                    maxHeight: height,
                  }}
                >
                  <StyledIconContent
                    style={{
                      backgroundColor: isRowSelected
                        ? theme.palette.secondary.main
                        : (!loading || loadingAnimation === "fade") &&
                          (!rowImage || selectOnClick)
                        ? rowColor
                        : undefined,
                    }}
                  >
                    {loading && loadingAnimation !== "fade" ? (
                      <Skeleton
                        variant="rectangular"
                        height="100%"
                        animation={loadingAnimation}
                      />
                    ) : (
                      <StyledDarkOverlay
                        style={{
                          backgroundColor:
                            !selectOnClick && rowImage
                              ? "transparent"
                              : undefined,
                        }}
                      >
                        {percentage !== undefined ? (
                          <>
                            <StyledBackground
                              style={{ backgroundColor: "white" }}
                            />
                            <StyledProgressBar
                              style={{
                                transformOrigin: "left center",
                                transform: `scaleX(${percentage / 100})`,
                                backgroundColor: "black",
                              }}
                            />
                            <StyledPercentageTypography
                              variant="caption"
                              style={{
                                color: "white",
                                mixBlendMode: "difference",
                              }}
                            >{`${Math.round(
                              percentage
                            )}%`}</StyledPercentageTypography>
                            <StyledBackground
                              style={{
                                backgroundColor: theme.palette.secondary.main,
                                mixBlendMode: "screen",
                              }}
                            />
                          </>
                        ) : (
                          <>
                            {!selectOnClick && (
                              <>
                                <TransparencyPattern />
                                <Avatar
                                  backgroundColor={rowColor}
                                  src={rowImage}
                                  alt={rowName}
                                  icon={rowIcon}
                                  iconColor={iconColor}
                                  style={{
                                    borderRadius: "inherit",
                                    width: "100%",
                                    height: "100%",
                                  }}
                                  placeholder={rowImagePlaceholder}
                                />
                              </>
                            )}
                            {selectOnClick && (
                              <StyledCheckbox checked={isRowSelected} />
                            )}
                          </>
                        )}
                      </StyledDarkOverlay>
                    )}
                    {toggleSelectOnClick && (
                      <StyledButton
                        style={{
                          position: "absolute",
                          top: -1,
                          bottom: -1,
                          left: -1,
                          right: -1,
                          minWidth: 0,
                          width: "calc(100% + 2px)",
                        }}
                        onClick={handleToggleSelect}
                      >
                        {isRowSelected && (
                          <>
                            <StyledBackground
                              style={{
                                backgroundColor: selectedColor,
                                opacity: 0.9,
                              }}
                            />
                            <StyledBackground>
                              <FontIcon
                                aria-label="Select"
                                size={theme.fontSize.smallIcon}
                              >
                                <CheckRegularIcon />
                              </FontIcon>
                            </StyledBackground>
                          </>
                        )}
                      </StyledButton>
                    )}
                  </StyledIconContent>
                </StyledIconArea>
              </StyledCell>
              <StyledCell
                style={{
                  flex: 1,
                }}
              >
                <StyledCellArea
                  style={{
                    opacity: percentage !== undefined ? 0.5 : undefined,
                  }}
                >
                  <StyledNameTypography>
                    {loading && loadingAnimation !== "fade" ? (
                      <Skeleton width={160} animation={loadingAnimation} />
                    ) : (
                      rowDisplayValues?.[rowNameKey] || ""
                    )}
                  </StyledNameTypography>
                  <StyledCaptionArea>
                    <StyledCaptionTypography variant="caption">
                      {loading && loadingAnimation !== "fade" ? (
                        <Skeleton width={100} animation={loadingAnimation} />
                      ) : (
                        Object.entries(cardDetails)
                          ?.filter(
                            ([key, value]) =>
                              key !== rowNameKey &&
                              value.displayed &&
                              rowDisplayValues?.[key]
                          )
                          .map(([key]) => rowDisplayValues?.[key] || "")
                          .join(" | ")
                      )}
                    </StyledCaptionTypography>
                  </StyledCaptionArea>
                </StyledCellArea>
              </StyledCell>
              {!contextHeaderOpen &&
                moreOptions &&
                moreOptions.length > 0 &&
                !selectedPaths.includes(rowPath) && (
                  <StyledCell>
                    <StyledIconButton
                      color="inherit"
                      onMouseDown={(e): void => {
                        e.stopPropagation();
                      }}
                      onPointerDown={(e): void => {
                        e.stopPropagation();
                      }}
                      onTouchStart={(e): void => {
                        e.stopPropagation();
                      }}
                      onClick={handleOpenMenu}
                      style={{
                        minWidth: height,
                        minHeight: height,
                        maxHeight: height,
                      }}
                    >
                      <FontIcon
                        aria-label="Options"
                        size={theme.fontSize.smallIcon}
                        style={{ opacity: 0.5 }}
                      >
                        <EllipsisVerticalRegularIcon />
                      </FontIcon>
                    </StyledIconButton>
                    {menuOpen !== undefined && (
                      <OptionMenu
                        anchorEl={menuAnchor}
                        open={menuOpen}
                        options={moreOptions}
                        path={rowPath}
                        getOptionIcon={getOptionIcon}
                        getOptionLabel={getOptionLabel}
                        isOptionUpload={isOptionUpload}
                        isOptionDisabled={isOptionDisabled}
                        onClose={handleCloseMenu}
                        onClick={handleClickMenuItem}
                      />
                    )}
                  </StyledCell>
                )}
            </StyledRow>
          </StyledCardActionArea>
          <StyledDivider absolute style={dividerStyle} />
          {draggingFile && <UploadOverlay selectedColor={selectedColor} />}
        </StyledCard>
      </StyledMotionCardArea>
    );
  }
);

interface EngineConsoleCardItemCardProps {
  index?: number;
  paths?: string[];
  loading?: boolean;
  cardDetails?: { [key: string]: CardDetail };
  height: number;
  containers?: { [path: string]: string[] };
  draggingFilePath?: string;
  rowNameKey?: string;
  selectedPaths?: string[];
  contextOptions?: string[];
  contextHeaderOpen?: boolean;
  selectedColor?: string;
  loadingAnimation?: "fade" | "pulse" | "wave" | false;
  dividerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  onSelect?: (paths: string[]) => void;
  onClick?: (e: React.MouseEvent, path: string) => void;
  onMore?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    path: string,
    option: string
  ) => void;
  onContextMenu?: (e: React.MouseEvent, path: string) => void;
  onDragEnter?: (e: React.DragEvent, path: string) => void;
  onDragLeave?: (e: React.DragEvent, path: string) => void;
  onDragOver?: (e: React.DragEvent, path: string) => void;
  onDrop?: (e: React.DragEvent, path: string) => void;
  isContextAllowed?: (path: string) => boolean;
  getRowImage?: (path: string) => string;
  getRowImagePlaceholder?: (path: string) => string;
  getRowIcon?: (path: string) => React.ReactNode;
  getRowColor?: (path: string) => string;
  getRowMoreOptions?: (path: string) => string[];
  getOptionIcon?: (option: string) => React.ReactNode;
  getOptionLabel?: (option: string) => string;
  isOptionUpload?: (option: string) => boolean;
  isOptionDisabled?: (paths: string[], option: string) => boolean;
  getCellDisplayValue?: (path: string, key: string) => string;
}

const EngineConsoleItemCard = React.memo(
  (props: EngineConsoleCardItemCardProps): JSX.Element => {
    const {
      index,
      paths,
      loading,
      cardDetails,
      height,
      containers,
      draggingFilePath,
      rowNameKey = "",
      selectedPaths,
      contextOptions,
      contextHeaderOpen,
      selectedColor,
      loadingAnimation,
      dividerStyle,
      style,
      onSelect,
      onClick,
      onMore,
      onContextMenu,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      isContextAllowed,
      getRowImage,
      getRowImagePlaceholder,
      getRowIcon,
      getRowColor,
      getRowMoreOptions,
      getOptionIcon,
      getOptionLabel,
      isOptionUpload,
      isOptionDisabled,
      getCellDisplayValue,
    } = props;

    const path = paths?.[index] || "";

    const containerItemPaths = containers?.[path];

    const [userState] = useContext(UserContext);

    const allPaths = useMemo(() => {
      return containerItemPaths || [path];
    }, [containerItemPaths, path]);

    const uploadProgressRef = useRef<
      {
        path: string;
        file: File;
        metadata: StorageFile;
        state:
          | "pending"
          | "running"
          | "paused"
          | "success"
          | "canceled"
          | "error"
          | "ready";
        bytesTransferred?: number;
        task?: UploadTask;
      }[]
    >();
    const uploadProgress = useMemo(() => {
      const newPathUploads = allPaths.map((p) => userState?.uploads?.[p]);
      if (
        Object.values(uploadProgressRef.current || [])
          .map((x) => JSON.stringify([x?.path, x?.state, x?.bytesTransferred]))
          .join(",") !==
        Object.values(newPathUploads || [])
          .map((x) => JSON.stringify([x?.path, x?.state, x?.bytesTransferred]))
          .join(",")
      ) {
        uploadProgressRef.current = newPathUploads;
      }
      return uploadProgressRef.current;
    }, [allPaths, userState?.uploads]);

    const uploadState = useMemo(
      () => uploadProgress?.[(uploadProgress?.length || 0) - 1]?.state,
      [uploadProgress]
    );

    const uploadBytesTransferred = useMemo(
      () =>
        uploadProgress
          .map((x) => x?.bytesTransferred || 0)
          .reduce((a, b) => a + b, 0),
      [uploadProgress]
    );

    const uploadTotalBytes = useMemo(
      () =>
        uploadProgress
          .map((x) => x?.file?.size || 0)
          .reduce((a, b) => a + b, 0),
      [uploadProgress]
    );

    const rowDisplayValues: { [key: string]: string } = useMemo(() => {
      const displayValues = {};
      if (cardDetails) {
        Object.entries(cardDetails).forEach(([key]) => {
          displayValues[key] = getCellDisplayValue
            ? getCellDisplayValue(path, key)
            : path;
        });
      }
      return displayValues;
    }, [cardDetails, getCellDisplayValue, path]);

    const rowImage = getRowImage ? getRowImage(path) || "" : "";
    const rowIcon = getRowIcon
      ? containerItemPaths
        ? getRowIcon(path) || <FolderRegularIcon />
        : getRowIcon(path)
      : undefined;
    const rowColor = getRowColor
      ? containerItemPaths
        ? getRowColor(path) || "#5f6368"
        : getRowColor(path)
      : "";
    const rowImagePlaceholder = getRowImagePlaceholder?.(path);

    const draggingFile = draggingFilePath && draggingFilePath === path;

    return (
      <EngineConsoleItemCardContent
        loading={loading}
        height={height}
        rowPath={path}
        rowNameKey={rowNameKey}
        rowImage={rowImage}
        rowImagePlaceholder={rowImagePlaceholder}
        rowIcon={rowIcon}
        rowColor={rowColor}
        rowDisplayValues={rowDisplayValues}
        selectedPaths={selectedPaths}
        contextOptions={contextOptions}
        contextHeaderOpen={contextHeaderOpen}
        paths={paths}
        cardDetails={cardDetails}
        draggingFile={draggingFile}
        uploadState={uploadState}
        uploadBytesTransferred={uploadBytesTransferred}
        uploadTotalBytes={uploadTotalBytes}
        selectedColor={selectedColor}
        loadingAnimation={loadingAnimation}
        dividerStyle={dividerStyle}
        style={style}
        onClick={onClick}
        onMore={onMore}
        onContextMenu={onContextMenu}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onSelect={onSelect}
        isContextAllowed={isContextAllowed}
        getRowMoreOptions={getRowMoreOptions}
        getOptionIcon={getOptionIcon}
        getOptionLabel={getOptionLabel}
        isOptionUpload={isOptionUpload}
        isOptionDisabled={isOptionDisabled}
      />
    );
  }
);

interface EngineConsoleListProps {
  scrollParent?: HTMLElement;
  paths: string[];
  cardDetails: { [key: string]: CardDetail };
  title?: string;
  createLabel: string;
  addLabel: string;
  searchLabel?: string;
  contextOptions?: string[];
  editMultipleLabel?: string;
  selectedLabel?: string;
  selectAllLabel?: string;
  deselectAllLabel?: string;
  backLabel?: string;
  doneLabel?: string;
  clearLabel?: string;
  noneLabel?: string;
  sortLabel?: string;
  filterLabel?: string;
  footerLabel?: React.ReactNode;
  addIcon?: React.ReactNode;
  uploadIcon?: React.ReactNode;
  defaultSortKey?: string;
  defaultSortOrder?: Order;
  rowNameKey?: string;
  currentPath?: string;
  loading?: boolean;
  createDisabled?: boolean;
  maxWidth?: number;
  emptyBackground?: React.ReactNode;
  rowHeight?: number;
  selectedColor?: string;
  updateInterval?: number;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: React.CSSProperties;
  upload?: boolean;
  belowBreakpoint?: boolean;
  sticky?: "always" | "collapsible" | "never";
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  rotateStyle?: React.CSSProperties;
  backButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  clearButtonStyle?: React.CSSProperties;
  doneButtonStyle?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  paperStyle?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  getUploadLabel?: (path: string) => string;
  getRowImage?: (path: string) => string;
  getRowImagePlaceholder?: (path: string) => string;
  getRowIcon: (path: string) => React.ReactNode;
  getRowColor: (path: string) => string;
  getRowMoreOptions?: (path: string) => string[];
  getOptionIcon?: (option: string) => React.ReactNode;
  getOptionLabel?: (option: string) => string;
  isOptionUpload?: (option: string) => boolean;
  isOptionDisabled?: (paths: string[], option: string) => boolean;
  getCellDisplayValue?: (path: string, key: string) => string;
  getCellSortValue?: (path: string, key: string) => string | number;
  onChangeCurrentPath?: (path: string) => void;
  isUploadAllowed?: (path: string) => boolean;
  isContextAllowed?: (path: string) => boolean;
  onClickContextOption?: (paths: string[], option: string) => void;
  onClickUrlButton?: (path: string) => void;
  onClick?: (e: React.MouseEvent, path: string) => void;
  onDragEnter?: (e: React.DragEvent, path: string) => void;
  onDragLeave?: (e: React.DragEvent, path: string) => void;
  onDragOver?: (e: React.DragEvent, path: string) => void;
  onDrop?: (e: React.DragEvent, path: string) => void;
  onUploadFiles?: (files: FileList, path: string) => void;
  onMore?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    path: string,
    option: string
  ) => void;
  onAdd?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    path: string,
    option?: string
  ) => void;
  onReorder?: (paths: string[]) => void;
}

export const EngineConsoleList = React.memo(
  (props: EngineConsoleListProps): JSX.Element => {
    const theme = useTheme();

    const {
      scrollParent,
      paths,
      currentPath,
      cardDetails,
      contextOptions,
      editMultipleLabel,
      selectedLabel,
      selectAllLabel,
      deselectAllLabel,
      backLabel,
      doneLabel,
      clearLabel,
      noneLabel,
      sortLabel,
      filterLabel,
      footerLabel,
      addIcon = <PlusSolidIcon />,
      uploadIcon = <UploadSolidIcon />,
      defaultSortKey = "name",
      defaultSortOrder = "asc",
      rowNameKey = "name",
      loading,
      title,
      createLabel,
      addLabel,
      searchLabel,
      createDisabled,
      emptyBackground,
      maxWidth,
      rowHeight = 64,
      selectedColor = "#edf3f8",
      updateInterval = 60000,
      fixedStyle,
      stickyStyle = {
        position: "sticky",
        zIndex: 2,
        boxShadow: theme.shadows[3],
      },
      sticky,
      upload,
      belowBreakpoint,
      headerStyle,
      leftStyle,
      rotateStyle,
      backButtonStyle,
      moreButtonStyle,
      searchButtonStyle,
      clearButtonStyle,
      doneButtonStyle,
      dividerStyle,
      paperStyle,
      buttonStyle,
      style,
      getUploadLabel,
      getRowImage,
      getRowImagePlaceholder,
      getRowIcon,
      getRowColor,
      getRowMoreOptions,
      getOptionIcon,
      getOptionLabel,
      isOptionUpload,
      isOptionDisabled,
      getCellDisplayValue,
      getCellSortValue,
      isUploadAllowed,
      isContextAllowed,
      onClickContextOption,
      onClick,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      onChangeCurrentPath,
      onUploadFiles,
      onMore,
      onAdd,
      onReorder,
    } = props;

    const [initialized, setInitialized] = useState(false);
    const [loadingState, setLoadingState] = useState(loading);
    const [cardDetailsState, setCardDetailsState] = useState(cardDetails);
    const [activeFilters, setActiveFilters] = useState<{
      [key: string]: string;
    }>({});
    const searchTextQueryRef = useRef<SearchTextQuery>();
    const [searchTextQuery, setSearchTextQuery] = useState(
      searchTextQueryRef.current
    );
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [sortOrder, setSortOrder] = useState<Order>(defaultSortOrder);
    const [sortKey, setSortKey] = useState<string>(
      defaultSortKey || Object.keys(cardDetails)[0]
    );
    const [contextHeaderOpen, setContextHeaderOpen] = useState(false);
    const [draggingFilePath, setDraggingFilePath] = useState<string>("");
    const [currentContainers, setCurrentContainers] = useState<{
      [path: string]: string[];
    }>({});
    const [orderedPaths, setOrderedPaths] = useState<string[]>();
    const [pathTransitionIndex, setPathTransitionIndex] = useState(
      currentPath?.split("/").length || 0
    );
    const [previousPathTransitionIndex, setPreviousPathTransitionIndex] =
      useState(0);
    const [optionsMenuReference, setOptionsMenuReference] = React.useState<
      "anchorEl" | "anchorPosition"
    >("anchorEl");
    const [optionsMenuAnchorEl, setOptionsMenuAnchorEl] =
      React.useState<HTMLElement | null>(null);
    const [optionsMenuPosition, setOptionsMenuPosition] = React.useState<{
      top: number;
      left: number;
    }>();
    const [optionsMenuOpen, setOptionsMenuOpen] = useState<boolean>();
    const [, forceUpdate] = useState({});
    const draggingFileTargetRef = useRef<HTMLElement>();

    const empty = !loadingState && paths.length === 0;

    const addButtonLabel = empty ? createLabel : addLabel;
    const toolbarType = contextHeaderOpen
      ? "context"
      : searchTextQuery
      ? "filter_text"
      : "default";
    const addButtonAreaSpacing = theme.spacing(3);

    const pathSegments = useMemo(() => currentPath?.split("/"), [currentPath]);

    const selectablePaths = useMemo(
      () =>
        isContextAllowed
          ? orderedPaths?.filter((path) => isContextAllowed(path))
          : orderedPaths,
      [isContextAllowed, orderedPaths]
    );

    const isAllSelected =
      selectedPaths?.length > 0 &&
      difference(selectablePaths, selectedPaths).length === 0;

    const menuOptions = useMemo(() => {
      const options = [
        {
          key: isAllSelected ? deselectAllLabel : selectAllLabel,
          label: isAllSelected ? deselectAllLabel : selectAllLabel,
          icon: isAllSelected
            ? ((<SquareCheckSolidIcon />) as React.ReactNode)
            : ((<SquareRegularIcon />) as React.ReactNode),
          disabled: selectablePaths?.length === 0,
          persistOnClick: true,
        },
      ];
      contextOptions.forEach((option) => {
        options.push({
          key: option,
          label: getOptionLabel ? getOptionLabel(option) : option,
          icon: getOptionIcon ? getOptionIcon(option) : undefined,
          disabled: isOptionDisabled
            ? isOptionDisabled(selectedPaths, option)
            : undefined,
          persistOnClick: false,
        });
      });
      return options;
    }, [
      contextOptions,
      deselectAllLabel,
      getOptionIcon,
      getOptionLabel,
      isAllSelected,
      isOptionDisabled,
      selectAllLabel,
      selectablePaths?.length,
      selectedPaths,
    ]);

    const defaultFilters: {
      [key: string]: string;
    } = useMemo(() => {
      const filters = {};
      Object.entries(cardDetailsState)
        .filter(([, value]) => value.filterable)
        .forEach(([key, value]) => {
          const [defaultFilterKey] = Object.entries(value.filterable).filter(
            ([, value]) => value === ""
          )[0];
          filters[key] = defaultFilterKey;
        });
      return filters;
    }, [cardDetailsState]);

    const searchable = useMemo(
      () =>
        Object.entries(cardDetails).filter(([, value]) => value.searchable)
          .length > 0,
      [cardDetails]
    );

    const handleGetCellDisplayValue = useCallback(
      (path: string, key: string): string => {
        if (path.endsWith("/") && key === rowNameKey) {
          const trimmedPath = path.substring(0, path.length - 1);
          return trimmedPath.substring(trimmedPath.lastIndexOf("/") + 1);
        }
        return getCellDisplayValue ? getCellDisplayValue(path, key) : path;
      },
      [getCellDisplayValue, rowNameKey]
    );

    useEffect(() => {
      setLoadingState(loading);
      if (!paths) {
        return (): void => null;
      }

      if (loading) {
        return (): void => null;
      }

      if (!loading && paths.length === 0) {
        setInitialized(true);
        setCurrentContainers({});
        setOrderedPaths([]);
        if (onReorder) {
          onReorder([]);
        }
        return (): void => null;
      }

      const containers: { [path: string]: string[] } = {};
      const currentPaths: { [path: string]: string } = {};
      paths.forEach((p): void => {
        let path = p;
        if (currentPath) {
          const nextSlashIndex = p.indexOf("/", currentPath.length + 1);
          if (nextSlashIndex >= 0) {
            const containerPath = p.substring(0, nextSlashIndex + 1);
            if (!containers[containerPath]) {
              containers[containerPath] = [];
            }
            containers[containerPath].push(p);
            path = containerPath;
          }
        }
        if (
          currentPath &&
          (!path.startsWith(currentPath) || path === currentPath)
        ) {
          return;
        }
        if (
          searchTextQuery &&
          !Object.entries(cardDetails).some(([key, value]): boolean => {
            if (!value.searchable) {
              return false;
            }
            const displayValue = handleGetCellDisplayValue(path, key);
            return displayValue
              .toLowerCase()
              .includes(searchTextQuery?.search?.toLowerCase());
          })
        ) {
          return;
        }
        if (
          activeFilters &&
          Object.keys(activeFilters).length > 0 &&
          !Object.entries(cardDetails).some(([key, value]): boolean => {
            if (!value.filterable) {
              return false;
            }
            const displayValue = handleGetCellDisplayValue(path, key);
            const activeFilterValue = value.filterable[activeFilters[key]];
            return (
              !activeFilterValue ||
              activeFilterValue === "" ||
              (activeFilterValue.endsWith("*") &&
                displayValue.startsWith(
                  activeFilterValue.substring(0, activeFilterValue.length - 1)
                )) ||
              activeFilterValue === displayValue
            );
          })
        ) {
          return;
        }
        currentPaths[path] = p;
      });

      setInitialized(true);
      setCardDetailsState(cardDetails);
      setCurrentContainers(containers);
      const newOrderedPaths = Object.keys(currentPaths).sort((a, b) => {
        const getSortValue = (p: string): string | number =>
          getCellSortValue
            ? getCellSortValue(p, sortKey)
            : handleGetCellDisplayValue(p, sortKey);
        const result = getSortValue(a) > getSortValue(b) ? 1 : -1;
        if (sortOrder === "desc") {
          return -result;
        }
        return result;
      });
      setOrderedPaths(newOrderedPaths);
      if (onReorder) {
        onReorder(newOrderedPaths);
      }
      const newPathTransitionIndex = currentPath?.split("/").length || 0;
      setPathTransitionIndex(newPathTransitionIndex);
      setPreviousPathTransitionIndex(pathTransitionIndex);
      return (): void => null;
    }, [
      paths,
      sortOrder,
      currentPath,
      searchTextQuery,
      cardDetails,
      activeFilters,
      handleGetCellDisplayValue,
      getCellSortValue,
      sortKey,
      loading,
      pathTransitionIndex,
      onReorder,
    ]);

    const handleSelect = useCallback(
      (paths: string[]): void => {
        setSelectedPaths(
          isContextAllowed
            ? paths.filter((path) => isContextAllowed(path))
            : paths
        );
      },
      [isContextAllowed]
    );

    const handleSelectAll = useCallback((): void => {
      setSelectedPaths(selectablePaths);
    }, [selectablePaths]);
    const handleDeselectAll = useCallback((): void => {
      setSelectedPaths([]);
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedSearch = useCallback(
      debounce(() => {
        setSearchTextQuery(searchTextQueryRef.current);
      }, 200),
      []
    );

    const handleSearch = useCallback(
      (
        e: React.ChangeEvent<HTMLInputElement>,
        searchTextQuery: SearchTextQuery
      ) => {
        searchTextQueryRef.current = searchTextQuery;
        handleDebouncedSearch();
      },
      [handleDebouncedSearch]
    );

    const handleSort = useCallback((key: string, option: Order): void => {
      setSortOrder(option);
      setSortKey(key);
    }, []);

    const handleFilter = useCallback(
      (filters: { [x: string]: string }): void => {
        setActiveFilters(filters);
      },
      []
    );

    const handleCloseSearch = useCallback((): void => {
      handleSearch(undefined, null);
    }, [handleSearch]);

    const handleOpenContextHeader = useCallback(
      (e: React.MouseEvent, path: string): void => {
        if (!isContextAllowed || isContextAllowed(path)) {
          setContextHeaderOpen(true);
        }
      },
      [isContextAllowed]
    );

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.m !== prevState?.m) {
          setOptionsMenuOpen(currState.m === "options");
        }
      },
      []
    );
    const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
      "m",
      handleBrowserNavigation
    );

    const handleOpenContextMenu = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!isContextAllowed || isContextAllowed(currentPath)) {
          setOptionsMenuReference(
            e.button === 2 ? "anchorPosition" : "anchorEl"
          );
          setOptionsMenuAnchorEl(e.currentTarget as HTMLElement);
          setOptionsMenuPosition({ left: e.clientX, top: e.clientY });
          setOptionsMenuOpen(true);
          openMenuDialog("options");
        }
      },
      [currentPath, isContextAllowed, openMenuDialog]
    );

    const handleOpenContext = useCallback(
      (e: React.MouseEvent): void => {
        if (contextOptions?.length > 1) {
          handleOpenContextMenu(e);
        } else {
          handleOpenContextHeader(e, currentPath);
        }
      },
      [
        contextOptions?.length,
        currentPath,
        handleOpenContextHeader,
        handleOpenContextMenu,
      ]
    );

    const handleCloseContextHeader = useCallback((): void => {
      setContextHeaderOpen(false);
      setSelectedPaths([]);
    }, []);

    const handleCloseContextMenu = useCallback((): void => {
      setOptionsMenuOpen(false);
      closeMenuDialog();
    }, [closeMenuDialog]);

    const handleClickContextMenuOption = useCallback(
      (e: React.MouseEvent, option: string): void => {
        if (option === selectAllLabel) {
          setSelectedPaths(selectablePaths);
        }
        if (option === deselectAllLabel) {
          setSelectedPaths([]);
        }
        if (onClickContextOption) {
          onClickContextOption(selectedPaths, option);
        }
        if (contextOptions?.length === 1) {
          handleCloseContextHeader();
        }
      },
      [
        contextOptions?.length,
        deselectAllLabel,
        handleCloseContextHeader,
        onClickContextOption,
        selectAllLabel,
        selectablePaths,
        selectedPaths,
      ]
    );

    const handleDone = useCallback((): void => {
      handleSearch(undefined, null);
      handleCloseSearch();
      handleCloseContextHeader();
    }, [handleCloseContextHeader, handleCloseSearch, handleSearch]);

    const handleAdd = useCallback(
      (e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>): void => {
        if (onAdd) {
          onAdd(e, currentPath);
        }
      },
      [currentPath, onAdd]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent, path: string): void => {
        if (!contextHeaderOpen) {
          handleCloseSearch();
          if (path.endsWith("/")) {
            if (onChangeCurrentPath) {
              onChangeCurrentPath(path);
            }
            setContextHeaderOpen(false);
            setSelectedPaths([]);
          } else if (onClick) {
            onClick(e, path);
          }
        }
      },
      [contextHeaderOpen, handleCloseSearch, onChangeCurrentPath, onClick]
    );

    const getParentPath = useCallback((path: string) => {
      if (!path) {
        return path;
      }
      let newPath = path.substring(0, path.length - 1);
      newPath = newPath.substring(0, newPath.lastIndexOf("/") + 1);
      return newPath;
    }, []);

    const handleBack = useCallback((): void => {
      handleCloseSearch();
      onChangeCurrentPath(getParentPath(currentPath));
    }, [currentPath, getParentPath, handleCloseSearch, onChangeCurrentPath]);

    const handleMore = useCallback(
      (e: React.MouseEvent, path: string, option: string): void => {
        if (onMore) {
          onMore(e, path, option);
        }
      },
      [onMore]
    );

    const getTargetPath = useCallback((e: React.DragEvent, path: string) => {
      if (!e.dataTransfer.items || e.dataTransfer.items.length === 0) {
        return "";
      }
      if (!path) {
        return path;
      }
      return path.endsWith("/")
        ? path
        : path.substring(0, path.lastIndexOf("/") + 1);
    }, []);

    const handleDragOver = useCallback(
      (e: React.DragEvent, path: string): void => {
        const targetPath = getTargetPath(e, path);
        if (targetPath && isUploadAllowed && isUploadAllowed(targetPath)) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (onDragOver) {
          onDragOver(e, path);
        }
      },
      [getTargetPath, isUploadAllowed, onDragOver]
    );
    const handleDragEnter = useCallback(
      (e: React.DragEvent, path: string): void => {
        const targetPath = getTargetPath(e, path);
        if (targetPath && isUploadAllowed && isUploadAllowed(targetPath)) {
          e.preventDefault();
          e.stopPropagation();
          draggingFileTargetRef.current = e.target as HTMLElement;
          setDraggingFilePath(targetPath);
        }
        if (onDragEnter) {
          onDragEnter(e, path);
        }
      },
      [getTargetPath, isUploadAllowed, onDragEnter]
    );
    const handleDragLeave = useCallback(
      (e: React.DragEvent, path: string): void => {
        const targetPath = getTargetPath(e, path);
        if (targetPath && isUploadAllowed && isUploadAllowed(targetPath)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.target === draggingFileTargetRef.current) {
            draggingFileTargetRef.current = undefined;
            setDraggingFilePath(undefined);
          }
        }
        if (onDragLeave) {
          onDragLeave(e, path);
        }
      },
      [getTargetPath, isUploadAllowed, onDragLeave]
    );
    const handleDrop = useCallback(
      (e: React.DragEvent, path: string): void => {
        const targetPath = getTargetPath(e, path);
        if (
          targetPath &&
          isUploadAllowed &&
          isUploadAllowed(targetPath) &&
          onUploadFiles
        ) {
          e.preventDefault();
          e.stopPropagation();
          onUploadFiles(e.dataTransfer.files, targetPath);
          e.dataTransfer.clearData();
        }
        draggingFileTargetRef.current = undefined;
        setDraggingFilePath(undefined);
        if (onDrop) {
          onDrop(e, path);
        }
      },
      [getTargetPath, isUploadAllowed, onDrop, onUploadFiles]
    );

    const handleCurrentPathDragOver = useCallback(
      (e: React.DragEvent): void => {
        handleDragOver(e, currentPath);
      },
      [currentPath, handleDragOver]
    );
    const handleCurrentPathDragEnter = useCallback(
      (e: React.DragEvent): void => {
        handleDragEnter(e, currentPath);
      },
      [currentPath, handleDragEnter]
    );
    const handleCurrentPathDragLeave = useCallback(
      (e: React.DragEvent): void => {
        handleDragLeave(e, currentPath);
      },
      [currentPath, handleDragLeave]
    );
    const handleCurrentPathDrop = useCallback(
      (e: React.DragEvent): void => {
        handleDrop(e, currentPath);
      },
      [currentPath, handleDrop]
    );

    useEffect(() => {
      setSortKey(defaultSortKey || Object.keys(cardDetailsState)[0]);
    }, [cardDetailsState, defaultSortKey]);

    useEffect(() => {
      setSortOrder(defaultSortOrder);
    }, [defaultSortOrder]);

    useEffect(() => {
      setActiveFilters(defaultFilters);
    }, [defaultFilters]);

    useEffect(() => {
      const interval = setInterval(() => {
        // Force update every minute so that the "Modified" field stays up to date
        forceUpdate({});
      }, updateInterval);
      return (): void => clearInterval(interval);
    }, [updateInterval]);

    const parentPath = getParentPath(currentPath);

    const toolbarTitle = pathSegments?.[pathSegments.length - 2] || title;
    const toolbarSelectedLabel = belowBreakpoint ? "({count})" : selectedLabel;

    const fabAreaStyle = useMemo(
      () => ({ ...fixedStyle, maxWidth, margin: "auto" }),
      [fixedStyle, maxWidth]
    );
    const maxWidthStyle = useMemo(() => ({ maxWidth }), [maxWidth]);

    const fabLabel =
      upload && getUploadLabel
        ? getUploadLabel(draggingFilePath)
        : addButtonLabel;

    return (
      <StyledMain
        initial={0}
        animate={1}
        duration={0.15}
        style={style}
        onDragEnter={handleCurrentPathDragEnter}
        onDragLeave={handleCurrentPathDragLeave}
        onDragOver={handleCurrentPathDragOver}
        onDrop={handleCurrentPathDrop}
      >
        {initialized && (upload || !empty) && (
          <EngineToolbar
            belowBreakpoint={belowBreakpoint}
            type={toolbarType}
            minHeight={rowHeight}
            searchTextQuery={searchTextQuery}
            selectedPaths={selectedPaths}
            paths={orderedPaths}
            backLabel={backLabel}
            selectedLabel={toolbarSelectedLabel}
            contextOptions={contextOptions}
            moreLabel={editMultipleLabel}
            doneLabel={doneLabel}
            clearLabel={clearLabel}
            searchLabel={searchLabel}
            title={toolbarTitle}
            headerStyle={headerStyle}
            leftStyle={leftStyle}
            backButtonStyle={backButtonStyle}
            searchButtonStyle={searchButtonStyle}
            moreButtonStyle={moreButtonStyle}
            clearButtonStyle={clearButtonStyle}
            doneButtonStyle={doneButtonStyle}
            stickyStyle={stickyStyle}
            sticky={
              sticky ||
              (contextHeaderOpen || searchTextQuery ? "always" : "never")
            }
            fixableContentStyle={maxWidthStyle}
            rotateStyle={rotateStyle}
            isSelectAllowed={isContextAllowed}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onClickMoreOption={handleClickContextMenuOption}
            onDone={handleDone}
            onBack={parentPath ? handleBack : undefined}
            onSearchText={searchable ? handleSearch : undefined}
            onMore={handleOpenContext}
          />
        )}
        <StyledArea>
          <PeerTransition
            currentIndex={pathTransitionIndex}
            previousIndex={previousPathTransitionIndex}
            ease="ease-in-out"
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
            }}
          >
            <StyledPaddingArea
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: belowBreakpoint ? theme.spacing(0, 0) : undefined,
              }}
            >
              {initialized && empty && emptyBackground && (
                <UnmountAnimation>
                  (
                  <StyledMotionEmptyArea
                    initial={0}
                    animate={1}
                    duration={0.15}
                    style={{
                      maxWidth,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: 1,
                    }}
                  >
                    <StyledMotionEmptyContent>
                      {emptyBackground}
                    </StyledMotionEmptyContent>
                  </StyledMotionEmptyArea>
                </UnmountAnimation>
              )}
              {initialized && (upload || !empty) && (
                <StyledPaper
                  style={{
                    maxWidth,
                    pointerEvents: loadingState ? "none" : undefined,
                    borderRadius: belowBreakpoint ? 0 : undefined,
                    padding: belowBreakpoint ? undefined : theme.spacing(1),
                    ...paperStyle,
                  }}
                >
                  <EngineConsoleHeader
                    minHeight={rowHeight}
                    cardDetails={cardDetailsState}
                    sortLabel={sortLabel}
                    filterLabel={filterLabel}
                    sortKey={sortKey}
                    activeFilters={activeFilters}
                    defaultFilters={defaultFilters}
                    sortOrder={sortOrder}
                    dividerStyle={dividerStyle}
                    onSort={handleSort}
                    onFilter={handleFilter}
                  />
                  {(!orderedPaths || loadingState) && (
                    <EngineConsoleEmptyCard
                      minHeight={rowHeight}
                      dividerStyle={dividerStyle}
                    >
                      <Fallback />
                    </EngineConsoleEmptyCard>
                  )}
                  {initialized &&
                    !loadingState &&
                    !empty &&
                    orderedPaths &&
                    orderedPaths.length === 0 &&
                    noneLabel && (
                      <EngineConsoleEmptyCard
                        minHeight={rowHeight}
                        dividerStyle={dividerStyle}
                        onDragEnter={handleCurrentPathDragEnter}
                        onDragLeave={handleCurrentPathDragLeave}
                        onDragOver={handleCurrentPathDragOver}
                        onDrop={handleCurrentPathDrop}
                      >
                        <StyledNameTypography>{noneLabel}</StyledNameTypography>
                      </EngineConsoleEmptyCard>
                    )}
                  {!loadingState && (
                    <>
                      {orderedPaths.map(
                        (path, index): JSX.Element => (
                          <VirtualizedItem
                            key={path || index}
                            index={index}
                            minHeight={rowHeight}
                          >
                            <EngineConsoleItemCard
                              index={index}
                              paths={orderedPaths}
                              cardDetails={cardDetailsState}
                              height={rowHeight}
                              containers={currentContainers}
                              draggingFilePath={draggingFilePath}
                              rowNameKey={rowNameKey}
                              selectedPaths={selectedPaths}
                              contextOptions={contextOptions}
                              contextHeaderOpen={contextHeaderOpen}
                              selectedColor={selectedColor}
                              loading={loadingState}
                              loadingAnimation="fade"
                              dividerStyle={dividerStyle}
                              style={style}
                              onSelect={handleSelect}
                              onClick={handleClick}
                              onMore={handleMore}
                              onContextMenu={handleOpenContext}
                              onDragEnter={handleDragEnter}
                              onDragLeave={handleDragLeave}
                              onDragOver={handleDragOver}
                              onDrop={handleDrop}
                              isContextAllowed={isContextAllowed}
                              getRowImage={getRowImage}
                              getRowImagePlaceholder={getRowImagePlaceholder}
                              getRowIcon={getRowIcon}
                              getRowColor={getRowColor}
                              getRowMoreOptions={getRowMoreOptions}
                              getOptionIcon={getOptionIcon}
                              isOptionUpload={isOptionUpload}
                              isOptionDisabled={isOptionDisabled}
                              getCellDisplayValue={handleGetCellDisplayValue}
                            />
                          </VirtualizedItem>
                        )
                      )}
                    </>
                  )}
                  {footerLabel && (
                    <EngineConsoleFooter
                      minHeight={rowHeight}
                      label={footerLabel}
                      onDragEnter={handleCurrentPathDragEnter}
                      onDragLeave={handleCurrentPathDragLeave}
                      onDragOver={handleCurrentPathDragOver}
                      onDrop={handleCurrentPathDrop}
                    />
                  )}
                </StyledPaper>
              )}
              {initialized && empty && upload && (
                <UnmountAnimation>
                  (
                  <StyledMotionEmptyArea
                    initial={0}
                    animate={1}
                    duration={0.15}
                    style={{
                      maxWidth,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      flex: 1,
                    }}
                  >
                    <UploadDropzone
                      selectedColor={selectedColor}
                      draggingFile={draggingFilePath === currentPath}
                    />
                  </StyledMotionEmptyArea>
                </UnmountAnimation>
              )}
            </StyledPaddingArea>
          </PeerTransition>
          <StyledPaddingArea
            style={{
              zIndex: 1,
              minHeight: theme.spacing(7) + addButtonAreaSpacing,
            }}
          >
            {!loadingState && (
              <CornerFab
                icon={
                  <FontIcon aria-label={fabLabel} size={15}>
                    {upload ? uploadIcon : addIcon}
                  </FontIcon>
                }
                label={fabLabel}
                color="secondary"
                upload={upload}
                disabled={createDisabled}
                buttonStyle={buttonStyle}
                style={fabAreaStyle}
                scrollParent={scrollParent}
                shrink={Boolean(searchTextQuery)}
                onClick={onAdd ? handleAdd : undefined}
                onDragEnter={handleCurrentPathDragEnter}
                onDragLeave={handleCurrentPathDragLeave}
                onDragOver={handleCurrentPathDragOver}
                onDrop={handleCurrentPathDrop}
              />
            )}
          </StyledPaddingArea>
        </StyledArea>
        <ContextMenu
          anchorReference={optionsMenuReference}
          anchorEl={optionsMenuAnchorEl}
          anchorPosition={optionsMenuPosition}
          open={optionsMenuOpen}
          options={menuOptions}
          onOption={handleClickContextMenuOption}
          onClose={handleCloseContextMenu}
        />
        {draggingFilePath === currentPath && !empty && (
          <UploadOverlay selectedColor={selectedColor} />
        )}
      </StyledMain>
    );
  }
);

export default EngineConsoleList;
