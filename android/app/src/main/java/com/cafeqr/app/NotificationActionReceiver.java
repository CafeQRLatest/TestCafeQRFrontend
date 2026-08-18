package com.cafeqr.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class NotificationActionReceiver extends BroadcastReceiver {

    private static final String TAG = "NotificationAction";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        String orderId = intent.getStringExtra(CafeQrMessagingService.EXTRA_ORDER_ID);
        int notificationId = intent.getIntExtra(CafeQrMessagingService.EXTRA_NOTIFICATION_ID, 0);

        // 1. Cancel the notification immediately from the status bar upon action click
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null && notificationId != 0) {
            notificationManager.cancel(notificationId);
        }

        if (orderId == null || orderId.isEmpty()) return;

        Log.i(TAG, "Notification action received: " + action + " for orderId: " + orderId);

        // 2. Open MainActivity and forward the specific action to the web app
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra("google.message_id", "action_" + System.currentTimeMillis());
        launchIntent.putExtra("orderId", orderId);
        launchIntent.putExtra("actionId", CafeQrMessagingService.ACTION_ACCEPT.equals(action) ? "accept" : "decline");
        context.startActivity(launchIntent);
    }
}
