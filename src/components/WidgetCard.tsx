"use client";

import { ReactNode } from "react";
import { GripVertical, RefreshCw } from "lucide-react";
import clsx from "clsx";

interface WidgetCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  headerRight?: ReactNode;
  dragHandleClass?: string;
  editMode?: boolean;
}

export default function WidgetCard({
  title,
  children,
  className,
  loading,
  error,
  onRefresh,
  headerRight,
  dragHandleClass = "drag-handle",
  editMode = false,
}: WidgetCardProps) {
  return (
    <div
      className={clsx(
        "flex flex-col h-full bg-meraki-card border border-meraki-border rounded-xl overflow-hidden shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-meraki-border shrink-0">
        <span
          className={clsx(
            dragHandleClass,
            editMode
              ? "cursor-grab active:cursor-grabbing text-meraki-muted hover:text-meraki-text transition-colors"
              : "text-meraki-border pointer-events-none"
          )}
          aria-hidden="true"
        >
          <GripVertical size={14} />
        </span>
        <h3 className="text-sm font-semibold text-meraki-text flex-1 truncate">{title}</h3>
        <div className="flex items-center gap-2">
          {headerRight}
          {onRefresh && (
            <button
              onClick={() => onRefresh()}
              className="text-meraki-muted hover:text-meraki-primary transition-colors p-1"
              aria-label={`Refresh ${title}`}
            >
              <RefreshCw size={13} className={clsx(loading && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 relative">
        {loading && !error && (
          <div
            role="status"
            aria-label="Loading"
            className="absolute inset-0 flex items-center justify-center bg-meraki-card/80 z-10"
          >
            <div aria-hidden="true" className="w-5 h-5 border-2 border-meraki-primary border-t-transparent rounded-full animate-spin" />
            <span className="sr-only">Loading…</span>
          </div>
        )}
        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-meraki-card z-10">
            <p className="text-meraki-red text-sm">{error}</p>
            {onRefresh && (
              <button
                onClick={() => onRefresh()}
                className="text-xs text-meraki-primary hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
