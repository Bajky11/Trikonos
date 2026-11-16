// Transient, non-sensitive UI notice survives the protected-route logout redirect.
let passwordChanged = false;
export function markPasswordChanged() {
  passwordChanged = true;
}
export function passwordChangeNotice() {
  return passwordChanged;
}
export function clearPasswordChangeNotice() {
  passwordChanged = false;
}
