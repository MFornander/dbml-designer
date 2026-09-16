import { computed, type Ref } from 'vue';
import type { PositionsMap } from '@/types/diagram';
import type {
  DepLineVM, DetailLevel, DiagramModel, EdgeEndpointVM, FieldVM, GroupVM, MarkerKind, RefVM,
} from '../types';
import type { GroupKey, NoteKey, TableKey } from '../keys';
import type { Measurer } from '../geometry/measure';
import { computeTableSize, type TableSize } from '../geometry/tableSize';
import { rowIndexMap, visibleFields } from '../geometry/lod';
import {
  centerAnchor, endpointAnchor, pickSides, selfRefAnchors, type AnchorPoint, type Side,
} from '../geometry/anchors';
import {
  dedupeCollinear, isValidRails, midpoint, routeRef, routeWithRails, trimEnds, type Rails,
} from '../geometry/routing';
import { roundedPolylinePath, sCurve } from '../geometry/pathBuilder';
import { markerGeometry, type MarkerGeometry } from '../geometry/markers';
import { groupBounds, contentBounds as boundsOf } from '../geometry/layout';
import { lineageLayout } from '../geometry/lineageLayout';
import {
  FONT_GROUP_NAME, GROUP_COLLAPSED_BODY_H, GROUP_COLLAPSED_MIN_W, GROUP_HEADER_CONTROLS_W, GROUP_HEADER_H,
  GROUP_NAME_X, NOTE_H, NOTE_W,
} from '../geometry/constants';
import type { Point, Rect, Size } from '../geometry/rect';

export interface RefGeometry {
  a: AnchorPoint;
  b: AnchorPoint;
  points: Point[];
  dFull: string;
  dTrimmed: string;
  markerA: MarkerGeometry;
  markerB: MarkerGeometry;
  mid: Point;
  /** The custom rails this route follows, or null for the automatic route (see routing.ts). */
  rails: Rails | null;
}

/** Live rails while a control point of one edge is being dragged. */
export interface RouteDragOverride {
  key: string;
  rails: readonly number[];
}

export interface GroupBox {
  group: GroupVM;
  box: Rect;
  collapsed: boolean;
  /** Members that currently have a position. */
  memberCount: number;
  /** Measured width of the group name. */
  nameW: number;
}

/**
 * Live override while dragging or resizing. `pos` moves a table or note,
 * `size` resizes a note, and `delta` with `memberKeys` moves a whole group or
 * a multi-selection of tables and notes.
 */
export interface DragOverride {
  key: string;
  pos?: Point;
  size?: Size;
  delta?: Point;
  memberKeys?: ReadonlySet<TableKey>;
}

export interface GeometryInputs {
  model: Ref<DiagramModel>;
  positions: Ref<PositionsMap>;
  detailLevel: Ref<DetailLevel>;
  collapsedGroups: Ref<ReadonlySet<GroupKey>>;
  showRefs: Ref<boolean>;
  showLineage: Ref<boolean>;
  /** Lineage layout: tables laid out by dependency order; groups and notes hidden. */
  lineageLayout: Ref<boolean>;
  dragOverride: Ref<DragOverride | null>;
  /** Custom orthogonal routes by ref key. */
  edgeRoutes: Ref<Readonly<Record<string, readonly number[]>>>;
  routeDragOverride: Ref<RouteDragOverride | null>;
  /** Tables and notes the active diagram view hides; they get no box, so their edges vanish too. */
  hidden: Ref<ReadonlySet<string>>;
  measurer: Measurer;
  /** Bumped when fonts finish loading so sizes are recomputed. */
  measureVersion: Ref<number>;
}

/** Common shape for relationship and lineage edges while routing. */
interface Edge {
  key: string;
  endpoints: [EdgeEndpointVM, EdgeEndpointVM];
  markers: [MarkerKind, MarkerKind];
  isSelf: boolean;
  /** Lineage edges are drawn as smooth curves instead of orthogonal routes. */
  curved: boolean;
}

/** Where an endpoint attaches: a table row, a table header, or the center of a collapsed group. */
interface Attachment {
  box: Rect;
  rowIndex: number | null;
  center: boolean;
  groupKey?: GroupKey;
}

function refToEdge (r: RefVM): Edge {
  return {
    key: r.key,
    endpoints: r.endpoints,
    markers: [r.endpoints[0].marker, r.endpoints[1].marker],
    isSelf: r.isSelf,
    curved: false,
  };
}

function depToEdge (d: DepLineVM): Edge {
  return {
    key: d.key,
    endpoints: [d.upstream, d.downstream],
    markers: ['none', 'arrow'],
    isSelf: d.isSelf,
    curved: true,
  };
}

function dir (side: Side): 1 | -1 {
  return side === 'right' ? 1 : -1;
}

/**
 * The reactive spine of the renderer: rows, measured sizes, boxes, anchors,
 * routes, group boxes, and content bounds, all derived from the model, the
 * stored positions, the detail level, collapsed groups, and the live drag override.
 */
export function useDiagramGeometry (input: GeometryInputs) {
  const rowsByTable = computed(() => {
    const map = new Map<TableKey, FieldVM[]>();
    for (const t of input.model.value.tables) map.set(t.key, visibleFields(t, input.detailLevel.value));
    return map;
  });

  const sizes = computed(() => {
    void input.measureVersion.value;
    const map = new Map<TableKey, TableSize>();
    for (const t of input.model.value.tables) {
      map.set(t.key, computeTableSize(t, rowsByTable.value.get(t.key) ?? [], input.measurer));
    }
    return map;
  });

  /** Sizes at the "all fields" level, used for placement so layouts survive detail-level changes. */
  const fullSizes = computed(() => {
    void input.measureVersion.value;
    const map = new Map<TableKey, TableSize>();
    for (const t of input.model.value.tables) {
      map.set(t.key, computeTableSize(t, visibleFields(t, 'all'), input.measurer));
    }
    return map;
  });

  /** Derived positions for the lineage layout (never persisted). */
  const lineage = computed(() => {
    if (!input.lineageLayout.value) return null;
    return lineageLayout({
      tables: input.model.value.tables,
      deps: input.model.value.deps,
      sizes: sizes.value,
    });
  });

  /** Tables that take no part in lineage; dimmed in the lineage layout. */
  const unrelatedTables = computed<ReadonlySet<TableKey>>(() => new Set(lineage.value?.unrelated ?? []));

  const boxes = computed(() => {
    const map = new Map<TableKey, Rect>();
    const override = input.dragOverride.value;
    const derived = lineage.value?.positions;
    for (const t of input.model.value.tables) {
      if (input.hidden.value.has(t.key)) continue;
      let pos: Point | undefined = derived ? derived.get(t.key) : input.positions.value[t.key];
      if (override?.key === t.key && override.pos) pos = override.pos;
      if (!pos) continue;
      if (override?.delta && override.memberKeys?.has(t.key)) {
        pos = {
          x: pos.x + override.delta.x,
          y: pos.y + override.delta.y,
        };
      }
      const size = sizes.value.get(t.key)!;
      map.set(t.key, {
        x: pos.x,
        y: pos.y,
        w: size.width,
        h: size.height,
      });
    }
    return map;
  });

  const unplacedTables = computed(() => (input.lineageLayout.value
    ? []
    : input.model.value.tables.filter((t) => !boxes.value.has(t.key) && !input.hidden.value.has(t.key)).map((t) => t.key)));

  const noteBoxes = computed(() => {
    const map = new Map<NoteKey, Rect>();
    if (input.lineageLayout.value) return map;
    const override = input.dragOverride.value;
    for (const n of input.model.value.notes) {
      if (input.hidden.value.has(n.key)) continue;
      const stored = input.positions.value[n.key];
      let pos: Point | undefined = override?.key === n.key && override.pos ? override.pos : stored;
      if (!pos) continue;
      if (override?.delta && override.memberKeys?.has(n.key)) {
        pos = {
          x: pos.x + override.delta.x,
          y: pos.y + override.delta.y,
        };
      }
      const size = override?.key === n.key && override.size
        ? override.size
        : {
            w: stored?.w ?? NOTE_W,
            h: stored?.h ?? NOTE_H,
          };
      map.set(n.key, {
        x: pos.x,
        y: pos.y,
        w: size.w,
        h: size.h,
      });
    }
    return map;
  });

  const unplacedNotes = computed(() => (input.lineageLayout.value
    ? []
    : input.model.value.notes.filter((n) => !noteBoxes.value.has(n.key) && !input.hidden.value.has(n.key)).map((n) => n.key)));

  const rowIndexByTable = computed(() => {
    const map = new Map<TableKey, Map<string, number>>();
    for (const [key, rows] of rowsByTable.value) map.set(key, rowIndexMap(rows));
    return map;
  });

  /** Group boxes: expanded groups wrap their members; collapsed ones are a compact box at the same spot. */
  const groupBoxes = computed<GroupBox[]>(() => {
    void input.measureVersion.value;
    const out: GroupBox[] = [];
    if (input.lineageLayout.value) return out;
    for (const group of input.model.value.groups) {
      const members = group.tableKeys.map((k) => boxes.value.get(k)).filter((b): b is Rect => !!b);
      const bounds = groupBounds(members);
      if (!bounds) continue;
      const nameW = input.measurer.measure(group.name, FONT_GROUP_NAME);
      const collapsed = input.collapsedGroups.value.has(group.key);
      if (!collapsed) {
        out.push({
          group,
          box: bounds,
          collapsed: false,
          memberCount: members.length,
          nameW,
        });
        continue;
      }
      out.push({
        group,
        box: {
          x: bounds.x,
          y: bounds.y,
          w: Math.max(GROUP_COLLAPSED_MIN_W, Math.ceil(GROUP_NAME_X + nameW + GROUP_HEADER_CONTROLS_W)),
          h: GROUP_HEADER_H + GROUP_COLLAPSED_BODY_H,
        },
        collapsed: true,
        memberCount: members.length,
        nameW,
      });
    }
    return out;
  });

  /** For tables hidden inside a collapsed group: the group box that stands in for them. */
  const collapsedBoxByTable = computed(() => {
    const map = new Map<TableKey, { groupKey: GroupKey; box: Rect }>();
    for (const g of groupBoxes.value) {
      if (!g.collapsed) continue;
      for (const k of g.group.tableKeys) {
        map.set(k, {
          groupKey: g.group.key,
          box: g.box,
        });
      }
    }
    return map;
  });

  const visibleTableKeys = computed(() => {
    const set = new Set<TableKey>();
    for (const t of input.model.value.tables) {
      if (boxes.value.has(t.key) && !collapsedBoxByTable.value.has(t.key)) set.add(t.key);
    }
    return set;
  });

  const edges = computed<Edge[]>(() => {
    const list: Edge[] = [];
    if (input.showRefs.value) list.push(...input.model.value.refs.map(refToEdge));
    if (input.showLineage.value) {
      for (const d of input.model.value.deps) {
        list.push(depToEdge(d));
        // Column-level mappings are routed too; the canvas draws them only while a field is hovered.
        for (const c of d.columns) list.push(depToEdge(c));
      }
    }
    return list;
  });

  const routes = computed(() => {
    const result = new Map<string, RefGeometry>();
    const anchors = new Map<string, [AnchorPoint, AnchorPoint]>();
    const markers = new Map<string, [MarkerGeometry, MarkerGeometry]>();

    // Resolve the box an endpoint attaches to: its table, or its collapsed group.
    const attach = (ep: EdgeEndpointVM): Attachment | null => {
      const collapsed = collapsedBoxByTable.value.get(ep.tableKey);
      if (collapsed) {
        return {
          box: collapsed.box,
          rowIndex: null,
          center: true,
          groupKey: collapsed.groupKey,
        };
      }
      const box = boxes.value.get(ep.tableKey);
      if (!box) return null;
      const rowIndex = ep.fieldKeys.length
        ? rowIndexByTable.value.get(ep.tableKey)?.get(ep.fieldKeys[0]!) ?? null
        : null;
      return {
        box,
        rowIndex,
        center: false,
      };
    };

    const makeAnchor = (p: Attachment, side: Side): AnchorPoint =>
      (p.center ? centerAnchor(p.box, side) : endpointAnchor(p.box, p.rowIndex, side));

    // Pass 1: anchors and markers. Every edge leaving a row exits from one point at the row's
    // vertical center, as dbdiagram does: the lines share the stub and diverge at their own bend
    // columns instead of fanning out along the table edge.
    for (const edge of edges.value) {
      const [ea, eb] = edge.endpoints;
      const A = attach(ea);
      const B = attach(eb);
      if (!A || !B) continue;
      // Both ends inside the same collapsed group: nothing to draw.
      if (A.groupKey && A.groupKey === B.groupKey) continue;

      markers.set(edge.key, [markerGeometry(edge.markers[0]), markerGeometry(edge.markers[1])]);

      if (edge.isSelf && !A.groupKey) {
        anchors.set(edge.key, selfRefAnchors(A.box, A.rowIndex, B.rowIndex));
        continue;
      }

      const [sideA, sideB] = pickSides(A.box, B.box);
      anchors.set(edge.key, [makeAnchor(A, sideA), makeAnchor(B, sideB)]);
    }

    // Pass 2: route and build paths.
    for (const edge of edges.value) {
      const pair = anchors.get(edge.key);
      const mk = markers.get(edge.key);
      if (!pair || !mk) continue;
      const [a, b] = pair;
      const [markerA, markerB] = mk;

      if (edge.curved) {
        const dA = dir(a.side);
        const dB = dir(b.side);
        const full = sCurve(a, dA, b, dB);
        const trimmedA = {
          x: a.x + dA * markerA.lineShorten,
          y: a.y,
        };
        const trimmedB = {
          x: b.x + dB * markerB.lineShorten,
          y: b.y,
        };
        result.set(edge.key, {
          a,
          b,
          points: [a, b],
          dFull: full.d,
          dTrimmed: sCurve(trimmedA, dA, trimmedB, dB).d,
          markerA,
          markerB,
          mid: full.mid,
          rails: null,
        });
        continue;
      }

      // A route being dragged wins over the stored one; malformed stored rails fall back to automatic.
      const live = input.routeDragOverride.value;
      const custom = live?.key === edge.key ? live.rails : input.edgeRoutes.value[edge.key];
      const rails = custom && isValidRails(custom) ? [...custom] : null;
      const points = rails ? dedupeCollinear(routeWithRails(a, b, rails)) : routeRef(a, b);
      const trimmed = trimEnds(points, markerA.lineShorten, markerB.lineShorten);
      result.set(edge.key, {
        a,
        b,
        points,
        dFull: roundedPolylinePath(points),
        dTrimmed: roundedPolylinePath(trimmed),
        markerA,
        markerB,
        mid: midpoint(points),
        rails,
      });
    }
    return result;
  });

  const contentBounds = computed<Rect | null>(() => boundsOf([
    ...[...boxes.value.entries()].filter(([k]) => visibleTableKeys.value.has(k)).map(([, b]) => b),
    ...noteBoxes.value.values(),
    ...groupBoxes.value.map((g) => g.box),
  ]));

  return {
    rowsByTable,
    sizes,
    fullSizes,
    boxes,
    visibleTableKeys,
    unplacedTables,
    noteBoxes,
    unplacedNotes,
    routes,
    groupBoxes,
    collapsedBoxByTable,
    contentBounds,
    unrelatedTables,
  };
}
