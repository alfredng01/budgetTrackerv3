import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: '650' },
  components: {
    Card: { defaultProps: { withBorder: true, padding: 'lg' } },
    Modal: { defaultProps: { centered: true } },
  },
});

/**
 * Categorical chart slots (validated for colour-vision deficiency in light + dark).
 * Defined as CSS variables in styles.css so dark mode swaps them in one place.
 */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

/**
 * Category colours follow creation order (category id order), not display order: reordering
 * never changes a colour and a newly added category takes the next unused one. The first 16 come
 * from a curated palette; beyond that, hues are spread around the wheel by the golden angle.
 */
const CATEGORY_PALETTE = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#7b6be0', '#e34948',
  '#0f8b8d', '#9c6644', '#5bc0eb', '#9bc53d', '#a1458f', '#5c7c99', '#ff8c69', '#c9a227',
];

function colorAt(index: number): string {
  if (index < CATEGORY_PALETTE.length) return CATEGORY_PALETTE[index];
  const n = index - CATEGORY_PALETTE.length;
  const hue = Math.round((20 + n * 137.508) % 360);
  return `hsl(${hue} 55% ${n % 2 === 0 ? 40 : 62}%)`;
}

/** Fallback while the category list is still loading. */
const UNKNOWN_COLOR = '#8a8984';

/**
 * Colour lookup from every category id ever created (removed ones included), so removing a
 * category never shifts the colours of the ones created after it.
 */
export function categoryColors(idsByAge: number[]): (categoryId: number) => string {
  const order = new Map([...idsByAge].sort((a, b) => a - b).map((id, i) => [id, i]));
  return (categoryId) => {
    const index = order.get(categoryId);
    return index === undefined ? UNKNOWN_COLOR : colorAt(index);
  };
}
