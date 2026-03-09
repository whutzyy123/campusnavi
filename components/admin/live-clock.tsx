"use client";

import { useState, useEffect } from "react";

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * 获取北京时区 (UTC+8) 的当前时间
 */
function getBeijingTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + 8 * 60 * 60 * 1000);
}

/**
 * 格式化为：YYYY年MM月DD日 星期X HH:mm:ss
 */
function formatBeijingTime(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const w = WEEKDAY_ZH[date.getDay()];
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}年${m}月${d}日 星期${w} ${h}:${min}:${s}`;
}

/**
 * 实时时钟组件，用于管理员控制台欢迎区
 * - 北京时区 (UTC+8)
 * - 仅在客户端挂载后渲染，避免 hydration 不一致
 */
export function LiveClock() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const tick = () => {
      setTime(formatBeijingTime(getBeijingTime()));
    };

    tick(); // 立即显示一次
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mounted]);

  if (!mounted) {
    return (
      <span className="font-mono text-gray-500 text-sm md:text-base tabular-nums">
        &nbsp;
      </span>
    );
  }

  return (
    <time
      dateTime={new Date().toISOString()}
      className="font-mono text-gray-500 text-sm md:text-base tabular-nums"
    >
      {time}
    </time>
  );
}
