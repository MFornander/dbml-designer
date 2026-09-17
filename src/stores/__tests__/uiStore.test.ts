import { describe, it, expect } from 'vitest';
import { migrateUiState } from '@/stores/uiStore';

const FLAGS = {
  lineageLayout: false,
  highlightAll: false,
  layoutOpen: false,
  layoutSize: 40,
  editorCollapsed: false,
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
      version: 8,
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
    expect(migrateUiState(v2(true)).version).toBe(8);
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
      version: 8,
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

  it('adds the layout panel and collapsed flags when upgrading from version 4, keeping the toggles', () => {
    expect(migrateUiState(JSON.stringify(v4))).toEqual({
      ...v4,
      version: 8,
      layoutOpen: false,
      layoutSize: 40,
      editorCollapsed: false,
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
      version: 8,
      layoutOpen: true,
      layoutSize: 40,
      editorCollapsed: false,
    });
    const v6 = {
      ...v4,
      version: 6,
      editorView: 'dbml',
      editorCollapsed: true,
    };
    expect(migrateUiState(JSON.stringify(v6))).toEqual({
      ...v4,
      version: 8,
      layoutOpen: false,
      layoutSize: 40,
      editorCollapsed: true,
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
      version: 8,
      layoutSize: 40,
    });
  });

  it('passes version 8 state through unchanged', () => {
    const v8 = {
      ...v4,
      version: 8,
      layoutOpen: true,
      layoutSize: 55,
      editorCollapsed: true,
    };
    expect(migrateUiState(JSON.stringify(v8))).toEqual(v8);
  });
});
