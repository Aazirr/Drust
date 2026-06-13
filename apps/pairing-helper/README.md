# Drust Pairing Helper

Local-only CLI for Rust+ Pair with Server capture.

## Commands

`npm --workspace @drust/pairing-helper start -- register`

- Runs the upstream Rust+ FCM registration flow.
- Saves the Rust+ config at `.drust/pairing/rustplus.config.json`.

`npm --workspace @drust/pairing-helper start -- listen`

- Waits for a Rust+ Pair with Server notification.
- Saves the captured server pairing at `.drust/pairing/latest-rustplus-pairing.json`.
- Posts the pairing payload to `DRUST_PAIRING_IMPORT_URL` if set.

## Default Import Target

If `DRUST_PAIRING_IMPORT_URL` is not set, the helper posts to `http://127.0.0.1:8787`.
