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

    MQTT.pub(topic, payload, 1, true);
  },

  publishAll: function(list) {
    for (let i = 0; i < list.length; i++) {
      Discovery.publish(list[i]);
    }
  },

  auto: function(list) {
    MQTT.setEventHandler(function(conn, ev, edata) {
      if (ev === MQTT.EV_CONNACK) {
        Discovery.publishAll(list);
      }
    }, null);
  }
};

exports.Discovery = Discovery;
