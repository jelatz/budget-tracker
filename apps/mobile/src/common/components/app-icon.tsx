import React from 'react';
import { type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

export type AppIconName =
  | 'dashboard'
  | 'accounts'
  | 'expenses'
  | 'capture'
  | 'history'
  | 'reconcile'
  | 'portability'
  | 'export'
  | 'import'
  | 'add'
  | 'edit'
  | 'delete'
  | 'check'
  | 'checkCircle'
  | 'close'
  | 'back'
  | 'arrowRight'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp'
  | 'transfer'
  | 'sync'
  | 'offline'
  | 'cloudDone'
  | 'warning'
  | 'error'
  | 'shield'
  | 'calendar'
  | 'tag'
  | 'receipt'
  | 'note'
  | 'merchant'
  | 'search'
  | 'split'
  | 'keyboard'
  | 'copy'
  | 'file'
  | 'logout'
  | 'sparkle'
  | 'loan'
  | 'autopay'
  | 'vault'
  | 'envelope'
  | 'target'
  | 'undo'
  | 'menu'
  | 'arrowDown'
  | 'arrowUp'
  | 'backspace'
  | 'tune'
  | 'chart'
  | 'eye'
  | 'eyeOff'
  | 'wallet'
  | 'creditCard';

const ICON_MAP: Record<
  AppIconName,
  { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol }
> = {
  dashboard: { ios: 'square.grid.2x2', android: 'space_dashboard', web: 'space_dashboard' },
  accounts: { ios: 'building.columns', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  expenses: { ios: 'creditcard', android: 'payments', web: 'payments' },
  capture: { ios: 'plus.circle', android: 'add_circle', web: 'add_circle' },
  history: { ios: 'list.bullet.rectangle', android: 'receipt_long', web: 'receipt_long' },
  reconcile: { ios: 'scale.3d', android: 'balance', web: 'balance' },
  portability: { ios: 'externaldrive', android: 'backup', web: 'backup' },
  export: { ios: 'square.and.arrow.up', android: 'upload', web: 'upload' },
  import: { ios: 'square.and.arrow.down', android: 'download', web: 'download' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  delete: { ios: 'trash', android: 'delete', web: 'delete' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  checkCircle: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  back: { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' },
  arrowRight: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  chevronUp: { ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' },
  transfer: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' },
  offline: { ios: 'icloud.slash', android: 'cloud_off', web: 'cloud_off' },
  cloudDone: { ios: 'icloud.and.arrow.up', android: 'cloud_done', web: 'cloud_done' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  error: { ios: 'exclamationmark.circle', android: 'error', web: 'error' },
  shield: { ios: 'checkmark.shield', android: 'shield', web: 'shield' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  tag: { ios: 'tag', android: 'label', web: 'label' },
  receipt: { ios: 'doc.text', android: 'receipt', web: 'receipt' },
  note: { ios: 'doc.text', android: 'description', web: 'description' },
  merchant: { ios: 'storefront', android: 'storefront', web: 'storefront' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  split: { ios: 'arrow.branch', android: 'call_split', web: 'call_split' },
  keyboard: { ios: 'keyboard', android: 'keyboard', web: 'keyboard' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  file: { ios: 'folder', android: 'folder_open', web: 'folder_open' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  loan: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
  autopay: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  vault: { ios: 'tray', android: 'savings', web: 'savings' },
  envelope: { ios: 'envelope', android: 'mail', web: 'mail' },
  target: { ios: 'target', android: 'track_changes', web: 'track_changes' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  menu: { ios: 'line.3.horizontal', android: 'menu', web: 'menu' },
  arrowDown: { ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  backspace: { ios: 'delete.left', android: 'backspace', web: 'backspace' },
  tune: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  chart: { ios: 'chart.bar', android: 'trending_up', web: 'trending_up' },
  eye: { ios: 'eye', android: 'trending_up', web: 'trending_up' },
  eyeOff: { ios: 'eye.slash', android: 'close', web: 'close' },
  wallet: { ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  creditCard: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
};

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

export function AppIcon({ name, size = 18, color, style }: AppIconProps) {
  return (
    <SymbolView
      name={ICON_MAP[name]}
      size={size}
      tintColor={color}
      style={style}
    />
  );
}
