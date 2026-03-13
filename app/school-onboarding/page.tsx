/**
 * 学校入驻服务页
 * 商业化预留页面：面向高校的 B2B 入驻申请与对接
 */

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, MapPin, Users, BarChart3, ArrowRight, Mail } from "lucide-react";

const benefits = [
  {
    icon: MapPin,
    title: "精细化校区地图",
    description: "多校区边界、POI 管理、室内外导航，打造专属校园 GIS",
  },
  {
    icon: Users,
    title: "师生全覆盖",
    description: "学生端 + 管理后台，支持多角色权限与数据隔离",
  },
  {
    icon: BarChart3,
    title: "数据与运营",
    description: "人流热力、设施使用、集市交易等运营数据洞察",
  },
];

export default function SchoolOnboardingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 背景 */}
      <div className="pointer-events-none absolute inset-0 -z-10 landing-mesh-bg" />
      <div className="pointer-events-none absolute inset-0 -z-10 landing-dot-pattern opacity-60" />

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FF4500]/20 bg-[#FF4500]/5 px-4 py-1.5 text-sm font-medium text-[#FF4500]">
            <Building2 className="h-4 w-4" />
            高校合作
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            学校入驻
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            将「校园生存指北」引入贵校，为师生提供精细化校区地图、校内导航、生存集市等一站式校园生活服务。
          </p>
        </motion.div>

        {/* 服务价值 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-16 grid gap-8 sm:grid-cols-3"
        >
          {benefits.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/40 bg-white/60 p-6 backdrop-blur-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/10 text-[#FF4500] ring-1 ring-[#FF4500]/10">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          ))}
        </motion.div>

        {/* CTA 区块 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-20 rounded-2xl border border-[#FF4500]/20 bg-gradient-to-br from-[#FF4500]/5 to-orange-50/80 p-8 sm:p-12"
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              欢迎高校洽谈合作
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-600">
              如需了解入驻流程、服务方案或商务合作，请通过以下方式联系我们。
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="mailto:school@campus-survival.example.com"
                className="inline-flex items-center gap-2 rounded-full bg-[#FF4500] px-6 py-3 text-base font-semibold text-white transition-all hover:bg-[#E03D00]"
              >
                <Mail className="h-5 w-5" />
                联系商务
              </a>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border-2 border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50"
              >
                返回首页
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-500">
              本页面为商业化服务预留入口，具体合作流程与报价以商务沟通为准。
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
