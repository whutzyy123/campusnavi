"use client";

/**
 * 通用图片轮播
 * 多图横向滑动 + 分页点；单图静态；无图占位
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/core/utils";

export interface ImageCarouselProps {
  images: string[];
  /** 图片 alt 前缀，多图时为「{altPrefix} (1/N)」 */
  altPrefix?: string;
  unoptimized?: (src: string) => boolean;
  className?: string;
}

export function ImageCarousel({
  images,
  altPrefix = "图片",
  unoptimized,
  className,
}: ImageCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    const scrollLeft = el.scrollLeft;
    const width = el.clientWidth;
    const index = Math.round(scrollLeft / width);
    setActiveIndex(Math.min(index, images.length - 1));
  }, [images.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, images.length]);

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center rounded-xl bg-gray-100",
          className
        )}
      >
        <ImageIcon className="h-12 w-12 text-gray-300" aria-hidden />
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100",
          className
        )}
      >
        <Image
          src={images[0]}
          alt={altPrefix}
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-cover"
          unoptimized={unoptimized?.(images[0])}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100",
        className
      )}
    >
      <div
        ref={scrollRef}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto no-scrollbar"
      >
        {images.map((src, i) => (
          <div key={i} className="relative h-full w-full min-w-full flex-none snap-center">
            <Image
              src={src}
              alt={`${altPrefix} (${i + 1}/${images.length})`}
              fill
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
              unoptimized={unoptimized?.(src)}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full shadow-sm transition-opacity",
              i === activeIndex ? "bg-white opacity-100" : "bg-white/60"
            )}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
