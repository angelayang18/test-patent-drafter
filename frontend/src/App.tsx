import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PatentWorkflowProvider } from "./context/PatentWorkflowContext";
import { GrantWorkflowProvider } from "./context/GrantWorkflowContext";
import InputPage from "./pages/Input";
import Draft from "./pages/Draft";
import Figures from "./pages/Figures";
import Review from "./pages/Review";
import Export from "./pages/Export";
import GrantLanding from "./pages/grant/GrantLanding";
import GrantInput from "./pages/grant/GrantInput";
import GrantReview from "./pages/grant/GrantReview";
import GrantDraft from "./pages/grant/GrantDraft";
import GrantExport from "./pages/grant/GrantExport";

export default function App() {
  return (
    <PatentWorkflowProvider>
      <GrantWorkflowProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<InputPage />} />
            <Route path="/review" element={<Review />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/figures" element={<Figures />} />
            <Route path="/export" element={<Export />} />

            <Route path="/grant" element={<GrantLanding />} />
            <Route path="/grant/input" element={<GrantInput />} />
            <Route path="/grant/review" element={<GrantReview />} />
            <Route path="/grant/draft" element={<GrantDraft />} />
            <Route path="/grant/export" element={<GrantExport />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </GrantWorkflowProvider>
    </PatentWorkflowProvider>
  );
}
