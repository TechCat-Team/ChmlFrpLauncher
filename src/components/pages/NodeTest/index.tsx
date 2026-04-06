import { useState, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Network, Play, RefreshCw, CheckCircle2, XCircle, Clock, Filter, History, Globe, Users, ArrowUpDown, ArrowUp, ArrowDown, Search, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { fetchNodes, fetchNodeInfo, type Node, type StoredUser } from "@/services/api";
import { invoke } from "@tauri-apps/api/core";
import { getInitialEffectType, type EffectType } from "@/components/pages/Settings/utils";

interface NodeTestProps {
  user: StoredUser | null;
}

interface TcpingResult {
  success: boolean;
  latency?: number;
  error?: string;
  raw_output?: string;
}

interface NodeWithTest extends Node {
  testStatus?: "idle" | "testing" | "success" | "failed";
  latency?: number;
  error?: string;
  lastTested?: number;
}

interface TestHistory {
  id: string;
  nodeId: number;
  nodeName: string;
  area: string;
  nodegroup: string;
  china: string;
  success: boolean;
  latency?: number;
  error?: string;
  timestamp: number;
}

type UserTypeFilter = "all" | "vip" | "normal";
type RegionFilter = "all" | "domestic" | "foreign";

const regionOptions = [
  { value: "all", label: "全部" },
  { value: "domestic", label: "国内" },
  { value: "foreign", label: "国外" },
];

const userTypeOptions = [
  { value: "all", label: "全部" },
  { value: "vip", label: "VIP" },
  { value: "normal", label: "普通" },
];

export function NodeTest({ user }: NodeTestProps) {
  const [nodes, setNodes] = useState<NodeWithTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testHistory, setTestHistory] = useState<TestHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [userTypeFilter, setUserTypeFilter] = useState<UserTypeFilter>("all");
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [effectType, setEffectType] = useState<EffectType>(() =>
    getInitialEffectType(),
  );
  const [sortField, setSortField] = useState<string | null>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const handleEffectTypeChange = () => {
      const stored = localStorage.getItem("effectType");
      if (
        stored === "frosted" ||
        stored === "translucent" ||
        stored === "none"
      ) {
        setEffectType(stored);
      }
    };

    window.addEventListener("effectTypeChanged", handleEffectTypeChange);
    return () => {
      window.removeEventListener("effectTypeChanged", handleEffectTypeChange);
    };
  }, []);

  const loadNodes = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const fetchedNodes = await fetchNodes();
      setNodes(fetchedNodes.map((node) => ({ ...node, testStatus: "idle" as const })));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "获取节点列表失败";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    const saved = localStorage.getItem("node_test_history");
    if (saved) {
      try {
        setTestHistory(JSON.parse(saved));
      } catch {
        setTestHistory([]);
      }
    }
    setHistoryLoading(false);
  }, []);

  const saveHistory = useCallback((history: TestHistory[]) => {
    setTestHistory(history);
    localStorage.setItem("node_test_history", JSON.stringify(history));
  }, []);

  useEffect(() => {
    if (user) {
      void loadNodes();
      loadHistory();
    }
  }, [user, loadNodes, loadHistory]);

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  const toggleSelectNode = useCallback((nodeId: number) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const highlightText = useCallback((text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  }, []);

  const filteredNodes = useMemo(() => {
    let result = nodes.filter((node) => {
      let matchesSearch = true;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        matchesSearch =
          node.name.toLowerCase().includes(q) ||
          node.area.toLowerCase().includes(q) ||
          node.nodegroup.toLowerCase().includes(q);
      }
      
      let matchesRegion = true;
      if (regionFilter === "domestic") {
        matchesRegion = node.china === "yes";
      } else if (regionFilter === "foreign") {
        matchesRegion = node.china === "no";
      }
      
      let matchesUserType = true;
      if (userTypeFilter === "vip") {
        matchesUserType = node.nodegroup === "vip";
      } else if (userTypeFilter === "normal") {
        matchesUserType = node.nodegroup !== "vip";
      }
      
      return matchesSearch && matchesRegion && matchesUserType;
    });
    
    if (sortField) {
      result = [...result].sort((a, b) => {
        if (sortField === "id") {
          return sortDirection === "asc" ? a.id - b.id : b.id - a.id;
        } else if (sortField === "latency") {
          const aLatency = a.latency ?? Infinity;
          const bLatency = b.latency ?? Infinity;
          return sortDirection === "asc" ? aLatency - bLatency : bLatency - aLatency;
        }
        return 0;
      });
    }
    
    return result;
  }, [nodes, regionFilter, userTypeFilter, sortField, sortDirection, searchQuery]);

  const toggleSelectAll = useCallback(() => {
    if (selectedNodeIds.size === filteredNodes.length) {
      setSelectedNodeIds(new Set());
    } else {
      setSelectedNodeIds(new Set(filteredNodes.map((n) => n.id)));
    }
  }, [filteredNodes, selectedNodeIds.size]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, nodeId: number, index: number) => {
      if (e.shiftKey && lastClickedIndex !== null) {
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        const rangeIds = filteredNodes.slice(start, end + 1).map((n) => n.id);
        setSelectedNodeIds(new Set(rangeIds));
      } else {
        toggleSelectNode(nodeId);
      }
      setLastClickedIndex(index);
    },
    [filteredNodes, lastClickedIndex, toggleSelectNode],
  );

  const filteredHistory = useMemo(() => {
    return testHistory.filter((record) => {
      const matchesRegion = regionFilter === "all" || 
        (regionFilter === "domestic" && record.china === "yes") ||
        (regionFilter === "foreign" && record.china === "no");
      
      return matchesRegion;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [testHistory, regionFilter, userTypeFilter]);

  const addToHistory = useCallback((node: NodeWithTest, success: boolean, latency?: number, error?: string) => {
    const newRecord: TestHistory = {
      id: Date.now().toString(),
      nodeId: node.id,
      nodeName: node.name,
      area: node.area,
      nodegroup: node.nodegroup,
      china: node.china,
      success,
      latency,
      error,
      timestamp: Date.now(),
    };
    
    saveHistory([newRecord, ...testHistory].slice(0, 100));
  }, [testHistory, saveHistory]);

  const testSingleNode = useCallback(async (node: NodeWithTest) => {
    if (!user) return;

    try {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id ? { ...n, testStatus: "testing" } : n
        )
      );

      console.log(`[NodeTest] ====== 开始测试节点: ${node.name} (ID: ${node.id}) ======`);
      
      console.log(`[NodeTest] [1] 获取节点信息: ${node.name}`);
      const nodeInfo = await fetchNodeInfo(node.name);
      console.log(`[NodeTest] [2] 节点详细信息:`, nodeInfo);
      
      const host = nodeInfo.real_IP || nodeInfo.realIp || nodeInfo.ip;
      console.log(`[NodeTest] [3] 解析到的IP地址: ${host} (real_IP: ${nodeInfo.real_IP}, realIp: ${nodeInfo.realIp}, ip: ${nodeInfo.ip})`);
      
      if (!host) {
        console.error(`[NodeTest] [错误] 无法获取节点IP地址`);
        throw new Error("无法获取节点IP地址");
      }

      console.log(`[NodeTest] [4] 开始TCP连接测试: ${host}:7000`);
      const result = await invoke<TcpingResult>("tcping_host", { host });
      console.log(`[NodeTest] [5] TCP测试结果:`, result);

      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                testStatus: result.success ? "success" : "failed",
                latency: result.latency ?? undefined,
                error: result.error ?? undefined,
                lastTested: Date.now(),
              }
            : n
        )
      );

      addToHistory(node, result.success, result.latency, result.error);
    } catch (error) {
      console.error(`[NodeTest] ====== 测试失败: ${node.name} ======`);
      console.error(`[NodeTest] 错误详情:`, error);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                testStatus: "failed",
                error: error instanceof Error ? error.message : "测试失败",
              }
            : n
        )
      );
    }
  }, [user, addToHistory]);

  const testSelectedNodes = useCallback(async () => {
    if (!user || selectedNodeIds.size === 0) return;

    try {
      setTestingAll(true);
      const nodesToTest = filteredNodes.filter((n) => selectedNodeIds.has(n.id));

      for (const node of nodesToTest) {
        await testSingleNode(node);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      toast.success(`已测试 ${nodesToTest.length} 个节点`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "测试过程中发生错误";
      toast.error(message);
    } finally {
      setTestingAll(false);
    }
  }, [user, selectedNodeIds, filteredNodes, testSingleNode]);

  const testAllNodes = useCallback(async () => {
    if (!user || filteredNodes.length === 0) return;

    try {
      setTestingAll(true);
      
      for (const node of filteredNodes) {
        await testSingleNode(node);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      
      toast.success("所有节点测试完成");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "测试过程中发生错误";
      toast.error(message);
    } finally {
      setTestingAll(false);
    }
  }, [user, filteredNodes, testSingleNode]);

  const getStatusBadge = (node: NodeWithTest) => {
    switch (node.testStatus) {
      case "testing":
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            测试中
          </Badge>
        );
      case "success":
        return (
          <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            成功
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            失败
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            未测试
          </Badge>
        );
    }
  };

  const getHistoryStatusBadge = (success: boolean) => {
    return success ? (
      <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30">
        成功
      </Badge>
    ) : (
      <Badge variant="destructive">
        失败
      </Badge>
    );
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN");
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium text-foreground">节点测试</h1>
          {!loading && filteredNodes.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {filteredNodes.length} 个节点
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="h-8 px-3 text-xs"
          >
            <History className="h-3.5 w-3.5 mr-1.5" />
            {showHistory ? "返回列表" : "测试历史"}
          </Button>
          <Button
            size="sm"
            onClick={() => void loadNodes()}
            disabled={loading}
            className="h-8 px-3 text-xs"
          >
            {loading ? (
              <>
                <RefreshCw className="animate-spin h-3.5 w-3.5 mr-1.5" />
                加载中...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                刷新列表
              </>
            )}
          </Button>
          {!showHistory && selectedNodeIds.size > 0 && (
            <Button
              size="sm"
              onClick={() => void testSelectedNodes()}
              disabled={testingAll || loading}
              className="h-8 px-3 text-xs"
            >
              {testingAll ? (
                <>
                  <RefreshCw className="animate-spin h-3.5 w-3.5 mr-1.5" />
                  测试中...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  测试选中 ({selectedNodeIds.size})
                </>
              )}
            </Button>
          )}
          {!showHistory && selectedNodeIds.size === 0 && (
            <Button
              size="sm"
              onClick={() => void testAllNodes()}
              disabled={testingAll || loading || filteredNodes.length === 0}
              className="h-8 px-3 text-xs"
            >
              {testingAll ? (
                <>
                  <RefreshCw className="animate-spin h-3.5 w-3.5 mr-1.5" />
                  测试中...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  全部测试
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索节点名称、区域、节点组..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
            className="h-8"
          />
          {searchQuery && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {filteredNodes.length} 结果
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">筛选：</span>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <Select
            options={regionOptions}
            value={regionFilter}
            onChange={(v) => setRegionFilter(v as RegionFilter)}
            placeholder="地域"
            size="sm"
            className="w-[120px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Select
            options={userTypeOptions}
            value={userTypeFilter}
            onChange={(v) => setUserTypeFilter(v as UserTypeFilter)}
            placeholder="用户类型"
            size="sm"
            className="w-[120px]"
          />
        </div>
      </div>

      {!user ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network className="size-6" />
            </EmptyMedia>
            <EmptyTitle>请先登录</EmptyTitle>
            <EmptyDescription>
              登录后才能查看和测试节点
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : showHistory ? (
        <ScrollArea className="flex-1 min-h-0 pr-1">
          {historyLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              加载中...
            </div>
          ) : filteredHistory.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History className="size-6" />
                </EmptyMedia>
                <EmptyTitle>暂无测试记录</EmptyTitle>
                <EmptyDescription>
                  还没有进行过节点测试
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((record) => (
                <Card key={record.id} className={cn(
                  "bg-card",
                  effectType === "frosted" && "backdrop-blur-md bg-card/80",
                  effectType === "translucent" && "bg-card/80",
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{record.nodeName}</CardTitle>
                      {getHistoryStatusBadge(record.success)}
                    </div>
                    <div className="text-xs text-muted-foreground space-x-3">
                      <span>{record.area}</span>
                      <span>{record.nodegroup}</span>
                      <span>{formatTime(record.timestamp)}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm">
                      {record.latency != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {record.latency.toFixed(0)}ms
                        </span>
                      )}
                      {record.error && (
                        <span className="text-destructive text-xs">{record.error}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      ) : filteredNodes.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network className="size-6" />
            </EmptyMedia>
            <EmptyTitle>暂无节点</EmptyTitle>
            <EmptyDescription>
              未找到可用的节点，请稍后再试
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadNodes()}
            >
              刷新
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ScrollArea className="flex-1 min-h-0 pr-1">
          <div className={cn(
            "rounded-md border bg-card",
            effectType === "frosted" && "backdrop-blur-md bg-card/80",
            effectType === "translucent" && "bg-card/80",
          )}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center justify-center"
                    >
                      {selectedNodeIds.size === filteredNodes.length && filteredNodes.length > 0 ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="w-16">
                    <button
                      onClick={() => handleSort("id")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      编号
                      {sortField === "id" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>节点名称</TableHead>
                  <TableHead>区域</TableHead>
                  <TableHead>节点组</TableHead>
                  <TableHead>地域</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("latency")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      延迟
                      {sortField === "latency" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNodes.map((node, index) => (
                  <TableRow 
                    key={node.id} 
                    className={cn(selectedNodeIds.has(node.id) && "bg-accent/50")}
                  >
                    <TableCell className="w-12">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(e, node.id, index);
                        }}
                        className="flex items-center justify-center"
                      >
                        {selectedNodeIds.has(node.id) ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{node.id}</TableCell>
                    <TableCell className="font-medium">{highlightText(node.name, searchQuery)}</TableCell>
                    <TableCell>{highlightText(node.area, searchQuery)}</TableCell>
                    <TableCell>
                      <Badge variant={node.nodegroup === "vip" ? "default" : "outline"} className="text-xs">
                        {node.nodegroup === "vip" ? "VIP" : "普通"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {node.china === "yes" ? "国内" : "国外"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(node)}</TableCell>
                    <TableCell>
                      {node.latency != null ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {node.latency.toFixed(0)}ms
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void testSingleNode(node)}
                        disabled={node.testStatus === "testing"}
                        className="h-7 px-2 text-xs"
                      >
                        {node.testStatus === "testing" ? (
                          <RefreshCw className="animate-spin h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
