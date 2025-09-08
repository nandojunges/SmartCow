const logger = (req, res, next) => {
  const start = Date.now();
  const requestId = `${Date.now()}${Math.random().toString(36).slice(2)}`;
  req.requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      id: requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
    };
    if (process.env.NODE_ENV !== 'production') {
      log.body = req.body;
    }
    console.log(JSON.stringify(log));
  });

  next();
};

export default logger;
