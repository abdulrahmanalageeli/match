"use client"

import * as React from "react"
import {
  Root as AvatarRoot,
  Image as AvatarImageRoot,
  Fallback as AvatarFallbackRoot,
} from "@radix-ui/react-avatar"

import { cn } from "../../lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarRoot>) {
  return (
    <AvatarRoot
      data-slot="avatar"
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarImageRoot>) {
  return (
    <AvatarImageRoot
      data-slot="avatar-image"
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  )
}

function AvatarFallbackComponent({
  className,
  ...props
}: React.ComponentProps<typeof AvatarFallbackRoot>) {
  return (
    <AvatarFallbackRoot
      data-slot="avatar-fallback"
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallbackComponent as AvatarFallback }
