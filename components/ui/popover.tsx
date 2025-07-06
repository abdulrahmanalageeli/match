"use client"

import * as React from "react"
import {
  Root as PopoverRoot,
  Trigger as PopoverTriggerRoot,
  Portal as PopoverPortal,
  Content as PopoverContentRoot,
  Anchor as PopoverAnchorRoot,
} from "@radix-ui/react-popover"

import { cn } from "../../lib/utils"

const Popover = PopoverRoot

const PopoverTrigger = PopoverTriggerRoot

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverContentRoot>,
  React.ComponentPropsWithoutRef<typeof PopoverContentRoot>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPortal>
    <PopoverContentRoot
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPortal>
))
PopoverContent.displayName = PopoverContentRoot.displayName

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverAnchorRoot>) {
  return <PopoverAnchorRoot data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
