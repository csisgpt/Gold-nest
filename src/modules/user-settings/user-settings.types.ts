export interface EffectiveUserSettings {
  showBalances: boolean;
  showGold: boolean;
  showCoins: boolean;
  showCash: boolean;
  tradeEnabled: boolean;
  withdrawEnabled: boolean;
  maxOpenTrades: number | null;
  metaJson?: Record<string, any> | null;
}
