import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "个人中心 - 校园生存指北",
  description: "管理您的账号与常用功能",
};

export default function CenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
