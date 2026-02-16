/**
 * 应用状态 Context
 * 提供全局状态共享
 */

import { createContext, useContext, type ReactNode } from "react";
import {
  useAppState,
  type AppState,
  type AppStateActions,
} from "../hooks/useAppState";

/** Context 类型 */
type AppContextType = [AppState, AppStateActions];

/** 创建 Context */
const AppContext = createContext<AppContextType | null>(null);

/** Provider 组件 */
export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** 使用应用状态的 Hook */
export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
