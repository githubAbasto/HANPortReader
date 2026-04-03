load('api_mqtt.js');

let Discovery = {
  publish: function(cfg) {
    let topic = 'homeassistant/sensor/' +
                cfg.device_id + '/' +
                cfg.object_id + '/config';

    let payload = JSON.stringify({
      name: cfg.friendly_name,
      state_topic: cfg.state_topic,
      unit_of_measurement: cfg.unit,
      device_class: cfg.device_class,
      state_class: cfg.state_class,
      value_template: cfg.value_template,
      unique_id: cfg.device_id + '_' + cfg.object_id,
      device: {
        identifiers: [cfg.device_id],
        name: cfg.device_name,
        model: cfg.model,
        manufacturer: cfg.manufacturer
      }
    });

    let ok = MQTT.pub(topic, payload, 1, true);
    print('Discovery: pub', topic, ok ? 'ok' : 'FAILED');
    return ok;
  },

  publishAll: function(list) {
    // Publish one at a time; only advance when MQTT.pub accepts the message.
    // Poll interval lets messages flow as fast as the buffer allows
    // without the fixed delay that degraded WiFi responsiveness.
    print('Discovery: publishing', list.length, 'sensors');
    let state = {i: 0, list: list, tid: 0, retries: 0};
    state.tid = Timer.set(200, Timer.REPEAT, function(s) {
      if (s.i >= s.list.length) {
        print('Discovery: done');
        Timer.del(s.tid);
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
        }
      }
    }, state);
  },

  auto: function(list) {
    // If already connected, publish immediately (CONNACK already fired)
    if (MQTT.isConnected()) {
      Discovery.publishAll(list);
    }
    // Also register handler to re-publish on future reconnects
    MQTT.setEventHandler(function(conn, ev, edata) {
      if (ev === MQTT.EV_CONNACK) {
        Discovery.publishAll(list);
      }
    }, null);
  }
};
