import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "消息 - 校园生存指北",
  description: "查看留言回复、点赞、集市通知等消息",
};

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
