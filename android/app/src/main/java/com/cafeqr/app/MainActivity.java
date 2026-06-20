package com.cafeqr.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cafeqr.app.DevicePrinterPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DevicePrinterPlugin.class);
    super.onCreate(savedInstanceState);
    createNotificationChannels();
  }

  private void createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (manager == null) return;

      AudioAttributes audioAttr = new AudioAttributes.Builder()
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .build();

      // Kitchen orders channel
      NotificationChannel kitchenChannel = new NotificationChannel(
              "channel_kitchen", "Kitchen Orders", NotificationManager.IMPORTANCE_HIGH);
      kitchenChannel.setDescription("Notifications for new kitchen/dine-in orders");
      kitchenChannel.setSound(
              Uri.parse("android.resource://" + getPackageName() + "/raw/kitchen"), audioAttr);
      kitchenChannel.enableVibration(true);
      kitchenChannel.setVibrationPattern(new long[]{0, 220, 120, 220, 120, 220});
      manager.createNotificationChannel(kitchenChannel);

      // Takeaway orders channel
      NotificationChannel takeawayChannel = new NotificationChannel(
              "channel_takeaway", "Takeaway Orders", NotificationManager.IMPORTANCE_HIGH);
      takeawayChannel.setDescription("Notifications for new takeaway/parcel orders");
      takeawayChannel.setSound(
              Uri.parse("android.resource://" + getPackageName() + "/raw/takeaway"), audioAttr);
      takeawayChannel.enableVibration(true);
      takeawayChannel.setVibrationPattern(new long[]{0, 220, 120, 220, 120, 220});
      manager.createNotificationChannel(takeawayChannel);

      // Delivery orders channel
      NotificationChannel deliveryChannel = new NotificationChannel(
              "channel_delivery", "Delivery Orders", NotificationManager.IMPORTANCE_HIGH);
      deliveryChannel.setDescription("Notifications for new delivery orders");
      deliveryChannel.setSound(
              Uri.parse("android.resource://" + getPackageName() + "/raw/delivery"), audioAttr);
      deliveryChannel.enableVibration(true);
      deliveryChannel.setVibrationPattern(new long[]{0, 220, 120, 220, 120, 220});
      manager.createNotificationChannel(deliveryChannel);

      // Order settled channel
      NotificationChannel settleChannel = new NotificationChannel(
              "channel_settle", "Order Settled", NotificationManager.IMPORTANCE_HIGH);
      settleChannel.setDescription("Notifications for settled/paid orders");
      settleChannel.setSound(
              Uri.parse("android.resource://" + getPackageName() + "/raw/settle"), audioAttr);
      settleChannel.enableVibration(true);
      settleChannel.setVibrationPattern(new long[]{0, 220, 120, 220, 120, 220});
      manager.createNotificationChannel(settleChannel);
    }
  }
}
