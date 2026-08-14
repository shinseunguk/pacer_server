import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobCategory } from './entities/job-category.entity';

export interface JobRoleItem {
  id: string;
  name: string;
}

export interface JobCategoryTree {
  id: string;
  name: string;
  roles: JobRoleItem[];
}

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobCategory)
    private readonly categoryRepo: Repository<JobCategory>,
  ) {}

  /** 직무 선택 화면용 대분류 + 세부 트리. 시드 데이터의 sortOrder 순으로 정렬한다. */
  async getCategoryTree(): Promise<JobCategoryTree[]> {
    const categories = await this.categoryRepo.find({
      relations: { roles: true },
      order: { sortOrder: 'ASC', roles: { sortOrder: 'ASC' } },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      roles: category.roles.map((role) => ({ id: role.id, name: role.name })),
    }));
  }
}
