import { ApiProperty } from '@nestjs/swagger';

export class AccountStatementEntryDto {
  @ApiProperty({ type: String })
  date!: Date;

  @ApiProperty()
  docNo!: string;

  @ApiProperty({ description: 'Document type e.g. DEPOSIT, WITHDRAW, TRADE_BUY, TRADE_SELL, REMITTANCE_IN, REMITTANCE_OUT' })
  docType!: string;

  @ApiProperty({ required: false })
  description?: string;

  // monetary columns (in IRR)
  @ApiProperty({ required: false, description: 'Debit amount in IRR as string' })
  debitMoney?: string;

  @ApiProperty({ required: false, description: 'Credit amount in IRR as string' })
  creditMoney?: string;

  // weight columns (in grams)
  @ApiProperty({ required: false, description: 'Debit weight in grams as string' })
  debitWeight?: string;

  @ApiProperty({ required: false, description: 'Credit weight in grams as string' })
  creditWeight?: string;
}
