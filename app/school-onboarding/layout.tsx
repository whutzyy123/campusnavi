import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "学校入驻 | 校园生存指北",
  description: "将「校园生存指北」引入贵校，为师生提供精细化校区地图、校内导航、生存集市等一站式校园生活服务。欢迎高校洽谈合作。",
};

export default function SchoolOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
