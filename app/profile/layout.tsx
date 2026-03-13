import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "中控台 - 校园生存指北",
  description: "管理您的个人资料与失物招领",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
