import type { LabelsPack } from '@/lib/labels'

/*
 * The registry ships no Japanese pack, so this one is ainess's own, and it covers only the
 * components installed here. A component added later and missing from this file speaks English
 * in Japanese until its entry is written: `src/lib/labels-en.ts` has every key to translate.
 */
export const ja = {
  'alert-dialog': {
    confirm: '続行',
    cancel: 'キャンセル',
  },
  'code-block': {
    wrap: '行を折り返す',
    copy: 'コードをコピー',
    copied: 'コピーしました',
    code: (language?: string) => (language ? `${language} のコード` : 'コード'),
    showLess: '折りたたむ',
    showAll: (lines: number) => `全 ${lines} 行を表示`,
  },
  command: {
    title: 'コマンドメニュー',
    description: 'コマンドやページを検索',
  },
  'copy-button': {
    copy: 'コピー',
    copied: 'コピーしました',
    failed: 'コピーできませんでした',
  },
  dialog: {
    close: '閉じる',
  },
  kbd: {
    command: 'コマンド',
    control: 'コントロール',
    windows: 'Windows',
    option: 'オプション',
    alt: 'Alt',
    shift: 'シフト',
    return: 'リターン',
    enter: 'エンター',
    delete: '削除',
    forwardDelete: '前方削除',
    backspace: 'バックスペース',
    escape: 'エスケープ',
    tab: 'タブ',
    space: 'スペース',
    capsLock: 'Caps Lock',
    upArrow: '上矢印',
    downArrow: '下矢印',
    leftArrow: '左矢印',
    rightArrow: '右矢印',
    pageUp: 'Page Up',
    pageDown: 'Page Down',
    home: 'Home',
    end: 'End',
    plus: 'プラス',
  },
  'multi-select': {
    placeholder: '選択…',
    search: '検索…',
    empty: '結果がありません。',
    selectAll: 'すべて選択',
    clear: '選択を解除',
    remove: (label: string) => `${label} を外す`,
    noneSelected: '未選択',
    selected: (count: number, labels: string) => `${count} 件選択：${labels}`,
  },
  'number-field': {
    decrement: '減らす',
    increment: '増やす',
  },
  'password-field': {
    reveal: 'パスワードを表示',
    strength: 'パスワードの強度',
    empty: '空',
    weak: '弱い',
    fair: '普通',
    good: '良い',
    strong: '強い',
    avoidCommon: 'よく使われるパスワードや単語は避けてください。',
    useLength: '12 文字以上にしてください。',
    avoidSequences: 'abcd や 1234 のような並びは避けてください。',
    avoidRepeats: '同じ文字の繰り返しは避けてください。',
    mixCharacters: '大文字、数字、記号を混ぜてください。',
    addLength: 'あと数文字で強くなります。',
    ruleLength: '12 文字以上',
    ruleCase: '小文字と大文字',
    ruleNumber: '数字',
    ruleSymbol: '記号',
  },
  spinner: {
    loading: '読み込み中',
  },
  'split-button': {
    more: 'その他のオプション',
  },
  toast: {
    region: '通知',
    close: '閉じる',
  },
} satisfies LabelsPack
