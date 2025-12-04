import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { PhysicalCustodyService } from './physical-custody.service';
import { CreatePhysicalCustodyMovementDto } from './dto/create-physical-custody-movement.dto';
import { CancelPhysicalCustodyMovementDto } from './dto/cancel-physical-custody-movement.dto';

@Controller('physical-custody/movements')
export class PhysicalCustodyController {
  constructor(private readonly service: PhysicalCustodyService) {}

  @Post()
  request(@Req() req: any, @Body() dto: CreatePhysicalCustodyMovementDto) {
    return this.service.requestMovement(req.user?.id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.service.approveMovement(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelPhysicalCustodyMovementDto) {
    return this.service.cancelMovement(id, dto);
  }
}
