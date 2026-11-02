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
      if (!val || val[0] === undefined) {
        print("SensorGen: skipping key", key, "not yet received from HAN port");
        continue;
      }

      let unit = val.length > 1 ? val[1] : "";

      // No unit means a non-numeric reading (DateTime). Leave device_class and
      // state_class empty so Discovery.publish omits them: HA rejects the whole
      // config payload on an empty device_class, and state_class=measurement on
      // a timestamp string makes it reject every state update.
      let dc = "";
      let sc = unit === "" ? "" : "measurement";
      if (unit === "kWh")  { dc = "energy";         sc = "total_increasing"; }
      else if (unit === "kW")   { dc = "power"; }
      else if (unit === "A")    { dc = "current"; }
      else if (unit === "V")    { dc = "voltage"; }
      else if (unit === "kvar") { dc = "reactive_power"; }

      sensors.push({
        device_id: deviceId,
        device_name: deviceId,
        manufacturer: "PowerConcern",
        model: "HAN Reader",
        object_id: key,
        friendly_name: key,
        state_topic: stateTopic,
        unit: unit,
        device_class: dc,
        state_class: sc,
        value_template: "{{ value_json." + key + "[0] }}"
      });
    }

    print("SensorGen: built", sensors.length, "sensors");
    return sensors;
  }
};

//exports.SensorGen = SensorGen;
