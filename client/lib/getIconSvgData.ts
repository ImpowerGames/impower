import { SvgData } from "../modules/impower-icon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getIconSvgData = (component: any): SvgData => {
  const iconObj = component();
  return {
    v: iconObj.props.viewBox,
    d: iconObj.props.children.props.d,
  };
};

export default getIconSvgData;
