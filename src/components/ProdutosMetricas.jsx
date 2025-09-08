import { useProductsMetrics } from '../hooks/useProducts';

export default function ProdutosMetricas() {
  const { data, isLoading } = useProductsMetrics(15);
  if (isLoading) return 'Carregando...';

  const cards = data?.cards || {};
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div>Estoque (R$): {cards.estoque_total_valor?.toFixed?.(2)}</div>
      <div>Itens vencendo (≤ {cards.alerta_validade_dias} dias): {cards.itens_vencendo}</div>
    </div>
  );
}

