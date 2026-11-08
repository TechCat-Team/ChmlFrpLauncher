package main

import "C"

import (
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/fatedier/frp/cmd/frpc/sub"
	_ "github.com/fatedier/frp/web/frpc"
)

//export chmlfrpRun
func chmlfrpRun(configPath *C.char) {
	// Workers can outlive the GUI and its log pipes.
	if runtime.GOOS != "windows" {
		signal.Ignore(syscall.SIGPIPE)
	}
	os.Args = []string{"frpc", "--config", C.GoString(configPath)}
	sub.Execute()
}

func main() {}
