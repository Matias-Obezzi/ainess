import type { VariantProps } from 'class-variance-authority'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'

function AlertDialog(props: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal(props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-(--z-overlay,50) bg-black/50 backdrop-blur-[2px] duration-(--duration-normal,200ms) data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-[50%] left-[50%] z-(--z-overlay,50) grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border bg-background p-6 shadow-lg duration-(--duration-normal,200ms) data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-lg',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('font-semibold text-lg leading-none', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

type ButtonStyle = VariantProps<typeof buttonVariants>

/** Confirms and closes. Styled as a button; `variant="destructive"` for irreversible actions. */
function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & ButtonStyle) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

/** Closes without doing anything. Focused when the dialog opens. */
function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & ButtonStyle) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export interface AlertDialogLabels {
  /** The action button of `confirm()` when it has no `confirmText`. */
  confirm: string
  /** The cancel button of `confirm()` when it has no `cancelText`. */
  cancel: string
}

export const defaultAlertDialogLabels: AlertDialogLabels = {
  confirm: 'Continue',
  cancel: 'Cancel',
}

export interface ConfirmOptions {
  title: React.ReactNode
  description?: React.ReactNode
  /** Label of the action button. Default "Continue". */
  confirmText?: React.ReactNode
  /** Label of the cancel button. Default "Cancel". */
  cancelText?: React.ReactNode
  /** `destructive` paints the action button red. Default `default`. */
  variant?: 'default' | 'destructive'
  /**
   * Runs when the action is pressed, before the promise resolves. While it is pending the
   * action shows a spinner and the dialog cannot be dismissed. If it throws, the dialog stays
   * open so the user can try again or cancel; report the error from inside it.
   */
  onConfirm?: () => void | Promise<void>
}

interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (value: boolean) => void
}

function createConfirmStore() {
  let queue: ConfirmRequest[] = []
  let counter = 0
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getQueue: () => queue,
    add(options: ConfirmOptions) {
      return new Promise<boolean>((resolve) => {
        queue = [...queue, { ...options, id: ++counter, resolve }]
        emit()
      })
    },
    settle(id: number, value: boolean) {
      const request = queue.find((r) => r.id === id)
      if (!request) return
      queue = queue.filter((r) => r !== request)
      emit()
      request.resolve(value)
    },
  }
}

const confirmStore = createConfirmStore()
const emptyQueue: ConfirmRequest[] = []

/**
 * Ask the user to confirm, from anywhere. Resolves true when they accept and false when they
 * cancel or press Escape. Needs a `<Confirmer />` mounted once; calls made while a dialog is
 * open wait their turn.
 *
 * ```ts
 * if (!(await confirm({ title: 'Delete the file?', variant: 'destructive' }))) return
 * ```
 */
function confirm(options: ConfirmOptions): Promise<boolean> {
  return confirmStore.add(options)
}

/** Renders the dialogs `confirm()` asks for. Mount it once, near the root. */
function Confirmer({
  labels: labelsProp,
}: {
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<AlertDialogLabels>
} = {}) {
  const labels = useLabels('alert-dialog', defaultAlertDialogLabels, labelsProp)
  const queue = React.useSyncExternalStore(
    confirmStore.subscribe,
    confirmStore.getQueue,
    () => emptyQueue,
  )
  const head = queue[0]
  // What is on screen. It outlives its request so the dialog can animate out with its text,
  // and the next request only opens once the previous one has gone.
  const [shown, setShown] = React.useState<ConfirmRequest | null>(null)
  const [pending, setPending] = React.useState(false)
  const returnFocus = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (shown || !head) return
    // Only the first of a run of dialogs knows where the user was.
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement
    }
    setShown(head)
  }, [shown, head])

  const open = !!shown && shown === head

  const accept = async (request: ConfirmRequest) => {
    if (!request.onConfirm) return confirmStore.settle(request.id, true)
    setPending(true)
    try {
      await request.onConfirm()
      confirmStore.settle(request.id, true)
    } catch {
      // Stay open: the caller reports the failure, the user decides what to do next.
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && shown && !pending) confirmStore.settle(shown.id, false)
      }}
    >
      {shown && (
        <AlertDialogContent
          // Without a description Radix expects to be told there is none.
          {...(!shown.description && { 'aria-describedby': undefined })}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            setShown(null)
            if (confirmStore.getQueue().length > 0) return
            returnFocus.current?.focus()
            returnFocus.current = null
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{shown.title}</AlertDialogTitle>
            {shown.description ? (
              <AlertDialogDescription>{shown.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {shown.cancelText ?? labels.cancel}
            </AlertDialogCancel>
            {/* A plain button rather than AlertDialogAction: the action closing the dialog
                itself would go through onOpenChange and read as a cancel. */}
            <Button
              data-slot="alert-dialog-action"
              variant={shown.variant ?? 'default'}
              loading={pending}
              onClick={() => {
                if (!pending) void accept(shown)
              }}
            >
              {shown.confirmText ?? labels.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  Confirmer,
  confirm,
}
