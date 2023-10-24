load('api_config.js');
load('api_events.js');
load('api_gpio.js');
load('api_rpc.js');
load('api_mqtt.js');
load('api_timer.js');
load('api_sys.js');
load('api_uart.js');


let online = false;                               // Connected to the cloud?

let result;
let meterproto = [ 
  ["DateTime","1.0.0"], 
  ["TotalActivePowerIn","1.8.0"],
  ["TotalActivePowerEx","2.8.0"],
  ["ReactivePowerIn","3.7.0"],
  ["ActivePowerIn","1.7.0"], 
  ["ActivePowerEx","2.7.0"], 
  ["L1ActivePowerIn","21.7.0"], 
  ["L1ActivePowerEx","22.7.0"], 
  ["L2ActivePowerIn","41.7.0"], 
  ["L2ActivePowerEx","42.7.0"],
  ["L3ActivePowerIn","61.7.0"], 
  ["L3ActivePowerEx","62.7.0"], 
  ["L1ReactivePowerIn","23.7.0"], 
  ["L2ReactivePowerIn","43.7.0"], 
  ["L3ReactivePowerIn","63.7.0"], 
  ["L1Voltage","32.7.0"], 
  ["L2Voltage","52.7.0"], 
  ["L3Voltage","72.7.0"], 
  ["L1Current","31.7.0"], 
  ["L2Current","51.7.0"], 
  ["L3Current","71.7.0"], 
];
let protolen= meterproto.length;
let meterdata = JSON.parse('{"ActivePowerIn":0, "ActivePowerEx":0, "L1ActivePowerIn":"21", "L2ActivePowerIn":22, "L3ActivePowerIn":22, "L1Current":"0.00", "L2Current":"0.00", "L3Current":"0.00" }');


//Pin Mapping
let pin_LED=23;

GPIO.set_mode(pin_LED, GPIO.MODE_OUTPUT);

GPIO.setup_output(pin_LED, 0);

UART.setConfig(2, {
    baudRate:115200, 
    rxBufSize:1500, 
    txBufSize:25,
      esp32: { 
        gpio: {
          rx:16,
          tx:17,
        },
      },
});

// Set dispatcher callback, it will be called whenver new Rx data or space in
// the Tx buffer becomes available
UART.setDispatcher(2, function(uartNo) {
  let ra = UART.readAvail(uartNo);
  if (ra > 0) {
    // Received new data: 
    let data = UART.read(uartNo);
    print('Number of characters received:', data.length, '\n\r');
//    print('Received UART data:', data);

    let lines = [ "1", "2"];

    let cr1=0;
    let cr2 =0;
    let i=0;
    for(i=0;i<data.length;i++){   // Split data into lines ending with carriage return
      cr1=data.indexOf('\n',cr2);
      cr2=data.indexOf('\n',cr1+1);
      if (cr1===-1 ||cr2===-1) {break;}   // end for-loop when cr has not been found. 
      lines[i]=data.slice(cr1+1+4,cr2-1); // store new line in array of lines. 
      //print('S:',cr1,'E:',cr2);
      //print(lines[i]);
    }

    print('Parsed ' , i, ' lines'); // Tell how many lines that where found in the original data

    for (let x=1; x < i; x++) { // find position for start (, end ) and also the * that tells where the unit starts
      cr1=lines[x].indexOf( '(' , 0);
      cr2=lines[x].indexOf( ')' ,0);
      let unitpos = lines[x].indexOf('*',0 );
      if (unitpos===-1) { // if unit * is missing then use the last )
        unitpos=cr2;
        }

      let command = lines[x].slice(0,cr1);    // Parse out command
      let data = lines[x].slice(cr1+1,unitpos); // Parse out data value 
      let unit = lines[x].slice(unitpos+1,cr2);  // parse out unit if any... 

      //print (command,":", data," ", unit);

      // walk through the full struct to find the matching command and store the data and unit under the name stated in meterproto array.
      for (let v=0; v< protolen ;v++) { 
        if (command===meterproto[v][1]) { // Compare protocol number in current string
          meterdata[meterproto[v][0]] = [data,unit]; // if above, store data in meterdata json key
         // print('Mapped ', meterproto[v][0], 'with data ', data, ' ',unit);
        }
      }   
      
    }
    //If we are exporting power, add - sign to the current value instead of RMS 
    if (meterdata["L1ActivePowerEx"][0] !== "0000.000" && meterdata["L1Current"][0].at(0) !==0x2d)
      meterdata["L1Current"][0] = "-" + meterdata["L1Current"][0];
    if (meterdata["L2ActivePowerEx"][0] !== "0000.000" && meterdata["L2Current"][0].at(0) !==0x2d)
      meterdata["L2Current"][0] = "-" + meterdata["L2Current"][0];
    if (meterdata["L3ActivePowerEx"][0] !== "0000.000" && meterdata["L3Current"][0].at(0) !==0x2d)
      meterdata["L3Current"][0] = "-" + meterdata["L3Current"][0];
  }
}, null);

// Enable Rx
UART.setRxEnabled(2, true);

//Update state every 6 second, and report to cloud if online
Timer.set(6000, Timer.REPEAT, function() {
    if (online ){ 
    reportState();
    GPIO.toggle(pin_LED);
  } 
}, null) ;


function reportState() {

  let sendMQTT = true;
  let message = JSON.stringify(meterdata);

    if (MQTT.isConnected() && sendMQTT) {
      let topic = Cfg.get('site.id') + '/'+Cfg.get('site.position')+'/status';
      print('== Publishing to ' + topic + ':', message);      
      MQTT.pub(topic, message, 0 /* QoS */);

    } else if (sendMQTT) {
      print('== Not connected!');
    }
} 


Event.on(Event.CLOUD_CONNECTED, function() {
  online = true;
 // GPIO.write(17,0); // LED ON wHen connected to cloud 
}, null);

Event.on(Event.CLOUD_DISCONNECTED, function() {
  online = false;
}, null);
