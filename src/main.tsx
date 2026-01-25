import { createRoot } from "react-dom/client";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import "./index.css";
import App from "./App";

const {
  VITE_CONVEX_URL,
  VITE_WORKOS_CLIENT_ID,
  VITE_WORKOS_REDIRECT_URI,
} = import.meta.env;

const convex = new ConvexReactClient(VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <AuthKitProvider
    clientId={VITE_WORKOS_CLIENT_ID}
    redirectUri={VITE_WORKOS_REDIRECT_URI}
  >
    <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
      <App />
    </ConvexProviderWithAuthKit>
  </AuthKitProvider>,
);
