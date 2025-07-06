"use client"

import * as React from "react"
import {
  Root as HoverCardRoot,
  Trigger as HoverCardTriggerRoot,
  Content as HoverCardContentRoot,
  Arrow as HoverCardArrowRoot,
} from "@radix-ui/react-hover-card"

import { cn } from "../../lib/utils"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardRoot>) {
  return <HoverCardRoot data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardTriggerRoot>) {
  return <HoverCardTriggerRoot data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  showArrow = false,
  children,
  ...props
}: React.ComponentProps<typeof HoverCardContentRoot> & {
  showArrow?: boolean
}) {
  return (
    <HoverCardContentRoot
      data-slot="hover-card-content"
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 rounded-md border p-4 shadow-md outline-hidden",
        className
      )}
      {...props}
    >
      {children}
      {showArrow && (
        <HoverCardArrowRoot className="fill-popover -my-px drop-shadow-[0_1px_0_var(--border)]" />
      )}
    </HoverCardContentRoot>
  )
}

export { HoverCard, HoverCardContent, HoverCardTrigger }
