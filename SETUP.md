# Setting up Watch List

About 15 minutes, once. Everything here is free and needs no credit card.

Your site: **https://tcmorrismsl-web.github.io/Watch-List/**

## 0. Turn on the website

1. On GitHub, open the repo and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
3. Wait a minute or two, then open the site address above. It works right away, saving to that one browser, until you finish the steps below.

## 1. Get a TMDB key (posters, seasons, categories, where to stream)

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup).
2. Go to **Settings → API** ([direct link](https://www.themoviedb.org/settings/api)) and request a key. Choose **Developer**, say it's for a personal app, and fill in the short form. A website URL is required; use your site address above.
3. Copy either the **API Key** (short) or the **API Read Access Token** (long). Either one works.
4. Open your site, tap the gear icon, and paste it under **TMDB key**.

Once you're signed in and on a shared list, the key is shared with everyone on that list, so your wife doesn't need her own.

## 2. Create a Firebase project (sign-in, sync between phones, shared list)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project**. Name it `watch-list`. You can turn off Google Analytics.
2. **Turn on sign-in.** In the left menu, open **Build → Authentication → Get started**. Under **Sign-in method**, enable:
   - **Google** (pick your email as the support email)
   - **Email/Password**
3. **Allow your site to sign in.** Still in Authentication, open **Settings → Authorized domains → Add domain** and enter:
   `tcmorrismsl-web.github.io`
4. **Create the database.** Open **Build → Firestore Database → Create database**. Choose **Production mode** and a US location (for example `nam5` or `us-east1`).
5. **Add the security rules.** In Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules) from this repo, and click **Publish**.
6. **Get the web config.** Click the gear next to **Project Overview → Project settings**. Under **Your apps**, click the web icon `</>`, name it `Watch List`, and leave Firebase Hosting unchecked. Firebase shows a `firebaseConfig` block.
7. **Paste it into the app.** On GitHub, open [`config.js`](config.js), click the pencil icon, and fill in the four values from that block:
   ```js
   firebase: {
     apiKey: "AIza...",
     authDomain: "watch-list-xxxx.firebaseapp.com",
     projectId: "watch-list-xxxx",
     appId: "1:1234:web:abcd"
   },
   ```
   Click **Commit changes**. The site updates within a couple of minutes.

These Firebase values are designed to be public. The rules from step 5 are what keep each list private.

## 3. Start your shared list

1. Open the site and sign in.
2. Switch to **Our list** and tap **Start a shared list**.
3. Open Settings (gear icon). Your **invite code** is there; tap **Copy** and text it to your wife.
4. She opens the site on her phone, signs in with her own account, switches to **Our list**, enters the code, and taps **Join**.

From then on, you both see the same titles, episode progress, ratings and notes on Our list, live. **My list** stays private to each of you. To move a title between them, open it and tap **Move to Our list** (or **Move to My list**).

## 4. Put it on your home screen

On iPhone, open the site in Safari, tap **Share → Add to Home Screen**. It opens full screen like an app.

Pick one way to sign in (Google, or email and password) and use it on every device, so you always land on the same account. If Google sign-in won't open from the home-screen app, use email and password.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| "Firebase hasn't approved this site yet" | Step 2.3: add `tcmorrismsl-web.github.io` to Authorized domains. |
| "Turn on this sign-in method in Firebase" | Step 2.2: enable Google and Email/Password. |
| Signed in, but the list never loads or says it can't be reached | Step 2.5: publish the rules, and make sure the Firestore database exists. |
| "TMDB didn't accept that key" | Copy the key again from themoviedb.org/settings/api, with no spaces. |
| "No shared list matches that code" | Check the code. Letters O and I and digits 0 and 1 aren't used, so it's easy to read back. |
| Changes to config.js don't show up | Wait two minutes and reload. GitHub Pages caches for a short time. |
