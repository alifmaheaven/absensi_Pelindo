import * as React from "react";
import Svg, { G, Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgTreeRoundDot = (props: SvgProps) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    {...props}
  >
    <G fill="none">
      <Path d="M9 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0m7 14a3 3 0 1 0 6 0 3 3 0 0 0-6 0M2 19a3 3 0 1 0 6 0 3 3 0 0 0-6 0" />
      <Path
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth={2}
        d="M12 12h5a2 2 0 0 1 2 2v2m-7-4H7a2 2 0 0 0-2 2v2m7-4V8m-7 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm14 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-7-8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
      />
    </G>
  </Svg>
);
export default SvgTreeRoundDot;
