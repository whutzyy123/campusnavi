import { prisma } from "@/lib/prisma";

export interface MergedCategory {
  id: string;
  name: string;
  icon: string | null;
  isGlobal: boolean;
  isHidden: boolean; // 是否在当前学校被隐藏
  customName: string | null; // 自定义名称（如果有）
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 合并全局分类和学校私有分类，应用覆盖逻辑
 * @param schoolId 学校ID
 * @returns 合并后的分类列表
 */
export async function getMergedCategories(schoolId: string): Promise<MergedCategory[]> {
  // 1. 获取所有全局分类
  const globalCategories = await prisma.category.findMany({
    where: {
      isGlobal: true,
      schoolId: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // 单独统计每个全局分类在该学校的 POI 数量
  const globalCategoriesWithCount = await Promise.all(
    globalCategories.map(async (cat) => {
      const poiCount = await prisma.pOI.count({
        where: {
          categoryId: cat.id,
          schoolId: schoolId,
        },
      });
      return { ...cat, poiCount };
    })
  );

  // 2. 获取该学校的私有分类
  const schoolCategories = await prisma.category.findMany({
    where: {
      schoolId: schoolId,
      isGlobal: false,
    },
    include: {
      _count: {
        select: {
          pois: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // 3. 获取该学校对全局分类的覆盖记录
  const overrides = await prisma.categoryOverride.findMany({
    where: {
      schoolId: schoolId,
    },
  });

  // 创建覆盖记录的映射表（categoryId -> override）
  const overrideMap = new Map(
    overrides.map((o) => [o.categoryId, o])
  );

  // 4. 合并全局分类（应用覆盖逻辑）
  const mergedGlobalCategories: MergedCategory[] = globalCategoriesWithCount
    .map((cat) => {
      const override = overrideMap.get(cat.id);
      
      // 如果被隐藏，则跳过
      if (override?.isHidden) {
        return null;
      }

      return {
        id: cat.id,
        name: override?.customName || cat.name, // 使用自定义名称或原始名称
        icon: cat.icon,
        isGlobal: true,
        isHidden: false,
        customName: override?.customName || null,
        poiCount: cat.poiCount,
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      };
    })
    .filter((cat): cat is MergedCategory => cat !== null);

  // 5. 转换学校私有分类
  const mergedSchoolCategories: MergedCategory[] = schoolCategories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    isGlobal: false,
    isHidden: false,
    customName: null,
    poiCount: cat._count.pois,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString(),
  }));

  // 6. 合并并返回
  return [...mergedGlobalCategories, ...mergedSchoolCategories];
}

/**
 * 创建或更新分类覆盖记录
 * @param schoolId 学校ID
 * @param categoryId 全局分类ID
 * @param isHidden 是否隐藏
 * @param customName 自定义名称（可选）
 */
export async function upsertCategoryOverride(
  schoolId: string,
  categoryId: string,
  isHidden?: boolean,
  customName?: string | null
) {
  return await prisma.categoryOverride.upsert({
    where: {
      schoolId_categoryId: {
        schoolId,
        categoryId,
      },
    },
    update: {
      isHidden: isHidden !== undefined ? isHidden : undefined,
      customName: customName !== undefined ? customName : undefined,
    },
    create: {
      schoolId,
      categoryId,
      isHidden: isHidden ?? false,
      customName: customName ?? null,
    },
  });
}

/**
 * 删除分类覆盖记录（恢复全局分类的默认显示）
 * @param schoolId 学校ID
 * @param categoryId 全局分类ID
 */
export async function removeCategoryOverride(
  schoolId: string,
  categoryId: string
) {
  return await prisma.categoryOverride.delete({
    where: {
      schoolId_categoryId: {
        schoolId,
        categoryId,
      },
    },
  });
}

