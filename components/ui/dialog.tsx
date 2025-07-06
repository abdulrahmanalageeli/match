"use client"

import * as React from "react"
import {
  Root as DialogRoot,
  Trigger as DialogTriggerRoot,
  Portal as DialogPortalRoot,
  Close as DialogCloseRoot,
  Overlay as DialogOverlayRoot,
  Content as DialogContentRoot,
  Title as DialogTitleRoot,
  Description as DialogDescriptionRoot,
} from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "../../lib/utils"

const Dialog = DialogRoot

const DialogTrigger = DialogTriggerRoot

const DialogPortal = DialogPortalRoot

const DialogClose = DialogCloseRoot

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogOverlayRoot>,
  React.ComponentPropsWithoutRef<typeof DialogOverlayRoot>
>(({ className, ...props }, ref) => (
  <DialogOverlayRoot
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogOverlayRoot.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContentRoot>,
  React.ComponentPropsWithoutRef<typeof DialogContentRoot>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogContentRoot
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogCloseRoot className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogCloseRoot>
    </DialogContentRoot>
  </DialogPortal>
))
DialogContent.displayName = DialogContentRoot.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogTitleRoot>,
  React.ComponentPropsWithoutRef<typeof DialogTitleRoot>
>(({ className, ...props }, ref) => (
  <DialogTitleRoot
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogTitleRoot.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogDescriptionRoot>,
  React.ComponentPropsWithoutRef<typeof DialogDescriptionRoot>
>(({ className, ...props }, ref) => (
  <DialogDescriptionRoot
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogDescriptionRoot.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
