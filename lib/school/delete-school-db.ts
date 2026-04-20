import { prisma } from "@/lib/prisma";

/**
 * 删除学校记录。依赖 Prisma schema 中指向 School 的外键 onDelete: Cascade，
 * 与原先手写多步 deleteMany 语义一致时可用单次 delete 作为唯一实现路径。
 */
export async function deleteSchoolCascade(schoolId: string): Promise<void> {
  await prisma.school.delete({ where: { id: schoolId } });
}
