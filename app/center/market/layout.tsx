import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "生存集市 - 管理我的交易",
  description: "管理您的集市交易、发布与购买",
};

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
