import styled from "@emotion/styled";
import OutlinedInput, { OutlinedInputProps } from "@mui/material/OutlinedInput";
import React from "react";

const StyledOutlinedInput = styled(OutlinedInput)`
  flex: 1;
  display: flex;
  align-items: center;

  caret-color: inherit;
  background-color: ${(props): string => props.theme.palette.primary.dark};
  border-radius: 8px;
  transition: 0.1s ease;
  transition-property: background-color, box-shadow;
  padding-right: ${(props): string => props.theme.spacing(1)};
  height: 40px;

  &.MuiInputBase-root {
    color: inherit;
    caret-color: inherit;
  }

  &.MuiInputBase-root.Mui-focused {
    border: none;
    color: black;
    background-color: white;
    box-shadow: 0 0 0 2px ${(props): string => props.theme.colors.selected};
    transition: 0.1s ease;
    transition-property: background-color, box-shadow;
  }

  & input {
    color: inherit;
    caret-color: inherit;
    padding: 8px 12px;
  }

  & fieldset {
    border: none;
  }

  & input[type="search"]::-webkit-search-decoration,
  input[type="search"]::-webkit-search-cancel-button,
  input[type="search"]::-webkit-search-results-button,
  input[type="search"]::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }
`;

const SearchInput = React.forwardRef(
  (
    props: OutlinedInputProps,
    ref: React.ForwardedRef<unknown>
  ): JSX.Element => {
    return <StyledOutlinedInput ref={ref} {...props} />;
  }
);

export default SearchInput;
