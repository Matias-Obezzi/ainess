import type { LabelsPack } from '@/lib/labels'

/*
 * The registry ships no German pack, so this one is ainess's own, and it covers only the
 * components installed here. A component added later and missing from this file speaks English
 * in German until its entry is written: `src/lib/labels-en.ts` has every key to translate.
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const de = {
  'alert-dialog': {
    confirm: 'Fortfahren',
    cancel: 'Abbrechen',
  },
  'code-block': {
    wrap: 'Zeilen umbrechen',
    copy: 'Code kopieren',
    copied: 'Kopiert',
    code: (language?: string) => (language ? `${language}-Code` : 'Code'),
    showLess: 'Weniger anzeigen',
    showAll: (lines: number) => `Alle ${lines} Zeilen anzeigen`,
  },
  command: {
    title: 'Befehlsmenü',
    description: 'Nach einem Befehl oder einer Seite suchen',
  },
  'copy-button': {
    copy: 'Kopieren',
    copied: 'Kopiert',
    failed: 'Kopieren fehlgeschlagen',
  },
  dialog: {
    close: 'Schließen',
  },
  kbd: {
    command: 'Befehlstaste',
    control: 'Steuerung',
    windows: 'Windows',
    option: 'Wahltaste',
    alt: 'Alt',
    shift: 'Umschalt',
    return: 'Zeilenschalter',
    enter: 'Eingabe',
    delete: 'Entfernen',
    forwardDelete: 'Entfernen vorwärts',
    backspace: 'Rücktaste',
    escape: 'Escape',
    tab: 'Tabulator',
    space: 'Leertaste',
    capsLock: 'Feststelltaste',
    upArrow: 'Pfeil nach oben',
    downArrow: 'Pfeil nach unten',
    leftArrow: 'Pfeil nach links',
    rightArrow: 'Pfeil nach rechts',
    pageUp: 'Bild auf',
    pageDown: 'Bild ab',
    home: 'Pos1',
    end: 'Ende',
    plus: 'Plus',
  },
  'multi-select': {
    placeholder: 'Auswählen…',
    search: 'Suchen…',
    empty: 'Keine Ergebnisse.',
    selectAll: 'Alle auswählen',
    clear: 'Auswahl aufheben',
    remove: (label: string) => `${label} entfernen`,
    noneSelected: 'Nichts ausgewählt',
    selected: (count: number, labels: string) => `${count} ausgewählt: ${labels}`,
  },
  'number-field': {
    decrement: 'Verringern',
    increment: 'Erhöhen',
  },
  'password-field': {
    reveal: 'Passwort anzeigen',
    strength: 'Passwortstärke',
    empty: 'Leer',
    weak: 'Schwach',
    fair: 'Mittel',
    good: 'Gut',
    strong: 'Stark',
    avoidCommon: 'Vermeide gängige Passwörter und Wörter.',
    useLength: 'Verwende mindestens 12 Zeichen.',
    avoidSequences: 'Vermeide Folgen wie abcd oder 1234.',
    avoidRepeats: 'Vermeide es, dasselbe Zeichen zu wiederholen.',
    mixCharacters: 'Mische Großbuchstaben, Zahlen oder Symbole hinein.',
    addLength: 'Ein paar Zeichen mehr machen es stark.',
    ruleLength: 'Mindestens 12 Zeichen',
    ruleCase: 'Ein Klein- und ein Großbuchstabe',
    ruleNumber: 'Eine Zahl',
    ruleSymbol: 'Ein Symbol',
  },
  spinner: {
    loading: 'Wird geladen',
  },
  'split-button': {
    more: 'Weitere Optionen',
  },
  toast: {
    region: 'Benachrichtigungen',
    close: 'Schließen',
  },
  'json-viewer': {
    search: 'Schlüssel und Werte durchsuchen',
    match: (current: number, total: number) => `${current} von ${total}`,
    noMatches: 'Keine Treffer',
    expandAll: 'Alle aufklappen',
    collapseAll: 'Alle zuklappen',
    tree: 'JSON',
    size: (count: number, type: 'array' | 'object') =>
      type === 'array' ? plural(count, 'Element', 'Elemente') : plural(count, 'Schlüssel', 'Schlüssel'),
    array: 'Array',
    object: 'Objekt',
    showMore: (count: number) => `${count} weitere anzeigen`,
    left: (count: number) => `noch ${count}`,
    copyValue: (path: string) => `Wert von ${path} kopieren`,
    copyPath: (path: string) => `Pfad ${path} kopieren`,
    copyValueHint: 'Wert kopieren (c)',
    copyPathHint: 'Pfad kopieren (p)',
    valueCopied: 'Wert kopiert',
    pathCopied: 'Pfad kopiert',
  },
  'metric-card': {
    loading: 'Wird geladen',
    up: 'Gestiegen',
    down: 'Gesunken',
    noChange: 'Keine Änderung',
  },
  'search-field': {
    placeholder: 'Suchen…',
    clear: 'Suche leeren',
  },
  sparkline: {
    summary: ({ count, first, last, low, high }: { count: number; first?: string; last?: string; low: string; high: string }) =>
      `Verlauf von ${count} Werten${first !== undefined && last !== undefined ? `, von ${first} bis ${last}` : ''}, Minimum ${low}, Maximum ${high}`,
    empty: 'Keine Daten',
  },
  'usage-meter': {
    warning: 'Fast voll',
    over: (overage: string) => `Um ${overage} überschritten`,
    amount: (used: string, limit: string) => `${used} von ${limit}`,
    valueText: (used: string, limit: string) => `${used} von ${limit} verbraucht`,
    almostFull: 'fast voll',
    overLimit: (overage: string) => `um ${overage} über dem Limit`,
    free: 'Frei',
  },
} satisfies LabelsPack
