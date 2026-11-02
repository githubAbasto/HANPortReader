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

// --- Phase remapping (han.phase_map, applied at boot; config change needs reboot) ---
// Digit k of the map is the meter phase that becomes logical L(k+1), e.g. "231"
// means L1 <- meter L2, L2 <- meter L3, L3 <- meter L1. Done by renaming the
// target keys in meterproto so the parser writes each OBIS value straight to its
// logical key. Permuting meterdata after parsing instead is not idempotent: a
// dispatcher call carrying only part of a frame would re-permute the stale keys.
let _phaseMap = Cfg.get('han.phase_map');
if (_phaseMap === '132' || _phaseMap === '213' || _phaseMap === '231' ||
    _phaseMap === '312' || _phaseMap === '321') {
  print('HAN: phase map', _phaseMap);
  for (let pm = 0; pm < protolen; pm++) {
    let pname = meterproto[pm][0];
    if (pname[0] !== 'L') { continue; }
    let mph = pname[1];  // meter phase digit of this OBIS entry
    let logical = '';
    if (_phaseMap[0] === mph) { logical = '1'; }
    else if (_phaseMap[1] === mph) { logical = '2'; }
    else if (_phaseMap[2] === mph) { logical = '3'; }
    if (logical !== '') {
      meterproto[pm][0] = 'L' + logical + pname.slice(2, pname.length);
    }
  }
}

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
