import { describe, it, expect } from 'vitest';
import { baseLayoutFrom, minimizeLayout } from '@/layout';
import type { LayoutSnapshot } from '@/layout';

const R = '#public.users(id)->public.posts(author_id)';

describe('baseLayoutFrom', () => {
  it('takes each entry from the first import that says anything about it', () => {
    const near: LayoutSnapshot = {
      positions: { 'public.users': { x: 1, y: 1 } },
      collapsedGroups: ['group:public.a'],
      edgeRoutes: {},
    };
    const far: LayoutSnapshot = {
      positions: {
        'public.users': { x: 9, y: 9 },
        'public.posts': { x: 2, y: 2 },
      },
      collapsedGroups: ['group:public.a', 'group:public.b'],
      edgeRoutes: { [R]: [300] },
    };
    expect(baseLayoutFrom([near, far])).toEqual({
      positions: {
        'public.users': { x: 1, y: 1 },
        'public.posts': { x: 2, y: 2 },
      },
      collapsedGroups: ['group:public.a', 'group:public.b'],
      edgeRoutes: { [R]: [300] },
    });
  });

  it('treats an undoing in a nearer import as the answer: nothing inherited', () => {
    const near: LayoutSnapshot = {
      positions: {},
      collapsedGroups: [],
      expandedGroups: ['group:public.a'],
      edgeRoutes: { [R]: [] },
    };
    const far: LayoutSnapshot = {
      positions: {},
      collapsedGroups: ['group:public.a'],
      edgeRoutes: { [R]: [300] },
    };
    expect(baseLayoutFrom([near, far])).toEqual({
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
    });
    expect(baseLayoutFrom([])).toEqual({
      positions: {},
      collapsedGroups: [],
      edgeRoutes: {},
    });
  });
});

describe('minimizeLayout', () => {
  const base: LayoutSnapshot = {
    positions: { 'public.users': { x: 8, y: 16 } },
    collapsedGroups: ['group:public.a'],
    edgeRoutes: { [R]: [300] },
  };

  it('drops what the base already says and keeps own elements and changes', () => {
    expect(minimizeLayout({
      positions: {
        'public.users': { x: 8, y: 16 },
        'public.own': { x: 0, y: 0 },
      },
      collapsedGroups: ['group:public.a', 'group:public.own'],
      expandedGroups: [],
      edgeRoutes: { [R]: [300] },
    }, base)).toEqual({
      positions: { 'public.own': { x: 0, y: 0 } },
      collapsedGroups: ['group:public.own'],
      edgeRoutes: {},
    });
  });

  it('keeps moved imported elements, and undoings only where there is something to undo', () => {
    expect(minimizeLayout({
      positions: { 'public.users': { x: 100, y: 16 } },
      collapsedGroups: [],
      expandedGroups: ['group:public.a', 'group:public.never'],
      edgeRoutes: {
        [R]: [],
        '#x': [],
      },
    }, base)).toEqual({
      positions: { 'public.users': { x: 100, y: 16 } },
      collapsedGroups: [],
      expandedGroups: ['group:public.a'],
      edgeRoutes: { [R]: [] },
    });
  });
});
