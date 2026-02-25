/**
 * 平台客户端 Context
 * 提供当前活跃的 PlatformAdapter 实例
 */

import { createContext, useContext, type ReactNode } from "react";
import type { PlatformAdapter } from "../services/platform/types";

/** Context 类型 */
type PlatformContextType = PlatformAdapter | null;

/** 创建 Context */
const PlatformContext = createContext<PlatformContextType>(null);

/** Provider 组件 */
export function PlatformProvider({
  children,
  adapter,
}: {
  children: ReactNode;
  adapter: PlatformAdapter | null;
}) {
  return (
    <PlatformContext.Provider value={adapter}>
      {children}
    </PlatformContext.Provider>
  );
}

/** 使用平台适配器的 Hook */
export function usePlatformAdapter(): PlatformAdapter | null {
  return useContext(PlatformContext);
}

/** 使用平台适配器的 Hook（非空断言） */
export function requirePlatformAdapter(): PlatformAdapter {
  const adapter = useContext(PlatformContext);
  if (!adapter) {
    throw new Error("平台适配器未初始化，请先配置并连接 Git 平台");
  }
  return adapter;
}
