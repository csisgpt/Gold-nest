import { PartialType } from '@nestjs/swagger';
import { CreatePriceProviderDto } from './create-price-provider.dto';

export class UpdatePriceProviderDto extends PartialType(CreatePriceProviderDto) {}
