// Geometry constants chosen to resemble dbdiagram.io. Values only; no code was copied.

/** Height of the table header and of every field row. */
export const ROW_H = 32;
/** Vertical anchor for table-level refs (header center). */
export const HEADER_ANCHOR_Y = ROW_H / 2;
/** Horizontal padding inside a row. */
export const PAD_X = 10;
/** Extra width added to the widest measured row. */
export const WIDTH_EXTRA = 50;
export const TABLE_RADIUS = 3;
export const TABLE_SHADOW_DY = 2;

/** Snap unit for positions and the dot grid pitch. */
export const GRID = 8;

export const ICON_W = 12;
export const ICON_GAP = 4;
/** Space between a table's name (and its icon) and the faded schema label at the header's right. */
export const SCHEMA_GAP = 12;
export const ICON_SPACING = 6;

export const FONT_SIZE = 13;
export const FONT_FAMILY_UI = '"Open Sans", system-ui, sans-serif';
export const FONT_FAMILY_MONO = 'Inconsolata, ui-monospace, monospace';
export const FONT_TABLE_NAME = `bold ${FONT_SIZE}px ${FONT_FAMILY_UI}`;
export const FONT_FIELD = `${FONT_SIZE}px ${FONT_FAMILY_UI}`;
export const FONT_FIELD_BOLD = `bold ${FONT_SIZE}px ${FONT_FAMILY_UI}`;
export const FONT_TYPE = `${FONT_SIZE}px ${FONT_FAMILY_MONO}`;
export const FONT_TYPE_BOLD = `bold ${FONT_SIZE}px ${FONT_FAMILY_MONO}`;
export const FONT_GROUP_NAME = `600 ${FONT_SIZE}px ${FONT_FAMILY_UI}`;
export const FONT_NOTE = `${FONT_SIZE}px ${FONT_FAMILY_UI}`;
export const FONT_PARTIAL_BADGE = `600 11px ${FONT_FAMILY_UI}`;
/** All fonts the measurer relies on; loaded up front so widths are exact. */
export const ALL_FONTS = [FONT_TABLE_NAME, FONT_FIELD, FONT_FIELD_BOLD, FONT_TYPE, FONT_TYPE_BOLD, FONT_GROUP_NAME, FONT_PARTIAL_BADGE];

// Partial badges: `~name` pills in a table header standing in for the refs a TablePartial brings
export const PARTIAL_BADGE_H = 18;
export const PARTIAL_BADGE_PAD_X = 6;
/** Space before each badge, after the name (or its note icon) or the previous badge. */
export const PARTIAL_BADGE_GAP = 6;

// Record values: a column at the right of the field rows when a table has one record
/** Values are drawn like types, in the monospace face. */
export const FONT_VALUE = FONT_TYPE;
/** Space between the type (and its badges) and the value column. */
export const VALUE_GAP = 14;
/** The value column never grows wider; longer values end in an ellipsis. */
export const VALUE_MAX_W = 150;

// Refs
export const CROW_W = 10;
export const CROW_H = 4;
export const CIRCLE_R = 3;
export const SPACE_TAIL = 5;
/** Horizontal stub leaving each anchor before the first bend. */
export const STUB = 20;
export const HIT_W = 20;
export const MAX_CORNER_R = 10;
/** Vertical distance between the two anchors of a self-referencing ref that loops out of the header. */
export const SELF_REF_GAP = 24;

/** Size of the color-settings gear shown on hovered tables, groups, and notes. */
export const GEAR_SIZE = 16;

// Table groups
export const GROUP_HEADER_H = 32;
export const GROUP_PAD = 25;
export const GROUP_RADIUS = 6;
export const GROUP_TEXT_PAD_X = 12;
/** Collapse triangle at the left of the group header, then the name (dbdiagram layout). */
export const GROUP_TOGGLE_X = 10;
export const GROUP_NAME_X = 28;
/** Size of a collapsed group box (header plus a short body). */
export const GROUP_COLLAPSED_BODY_H = 40;
export const GROUP_COLLAPSED_MIN_W = 200;
/** Room reserved at the right of the group header for the note icon and the collapse toggle. */
export const GROUP_HEADER_CONTROLS_W = 56;

// Sticky notes
export const NOTE_W = 192;
export const NOTE_H = 192;
export const NOTE_MIN_W = 160;
export const NOTE_MIN_H = 80;
export const NOTE_RADIUS = 4;
export const NOTE_PAD = 16;
export const NOTE_RESIZE_HANDLE = 14;

// Viewport
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 1.05;
export const FIT_PADDING = 40;

// Automatic level of detail thresholds (zoom scale)
export const LOD_STRUCTURE_MAX = 0.1;
export const LOD_MINIMAL_MAX = 0.2;
export const PLACEHOLDER_HEIGHT_RATIO = 0.3;

// Initial placement
export const PLACE_COL_GAP = 64;
export const PLACE_ROW_GAP = 40;
export const PLACE_COL_HEIGHT = 900;
export const NOTE_GAP = 24;
