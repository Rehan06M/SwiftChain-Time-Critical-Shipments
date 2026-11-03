
import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

interface Props {
  onError: (message: string) => void;
}

export default function GoogleSignInButton({
  onError,
}: Props) {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <div className="google-auth">
      <div className="auth-divider">
        <span>OR CONTINUE WITH</span>
      </div>

      <div className="google-button-wrap">
        <GoogleLogin
          theme="outline"
          size="large"
          shape="rectangular"
          text="continue_with"
          width="320"
          onSuccess={async (response) => {
            if (!response.credential || busy) {
              return;
            }

            setBusy(true);
            onError("");

            try {
              await googleLogin(response.credential);

              navigate("/dashboard", {
                replace: true,
              });
            } catch (error) {
              onError(
                error instanceof Error
                  ? error.message
                  : "Google sign-in failed"
              );
            } finally {
              setBusy(false);
            }
          }}
          onError={() => {
            onError(
              "Google authentication was cancelled or failed."
            );
          }}
        />
      </div>

      {busy && (
        <p className="google-status">
          Signing in with Google...
        </p>
      )}
    </div>
  );
}
