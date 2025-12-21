import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { InstrumentType, PolicyAction, PolicyMetric, PolicyPeriod, PolicyScopeType } from '@prisma/client';

export class ListPolicyRulesDto {
  @IsOptional()
  @IsEnum(PolicyScopeType)
  scopeType?: PolicyScopeType;

  @IsOptional()
  @IsString()
  customerGroupId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  instrumentId?: string;

  @IsOptional()
  @IsEnum(InstrumentType)
  instrumentType?: InstrumentType | null;

  @IsOptional()
  @IsEnum(PolicyAction)
  action?: PolicyAction;

  @IsOptional()
  @IsEnum(PolicyMetric)
  metric?: PolicyMetric;

  @IsOptional()
  @IsEnum(PolicyPeriod)
  period?: PolicyPeriod;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;
}

export class CreatePolicyRuleDto {
  @IsEnum(PolicyScopeType)
  scopeType!: PolicyScopeType;

  @IsOptional()
  @IsString()
  scopeUserId?: string | null;

  @IsOptional()
  @IsString()
  scopeGroupId?: string | null;

  @IsEnum(PolicyAction)
  action!: PolicyAction;

  @IsEnum(PolicyMetric)
  metric!: PolicyMetric;

  @IsEnum(PolicyPeriod)
  period!: PolicyPeriod;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  limit!: number;

  @IsOptional()
  @IsString()
  instrumentId?: string | null;

  @IsOptional()
  @IsEnum(InstrumentType)
  instrumentType?: InstrumentType;

  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdatePolicyRuleDto {
  @IsOptional()
  @IsEnum(PolicyScopeType)
  scopeType?: PolicyScopeType;

  @IsOptional()
  @IsString()
  scopeUserId?: string | null;

  @IsOptional()
  @IsString()
  scopeGroupId?: string | null;

  @IsOptional()
  @IsEnum(PolicyAction)
  action?: PolicyAction;

  @IsOptional()
  @IsEnum(PolicyMetric)
  metric?: PolicyMetric;

  @IsOptional()
  @IsEnum(PolicyPeriod)
  period?: PolicyPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  instrumentId?: string | null;

  @IsOptional()
  @IsEnum(InstrumentType)
  instrumentType?: InstrumentType;

  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class BulkUpsertPolicyRuleDto {
  @ValidateNested({ each: true })
  @Type(() => CreatePolicyRuleDto)
  items!: CreatePolicyRuleDto[];
}
