#!/usr/bin/env node
/**
 * 渐进式 Token 守卫：报告 app/ 下 bg-[#FF4500] 手搓主色（warn-only，不阻断 CI）
 */
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "..", "app");
const PATTERN = /bg-\[#FF4500\]/;

function walkTsx(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(full, results);
    } else if (entry.name.endsWith(".tsx") && PATTERN.test(fs.readFileSync(full, "utf8"))) {
      results.push(path.relative(path.join(__dirname, ".."), full).replace(/\\/g, "/"));
    }
  }
  return results;
}

const files = walkTsx(APP_DIR);

if (files.length === 0) {
  console.log("lint:tokens — 未发现 app/ 下 bg-[#FF4500] 用法");
  process.exit(0);
}

console.warn(
  `lint:tokens — 发现 ${files.length} 个文件仍使用 bg-[#FF4500]（建议改用 Button variant="primary"）：`
);
for (const file of files) {
  console.warn(`  ${file}`);
}
process.exit(0);
