import type { LabelsPack } from '@/lib/labels'

/*
 * Every component's English defaults, written out, for `<LabelsProvider labels={en} locale="en">`.
 * The components already speak this English without it; it is here as the starting point to copy
 * for a new language, or to change a word of the English wording across the whole app. Components
 * you have not installed are simply never read.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What the drag and drop components tell screen readers, the shape of `AnnouncementContext`. */
interface DragContext {
  id: string
  from: { containerId: string; index: number }
  to: { containerId: string; index: number }
  count: number
  delta: { x: number; y: number }
}

const place = ({ to, from, count, delta }: DragContext) => {
  if (count <= 0) return `${Math.round(delta.x)}, ${Math.round(delta.y)} pixels from the start`
  const at = `position ${to.index + 1} of ${count}`
  return to.containerId && to.containerId !== from.containerId ? `${at} in ${to.containerId}` : at
}

const drag = {
  start: (context: DragContext) =>
    context.count > 0
      ? `Picked up ${context.id}, ${place(context)}. Use the arrow keys to move it, space or enter to drop it, escape to cancel.`
      : `Picked up ${context.id}. Use the arrow keys to move it, space or enter to drop it, escape to cancel.`,
  move: (context: DragContext) => `${context.id} moved to ${place(context)}.`,
  drop: (context: DragContext) => `${context.id} dropped at ${place(context)}.`,
  cancel: (context: DragContext) => `Dragging ${context.id} cancelled, back at ${place(context)}.`,
}

export const en = {
  'activity-heatmap': {
    grid: (from: string, to: string) => `Activity from ${from} to ${to}`,
    day: (value: string, date: string) => `${value} on ${date}`,
    none: 'Nothing',
    less: 'Less',
    more: 'More',
  },
  'alert-dialog': {
    confirm: 'Continue',
    cancel: 'Cancel',
  },
  'announcement-bar': {
    region: 'Announcements',
    previous: 'Previous message',
    next: 'Next message',
    play: 'Play messages',
    pause: 'Pause messages',
    dismiss: 'Dismiss',
    position: (current: number, count: number) => `${current} of ${count}:`,
    endsIn: (days: number, hours: number, minutes: number) =>
      `Ends in ${[days > 0 && plural(days, 'day', 'days'), hours > 0 && plural(hours, 'hour', 'hours'), plural(minutes, 'minute', 'minutes')].filter(Boolean).join(' ')}`,
    days: (days: number) => `${days}d`,
  },
  'avatar-group': {
    group: (names: string[], more: number) =>
      more > 0
        ? `${names.join(', ')} and ${more} more`
        : names.length > 1
          ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
          : (names[0] ?? 'Nobody'),
    showMore: (count: number) => `Show ${count} more`,
    overflow: 'More people',
    andMore: (count: number) => `and ${count} more`,
  },
  'billing-toggle': {
    group: 'Billing period',
    monthly: 'Monthly',
    yearly: 'Yearly',
    save: (percent: string) => `Save ${percent}`,
  },
  breadcrumb: {
    nav: 'Breadcrumb',
    more: 'More',
    showMore: (count: number) => `Show ${count} more`,
  },
  calendar: {
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
  },
  'card-stack': {
    region: 'Cards',
    carousel: 'carousel',
    slide: 'slide',
    position: (index: number, count: number) => `${index} of ${count}`,
  },
  carousel: {
    carousel: 'carousel',
    items: (label?: string) => (label ? `${label} items` : 'Carousel items'),
    previous: 'Previous',
    next: 'Next',
    goTo: (index: number, count: number) => `Go to item ${index} of ${count}`,
  },
  chart: {
    empty: 'No data',
    summary: (series: string[], points: number, from?: string, to?: string) =>
      `${series.join(', ')}, ${plural(points, 'point', 'points')}${points ? `, from ${from} to ${to}` : ''}`,
    barChart: (summary: string) => `Bar chart of ${summary}`,
    lineChart: (summary: string) => `Line chart of ${summary}`,
  },
  'chat-thread': {
    messages: 'Messages',
    jumpToLatest: 'Jump to latest',
    newMessages: 'New messages',
    you: 'You',
    reactions: 'Reactions',
    addReaction: 'Add reaction',
    reactWith: (emoji: string) => `React with ${emoji}`,
    seenBy: (names: string) => `Seen by ${names}`,
    typing: (names: string, count: number) =>
      count > 2 ? `${count} people are typing` : `${names} ${count === 1 ? 'is' : 'are'} typing`,
    message: 'Message',
    attach: 'Attach files',
    attachments: 'Attachments',
    remove: (name: string) => `Remove ${name}`,
    send: 'Send',
    sending: 'Sending…',
    notSent: 'Not sent',
  },
  'code-block': {
    wrap: 'Wrap lines',
    copy: 'Copy code',
    copied: 'Copied',
    code: (language?: string) => (language ? `${language} code` : 'Code'),
    showLess: 'Show less',
    showAll: (lines: number) => `Show all ${lines} lines`,
  },
  'color-picker': {
    area: 'Saturation and brightness',
    areaRole: '2D slider',
    areaValue: (saturation: number, brightness: number) =>
      `Saturation ${saturation}%, brightness ${brightness}%`,
    hue: 'Hue',
    alpha: 'Opacity',
    format: 'Color format',
    input: 'Color value',
    eyeDropper: 'Pick a color from the screen',
    swatches: 'Saved colors',
    addSwatch: 'Save this color',
    contrast: 'Contrast',
    passes: 'Passes',
    fails: 'Fails',
  },
  combobox: {
    placeholder: 'Select…',
    search: 'Search…',
    empty: 'No results.',
  },
  command: {
    title: 'Command menu',
    description: 'Search for a command or a page',
  },
  'comment-thread': {
    title: 'Comments',
    placeholder: 'Add a comment',
    comment: 'Comment',
    cancel: 'Cancel',
    addReaction: 'Add reaction',
    reactWith: (emoji: string) => `React with ${emoji}`,
    you: 'You',
    commentBy: (name?: string) => `Comment by ${name ?? 'unknown'}`,
    unknown: 'Unknown',
    edited: '(edited)',
    moreActions: 'More actions',
    edit: 'Edit',
    delete: 'Delete',
    editPlaceholder: 'Edit comment',
    save: 'Save',
    reply: 'Reply',
    replyPlaceholder: 'Write a reply',
    showReplies: (count: number) => `Show ${plural(count, 'reply', 'replies')}`,
    hideReplies: (count: number) => `Hide ${count === 1 ? 'reply' : 'replies'}`,
    repliesTo: (name?: string) => `Replies to ${name ?? 'comment'}`,
    resolved: 'Resolved',
    resolve: 'Resolve',
    reopen: 'Reopen',
    empty: 'No comments yet.',
    resolvedNotice: 'This thread is resolved.',
    reopenToReply: 'Reopen it to reply.',
    deleteTitle: 'Delete this comment?',
    deleteDescription: 'This cannot be undone.',
    deleteWithReplies: 'Its replies go with it. This cannot be undone.',
  },
  compare: {
    slider: 'Compare',
  },
  'confirm-morph': {
    question: 'Are you sure?',
    confirm: 'Confirm',
    cancel: 'Cancel',
    pending: 'Working…',
    success: 'Done',
    error: 'Something went wrong',
    undo: 'Undo',
  },
  'copy-button': {
    copy: 'Copy',
    copied: 'Copied',
    failed: 'Copy failed',
  },
  'data-table': {
    search: 'Search…',
    reset: 'Reset',
    resetFilters: 'Reset filters',
    empty: 'No results.',
    selectAll: 'Select all rows',
    selectRow: (name?: string) => `Select ${name || 'row'}`,
    sortHint: 'Click to sort, shift click to sort by several columns',
    results: (count: number, total?: number) =>
      `${plural(count, 'result', 'results')}${total === undefined ? '' : ` of ${total}`}`,
    selected: (count: number, total: number) => `${count} of ${total} selected`,
    pages: 'Pages',
    pageOf: (page: number, count: number) => `Page ${page} of ${count}`,
    previousPage: 'Previous page',
    nextPage: 'Next page',
    filterSelected: (count: number) => `${count} selected`,
    clearFilter: 'Clear filter',
  },
  'date-picker': {
    placeholder: 'Pick a date',
    rangePlaceholder: 'Pick a range',
  },
  'date-range-picker': {
    placeholder: 'Pick a range',
    apply: 'Apply',
    cancel: 'Cancel',
    presets: 'Presets',
    today: 'Today',
    yesterday: 'Yesterday',
    last7Days: 'Last 7 days',
    last30Days: 'Last 30 days',
    thisMonth: 'This month',
    lastMonth: 'Last month',
    thisYear: 'This year',
  },
  dialog: {
    close: 'Close',
  },
  draggable: {
    draggable: 'draggable',
    panel: 'panel',
    handle: 'Move panel',
    ...drag,
  },
  drawer: {
    close: 'Close',
    resize: 'Resize drawer',
    dragToClose: 'Drag to close',
  },
  dropzone: {
    prompt: (multiple: boolean) => `Drop ${multiple ? 'files' : 'a file'} here, or press to choose`,
    maxSize: (size: string) => `up to ${size} each`,
    maxFiles: (count: number) => `at most ${count} files`,
    anyFile: 'Any file',
    notAccepted: (name: string) => `${name} is not an accepted type.`,
    tooLarge: (name: string, size: string) => `${name} is larger than ${size}.`,
    tooMany: (name: string, limit: number) =>
      limit === 1
        ? `${name} was not taken: only one file at a time.`
        : `${name} was not taken: at most ${limit} files at a time.`,
    added: (count: number) => `${plural(count, 'file', 'files')} added.`,
    rejected: (count: number) => `${plural(count, 'file', 'files')} rejected:`,
    noFiles: 'No files.',
  },
  'donut-chart': {
    total: 'Total',
    summary: (slices: string[], caption: string, total: string) =>
      `Donut chart, ${slices.join(', ')}. ${caption} ${total}.`,
  },
  'expandable-card': {
    close: 'Close',
  },
  gallery: {
    open: (index: number, alt?: string) => (alt ? `Open ${alt}` : `Open image ${index}`),
    image: (index: number, count: number) => `Image ${index} of ${count}`,
    help: 'Use the arrow keys to move between images and Escape to close.',
    close: 'Close',
    previous: 'Previous image',
    next: 'Next image',
    show: (index: number) => `Show image ${index}`,
  },
  'hold-to-confirm': {
    hint: 'Press and hold to confirm.',
    confirmed: 'Confirmed',
  },
  'inline-edit': {
    placeholder: 'Empty',
    saveError: 'Could not save. Try again.',
    saving: 'Saving…',
    saved: 'Saved',
  },
  'json-viewer': {
    search: 'Search keys and values',
    match: (current: number, total: number) => `${current} of ${total}`,
    noMatches: 'No matches',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    tree: 'JSON',
    size: (count: number, type: 'array' | 'object') =>
      type === 'array' ? plural(count, 'item', 'items') : plural(count, 'key', 'keys'),
    array: 'array',
    object: 'object',
    showMore: (count: number) => `Show ${count} more`,
    left: (count: number) => `${count} left`,
    copyValue: (path: string) => `Copy value of ${path}`,
    copyPath: (path: string) => `Copy path ${path}`,
    copyValueHint: 'Copy value (c)',
    copyPathHint: 'Copy path (p)',
    valueCopied: 'Value copied',
    pathCopied: 'Path copied',
  },
  kanban: {
    card: 'sortable item',
    ...drag,
  },
  kbd: {
    command: 'Command',
    control: 'Control',
    windows: 'Windows',
    option: 'Option',
    alt: 'Alt',
    shift: 'Shift',
    return: 'Return',
    enter: 'Enter',
    delete: 'Delete',
    forwardDelete: 'Forward Delete',
    backspace: 'Backspace',
    escape: 'Escape',
    tab: 'Tab',
    space: 'Space',
    capsLock: 'Caps Lock',
    upArrow: 'Up Arrow',
    downArrow: 'Down Arrow',
    leftArrow: 'Left Arrow',
    rightArrow: 'Right Arrow',
    pageUp: 'Page Up',
    pageDown: 'Page Down',
    home: 'Home',
    end: 'End',
    plus: 'Plus',
  },
  'mention-input': {
    empty: 'No matches',
    suggestions: 'Suggestions',
    count: (count: number, label?: string) => `${count} ${label ?? 'suggestions'}`,
  },
  'metric-card': {
    loading: 'Loading',
    up: 'Up',
    down: 'Down',
    noChange: 'No change',
  },
  'multi-select': {
    placeholder: 'Select…',
    search: 'Search…',
    empty: 'No results.',
    selectAll: 'Select all',
    clear: 'Clear selection',
    remove: (label: string) => `Remove ${label}`,
    noneSelected: 'None selected',
    selected: (count: number, labels: string) => `${count} selected: ${labels}`,
  },
  navbar: {
    menu: 'Menu',
    openMenu: 'Open menu',
    siteNavigation: 'Site navigation',
    primary: 'Primary',
    more: 'More',
    morePages: 'More pages',
  },
  'notification-center': {
    title: 'Notifications',
    unread: (label: string, count: number) => `${label}, ${count} unread`,
    markAsRead: 'Mark as read',
    unreadDot: 'Unread',
    allTab: 'All',
    unreadTab: 'Unread',
    markAllAsRead: 'Mark all as read',
    caughtUp: 'You are all caught up',
    caughtUpHint: 'Nothing new since you last looked.',
    empty: 'No notifications',
    emptyHint: 'New activity will show up here.',
  },
  'number-field': {
    decrement: 'Decrease',
    increment: 'Increase',
  },
  pagination: {
    nav: 'Pagination',
    previous: 'Previous',
    next: 'Next',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    page: (page: number) => `Page ${page}`,
    morePages: 'More pages',
    pageOf: (page: number, count: number) => `Page ${page} of ${count}`,
  },
  'password-field': {
    reveal: 'Show password',
    strength: 'Password strength',
    empty: 'Empty',
    weak: 'Weak',
    fair: 'Fair',
    good: 'Good',
    strong: 'Strong',
    avoidCommon: 'Avoid common passwords and words.',
    useLength: 'Use at least 12 characters.',
    avoidSequences: 'Avoid runs like abcd or 1234.',
    avoidRepeats: 'Avoid repeating the same character.',
    mixCharacters: 'Mix in capitals, numbers or symbols.',
    addLength: 'A few more characters would make it strong.',
    ruleLength: 'At least 12 characters',
    ruleCase: 'A lowercase and an uppercase letter',
    ruleNumber: 'A number',
    ruleSymbol: 'A symbol',
  },
  'phone-input': {
    country: 'Country',
    search: 'Search countries…',
    empty: 'No country found.',
  },
  'reorderable-grid': {
    tile: 'grid item',
    ...drag,
  },
  'resizable-panels': {
    handle: 'Resize panels',
  },
  'rich-text-editor': {
    placeholder: "Write something, or press '/' for blocks…",
    editor: 'Editor',
    formatting: 'Formatting',
    blocks: 'Blocks',
    linkPlaceholder: 'Paste or type a link',
    linkAddress: 'Link address',
    applyLink: 'Apply link',
    removeLink: 'Remove link',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough',
    code: 'Code',
    link: 'Link',
    heading: 'Heading',
    bulletedList: 'Bulleted list',
    numberedList: 'Numbered list',
    quote: 'Quote',
    text: 'Text',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    divider: 'Divider',
  },
  'search-field': {
    placeholder: 'Search…',
    clear: 'Clear search',
  },
  sidebar: {
    menu: 'Menu',
    navigation: 'Navigation',
    toggle: 'Toggle sidebar',
  },
  'signature-pad': {
    pad: 'Signature',
    strokes: (count: number) => plural(count, 'stroke', 'strokes'),
    empty: 'empty',
    undo: 'Undo',
    clear: 'Clear',
    replay: 'Replay',
    placeholder: 'Sign here',
  },
  sortable: {
    item: 'sortable item',
    ...drag,
  },
  sparkline: {
    summary: ({
      count,
      first,
      last,
      low,
      high,
    }: {
      count: number
      first?: string
      last?: string
      low: string
      high: string
    }) =>
      `Trend of ${count} values${first !== undefined && last !== undefined ? `, from ${first} to ${last}` : ''}, low ${low}, high ${high}`,
    empty: 'No data',
  },
  spinner: {
    loading: 'Loading',
  },
  'split-button': {
    more: 'More options',
  },
  stepper: {
    complete: 'completed',
    current: 'current step',
    upcoming: 'not started',
    error: 'has an error',
    stepOf: (step: number, count: number) => `Step ${step} of ${count}`,
  },
  'swipe-actions': {
    moreActions: (label: string) => `More actions for ${label}`,
  },
  'tag-input': {
    remove: (tag: string) => `Remove ${tag}`,
    max: (max: number) => `Up to ${plural(max, 'tag', 'tags')}.`,
    duplicate: (tag: string) => `${tag} is already added.`,
    added: (tags: string) => `Added ${tags}.`,
    removed: (tag: string) => `Removed ${tag}.`,
  },
  terminal: {
    replay: 'Replay',
  },
  'theme-switch': {
    darkMode: 'Dark mode',
  },
  'time-picker': {
    hour: 'Hours',
    minute: 'Minutes',
    second: 'Seconds',
    period: 'AM/PM',
    list: 'Choose a time',
    empty: 'Empty',
  },
  toast: {
    region: 'Notifications',
    close: 'Close',
  },
  tour: {
    next: 'Next',
    back: 'Back',
    done: 'Done',
    skip: 'Skip tour',
    progress: (current: number, total: number) => `${current} of ${total}`,
  },
  'tree-view': {
    loadFailed: 'could not load, open to retry',
  },
  'usage-meter': {
    warning: 'Almost full',
    over: (overage: string) => `Over by ${overage}`,
    amount: (used: string, limit: string) => `${used} of ${limit}`,
    valueText: (used: string, limit: string) => `${used} of ${limit} used`,
    almostFull: 'almost full',
    overLimit: (overage: string) => `over the limit by ${overage}`,
    free: 'Free',
  },
} satisfies LabelsPack
