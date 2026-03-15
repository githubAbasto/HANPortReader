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
      value_template: cfg.value_template,
      unique_id: cfg.device_id + '_' + cfg.object_id,
      device: {
        identifiers: [cfg.device_id],
        name: cfg.device_name,
        model: cfg.model,
        manufacturer: cfg.manufacturer
      }
    });

    let ok = MQTT.pub(topic, payload, 0, true);
    print('Discovery: pub', topic, ok ? 'ok' : 'FAILED');
  },

  publishAll: function(list) {
    // Drip-feed one message per tick to avoid MQTT queue overflow.
    print('Discovery: publishing', list.length, 'sensors');
    let state = {i: 0, list: list, tid: 0};
    state.tid = Timer.set(300, Timer.REPEAT, function(s) {
      if (s.i >= s.list.length) {
        print('Discovery: done');
        Timer.del(s.tid);
        return;
      }
      Discovery.publish(s.list[s.i]);
      s.i++;
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
