import type { FlowPoint } from "@/services/api";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface FlowDataCardProps {
  flowData: FlowPoint[];
  flowLoading: boolean;
  flowError: string;
}

// 生成默认的7天数据
function generateDefaultData() {
  const data = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

    data.push({
      date: dateStr,
      上传: 0,
      下载: 0,
    });
  }

  return data;
}

export function FlowDataCard({
  flowData,
  flowLoading,
  flowError,
}: FlowDataCardProps) {
  // 将流量数据转换为 MB
  const chartData =
    flowData.length > 0
      ? flowData.map((item) => ({
          date: item.time,
          上传:
            typeof item.traffic_in === "number"
              ? item.traffic_in / (1024 * 1024)
              : 0,
          下载:
            typeof item.traffic_out === "number"
              ? item.traffic_out / (1024 * 1024)
              : 0,
        }))
      : generateDefaultData();

  const chartConfig = {
    上传: {
      label: "上传",
      color: "hsl(var(--chart-1))" as const,
    },
    下载: {
      label: "下载",
      color: "hsl(var(--chart-2))" as const,
    },
  } satisfies ChartConfig;

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">近7日流量</h2>
      </div>

      <div className="mt-3">
        {flowLoading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : flowError ? (
          <div className="text-sm text-destructive">{flowError}</div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fill上传" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-上传)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-上传)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fill下载" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-下载)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-下载)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/30"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => value}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => `${value.toFixed(0)}MB`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => `日期: ${value}`}
                    formatter={(value) => `${Number(value).toFixed(2)} MB`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="上传"
                stackId="1"
                stroke="var(--color-上传)"
                fill="url(#fill上传)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="下载"
                stackId="1"
                stroke="var(--color-下载)"
                fill="url(#fill下载)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
