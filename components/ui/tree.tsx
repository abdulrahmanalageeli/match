"use client"

import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../lib/utils"

interface TreeContextValue {
  indent: number
}

const TreeContext = React.createContext<TreeContextValue>({
  indent: 20,
})

function useTreeContext() {
  return React.useContext(TreeContext)
}

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number
}

function Tree({ indent = 20, className, ...props }: TreeProps) {
  return (
    <TreeContext.Provider value={{ indent }}>
      <div
        data-slot="tree"
        style={{ "--tree-indent": `${indent}px` } as React.CSSProperties}
        className={cn("flex flex-col", className)}
        {...props}
      />
    </TreeContext.Provider>
  )
}

interface TreeItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  level?: number
  asChild?: boolean
}

function TreeItem({
  level = 0,
  className,
  asChild,
  children,
  ...props
}: TreeItemProps) {
  const { indent } = useTreeContext()

  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="tree-item"
      style={{ "--tree-padding": `${level * indent}px` } as React.CSSProperties}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

interface TreeItemLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  expanded?: boolean
  isFolder?: boolean
}

function TreeItemLabel({
  expanded = false,
  isFolder = false,
  children,
  className,
  ...props
}: TreeItemLabelProps) {
  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm transition-colors",
        className
      )}
      {...props}
    >
      {isFolder && (
        expanded ? (
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
        )
      )}
      {children}
    </span>
  )
}

function TreeTrigger({
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="tree-trigger"
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

function TreeContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tree-content"
      className={cn("ml-6", className)}
      {...props}
    />
  )
}

function TreeIcon({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tree-icon"
      className={cn("flex h-4 w-4 items-center justify-center", className)}
      {...props}
    >
      <ChevronRightIcon className="h-3 w-3" />
    </div>
  )
}

function TreeIconExpanded({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tree-icon-expanded"
      className={cn("flex h-4 w-4 items-center justify-center", className)}
      {...props}
    >
      <ChevronDownIcon className="h-3 w-3" />
    </div>
  )
}

export {
  Tree,
  TreeItem,
  TreeItemLabel,
  TreeTrigger,
  TreeContent,
  TreeIcon,
  TreeIconExpanded,
}
