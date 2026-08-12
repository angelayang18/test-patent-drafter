import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import SignInPage from "./pages/auth/SignInPage";
import SignUpPage from "./pages/auth/SignUpPage";
import { PatentWorkflowProvider } from "./context/PatentWorkflowContext";
import { GrantWorkflowProvider } from "./context/GrantWorkflowContext";
import { SowWorkflowProvider } from "./context/SowWorkflowContext";
import { AdaWorkflowProvider } from "./context/AdaWorkflowContext";
import Home from "./pages/Home";
import SharedDocumentTypes from "./pages/SharedDocumentTypes";
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
import GrantFigures from "./pages/grant/GrantFigures";
import SowLanding from "./pages/sow/SowLanding";
import SowInput from "./pages/sow/SowInput";
import SowReview from "./pages/sow/SowReview";
import SowDraft from "./pages/sow/SowDraft";
import SowFigures from "./pages/sow/SowFigures";
import SowExport from "./pages/sow/SowExport";
import AdaLanding from "./pages/ada/AdaLanding";
import AdaInput from "./pages/ada/AdaInput";
import AdaReview from "./pages/ada/AdaReview";
import AdaDraft from "./pages/ada/AdaDraft";
import AdaFigures from "./pages/ada/AdaFigures";
import AdaExport from "./pages/ada/AdaExport";
import GenericWorkflowLayout from "./pages/generic/GenericWorkflowLayout";
import GenericInput from "./pages/generic/GenericInput";
import GenericReview from "./pages/generic/GenericReview";
import GenericDraft from "./pages/generic/GenericDraft";
import GenericFigures from "./pages/generic/GenericFigures";
import GenericExport from "./pages/generic/GenericExport";

export default function App() {
  return (
    <PatentWorkflowProvider>
      <GrantWorkflowProvider>
        <SowWorkflowProvider>
          <AdaWorkflowProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/sign-in/*" element={<SignInPage />} />
                <Route path="/sign-up/*" element={<SignUpPage />} />

                <Route
                  element={
                    <RequireAuth>
                      <Outlet />
                    </RequireAuth>
                  }
                >
                  <Route path="/" element={<Home />} />
                  <Route path="/shared-document-types" element={<SharedDocumentTypes />} />

                  <Route path="/patent" element={<InputPage />} />
                  <Route path="/patent/review" element={<Review />} />
                  <Route path="/patent/draft" element={<Draft />} />
                  <Route path="/patent/figures" element={<Figures />} />
                  <Route path="/patent/export" element={<Export />} />

                  <Route path="/review" element={<Navigate to="/patent/review" replace />} />
                  <Route path="/draft" element={<Navigate to="/patent/draft" replace />} />
                  <Route path="/figures" element={<Navigate to="/patent/figures" replace />} />
                  <Route path="/export" element={<Navigate to="/patent/export" replace />} />

                  <Route path="/grant" element={<GrantLanding />} />
                  <Route path="/grant/input" element={<GrantInput />} />
                  <Route path="/grant/review" element={<GrantReview />} />
                  <Route path="/grant/draft" element={<GrantDraft />} />
                  <Route path="/grant/figures" element={<GrantFigures />} />
                  <Route path="/grant/export" element={<GrantExport />} />

                  <Route path="/sow" element={<SowLanding />} />
                  <Route path="/sow/input" element={<SowInput />} />
                  <Route path="/sow/review" element={<SowReview />} />
                  <Route path="/sow/draft" element={<SowDraft />} />
                  <Route path="/sow/figures" element={<SowFigures />} />
                  <Route path="/sow/export" element={<SowExport />} />

                  <Route path="/ada" element={<AdaLanding />} />
                  <Route path="/ada/input" element={<AdaInput />} />
                  <Route path="/ada/review" element={<AdaReview />} />
                  <Route path="/ada/draft" element={<AdaDraft />} />
                  <Route path="/ada/figures" element={<AdaFigures />} />
                  <Route path="/ada/export" element={<AdaExport />} />

                  <Route path="/custom/:templateId" element={<GenericWorkflowLayout />}>
                    <Route index element={<Navigate to="input" replace />} />
                    <Route path="input" element={<GenericInput />} />
                    <Route path="review" element={<GenericReview />} />
                    <Route path="draft" element={<GenericDraft />} />
                    <Route path="figures" element={<GenericFigures />} />
                    <Route path="export" element={<GenericExport />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AdaWorkflowProvider>
        </SowWorkflowProvider>
      </GrantWorkflowProvider>
    </PatentWorkflowProvider>
  );
}
