/**
 * The one menu look, taken from the hamburger menu in the header: every dropdown, list, and
 * action menu in the app composes these classes and adds only its own positioning.
 */

/** The floating panel. Add positioning (absolute/fixed, offsets, width, z-index) at the call site. */
export const MENU_PANEL = 'rounded-md border border-gray-200 bg-white py-1 text-[13px] font-normal text-gray-800 shadow-xl dark:border-gray-700 dark:bg-[#2d2f35] dark:text-gray-100';

/** A row: icon or check slot, label, optional right-aligned hint. */
export const MENU_ITEM = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-white/5';

/** The current choice in a list of options. */
export const MENU_ACTIVE = 'text-blue-600 dark:text-blue-300';

export const MENU_DIVIDER = 'my-1 h-px bg-gray-200 dark:bg-gray-700';

/** Secondary text at the right end of a row. */
export const MENU_HINT = 'ml-auto text-xs text-gray-400';

/** The fixed-width slot before a label that holds a check mark or an icon, so labels line up. */
export const MENU_SLOT = 'flex w-4 shrink-0 items-center justify-center';
