package net.chmlfrp.launcher

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * 供 Rust 通过 JNI 调用的静态方法集合。Rust 可能在任意线程调用这些方法。
 */
object ChmlBridge {
    private lateinit var appContext: Context
    private var activity: WeakReference<Activity>? = null
    private var notificationAsked = false

    fun attach(activity: Activity) {
        appContext = activity.applicationContext
        this.activity = WeakReference(activity)
    }

    fun detach(activity: Activity) {
        if (this.activity?.get() === activity) this.activity = null
    }

    /** 根据正在运行的隧道数量启动、刷新或停止前台服务 */
    @JvmStatic
    fun updateTunnels(count: Int) {
        if (!::appContext.isInitialized) return
        if (count > 0) requestNotificationPermission()
        TunnelService.update(appContext, count)
    }

    @JvmStatic
    fun isIgnoringBatteryOptimizations(): Boolean {
        if (!::appContext.isInitialized || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val power = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        return power.isIgnoringBatteryOptimizations(appContext.packageName)
    }

    /** 弹出系统对话框，请求将应用加入电池优化白名单 */
    @SuppressLint("BatteryLife")
    @JvmStatic
    fun requestIgnoreBatteryOptimizations(): Boolean {
        val current = activity?.get() ?: return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        current.runOnUiThread {
            val request = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:${current.packageName}"))
            try {
                current.startActivity(request)
            } catch (_: Exception) {
                current.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }
        return true
    }

    /**
     * 当前网络的 HTTP 代理（Wi-Fi 或全局代理），格式为 `http://host:port`，没有时返回空字符串。
     * Rust 侧的 reqwest 无法读取 Android 系统代理，关闭“绕过代理”时通过这里获取。
     * 仅支持手动代理，PAC 自动配置不受支持。
     */
    @JvmStatic
    fun getSystemProxy(): String {
        if (!::appContext.isInitialized) return ""
        var host: String? = null
        var port = -1
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val connectivity = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivity.defaultProxy?.let {
                host = it.host
                port = it.port
            }
        }
        if (host.isNullOrEmpty() || port <= 0) {
            host = System.getProperty("http.proxyHost")
            port = System.getProperty("http.proxyPort")?.toIntOrNull() ?: -1
        }
        val proxyHost = host
        return if (proxyHost.isNullOrEmpty() || port <= 0) "" else "http://$proxyHost:$port"
    }

    /** 打开应用详情页，方便用户在厂商系统中设置自启动、后台运行等权限 */
    @JvmStatic
    fun openAppSettings(): Boolean {
        val current = activity?.get() ?: return false
        current.runOnUiThread {
            current.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:${current.packageName}")),
            )
        }
        return true
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationAsked) return
        val granted = ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) return
        val current = activity?.get() ?: return
        notificationAsked = true
        current.runOnUiThread {
            current.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }
}
