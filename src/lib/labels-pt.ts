import type { LabelsPack } from '@/lib/labels'

/*
 * Every component in Brazilian Portuguese, for `<LabelsProvider labels={pt} locale="pt-BR">`.
 * Plain, everyday wording, the way well-localized apps read in Brazil; copy it and change any word
 * you like. Components you have not installed are simply never read.
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

/** Where the item is, with its preposition: "na posição 2 de 5" or "a 10, 20 pixels do início". */
const place = ({ to, from, count, delta }: DragContext) => {
  if (count <= 0) return `a ${Math.round(delta.x)}, ${Math.round(delta.y)} pixels do início`
  const at = `na posição ${to.index + 1} de ${count}`
  return to.containerId && to.containerId !== from.containerId ? `${at} em ${to.containerId}` : at
}

const drag = {
  start: (context: DragContext) =>
    context.count > 0
      ? `Você pegou ${context.id}, ${place(context)}. Use as setas para mover, Espaço ou Enter para soltar e Esc para cancelar.`
      : `Você pegou ${context.id}. Use as setas para mover, Espaço ou Enter para soltar e Esc para cancelar.`,
  move: (context: DragContext) => `${context.id} agora está ${place(context)}.`,
  drop: (context: DragContext) => `Você soltou ${context.id} ${place(context)}.`,
  cancel: (context: DragContext) =>
    `O arraste de ${context.id} foi cancelado. Está de novo ${place(context)}.`,
}

export const pt = {
  'activity-heatmap': {
    grid: (from: string, to: string) => `Atividade de ${from} a ${to}`,
    day: (value: string, date: string) => `${date}: ${value}`,
    none: 'nada',
    less: 'Menos',
    more: 'Mais',
  },
  'alert-dialog': {
    confirm: 'Continuar',
    cancel: 'Cancelar',
  },
  'announcement-bar': {
    region: 'Anúncios',
    previous: 'Mensagem anterior',
    next: 'Próxima mensagem',
    play: 'Retomar as mensagens',
    pause: 'Pausar as mensagens',
    dismiss: 'Fechar',
    position: (current: number, count: number) => `${current} de ${count}:`,
    endsIn: (days: number, hours: number, minutes: number) =>
      `Termina em ${[days > 0 && plural(days, 'dia', 'dias'), hours > 0 && plural(hours, 'hora', 'horas'), plural(minutes, 'minuto', 'minutos')].filter(Boolean).join(' ')}`,
    days: (days: number) => `${days} d`,
  },
  'avatar-group': {
    group: (names: string[], more: number) =>
      more > 0
        ? `${names.join(', ')} e mais ${more}`
        : names.length > 1
          ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
          : (names[0] ?? 'Ninguém'),
    showMore: (count: number) => `Mostrar mais ${count}`,
    overflow: 'Mais pessoas',
    andMore: (count: number) => `e mais ${count}`,
  },
  'billing-toggle': {
    group: 'Período de cobrança',
    monthly: 'Mensal',
    yearly: 'Anual',
    save: (percent: string) => `Economize ${percent}`,
  },
  breadcrumb: {
    nav: 'Trilha de navegação',
    more: 'Mais',
    showMore: (count: number) => `Mostrar mais ${count}`,
  },
  calendar: {
    previousMonth: 'Mês anterior',
    nextMonth: 'Próximo mês',
  },
  'card-stack': {
    region: 'Cartões',
    carousel: 'carrossel',
    slide: 'slide',
    position: (index: number, count: number) => `${index} de ${count}`,
  },
  carousel: {
    carousel: 'carrossel',
    items: (label?: string) => (label ? `Itens de ${label}` : 'Itens do carrossel'),
    previous: 'Anterior',
    next: 'Próximo',
    goTo: (index: number, count: number) => `Ir para o item ${index} de ${count}`,
  },
  chart: {
    empty: 'Sem dados',
    summary: (series: string[], points: number, from?: string, to?: string) =>
      `${series.join(', ')}, ${plural(points, 'ponto', 'pontos')}${points ? `, de ${from} a ${to}` : ''}`,
    barChart: (summary: string) => `Gráfico de barras de ${summary}`,
    lineChart: (summary: string) => `Gráfico de linhas de ${summary}`,
  },
  'chat-thread': {
    messages: 'Mensagens',
    jumpToLatest: 'Ir para a mais recente',
    newMessages: 'Novas mensagens',
    you: 'Você',
    reactions: 'Reações',
    addReaction: 'Adicionar reação',
    reactWith: (emoji: string) => `Reagir com ${emoji}`,
    seenBy: (names: string) => `Visto por ${names}`,
    typing: (names: string, count: number) =>
      count > 2
        ? `${count} pessoas estão digitando`
        : `${names} ${count === 1 ? 'está' : 'estão'} digitando`,
    message: 'Mensagem',
    attach: 'Anexar arquivos',
    attachments: 'Anexos',
    remove: (name: string) => `Remover ${name}`,
    send: 'Enviar',
    sending: 'Enviando…',
    notSent: 'Não enviada',
  },
  'code-block': {
    wrap: 'Quebrar linhas',
    copy: 'Copiar código',
    copied: 'Copiado',
    code: (language?: string) => (language ? `Código ${language}` : 'Código'),
    showLess: 'Mostrar menos',
    showAll: (lines: number) => `Mostrar todas as ${lines} linhas`,
  },
  'color-picker': {
    area: 'Saturação e brilho',
    areaRole: 'controle deslizante 2D',
    areaValue: (saturation: number, brightness: number) =>
      `Saturação ${saturation}%, brilho ${brightness}%`,
    hue: 'Matiz',
    alpha: 'Opacidade',
    format: 'Formato da cor',
    input: 'Valor da cor',
    eyeDropper: 'Capturar uma cor da tela',
    swatches: 'Cores salvas',
    addSwatch: 'Salvar esta cor',
    contrast: 'Contraste',
    passes: 'Atende',
    fails: 'Não atende',
  },
  combobox: {
    placeholder: 'Selecionar…',
    search: 'Pesquisar…',
    empty: 'Nenhum resultado.',
  },
  command: {
    title: 'Menu de comandos',
    description: 'Pesquisar um comando ou uma página',
  },
  'comment-thread': {
    title: 'Comentários',
    placeholder: 'Adicionar um comentário',
    comment: 'Comentar',
    cancel: 'Cancelar',
    addReaction: 'Adicionar reação',
    reactWith: (emoji: string) => `Reagir com ${emoji}`,
    you: 'Você',
    commentBy: (name?: string) => `Comentário de ${name ?? 'alguém desconhecido'}`,
    unknown: 'Desconhecido',
    edited: '(editado)',
    moreActions: 'Mais ações',
    edit: 'Editar',
    delete: 'Excluir',
    editPlaceholder: 'Editar comentário',
    save: 'Salvar',
    reply: 'Responder',
    replyPlaceholder: 'Escrever uma resposta',
    showReplies: (count: number) => `Mostrar ${plural(count, 'resposta', 'respostas')}`,
    hideReplies: (count: number) => `Ocultar ${count === 1 ? 'resposta' : 'respostas'}`,
    repliesTo: (name?: string) => `Respostas a ${name ?? 'um comentário'}`,
    resolved: 'Resolvido',
    resolve: 'Resolver',
    reopen: 'Reabrir',
    empty: 'Ainda não há comentários.',
    resolvedNotice: 'Esta conversa foi resolvida.',
    reopenToReply: 'Reabra para responder.',
    deleteTitle: 'Excluir este comentário?',
    deleteDescription: 'Esta ação não pode ser desfeita.',
    deleteWithReplies: 'As respostas também serão excluídas. Esta ação não pode ser desfeita.',
  },
  compare: {
    slider: 'Comparar',
  },
  'confirm-morph': {
    question: 'Tem certeza?',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    pending: 'Processando…',
    success: 'Pronto',
    error: 'Algo deu errado',
    undo: 'Desfazer',
  },
  'copy-button': {
    copy: 'Copiar',
    copied: 'Copiado',
    failed: 'Não foi possível copiar',
  },
  'data-table': {
    search: 'Pesquisar…',
    reset: 'Redefinir',
    resetFilters: 'Redefinir filtros',
    empty: 'Nenhum resultado.',
    selectAll: 'Selecionar todas as linhas',
    selectRow: (name?: string) => `Selecionar ${name || 'linha'}`,
    sortHint: 'Clique para ordenar; Shift + clique para ordenar por várias colunas',
    results: (count: number, total?: number) =>
      `${plural(count, 'resultado', 'resultados')}${total === undefined ? '' : ` de ${total}`}`,
    selected: (count: number, total: number) =>
      `${count} de ${total} ${count === 1 ? 'selecionada' : 'selecionadas'}`,
    pages: 'Páginas',
    pageOf: (page: number, count: number) => `Página ${page} de ${count}`,
    previousPage: 'Página anterior',
    nextPage: 'Próxima página',
    filterSelected: (count: number) => `${count} ${count === 1 ? 'selecionado' : 'selecionados'}`,
    clearFilter: 'Limpar filtro',
  },
  'date-picker': {
    placeholder: 'Escolher uma data',
    rangePlaceholder: 'Escolher um período',
  },
  'date-range-picker': {
    placeholder: 'Escolher um período',
    apply: 'Aplicar',
    cancel: 'Cancelar',
    presets: 'Períodos rápidos',
    today: 'Hoje',
    yesterday: 'Ontem',
    last7Days: 'Últimos 7 dias',
    last30Days: 'Últimos 30 dias',
    thisMonth: 'Este mês',
    lastMonth: 'Mês passado',
    thisYear: 'Este ano',
  },
  dialog: {
    close: 'Fechar',
  },
  draggable: {
    draggable: 'arrastável',
    panel: 'painel',
    handle: 'Mover painel',
    ...drag,
  },
  drawer: {
    close: 'Fechar',
    resize: 'Redimensionar painel',
    dragToClose: 'Arraste para fechar',
  },
  dropzone: {
    prompt: (multiple: boolean) =>
      multiple
        ? 'Solte arquivos aqui ou pressione para escolher'
        : 'Solte um arquivo aqui ou pressione para escolher',
    maxSize: (size: string) => `até ${size} cada`,
    maxFiles: (count: number) => `no máximo ${count} arquivos`,
    anyFile: 'Qualquer arquivo',
    notAccepted: (name: string) => `${name} não é de um tipo aceito.`,
    tooLarge: (name: string, size: string) => `${name} é maior que ${size}.`,
    tooMany: (name: string, limit: number) =>
      limit === 1
        ? `${name} não foi adicionado: apenas um arquivo por vez.`
        : `${name} não foi adicionado: no máximo ${limit} arquivos por vez.`,
    added: (count: number) => `${plural(count, 'arquivo adicionado', 'arquivos adicionados')}.`,
    rejected: (count: number) => `${plural(count, 'arquivo recusado', 'arquivos recusados')}:`,
    noFiles: 'Nenhum arquivo.',
  },
  'donut-chart': {
    total: 'Total',
    summary: (slices: string[], caption: string, total: string) =>
      `Gráfico de rosca, ${slices.join(', ')}. ${caption} ${total}.`,
  },
  'expandable-card': {
    close: 'Fechar',
  },
  gallery: {
    open: (index: number, alt?: string) => (alt ? `Abrir ${alt}` : `Abrir imagem ${index}`),
    image: (index: number, count: number) => `Imagem ${index} de ${count}`,
    help: 'Use as setas para passar de uma imagem para outra e Esc para fechar.',
    close: 'Fechar',
    previous: 'Imagem anterior',
    next: 'Próxima imagem',
    show: (index: number) => `Mostrar imagem ${index}`,
  },
  'hold-to-confirm': {
    hint: 'Mantenha pressionado para confirmar.',
    confirmed: 'Confirmado',
  },
  'inline-edit': {
    placeholder: 'Vazio',
    saveError: 'Não foi possível salvar. Tente novamente.',
    saving: 'Salvando…',
    saved: 'Salvo',
  },
  'json-viewer': {
    search: 'Pesquisar chaves e valores',
    match: (current: number, total: number) => `${current} de ${total}`,
    noMatches: 'Nenhuma correspondência',
    expandAll: 'Expandir tudo',
    collapseAll: 'Recolher tudo',
    tree: 'JSON',
    size: (count: number, type: 'array' | 'object') =>
      type === 'array' ? plural(count, 'item', 'itens') : plural(count, 'chave', 'chaves'),
    array: 'array',
    object: 'objeto',
    showMore: (count: number) => `Mostrar mais ${count}`,
    left: (count: number) => (count === 1 ? 'resta 1' : `restam ${count}`),
    copyValue: (path: string) => `Copiar valor de ${path}`,
    copyPath: (path: string) => `Copiar caminho ${path}`,
    copyValueHint: 'Copiar valor (c)',
    copyPathHint: 'Copiar caminho (p)',
    valueCopied: 'Valor copiado',
    pathCopied: 'Caminho copiado',
  },
  kanban: {
    card: 'item ordenável',
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
    forwardDelete: 'Delete para frente',
    backspace: 'Backspace',
    escape: 'Esc',
    tab: 'Tab',
    space: 'Espaço',
    capsLock: 'Caps Lock',
    upArrow: 'Seta para cima',
    downArrow: 'Seta para baixo',
    leftArrow: 'Seta para a esquerda',
    rightArrow: 'Seta para a direita',
    pageUp: 'Page Up',
    pageDown: 'Page Down',
    home: 'Home',
    end: 'End',
    plus: 'Mais',
  },
  'mention-input': {
    empty: 'Nenhuma correspondência',
    suggestions: 'Sugestões',
    count: (count: number, label?: string) => `${count} ${label ?? 'sugestões'}`,
  },
  'metric-card': {
    loading: 'Carregando',
    up: 'Em alta',
    down: 'Em queda',
    noChange: 'Sem alteração',
  },
  'multi-select': {
    placeholder: 'Selecionar…',
    search: 'Pesquisar…',
    empty: 'Nenhum resultado.',
    selectAll: 'Selecionar tudo',
    clear: 'Limpar seleção',
    remove: (label: string) => `Remover ${label}`,
    noneSelected: 'Nada selecionado',
    selected: (count: number, labels: string) =>
      `${count} ${count === 1 ? 'selecionado' : 'selecionados'}: ${labels}`,
  },
  navbar: {
    menu: 'Menu',
    openMenu: 'Abrir menu',
    siteNavigation: 'Navegação do site',
    primary: 'Principal',
    more: 'Mais',
    morePages: 'Mais páginas',
  },
  'notification-center': {
    title: 'Notificações',
    unread: (label: string, count: number) =>
      `${label}, ${count} não ${count === 1 ? 'lida' : 'lidas'}`,
    markAsRead: 'Marcar como lida',
    unreadDot: 'Não lida',
    allTab: 'Todas',
    unreadTab: 'Não lidas',
    markAllAsRead: 'Marcar todas como lidas',
    caughtUp: 'Tudo em dia',
    caughtUpHint: 'Nada de novo desde a última vez.',
    empty: 'Nenhuma notificação',
    emptyHint: 'As novas atividades vão aparecer aqui.',
  },
  'number-field': {
    decrement: 'Diminuir',
    increment: 'Aumentar',
  },
  pagination: {
    nav: 'Paginação',
    previous: 'Anterior',
    next: 'Próxima',
    previousPage: 'Ir para a página anterior',
    nextPage: 'Ir para a próxima página',
    page: (page: number) => `Página ${page}`,
    morePages: 'Mais páginas',
    pageOf: (page: number, count: number) => `Página ${page} de ${count}`,
  },
  'password-field': {
    reveal: 'Mostrar senha',
    strength: 'Força da senha',
    empty: 'Vazia',
    weak: 'Fraca',
    fair: 'Razoável',
    good: 'Boa',
    strong: 'Forte',
    avoidCommon: 'Evite senhas e palavras comuns.',
    useLength: 'Use pelo menos 12 caracteres.',
    avoidSequences: 'Evite sequências como abcd ou 1234.',
    avoidRepeats: 'Evite repetir o mesmo caractere.',
    mixCharacters: 'Combine letras maiúsculas, números ou símbolos.',
    addLength: 'Com mais alguns caracteres, ela fica forte.',
    ruleLength: 'Pelo menos 12 caracteres',
    ruleCase: 'Uma letra minúscula e uma maiúscula',
    ruleNumber: 'Um número',
    ruleSymbol: 'Um símbolo',
  },
  'phone-input': {
    country: 'País',
    search: 'Pesquisar países…',
    empty: 'Nenhum país encontrado.',
  },
  'reorderable-grid': {
    tile: 'item da grade',
    ...drag,
  },
  'resizable-panels': {
    handle: 'Redimensionar painéis',
  },
  'rich-text-editor': {
    placeholder: "Digite algo ou pressione '/' para ver os blocos…",
    editor: 'Editor',
    formatting: 'Formatação',
    blocks: 'Blocos',
    linkPlaceholder: 'Cole ou digite um link',
    linkAddress: 'Endereço do link',
    applyLink: 'Aplicar link',
    removeLink: 'Remover link',
    bold: 'Negrito',
    italic: 'Itálico',
    underline: 'Sublinhado',
    strikethrough: 'Tachado',
    code: 'Código',
    link: 'Link',
    heading: 'Título',
    bulletedList: 'Lista com marcadores',
    numberedList: 'Lista numerada',
    quote: 'Citação',
    text: 'Texto',
    heading1: 'Título 1',
    heading2: 'Título 2',
    heading3: 'Título 3',
    divider: 'Divisor',
  },
  'search-field': {
    placeholder: 'Pesquisar…',
    clear: 'Limpar pesquisa',
  },
  sidebar: {
    menu: 'Menu',
    navigation: 'Navegação',
    toggle: 'Mostrar ou ocultar a barra lateral',
  },
  'signature-pad': {
    pad: 'Assinatura',
    strokes: (count: number) => plural(count, 'traço', 'traços'),
    empty: 'vazia',
    undo: 'Desfazer',
    clear: 'Limpar',
    replay: 'Reproduzir',
    placeholder: 'Assine aqui',
  },
  sortable: {
    item: 'item ordenável',
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
      `Tendência de ${plural(count, 'valor', 'valores')}${first !== undefined && last !== undefined ? `, de ${first} a ${last}` : ''}, mínimo ${low}, máximo ${high}`,
    empty: 'Sem dados',
  },
  spinner: {
    loading: 'Carregando',
  },
  'split-button': {
    more: 'Mais opções',
  },
  stepper: {
    complete: 'concluído',
    current: 'passo atual',
    upcoming: 'não iniciado',
    error: 'tem um erro',
    stepOf: (step: number, count: number) => `Passo ${step} de ${count}`,
  },
  'swipe-actions': {
    moreActions: (label: string) => `Mais ações para ${label}`,
  },
  'tag-input': {
    remove: (tag: string) => `Remover ${tag}`,
    max: (max: number) => `Até ${plural(max, 'tag', 'tags')}.`,
    duplicate: (tag: string) => `${tag} já foi adicionada.`,
    added: (tags: string) => `Adicionadas: ${tags}.`,
    removed: (tag: string) => `${tag} removida.`,
  },
  terminal: {
    replay: 'Reproduzir novamente',
  },
  'theme-switch': {
    darkMode: 'Modo escuro',
  },
  'time-picker': {
    hour: 'Horas',
    minute: 'Minutos',
    second: 'Segundos',
    period: 'AM/PM',
    list: 'Escolher um horário',
    empty: 'Vazio',
  },
  toast: {
    region: 'Notificações',
    close: 'Fechar',
  },
  tour: {
    next: 'Próximo',
    back: 'Voltar',
    done: 'Concluir',
    skip: 'Pular tour',
    progress: (current: number, total: number) => `${current} de ${total}`,
  },
  'tree-view': {
    loadFailed: 'não foi possível carregar, abra para tentar novamente',
  },
  'usage-meter': {
    warning: 'Quase cheio',
    over: (overage: string) => `Excedido em ${overage}`,
    amount: (used: string, limit: string) => `${used} de ${limit}`,
    valueText: (used: string, limit: string) => `${used} de ${limit} usados`,
    almostFull: 'quase cheio',
    overLimit: (overage: string) => `acima do limite em ${overage}`,
    free: 'Livre',
  },
} satisfies LabelsPack
