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

import { AppProvider as BaseAppProvider } from "./contexts/AppContext";
import { FileAIReviewProvider } from "./contexts/FileAIReviewContext";
import { DesktopLayout } from "./features/layout/components/DesktopLayout";
import { Sidebar } from "./features/layout/components/Sidebar";
import { MainContent } from "./features/layout/components/MainContent";
import { RightPanel } from "./features/layout/components/RightPanel";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <BaseAppProvider>
        <FileAIReviewProvider>
          <DesktopLayout
            sidebarNode={<Sidebar />}
            mainNode={<MainContent />}
            rightPanelComponent={RightPanel}
          />
        </FileAIReviewProvider>
      </BaseAppProvider>
    </ThemeProvider>
  );
}

export default App;
