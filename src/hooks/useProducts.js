// src/hooks/useProducts.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listProducts, createProduct, updateProduct, deleteProduct, getProductsMetrics } from '../api/sdk/products';

export function useProducts(opts) {
  return useQuery({
    queryKey: ['products', opts],
    queryFn: () => listProducts(opts),
    keepPreviousData: true,
    staleTime: 10_000,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => updateProduct(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', id] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useProductsMetrics(days = 15) {
  return useQuery({
    queryKey: ['products-metrics', days],
    queryFn: () => getProductsMetrics(days),
    staleTime: 30_000,
  });
}
