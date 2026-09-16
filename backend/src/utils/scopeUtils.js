function restaurantScopeClause(column, accessibleIds, paramIndex) {
  if (accessibleIds === null) return { clause: '', params: [], nextIndex: paramIndex };
  if (!accessibleIds.length) return { clause: ' AND 1=0', params: [], nextIndex: paramIndex };
  return {
    clause: ` AND ${column} = ANY($${paramIndex}::int[])`,
    params: [accessibleIds],
    nextIndex: paramIndex + 1,
  };
}

module.exports = { restaurantScopeClause };
