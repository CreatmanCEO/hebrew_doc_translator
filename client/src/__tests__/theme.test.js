import { makeTheme } from '../theme';

test('ltr by default, rtl when asked', () => {
  expect(makeTheme().direction).toBe('ltr');
  expect(makeTheme('rtl').direction).toBe('rtl');
});
test('light palette + accent + radius', () => {
  const t = makeTheme();
  expect(t.palette.mode).toBe('light');
  expect(t.palette.primary.main).toBe('#4F46E5');
  expect(t.shape.borderRadius).toBe(14);
});
