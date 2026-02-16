/**
 * 可折叠面板组件
 * 现代化设计的可展开/折叠面板，带有平滑动画效果
 */

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface CollapsiblePanelProps {
  /** 面板标题 */
  title: string;
  /** 标题图标 */
  icon?: ReactNode;
  /** 面板内容 */
  children: ReactNode;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 右侧额外内容（如计数器） */
  badge?: ReactNode;
  /** 展开状态变化回调 */
  onToggle?: (expanded: boolean) => void;
  /** 自定义类名 */
  className?: string;
}

export function CollapsiblePanel({
  title,
  icon,
  children,
  defaultExpanded = true,
  badge,
  onToggle,
  className = "",
}: CollapsiblePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | "auto">("auto");

  // 同步外部传入的 defaultExpanded 变化（受控模式支持）
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  // 计算内容高度用于动画
  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current && expanded) {
          setContentHeight(contentRef.current.scrollHeight);
        }
      });
      resizeObserver.observe(contentRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [expanded]);

  // 切换展开状态
  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onToggle?.(newExpanded);
  };

  return (
    <div
      className={`collapsible-panel ${
        expanded ? "expanded" : "collapsed"
      } ${className}`}
    >
      {/* 面板头部 */}
      <button
        className="collapsible-panel-header"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={`panel-content-${title}`}
      >
        <div className="collapsible-panel-header-left">
          <span className="collapsible-panel-chevron">
            <ChevronRight size={14} />
          </span>
          {icon && <span className="collapsible-panel-icon">{icon}</span>}
          <span className="collapsible-panel-title">{title}</span>
        </div>
        {badge && <div className="collapsible-panel-badge">{badge}</div>}
      </button>

      {/* 面板内容 */}
      <div
        id={`panel-content-${title}`}
        className="collapsible-panel-content"
        style={{
          height: expanded ? contentHeight : 0,
          overflow: "hidden",
        }}
      >
        <div
          ref={contentRef}
          className="collapsible-panel-inner"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
