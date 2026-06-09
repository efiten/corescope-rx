# corescope-rx

Mobile RX coverage capture for [CoreScope](https://github.com/Kpa-clawbot/CoreScope). An Android
PWA that connects over BLE to a MeshCore **companion** radio, captures which nodes it hears (with
SNR/RSSI), tags each reception with the phone's GPS, and publishes to MQTT so CoreScope's ingestor
stores it in `client_receptions` and renders per-node hex coverage on the Reach page (mapme.sh-style).

This is "Plan 2" — the capture app. The CoreScope server/ingestor side ("Plan 1") is implemented in
the CoreScope repo. The interface between them is the MQTT contract documented in CoreScope's
`docs/client-rx-coverage.md`.

## How it works

```
companion ──BLE 0x88 (snr+rssi+raw)──▶ frames.js ──▶ meshpacket.js (path[last] / advert pubkey)
                                                          │
phone GPS (gps.js) ───────────────────────────────────────┤
                                                          ▼
                                          queue.js (IndexedDB, offline) ──▶ publisher.js (MQTT/WSS)
                                                          │
                                          meshcore/client/{PUBLIC_KEY}/packets ──▶ CoreScope ingestor
```

- **Capture source:** the companion's `PUSH_CODE_LOG_RX_DATA` (0x88) frame — emitted for every
  received packet on stock firmware (`Dispatcher.cpp:198`), carrying SNR + RSSI + the raw packet.
- **Direct-only rule:** records only `path[last]` (last forwarder) or a 0-hop advert's full pubkey.
- **GPS:** the phone's (`navigator.geolocation`), not the companion's.
- **Trust:** the companion pubkey is the identity; EMQX ACL binds each client to its own topic.

## Dev

```bash
npm install
npm run dev      # Vite dev server (Android Chrome; Web Bluetooth needs HTTPS or localhost)
npm test         # node --test (meshpacket parsing)
```

Web Bluetooth requires a secure context (HTTPS or `localhost`). For phone testing over LAN, serve
via HTTPS (e.g. a dev tunnel) — Chrome blocks Web Bluetooth on plain HTTP origins.

## Deploy

Published at **https://rx.on8ar.eu** (HTTPS — required for Web Bluetooth). It's a static build
served by nginx on the reverse proxy `root@94.130.105.135` from `/var/www/rx.on8ar.eu` (TLS via
certbot). Content updates are one command:

```bash
npm run deploy   # build (uses .env.local) + scp dist/ to the proxy
```

No nginx/cert changes are needed for content updates — only `deploy.sh` re-uploads `dist/`.

## Status

Scaffold + protocol core implemented and unit-tested. See `docs/plan.md` for remaining tasks
(spikes: Web Bluetooth proof-of-connect, SELF_INFO pubkey auto-fill, EMQX WSS/ACL; then PWA
manifest/service-worker, MTU/reconnect hardening, field verification).

iOS later: swap `WebBluetoothTransport` for a Capacitor BLE plugin behind the same interface; the
rest is unchanged.
