import { ExternalLinkIcon } from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";

export function FeedbackCard() {
  return (
    <Item
      variant="outline"
      asChild
      className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3"
    >
      <a
        href="https://wj.qq.com/s2/25483094/5318/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <ItemContent>
          <ItemTitle>意见征集</ItemTitle>
          <ItemDescription className="text-xs">
            我们欢迎您提出任何意见和建议，帮助我们改进客户端。
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ExternalLinkIcon className="size-4" />
        </ItemActions>
      </a>
    </Item>
  );
}

