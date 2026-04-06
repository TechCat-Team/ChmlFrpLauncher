import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CircleHelp } from "lucide-react";

export function FAQSection() {
  return (
    <div className="rounded-lg p-5 bg-card md:col-span-2 flex flex-col h-[160px]">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex-shrink-0 flex items-center gap-2">
        <CircleHelp className="w-4 h-4 text-muted-foreground" />
        常见问题
      </h2>
      <div className="overflow-y-auto flex-1 min-h-0 -mx-5 px-5">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>软件出现了BUG怎么办</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 text-balance">
              <p>
                软件目前为初期版本，使用途中遇见的任何问题，请在任意交流群中反馈问题，我们会尽快修复。
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>我应该去哪注册账号</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 text-balance">
              <p>
                这是ChmlFrp的官方启动器，如果您没有账户，您应该前往我们的官网{" "}
                <a
                  href="https://www.chmlfrp.net"
                  target="_blank"
                  className="text-foreground hover:underline"
                >
                  https://www.chmlfrp.net
                </a>{" "}
                进行注册。
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
