package net.chmlfrp.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * 隧道前台服务：有隧道运行时常驻通知栏，提升进程优先级，避免应用切到后台后被系统回收。
 * FRP 核心仍运行在应用进程内，本服务只负责保活和展示状态。
 */
class TunnelService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val count = intent?.getIntExtra(EXTRA_COUNT, 0) ?: 0
        if (count <= 0) {
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = buildNotification(this, count)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        running = true
        acquireWakeLock()
        // 进程被杀后隧道已不存在，不需要系统自动重启空服务
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    // 保持 CPU 运行，确保锁屏后 FRP 心跳和数据转发不中断
    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ChmlFrp:tunnels").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    companion object {
        private const val CHANNEL_ID = "tunnels"
        private const val NOTIFICATION_ID = 1001
        private const val EXTRA_COUNT = "count"

        @Volatile
        var running = false
            private set

        @Volatile
        private var lastCount = 0

        /** 用户授予通知权限后重新发布通知，否则授权前发出的前台服务通知不会显示 */
        fun refreshNotification(context: Context) {
            if (!running || lastCount <= 0) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, buildNotification(context, lastCount))
        }

        fun update(context: Context, count: Int) {
            lastCount = count
            val intent = Intent(context, TunnelService::class.java).putExtra(EXTRA_COUNT, count)
            if (count <= 0) {
                context.stopService(intent)
                return
            }
            ensureChannel(context)
            if (running) {
                // 服务已在前台运行：只刷新通知内容，避免从后台重复启动前台服务被系统拒绝
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIFICATION_ID, buildNotification(context, count))
            } else {
                ContextCompat.startForegroundService(context, intent)
            }
        }

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(CHANNEL_ID, "隧道运行状态", NotificationManager.IMPORTANCE_LOW).apply {
                description = "隧道运行时显示的常驻通知"
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }

        private fun buildNotification(context: Context, count: Int): Notification {
            ensureChannel(context)
            val launch = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val pending = PendingIntent.getActivity(
                context, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_tunnel)
                .setContentTitle("ChmlFrp 隧道运行中")
                .setContentText("$count 个隧道正在运行，点击返回应用")
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build()
        }
    }
}
