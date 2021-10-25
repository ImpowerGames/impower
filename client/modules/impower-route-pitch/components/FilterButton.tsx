import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import dynamic from "next/dynamic";
import React, { useCallback, useMemo, useState } from "react";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";

const FilterMenu = dynamic(() => import("./FilterMenu"), { ssr: false });

const StyledFilterButton = styled(Button)`
  color: inherit;
  padding: 0;
  text-transform: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.938rem;
`;

const StyledFilterButtonIconArea = styled.div`
  display: flex;
  justify-content: center;
  opacity: 0.5;
`;

const StyledButtonTextArea = styled.div`
  display: flex;
  justify-content: center;
  opacity: 0.6;
`;

const StyledSpacer = styled.div`
  width: ${(props): string => props.theme.spacing(2)};
`;

interface FilterButtonProps {
  target?: "pitch" | "contribution";
  menuType?: string;
  filterLabel?: string;
  filterIcon?: React.ReactNode;
  activeFilterValue?: string;
  flexDirection?: "row" | "row-reverse";
  getOptionLabels?: () => {
    [option: string]: string;
  };
  getOptionIcons?: (activeFilterValue: string) => Promise<{
    [option: string]: React.ComponentType;
  }>;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const FilterButton = React.memo((props: FilterButtonProps): JSX.Element => {
  const {
    target,
    menuType,
    activeFilterValue,
    filterLabel,
    filterIcon,
    flexDirection,
    getOptionLabels,
    getOptionIcons,
    onOption,
  } = props;

  const queryKey = `${target}-${menuType}`;

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement>();
  const [menuOpen, setMenuOpen] = useState<boolean>();
  const [options, setOptions] = useState<
    [
      string,
      {
        label: string;
        icon?: React.ReactNode;
      }
    ][]
  >([]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setMenuOpen(currState?.m === queryKey);
      }
    },
    [queryKey]
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleOpenMenu = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      setMenuAnchor(e.currentTarget as HTMLElement);
      const optionLabels = getOptionLabels();
      const optionIcons = await getOptionIcons(activeFilterValue);
      setOptions(
        Object.entries(optionLabels).map(([option, label]) => {
          const Icon = optionIcons[option];
          return [option, { label, icon: <Icon /> }];
        })
      );
      setMenuOpen(true);
      openMenuDialog(queryKey);
    },
    [
      getOptionLabels,
      getOptionIcons,
      activeFilterValue,
      queryKey,
      openMenuDialog,
    ]
  );

  const handleCloseMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(false);
      closeMenuDialog();
    },
    [closeMenuDialog]
  );

  const handleClickMenuItem = useCallback(
    (e: React.MouseEvent, option: string) => {
      e.preventDefault();
      e.stopPropagation();
      handleCloseMenu(e);
      if (onOption) {
        onOption(e, option);
      }
    },
    [handleCloseMenu, onOption]
  );

  const activeOptionLabel = useMemo(() => {
    const optionLabel = activeFilterValue
      ? getOptionLabels?.()?.[activeFilterValue]
      : undefined;
    return optionLabel;
  }, [activeFilterValue, getOptionLabels]);

  const filterButtonStyle = useMemo(() => ({ flexDirection }), [flexDirection]);

  return (
    <>
      <StyledFilterButton
        variant="text"
        onClick={handleOpenMenu}
        style={filterButtonStyle}
      >
        <StyledFilterButtonIconArea>
          <FontIcon aria-label={filterLabel} size={16}>
            {filterIcon}
          </FontIcon>
        </StyledFilterButtonIconArea>
        <StyledSpacer />
        <StyledButtonTextArea>{activeOptionLabel}</StyledButtonTextArea>
      </StyledFilterButton>
      {menuOpen !== undefined && (
        <FilterMenu
          filterLabel={filterLabel}
          activeFilterValue={activeFilterValue}
          anchorEl={menuAnchor}
          open={menuOpen}
          options={options}
          onClose={handleCloseMenu}
          onOption={handleClickMenuItem}
        />
      )}
    </>
  );
});

export default FilterButton;
