import { SignUp } from "@clerk/clerk-react";
import { AuthLayout } from "./AuthLayout";
import { clerkAuthPageAppearance } from "./clerkAppearance";

export default function SignUpPage() {
  return (
    <AuthLayout>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
        appearance={clerkAuthPageAppearance}
      />
    </AuthLayout>
  );
}
