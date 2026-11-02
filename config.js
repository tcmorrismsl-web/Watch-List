// Watch List settings. Edit this file on GitHub (pencil icon), then commit.
// See SETUP.md for where each value comes from.
window.WATCHLIST_CONFIG = {
  // Firebase web app config, for sign-in, syncing between phones, and the shared list.
  // These values are meant to be public; your Firestore rules are what protect your data.
  // Leave them blank and the app still works, saving to one browser only.
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: ""
  },

  // Optional. Leave blank and paste your TMDB key in the app's Settings instead,
  // which keeps it out of this public repo. Once saved there, it's shared with
  // everyone on your shared list automatically.
  tmdbKey: ""
};
