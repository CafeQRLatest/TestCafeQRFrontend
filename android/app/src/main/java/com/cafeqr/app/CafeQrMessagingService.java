package com.cafeqr.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class CafeQrMessagingService extends FirebaseMessagingService {

    public static final String CHANNEL_DELIVERY_ID = "channel_delivery";
    public static final String ACTION_ACCEPT = "com.cafeqr.app.ACTION_ACCEPT_ORDER";
    public static final String ACTION_DECLINE = "com.cafeqr.app.ACTION_DECLINE_ORDER";
    public static final String EXTRA_ORDER_ID = "orderId";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        // Always notify Capacitor so foreground listeners stay in sync
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data == null) return;

        String category = data.get("category");
        String orderId = data.get("orderId");

        // Custom rich notification with Accept/Decline action buttons exclusively for DELIVERY orders
        if ("DELIVERY".equalsIgnoreCase(category) && orderId != null && !orderId.isEmpty()) {
            showDeliveryNotification(remoteMessage, data, orderId);
        }
    }

    private void showDeliveryNotification(RemoteMessage remoteMessage, Map<String, String> data, String orderId) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        createDeliveryNotificationChannel(notificationManager);

        String title = remoteMessage.getNotification() != null && remoteMessage.getNotification().getTitle() != null
                ? remoteMessage.getNotification().getTitle()
                : (data.get("title") != null ? data.get("title") : "New Delivery Order");

        String body = remoteMessage.getNotification() != null && remoteMessage.getNotification().getBody() != null
                ? remoteMessage.getNotification().getBody()
                : (data.get("body") != null ? data.get("body") : "You have received a new delivery order.");

        int notificationId = orderId.hashCode();

        // 1. Content Intent: Tapping notification body opens app to /owner/orders
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        contentIntent.putExtra("google.message_id", remoteMessage.getMessageId() != null ? remoteMessage.getMessageId() : String.valueOf(System.currentTimeMillis()));
        contentIntent.putExtra("orderId", orderId);
        contentIntent.putExtra("category", "DELIVERY");
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                this,
                notificationId,
                contentIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // 2. Accept Button Intent
        Intent acceptIntent = new Intent(this, NotificationActionReceiver.class);
        acceptIntent.setAction(ACTION_ACCEPT);
        acceptIntent.putExtra(EXTRA_ORDER_ID, orderId);
        acceptIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        PendingIntent acceptPendingIntent = PendingIntent.getBroadcast(
                this,
                notificationId + 1,
                acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // 3. Decline Button Intent
        Intent declineIntent = new Intent(this, NotificationActionReceiver.class);
        declineIntent.setAction(ACTION_DECLINE);
        declineIntent.putExtra(EXTRA_ORDER_ID, orderId);
        declineIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
                this,
                notificationId + 2,
                declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/delivery");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_DELIVERY_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setSound(soundUri)
                .setVibrate(new long[]{0, 500, 200, 500, 200, 500})
                .setContentIntent(contentPendingIntent)
                .addAction(android.R.drawable.checkbox_on_background, "Accept", acceptPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent);

        notificationManager.notify(notificationId, builder.build());
    }

    private void createDeliveryNotificationChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = notificationManager.getNotificationChannel(CHANNEL_DELIVERY_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_DELIVERY_ID,
                        "Delivery Orders",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Notifications and alarms for new delivery orders");
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
                channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

                Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/delivery");
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build();
                channel.setSound(soundUri, audioAttributes);

                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
