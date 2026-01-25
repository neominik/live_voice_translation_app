import { useAuth } from "@workos-inc/authkit-react";

export function SignInForm() {
  const { signIn } = useAuth();

  return (
    <div className="w-full">
      <div className="flex flex-col gap-form-field">
        <button className="auth-button" onClick={() => void signIn()}>
          Sign in
        </button>
        <p className="text-center text-sm text-slate-400">
          Sign in to continue.
        </p>
      </div>
    </div>
  );
}
