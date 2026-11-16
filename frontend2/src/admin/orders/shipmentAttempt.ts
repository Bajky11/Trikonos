const prefix = "trikonos-shipment-attempt-v1:";

// Only an order UUID and timestamp; never addresses, credentials or request bodies.
export function shipmentAttemptKey(id: string) {
  return `${prefix}${id}`;
}
export function hasShipmentAttempt(id: string) {
  return localStorage.getItem(shipmentAttemptKey(id)) !== null;
}
export function startShipmentAttempt(id: string) {
  if (hasShipmentAttempt(id))
    throw new Error("Nejprve ověřte původní pokus o vytvoření zásilky u Packety.");
  localStorage.setItem(shipmentAttemptKey(id), String(Date.now()));
}
export function clearShipmentAttempt(id: string) {
  localStorage.removeItem(shipmentAttemptKey(id));
}
