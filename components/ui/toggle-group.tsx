"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import {
  Root as ToggleGroupRoot,
  Item as ToggleGroupItem,
} from "@radix-ui/react-toggle-group"
import { cva } from "class-variance-authority"

import { cn } from "../../lib/utils"

const toggleGroupVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupRoot>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupRoot> &
    VariantProps<typeof toggleGroupVariants>
>(({ className, variant, size, ...props }, ref) => (
  <ToggleGroupRoot
    ref={ref}
    className={cn(toggleGroupVariants({ variant, size, className }))}
    {...props}
  />
))

ToggleGroup.displayName = ToggleGroupRoot.displayName

const ToggleGroupItemComponent = React.forwardRef<
  React.ElementRef<typeof ToggleGroupItem>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupItem> &
    VariantProps<typeof toggleGroupVariants>
>(({ className, variant, size, ...props }, ref) => (
  <ToggleGroupItem
    ref={ref}
    className={cn(toggleGroupVariants({ variant, size, className }))}
    {...props}
  />
))

ToggleGroupItemComponent.displayName = ToggleGroupItem.displayName

export { ToggleGroup, ToggleGroupItemComponent as ToggleGroupItem, toggleGroupVariants }
