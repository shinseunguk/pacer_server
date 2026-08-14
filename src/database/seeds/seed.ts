import 'reflect-metadata';
import { JobCategory } from '../../jobs/entities/job-category.entity';
import { JobRole } from '../../jobs/entities/job-role.entity';
import { AppDataSource } from '../../config/data-source';
import { JOB_CATEGORY_SEED } from './jobs.data';

/**
 * 직무 카테고리·세부 직무 시드 (멱등).
 * 실행: `npm run db:seed`
 */
async function seed(): Promise<void> {
  await AppDataSource.initialize();
  const categoryRepo = AppDataSource.getRepository(JobCategory);
  const roleRepo = AppDataSource.getRepository(JobRole);

  let createdCategories = 0;
  let createdRoles = 0;

  for (const [categoryIndex, categorySeed] of JOB_CATEGORY_SEED.entries()) {
    let category = await categoryRepo.findOne({
      where: { name: categorySeed.name },
    });
    if (!category) {
      category = await categoryRepo.save(
        categoryRepo.create({
          name: categorySeed.name,
          sortOrder: categoryIndex,
        }),
      );
      createdCategories += 1;
    }

    for (const [roleIndex, roleName] of categorySeed.roles.entries()) {
      const exists = await roleRepo.findOne({
        where: { name: roleName, category: { id: category.id } },
      });
      if (!exists) {
        await roleRepo.save(
          roleRepo.create({
            name: roleName,
            sortOrder: roleIndex,
            category,
          }),
        );
        createdRoles += 1;
      }
    }
  }

  console.log(
    `Seed 완료: 카테고리 +${createdCategories}, 직무 +${createdRoles} (멱등 실행)`,
  );
  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Seed 실패:', error);
  process.exitCode = 1;
});
