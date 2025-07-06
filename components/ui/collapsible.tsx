"use client"

import {
  Root as CollapsibleRoot,
  Trigger as CollapsibleTriggerRoot,
  Content as CollapsibleContentRoot,
} from "@radix-ui/react-collapsible"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsibleRoot>) {
  return <CollapsibleRoot data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsibleTriggerRoot>) {
  return <CollapsibleTriggerRoot data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsibleContentRoot>) {
  return <CollapsibleContentRoot data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
