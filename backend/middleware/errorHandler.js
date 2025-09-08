const errorHandler = (err, req, res, _next) => {
  const code = err.status || err.code || 500;
  const payload = { ok: false, message: err.message || 'Erro interno', code };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }
  res.status(code).json(payload);
};

export default errorHandler;
