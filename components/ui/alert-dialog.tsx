"use client"

import * as React from "react"
import {
  Root as AlertDialogRoot,
  Trigger as AlertDialogTriggerRoot,
  Portal as AlertDialogPortalRoot,
  Overlay as AlertDialogOverlayRoot,
  Content as AlertDialogContentRoot,
  Title as AlertDialogTitleRoot,
  Description as AlertDialogDescriptionRoot,
  Action as AlertDialogActionRoot,
  Cancel as AlertDialogCancelRoot,
} from "@radix-ui/react-alert-dialog"

import { cn } from "../../lib/utils"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogRoot>) {
  return <AlertDialogRoot data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogTriggerRoot>) {
  return <AlertDialogTriggerRoot data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPortalRoot>) {
  return <AlertDialogPortalRoot data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogOverlayRoot>) {
  return (
    <AlertDialogOverlayRoot
      data-slot="alert-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogContentRoot>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogContentRoot
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border p-6 shadow-lg duration-200 sm:max-w-100",
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogContentRoot>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogTitleRoot>) {
  return (
    <AlertDialogTitleRoot
      data-slot="alert-dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogDescriptionRoot>) {
  return (
    <AlertDialogDescriptionRoot
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogActionRoot>) {
  return (
    <AlertDialogActionRoot
      data-slot="alert-dialog-action"
      className={cn(
        "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium shadow transition-colors focus-visible:outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogCancelRoot>) {
  return (
    <AlertDialogCancelRoot
      data-slot="alert-dialog-cancel"
      className={cn(
        "border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 mt-2 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium shadow transition-colors focus-visible:outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 sm:mt-0",
        className
      )}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
