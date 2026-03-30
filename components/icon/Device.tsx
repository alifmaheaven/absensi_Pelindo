import * as React from "react";
import Svg, { Defs, Path, G, Use } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgDevice = (props: SvgProps) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    {...props}
  >
    <Defs>
      <Path id="device_svg__a" d="M15 9h8v12h-8z" />
    </Defs>
    <G fill="none">
      <Use href="#device_svg__a" />
      <Path
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth={2}
        d="M11 18H2V3h20v2M6 21h5"
      />
      <G stroke="currentColor" strokeLinecap="square" strokeWidth={2}>
        <Use href="#device_svg__a" />
        <Path d="M18.998 17.998h.004v.004h-.004z" />
      </G>
    </G>
  </Svg>
);
export default SvgDevice;
