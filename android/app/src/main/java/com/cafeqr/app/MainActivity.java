package com.cafeqr.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cafeqr.app.DevicePrinterPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DevicePrinterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
