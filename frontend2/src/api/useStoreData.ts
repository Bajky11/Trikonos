import { useCatalogOptionsRetrieve, useConfigRetrieve } from "./generated/api";

// Bootstrap public data once per QueryClient. Keep the same generated query keys
// when reusing these endpoints in the configurator and checkout later.
export function useStoreData() {
  const config = useConfigRetrieve();
  const options = useCatalogOptionsRetrieve();
  return { config, options };
}
