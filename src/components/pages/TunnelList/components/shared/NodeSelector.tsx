import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getStoredUser, type Node } from "@/services/api";
import { toast } from "sonner";

interface NodeSelectorProps {
  nodes: Node[];
  loading: boolean;
  onNodeSelect: (node: Node) => void;
}

export function NodeSelector({
  nodes,
  loading,
  onNodeSelect,
}: NodeSelectorProps) {
  // 按节点组分组
  const vipNodes = nodes.filter((node) => node.nodegroup === "vip");
  const userNodes = nodes.filter((node) => node.nodegroup === "user");

  // 根据用户权限确定默认展开的 Accordion 项
  const user = getStoredUser();
  const isFreeUser = user?.usergroup === "免费用户";
  const defaultOpenValues = isFreeUser ? ["user"] : ["vip", "user"];

  const handleNodeSelect = (node: Node) => {
    if (isFreeUser && node.nodegroup === "vip") {
      toast.error("此节点为会员节点，您的权限不足");
      return;
    }
    onNodeSelect(node);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-4">
      <Accordion
        type="multiple"
        defaultValue={defaultOpenValues}
        className="space-y-3"
      >
        {vipNodes.length > 0 && (
          <AccordionItem value="vip" className="border-0">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-3 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-gradient-to-b from-primary/80 to-primary rounded-full" />
                  <h3 className="text-sm font-semibold">会员节点</h3>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  {vipNodes.length} 个节点
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="grid grid-cols-3 gap-3">
                {vipNodes.map((node) => (
                  <Tooltip key={node.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleNodeSelect(node)}
                        disabled={loading}
                        className="group relative px-3 pt-2.5 pb-3 border border-border/60 rounded-xl hover:border-primary hover:bg-accent/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all" />
                        <div className="relative space-y-1">
                          <span className="block text-[10px] text-muted-foreground font-medium leading-tight">
                            #{node.id}
                          </span>
                          <h4 className="font-semibold text-sm group-hover:text-primary transition-colors leading-snug">
                            {node.name}
                          </h4>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[240px] text-pretty"
                    >
                      <div className="space-y-1">
                        {node.notes && (
                          <p className="text-xs leading-snug">{node.notes}</p>
                        )}
                        <div className="flex gap-2 text-[10px] whitespace-nowrap">
                          <span
                            className={
                              node.fangyu === "true"
                                ? "opacity-100"
                                : "opacity-40"
                            }
                          >
                            {node.fangyu === "true" ? "✓" : "✗"} 防御
                          </span>
                          <span
                            className={
                              node.udp === "true" ? "opacity-100" : "opacity-40"
                            }
                          >
                            {node.udp === "true" ? "✓" : "✗"} UDP
                          </span>
                          <span
                            className={
                              node.web === "yes" ? "opacity-100" : "opacity-40"
                            }
                          >
                            {node.web === "yes" ? "✓" : "✗"} 建站
                          </span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {userNodes.length > 0 && (
          <AccordionItem value="user" className="border-0">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-3 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-gradient-to-b from-primary/60 to-primary/80 rounded-full" />
                  <h3 className="text-sm font-semibold">非会员节点</h3>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  {userNodes.length} 个节点
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="grid grid-cols-3 gap-3">
                {userNodes.map((node) => (
                  <Tooltip key={node.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleNodeSelect(node)}
                        disabled={loading}
                        className="group relative px-3 pt-2.5 pb-3 border border-border/60 rounded-xl hover:border-primary hover:bg-accent/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all" />
                        <div className="relative space-y-1">
                          <span className="block text-[10px] text-muted-foreground font-medium leading-tight">
                            #{node.id}
                          </span>
                          <h4 className="font-semibold text-sm group-hover:text-primary transition-colors leading-snug">
                            {node.name}
                          </h4>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[240px] text-pretty"
                    >
                      <div className="space-y-1">
                        {node.notes && (
                          <p className="text-xs leading-snug">{node.notes}</p>
                        )}
                        <div className="flex gap-2 text-[10px] whitespace-nowrap">
                          <span
                            className={
                              node.fangyu === "true"
                                ? "opacity-100"
                                : "opacity-40"
                            }
                          >
                            {node.fangyu === "true" ? "✓" : "✗"} 防御
                          </span>
                          <span
                            className={
                              node.udp === "true" ? "opacity-100" : "opacity-40"
                            }
                          >
                            {node.udp === "true" ? "✓" : "✗"} UDP
                          </span>
                          <span
                            className={
                              node.web === "yes" ? "opacity-100" : "opacity-40"
                            }
                          >
                            {node.web === "yes" ? "✓" : "✗"} 建站
                          </span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {nodes.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <svg
                className="w-8 h-8 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">
              没有找到符合条件的节点
            </p>
          </div>
        )}
      </Accordion>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground shrink-0">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>加载节点信息中...</span>
        </div>
      )}
    </div>
  );
}
