import { Module } from '@nestjs/common';

// Admin module is intentionally lightweight and acts as a namespace for admin routes
// defined inside individual feature modules.
@Module({})
export class AdminModule {}
