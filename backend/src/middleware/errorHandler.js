function errorHandler(err, req, res, next) {
  if (err && err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed',
      details: err.errors,
    });
  }

  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error' : (err.message || 'Request failed');

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(status).json({ message, ...(status < 500 && err.details ? { details: err.details } : {}) });
}

module.exports = errorHandler;
