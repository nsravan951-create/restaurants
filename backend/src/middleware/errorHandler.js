function errorHandler(err, req, res, next) {
  if (err && err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed',
      details: err.errors,
    });
  }

  const status = err.status || 500;
  const exposeMessage = status < 500
    || err.code === 'CASHFREE_PROVIDER_ERROR'
    || err.code === 'CASHFREE_NOT_CONFIGURED'
    || process.env.NODE_ENV !== 'production';
  const message = exposeMessage ? (err.message || 'Request failed') : 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(status).json({ message, ...(status < 500 && err.details ? { details: err.details } : {}) });
}

module.exports = errorHandler;
