import React, {
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { IconLibraryContext } from "../contexts/iconLibraryContext";
import { SvgData } from "../types/interfaces/svgData";
import DynamicSvg from "./DynamicSvg";

interface DynamicIconProps {
  icon?: SvgData | string;
  variant?: string;
}

const DynamicIcon = React.memo(
  (props: PropsWithChildren<DynamicIconProps>): JSX.Element => {
    const { icon, variant = "solid" } = props;
    const [iconLibraryState] = useContext(IconLibraryContext);
    const iconMap = iconLibraryState[variant];
    const iconProps = typeof icon === "string" ? iconMap?.[icon] : icon;
    const [opacity, setOpacity] = useState(iconProps ? 1 : 0);

    useEffect(() => {
      window.requestAnimationFrame(() => {
        setOpacity(iconProps ? 1 : 0);
      });
    }, [iconProps]);

    if (!iconProps) {
      return null;
    }

    return (
      <DynamicSvg
        {...iconProps}
        style={{ opacity, transition: "opacity 0.2s ease" }}
      />
    );
  }
);

export default DynamicIcon;
