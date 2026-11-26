import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "@mui/material";
import {
  ordersAccessCardPaymentCreate,
  ordersAccessCardPaymentRetrieve,
} from "../api/generated/api";
import { withCsrf } from "../auth/csrf";

const requestOptions = { cache: "no-store", referrerPolicy: "no-referrer" } as const;

export function CardPayment({ token }: { token: string }) {
  const client = useQueryClient();
  const key = ["comgate-card-payment", token];
  const encodedToken = encodeURIComponent(token);
  const payment = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      ordersAccessCardPaymentRetrieve(encodedToken, { ...requestOptions, signal }),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const start = useMutation({
    mutationFn: () => withCsrf(() => ordersAccessCardPaymentCreate(encodedToken, requestOptions)),
    retry: false,
    onSuccess: (result) => {
      client.setQueryData(key, result);
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    },
    onError: () => void payment.refetch(),
  });
  const state = payment.data?.state;
  const redirect = payment.data?.redirectUrl;

  return (
    <section aria-label="Testovací platba Comgate">
      <Alert severity="info">Testovací platba. Skutečná částka se nestrhne.</Alert>
      {state === "NOT_STARTED" && !payment.isError && (
        <Button
          variant="contained"
          disabled={start.isPending || payment.isFetching}
          onClick={() => start.mutate()}
        >
          {start.isPending ? "Připojujeme se k Comgate…" : "Přejít na testovací platbu Comgate"}
        </Button>
      )}
      {state === "PENDING" && <p>Comgate zatím nepotvrdila výsledek testovací platby.</p>}
      {state === "PENDING" && redirect && !payment.isError && (
        <Button href={redirect} rel="noreferrer">
          Pokračovat na existující platbu
        </Button>
      )}
      {state === "PAID" && (
        <Alert severity="success">
          Testovací platba se zdařila. Objednávka nebyla skutečně uhrazena.
        </Alert>
      )}
      {state === "CANCELLED" && (
        <Alert severity="warning">Testovací platba nebyla dokončena.</Alert>
      )}
      {state === "UNKNOWN" && (
        <Alert severity="warning">
          Založení platby zatím není potvrzené. Objednávku neposílejte znovu; pokud se stav nezmění,
          kontaktujte obchod.
        </Alert>
      )}
      {(payment.isError || start.isError) && (
        <Alert severity="warning">
          Testovací platbu se nepodařilo ověřit. Objednávka už byla přijata, neposílejte ji znovu.
        </Alert>
      )}
      {payment.isFetching && <p role="status">Ověřujeme stav testovací platby…</p>}
      {(payment.isError || state === "PENDING" || state === "UNKNOWN") && (
        <Button
          disabled={payment.isFetching || start.isPending}
          onClick={() => void payment.refetch()}
        >
          Ověřit stav platby
        </Button>
      )}
    </section>
  );
}
