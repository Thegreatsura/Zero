import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';

export function useLabelOrders() {
  const trpc = useTRPC();

  const { data: orders } = useQuery(
    trpc.labels.getOrders.queryOptions(void 0, {
      staleTime: 1000 * 60 * 5, // 5 minutes
    }),
  );

  const { mutateAsync: updateOrders } = useMutation(trpc.labels.reorder.mutationOptions());

  return { orders, updateOrders };
}
