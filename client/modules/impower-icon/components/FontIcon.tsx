import React, { PropsWithChildren } from "react";

interface FontIconProps {
  "size"?: string | number;
  "color"?: string;
  "style"?: React.CSSProperties;
  "aria-label": string;
}

const FontIcon = React.memo(
  (props: PropsWithChildren<FontIconProps>): JSX.Element => {
    const {
      size = "1em",
      color = "inherit",
      style,
      "aria-label": ariaLabel,
      children,
    } = props;
    return (
      <div
        className="font-icon"
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: size,
          height: size,
          fontSize: size,
          color,
          ...style,
        }}
        role="img"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }
);

export default FontIcon;
