import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "@mui/material";
import { useSession } from "./session";

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending)
    return (
      <p role="status" className="loading-page">
        Ověřování přihlášení…
      </p>
    );
  if (session.isError)
    return (
      <main className="shell page-main">
        <p role="alert">Přihlášení se nepodařilo ověřit. Zkontrolujte spojení a zkuste to znovu.</p>
        <Button onClick={() => void session.refetch()}>Zkusit znovu</Button>
      </main>
    );
  if (!session.data)
    return (
      <Navigate
        to="/prihlaseni"
        replace
        state={{
          from: location.pathname + location.search + location.hash,
        }}
      />
    );
  return <Outlet context={session.data} />;
}
