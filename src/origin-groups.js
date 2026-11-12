export function isOriginCollapsed(state, origin) {
  return state.collapsedOrigins.includes(origin);
}

export function toggleOriginCollapsed(state, origin) {
  const collapsedOrigins = isOriginCollapsed(state, origin)
    ? state.collapsedOrigins.filter((item) => item !== origin)
    : [...state.collapsedOrigins, origin];

  return { ...state, collapsedOrigins };
}
