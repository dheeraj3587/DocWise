"use client";

import type * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function DropdownDisclosure(props: React.ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

function DropdownDisclosureTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  return <DialogTrigger data-slot="dropdown-disclosure-trigger" {...props} />;
}

function DropdownDisclosureContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      data-slot="dropdown-disclosure-content"
      className={cn(
        "max-h-[min(720px,calc(100dvh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-xl",
        className,
      )}
      {...props}
    />
  );
}

function DropdownDisclosureHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      data-slot="dropdown-disclosure-header"
      className={cn("border-b border-border px-5 py-4 pr-14", className)}
      {...props}
    />
  );
}

function DropdownDisclosureTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      data-slot="dropdown-disclosure-title"
      className={cn("text-[15px]", className)}
      {...props}
    />
  );
}

function DropdownDisclosureDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return (
    <DialogDescription
      data-slot="dropdown-disclosure-description"
      className={cn("text-xs leading-5", className)}
      {...props}
    />
  );
}

function DropdownDisclosureBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-disclosure-body"
      className={cn("custom-scrollbar min-h-0 overflow-y-auto p-2", className)}
      {...props}
    />
  );
}

function DropdownDisclosureClose(
  props: React.ComponentProps<typeof DialogClose>,
) {
  return <DialogClose data-slot="dropdown-disclosure-close" {...props} />;
}

export {
  DropdownDisclosure,
  DropdownDisclosureBody,
  DropdownDisclosureClose,
  DropdownDisclosureContent,
  DropdownDisclosureDescription,
  DropdownDisclosureHeader,
  DropdownDisclosureTitle,
  DropdownDisclosureTrigger,
};
