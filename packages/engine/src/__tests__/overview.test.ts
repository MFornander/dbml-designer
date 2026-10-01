// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { autoLod, wrapName } from '../geometry/lod';
import { mount } from '../mount';
import type { Model } from '../model';

describe('wrapName', () => {
  it('breaks after separators and between words, cuts what is too long, and ends in an ellipsis when it runs out of lines', () => {
    expect(wrapName('collection_power', 12, 3)).toEqual(['collection_', 'power']);
    expect(wrapName('collectionPower', 12, 3)).toEqual(['collection', 'Power']);
    expect(wrapName('a_very_long_table_name', 8, 2)).toEqual(['a_very_', 'long_ta…']);
    expect(wrapName('abcdefghijkl', 5, 3)).toEqual(['abcde', 'fghij', 'kl']);
    expect(wrapName('users', 2, 3)).toEqual([]);
  });
});

describe('autoLod', () => {
  it('takes the thresholds given', () => {
    expect(autoLod(0.3, { minimal: 0.4, structure: 0.2 })).toBe('minimal');
    expect(autoLod(0.15, { minimal: 0, structure: 0 })).toBe('full');
  });
});

const MODEL: Model = {
  tables: [
    { schema: 'rollup', name: 'collection_power', fields: [{ name: 'input_watts', type: 'double' }, { name: 'case_id', type: 'int' }] },
    { schema: 'power', name: 'line_power', fields: [{ name: 'input_watts', type: 'double' }] },
  ],
  deps: [{ from: { table: 'power.line_power', fields: ['input_watts'] }, to: { table: 'rollup.collection_power', fields: ['input_watts'] }, kind: 'value' }],
  groups: [{ schema: 'rollup', name: 'rollups', tables: ['rollup.collection_power'] }],
};
const COLUMN = 'dep:power.line_power(input_watts)->rollup.collection_power(input_watts)';
const PAIR = 'dep:power.line_power->rollup.collection_power';

describe('zoomed out', () => {
  it('draws names and group titles that stay readable, chips as dots, and lineage table to table', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const { engine, unmount } = mount(element, { model: MODEL, display: { lineageColumns: true } });
    await flushPromises();
    await nextTick();
    engine.setChips({ 'rollup.collection_power': [{ id: 'kind', label: 'core', outline: true }, { id: 'status', label: '1 row', color: '#D97706' }] });
    expect(engine.lod.value).toBe('full');
    expect(element.querySelector(`[data-key="${COLUMN}"]`)).not.toBeNull();

    engine.setViewport({ zoom: 0.5 });
    engine.setDisplay({ zoomDetail: { minimal: 0.6, structure: 0.1 } });
    await nextTick();
    expect(engine.lod.value).toBe('minimal');
    expect(element.querySelector('.dg-root')!.classList.contains('is-overview')).toBe(true);
    const name = element.querySelector('.dg-table[data-key="rollup.collection_power"] .dg-overview-name')!;
    expect(name.textContent?.replace(/\s+/g, '')).toBe('collection_power');
    // Its size is constant on screen: 12px at zoom 0.5 is 24 diagram units.
    expect(name.getAttribute('font-size')).toBe('24');
    expect(element.querySelector('.dg-overview-group')?.textContent).toBe('rollups');
    expect(element.querySelectorAll('.dg-chip-dot')).toHaveLength(2);
    expect(element.querySelector('.dg-chip-dot.is-outline')).not.toBeNull();
    // Lineage by column gives way to the table pair; a column pair the host lights lights its pair.
    expect(element.querySelector(`[data-key="${COLUMN}"]`)).toBeNull();
    engine.highlight([COLUMN]);
    await nextTick();
    expect(element.querySelector(`[data-key="${PAIR}"]`)!.classList.contains('is-highlighted')).toBe(true);
    unmount();
    element.remove();
  });
});
