import { PartialType } from '@nestjs/swagger';
import { CreateProductProviderMappingDto } from './create-product-provider-mapping.dto';

export class UpdateProductProviderMappingDto extends PartialType(CreateProductProviderMappingDto) {}
