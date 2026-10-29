import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/40 focus-visible:ring-2 aria-invalid:ring-destructive/25 aria-invalid:border-destructive cursor-pointer transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/30 disabled:opacity-50",
        outline:
          "border border-input bg-card text-foreground hover:bg-accent active:bg-accent/70 disabled:opacity-50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent active:bg-accent/70 disabled:opacity-50",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/70 disabled:opacity-50",
        link: "text-primary-ink underline-offset-4 hover:underline disabled:opacity-50",
      },
      size: {
        "default": "h-9 px-3.5 py-2 has-[>svg]:px-3",
        "xs": "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        "lg": "h-10 rounded-md px-6 has-[>svg]:px-4",
        "icon": "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
