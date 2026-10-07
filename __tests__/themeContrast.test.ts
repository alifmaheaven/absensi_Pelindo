import { Colors } from "../constants/theme";

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received: ${hex}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe("design token contrast", () => {
  it.each(["light", "dark"] as const)("keeps white labels readable on %s action fills", (mode) => {
    const colors = Colors[mode];
    const white = colors.onGradient;

    for (const background of [
      colors.primaryAction,
      colors.primaryActionEnd,
      colors.successAction,
      colors.warningAction,
      colors.dangerAction,
    ]) {
      expect(contrastRatio(white, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["light", "dark"] as const)("keeps semantic labels readable on %s soft surfaces", (mode) => {
    const colors = Colors[mode];

    for (const [foreground, background] of [
      [colors.successText, colors.successSoft],
      [colors.warningText, colors.warningSoft],
      [colors.dangerText, colors.dangerSoft],
      [colors.primaryText, colors.primarySoft],
    ]) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
