// Form control styling shared by the ticket dialogs. Same look as `Input`: neutral border, accent only on focus.
export const FIELD =
  "border-input bg-card hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/40 h-8 w-full appearance-none rounded-md border pr-8 pl-2 text-field transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
export const TEXTAREA =
  "border-input bg-card placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/40 w-full resize-y rounded-md border px-2 py-2 text-sm leading-relaxed transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";
export const CHEVRON = "text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2";
export const SECTION_LABEL = "type-label text-muted-foreground";
