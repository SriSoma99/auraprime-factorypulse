// Token storage on native: secure storage (02 section 12, Security). Web variant in token-store.web.ts.
import * as SecureStore from "expo-secure-store";
const KEY = "fp.session.token";
export const tokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (v: string) => SecureStore.setItemAsync(KEY, v),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
