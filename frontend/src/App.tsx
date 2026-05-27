import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PatentWorkflowProvider } from "./context/PatentWorkflowContext";
import InputPage from "./pages/Input";
import Draft from "./pages/Draft";
import Figures from "./pages/Figures";
import Review from "./pages/Review";
import Export from "./pages/Export";

export default function App() {
  return (
    <PatentWorkflowProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InputPage />} />
          <Route path="/review" element={<Review />} />
          <Route path="/draft" element={<Draft />} />
          <Route path="/figures" element={<Figures />} />
          <Route path="/export" element={<Export />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </PatentWorkflowProvider>
  );
}
