import type { ReactNode, MouseEvent, ComponentType } from "react";

interface DesktopLayoutProps {
  /** 左侧栏节点 */
  sidebarNode: ReactNode;
  /** 主区域节点 */
  mainNode: ReactNode;
  /** 右侧面板组件（必须是组件类型，以便在 Provider 内部渲染） */
  rightPanelComponent: ComponentType<Record<string, never>>;
  /** 侧边栏拖拽调整开始 */
  onSidebarResizeStart?: (event: MouseEvent<HTMLDivElement>) => void;
  /** 右侧面板拖拽调整开始 */
  onRightPanelResizeStart?: (event: MouseEvent<HTMLDivElement>) => void;
}

/**
 * 桌面端三栏布局组件
 * 布局比例：左侧栏(1) : 主区域(3) : 右侧栏(1)
 */
export function DesktopLayout({
  sidebarNode,
  mainNode,
  rightPanelComponent: RightPanelComponent,
  onSidebarResizeStart,
  onRightPanelResizeStart,
}: DesktopLayoutProps) {
  return (
    <div className="app-layout">
      {/* 左侧栏 */}
      {sidebarNode}

      {/* 左侧分割条 */}
      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        onMouseDown={onSidebarResizeStart}
      />

      {/* 主区域 */}
      <section className="main-content">{mainNode}</section>

      {/* 右侧分割条 */}
      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整右侧面板宽度"
        onMouseDown={onRightPanelResizeStart}
      />

      {/* 右侧面板 - 在这里渲染组件，确保在 Provider 上下文内 */}
      <RightPanelComponent />
    </div>
  );
}
