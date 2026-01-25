import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      className="button-secondary button-secondary-sm"
      onClick={() => void signOut()}
    >
      Sign out
    </button>
  );
}
