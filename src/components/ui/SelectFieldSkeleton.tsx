/**
 * 选择字段骨架屏组件
 * 用于模拟 Select 控件加载时的占位效果，防止布局坍塌
 */

interface SelectFieldSkeletonProps {
  /** 字段数量，默认 2 */
  fieldCount?: number;
  /** 选择框高度，默认 40px */
  selectHeight?: number;
  /** 是否显示标签骨架，默认 true */
  showLabel?: boolean;
  /** 自定义类名 */
  className?: string;
}

export function SelectFieldSkeleton({
  fieldCount = 2,
  selectHeight = 40,
  showLabel = true,
  className = "",
}: SelectFieldSkeletonProps) {
  return (
    <div className={`select-fields-skeleton ${className}`}>
      {Array.from({ length: fieldCount }).map((_, index) => (
        <div
          key={index}
          className="skeleton-field"
        >
          {showLabel && <div className="skeleton-label" />}
          <div
            className="skeleton-select"
            style={{ height: `${selectHeight}px` }}
          />
        </div>
      ))}
    </div>
  );
}
