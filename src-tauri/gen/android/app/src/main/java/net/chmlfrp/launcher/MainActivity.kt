package net.chmlfrp.launcher

import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  // 将 ChmlBridge 类交给 Rust，以便 Rust 在任意线程回调（非主线程无法通过 FindClass 找到应用类）
  private external fun nativeInit(bridge: Class<*>)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    ChmlBridge.attach(this)
    nativeInit(ChmlBridge::class.java)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == 1001 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      TunnelService.refreshNotification(applicationContext)
    }
  }

  override fun onDestroy() {
    ChmlBridge.detach(this)
    super.onDestroy()
  }
}
