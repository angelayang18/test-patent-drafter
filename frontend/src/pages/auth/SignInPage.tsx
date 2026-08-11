import { SignIn } from "@clerk/clerk-react";
import { AuthLayout } from "./AuthLayout";
import { clerkAuthPageAppearance } from "./clerkAppearance";

export default function SignInPage() {
  return (
    <AuthLayout>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        appearance={clerkAuthPageAppearance}
      />
    </AuthLayout>
  );
}
