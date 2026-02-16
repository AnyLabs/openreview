/**
 * 设置弹窗组件 - 独立的配置弹窗
 * 包含完整的打开/关闭功能、表单验证和数据提交处理
 */

import { useEffect, useCallback } from "react";
import { X, Settings } from "lucide-react";
import { SettingsForm } from "./SettingsForm";

interface SettingsModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  // 处理 ESC 键关闭
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  // 监听键盘事件
  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // 禁止背景滚动
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // 处理遮罩层点击关闭
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // 处理表单提交成功
  const handleSubmitSuccess = () => {
    // 可以在这里添加成功提示，或者自动关闭弹窗
    // onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="settings-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="settings-modal-container">
        {/* 弹窗头部 */}
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            <Settings size={18} />
            <h2 id="settings-modal-title">系统配置</h2>
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="settings-modal-body">
          <SettingsForm onSubmitSuccess={handleSubmitSuccess} />
        </div>
      </div>
    </div>
  );
}
