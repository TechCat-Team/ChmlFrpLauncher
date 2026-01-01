import { ScrollArea } from "../ui/scroll-area";

export function Logs() {
  return (
    <div className="flex flex-col h-full gap-4">
      <h1 className="text-xl font-medium text-foreground">日志</h1>

      <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 font-mono text-[13px] text-muted-foreground">
            <div className="text-sm">等待日志输出...</div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

