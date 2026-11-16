import { LoginForm } from "../auth/LoginForm";
import { useTitle } from "../useTitle";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { clearPasswordChangeNotice, passwordChangeNotice } from "../auth/notice";

export function LoginPage() {
  useTitle("Přihlášení do administrace");
  const location = useLocation();
  const [changed] = useState(passwordChangeNotice);
  useEffect(() => clearPasswordChangeNotice(), []);
  return (
    <main className="shell page-main">
      <h1>Přihlášení do administrace</h1>
      {(changed || location.state?.passwordChanged) && (
        <p role="status">Heslo bylo změněné. Přihlaste se novým heslem.</p>
      )}
      <LoginForm />
    </main>
  );
}
