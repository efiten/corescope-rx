// Publishes buffered receptions to MQTT (over WebSocket/TLS) in the
// meshcoretomqtt-compatible format CoreScope's ingestor consumes, on the
// client topic meshcore/client/{PUBLIC_KEY}/packets.
import mqtt from 'mqtt';

export class Publisher {
  // opts: { url, username, password } — EMQX WSS endpoint + per-client creds.
  constructor(opts) { this.opts = opts; this.client = null; this._onStatus = null; }

  // onStatus(cb): cb(state, arg) is called on connection lifecycle changes, where state
  // is 'connect' | 'reconnect' | 'offline' | 'close' | 'error' (arg = Error for 'error').
  // Drives the Home upload indicator, the debug log, and a drain kick on reconnect.
  onStatus(cb) { this._onStatus = cb; }

  _emit(ev, arg) { if (this._onStatus) this._onStatus(ev, arg); }

  connect() {
    this.client = mqtt.connect(this.opts.url, {
      username: this.opts.username,
      password: this.opts.password,
      clientId: this.opts.clientId, // = companion pubkey; EMQX ACL can bind topics to ${clientid}
      reconnectPeriod: 4000,
      clean: true,
    });
    for (const ev of ['connect', 'reconnect', 'offline', 'close']) {
      this.client.on(ev, () => this._emit(ev));
    }
    // PERSISTENT error listener. mqtt.js is an EventEmitter: an 'error' with no listener
    // throws and can wedge the auto-reconnect loop — which left the client permanently
    // disconnected (every reception stuck pending) after one transient drop. Always
    // listen and surface the reason instead.
    this.client.on('error', (e) => this._emit('error', e));
    // Resolve/reject the INITIAL connect only. Listeners are removed once settled so the
    // persistent 'error' handler above is the sole long-lived one afterwards.
    return new Promise((resolve, reject) => {
      const onConn = () => { cleanup(); resolve(); };
      const onErr = (e) => { cleanup(); reject(e); };
      const cleanup = () => { this.client.removeListener('connect', onConn); this.client.removeListener('error', onErr); };
      this.client.on('connect', onConn);
      this.client.on('error', onErr);
    });
  }

  connected() { return !!(this.client && this.client.connected); }

  // reconnect forces a fresh connection attempt — used by "Push pending now" when the
  // client is disconnected, so the user isn't stuck with a dead link and a full queue.
  reconnect() { try { if (this.client) this.client.reconnect(); } catch (e) {} }

  end() { try { if (this.client) this.client.end(true); } catch (e) {} this.client = null; }

  // buildPayload assembles one reception in the ingestor's expected shape.
  // `name` is the companion's self-reported name (SELF_INFO) → sent as "origin"
  // so the server can label this observer even if it never advertised.
  static buildPayload(rxPubkey, rec, name) {
    return {
      origin_id: rxPubkey,
      origin: name || undefined,
      timestamp: rec.rx_at,
      type: 'PACKET',
      direction: 'rx',
      raw: rec.raw,
      SNR: rec.snr,
      RSSI: rec.rssi,
      gps: { lat: rec.lat, lon: rec.lon, acc_m: rec.acc_m },
    };
  }

  // publish sends one reception; resolves on broker ack (QoS1). A dead socket never
  // acks, so the callback would hang forever — the timeout rejects instead, the record
  // stays buffered, and the drain loop lives on to retry after reconnect.
  publish(rxPubkey, rec, name, timeoutMs = 8000) {
    const topic = 'meshcore/client/' + rxPubkey + '/packets';
    const payload = JSON.stringify(Publisher.buildPayload(rxPubkey, rec, name));
    const ack = new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('publish timeout')), timeoutMs));
    return Promise.race([ack, timeout]);
  }
}
