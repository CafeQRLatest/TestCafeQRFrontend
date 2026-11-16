package com.cafeqr.app;

import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.security.ProviderInstaller;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "MainActivity";
  private static final int REQUEST_CODE_FORCE_UPDATE = 9001;
  private AppUpdateManager appUpdateManager;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DevicePrinterPlugin.class);
    super.onCreate(savedInstanceState);

    // Enable remote debugging over USB for inspection on any Android device via chrome://inspect
    try {
      WebView.setWebContentsDebuggingEnabled(true);
    } catch (Exception ignored) {}

    // Update Security Provider on Android 5.0 - 7.1 to support modern TLS 1.2 / TLS 1.3
    try {
      ProviderInstaller.installIfNeededAsync(this, new ProviderInstaller.ProviderInstallListener() {
        @Override
        public void onProviderInstalled() {
          Log.i(TAG, "Security provider successfully initialized for modern TLS ciphers.");
        }

        @Override
        public void onProviderInstallFailed(int errorCode, Intent recoveryIntent) {
          Log.w(TAG, "Security provider update failed (code: " + errorCode + "). Relying on embedded root CA.");
        }
      });
    } catch (Exception e) {
      Log.w(TAG, "ProviderInstaller unavailable: " + e.getMessage());
    }

    try {
      appUpdateManager = AppUpdateManagerFactory.create(this);
      checkForAppUpdate();
    } catch (Exception e) {
      Log.w(TAG, "AppUpdateManager initialization skipped: " + e.getMessage());
    }
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

