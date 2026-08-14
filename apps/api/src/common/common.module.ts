import { Global, Module } from '@nestjs/common';

import { DocumentNumberService } from './services/document-number.service';

@Global()
@Module({
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class CommonModule {}
