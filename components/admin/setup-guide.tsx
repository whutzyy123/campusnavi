"use client";

import Link from "next/link";
import { Building2, MapPin, Users, ArrowRight } from "lucide-react";

/**
 * 新学校初始化引导：0 POI、0 用户时展示
 */
export function SetupGuide() {
  const steps = [
    {
      title: "配置校区边界",
      desc: "在地图上绘制校区范围，为导航和 POI 定位提供基础",
      href: "/admin/school/campuses",
      icon: Building2,
    },
    {
      title: "添加 POI",
      desc: "创建官方 POI 或导入数据，完善校园地图",
      href: "/admin/school/pois",
      icon: MapPin,
    },
    {
      title: "邀请团队成员",
      desc: "生成邀请码，邀请管理员和工作人员加入",
      href: "/admin/team",
      icon: Users,
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">初始化引导</h2>
      <p className="mt-1 text-sm text-gray-500">
        您的学校尚未完成基础配置，请按以下步骤完成初始化。
      </p>
      <div className="mt-6 space-y-4">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.href}
              href={step.href}
              className="flex items-start gap-4 rounded-lg border border-gray-100 p-4 transition-colors hover:border-gray-200 hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    步骤 {idx + 1}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </div>
                <h3 className="mt-1 font-medium text-gray-900">{step.title}</h3>
                <p className="mt-0.5 text-sm text-gray-500">{step.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
