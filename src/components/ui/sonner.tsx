import { Toaster as Sonner, type ToasterProps } from 'sonner'

/* shadcn (new-york) Sonner wrapper, adapted for this app: the stock component
   pulls the active theme from `next-themes`, which this project doesn't use —
   the Sparrow chrome is a fixed light theme (sparrow-cream / sparrow-ink), so we
   hardcode `theme="light"` and style toasts with the app's tokens + font. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      richColors
      toastOptions={{
        classNames: {
          toast:
            'group font-abeezee rounded-[12px] border border-black/5 bg-white text-sparrow-ink shadow-lg',
          title: 'font-abeezee text-sm font-semibold',
          description: 'font-abeezee text-sm text-sparrow-ink/70',
          actionButton: 'font-abeezee bg-sparrow-blue text-white',
          cancelButton: 'font-abeezee bg-black/5 text-sparrow-ink',
        },
      }}
      {...props}
    />
  )
}
