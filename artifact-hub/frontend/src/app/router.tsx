import { createBrowserRouter, Navigate } from "react-router-dom";
import { ViewSessionPage } from "../pages/ViewSessionPage";
import { ViewArtifactPage } from "../pages/ViewArtifactPage";
import { AdminLoginPage } from "../pages/AdminLoginPage";
import { AdminSessionsPage } from "../pages/AdminSessionsPage";
import { AdminSessionDetailPage } from "../pages/AdminSessionDetailPage";
import { AdminArtifactPage } from "../pages/AdminArtifactPage";
import { AdminApiKeysPage } from "../pages/AdminApiKeysPage";
import { AdminSystemPage } from "../pages/AdminSystemPage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/admin/sessions" replace /> },
  { path: "/v/:sessionId", element: <ViewSessionPage /> },
  { path: "/v/:sessionId/:artifactId", element: <ViewArtifactPage /> },
  { path: "/admin/login", element: <AdminLoginPage /> },
  { path: "/admin/sessions", element: <AdminSessionsPage /> },
  { path: "/admin/sessions/:sessionId", element: <AdminSessionDetailPage /> },
  { path: "/admin/artifacts/:artifactId", element: <AdminArtifactPage /> },
  { path: "/admin/api-keys", element: <AdminApiKeysPage /> },
  { path: "/admin/system", element: <AdminSystemPage /> }
]);
