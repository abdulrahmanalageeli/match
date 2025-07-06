"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import {
  Root as SelectRoot,
  Group as SelectGroupRoot,
  Value as SelectValueRoot,
  Trigger as SelectTriggerRoot,
  Icon as SelectIconRoot,
  Portal as SelectPortalRoot,
  Content as SelectContentRoot,
  Viewport as SelectViewportRoot,
  Item as SelectItemRoot,
  ItemIndicator as SelectItemIndicatorRoot,
  ItemText as SelectItemTextRoot,
} from "@radix-ui/react-select"

import { cn } from "../../lib/utils"

function Select({
  ...props
}: React.ComponentProps<typeof SelectRoot>) {
  return <SelectRoot data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectGroupRoot>) {
  return <SelectGroupRoot data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectValueRoot>) {
  return <SelectValueRoot data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectTriggerRoot>) {
  return (
    <SelectTriggerRoot
      data-slot="select-trigger"
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      {...props}
    >
      {children}
      <SelectIconRoot asChild>
        <ChevronDownIcon className="h-4 w-4 opacity-50" />
      </SelectIconRoot>
    </SelectTriggerRoot>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectContentRoot>) {
  return (
    <SelectPortalRoot>
      <SelectContentRoot
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectViewportRoot
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          )}
        >
          {children}
        </SelectViewportRoot>
      </SelectContentRoot>
    </SelectPortalRoot>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectItemRoot>) {
  return (
    <SelectItemRoot
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectItemIndicatorRoot>
          <CheckIcon className="h-4 w-4" />
        </SelectItemIndicatorRoot>
      </span>
      <SelectItemTextRoot>{children}</SelectItemTextRoot>
    </SelectItemRoot>
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
