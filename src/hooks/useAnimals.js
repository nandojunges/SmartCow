// src/hooks/useAnimals.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAnimals, createAnimal, updateAnimal, deleteAnimal, getAnimalsMetrics } from '../api/sdk/animals';

// opts: { q, page, limit, sort, order, from, to }
export function useAnimals(opts) {
  return useQuery({
    queryKey: ['animals', opts],
    queryFn: () => listAnimals(opts),
    keepPreviousData: true,
    staleTime: 10_000,
  });
}

export function useCreateAnimal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAnimal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['animals'] }),
  });
}

export function useUpdateAnimal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => updateAnimal(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['animals'] });
      qc.invalidateQueries({ queryKey: ['animal', id] });
    },
  });
}

export function useDeleteAnimal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAnimal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['animals'] }),
  });
}

export function useAnimalsMetrics(days = 30) {
  return useQuery({
    queryKey: ['animals-metrics', days],
    queryFn: () => getAnimalsMetrics(days),
    staleTime: 30_000,
  });
}
