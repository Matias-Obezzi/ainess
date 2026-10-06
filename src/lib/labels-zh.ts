import type { LabelsPack } from '@/lib/labels'

/*
 * Every component in Simplified Chinese, for `<LabelsProvider labels={zh} locale="zh-CN">`. Plain,
 * concise UI wording with a space between Chinese and Latin text or numbers; copy it and change any
 * word you like. Components you have not installed are simply never read.
 */

/** What the drag and drop components tell screen readers, the shape of `AnnouncementContext`. */
interface DragContext {
  id: string
  from: { containerId: string; index: number }
  to: { containerId: string; index: number }
  count: number
  delta: { x: number; y: number }
}

const place = ({ to, from, count, delta }: DragContext) => {
  if (count <= 0) return `距起点 (${Math.round(delta.x)}, ${Math.round(delta.y)}) 像素处`
  const at = `第 ${to.index + 1} 个位置（共 ${count} 个）`
  return to.containerId && to.containerId !== from.containerId
    ? `${at}，在 ${to.containerId} 中`
    : at
}

const drag = {
  start: (context: DragContext) =>
    context.count > 0
      ? `已拿起 ${context.id}，位于${place(context)}。使用方向键移动，按空格键或回车键放下，按 Esc 键取消。`
      : `已拿起 ${context.id}。使用方向键移动，按空格键或回车键放下，按 Esc 键取消。`,
  move: (context: DragContext) => `${context.id} 已移至${place(context)}。`,
  drop: (context: DragContext) => `${context.id} 已放在${place(context)}。`,
  cancel: (context: DragContext) => `已取消拖动 ${context.id}，已回到${place(context)}。`,
}

export const zh = {
  'activity-heatmap': {
    grid: (from: string, to: string) => `${from} 至 ${to} 的活动`,
    day: (value: string, date: string) => `${date}：${value}`,
    none: '无',
    less: '少',
    more: '多',
  },
  'alert-dialog': {
    confirm: '继续',
    cancel: '取消',
  },
  'announcement-bar': {
    region: '公告',
    previous: '上一条消息',
    next: '下一条消息',
    play: '继续播放消息',
    pause: '暂停播放消息',
    dismiss: '关闭',
    position: (current: number, count: number) => `第 ${current} 条，共 ${count} 条：`,
    endsIn: (days: number, hours: number, minutes: number) =>
      `距结束还有 ${[days > 0 && `${days} 天`, hours > 0 && `${hours} 小时`, `${minutes} 分钟`].filter(Boolean).join(' ')}`,
    days: (days: number) => `${days} 天`,
  },
  'avatar-group': {
    group: (names: string[], more: number) =>
      more > 0
        ? `${names.join('、')} 及另外 ${more} 人`
        : names.length > 1
          ? `${names.slice(0, -1).join('、')} 和 ${names[names.length - 1]}`
          : (names[0] ?? '无人'),
    showMore: (count: number) => `显示其余 ${count} 人`,
    overflow: '更多人员',
    andMore: (count: number) => `及另外 ${count} 人`,
  },
  'billing-toggle': {
    group: '计费周期',
    monthly: '月付',
    yearly: '年付',
    save: (percent: string) => `节省 ${percent}`,
  },
  breadcrumb: {
    nav: '面包屑导航',
    more: '更多',
    showMore: (count: number) => `显示其余 ${count} 项`,
  },
  calendar: {
    previousMonth: '上个月',
    nextMonth: '下个月',
  },
  'card-stack': {
    region: '卡片',
    carousel: '轮播',
    slide: '幻灯片',
    position: (index: number, count: number) => `第 ${index} 张，共 ${count} 张`,
  },
  carousel: {
    carousel: '轮播',
    items: (label?: string) => (label ? `${label} 中的项目` : '轮播项目'),
    previous: '上一个',
    next: '下一个',
    goTo: (index: number, count: number) => `转到第 ${index} 项，共 ${count} 项`,
  },
  chart: {
    empty: '暂无数据',
    summary: (series: string[], points: number, from?: string, to?: string) =>
      `${series.join('、')}，${points} 个数据点${points ? `，从 ${from} 到 ${to}` : ''}`,
    barChart: (summary: string) => `柱状图：${summary}`,
    lineChart: (summary: string) => `折线图：${summary}`,
  },
  'chat-thread': {
    messages: '消息',
    jumpToLatest: '跳到最新',
    newMessages: '新消息',
    you: '你',
    reactions: '表情回应',
    addReaction: '添加表情回应',
    reactWith: (emoji: string) => `用 ${emoji} 回应`,
    seenBy: (names: string) => `${names} 已读`,
    typing: (names: string, count: number) =>
      count > 2 ? `${count} 人正在输入` : `${names} 正在输入`,
    message: '消息',
    attach: '添加附件',
    attachments: '附件',
    remove: (name: string) => `移除 ${name}`,
    send: '发送',
    sending: '发送中…',
    notSent: '未发送',
  },
  'code-block': {
    wrap: '自动换行',
    copy: '复制代码',
    copied: '已复制',
    code: (language?: string) => (language ? `${language} 代码` : '代码'),
    showLess: '收起',
    showAll: (lines: number) => `显示全部 ${lines} 行`,
  },
  'color-picker': {
    area: '饱和度和亮度',
    areaRole: '二维滑块',
    areaValue: (saturation: number, brightness: number) =>
      `饱和度 ${saturation}%，亮度 ${brightness}%`,
    hue: '色相',
    alpha: '不透明度',
    format: '颜色格式',
    input: '颜色值',
    eyeDropper: '从屏幕取色',
    swatches: '已保存的颜色',
    addSwatch: '保存此颜色',
    contrast: '对比度',
    passes: '通过',
    fails: '未通过',
  },
  combobox: {
    placeholder: '请选择…',
    search: '搜索…',
    empty: '没有结果。',
  },
  command: {
    title: '命令菜单',
    description: '搜索命令或页面',
  },
  'comment-thread': {
    title: '评论',
    placeholder: '添加评论',
    comment: '评论',
    cancel: '取消',
    addReaction: '添加表情回应',
    reactWith: (emoji: string) => `用 ${emoji} 回应`,
    you: '你',
    commentBy: (name?: string) => (name ? `${name} 的评论` : '未知用户的评论'),
    unknown: '未知用户',
    edited: '（已编辑）',
    moreActions: '更多操作',
    edit: '编辑',
    delete: '删除',
    editPlaceholder: '编辑评论',
    save: '保存',
    reply: '回复',
    replyPlaceholder: '撰写回复',
    showReplies: (count: number) => `显示 ${count} 条回复`,
    hideReplies: (count: number) => `隐藏 ${count} 条回复`,
    repliesTo: (name?: string) => (name ? `${name} 的回复` : '评论的回复'),
    resolved: '已解决',
    resolve: '解决',
    reopen: '重新打开',
    empty: '还没有评论。',
    resolvedNotice: '此讨论已解决。',
    reopenToReply: '重新打开后即可回复。',
    deleteTitle: '删除这条评论？',
    deleteDescription: '此操作无法撤销。',
    deleteWithReplies: '其回复也会一并删除。此操作无法撤销。',
  },
  compare: {
    slider: '对比',
  },
  'confirm-morph': {
    question: '确定吗？',
    confirm: '确认',
    cancel: '取消',
    pending: '处理中…',
    success: '已完成',
    error: '出了点问题',
    undo: '撤销',
  },
  'copy-button': {
    copy: '复制',
    copied: '已复制',
    failed: '复制失败',
  },
  'data-table': {
    search: '搜索…',
    reset: '重置',
    resetFilters: '重置筛选',
    empty: '没有结果。',
    selectAll: '选择所有行',
    selectRow: (name?: string) => (name ? `选择 ${name}` : '选择此行'),
    sortHint: '点击排序，按住 Shift 点击可按多列排序',
    results: (count: number, total?: number) =>
      `${count} 条结果${total === undefined ? '' : `，共 ${total} 条`}`,
    selected: (count: number, total: number) => `已选择 ${count} 行，共 ${total} 行`,
    pages: '分页',
    pageOf: (page: number, count: number) => `第 ${page} 页，共 ${count} 页`,
    previousPage: '上一页',
    nextPage: '下一页',
    filterSelected: (count: number) => `已选 ${count} 项`,
    clearFilter: '清除筛选',
  },
  'date-picker': {
    placeholder: '选择日期',
    rangePlaceholder: '选择日期范围',
  },
  'date-range-picker': {
    placeholder: '选择日期范围',
    apply: '应用',
    cancel: '取消',
    presets: '快捷选择',
    today: '今天',
    yesterday: '昨天',
    last7Days: '最近 7 天',
    last30Days: '最近 30 天',
    thisMonth: '本月',
    lastMonth: '上个月',
    thisYear: '今年',
  },
  dialog: {
    close: '关闭',
  },
  draggable: {
    draggable: '可拖动',
    panel: '面板',
    handle: '移动面板',
    ...drag,
  },
  drawer: {
    close: '关闭',
    resize: '调整面板大小',
    dragToClose: '拖动以关闭',
  },
  dropzone: {
    prompt: (multiple: boolean) =>
      multiple ? '将文件拖放到此处，或点击选择' : '将一个文件拖放到此处，或点击选择',
    maxSize: (size: string) => `每个不超过 ${size}`,
    maxFiles: (count: number) => `最多 ${count} 个文件`,
    anyFile: '任意文件',
    notAccepted: (name: string) => `${name} 的文件类型不受支持。`,
    tooLarge: (name: string, size: string) => `${name} 超过 ${size}。`,
    tooMany: (name: string, limit: number) =>
      limit === 1
        ? `未添加 ${name}：一次只能添加一个文件。`
        : `未添加 ${name}：一次最多添加 ${limit} 个文件。`,
    added: (count: number) => `已添加 ${count} 个文件。`,
    rejected: (count: number) => `已拒绝 ${count} 个文件：`,
    noFiles: '没有文件。',
  },
  'donut-chart': {
    total: '总计',
    summary: (slices: string[], caption: string, total: string) =>
      `环形图，${slices.join('，')}。${caption} ${total}。`,
  },
  'expandable-card': {
    close: '关闭',
  },
  gallery: {
    open: (index: number, alt?: string) => (alt ? `打开 ${alt}` : `打开第 ${index} 张图片`),
    image: (index: number, count: number) => `第 ${index} 张图片，共 ${count} 张`,
    help: '使用方向键切换图片，按 Esc 键关闭。',
    close: '关闭',
    previous: '上一张图片',
    next: '下一张图片',
    show: (index: number) => `显示第 ${index} 张图片`,
  },
  'hold-to-confirm': {
    hint: '长按以确认。',
    confirmed: '已确认',
  },
  'inline-edit': {
    placeholder: '空',
    saveError: '保存失败，请重试。',
    saving: '保存中…',
    saved: '已保存',
  },
  'json-viewer': {
    search: '搜索键和值',
    match: (current: number, total: number) => `${current} / ${total}`,
    noMatches: '无匹配项',
    expandAll: '全部展开',
    collapseAll: '全部折叠',
    tree: 'JSON',
    size: (count: number, type: 'array' | 'object') =>
      type === 'array' ? `${count} 项` : `${count} 个键`,
    array: '数组',
    object: '对象',
    showMore: (count: number) => `显示其余 ${count} 项`,
    left: (count: number) => `还剩 ${count} 项`,
    copyValue: (path: string) => `复制 ${path} 的值`,
    copyPath: (path: string) => `复制路径 ${path}`,
    copyValueHint: '复制值（c）',
    copyPathHint: '复制路径（p）',
    valueCopied: '已复制值',
    pathCopied: '已复制路径',
  },
  kanban: {
    card: '可排序项',
    ...drag,
  },
  kbd: {
    command: 'Command',
    control: 'Control',
    windows: 'Windows',
    option: 'Option',
    alt: 'Alt',
    shift: 'Shift',
    return: '回车',
    enter: '回车',
    delete: '删除',
    forwardDelete: '向前删除',
    backspace: '退格',
    escape: 'Esc',
    tab: 'Tab',
    space: '空格',
    capsLock: '大写锁定',
    upArrow: '上箭头',
    downArrow: '下箭头',
    leftArrow: '左箭头',
    rightArrow: '右箭头',
    pageUp: '向上翻页',
    pageDown: '向下翻页',
    home: 'Home',
    end: 'End',
    plus: '加',
  },
  'mention-input': {
    empty: '无匹配项',
    suggestions: '建议',
    count: (count: number, label?: string) => (label ? `${count} 个 ${label}` : `${count} 条建议`),
  },
  'metric-card': {
    loading: '加载中',
    up: '上升',
    down: '下降',
    noChange: '无变化',
  },
  'multi-select': {
    placeholder: '请选择…',
    search: '搜索…',
    empty: '没有结果。',
    selectAll: '全选',
    clear: '清除所选',
    remove: (label: string) => `移除 ${label}`,
    noneSelected: '未选择',
    selected: (count: number, labels: string) => `已选择 ${count} 项：${labels}`,
  },
  navbar: {
    menu: '菜单',
    openMenu: '打开菜单',
    siteNavigation: '网站导航',
    primary: '主导航',
    more: '更多',
    morePages: '更多页面',
  },
  'notification-center': {
    title: '通知',
    unread: (label: string, count: number) => `${label}，${count} 条未读`,
    markAsRead: '标为已读',
    unreadDot: '未读',
    allTab: '全部',
    unreadTab: '未读',
    markAllAsRead: '全部标为已读',
    caughtUp: '你已看完所有通知',
    caughtUpHint: '自上次查看以来没有新内容。',
    empty: '暂无通知',
    emptyHint: '新动态会显示在这里。',
  },
  'number-field': {
    decrement: '减少',
    increment: '增加',
  },
  pagination: {
    nav: '分页',
    previous: '上一页',
    next: '下一页',
    previousPage: '转到上一页',
    nextPage: '转到下一页',
    page: (page: number) => `第 ${page} 页`,
    morePages: '更多页',
    pageOf: (page: number, count: number) => `第 ${page} 页，共 ${count} 页`,
  },
  'password-field': {
    reveal: '显示密码',
    strength: '密码强度',
    empty: '空',
    weak: '弱',
    fair: '一般',
    good: '良好',
    strong: '强',
    avoidCommon: '避免使用常见的密码和单词。',
    useLength: '至少使用 12 个字符。',
    avoidSequences: '避免使用 abcd 或 1234 这类连续字符。',
    avoidRepeats: '避免重复同一个字符。',
    mixCharacters: '混合使用大写字母、数字或符号。',
    addLength: '再多几个字符就足够强了。',
    ruleLength: '至少 12 个字符',
    ruleCase: '包含小写和大写字母',
    ruleNumber: '包含数字',
    ruleSymbol: '包含符号',
  },
  'phone-input': {
    country: '国家/地区',
    search: '搜索国家/地区…',
    empty: '未找到国家/地区。',
  },
  'reorderable-grid': {
    tile: '网格项',
    ...drag,
  },
  'resizable-panels': {
    handle: '调整面板大小',
  },
  'rich-text-editor': {
    placeholder: '输入内容，或按“/”插入块…',
    editor: '编辑器',
    formatting: '格式',
    blocks: '块',
    linkPlaceholder: '粘贴或输入链接',
    linkAddress: '链接地址',
    applyLink: '应用链接',
    removeLink: '移除链接',
    bold: '粗体',
    italic: '斜体',
    underline: '下划线',
    strikethrough: '删除线',
    code: '代码',
    link: '链接',
    heading: '标题',
    bulletedList: '无序列表',
    numberedList: '有序列表',
    quote: '引用',
    text: '正文',
    heading1: '标题 1',
    heading2: '标题 2',
    heading3: '标题 3',
    divider: '分割线',
  },
  'search-field': {
    placeholder: '搜索…',
    clear: '清除搜索',
  },
  sidebar: {
    menu: '菜单',
    navigation: '导航',
    toggle: '展开或收起侧边栏',
  },
  'signature-pad': {
    pad: '签名',
    strokes: (count: number) => `${count} 笔`,
    empty: '空白',
    undo: '撤销',
    clear: '清除',
    replay: '回放',
    placeholder: '在此签名',
  },
  sortable: {
    item: '可排序项',
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
      `${count} 个值的趋势${first !== undefined && last !== undefined ? `，从 ${first} 到 ${last}` : ''}，最低 ${low}，最高 ${high}`,
    empty: '暂无数据',
  },
  spinner: {
    loading: '加载中',
  },
  'split-button': {
    more: '更多选项',
  },
  stepper: {
    complete: '已完成',
    current: '当前步骤',
    upcoming: '未开始',
    error: '有错误',
    stepOf: (step: number, count: number) => `第 ${step} 步，共 ${count} 步`,
  },
  'swipe-actions': {
    moreActions: (label: string) => `${label} 的更多操作`,
  },
  'tag-input': {
    remove: (tag: string) => `移除 ${tag}`,
    max: (max: number) => `最多 ${max} 个标签。`,
    duplicate: (tag: string) => `${tag} 已添加。`,
    added: (tags: string) => `已添加 ${tags}。`,
    removed: (tag: string) => `已移除 ${tag}。`,
  },
  terminal: {
    replay: '重新播放',
  },
  'theme-switch': {
    darkMode: '深色模式',
  },
  'time-picker': {
    hour: '小时',
    minute: '分钟',
    second: '秒',
    period: '上午/下午',
    list: '选择时间',
    empty: '空',
  },
  toast: {
    region: '通知',
    close: '关闭',
  },
  tour: {
    next: '下一步',
    back: '上一步',
    done: '完成',
    skip: '跳过引导',
    progress: (current: number, total: number) => `${current} / ${total}`,
  },
  'tree-view': {
    loadFailed: '加载失败，展开以重试',
  },
  'usage-meter': {
    warning: '即将用完',
    over: (overage: string) => `超出 ${overage}`,
    amount: (used: string, limit: string) => `${used} / ${limit}`,
    valueText: (used: string, limit: string) => `已使用 ${used}，共 ${limit}`,
    almostFull: '即将用完',
    overLimit: (overage: string) => `超出限额 ${overage}`,
    free: '可用',
  },
} satisfies LabelsPack
