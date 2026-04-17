function errorHandler(err, req, res, next) {
  if (err && err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed',
      details: err.errors,
    });
  }

  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(status).json({
    message,
    details: err.details || null,
  });
}

module.exports = errorHandler;
