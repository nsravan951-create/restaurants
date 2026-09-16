function buildAllowedOrigins() {
  const origins = new Set(
    String(process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173,http://localhost:5500')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

  const defaults = [
    'https://autoresto.in',
    'https://www.autoresto.in',
    'https://restaurants.netlify.app',
    'https://restaurantts.netlify.app',
    'https://restauranttts.netlify.app',
  ];

  defaults.forEach((origin) => origins.add(origin));

  const frontendUrl = process.env.FRONTEND_PUBLIC_URL?.trim();
  if (frontendUrl) {
    origins.add(frontendUrl.replace(/\/$/, ''));
  }

  const backendUrl = process.env.BACKEND_PUBLIC_URL?.trim();
  if (backendUrl) {
    origins.add(backendUrl.replace(/\/$/, ''));
  }

  return origins;
}

function createOriginValidator(allowedOrigins, label = 'CORS') {
  return function origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`${label} not allowed: ${origin}`));
  };
}

module.exports = {
  buildAllowedOrigins,
  createOriginValidator,
};
