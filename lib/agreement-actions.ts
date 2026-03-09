"use server";

import fs from "fs";
import path from "path";

/**
 * 获取协议/免责声明内容
 * @param type 'user' | 'disclaimer'
 * @returns { success: true, data: string } 或 { success: false, error: string }
 */
export async function getAgreementContent(
  type: "user" | "disclaimer"
): Promise<{ success: true; data: string } | { success: false; error: string }> {
  const filename = type === "user" ? "用户协议.md" : "免责声明.md";
  const filePath = path.join(process.cwd(), "docs", filename);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: "Document not found" };
  }

  const data = fs.readFileSync(filePath, "utf-8");
  return { success: true, data };
}
