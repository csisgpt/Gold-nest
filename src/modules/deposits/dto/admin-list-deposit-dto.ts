import { ApiPropertyOptional } from "@nestjs/swagger";
import { DepositStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";



export class AdminListDepositsDto {
    @ApiPropertyOptional({
        enum: DepositStatus, example: DepositStatus.PENDING
    })
    @IsOptional()
    @IsEnum(DepositStatus)
    status?: DepositStatus
}