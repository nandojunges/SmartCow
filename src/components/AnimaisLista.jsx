import { useState } from 'react';
import { useAnimals } from '../hooks/useAnimals';

export default function AnimaisLista() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc'); // 'asc' | 'desc'

  const { data, isLoading } = useAnimals({ q, page, limit: 10, sort, order });

  const items = data?.items || [];
  const pages = data?.pages || 1;
  const total = data?.total || 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={e=>{ setQ(e.target.value); setPage(1); }} placeholder="Buscar..." />
        <select value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="created_at">Criado em</option>
          <option value="numero">Número</option>
          <option value="brinco">Brinco</option>
          <option value="raca">Raça</option>
          <option value="estado">Estado</option>
        </select>
        <select value={order} onChange={e=>setOrder(e.target.value)}>
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>

      {isLoading ? 'Carregando...' : (
        <>
          <div style={{ marginBottom: 8 }}>Total: {total}</div>
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Brinco</th>
                <th>Raça</th>
                <th>Estado</th>
                <th>Nasc.</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>{a.numero}</td>
                  <td>{a.brinco}</td>
                  <td>{a.raca}</td>
                  <td>{a.estado}</td>
                  <td>{a.nascimento}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button>
            <span>página {page} / {pages}</span>
            <button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Próxima</button>
          </div>
        </>
      )}
    </div>
  );
}

