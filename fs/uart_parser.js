load('api_timer.js');
load('api_uart.js');

let meterproto = [
  ["DateTime",          "1.0.0"],
  ["TotalActivePowerIn","1.8.0"],
  ["TotalActivePowerEx","2.8.0"],
  ["ReactivePowerIn",   "3.7.0"],
  ["ActivePowerIn",     "1.7.0"],
  ["ActivePowerEx",     "2.7.0"],
  ["L1ActivePowerIn",   "21.7.0"],
  ["L1ActivePowerEx",   "22.7.0"],
  ["L2ActivePowerIn",   "41.7.0"],
  ["L2ActivePowerEx",   "42.7.0"],
  ["L3ActivePowerIn",   "61.7.0"],
  ["L3ActivePowerEx",   "62.7.0"],
  ["L1ReactivePowerIn", "23.7.0"],
  ["L2ReactivePowerIn", "43.7.0"],
  ["L3ReactivePowerIn", "63.7.0"],
  ["L1Voltage",         "32.7.0"],
  ["L2Voltage",         "52.7.0"],
  ["L3Voltage",         "72.7.0"],
  ["L1Current",         "31.7.0"],
  ["L2Current",         "51.7.0"],
  ["L3Current",         "71.7.0"],
];
let protolen = meterproto.length;

// Seed with zero readings. All values use [value, unit] arrays for consistency
// with UART-parsed entries so all consumers see the same structure.
let meterdata = {
  "L1ActivePowerIn": ["0.000", "kW"],
  "L2ActivePowerIn": ["0.000", "kW"],
  "L3ActivePowerIn": ["0.000", "kW"],
  "L1Current":       ["0.000", "A"],
  "L2Current":       ["0.000", "A"],
  "L3Current":       ["0.000", "A"]
};

// Returns true once all protocol entries have been received from the meter.
function frameIsComplete() {
  let count = 0;
  for (let k in meterdata) { count++; }
  return count === protolen;
}

// lastHanDataTs is also read/reset by the HAN watchdog in init.js.
let lastHanDataTs = Timer.now();
function WatchdogFeedHan() {
  lastHanDataTs = Timer.now();
}

UART.setConfig(2, {
  baudRate:  115200,
  rxBufSize: 1500,
  txBufSize: 25,
  esp32: { gpio: { rx: 16, tx: 17 } },
});

UART.setDispatcher(2, function(uartNo) {
  if (UART.readAvail(uartNo) === 0) { return; }

  let frame = UART.read(uartNo);
  WatchdogFeedHan();

  // Split frame into lines (each terminated by \n, prefixed by 4-char address).
  let lines = [];
  let p1 = 0;
  let p2 = 0;
  let i = 0;
  for (i = 0; i < frame.length; i++) {
    p1 = frame.indexOf('\n', p2);
    p2 = frame.indexOf('\n', p1 + 1);
    if (p1 === -1 || p2 === -1) { break; }
    lines[i] = frame.slice(p1 + 1 + 4, p2 - 1);
  }

  // Parse each line: OBIS_code(value*unit)
  for (let x = 1; x < i; x++) {
    let start   = lines[x].indexOf('(', 0);
    let end     = lines[x].indexOf(')', 0);
    let unitpos = lines[x].indexOf('*', 0);
    if (unitpos === -1) { unitpos = end; }

    let obis = lines[x].slice(0, start);
    let val  = lines[x].slice(start + 1, unitpos);
    let unit = lines[x].slice(unitpos + 1, end);

    for (let v = 0; v < protolen; v++) {
      if (obis === meterproto[v][1]) {
        meterdata[meterproto[v][0]] = [val, unit];
      }
    }
  }

  // If exporting power, negate the phase current (meter reports RMS, not signed).
  if (meterdata["L1ActivePowerEx"] && meterdata["L1Current"] &&
      meterdata["L1ActivePowerEx"][0] !== "0000.000" && meterdata["L1Current"][0][0] !== '-')
    meterdata["L1Current"][0] = "-" + meterdata["L1Current"][0];
  if (meterdata["L2ActivePowerEx"] && meterdata["L2Current"] &&
      meterdata["L2ActivePowerEx"][0] !== "0000.000" && meterdata["L2Current"][0][0] !== '-')
    meterdata["L2Current"][0] = "-" + meterdata["L2Current"][0];
  if (meterdata["L3ActivePowerEx"] && meterdata["L3Current"] &&
      meterdata["L3ActivePowerEx"][0] !== "0000.000" && meterdata["L3Current"][0][0] !== '-')
    meterdata["L3Current"][0] = "-" + meterdata["L3Current"][0];
}, null);

UART.setRxEnabled(2, true);
