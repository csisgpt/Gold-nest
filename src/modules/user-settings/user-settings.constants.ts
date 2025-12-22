import { EffectiveUserSettings } from './user-settings.types';

export const USER_SETTINGS_DEFAULTS: EffectiveUserSettings = {
  showBalances: true,
  showGold: true,
  showCoins: true,
  showCash: true,
  tradeEnabled: true,
  withdrawEnabled: true,
  maxOpenTrades: null,
  metaJson: undefined,
};
