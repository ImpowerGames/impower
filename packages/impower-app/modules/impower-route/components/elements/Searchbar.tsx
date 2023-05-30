import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import useMediaQuery from "@mui/material/useMediaQuery";
import dynamic from "next/dynamic";
import React, { useCallback, useState } from "react";
import MagnifyingGlassRegularIcon from "../../../../resources/icons/regular/magnifying-glass.svg";
import { FontIcon } from "../../../impower-icon";
import FadeAnimation from "../animations/FadeAnimation";
import UnmountAnimation from "../animations/UnmountAnimation";
import SearchInput from "./SearchInput";

const SearchAutocomplete = dynamic(() => import("./SearchAutocomplete"));

const StyledMotionDiv = styled(FadeAnimation)`
  flex: 1;
  display: flex;
  min-height: 40px;
  width: 100%;
  position: relative;
`;

const PlaceholderArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

interface SearchbarProps {
  initial?: number;
  label?: string;
  placeholder?: string;
  value?: string;
  style?: React.CSSProperties;
}

const Searchbar = (props: SearchbarProps): JSX.Element => {
  const { initial, value, label, placeholder, style } = props;

  const [autocomplete, setAutocomplete] = useState(false);

  const theme = useTheme();

  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      setAutocomplete(true);
      if (belowSmBreakpoint) {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }
    },
    [belowSmBreakpoint]
  );

  return (
    <UnmountAnimation>
      <StyledMotionDiv initial={initial} animate={1} exit={0} duration={0.3}>
        <PlaceholderArea
          style={{ pointerEvents: autocomplete ? "none" : undefined }}
        >
          <SearchInput
            aria-hidden={autocomplete}
            onClick={handleClick}
            placeholder={label}
            style={style}
            startAdornment={
              <FontIcon
                aria-label={`Search`}
                color={theme.palette.secondary.light}
              >
                <MagnifyingGlassRegularIcon />
              </FontIcon>
            }
          />
        </PlaceholderArea>
        {autocomplete && (
          <SearchAutocomplete
            dialog={belowSmBreakpoint}
            value={value}
            label={label}
            placeholder={placeholder}
            style={style}
          />
        )}
      </StyledMotionDiv>
    </UnmountAnimation>
  );
};

export default Searchbar;
