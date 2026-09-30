import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

export function Dialog({ open, title, description, children, onOpenChange }: { open: boolean; title: string; description?: string; children: ReactNode; onOpenChange(open: boolean): void }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" /><DialogPrimitive.Content className="dialog-content"><DialogPrimitive.Title>{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description>{description}</DialogPrimitive.Description>}<div className="dialog-body">{children}</div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
}
