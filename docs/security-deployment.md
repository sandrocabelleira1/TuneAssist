# Payment security and deployment

The server authenticates Firebase ID tokens, uses a fixed price catalog and reads the payment directly from Mercado Pago. Credits and licenses are granted only for approved live BRL payments belonging to the authenticated account, with the expected amount and no recorded refund. A Firestore transaction records the payment ID once to prevent duplicate grants. Credit deductions also use a server transaction.

Client writes to user profiles and payment receipts are denied. Users can read their own profile and manage the existing owned backup collections. The Firebase Storage bucket is explicitly configured from the project's registered web application.

## Validation on 2026-10-30

- Next.js 15.5.28 production build completed successfully, with TypeScript errors enabled.
- npm audit: 0 low, moderate, high or critical vulnerabilities in the final lockfile.
- Three payment route security tests passed, including rejection of test-mode payments and replay protection.
- Ten Firebase Rules service tests passed: own profile read, foreign/anonymous denial, credit/license/profile write denial, backup ownership and forged receipt denial.
- The published Firestore rules were fetched again and matched the tested source.
- Local production HTTP checks passed for the release marker, disabled unconfigured checkout, three unauthenticated payment endpoints (401), and tuner HTML (200).
- Lint is not configured as a release check and was not claimed as passing.

## Runtime configuration

Use Node.js 22 or a compatible newer release for local development. App Hosting selects Node.js 22 from package.json. Runtime credentials use Application Default Credentials; no service account key is stored in source. The existing runtime account has the Firebase SDK Admin Service Agent and App Hosting Compute Runner roles.

The canonical callback origin is the existing hosted.app address. The tuneia.tech custom-domain entry is preserved. Configure MERCADO_PAGO_ACCESS_TOKEN in Secret Manager and reference it in apphosting.yaml with RUNTIME availability before enabling checkout. No Mercado Pago token or corresponding secret existed in the inspected backend. Until configured, checkout returns unavailable and registration checks availability before creating an account. Existing users can still sign in.

Compatible overrides update PostCSS, gRPC and the selector parser without migrating the application to Next.js 16. Keep the lockfile and rerun the audit and build when changing these overrides.

## Operational limits

Existing credits and expiry values may have been modified under the old rules; reconcile them with payment records before trusting them. No customer balances were rewritten during this change.

Payment confirmation runs when the signed-in purchaser opens the return URL. An interrupted return requires a retry using the payment ID. Webhook reconciliation and revocation after later refunds remain future work.

Local BIN editing runs in the browser. Public source can be changed to bypass the download interface. This is not a tamper-proof commercial licensing mechanism.

## History audit scope

The original 1,300 commit diffs were searched. All 2,008 unique historical blobs were enumerated and the 2,006 text versions were searched with selected payment-token, personal-access-token, private-key and secret-assignment patterns; two icon assets were excluded. No pattern matches or fetch errors were reported. Pattern matching cannot prove that no secrets exist in unrecognized formats. Firebase web configuration and public image URLs are not server credentials.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for user profiles by denying client writes to paid entitlements. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
