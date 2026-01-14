import { Network } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";

interface NetworkSectionProps {
  bypassProxy: boolean;
  setBypassProxy: (value: boolean) => void;
}

export function NetworkSection({
  bypassProxy,
  setBypassProxy,
}: NetworkSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Network className="w-4 h-4" />
        <span>网络</span>
      </div>
      <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>绕过代理</ItemTitle>
            <ItemDescription className="text-xs">
              网络请求绕过系统代理设置
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => setBypassProxy(!bypassProxy)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                bypassProxy ? "bg-foreground" : "bg-muted"
              } cursor-pointer`}
              role="switch"
              aria-checked={bypassProxy}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  bypassProxy ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
}
