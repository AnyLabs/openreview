/**
 * TogglePanel 可折叠面板组件
 * 用于Diff文件列表、侧边栏等场景的可展开/折叠面板
 * 支持头部右侧显示操作按钮或统计信息
 */

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface TogglePanelProps {
  /** 面板头部左侧内容 */
  header: ReactNode;
  /** 面板头部右侧额外内容（如统计信息、操作按钮） */
  headerActions?: ReactNode;
  /** 面板内容 */
  children: ReactNode;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 展开状态变化回调 */
  onToggle?: (expanded: boolean) => void;
  /** 自定义类名 */
  className?: string;
  /** 面板标识（用于受控模式） */
  id?: string;
  /** 折叠时是否卸载内容（用于优化大列表滚动性能） */
  unmountWhenCollapsed?: boolean;
}

export function TogglePanel({
  header,
  headerActions,
  children,
  defaultExpanded = true,
  onToggle,
  className = "",
  id,
  unmountWhenCollapsed = false,
}: TogglePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const shouldRenderContent = expanded || !unmountWhenCollapsed;

  // 同步外部传入的 defaultExpanded 变化
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  // 计算内容高度用于动画
  useEffect(() => {
    if (!shouldRenderContent || !contentRef.current) {
      setContentHeight(0);
      return;
    }

    const updateHeight = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(contentRef.current);

    return () => resizeObserver.disconnect();
  }, [shouldRenderContent, children]);

  // 切换展开状态
  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onToggle?.(newExpanded);
  };

  const panelId =
    id || `toggle-panel-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div
      className={`toggle-panel ${
        expanded ? "expanded" : "collapsed"
      } ${className}`}
    >
      {/* 面板头部 */}
      <button
        className="toggle-panel-header"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={`${panelId}-content`}
      >
        <div className="toggle-panel-header-left">
          <span className="toggle-panel-chevron">
            <ChevronRight size={14} />
          </span>
          <div className="toggle-panel-header-content">{header}</div>
        </div>
        {headerActions && (
          <div
            className="toggle-panel-header-actions"
            onClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </button>

      {/* 面板内容 */}
      <div
        id={`${panelId}-content`}
        className="toggle-panel-content"
        style={{
          height: expanded ? contentHeight : 0,
          overflow: "hidden",
        }}
      >
        {shouldRenderContent && (
          <div
            ref={contentRef}
            className="toggle-panel-inner"
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
