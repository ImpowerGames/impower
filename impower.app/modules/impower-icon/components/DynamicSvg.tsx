import React, { PropsWithChildren } from "react";
import { SvgData } from "../types/interfaces/svgData";

interface DynamicSvgProps extends SvgData {
  style?: React.CSSProperties;
}

const DynamicSvg = React.memo(
  (props: PropsWithChildren<DynamicSvgProps>): JSX.Element => {
    const { xmlns = "http://www.w3.org/2000/svg", v, d, style } = props;
    return (
      <svg xmlns={xmlns} viewBox={v} style={style}>
        <path d={d} />
      </svg>
    );
  }
);

export default DynamicSvg;
