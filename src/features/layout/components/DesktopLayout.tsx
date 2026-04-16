import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 260;
const RIGHT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MAX_WIDTH = 400;
const RIGHT_PANEL_DEFAULT_WIDTH = 300;

type ResizeTarget = "sidebar" | "right-panel" | null;

interface DesktopLayoutProps {
  /** 左侧栏节点 */
  sidebarNode: ReactNode;
  /** 主区域节点 */
  mainNode: ReactNode;
  /** 右侧面板组件（必须是组件类型，以便在 Provider 内部渲染） */
  rightPanelComponent: ComponentType<Record<string, never>>;
}

interface ResizeState {
  /** 当前正在拖拽的目标 */
  target: ResizeTarget;
  /** 指针 ID，用于绑定和释放指针捕获 */
  pointerId: number | null;
}

/**
 * 将宽度限制在给定范围内，避免拖拽后挤压主内容区。
 */
function clampWidth(width: number, min: number, max: number): number {
  return Math.min(Math.max(width, min), max);
}

/**
 * 桌面端三栏布局组件
 * 布局比例：左侧栏(1) : 主区域(3) : 右侧栏(1)
 */
export function DesktopLayout({
  sidebarNode,
  mainNode,
  rightPanelComponent: RightPanelComponent,
}: DesktopLayoutProps) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(
    RIGHT_PANEL_DEFAULT_WIDTH
  );
  const [resizeState, setResizeState] = useState<ResizeState>({
    target: null,
    pointerId: null,
  });

  /**
   * 根据当前指针位置计算并更新目标栏位宽度。
   */
  const updatePanelWidth = useCallback(
    (clientX: number, target: Exclude<ResizeTarget, null>) => {
      const layoutRect = layoutRef.current?.getBoundingClientRect();
      if (!layoutRect) {
        return;
      }

      if (target === "sidebar") {
        const nextWidth = clampWidth(
          clientX - layoutRect.left,
          SIDEBAR_MIN_WIDTH,
          SIDEBAR_MAX_WIDTH
        );
        setSidebarWidth(nextWidth);
        return;
      }

      const nextWidth = clampWidth(
        layoutRect.right - clientX,
        RIGHT_PANEL_MIN_WIDTH,
        RIGHT_PANEL_MAX_WIDTH
      );
      setRightPanelWidth(nextWidth);
    },
    []
  );

  /**
   * 开始拖拽指定栏位。
   */
  const handleResizeStart = useCallback(
    (target: Exclude<ResizeTarget, null>) => {
      return (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizeState({
          target,
          pointerId: event.pointerId,
        });
        updatePanelWidth(event.clientX, target);
      };
    },
    [updatePanelWidth]
  );

  /**
   * 结束当前拖拽状态。
   */
  const stopResizing = useCallback(() => {
    setResizeState({
      target: null,
      pointerId: null,
    });
  }, []);

  useEffect(() => {
    if (resizeState.target === null) {
      return;
    }

    /**
     * 在全局指针移动时同步更新宽度，保证拖拽过程持续跟随。
     */
    const handlePointerMove = (event: PointerEvent) => {
      updatePanelWidth(event.clientX, resizeState.target!);
    };

    /**
     * 在指针释放或被系统取消时结束拖拽。
     */
    const handlePointerFinish = () => {
      stopResizing();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
    };
  }, [resizeState.target, stopResizing, updatePanelWidth]);

  const layoutStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--sidebar-width": `${sidebarWidth}px`,
        "--right-panel-width": `${rightPanelWidth}px`,
      }) as CSSProperties,
    [rightPanelWidth, sidebarWidth]
  );

  return (
    <div
      ref={layoutRef}
      className={`app-layout ${
        resizeState.target !== null ? "is-resizing" : ""
      }`}
      style={layoutStyle}
    >
      {/* 左侧栏 */}
      {sidebarNode}

      {/* 左侧分割条 */}
      <div
        className={`resizer ${
          resizeState.target === "sidebar" ? "is-active" : ""
        }`}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={Math.round(sidebarWidth)}
        onPointerDown={handleResizeStart("sidebar")}
        onPointerUp={stopResizing}
      />

      {/* 主区域 */}
      <section className="main-content">{mainNode}</section>

      {/* 右侧分割条 */}
      <div
        className={`resizer ${
          resizeState.target === "right-panel" ? "is-active" : ""
        }`}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整右侧面板宽度"
        aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
        aria-valuemax={RIGHT_PANEL_MAX_WIDTH}
        aria-valuenow={Math.round(rightPanelWidth)}
        onPointerDown={handleResizeStart("right-panel")}
        onPointerUp={stopResizing}
      />

      {/* 右侧面板 - 在这里渲染组件，确保在 Provider 上下文内 */}
      <RightPanelComponent />
    </div>
  );
}
