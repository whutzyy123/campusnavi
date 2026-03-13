/**
 * 营销落地页
 * GIS-Tech meets Student Life：现代、高能、科技感
 * 布局优化：视觉重心平衡、响应式协调
 */

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Zap, MessageCircle } from "lucide-react";

const features = [
  {
    icon: MapPin,
    title: "精准导航",
    description: "校内建筑，一键直达",
    glowColor: "from-orange-500/20 to-red-500/10",
  },
  {
    icon: Zap,
    title: "实时情报",
    description: "设施拥挤、道路施工，一手掌握",
    glowColor: "from-amber-500/20 to-yellow-500/10",
  },
  {
    icon: MessageCircle,
    title: "校友圈子",
    description: "实时留言板，校园生活圈",
    glowColor: "from-blue-500/20 to-indigo-500/10",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

export function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden pt-[max(5rem,8vh)] pb-0">
      {/* Mesh gradient + dot pattern background */}
      <div className="pointer-events-none absolute inset-0 -z-10 landing-mesh-bg" />
      <div className="pointer-events-none absolute inset-0 -z-10 landing-dot-pattern opacity-60" />

      {/* Hero Section - 居中布局，左右视觉权重平衡 */}
      <section className="flex flex-1 flex-col items-center justify-center py-8 sm:py-12">
        <div className="container mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16 xl:gap-20"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Block 1: Hero + CTA（桌面端左上） */}
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <motion.div variants={itemVariants} className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[2.75rem] xl:text-6xl">
                  校园生存指北
                </h1>
                <p className="mx-auto max-w-md text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0 lg:max-w-lg">
                  不仅是地图，更是你的校园生活圈。
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="mt-6">
                <Link
                  href="/login"
                  className="hero-btn-glow inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:from-orange-600 hover:to-red-700 hover:shadow-xl active:scale-[0.98]"
                >
                  立即登录 / 注册
                </Link>
              </motion.div>
            </div>

            {/* Block 2: Phone Mockup（桌面端右侧，垂直居中） */}
            <motion.div
              variants={itemVariants}
              className="flex min-h-[260px] items-center justify-center lg:min-h-[320px] lg:row-span-2 [perspective:1000px]"
            >
              <motion.div
                className="relative w-full max-w-[240px] sm:max-w-[260px] lg:max-w-[280px]"
                style={{ aspectRatio: "9/19" }}
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {/* Shadow that scales with float */}
                <motion.div
                  className="absolute -bottom-6 left-1/2 h-8 w-32 -translate-x-1/2 rounded-full bg-black/15 blur-xl"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />

                {/* Phone / Card UI */}
                <div
                  className="relative flex h-full w-full flex-col rounded-3xl border-8 border-slate-800 bg-white shadow-2xl overflow-hidden"
                  style={{
                    boxShadow:
                      "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
                  }}
                >
                  {/* Header - Nav Bar */}
                  <div className="h-12 flex items-center justify-between px-4 border-b border-slate-100 bg-white">
                    <div className="h-2 w-16 rounded-full bg-slate-200" />
                    <div className="flex gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    </div>
                  </div>

                  {/* Map Area */}
                  <div className="relative min-h-0 flex-1 bg-[#FFF5F2]">
                    {/* Map grid lines (subtle blueprint) */}
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute top-1/4 left-0 right-0 h-px bg-[#FF4500]/20" />
                      <div className="absolute top-2/4 left-0 right-0 h-px bg-[#FF4500]/20" />
                      <div className="absolute top-3/4 left-0 right-0 h-px bg-[#FF4500]/20" />
                      <div className="absolute left-1/4 top-0 bottom-0 w-px bg-[#FF4500]/20" />
                      <div className="absolute left-2/4 top-0 bottom-0 w-px bg-[#FF4500]/20" />
                      <div className="absolute left-3/4 top-0 bottom-0 w-px bg-[#FF4500]/20" />
                    </div>

                    {/* Animated Map Markers */}
                    <div className="absolute top-[18%] left-[22%] marker-pulse-soft h-8 w-8 rounded-full bg-[#FF4500] shadow-md border-2 border-white" />
                    <div className="absolute top-[35%] right-[28%] marker-pulse-soft marker-pulse-delay-2 h-6 w-6 rounded-full bg-[#FF4500] shadow-md border-2 border-white" />
                    <div className="absolute bottom-[35%] left-[30%] marker-pulse-soft marker-pulse-delay-3 h-7 w-7 rounded-full bg-emerald-500 shadow-md border-2 border-white" />
                    <div className="absolute top-[55%] right-[18%] marker-pulse-soft marker-pulse-delay-4 h-5 w-5 rounded-full bg-amber-500 shadow-md border-2 border-white" />
                    <div className="absolute bottom-[25%] right-[35%] marker-pulse-soft marker-pulse-delay-1 h-6 w-6 rounded-full bg-violet-500 shadow-md border-2 border-white" />

                    {/* Search bar mock */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] h-9 rounded-full bg-white/95 shadow-md border border-slate-100" />

                    {/* Bottom Card - POI Drawer */}
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] p-4">
                      <div className="h-1 w-12 rounded-full bg-slate-200 mx-auto mb-3" />
                      <div className="h-3 w-3/4 rounded bg-slate-200 mb-2" />
                      <div className="h-2 w-1/2 rounded bg-slate-100 mb-3" />
                      <div className="flex gap-2">
                        <div className="h-8 flex-1 rounded-lg bg-[#FF4500]/20" />
                        <div className="h-8 flex-1 rounded-lg bg-slate-100" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Block 3: Feature Cards（桌面端左下，与 Hero 形成左栏） */}
            <motion.div
              className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-3 lg:mt-10"
              variants={containerVariants}
            >
              {features.map(({ icon: Icon, title, description, glowColor }) => (
                <motion.div
                  key={title}
                  variants={itemVariants}
                  className="group rounded-xl border border-white/20 bg-white/60 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${glowColor} text-[#FF4500] ring-1 ring-[#FF4500]/10`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer - 底部锚定，视觉收束 */}
      <footer className="mt-auto border-t border-slate-200/60 bg-white/30 backdrop-blur-sm py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} 校园生存指北 · 精细化校区地理信息系统
        </div>
      </footer>
    </div>
  );
}
