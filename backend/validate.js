// backend/validate.js
import { z } from "zod";
export { z };

/**
 * makeValidator(schema) → retorna função **pura** (data → dataValidada)
 * - NÃO usa (req,res,next)
 * - Em caso de erro: lança Error com { statusCode: 400, details: [...] }
 */
export function makeValidator(schema) {
  return function validate(data) {
    const result = schema.safeParse(data);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      const err = new Error("ValidationError");
      err.statusCode = 400;
      err.details = details;
      throw err;
    }
    return result.data;
  };
}

/**
 * (Opcional) Versão middleware se algum endpoint específico quiser usar.
 */
export function validatorMw(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}
