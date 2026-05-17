//android/app/src/main/java/com/cafeqr/app/DevicePrinterPlugin.java

package com.cafeqr.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "DevicePrinter")
public class DevicePrinterPlugin extends Plugin {

  private static final int REQ_BT = 901;
  private static final UUID SPP_UUID =
      UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
  private String pendingPermCallbackId = null;

  private boolean hasBluetoothConnectPermission() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
        || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
            == PackageManager.PERMISSION_GRANTED;
  }

  private boolean hasBluetoothScanPermission() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
        || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN)
            == PackageManager.PERMISSION_GRANTED;
  }

  private String safeDeviceName(BluetoothDevice device) {
    try {
      String name = device != null ? device.getName() : null;
      return (name == null || name.trim().isEmpty()) ? "Unknown" : name;
    } catch (SecurityException ignored) {
      return "Unknown";
    }
  }

  private int safeBondState(BluetoothDevice device) {
    try {
      return device != null ? device.getBondState() : BluetoothDevice.BOND_NONE;
    } catch (SecurityException ignored) {
      return BluetoothDevice.BOND_NONE;
    }
  }

  private void resolveSavedCall(String callbackId, JSObject out) {
    new Handler(Looper.getMainLooper()).post(() -> {
      PluginCall saved = bridge.getSavedCall(callbackId);
      if (saved == null) return;
      try {
        saved.resolve(out);
      } finally {
        saved.release(getBridge());
      }
    });
  }

  private void rejectSavedCall(String callbackId, String message, Exception error) {
    new Handler(Looper.getMainLooper()).post(() -> {
      PluginCall saved = bridge.getSavedCall(callbackId);
      if (saved == null) return;
      try {
        if (error != null) saved.reject(message, error);
        else saved.reject(message);
      } finally {
        saved.release(getBridge());
      }
    });
  }

  // Ask runtime permissions (Android 12+ uses BLUETOOTH_CONNECT/SCAN)
  @PluginMethod()
  public void ensurePermissions(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      boolean connectOk = hasBluetoothConnectPermission();
      boolean scanOk = hasBluetoothScanPermission();
      if (!connectOk || !scanOk) {
        Activity activity = getActivity();
        if (activity == null) {
          call.reject("Activity unavailable");
          return;
        }
        bridge.saveCall(call);
        pendingPermCallbackId = call.getCallbackId();
        ArrayList<String> missing = new ArrayList<>();
        if (!connectOk) missing.add(Manifest.permission.BLUETOOTH_CONNECT);
        if (!scanOk) missing.add(Manifest.permission.BLUETOOTH_SCAN);
        ActivityCompat.requestPermissions(
          activity,
          missing.toArray(new String[0]),
          REQ_BT
        );
        return;
      }
    }
    call.resolve();
  }

  @Override
  public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQ_BT) return;

    PluginCall saved = null;
    if (pendingPermCallbackId != null) {
      saved = bridge.getSavedCall(pendingPermCallbackId);
      pendingPermCallbackId = null;
    }
    if (saved == null) return;

    if (hasBluetoothConnectPermission()) saved.resolve();
    else saved.reject("Bluetooth connect permission denied");
  }

  @PluginMethod()
  public void printUsbRaw(PluginCall call) {
    try {
      String b64 = call.getString("base64");
      if (b64 == null) { call.reject("base64 required"); return; }
      byte[] data = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
      UsbManager mgr = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
      for (UsbDevice dev : mgr.getDeviceList().values()) {
        for (int i=0;i<dev.getInterfaceCount();i++) {
          UsbInterface intf = dev.getInterface(i);
          for (int j=0;j<intf.getEndpointCount();j++) {
            UsbEndpoint ep = intf.getEndpoint(j);
            if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
              PendingIntent pi = PendingIntent.getBroadcast(getContext(), 0, new Intent("USB_PERMISSION"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
              if (!mgr.hasPermission(dev)) { mgr.requestPermission(dev, pi); }
              UsbDeviceConnection conn = mgr.openDevice(dev);
              conn.claimInterface(intf, true);
              conn.bulkTransfer(ep, data, data.length, 5000);
              conn.close();
              call.resolve();
              return;
            }
          }
        }
      }
      call.reject("No USB OUT endpoint");
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  @PluginMethod()
  public void printSunmiText(PluginCall call) {
    try {
      String text = call.getString("text", "");
      // SunmiPrinterService via AIDL; bind and print
      // ... bind service and send text with line feeds + cut
      call.resolve();
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  // One-time picker dialog: short discovery, list bonded + found, return {name,address}
  @PluginMethod()
  public void pickPrinter(PluginCall call) {
    if (!hasBluetoothConnectPermission()) {
      call.reject("Bluetooth connect permission not granted");
      return;
    }

    Activity activity = getActivity();
    if (activity == null) {
      call.reject("Activity unavailable");
      return;
    }

    activity.runOnUiThread(() -> {
      BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
      if (adapter == null) {
        call.reject("Bluetooth not supported");
        return;
      }

      try {
        if (!adapter.isEnabled()) {
          call.reject("Bluetooth disabled");
          return;
        }
      } catch (SecurityException e) {
        call.reject("Bluetooth connect permission not granted");
        return;
      }

      ArrayList<BluetoothDevice> devices = new ArrayList<>();
      ArrayList<String> labels = new ArrayList<>();

      try {
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded != null) {
          for (BluetoothDevice d : bonded) {
            devices.add(d);
            labels.add("Paired \u2022 " + safeDeviceName(d) + " (" + d.getAddress() + ")");
          }
        }
      } catch (Exception ignored) {}

      android.widget.ArrayAdapter<String> arrayAdapter =
          new android.widget.ArrayAdapter<>(activity, android.R.layout.select_dialog_item, labels);

      final BroadcastReceiver[] receiverRef = new BroadcastReceiver[1];
      final boolean[] receiverRegistered = new boolean[]{ false };

      Runnable cleanup = () -> {
        try { adapter.cancelDiscovery(); } catch (Exception ignored) {}
        if (receiverRegistered[0] && receiverRef[0] != null) {
          try { getContext().unregisterReceiver(receiverRef[0]); } catch (Exception ignored) {}
          receiverRegistered[0] = false;
        }
      };

      AlertDialog.Builder builder = new AlertDialog.Builder(activity);
      builder.setTitle("Select printer");
      builder.setAdapter(arrayAdapter, (dialog, which) -> {
        if (devices.isEmpty()) {
          cleanup.run();
          call.reject("No devices");
          return;
        }
        int idx = Math.max(0, Math.min(which, devices.size() - 1));
        BluetoothDevice chosen = devices.get(idx);
        JSObject out = new JSObject();
        out.put("name", safeDeviceName(chosen));
        out.put("address", chosen.getAddress());
        out.put("paired", safeBondState(chosen) == BluetoothDevice.BOND_BONDED);
        out.put("bondState", safeBondState(chosen));
        cleanup.run();
        call.resolve(out);
      });
      builder.setOnCancelListener(d -> {
        cleanup.run();
        call.reject("Picker cancelled");
      });
      AlertDialog dialog = builder.show();
      dialog.setOnDismissListener(d -> cleanup.run());

      if (!hasBluetoothScanPermission()) {
        return;
      }

      BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
          String action = intent.getAction();
          if (BluetoothDevice.ACTION_FOUND.equals(action)) {
            BluetoothDevice d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if (d == null) return;
            for (BluetoothDevice existing : devices) {
              if (existing.getAddress().equals(d.getAddress())) return;
            }
            devices.add(d);
            String prefix = safeBondState(d) == BluetoothDevice.BOND_BONDED ? "Paired \u2022 " : "Available \u2022 ";
            labels.add(prefix + safeDeviceName(d) + " (" + d.getAddress() + ")");
            arrayAdapter.notifyDataSetChanged();
          } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
            cleanup.run();
          }
        }
      };

      receiverRef[0] = receiver;
      try {
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
          getContext().registerReceiver(receiver, filter);
        }
        receiverRegistered[0] = true;
        try { adapter.cancelDiscovery(); } catch (Exception ignored) {}
        adapter.startDiscovery();
      } catch (Exception ignored) {
        cleanup.run();
      }
    });
  }

  // Optional: trigger system pairing (PIN often 0000/1234 on POS printers)
  @PluginMethod()
  public void pairDevice(PluginCall call) {
    String addr = call.getString("address");
    if (addr == null || addr.isEmpty()) { call.reject("address required"); return; }
    if (!hasBluetoothConnectPermission()) { call.reject("Bluetooth connect permission not granted"); return; }
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null) { call.reject("bluetooth unavailable"); return; }
    try {
      if (!adapter.isEnabled()) { call.reject("bluetooth disabled"); return; }
    } catch (SecurityException e) {
      call.reject("Bluetooth connect permission not granted");
      return;
    }

    try {
      BluetoothDevice d = adapter.getRemoteDevice(addr);
      if (safeBondState(d) == BluetoothDevice.BOND_BONDED) {
        JSObject out = new JSObject();
        out.put("started", false);
        out.put("paired", true);
        out.put("bondState", BluetoothDevice.BOND_BONDED);
        call.resolve(out);
        return;
      }

      bridge.saveCall(call);
      final String callbackId = call.getCallbackId();
      getBridge().execute(() -> {
        try {
          try { adapter.cancelDiscovery(); } catch (Exception ignored) {}

          boolean started = d.createBond();
          if (!started && safeBondState(d) == BluetoothDevice.BOND_NONE) {
            rejectSavedCall(callbackId, "Bluetooth pairing could not be started", null);
            return;
          }

          long deadline = System.currentTimeMillis() + 20000L;
          while (System.currentTimeMillis() < deadline) {
            int state = safeBondState(d);
            if (state == BluetoothDevice.BOND_BONDED) {
              try { Thread.sleep(400L); } catch (InterruptedException ignored) {}
              JSObject out = new JSObject();
              out.put("started", started);
              out.put("paired", true);
              out.put("bondState", state);
              resolveSavedCall(callbackId, out);
              return;
            }
            try { Thread.sleep(400L); } catch (InterruptedException ignored) {}
          }

          rejectSavedCall(callbackId, "Bluetooth pairing timed out. Pair the printer in Android settings and try again.", null);
        } catch (Exception e) {
          rejectSavedCall(callbackId, e.getMessage() != null ? e.getMessage() : "PAIR_FAILED", e);
        }
      });
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  // List currently bonded devices (debug/diagnostics)
  @PluginMethod()
  public void listBonded(PluginCall call) {
    if (!hasBluetoothConnectPermission()) { call.reject("Bluetooth connect permission not granted"); return; }
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    JSObject out = new JSObject();
    try {
      if (adapter != null && adapter.isEnabled()) {
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        int i = 0;
        for (BluetoothDevice d : bonded) {
          JSObject o = new JSObject();
          o.put("name", safeDeviceName(d));
          o.put("address", d.getAddress());
          out.put(String.valueOf(i++), o);
        }
      }
      call.resolve(out);
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  // Print raw ESC/POS (runs on a worker thread)
  @PluginMethod()
  public void printRaw(PluginCall call) {
    final String base64 = call.getString("base64");
    final String btAddress = call.getString("address");
    final String nameContains = call.getString("nameContains");

    if (base64 == null) { call.reject("base64 required"); return; }

    call.setKeepAlive(true);

    final byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);

    getBridge().execute(() -> {
      try {
        final boolean okUsb = tryUsb(getContext(), data);
        final boolean okBt = !okUsb && tryBluetooth(getContext(), data, btAddress, nameContains);

        final JSObject out = new JSObject();
        out.put("via", okUsb ? "usb" : (okBt ? "bt" : "none"));

        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
          try {
            if (okUsb || okBt) call.resolve(out);
            else call.reject("No USB/Bluetooth path");
          } finally {
            call.release(getBridge());
          }
        });
      } catch (Exception e) {
        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
          try {
            call.reject(e.getMessage() != null ? e.getMessage() : "PRINT_FAILED", e);
          } finally {
            call.release(getBridge());
          }
        });
      }
    });
  }

  @PluginMethod()
  public void printTcpRaw(PluginCall call) {
    final String base64 = call.getString("base64");
    final String host = call.getString("host");
    final Integer port = call.getInt("port", 9100);

    if (base64 == null) { call.reject("base64 required"); return; }
    if (host == null || host.trim().isEmpty()) { call.reject("host required"); return; }

    call.setKeepAlive(true);
    final byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);

    getBridge().execute(() -> {
      java.net.Socket socket = null;
      java.io.OutputStream os = null;
      try {
        socket = new java.net.Socket();
        socket.connect(new java.net.InetSocketAddress(host, port), 5000);
        socket.setSoTimeout(5000);

        os = socket.getOutputStream();

        // ESC/POS initialize
        os.write(new byte[]{ 0x1b, '@' });
        os.flush();

        // Chunked write (keeps old printers happy)
        final int CHUNK = 512;
        int offset = 0;
        while (offset < data.length) {
          int len = Math.min(CHUNK, data.length - offset);
          os.write(data, offset, len);
          os.flush();
          offset += len;
          try { Thread.sleep(5); } catch (InterruptedException ignored) {}
        }

        // Feed
        os.write(new byte[]{ 0x0a, 0x0a });
        os.flush();

        final JSObject out = new JSObject();
        out.put("via", "tcp");
        out.put("host", host);
        out.put("port", port);

        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
          try { call.resolve(out); }
          finally { call.release(getBridge()); }
        });

      } catch (Exception e) {
        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
          try { call.reject(e.getMessage() != null ? e.getMessage() : "TCP_PRINT_FAILED", e); }
          finally { call.release(getBridge()); }
        });
      } finally {
        try { if (os != null) os.close(); } catch (Exception ignored) {}
        try { if (socket != null) socket.close(); } catch (Exception ignored) {}
      }
    });
  }

  private boolean tryUsb(Context ctx, byte[] data) throws Exception {
    UsbManager mgr = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
    if (mgr == null) return false;
    for (UsbDevice dev : mgr.getDeviceList().values()) {
      if (!mgr.hasPermission(dev)) {
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, new Intent("USB_PERMISSION"), PendingIntent.FLAG_IMMUTABLE);
        mgr.requestPermission(dev, pi);
        continue;
      }
      UsbInterface iface = null;
      for (int i = 0; i < dev.getInterfaceCount(); i++) {
        UsbInterface cand = dev.getInterface(i);
        for (int a = 0; a < cand.getEndpointCount(); a++) {
          if (cand.getEndpoint(a).getDirection() == UsbConstants.USB_DIR_OUT) {
            iface = cand;
            break;
          }
        }
        if (iface != null) break;
      }
      if (iface == null) continue;
      UsbDeviceConnection conn = mgr.openDevice(dev);
      if (conn == null) continue;
      if (!conn.claimInterface(iface, true)) {
        conn.close();
        continue;
      }
      UsbEndpoint out = null;
      for (int a = 0; a < iface.getEndpointCount(); a++) {
        UsbEndpoint ep = iface.getEndpoint(a);
        if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
          out = ep;
          break;
        }
      }
      if (out == null) {
        conn.releaseInterface(iface);
        conn.close();
        continue;
      }
      int sent = conn.bulkTransfer(out, data, data.length, 5000);
      conn.releaseInterface(iface);
      conn.close();
      if (sent > 0) return true;
    }
    return false;
  }

  // Helper to prefer printer-like bonded devices
  private BluetoothDevice findPrinterLike(Set<BluetoothDevice> bonded) {
    if (bonded == null || bonded.isEmpty()) return null;
    BluetoothDevice fallback = null;
    for (BluetoothDevice d : bonded) {
      if (d == null) continue;
      String n = d.getName() == null ? "" : d.getName();
      String lower = n.toLowerCase();
      if (lower.contains("printer") || lower.contains("pos") || lower.contains("simu") || lower.contains("i9100")) {
        return d;
      }
      if (fallback == null) {
        fallback = d;
      }
    }
    return fallback;
  }

  private boolean tryBluetooth(Context ctx, byte[] data, String targetAddress, String nameContains) throws Exception {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
        throw new SecurityException("BLUETOOTH_CONNECT not granted");
      }
    }
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null || !adapter.isEnabled()) return false;

    try { adapter.cancelDiscovery(); } catch (Exception ignored) {}

    Set<BluetoothDevice> bonded = adapter.getBondedDevices();
    if (bonded == null || bonded.isEmpty()) return false;

    // 1) Exact address
    BluetoothDevice chosen = null;
    if (targetAddress != null && !targetAddress.isEmpty()) {
      for (BluetoothDevice d : bonded) {
        if (d.getAddress() != null && d.getAddress().equalsIgnoreCase(targetAddress)) {
          chosen = d;
          break;
        }
      }
      if (chosen == null) return false;
      return connectAndWrite(chosen, data);
    }

    // 2) Name hint, then printer-like fallback
    if (nameContains != null && !nameContains.isEmpty()) {
      for (BluetoothDevice d : bonded) {
        String n = d.getName() == null ? "" : d.getName();
        if (n.toLowerCase().contains(nameContains.toLowerCase())) {
          chosen = d;
          break;
        }
      }
      if (chosen != null) {
        return connectAndWrite(chosen, data);
      }

      BluetoothDevice printerLike = findPrinterLike(bonded);
      if (printerLike != null) {
        return connectAndWrite(printerLike, data);
      }
      return false;
    }

    // 3) No explicit hint - prefer printer-like, else first bonded
    BluetoothDevice printerLike = findPrinterLike(bonded);
    if (printerLike != null) {
      return connectAndWrite(printerLike, data);
    }

    BluetoothDevice[] arr = bonded.toArray(new BluetoothDevice[0]);
    if (arr.length == 0) return false;
    return connectAndWrite(arr[0], data);
  }

  private boolean connectAndWrite(BluetoothDevice dev, byte[] data) {
    BluetoothSocket sock = null;
    final boolean slow = data != null && data.length > 8 * 1024;

    final int CHUNK = slow ? 128 : 256;
    final int SLEEP_BETWEEN = slow ? 35 : 15;
    final int SLEEP_BEFORE_CLOSE = slow ? 900 : 350;
    try {
      if (safeBondState(dev) != BluetoothDevice.BOND_BONDED) return false;
      try { BluetoothAdapter.getDefaultAdapter().cancelDiscovery(); } catch (Exception ignored) {}

      // Create RFCOMM socket
      try {
        sock = dev.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
      } catch (Exception e) {
        sock = dev.createRfcommSocketToServiceRecord(SPP_UUID);
      }

      sock.connect();
      OutputStream os = sock.getOutputStream();

      // HARD RESET BEFORE EACH JOB
      os.write(new byte[]{ 0x1b, '@' });  // ESC @
      os.flush();
      try { Thread.sleep(80); } catch (InterruptedException ignored) {}

      // CHUNKED WRITE
      int offset = 0;
      while (offset < data.length) {
        int len = Math.min(CHUNK, data.length - offset);
        os.write(data, offset, len);
        os.flush();
        offset += len;
        try { Thread.sleep(SLEEP_BETWEEN); } catch (InterruptedException ignored) {}
      }

      os.write(new byte[]{ 0x0a, 0x0a });
      os.flush();
      try { Thread.sleep(SLEEP_BEFORE_CLOSE); } catch (InterruptedException ignored) {}
      os.close();
      return true;

    } catch (Exception ex) {
      // Fallback reflection socket
      try {
        BluetoothSocket alt = (BluetoothSocket) dev.getClass()
          .getMethod("createRfcommSocket", int.class).invoke(dev, 1);
        alt.connect();
        OutputStream os = alt.getOutputStream();

        os.write(new byte[]{ 0x1b, '@' });
        os.flush();
        try { Thread.sleep(80); } catch (InterruptedException ignored) {}

        int offset = 0;
        while (offset < data.length) {
          int len = Math.min(CHUNK, data.length - offset);
          os.write(data, offset, len);
          os.flush();
          offset += len;
          try { Thread.sleep(SLEEP_BETWEEN); } catch (InterruptedException ignored) {}
        }

        os.write(new byte[]{ 0x0a, 0x0a });
        os.flush();
        try { Thread.sleep(SLEEP_BEFORE_CLOSE); } catch (InterruptedException ignored) {}

        os.close();
        alt.close();
        return true;
      } catch (Exception ignored) {
        return false;
      }
    } finally {
      if (sock != null) {
        try { sock.close(); } catch (Exception ignored) {}
      }
    }
  }
}
