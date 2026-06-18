import * as React from "react";
import Svg, { Path, Rect } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgGallery = (props: SvgProps) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" {...props}>
    <Rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" />
    <Rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" />
    <Rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" />
    <Rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" />
  </Svg>
);
export default SvgGallery;
