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

`npm --workspace @drust/pairing-helper start -- bind-alarm small-oil`

`npm --workspace @drust/pairing-helper start -- bind-alarm large-oil`

- Waits for a Smart Alarm device pairing notification.
- Saves the captured device binding to `.drust/pairing/<target>-smart-alarm.json`.
- Posts the device pairing payload to Drust so the worker can bind the entity ID.

## Default Import Target

If `DRUST_PAIRING_IMPORT_URL` is not set, the helper posts to `http://127.0.0.1:8787`.
