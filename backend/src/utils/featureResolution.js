function resolveFeatureRow(row) {
  const fromPlan = Boolean(row.from_plan);
  const hasOverride = row.override_id != null;
  let enabled;
  let source;

  if (hasOverride) {
    enabled = Boolean(row.admin_enabled);
    source = row.admin_source || 'admin';
  } else if (fromPlan) {
    enabled = true;
    source = 'plan';
  } else {
    enabled = false;
    source = 'none';
  }

  return {
    feature_key: row.feature_key,
    name: row.name,
    enabled,
    source,
    from_plan: fromPlan,
    has_admin_override: hasOverride,
  };
}

module.exports = { resolveFeatureRow };
