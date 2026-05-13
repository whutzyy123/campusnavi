import toast from "react-hot-toast";

export const notify = {
  success(message: string) {
    return toast.success(message);
  },
  error(message: string) {
    return toast.error(message);
  },
  loading(message: string) {
    return toast.loading(message);
  },
  dismiss(toastId?: string) {
    return toast.dismiss(toastId);
  },
};

export type Notify = typeof notify;

