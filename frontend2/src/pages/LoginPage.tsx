import { LoginForm } from "../auth/LoginForm";
import { useTitle } from "../useTitle";

export function LoginPage() {
  useTitle("Přihlášení do administrace");
  return (
    <main className="shell page-main">
      <h1>Přihlášení do administrace</h1>
      <LoginForm />
    </main>
  );
}
