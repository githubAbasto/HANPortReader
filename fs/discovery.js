load('api_mqtt.js');
load('api_timer.js');

let Discovery = {
  // Last sensor list built from a complete meter frame. Kept so discovery can
  // be re-announced later (HA restart / MQTT reconnect) without rebuilding it.
  _list: null,
  _busy: false,

  publish: function(cfg) {
    let topic = 'homeassistant/sensor/' +
                cfg.device_id + '/' +
                cfg.object_id + '/config';

    // Build incrementally: HA rejects the whole config payload if
    // device_class or state_class is present but empty, which drops the
    // sensor silently. Only send the keys we actually have a value for.
    let payload = {
      name: cfg.friendly_name,
      state_topic: cfg.state_topic,
      value_template: cfg.value_template,
      unique_id: cfg.device_id + '_' + cfg.object_id,
      device: {
        identifiers: [cfg.device_id],
        name: cfg.device_name,
        model: cfg.model,
        manufacturer: cfg.manufacturer
      }
    };
    if (cfg.unit !== '')         { payload.unit_of_measurement = cfg.unit; }
    if (cfg.device_class !== '') { payload.device_class = cfg.device_class; }
    if (cfg.state_class !== '')  { payload.state_class = cfg.state_class; }

    let ok = MQTT.pub(topic, JSON.stringify(payload), 1, true);
    print('Discovery: pub', topic, ok ? 'ok' : 'FAILED');
    return ok;
  },

  publishAll: function(list) {
    if (!list || list.length === 0) {
      print('Discovery: nothing to publish');
      return;
    }
    // A re-announce can arrive while a run is still in flight (HA birth
    // message during reconnect). Two timers walking two cursors would
    // interleave publishes and blow the MQTT buffer, so let the first finish.
    if (Discovery._busy) {
      print('Discovery: publish already in progress, skipping');
      return;
    }
    Discovery._busy = true;

    // Publish one at a time; only advance when MQTT.pub accepts the message.
    // Poll interval lets messages flow as fast as the buffer allows
    // without the fixed delay that degraded WiFi responsiveness.
    print('Discovery: publishing', list.length, 'sensors');
    let state = {i: 0, list: list, tid: 0, retries: 0};
    state.tid = Timer.set(200, Timer.REPEAT, function(s) {
      if (s.i >= s.list.length) {
        print('Discovery: done');
        Timer.del(s.tid);
        Discovery._busy = false;
        return;
      }
      let ok = Discovery.publish(s.list[s.i]);
      if (ok) {
        s.i++;
        s.retries = 0;
      } else {
        s.retries++;
        if (s.retries > 25) {
          print('Discovery: giving up after too many retries at sensor', s.i);
          Timer.del(s.tid);
          Discovery._busy = false;
        }
      }
    }, state);
  },

  // Re-send the stored sensor list. No-op before the first complete frame.
  announce: function() {
    if (Discovery._list === null) {
      print('Discovery: no sensors built yet, nothing to announce');
      return;
    }
    Discovery.publishAll(Discovery._list);
  },

  // Register the re-announce hooks. Must run at boot, BEFORE MQTT connects:
  // mgos_mqtt_sub() queues subscriptions that are only sent to the broker at
  // CONNACK, so subscribing after the connection is up does nothing until the
  // next reconnect.
  init: function() {
    // Our own connection came back (broker restart, WiFi blip).
    MQTT.setEventHandler(function(conn, ev, edata) {
      if (ev === MQTT.EV_CONNACK) {
        print('Discovery: MQTT connected, re-announcing');
        Discovery.announce();
      }
    }, null);

    // Home Assistant restarted. It publishes its birth message here once the
    // MQTT integration is up. Retained configs alone are not enough: a broker
    // without a persisted retained store loses them across a restart, and
    // nothing else would ever re-send them.
    MQTT.sub('homeassistant/status', function(conn, topic, msg) {
      print('Discovery: HA status =', msg);
      if (msg === 'online') {
        // Small grace period so HA has finished subscribing to homeassistant/#.
        Timer.set(3000, 0, function() {
          Discovery.announce();
        }, null);
      }
    }, null);
  },

  // Called once a complete meter frame has produced a sensor list.
  auto: function(list) {
    Discovery._list = list;
    if (MQTT.isConnected()) {
      Discovery.publishAll(list);
    }
  }
};
