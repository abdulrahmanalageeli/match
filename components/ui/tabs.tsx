"use client"

import * as React from "react"
import {
  Root as TabsRoot,
  List as TabsListRoot,
  Trigger as TabsTriggerRoot,
  Content as TabsContentRoot,
} from "@radix-ui/react-tabs"

import { cn } from "../../lib/utils"

const Tabs = TabsRoot

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsListRoot>,
  React.ComponentPropsWithoutRef<typeof TabsListRoot>
>(({ className, ...props }, ref) => (
  <TabsListRoot
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsListRoot.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsTriggerRoot>,
  React.ComponentPropsWithoutRef<typeof TabsTriggerRoot>
>(({ className, ...props }, ref) => (
  <TabsTriggerRoot
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsTriggerRoot.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsContentRoot>,
  React.ComponentPropsWithoutRef<typeof TabsContentRoot>
>(({ className, ...props }, ref) => (
  <TabsContentRoot
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsContentRoot.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
