"use client";

import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Info de la tasa BCV en el detalle de producto (docs/design-system.md §6):
 * tooltip en hover y dialog al hacer click (accesible en táctil y teclado).
 * El texto llega ya formateado desde el Server Component.
 */
export function RateInfo({
  text,
  disclaimer,
}: {
  text: string;
  disclaimer?: string | null;
}) {
  return (
    <TooltipProvider>
      <Dialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Info className="size-4 shrink-0" aria-hidden="true" />
                <span>{text}</span>
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{text}</TooltipContent>
        </Tooltip>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Equivalencia en bolívares</DialogTitle>
            <DialogDescription>{text}</DialogDescription>
          </DialogHeader>
          {disclaimer && <p className="text-xs text-muted-foreground">{disclaimer}</p>}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
