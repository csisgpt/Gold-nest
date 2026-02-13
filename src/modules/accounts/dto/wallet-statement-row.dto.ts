export interface WalletStatementRowDto {
  id: string;
  createdAt: Date;
  refType: string;
  refId: string | null;
  type: string;
  instrumentCode: string;
  side: 'CREDIT' | 'DEBIT' | 'NONE';
  amountMoney: string | null;
  amountWeight: string | null;
  note: string | null;
  balancesHidden: boolean;
}
