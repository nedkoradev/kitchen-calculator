/**
 * Request the Google account chooser on every explicit NED-IQ v3 sign-in.
 * A fresh provider avoids carrying OAuth parameters between popup attempts.
 * Firebase Auth session restoration on an ordinary reload is unchanged.
 */
export function createGoogleAccountChoiceProvider(GoogleAuthProvider) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt: 'select_account'});
  return provider;
}
