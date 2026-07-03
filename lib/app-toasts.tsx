"use client";

import { toast } from "sonner";

import { ErrorRetryToast } from "@/components/toasts-error-retry";
import { ProgressToast, type ProgressToastJob } from "@/components/toasts-progress";
import { SuccessToast } from "@/components/toasts-success";

type ToastId = string | number;

export function showSuccessToast({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return toast.custom((id) => (
    <SuccessToast
      title={title}
      description={description}
      onClose={() => toast.dismiss(id)}
    />
  ));
}

export function showRetryToast({
  title,
  description,
  code,
  retryLabel,
  onRetry,
}: {
  title: string;
  description: string;
  code?: string | number;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return toast.custom((id) => (
    <ErrorRetryToast
      title={title}
      description={description}
      code={code}
      retryLabel={retryLabel}
      onRetry={() => {
        toast.dismiss(id);
        onRetry?.();
      }}
      onClose={() => toast.dismiss(id)}
    />
  ), { duration: Infinity });
}

export function showProgressToast({
  id,
  title,
  jobs,
}: {
  id: ToastId;
  title?: string;
  jobs: ProgressToastJob[];
}) {
  toast.custom((toastId) => (
    <ProgressToast
      title={title}
      jobs={jobs}
      onClose={() => toast.dismiss(toastId)}
    />
  ), { id, duration: Infinity });
  return id;
}

export function dismissToast(id: ToastId) {
  toast.dismiss(id);
}
