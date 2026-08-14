import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobCategory } from './entities/job-category.entity';
import { JobRole } from './entities/job-role.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobCategory, JobRole])],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
