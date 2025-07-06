"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import {
  Root as AccordionRoot,
  Item as AccordionItemRoot,
  Trigger as AccordionTriggerRoot,
  Header as AccordionHeader,
  Content as AccordionContentRoot,
} from "@radix-ui/react-accordion"

import { cn } from "../../lib/utils"

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionRoot>) {
  return <AccordionRoot data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionItemRoot>) {
  return (
    <AccordionItemRoot
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionTriggerRoot>) {
  return (
    <AccordionHeader className="flex">
      <AccordionTriggerRoot
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center justify-between gap-4 rounded-md py-4 text-left text-sm font-semibold transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          size={16}
          className="pointer-events-none shrink-0 opacity-60 transition-transform duration-200"
          aria-hidden="true"
        />
      </AccordionTriggerRoot>
    </AccordionHeader>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionContentRoot>) {
  return (
    <AccordionContentRoot
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionContentRoot>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
