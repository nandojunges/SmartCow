// backend/resources/products.metrics.js
import express from 'express';
import db from '../dbx.js';

const router = express.Router();

// GET /api/v1/products/metrics?days=15
router.get('/', async (req, res) => {
  const days = Math.max(parseInt(req.query.days || '15', 10), 1);

  // Valor total de estoque (preco_unit * quantidade)
  const total_valor = (await db.query(
    `SELECT COALESCE(SUM(COALESCE(preco_unit,0)*COALESCE(quantidade,0)),0)::float AS v
     FROM products`
  )).rows[0].v;

  // Por categoria
  const por_categoria = (await db.query(
    `SELECT COALESCE(categoria,'(sem categoria)') AS categoria,
            COALESCE(SUM(quantidade),0)::float AS quantidade,
            COALESCE(SUM(COALESCE(preco_unit,0)*COALESCE(quantidade,0)),0)::float AS valor
     FROM products
     GROUP BY 1
     ORDER BY valor DESC`
  )).rows;

  // Itens que vencem nos próximos N dias
  const vencendo = (await db.query(
    `SELECT id, nome, categoria, unidade, preco_unit, quantidade, validade, created_at
     FROM products
     WHERE NULLIF(validade,'') IS NOT NULL
       AND NULLIF(validade,'')::date <= (now()::date + ($1 || ' days')::interval)
     ORDER BY NULLIF(validade,'')::date ASC`,
    [days]
  )).rows;

  res.json({
    cards: {
      estoque_total_valor: total_valor,
      alerta_validade_dias: days,
      itens_vencendo: vencendo.length,
    },
    tables: { por_categoria, vencendo },
  });
});

export default router;

