import "./styles/base.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/forms.css";
import "./styles/diff.css";
import "./styles/ai-review.css";
import "./styles/collapsible-panel.css";
import "./styles/searchable-select.css";
import "./styles/settings-modal.css";
import "./styles/select-field-skeleton.css";
import "./styles/tree-list.css";

import { AppProvider, useApp } from "./contexts/AppContext";
import { PlatformProvider } from "./contexts/PlatformContext";
import { FileAIReviewProvider } from "./contexts/FileAIReviewContext";
import { DesktopLayout } from "./features/layout/components/DesktopLayout";
import { Sidebar } from "./features/layout/components/Sidebar";
import { MainContent } from "./features/layout/components/MainContent";
import { RightPanel } from "./features/layout/components/RightPanel";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  );
}

/** 应用内容组件 - 从 context 获取 activeAdapter */
function AppContent() {
  const [state] = useApp();

  return (
    <PlatformProvider adapter={state.activeAdapter}>
      <FileAIReviewProvider>
        <DesktopLayout
          sidebarNode={<Sidebar />}
          mainNode={<MainContent />}
          rightPanelComponent={RightPanel}
        />
      </FileAIReviewProvider>
    </PlatformProvider>
  );
}

export default App;
