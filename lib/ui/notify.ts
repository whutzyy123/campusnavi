import toast, { type ToastOptions } from "react-hot-toast";

export const notify = {
  show(message: string, options?: ToastOptions) {
    return toast(message, options);
  },
  success(message: string, options?: ToastOptions) {
    return toast.success(message, options);
  },
  error(message: string, options?: ToastOptions) {
    return toast.error(message, options);
  },
  loading(message: string, options?: ToastOptions) {
    return toast.loading(message, options);
  },
  dismiss(toastId?: string) {
    return toast.dismiss(toastId);
  },
};

export type Notify = typeof notify;
