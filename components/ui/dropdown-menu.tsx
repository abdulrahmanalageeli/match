"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import {
  Root as DropdownMenuRoot,
  Portal as DropdownMenuPortalRoot,
  Trigger as DropdownMenuTriggerRoot,
  Content as DropdownMenuContentRoot,
  Group as DropdownMenuGroupRoot,
  Item as DropdownMenuItemRoot,
  ItemIndicator as DropdownMenuItemIndicatorRoot,
  CheckboxItem as DropdownMenuCheckboxItemRoot,
  RadioGroup as DropdownMenuRadioGroupRoot,
  RadioItem as DropdownMenuRadioItemRoot,
  Sub as DropdownMenuSubRoot,
  SubTrigger as DropdownMenuSubTriggerRoot,
  SubContent as DropdownMenuSubContentRoot,
  Separator as DropdownMenuSeparatorRoot,
  Label as DropdownMenuLabelRoot,
} from "@radix-ui/react-dropdown-menu"

import { cn } from "../../lib/utils"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuRoot>) {
  return <DropdownMenuRoot data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPortalRoot>) {
  return <DropdownMenuPortalRoot data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuTriggerRoot>) {
  return (
    <DropdownMenuTriggerRoot
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuContentRoot>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuContentRoot
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </DropdownMenuPortal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuItemRoot> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuItemRoot
      data-slot="dropdown-menu-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuCheckboxItemRoot>) {
  return (
    <DropdownMenuCheckboxItemRoot
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuItemIndicatorRoot>
          <CheckIcon className="h-4 w-4" />
        </DropdownMenuItemIndicatorRoot>
      </span>
      {children}
    </DropdownMenuCheckboxItemRoot>
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuRadioItemRoot>) {
  return (
    <DropdownMenuRadioItemRoot
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuItemIndicatorRoot>
          <CircleIcon className="h-2 w-2 fill-current" />
        </DropdownMenuItemIndicatorRoot>
      </span>
      {children}
    </DropdownMenuRadioItemRoot>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuLabelRoot> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuLabelRoot
      data-slot="dropdown-menu-label"
      className={cn(
        "px-2 py-1.5 text-sm font-semibold",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSeparatorRoot>) {
  return (
    <DropdownMenuSeparatorRoot
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuGroupRoot>) {
  return <DropdownMenuGroupRoot data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuRadioGroupRoot>) {
  return <DropdownMenuRadioGroupRoot data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuSubRoot>) {
  return <DropdownMenuSubRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubTriggerRoot> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuSubTriggerRoot
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto h-4 w-4" />
    </DropdownMenuSubTriggerRoot>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubContentRoot>) {
  return (
    <DropdownMenuSubContentRoot
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
