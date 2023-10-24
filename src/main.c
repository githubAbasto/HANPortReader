#include "mgos.h"
#include "mgos_mqtt.h"
//#include "driver/dac.h"
#include "main.h"

#ifdef MGOS_HAVE_WIFI
#include "mgos_wifi.h"
#endif

int currentLED[2] = {0,0};


//static void timer_cb(void *arg) {
//  static bool s_tick_tock = false;
//  LOG(LL_INFO,
//      ("%s uptime: %.2lf, RAM: %lu, %lu free", (s_tick_tock ? "Tick" : "Tock"),
//       mgos_uptime(), (unsigned long) mgos_get_heap_size(),
//       (unsigned long) mgos_get_free_heap_size()));
//  s_tick_tock = !s_tick_tock;
//  (void) arg;
//}

static void net_cb(int ev, void *evd, void *arg) {
  switch (ev) {
    case MGOS_NET_EV_DISCONNECTED:
      LOG(LL_INFO, ("%s", "Net disconnected"));
      break;
    case MGOS_NET_EV_CONNECTING:
      LOG(LL_INFO, ("%s", "Net connecting..."));
      break;
    case MGOS_NET_EV_CONNECTED:
      LOG(LL_INFO, ("%s", "Net connected"));
      break;
    case MGOS_NET_EV_IP_ACQUIRED:
      LOG(LL_INFO, ("%s", "Net got IP address"));
      break;
  }

  (void) evd;
  (void) arg;
}

#ifdef MGOS_HAVE_WIFI
static void wifi_cb(int ev, void *evd, void *arg) {
  switch (ev) {
    case MGOS_WIFI_EV_STA_DISCONNECTED: {
      struct mgos_wifi_sta_disconnected_arg *da =
          (struct mgos_wifi_sta_disconnected_arg *) evd;
      LOG(LL_INFO, ("WiFi STA disconnected, reason %d", da->reason));
      break;
    }
    case MGOS_WIFI_EV_STA_CONNECTING:
      LOG(LL_INFO, ("WiFi STA connecting %p", arg));
      break;
    case MGOS_WIFI_EV_STA_CONNECTED:
      LOG(LL_INFO, ("WiFi STA connected %p", arg));
      break;
    case MGOS_WIFI_EV_STA_IP_ACQUIRED:
      LOG(LL_INFO, ("WiFi STA IP acquired %p", arg));
      break;
    case MGOS_WIFI_EV_AP_STA_CONNECTED: {
      struct mgos_wifi_ap_sta_connected_arg *aa =
          (struct mgos_wifi_ap_sta_connected_arg *) evd;
      LOG(LL_INFO, ("WiFi AP STA connected MAC %02x:%02x:%02x:%02x:%02x:%02x",
                    aa->mac[0], aa->mac[1], aa->mac[2], aa->mac[3], aa->mac[4],
                    aa->mac[5]));
      break;
    }
    case MGOS_WIFI_EV_AP_STA_DISCONNECTED: {
      struct mgos_wifi_ap_sta_disconnected_arg *aa =
          (struct mgos_wifi_ap_sta_disconnected_arg *) evd;
      LOG(LL_INFO,
          ("WiFi AP STA disconnected MAC %02x:%02x:%02x:%02x:%02x:%02x",
           aa->mac[0], aa->mac[1], aa->mac[2], aa->mac[3], aa->mac[4],
           aa->mac[5]));
      break;
    }
  }
  (void) arg;
}
#endif /* MGOS_HAVE_WIFI */

static void cloud_cb(int ev, void *evd, void *arg) {
  struct mgos_cloud_arg *ca = (struct mgos_cloud_arg *) evd;
  switch (ev) {
    case MGOS_EVENT_CLOUD_CONNECTED: {
      LOG(LL_INFO, ("Cloud connected (%d)", ca->type));
      break;
    }
    case MGOS_EVENT_CLOUD_DISCONNECTED: {
      LOG(LL_INFO, ("Cloud disconnected (%d)", ca->type));
      break;
    }
  }

  (void) arg;
}

static void button_cb(int pin, void *arg) {
  char topic[100];
  bool res = mgos_mqtt_pubf(topic, 0, false /* retain */,
                            "{total_ram: %lu, free_ram: %lu}",
                            (unsigned long) mgos_get_heap_size(),
                            (unsigned long) mgos_get_free_heap_size());
  char buf[8];
  LOG(LL_INFO,
      ("Pin: %s, published: %s", mgos_gpio_str(pin, buf), res ? "yes" : "no"));
  (void) arg;
}


enum mgos_app_init_result mgos_app_init(void) {
 
  /* Simple repeating timer */
  //mgos_set_timer(5000, MGOS_TIMER_REPEAT, timer_cb, NULL);
  
  //mgos_gpio_setup_input(0,MGOS_GPIO_PULL_NONE);
  /* Publish to MQTT on button press */
//    mgos_gpio_set_button_handler(2, MGOS_GPIO_PULL_NONE , MGOS_GPIO_INT_LEVEL_LO , 20, button_cb, NULL);
  
  /* Network connectivity events */
  mgos_event_add_group_handler(MGOS_EVENT_GRP_NET, net_cb, NULL);

#ifdef MGOS_HAVE_WIFI
  mgos_event_add_group_handler(MGOS_WIFI_EV_BASE, wifi_cb, NULL);
#endif

  mgos_event_add_handler(MGOS_EVENT_CLOUD_CONNECTED, cloud_cb, NULL);
  mgos_event_add_handler(MGOS_EVENT_CLOUD_DISCONNECTED, cloud_cb, NULL);
  
  //mgos_gpio_setup_output(13,1) ;
  //mgos_gpio_blink(13, 300, 150);
  
  //dac_output_voltage(DAC_CHANNEL_1,0);
  //dac_output_voltage(DAC_CHANNEL_2,0);
  //dac_output_enable(DAC_CHANNEL_1);
  //dac_output_enable(DAC_CHANNEL_2);
  
  return MGOS_APP_INIT_SUCCESS;
}

/*
void fadeUp(int channel, int start, int final)
{
   for (int i = start; i <=final; i++) {
     dac_output_voltage(channel,i);
     mgos_usleep(10000);
   }
}

void fadeDown(int channel, int start, int final)
{
   for (int i = start; i >=final; i--) {
    dac_output_voltage(channel,i);
    mgos_usleep(40000);
   }
}

void write_dac(int red, int white)
{
  dac_output_enable(DAC_CHANNEL_2);
  dac_output_enable(DAC_CHANNEL_1);
if (currentLED[0]<red)
    fadeUp(DAC_CHANNEL_1, currentLED[0], red);
if (currentLED[0]>red)
    fadeDown(DAC_CHANNEL_1,currentLED[0], red);

if (currentLED[1]<white)
    fadeUp(DAC_CHANNEL_2, currentLED[1],white);
if (currentLED[1]>white){
    fadeDown(DAC_CHANNEL_2,currentLED[1], white);

    currentLED[0]=red;
    currentLED[1]=white;
}
if (red==0){ 
    dac_output_voltage(DAC_CHANNEL_1,0);
  }

if (white==0)
  dac_output_voltage(DAC_CHANNEL_2,0);

LOG(LL_INFO,
  ("red: %i, white: %i", currentLED[0], currentLED[1]));

}
*/


