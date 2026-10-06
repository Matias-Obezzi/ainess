import type { LabelsPack } from '@/lib/labels'

/*
 * Every component in Spanish, for `<LabelsProvider labels={es} locale="es">`. Neutral Spanish,
 * so it reads well from Buenos Aires to Madrid; copy it and change any word you like. Components
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
  if (count <= 0) return `${Math.round(delta.x)}, ${Math.round(delta.y)} píxeles del inicio`
  const at = `la posición ${to.index + 1} de ${count}`
  return to.containerId && to.containerId !== from.containerId ? `${at} en ${to.containerId}` : at
}

const drag = {
  start: (context: DragContext) =>
    context.count > 0
      ? `Se tomó ${context.id}, en ${place(context)}. Usa las flechas para moverlo, Espacio o Intro para soltarlo y Escape para cancelar.`
      : `Se tomó ${context.id}. Usa las flechas para moverlo, Espacio o Intro para soltarlo y Escape para cancelar.`,
  move: (context: DragContext) => `${context.id} pasó a ${place(context)}.`,
  drop: (context: DragContext) => `${context.id} se soltó en ${place(context)}.`,
  cancel: (context: DragContext) =>
    `Se canceló el arrastre de ${context.id}, de vuelta en ${place(context)}.`,
}

export const es = {
  'activity-heatmap': {
    grid: (from: string, to: string) => `Actividad del ${from} al ${to}`,
    day: (value: string, date: string) => `${date}: ${value}`,
    none: 'nada',
    less: 'Menos',
    more: 'Más',
  },
  'alert-dialog': {
    confirm: 'Continuar',
    cancel: 'Cancelar',
  },
  'announcement-bar': {
    region: 'Anuncios',
    previous: 'Mensaje anterior',
    next: 'Mensaje siguiente',
    play: 'Reanudar los mensajes',
    pause: 'Pausar los mensajes',
    dismiss: 'Cerrar',
    position: (current: number, count: number) => `${current} de ${count}:`,
    endsIn: (days: number, hours: number, minutes: number) =>
      `Termina en ${[days > 0 && plural(days, 'día', 'días'), hours > 0 && plural(hours, 'hora', 'horas'), plural(minutes, 'minuto', 'minutos')].filter(Boolean).join(' ')}`,
    days: (days: number) => `${days} d`,
  },
  'avatar-group': {
    group: (names: string[], more: number) =>
      more > 0
        ? `${names.join(', ')} y ${more} más`
        : names.length > 1
          ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
          : (names[0] ?? 'Nadie'),
    showMore: (count: number) => `Mostrar ${count} más`,
    overflow: 'Más personas',
    andMore: (count: number) => `y ${count} más`,
  },
  'billing-toggle': {
    group: 'Período de facturación',
    monthly: 'Mensual',
    yearly: 'Anual',
    save: (percent: string) => `Ahorro ${percent}`,
  },
  breadcrumb: {
    nav: 'Ruta de navegación',
    more: 'Más',
    showMore: (count: number) => `Mostrar ${count} más`,
  },
  calendar: {
    previousMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente',
  },
  'card-stack': {
    region: 'Tarjetas',
    carousel: 'carrusel',
    slide: 'diapositiva',
    position: (index: number, count: number) => `${index} de ${count}`,
  },
  carousel: {
    carousel: 'carrusel',
    items: (label?: string) => (label ? `Elementos de ${label}` : 'Elementos del carrusel'),
    previous: 'Anterior',
    next: 'Siguiente',
    goTo: (index: number, count: number) => `Ir al elemento ${index} de ${count}`,
  },
  chart: {
    empty: 'Sin datos',
    summary: (series: string[], points: number, from?: string, to?: string) =>
      `${series.join(', ')}, ${plural(points, 'punto', 'puntos')}${points ? `, de ${from} a ${to}` : ''}`,
    barChart: (summary: string) => `Gráfico de barras de ${summary}`,
    lineChart: (summary: string) => `Gráfico de líneas de ${summary}`,
  },
  'chat-thread': {
    messages: 'Mensajes',
    jumpToLatest: 'Ir al último',
    newMessages: 'Mensajes nuevos',
    you: 'Tú',
    reactions: 'Reacciones',
    addReaction: 'Agregar una reacción',
    reactWith: (emoji: string) => `Reaccionar con ${emoji}`,
    seenBy: (names: string) => `Visto por ${names}`,
    typing: (names: string, count: number) =>
      count > 2
        ? `${count} personas están escribiendo`
        : `${names} ${count === 1 ? 'está' : 'están'} escribiendo`,
    message: 'Mensaje',
    attach: 'Adjuntar archivos',
    attachments: 'Adjuntos',
    remove: (name: string) => `Quitar ${name}`,
    send: 'Enviar',
    sending: 'Enviando…',
    notSent: 'No se envió',
  },
  'code-block': {
    wrap: 'Ajustar las líneas',
    copy: 'Copiar el código',
    copied: 'Copiado',
    code: (language?: string) => (language ? `Código ${language}` : 'Código'),
    showLess: 'Mostrar menos',
    showAll: (lines: number) => `Mostrar las ${lines} líneas`,
  },
  'color-picker': {
    area: 'Saturación y brillo',
    areaRole: 'control deslizante 2D',
    areaValue: (saturation: number, brightness: number) =>
      `Saturación ${saturation} %, brillo ${brightness} %`,
    hue: 'Tono',
    alpha: 'Opacidad',
    format: 'Formato de color',
    input: 'Valor del color',
    eyeDropper: 'Tomar un color de la pantalla',
    swatches: 'Colores guardados',
    addSwatch: 'Guardar este color',
    contrast: 'Contraste',
    passes: 'Cumple',
    fails: 'No cumple',
  },
  combobox: {
    placeholder: 'Seleccionar…',
    search: 'Buscar…',
    empty: 'Sin resultados.',
  },
  command: {
    title: 'Menú de comandos',
    description: 'Buscar un comando o una página',
  },
  'comment-thread': {
    title: 'Comentarios',
    placeholder: 'Agregar un comentario',
    comment: 'Comentar',
    cancel: 'Cancelar',
    addReaction: 'Agregar una reacción',
    reactWith: (emoji: string) => `Reaccionar con ${emoji}`,
    you: 'Tú',
    commentBy: (name?: string) => `Comentario de ${name ?? 'alguien desconocido'}`,
    unknown: 'Desconocido',
    edited: '(editado)',
    moreActions: 'Más acciones',
    edit: 'Editar',
    delete: 'Eliminar',
    editPlaceholder: 'Editar el comentario',
    save: 'Guardar',
    reply: 'Responder',
    replyPlaceholder: 'Escribir una respuesta',
    showReplies: (count: number) => `Mostrar ${plural(count, 'respuesta', 'respuestas')}`,
    hideReplies: (count: number) => `Ocultar ${count === 1 ? 'la respuesta' : 'las respuestas'}`,
    repliesTo: (name?: string) => `Respuestas a ${name ?? 'un comentario'}`,
    resolved: 'Resuelto',
    resolve: 'Resolver',
    reopen: 'Reabrir',
    empty: 'Todavía no hay comentarios.',
    resolvedNotice: 'Este hilo está resuelto.',
    reopenToReply: 'Reábrelo para responder.',
    deleteTitle: '¿Eliminar este comentario?',
    deleteDescription: 'No se puede deshacer.',
    deleteWithReplies: 'Sus respuestas también se eliminan. No se puede deshacer.',
  },
  compare: {
    slider: 'Comparar',
  },
  'confirm-morph': {
    question: '¿Seguro?',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    pending: 'Procesando…',
    success: 'Listo',
    error: 'Algo salió mal',
    undo: 'Deshacer',
  },
  'copy-button': {
    copy: 'Copiar',
    copied: 'Copiado',
    failed: 'No se pudo copiar',
  },
  'data-table': {
    search: 'Buscar…',
    reset: 'Restablecer',
    resetFilters: 'Restablecer los filtros',
    empty: 'Sin resultados.',
    selectAll: 'Seleccionar todas las filas',
    selectRow: (name?: string) => `Seleccionar ${name || 'la fila'}`,
    sortHint: 'Clic para ordenar, Mayús y clic para ordenar por varias columnas',
    results: (count: number, total?: number) =>
      `${plural(count, 'resultado', 'resultados')}${total === undefined ? '' : ` de ${total}`}`,
    selected: (count: number, total: number) =>
      `${count} de ${total} ${count === 1 ? 'seleccionada' : 'seleccionadas'}`,
    pages: 'Páginas',
    pageOf: (page: number, count: number) => `Página ${page} de ${count}`,
    previousPage: 'Página anterior',
    nextPage: 'Página siguiente',
    filterSelected: (count: number) => `${count} seleccionados`,
    clearFilter: 'Quitar el filtro',
  },
  'date-picker': {
    placeholder: 'Elegir una fecha',
    rangePlaceholder: 'Elegir un rango',
  },
  'date-range-picker': {
    placeholder: 'Elegir un rango',
    apply: 'Aplicar',
    cancel: 'Cancelar',
    presets: 'Rangos rápidos',
    today: 'Hoy',
    yesterday: 'Ayer',
    last7Days: 'Últimos 7 días',
    last30Days: 'Últimos 30 días',
    thisMonth: 'Este mes',
    lastMonth: 'Mes pasado',
    thisYear: 'Este año',
  },
  dialog: {
    close: 'Cerrar',
  },
  draggable: {
    draggable: 'arrastrable',
    panel: 'panel',
    handle: 'Mover el panel',
    ...drag,
  },
  drawer: {
    close: 'Cerrar',
    resize: 'Cambiar el tamaño del panel',
    dragToClose: 'Arrastrar para cerrar',
  },
  dropzone: {
    prompt: (multiple: boolean) =>
      multiple
        ? 'Suelta archivos aquí o presiona para elegirlos'
        : 'Suelta un archivo aquí o presiona para elegirlo',
    maxSize: (size: string) => `hasta ${size} cada uno`,
    maxFiles: (count: number) => `como máximo ${count} archivos`,
    anyFile: 'Cualquier archivo',
    notAccepted: (name: string) => `${name} no es de un tipo aceptado.`,
    tooLarge: (name: string, size: string) => `${name} pesa más de ${size}.`,
    tooMany: (name: string, limit: number) =>
      limit === 1
        ? `${name} no se tomó: solo un archivo a la vez.`
        : `${name} no se tomó: como máximo ${limit} archivos a la vez.`,
    added: (count: number) => `${plural(count, 'archivo agregado', 'archivos agregados')}.`,
    rejected: (count: number) => `${plural(count, 'archivo rechazado', 'archivos rechazados')}:`,
    noFiles: 'Ningún archivo.',
  },
  'donut-chart': {
    total: 'Total',
    summary: (slices: string[], caption: string, total: string) =>
      `Gráfico de anillo, ${slices.join(', ')}. ${caption} ${total}.`,
  },
  'expandable-card': {
    close: 'Cerrar',
  },
  gallery: {
    open: (index: number, alt?: string) => (alt ? `Abrir ${alt}` : `Abrir la imagen ${index}`),
    image: (index: number, count: number) => `Imagen ${index} de ${count}`,
    help: 'Usa las flechas para pasar de una imagen a otra y Escape para cerrar.',
    close: 'Cerrar',
    previous: 'Imagen anterior',
    next: 'Imagen siguiente',
    show: (index: number) => `Mostrar la imagen ${index}`,
  },
  'hold-to-confirm': {
    hint: 'Mantén presionado para confirmar.',
    confirmed: 'Confirmado',
  },
  'inline-edit': {
    placeholder: 'Vacío',
    saveError: 'No se pudo guardar. Inténtalo de nuevo.',
    saving: 'Guardando…',
    saved: 'Guardado',
  },
  'json-viewer': {
    search: 'Buscar claves y valores',
    match: (current: number, total: number) => `${current} de ${total}`,
    noMatches: 'Sin coincidencias',
    expandAll: 'Expandir todo',
    collapseAll: 'Contraer todo',
    tree: 'JSON',
    size: (count: number, type: 'array' | 'object') =>
      type === 'array' ? plural(count, 'elemento', 'elementos') : plural(count, 'clave', 'claves'),
    array: 'arreglo',
    object: 'objeto',
    showMore: (count: number) => `Mostrar ${count} más`,
    left: (count: number) => (count === 1 ? 'queda 1' : `quedan ${count}`),
    copyValue: (path: string) => `Copiar el valor de ${path}`,
    copyPath: (path: string) => `Copiar la ruta ${path}`,
    copyValueHint: 'Copiar el valor (c)',
    copyPathHint: 'Copiar la ruta (p)',
    valueCopied: 'Valor copiado',
    pathCopied: 'Ruta copiada',
  },
  kanban: {
    card: 'elemento ordenable',
    ...drag,
  },
  kbd: {
    command: 'Comando',
    control: 'Control',
    windows: 'Windows',
    option: 'Opción',
    alt: 'Alt',
    shift: 'Mayúsculas',
    return: 'Retorno',
    enter: 'Intro',
    delete: 'Borrar',
    forwardDelete: 'Suprimir',
    backspace: 'Retroceso',
    escape: 'Escape',
    tab: 'Tabulador',
    space: 'Espacio',
    capsLock: 'Bloq Mayús',
    upArrow: 'Flecha arriba',
    downArrow: 'Flecha abajo',
    leftArrow: 'Flecha izquierda',
    rightArrow: 'Flecha derecha',
    pageUp: 'Retroceder página',
    pageDown: 'Avanzar página',
    home: 'Inicio',
    end: 'Fin',
    plus: 'Más',
  },
  'mention-input': {
    empty: 'Sin coincidencias',
    suggestions: 'Sugerencias',
    count: (count: number, label?: string) => `${count} ${label ?? 'sugerencias'}`,
  },
  'metric-card': {
    loading: 'Cargando',
    up: 'Sube',
    down: 'Baja',
    noChange: 'Sin cambios',
  },
  'multi-select': {
    placeholder: 'Seleccionar…',
    search: 'Buscar…',
    empty: 'Sin resultados.',
    selectAll: 'Seleccionar todo',
    clear: 'Borrar la selección',
    remove: (label: string) => `Quitar ${label}`,
    noneSelected: 'Nada seleccionado',
    selected: (count: number, labels: string) =>
      `${count} ${count === 1 ? 'seleccionado' : 'seleccionados'}: ${labels}`,
  },
  navbar: {
    menu: 'Menú',
    openMenu: 'Abrir el menú',
    siteNavigation: 'Navegación del sitio',
    primary: 'Principal',
    more: 'Más',
    morePages: 'Más páginas',
  },
  'notification-center': {
    title: 'Notificaciones',
    unread: (label: string, count: number) => `${label}, ${count} sin leer`,
    markAsRead: 'Marcar como leída',
    unreadDot: 'Sin leer',
    allTab: 'Todas',
    unreadTab: 'Sin leer',
    markAllAsRead: 'Marcar todas como leídas',
    caughtUp: 'Estás al día',
    caughtUpHint: 'No hay nada nuevo desde la última vez.',
    empty: 'No hay notificaciones',
    emptyHint: 'La actividad nueva va a aparecer aquí.',
  },
  'number-field': {
    decrement: 'Disminuir',
    increment: 'Aumentar',
  },
  pagination: {
    nav: 'Paginación',
    previous: 'Anterior',
    next: 'Siguiente',
    previousPage: 'Ir a la página anterior',
    nextPage: 'Ir a la página siguiente',
    page: (page: number) => `Página ${page}`,
    morePages: 'Más páginas',
    pageOf: (page: number, count: number) => `Página ${page} de ${count}`,
  },
  'password-field': {
    reveal: 'Mostrar la contraseña',
    strength: 'Seguridad de la contraseña',
    empty: 'Vacía',
    weak: 'Débil',
    fair: 'Aceptable',
    good: 'Buena',
    strong: 'Fuerte',
    avoidCommon: 'Evita las contraseñas y palabras comunes.',
    useLength: 'Usa al menos 12 caracteres.',
    avoidSequences: 'Evita secuencias como abcd o 1234.',
    avoidRepeats: 'Evita repetir el mismo carácter.',
    mixCharacters: 'Combina mayúsculas, números o símbolos.',
    addLength: 'Con unos caracteres más sería fuerte.',
    ruleLength: 'Al menos 12 caracteres',
    ruleCase: 'Una minúscula y una mayúscula',
    ruleNumber: 'Un número',
    ruleSymbol: 'Un símbolo',
  },
  'phone-input': {
    country: 'País',
    search: 'Buscar países…',
    empty: 'No se encontró ningún país.',
  },
  'reorderable-grid': {
    tile: 'elemento de la cuadrícula',
    ...drag,
  },
  'resizable-panels': {
    handle: 'Cambiar el tamaño de los paneles',
  },
  'rich-text-editor': {
    placeholder: "Escribe algo, o presiona '/' para ver los bloques…",
    editor: 'Editor',
    formatting: 'Formato',
    blocks: 'Bloques',
    linkPlaceholder: 'Pega o escribe un enlace',
    linkAddress: 'Dirección del enlace',
    applyLink: 'Aplicar el enlace',
    removeLink: 'Quitar el enlace',
    bold: 'Negrita',
    italic: 'Cursiva',
    underline: 'Subrayado',
    strikethrough: 'Tachado',
    code: 'Código',
    link: 'Enlace',
    heading: 'Título',
    bulletedList: 'Lista con viñetas',
    numberedList: 'Lista numerada',
    quote: 'Cita',
    text: 'Texto',
    heading1: 'Título 1',
    heading2: 'Título 2',
    heading3: 'Título 3',
    divider: 'Separador',
  },
  'search-field': {
    placeholder: 'Buscar…',
    clear: 'Borrar la búsqueda',
  },
  sidebar: {
    menu: 'Menú',
    navigation: 'Navegación',
    toggle: 'Mostrar u ocultar la barra lateral',
  },
  'signature-pad': {
    pad: 'Firma',
    strokes: (count: number) => plural(count, 'trazo', 'trazos'),
    empty: 'vacía',
    undo: 'Deshacer',
    clear: 'Borrar',
    replay: 'Reproducir',
    placeholder: 'Firma aquí',
  },
  sortable: {
    item: 'elemento ordenable',
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
      `Tendencia de ${count} valores${first !== undefined && last !== undefined ? `, de ${first} a ${last}` : ''}, mínimo ${low}, máximo ${high}`,
    empty: 'Sin datos',
  },
  spinner: {
    loading: 'Cargando',
  },
  'split-button': {
    more: 'Más opciones',
  },
  stepper: {
    complete: 'completado',
    current: 'paso actual',
    upcoming: 'sin empezar',
    error: 'tiene un error',
    stepOf: (step: number, count: number) => `Paso ${step} de ${count}`,
  },
  'swipe-actions': {
    moreActions: (label: string) => `Más acciones para ${label}`,
  },
  'tag-input': {
    remove: (tag: string) => `Quitar ${tag}`,
    max: (max: number) => `Hasta ${plural(max, 'etiqueta', 'etiquetas')}.`,
    duplicate: (tag: string) => `${tag} ya está agregada.`,
    added: (tags: string) => `Agregadas: ${tags}.`,
    removed: (tag: string) => `Se quitó ${tag}.`,
  },
  terminal: {
    replay: 'Volver a reproducir',
  },
  'theme-switch': {
    darkMode: 'Modo oscuro',
  },
  'time-picker': {
    hour: 'Horas',
    minute: 'Minutos',
    second: 'Segundos',
    period: 'a. m./p. m.',
    list: 'Elegir una hora',
    empty: 'Vacío',
  },
  toast: {
    region: 'Notificaciones',
    close: 'Cerrar',
  },
  tour: {
    next: 'Siguiente',
    back: 'Atrás',
    done: 'Listo',
    skip: 'Saltar el recorrido',
    progress: (current: number, total: number) => `${current} de ${total}`,
  },
  'tree-view': {
    loadFailed: 'no se pudo cargar, ábrelo para reintentar',
  },
  'usage-meter': {
    warning: 'Casi lleno',
    over: (overage: string) => `Excedido por ${overage}`,
    amount: (used: string, limit: string) => `${used} de ${limit}`,
    valueText: (used: string, limit: string) => `${used} de ${limit} usados`,
    almostFull: 'casi lleno',
    overLimit: (overage: string) => `excede el límite por ${overage}`,
    free: 'Libre',
  },
} satisfies LabelsPack
