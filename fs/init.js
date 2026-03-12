load('api_config.js');
load('api_events.js');
load('api_gpio.js');
load('api_rpc.js');
load('api_mqtt.js');
load('api_timer.js');
load('api_sys.js');
load('discovery.js');
load('sensor_gen.js');
load('uart_parser.js'); // defines meterdata, meterproto, protolen, frameIsComplete, lastHanDataTs, WatchdogFeedHan

// --- Boot config auto-assignment (first boot only) ---
// Both assignments share one Config.Save to avoid a write race.
let _devId     = Cfg.get('device.id');
let _devLen    = _devId ? _devId.length : 0;
let _devSuffix = _devLen >= 6 ? _devId.slice(_devLen - 6, _devLen) : '000000';
let _needSave  = false;
let _apSsid    = '';

if (Cfg.get('site.id') === '') {
  let siteId = 'PC-' + _devSuffix;
  print('Auto-assigning site.id:', siteId);
  Cfg.set({site: {id: siteId}});
  _needSave = true;
}

let _curApSsid = Cfg.get('wifi.ap.ssid');
if (!_curApSsid || _curApSsid.slice(0, 8) === 'Mongoose') {
  _apSsid = 'PowerConcern_' + _devSuffix;
  print('Auto-assigning AP SSID:', _apSsid);
  Cfg.set({wifi: {ap: {ssid: _apSsid}}});
  _needSave = true;
}

// Keep dns_sd.host_name in sync with wifi.sta.hostname
let _staHostname = Cfg.get('wifi.sta.hostname');
if (Cfg.get('dns_sd.host_name') !== _staHostname) {
  Cfg.set({dns_sd: {host_name: _staHostname}});
  _needSave = true;
}

if (_needSave) {
  RPC.call(null, 'Config.Save', {reboot: false}, null, null);
}
if (_apSsid) {
  Timer.set(2000, 0, function(ssid) {
    print('AP SSID set to', ssid, '- rebooting to apply');
    Sys.reboot(500);
  }, _apSsid);
}

// --- State ---
let mqttConnected = false;  // true when MQTT broker connection is up
let discoverySent = false;

// --- Watchdogs ---
let MQTT_TIMEOUT = 80;  // seconds without successful MQTT publish → reboot
let HAN_TIMEOUT  = 50;  // seconds without UART data → reboot

let lastMqttOkTs = Timer.now();
function WatchdogFeedMqtt() {
  lastMqttOkTs = Timer.now();
}

// WiFi/MQTT watchdog — fires every 15 s
Timer.set(15000, Timer.REPEAT, function() {
  if (Cfg.get('wifi.sta.ssid') === '') {
    lastMqttOkTs = Timer.now(); // unconfigured device, suppress watchdog
    return;
  }
  let delta = Timer.now() - lastMqttOkTs;
  if (mqttConnected && delta > MQTT_TIMEOUT) {
    print('MQTT watchdog: no publish for', delta, 's, rebooting');
    Sys.reboot(500);
  }
  if (!mqttConnected && delta > MQTT_TIMEOUT * 2) {
    print('WiFi watchdog: offline too long, rebooting');
    Sys.reboot(500);
  }
}, null);

// HAN data watchdog — fires every 10 s (lastHanDataTs defined in uart_parser.js)
Timer.set(10000, Timer.REPEAT, function() {
  if (Cfg.get('wifi.sta.ssid') === '') {
    lastHanDataTs = Timer.now(); // unconfigured device, suppress watchdog
    return;
  }
  let delta = Timer.now() - lastHanDataTs;
  if (delta > HAN_TIMEOUT) {
    print('HAN data timeout (', delta, 's), rebooting');
    Sys.reboot(500);
  }
}, null);

// --- GPIO ---
let pin_LED = 23;
GPIO.set_mode(pin_LED, GPIO.MODE_OUTPUT);
GPIO.setup_output(pin_LED, 0);

// --- MQTT reporting (every 6 s when connected) ---
Timer.set(6000, Timer.REPEAT, function() {
  if (!mqttConnected) { return; }
  reportState();
  if (!discoverySent && frameIsComplete()) {
    let stateTopic = Cfg.get('site.id') + '/' + Cfg.get('site.position') + '/status';
    let sensors = SensorGen.buildSensors(meterdata, Cfg.get('site.id'), stateTopic);
    Discovery.auto(sensors);
    discoverySent = true;
  }
}, null);

function reportState() {
  if (!MQTT.isConnected()) { return; }
  let topic   = Cfg.get('site.id') + '/' + Cfg.get('site.position') + '/status';
  let message = JSON.stringify(meterdata);
  print('== Publishing to', topic, ':', message);
  if (MQTT.pub(topic, message, 0)) {
    WatchdogFeedMqtt();
  } else {
    print('== MQTT publish failed');
  }
}

// --- RPC handlers ---
let _scanRunning = false;
let _scanResults = null;

RPC.addHandler('HAN.Scan', function(args) {
  if (_scanRunning) { return {started: false}; }
  _scanRunning = true;
  _scanResults = null;
  Wifi.scan(function(results) {
    print('WiFi scan done, got', results ? results.length : 0, 'networks');
    _scanRunning = false;
    _scanResults = results || [];
  });
  return {started: true};
});

RPC.addHandler('HAN.ScanResults', function(args) {
  return {running: _scanRunning, results: _scanResults};
});

RPC.addHandler('HAN.GetData', function(args) {
  return meterdata;
});

RPC.addHandler('HAN.GetInfo', function(args) {
  return {
    site_id:        Cfg.get('site.id'),
    site_position:  Cfg.get('site.position'),
    online:         mqttConnected,
    frame_complete: frameIsComplete()
  };
});

// --- Cloud events ---
Event.on(Event.CLOUD_CONNECTED, function() {
  mqttConnected = true;
}, null);

Event.on(Event.CLOUD_DISCONNECTED, function() {
  mqttConnected = false;
}, null);
