import { Repository } from 'typeorm';
import { JobCategory } from './entities/job-category.entity';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let categoryRepo: { find: jest.Mock };
  let service: JobsService;

  beforeEach(() => {
    categoryRepo = { find: jest.fn() };
    service = new JobsService(
      categoryRepo as unknown as Repository<JobCategory>,
    );
  });

  it('카테고리와 하위 직무를 id·name만 담은 트리로 반환한다', async () => {
    categoryRepo.find.mockResolvedValue([
      {
        id: 'cat-1',
        name: '개발',
        sortOrder: 0,
        roles: [
          { id: 'role-1', name: '백엔드', sortOrder: 0 },
          { id: 'role-2', name: 'iOS', sortOrder: 1 },
        ],
      },
    ]);

    const tree = await service.getCategoryTree();

    expect(tree).toEqual([
      {
        id: 'cat-1',
        name: '개발',
        roles: [
          { id: 'role-1', name: '백엔드' },
          { id: 'role-2', name: 'iOS' },
        ],
      },
    ]);
  });

  it('sortOrder 오름차순으로 조회한다', async () => {
    categoryRepo.find.mockResolvedValue([]);

    await service.getCategoryTree();

    expect(categoryRepo.find).toHaveBeenCalledWith({
      relations: { roles: true },
      order: { sortOrder: 'ASC', roles: { sortOrder: 'ASC' } },
    });
  });
});
