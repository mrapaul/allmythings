import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface Responsive {
  breakpoint: Breakpoint;
  columns: number;
  gutter: number;
  cardGap: number;
  contentMaxWidth: number;
  capsuleMaxWidth: number;
  width: number;
  height: number;
  isCompact: boolean;
  isWide: boolean;
}

export function resolveResponsive(width: number, height = 0): Responsive {
  let breakpoint: Breakpoint = 'sm';
  if (width >= 1280) breakpoint = 'xl';
  else if (width >= 900) breakpoint = 'lg';
  else if (width >= 600) breakpoint = 'md';

  const columns = breakpoint === 'sm' ? 2 : breakpoint === 'md' ? 3 : breakpoint === 'lg' ? 4 : 5;
  const gutter = breakpoint === 'sm' ? 12 : 16;
  const cardGap = breakpoint === 'sm' ? 10 : 14;
  const contentMaxWidth = breakpoint === 'xl' ? 1100 : breakpoint === 'lg' ? 920 : width;
  const capsuleMaxWidth = Math.min(width - 24, 460);
  const isCompact = breakpoint === 'sm';
  const isWide = breakpoint === 'lg' || breakpoint === 'xl';

  return {
    breakpoint,
    columns,
    gutter,
    cardGap,
    contentMaxWidth,
    capsuleMaxWidth,
    width,
    height,
    isCompact,
    isWide,
  };
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  return resolveResponsive(width, height);
}
