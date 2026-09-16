package com.cafeqr.app;

import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.gms.tasks.Task;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "MainActivity";
  private static final int REQUEST_CODE_FORCE_UPDATE = 9001;
  private AppUpdateManager appUpdateManager;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DevicePrinterPlugin.class);
    super.onCreate(savedInstanceState);

    appUpdateManager = AppUpdateManagerFactory.create(this);
    checkForAppUpdate();
  }

  @Override
  public void onResume() {
    super.onResume();
    checkUpdateInProgress();
  }

  private void checkForAppUpdate() {
    if (appUpdateManager == null) return;
    Task<AppUpdateInfo> appUpdateInfoTask = appUpdateManager.getAppUpdateInfo();
    appUpdateInfoTask.addOnSuccessListener(appUpdateInfo -> {
      if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
          && appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
        try {
          appUpdateManager.startUpdateFlowForResult(
              appUpdateInfo,
              AppUpdateType.IMMEDIATE,
              this,
              REQUEST_CODE_FORCE_UPDATE);
        } catch (IntentSender.SendIntentException e) {
          Log.e(TAG, "Error starting immediate app update flow", e);
        }
      }
    }).addOnFailureListener(e -> {
      Log.d(TAG, "Failed to check for app updates: " + e.getMessage());
    });
  }

  private void checkUpdateInProgress() {
    if (appUpdateManager == null) return;
    appUpdateManager.getAppUpdateInfo().addOnSuccessListener(appUpdateInfo -> {
      if (appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
        try {
          appUpdateManager.startUpdateFlowForResult(
              appUpdateInfo,
              AppUpdateType.IMMEDIATE,
              this,
              REQUEST_CODE_FORCE_UPDATE);
        } catch (IntentSender.SendIntentException e) {
          Log.e(TAG, "Error resuming immediate app update flow", e);
        }
      }
    });
  }

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == REQUEST_CODE_FORCE_UPDATE) {
      if (resultCode != RESULT_OK) {
        checkForAppUpdate();
      }
    }
  }
}

