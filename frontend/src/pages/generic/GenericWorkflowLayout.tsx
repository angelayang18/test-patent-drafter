import { Outlet } from "react-router-dom";
import { GenericWorkflowProvider } from "../../context/GenericWorkflowContext";

/** Layout route: mounts one GenericWorkflowProvider per `:templateId`. */
export default function GenericWorkflowLayout() {
  return (
    <GenericWorkflowProvider>
      <Outlet />
    </GenericWorkflowProvider>
  );
}
