# KA Business — Deo Digital Solutions — Full Project Starter

This bundle builds a full digital-first business manager (PWA) using HTML/CSS/JS and Firebase. It includes:
- Sales, Expenses, Capital, Clients/Proposed
- Drafts, finalize flow, preview before export
- 80mm thermal receipt export (JPEG)
- A4 Invoice/Quote export (PDF)
- QR verification link, circular stamp (SVG)
- Realtime dashboards & reports (weekly/monthly/custom)
- PWA manifest & service worker
- Firestore & Storage security rules
- Cloud Functions templates for signing/verification (optional)

Important: You already provided Firebase config and enabled Auth, Firestore, Realtime DB. The frontend files include your firebaseConfig. Follow the steps below to deploy.

## Files delivered
- index.html
- styles.css
- app.js (contains firebaseConfig)
- manifest.json
- service-worker.js
- firestore.rules
- storage.rules
- functions/ (Cloud Functions template)
  - index.js
  - package.json

## Quick setup (frontend)
1. Put `index.html`, `styles.css`, `app.js`, `manifest.json`, `service-worker.js`, `logo.png` in your hosting folder (public/).
2. Ensure `app.js` has your firebaseConfig (already inserted).
3. In Firebase Console:
   - Enable Authentication (Email/Password).
   - Enable Firestore.
   - Enable Storage.
4. (Optional) Set up custom claims to mark owner/staff:
   - Using Admin SDK or Cloud Function set `role: 'owner'` for your account and `role: 'staff'` for staff accounts.
5. Deploy to Firebase Hosting:
   - `firebase init hosting` (if not done)
   - `firebase deploy --only hosting`

## Firestore Security Rules
- Open Firebase Console → Firestore → Rules and paste `firestore.rules`.
- These rules assume user custom claim `role` exists (`owner` | `staff`). Set claims using Admin SDK:
  - Example (Node.js admin):
    ```
    admin.auth().setCustomUserClaims(uid, { role: 'owner' });
    ```

## Storage Rules
- Paste `storage.rules` into Storage rules in the console.
- Upload `logo.png` to the hosting folder or to Storage `/logos/`.

## Cloud Functions (optional, recommended for tamper-evidence)
The functions template includes:
- `signDocument` (HTTP): compute SHA-256 of a stored file or received bytes, sign the hash using a private key from Secret Manager and write `pdfHash` and `signature` to Firestore under `documents/{docId}`.
- `verifyDocument` (HTTP): returns a document's stored pdfHash and signature metadata.

### Deploy Cloud Functions
1. Install Firebase CLI and initialize functions directory if not done.
2. Put `functions/index.js` and `functions/package.json` into your functions/ folder.
3. Run `npm install` inside functions/.
4. Create a Secret in Secret Manager with your signing private key (PEM) named e.g. `projects/<<PROJECT>>/secrets/SIGNING_KEY/versions/latest`.
5. Deploy:
   - `firebase deploy --only functions`
6. Update `app.js` finalization flow to call `signDocument` via fetch with the `docId` (function URL returned after deploy).

> Note: full PAdES PDF embedding is non-trivial in Node. The supplied function demonstrates signing the hash (PKCS7/CMS) and storing signature metadata. For legal-grade e-signatures use a provider (DocuSign/Adobe) or implement full PDF signature embedding.

## How documents are produced (flow)
1. Create sale in UI → Save Draft or Finalize.
2. Preview modal shows filled template (receipt or invoice) with logo, stamp and QR.
3. Finalize creates a Firestore document under `documents/`.
4. The app renders the hidden template to JPEG (receipt) or PDF (invoice) and prompts download.
5. The finalized copy is uploaded to Storage under `documents/{docId}` (optionally).
6. If Cloud Function signing is configured, call it to sign and store `pdfHash` + `signature` in Firestore. QR verification links to `/verify?i={docId}` which calls `verifyDocument`.

## Testing checklist
- Create a staff account and owner account.
- Add several sales, expenses and capital entries.
- Finalize a sale and download receipt JPEG (open to verify content).
- Generate an invoice PDF and scan QR (if verify endpoint configured).
- Run weekly / monthly custom reports and confirm numbers (Revenue, COGS, Expenses, Net Profit, Capital Balance).
- Test offline entry (PWA) and sync when online.

## Security notes
- Private signing keys MUST be stored in Secret Manager and never in Firestore or client code.
- Firestore rules rely on custom claims. Do not trust client-side `role` values without server-side custom claims.
- Only owner (custom claim) or backend should write `pdfHash`, `signature` or mark documents as externally-signed.

## Next improvements (recommended)
- Embed server-side PDF signature into PDF bytes for legal-grade evidence (use a signing library or third-party provider).
- Add emailing (SendGrid) to send finalized PDFs automatically to clients.
- Add OCR for receipt images if you want automated expense extraction.
- Add multi-currency and tax profiles (not required now).

If you want, I will now:
- 1) Generate the Cloud Functions code (index.js & package.json) in this chat (I included templates below).
- 2) Walk you through deploying the functions and creating Secret Manager secrets.
- 3) Update the frontend to call signDocument automatically on finalize.

Tell me which of the above you want me to produce next, or I can include the Cloud Functions templates now (already included further down).