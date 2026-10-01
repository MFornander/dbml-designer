import { CIRCLE_R, CROW_H, CROW_W } from './constants';
import { parseMultiplicity } from '../multiplicity';
import type { MarkerKind } from '../types';

export interface MarkerGeometry {
  /** Path in a local frame: anchor at the origin, table edge at x = 0, line toward +x. */
  d: string;
  /** How far the edge line is shortened so it starts where the marker ends. */
  lineShorten: number;
}

/** Map a ref end's cardinality (`1`, `*`, `0..1`, ...) to the marker to draw at that endpoint. */
export function markerKind (c: string): MarkerKind {
  const { min, max } = parseMultiplicity(c);
  const many = max === '*' || (typeof max === 'number' && max > 1);
  const optional = min === 0;
  if (many) return optional ? 'many' : 'some';
  return optional ? 'maybe' : 'one';
}

const TAIL = `M0 0 H${CROW_W}`;
const BAR = `M${CROW_W / 2} ${-CROW_H} V${CROW_H}`;
const FOOT = `M${CROW_W} 0 L0 ${-CROW_H} M${CROW_W} 0 L0 ${CROW_H}`;
const CIRCLE = `M${CROW_W} 0 a${CIRCLE_R} ${CIRCLE_R} 0 1 0 ${2 * CIRCLE_R} 0 a${CIRCLE_R} ${CIRCLE_R} 0 1 0 ${-2 * CIRCLE_R} 0`;
/** Arrowhead with its tip on the table edge, pointing into the table. */
const ARROW_L = 9;
const ARROW_H = 4.5;
const ARROW = `M${ARROW_L} ${-ARROW_H} L0 0 L${ARROW_L} ${ARROW_H}`;

const MARKERS: Record<MarkerKind, MarkerGeometry> = {
  one: {
    d: `${TAIL} ${BAR}`,
    lineShorten: CROW_W,
  },
  some: {
    d: `${TAIL} ${FOOT}`,
    lineShorten: CROW_W,
  },
  maybe: {
    d: `${TAIL} ${BAR} ${CIRCLE}`,
    lineShorten: CROW_W + 2 * CIRCLE_R,
  },
  many: {
    d: `${TAIL} ${FOOT} ${CIRCLE}`,
    lineShorten: CROW_W + 2 * CIRCLE_R,
  },
  none: {
    d: '',
    lineShorten: 0,
  },
  arrow: {
    d: ARROW,
    lineShorten: ARROW_L - 1,
  },
};

export function markerGeometry (kind: MarkerKind): MarkerGeometry {
  return MARKERS[kind];
}
