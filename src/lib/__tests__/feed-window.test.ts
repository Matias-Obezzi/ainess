import { describe, it, expect } from 'vitest';
import { windowOf, isNearBottom } from '../feed-window';

describe('windowOf', () => {
  it('returns the last items and the hidden count when limit is less than total', () => {
    const items = [1, 2, 3, 4, 5];
    expect(windowOf(items, 3)).toEqual({
      shown: [3, 4, 5],
      hidden: 2
    });
  });

  it('returns all items and zero hidden when limit is greater than or equal to total', () => {
    const items = [1, 2, 3];
    expect(windowOf(items, 3)).toEqual({ shown: [1, 2, 3], hidden: 0 });
    expect(windowOf(items, 5)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });

  it('returns empty list and zero hidden when list is empty', () => {
    expect(windowOf([], 5)).toEqual({ shown: [], hidden: 0 });
  });

  it('returns empty list and all hidden when limit is zero or negative', () => {
    const items = [1, 2, 3];
    expect(windowOf(items, 0)).toEqual({ shown: [], hidden: 3 });
    expect(windowOf(items, -2)).toEqual({ shown: [], hidden: 3 });
  });
});

describe('isNearBottom', () => {
  it('returns true when right at the bottom', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 })).toBe(true);
  });

  it('returns true when within tolerance (10px)', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 890, clientHeight: 100 })).toBe(true);
  });

  it('returns false when far from bottom (200px)', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 700, clientHeight: 100 })).toBe(false);
  });

  it('respects a custom tolerance', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 700, clientHeight: 100 }, 250)).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 700, clientHeight: 100 }, 150)).toBe(false);
  });
});
