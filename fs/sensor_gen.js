let SensorGen = {
  buildSensors: function(meterdata, deviceId, stateTopic) {
    let sensors = [];

    if (meterdata === null || meterdata === undefined) {
      print("SensorGen: meterdata is null/undefined");
      return sensors;
    }

    for (let key in meterdata) {
      let val = meterdata[key];

      // Only include entries that have been populated from UART (stored as [value, unit] arrays)
      if (!val || typeof(val) !== "object" || val.length < 1) {
        print("SensorGen: skipping key", key, "not yet received from HAN port");
        continue;
      }

      let unit = val.length > 1 ? val[1] : "";

      sensors.push({
        device_id: deviceId,
        device_name: "HAN Energy Meter",
        manufacturer: "Custom",
        model: "ESP32-HAN",
        object_id: key.toLowerCase(),
        friendly_name: key,
        state_topic: stateTopic,
        unit: unit,
        value_template: "{{ value_json." + key + "[0] }}"
      });
    }

    print("SensorGen: built", sensors.length, "sensors");
    return sensors;
  }
};

//exports.SensorGen = SensorGen;
