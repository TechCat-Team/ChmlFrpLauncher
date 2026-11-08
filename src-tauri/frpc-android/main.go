package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fatedier/frp/client"
	"github.com/fatedier/frp/pkg/config"
	"github.com/fatedier/frp/pkg/config/source"
	"github.com/fatedier/frp/pkg/config/v1/validation"
	"github.com/fatedier/frp/pkg/policy/security"
	frplog "github.com/fatedier/frp/pkg/util/log"
	"github.com/fatedier/frp/pkg/util/xlog"
	goliblog "github.com/fatedier/golib/log"
)

type tunnel struct {
	cancel    context.CancelFunc
	done      chan struct{}
	service   *client.Service
	proxyName string
	ctx       context.Context
	secrets   []string
}

// redact 去除错误信息中的用户令牌和节点令牌
func redactAll(message string, secrets []string) string {
	for _, secret := range secrets {
		if secret != "" {
			message = strings.ReplaceAll(message, secret, "***")
		}
	}
	return message
}

func redact(message string, secrets []string) string {
	message = redactAll(message, secrets)
	if len([]rune(message)) > 200 {
		message = string([]rune(message)[:200]) + "…"
	}
	return message
}

// describeError 将 FRP 返回的错误归类为用户可理解的提示
func describeError(err error, secrets []string) string {
	raw := err.Error()
	if i := strings.Index(raw, ". With loginFailExit"); i >= 0 {
		raw = raw[:i]
	}
	raw = strings.TrimPrefix(raw, "login to the server failed: ")
	raw = redact(raw, secrets)
	lower := strings.ToLower(raw)
	switch {
	case strings.Contains(lower, "no such host"):
		return "无法解析节点域名，请检查网络或 DNS：" + raw
	case strings.Contains(lower, "refused"):
		return "节点拒绝连接，节点可能离线：" + raw
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "unreachable"):
		return "连接节点超时，请检查网络：" + raw
	case strings.Contains(lower, "tls") || strings.Contains(lower, "certificate"):
		return "TLS 握手失败，请尝试切换强制 TLS 设置：" + raw
	case strings.Contains(lower, "token") || strings.Contains(lower, "auth"):
		return "节点认证失败，请检查账户令牌或重新登录：" + raw
	default:
		return "连接已中断：" + raw
	}
}

type logLine struct {
	Seq      int64  `json:"seq"`
	TunnelID int    `json:"tunnel_id"`
	Message  string `json:"message"`
	Time     string `json:"timestamp"`
}

const maxLogLines = 2000

var logs = struct {
	sync.Mutex
	lines   []logLine
	seq     int64
	partial []byte
	// 各隧道的令牌，用于在日志中脱敏；隧道停止后仍保留，以覆盖退出阶段的日志
	secrets map[int][]string
	// 运行中隧道配置的日志等级（log.level），用于按隧道过滤 FRP 日志
	levels map[int]goliblog.Level
}{secrets: make(map[int][]string), levels: make(map[int]goliblog.Level)}

// 日志行格式：2026-01-02 15:04:05.000 [I] [file.go:1] ...
var linePrefix = regexp.MustCompile(`^\S+ \S+ \[([TDIWE])\] `)

var levelByLetter = map[string]goliblog.Level{
	"T": goliblog.TraceLevel, "D": goliblog.DebugLevel, "I": goliblog.InfoLevel,
	"W": goliblog.WarnLevel, "E": goliblog.ErrorLevel,
}

// configuredLevel 解析配置中的 log.level，无效时回退到 info
func configuredLevel(text string) goliblog.Level {
	if level, err := goliblog.ParseLevel(text); err == nil {
		return level
	}
	return goliblog.InfoLevel
}

// logThreshold 在持有 logs 锁时调用：隧道日志使用该隧道配置的等级；
// 无法归属到隧道的全局日志使用所有运行中隧道里最详细的等级
func logThreshold(id int) goliblog.Level {
	if level, ok := logs.levels[id]; ok {
		return level
	}
	if id != 0 || len(logs.levels) == 0 {
		return goliblog.InfoLevel
	}
	threshold := goliblog.ErrorLevel
	for _, level := range logs.levels {
		if level < threshold {
			threshold = level
		}
	}
	return threshold
}

var tunnelPrefix = regexp.MustCompile(`\[chml#(\d+)\] `)

// appendLog 在持有 logs 锁时调用
func appendLog(id int, message string) {
	for tunnelID, secrets := range logs.secrets {
		if id == 0 || id == tunnelID {
			message = redactAll(message, secrets)
		}
	}
	logs.seq++
	logs.lines = append(logs.lines, logLine{
		Seq: logs.seq, TunnelID: id, Message: message,
		Time: time.Now().Format("2006/01/02 15:04:05"),
	})
	if len(logs.lines) > maxLogLines {
		logs.lines = append([]logLine(nil), logs.lines[len(logs.lines)-maxLogLines:]...)
	}
}

func launcherLog(id int, level string, message string) {
	logs.Lock()
	appendLog(id, fmt.Sprintf("[%s] [ChmlFrpLauncher] %s", level, message))
	logs.Unlock()
}

// logWriter 接收 FRP 的日志输出，按隧道前缀归类并脱敏后写入内存缓冲区，不写入 logcat
type logWriter struct{}

func (logWriter) Write(p []byte) (int, error) {
	logs.Lock()
	defer logs.Unlock()
	logs.partial = append(logs.partial, p...)
	for {
		i := bytes.IndexByte(logs.partial, '\n')
		if i < 0 {
			break
		}
		line := strings.TrimRight(string(logs.partial[:i]), "\r")
		logs.partial = logs.partial[i+1:]
		id := 0
		if m := tunnelPrefix.FindStringSubmatch(line); m != nil {
			id, _ = strconv.Atoi(m[1])
			line = strings.Replace(line, m[0], "", 1)
		}
		if m := linePrefix.FindStringSubmatch(line); m != nil && levelByLetter[m[1]] < logThreshold(id) {
			continue
		}
		if line != "" {
			appendLog(id, line)
		}
	}
	return len(p), nil
}

var tunnels = struct {
	sync.Mutex
	active map[int]*tunnel
	errors map[int]string
}{active: make(map[int]*tunnel), errors: make(map[int]string)}

func start(id int, path string) error {
	result, err := config.LoadClientConfigResult(path, true)
	if err != nil {
		return err
	}
	if result.Common.Store.IsEnabled() || len(result.Common.IncludeConfigFiles) != 0 {
		return fmt.Errorf("Android 暂不支持外部配置文件和配置存储")
	}
	sourceConfig := source.NewConfigSource()
	if err = sourceConfig.ReplaceAll(result.Proxies, result.Visitors); err != nil {
		return err
	}
	aggregator := source.NewAggregator(sourceConfig)
	proxies, visitors, err := aggregator.Load()
	if err != nil {
		return err
	}
	proxies, visitors = config.FilterClientConfigurers(result.Common, proxies, visitors)
	proxies = config.CompleteProxyConfigurers(proxies)
	visitors = config.CompleteVisitorConfigurers(visitors)
	unsafeFeatures := security.NewUnsafeFeatures(nil)
	if _, err = validation.ValidateAllClientConfig(result.Common, proxies, visitors, unsafeFeatures); err != nil {
		return err
	}
	service, err := client.NewService(client.ServiceOptions{
		Common: result.Common, ConfigSourceAggregator: aggregator,
		UnsafeFeatures: unsafeFeatures,
	})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	runCtx := xlog.NewContext(ctx, xlog.New().AddPrefix(xlog.LogPrefix{
		Name: "chml", Value: fmt.Sprintf("chml#%d", id), Priority: 1,
	}))
	name := ""
	if len(proxies) > 0 {
		name = proxies[0].GetBaseConfig().Name
	}
	item := &tunnel{cancel: cancel, done: make(chan struct{}), service: service, proxyName: name, ctx: ctx,
		secrets: []string{result.Common.User, result.Common.Auth.Token}}
	tunnels.Lock()
	if old, exists := tunnels.active[id]; exists {
		tunnels.Unlock()
		if old.ctx.Err() == nil {
			cancel()
			return fmt.Errorf("隧道已在运行")
		}
		// 旧隧道正在停止：短暂等待其退出后再启动
		select {
		case <-old.done:
		case <-time.After(5 * time.Second):
			cancel()
			return fmt.Errorf("隧道正在停止，请稍后重试")
		}
		tunnels.Lock()
		if _, still := tunnels.active[id]; still {
			tunnels.Unlock()
			cancel()
			return fmt.Errorf("隧道正在停止，请稍后重试")
		}
	}
	delete(tunnels.errors, id)
	tunnels.active[id] = item
	tunnels.Unlock()
	logs.Lock()
	logs.secrets[id] = item.secrets
	logs.levels[id] = configuredLevel(result.Common.Log.Level)
	logs.Unlock()
	launcherLog(id, "I", fmt.Sprintf("隧道已启动，正在连接 %s:%d ...", result.Common.ServerAddr, result.Common.ServerPort))
	go func() {
		defer close(item.done)
		defer func() {
			tunnels.Lock()
			current := tunnels.active[id] == item
			if current {
				delete(tunnels.active, id)
			}
			tunnels.Unlock()
			// 同 ID 已被新隧道取代时保留新隧道的日志等级
			if current {
				logs.Lock()
				delete(logs.levels, id)
				logs.Unlock()
			}
		}()
		err := service.Run(runCtx)
		if err != nil && ctx.Err() == nil {
			message := describeError(err, item.secrets)
			tunnels.Lock()
			tunnels.errors[id] = message
			tunnels.Unlock()
			launcherLog(id, "E", message)
		} else if ctx.Err() != nil {
			launcherLog(id, "I", "隧道已停止")
		}
	}()
	return nil
}

//export ChmlStart
func ChmlStart(id C.int, configPath *C.char) *C.char {
	if err := start(int(id), C.GoString(configPath)); err != nil {
		return C.CString(err.Error())
	}
	return nil
}

//export ChmlStop
func ChmlStop(id C.int) *C.char {
	tunnels.Lock()
	item := tunnels.active[int(id)]
	tunnels.Unlock()
	if item == nil {
		// 已经退出（例如连接失败）时停止视为成功，并清除残留错误
		tunnels.Lock()
		delete(tunnels.errors, int(id))
		tunnels.Unlock()
		return nil
	}
	item.cancel()
	select {
	case <-item.done:
		return nil
	case <-time.After(10 * time.Second):
		return C.CString("隧道正在停止，请稍后重试")
	}
}

//export ChmlStatus
func ChmlStatus(id C.int) *C.char {
	tunnels.Lock()
	item := tunnels.active[int(id)]
	lastError := tunnels.errors[int(id)]
	tunnels.Unlock()
	status := map[string]string{"state": "stopped", "error": lastError}
	if item != nil {
		status["state"] = "connecting"
		if proxyStatus, ok := item.service.StatusExporter().GetProxyStatus(item.proxyName); ok {
			switch proxyStatus.Phase {
			case "running":
				status["state"] = "connected"
			case "start error", "check failed":
				status["state"] = "error"
				status["error"] = "节点未能启动隧道"
				if proxyStatus.Err != "" {
					status["error"] += "：" + redact(proxyStatus.Err, item.secrets)
				}
			}
		}
	} else if lastError != "" {
		status["state"] = "error"
	}
	data, _ := json.Marshal(status)
	return C.CString(string(data))
}

//export ChmlRunning
func ChmlRunning(id C.int) C.int {
	tunnels.Lock()
	defer tunnels.Unlock()
	if tunnels.active[int(id)] != nil {
		return 1
	}
	return 0
}

// ChmlRunningIDs 返回所有仍在运行（含正在连接）的隧道 ID，JSON 数组
//
//export ChmlRunningIDs
func ChmlRunningIDs() *C.char {
	tunnels.Lock()
	ids := make([]int, 0, len(tunnels.active))
	for id := range tunnels.active {
		ids = append(ids, id)
	}
	tunnels.Unlock()
	data, _ := json.Marshal(ids)
	return C.CString(string(data))
}

//export ChmlLogs
func ChmlLogs(after C.longlong) *C.char {
	logs.Lock()
	result := struct {
		Next  int64     `json:"next"`
		Lines []logLine `json:"lines"`
	}{Next: logs.seq, Lines: []logLine{}}
	for _, line := range logs.lines {
		if line.Seq > int64(after) {
			result.Lines = append(result.Lines, line)
		}
	}
	logs.Unlock()
	data, _ := json.Marshal(result)
	return C.CString(string(data))
}

func init() {
	// FRP 日志可能包含用户 token：只写入脱敏后的内存缓冲区，不写入 Android logcat。
	// 全局放开到 trace，再由 logWriter 按各隧道配置的 log.level 过滤，
	// 避免运行中替换全局 Logger 带来的数据竞争。
	frplog.Logger = frplog.Logger.WithOptions(
		goliblog.WithOutput(logWriter{}),
		goliblog.WithLevel(goliblog.TraceLevel),
	)
}
func main() {}
