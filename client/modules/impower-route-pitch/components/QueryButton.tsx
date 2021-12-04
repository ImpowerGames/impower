import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";

const QueryMenu = dynamic(() => import("./QueryMenu"), { ssr: false });

const StyledButton = styled(Button)`
  color: inherit;
  padding: 0;
  text-transform: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.938rem;
`;

const StyledButtonIconArea = styled.div`
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

interface QueryButtonProps {
  target?: "pitch" | "contribution";
  menuType?: string;
  label?: string;
  value?: string;
  flexDirection?: "row" | "row-reverse";
  options?: string[];
  getOptionLabels?: () => {
    [option: string]: string;
  };
  getOptionIcons?: (value?: string) => Promise<{
    [option: string]: React.ComponentType;
  }>;
  getActiveOptionIcon?: (value?: string) => React.ReactNode;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const QueryButton = React.memo((props: QueryButtonProps): JSX.Element => {
  const {
    target,
    menuType,
    value,
    label,
    flexDirection,
    options,
    getOptionLabels,
    getOptionIcons,
    getActiveOptionIcon,
    onOption,
  } = props;

  const queryKey = `${target}-${menuType}`;

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement>();
  const [menuOpen, setMenuOpen] = useState<boolean>();
  const [optionEntries, setOptionEntries] = useState<
    [
      string,
      {
        label: string;
        icon?: React.ReactNode;
      }
    ][]
  >([]);
  const stateRef = useRef(value);

  useEffect(() => {
    stateRef.current = value;
  }, [value]);

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
      const optionIcons = await getOptionIcons(value);
      setOptionEntries(
        (options || Object.keys(optionLabels)).map((option) => {
          const Icon = optionIcons[option];
          const label = optionLabels[option];
          return [option, { label, icon: <Icon /> }];
        })
      );
      setMenuOpen(true);
      openMenuDialog(queryKey);
    },
    [options, getOptionLabels, getOptionIcons, value, openMenuDialog, queryKey]
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
      if (option !== stateRef.current) {
        stateRef.current = option;
        handleCloseMenu(e);
        if (onOption) {
          onOption(e, option);
        }
      }
    },
    [handleCloseMenu, onOption]
  );

  const activeOptionLabel = useMemo(() => {
    const optionLabel = value ? getOptionLabels?.()?.[value] : undefined;
    return optionLabel;
  }, [value, getOptionLabels]);

  const activeOptionIcon = useMemo(() => {
    const optionLabel = getActiveOptionIcon?.(value);
    return optionLabel;
  }, [value, getActiveOptionIcon]);

  const filterButtonStyle = useMemo(() => ({ flexDirection }), [flexDirection]);

  return (
    <>
      <StyledButton
        variant="text"
        onClick={handleOpenMenu}
        style={filterButtonStyle}
      >
        <StyledButtonIconArea>
          <FontIcon aria-label={label} size={16}>
            {activeOptionIcon}
          </FontIcon>
        </StyledButtonIconArea>
        <StyledSpacer />
        <StyledButtonTextArea>{activeOptionLabel}</StyledButtonTextArea>
      </StyledButton>
      {menuOpen !== undefined && (
        <QueryMenu
          label={label}
          value={value}
          anchorEl={menuAnchor}
          open={menuOpen}
          options={optionEntries}
          onClose={handleCloseMenu}
          onOption={handleClickMenuItem}
        />
      )}
    </>
  );
});

export default QueryButton;
