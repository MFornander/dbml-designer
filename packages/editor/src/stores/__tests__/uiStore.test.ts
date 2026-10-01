// @vitest-environment happy-dom
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { migrateUiState, useUiStore } from '@/stores/uiStore';

const FLAGS = {
  lineageLayout: false,
  highlightAll: false,
  layoutOpen: false,
  layoutSize: 40,
  editorCollapsed: false,
  viewsOpen: false,
  partialRefMode: 'badges',
  showValues: true,
  lineageColumns: false,
};

describe('migrateUiState', () => {
  it('swaps the split sizes and enables both edge kinds when upgrading from version 1', () => {
    const v1 = JSON.stringify({
      version: 1,
      theme: 'dark',
      detailLevel: 'keys',
      splitSizes: [60, 40],
      problemsOpen: true,
    });
    expect(migrateUiState(v1)).toEqual({
      version: 12,
      theme: 'dark',
      detailLevel: 'keys',
      splitSizes: [40, 60],
      problemsOpen: true,
      edgeMode: 'erd+deps',
      ...FLAGS,
    });
  });

  it('maps the version 2 lineage flag onto an edge mode', () => {
    const v2 = (showLineage: boolean) => JSON.stringify({
      version: 2,
      theme: 'light',
      detailLevel: 'all',
      splitSizes: [35, 65],
      problemsOpen: false,
      showLineage,
    });
    expect(migrateUiState(v2(false)).edgeMode).toBe('erd');
    expect(migrateUiState(v2(true)).edgeMode).toBe('erd+deps');
    expect(migrateUiState(v2(true)).splitSizes).toEqual([35, 65]);
    expect(migrateUiState(v2(true)).version).toBe(12);
  });

  it('keeps the version 3 edge mode and adds the new toggles switched off', () => {
    const v3 = JSON.stringify({
      version: 3,
      theme: 'light',
      detailLevel: 'all',
      splitSizes: [35, 65],
      problemsOpen: false,
      edgeMode: 'deps',
    });
    expect(migrateUiState(v3)).toEqual({
      version: 12,
      theme: 'light',
      detailLevel: 'all',
      splitSizes: [35, 65],
      problemsOpen: false,
      edgeMode: 'deps',
      ...FLAGS,
    });
  });

  const v4 = {
    version: 4,
    theme: 'light',
    detailLevel: 'all',
    splitSizes: [35, 65],
    problemsOpen: false,
    edgeMode: 'erd',
    lineageLayout: true,
    highlightAll: true,
  };

  it('adds the layout panel, collapsed, and views panel flags when upgrading from version 4, keeping the toggles', () => {
    expect(migrateUiState(JSON.stringify(v4))).toEqual({
      ...v4,
      version: 12,
      layoutOpen: false,
      layoutSize: 40,
      editorCollapsed: false,
      viewsOpen: false,
      partialRefMode: 'badges',
      showValues: true,
      lineageColumns: false,
    });
  });

  it('turns the layout editor view into an open layout panel when upgrading from versions 5 and 6', () => {
    const v5 = {
      ...v4,
      version: 5,
      editorView: 'layout',
    };
    expect(migrateUiState(JSON.stringify(v5))).toEqual({
      ...v4,
      version: 12,
      layoutOpen: true,
      layoutSize: 40,
      editorCollapsed: false,
      viewsOpen: false,
      partialRefMode: 'badges',
      showValues: true,
      lineageColumns: false,
    });
    const v6 = {
      ...v4,
      version: 6,
      editorView: 'dbml',
      editorCollapsed: true,
    };
    expect(migrateUiState(JSON.stringify(v6))).toEqual({
      ...v4,
      version: 12,
      layoutOpen: false,
      layoutSize: 40,
      editorCollapsed: true,
      viewsOpen: false,
      partialRefMode: 'badges',
      showValues: true,
      lineageColumns: false,
    });
  });

  it('adds the layout panel height when upgrading from version 7', () => {
    const v7 = {
      ...v4,
      version: 7,
      layoutOpen: true,
      editorCollapsed: true,
    };
    expect(migrateUiState(JSON.stringify(v7))).toEqual({
      ...v7,
      version: 12,
      layoutSize: 40,
      viewsOpen: false,
      partialRefMode: 'badges',
      showValues: true,
      lineageColumns: false,
    });
  });

  const v8 = {
    ...v4,
    version: 8,
    layoutOpen: true,
    layoutSize: 55,
    editorCollapsed: true,
  };

  it('adds the views panel flag when upgrading from version 8', () => {
    expect(migrateUiState(JSON.stringify(v8))).toEqual({
      ...v8,
      version: 12,
      viewsOpen: false,
      partialRefMode: 'badges',
      showValues: true,
      lineageColumns: false,
    });
  });

  it('draws partial refs as badges when upgrading from version 9', () => {
    const v9 = {
      ...v8,
      version: 9,
      viewsOpen: true,
    };
    expect(migrateUiState(JSON.stringify(v9))).toEqual({
      ...v9,
      version: 12,
      partialRefMode: 'badges',
      showValues: true,
      lineageColumns: false,
    });
  });

  it('shows record values when upgrading from version 10', () => {
    const v10 = {
      ...v8,
      version: 10,
      viewsOpen: true,
      partialRefMode: 'lines',
    };
    expect(migrateUiState(JSON.stringify(v10))).toEqual({
      ...v10,
      version: 12,
      showValues: true,
      lineageColumns: false,
    });
  });

  it('draws lineage by table pair when upgrading from version 11, and passes version 12 through unchanged', () => {
    const v11 = {
      ...v8,
      version: 11,
      viewsOpen: true,
      partialRefMode: 'lines',
      showValues: false,
    };
    expect(migrateUiState(JSON.stringify(v11))).toEqual({
      ...v11,
      version: 12,
      lineageColumns: false,
    });
    const v12 = {
      ...v11,
      version: 12,
      lineageColumns: true,
    };
    expect(migrateUiState(JSON.stringify(v12))).toEqual(v12);
  });
});

describe('useUiStore values', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows record values by default, hides them, and remembers the choice', async () => {
    const ui = useUiStore();
    expect(ui.showValues).toBe(true);
    ui.toggleShowValues();
    expect(ui.showValues).toBe(false);
    await nextTick();
    setActivePinia(createPinia());
    expect(useUiStore().showValues).toBe(false);
  });
});

describe('useUiStore lineage by column', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('draws lineage by table pair by default, switches to columns, and remembers the choice', async () => {
    const ui = useUiStore();
    expect(ui.lineageColumns).toBe(false);
    ui.toggleLineageColumns();
    expect(ui.lineageColumns).toBe(true);
    await nextTick();
    setActivePinia(createPinia());
    expect(useUiStore().lineageColumns).toBe(true);
  });
});

describe('useUiStore partial refs', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('draws them as badges by default, toggles to lines and back, and remembers the choice', async () => {
    const ui = useUiStore();
    expect(ui.partialRefMode).toBe('badges');
    ui.togglePartialRefMode();
    expect(ui.partialRefMode).toBe('lines');
    await nextTick();

    setActivePinia(createPinia());
    const again = useUiStore();
    expect(again.partialRefMode).toBe('lines');
    again.togglePartialRefMode();
    expect(again.partialRefMode).toBe('badges');
  });

  it('upgrades a stored version 9 state to badges', () => {
    localStorage.setItem('dbml-edit:v1:ui', JSON.stringify({
      version: 9,
      theme: 'light',
      detailLevel: 'keys',
      splitSizes: [30, 70],
      problemsOpen: false,
      edgeMode: 'erd',
      lineageLayout: false,
      highlightAll: true,
      layoutOpen: false,
      layoutSize: 40,
      editorCollapsed: false,
      viewsOpen: false,
    }));
    const ui = useUiStore();
    expect(ui.partialRefMode).toBe('badges');
    // The rest of the stored state survives the upgrade.
    expect(ui.detailLevel).toBe('keys');
    expect(ui.highlightAll).toBe(true);
  });
});
