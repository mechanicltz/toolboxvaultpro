import { useWindowDimensions } from "react-native";

/**
 * Breakpoints (px width):
 *   phone:    < 600
 *   tablet:   600 .. 1200
 *   desktop:  >= 1200
 */
export const BP = {
  phone: 600,
  tablet: 900,
  desktop: 1200,
};

/**
 * Recommended max content width — beyond this, content gets centered with
 * letterboxing so it never looks awkwardly stretched on a wide screen.
 */
export const CONTENT_MAX_WIDTH = 760;
export const CONTENT_MAX_WIDTH_WIDE = 1080; // for grid pages (inventory)

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isPhone = width < BP.phone;
  const isTablet = width >= BP.phone && width < BP.desktop;
  const isDesktop = width >= BP.desktop;
  const isLargeScreen = !isPhone;
  // Grid columns
  const gridCols = isPhone ? 1 : width < 900 ? 2 : width < 1200 ? 2 : 3;
  // Font scale factor — gentle bump on tablets
  const fontScale = isPhone ? 1 : isTablet ? 1.1 : 1.15;
  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    isLargeScreen,
    gridCols,
    fontScale,
  };
}
