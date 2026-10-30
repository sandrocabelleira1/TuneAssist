# Payment security migration

This change requires a coordinated deployment. Do not treat a source commit as proof of protection in production.

- The runtime service account needs permission to read Firebase Authentication users and read/write the Firestore profiles and payment receipts. Use Application Default Credentials; never commit a service account key.
- Configure MERCADO_PAGO_ACCESS_TOKEN as an App Hosting secret and NEXT_PUBLIC_SITE_URL as the canonical HTTPS origin.
- Publish firestore.rules: client writes to user profiles are denied. Server transactions own credits, expiry and paymentReceipts.
- Verify authentication, wrong-account payments, altered amounts, duplicate confirmation, insufficient credits and the existing cloud backup flow before release.
- Existing credits and expiry values may have been edited under the old rules. Reconcile them with payment records before trusting them.
- The browser no longer retains registration passwords. Account creation precedes checkout. An interrupted checkout leaves an account without a license; sign in and renew to finish.
- Payment confirmation currently runs when the signed-in purchaser opens the return URL. An interrupted return needs a retry using the payment ID. Webhook reconciliation and refund revocation remain future work.
- Local BIN editing happens in the browser. Public source can be modified to bypass the download UI; this cannot be used as a tamper-proof commercial license mechanism.

## History audit scope

The initial review fetched all 1,300 commit diffs successfully and found no matches for the selected credential patterns. A separate full historical blob review is required because GitHub diffs may omit or truncate content. Firebase web configuration and public image download URLs are not server credentials.

## Validation status

Three mocked payment route security tests passed. Full typecheck/build and dependency remediation are not complete. npm audit reported 29 vulnerabilities (including two critical) before the attempted Next update. Do not merge or publish until these checks and live Firebase rule verification are complete.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for user profiles by denying client writes to paid entitlements. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
