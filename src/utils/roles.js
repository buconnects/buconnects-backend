export const ROLE_VALUES = ['USER', 'ADMIN', 'DEVELOPER'];

export const normalizeRole = (role = 'USER') => {
  const value = typeof role === 'string' ? role.trim() : '';
  if (!value) return 'USER';
  const normalized = value.toUpperCase();
  return ROLE_VALUES.includes(normalized) ? normalized : 'USER';
};

export const isAdminLike = (role) => ['ADMIN', 'DEVELOPER'].includes(normalizeRole(role));

export const canAccessSection = (role, section) => {
  const normalizedRole = normalizeRole(role);
  const allowed = {
    dashboard: ['USER', 'ADMIN', 'DEVELOPER'],
    social: ['USER', 'ADMIN', 'DEVELOPER'],
    chats: ['USER', 'ADMIN', 'DEVELOPER'],
    market: ['USER', 'ADMIN', 'DEVELOPER'],
    updates: ['USER', 'ADMIN', 'DEVELOPER'],
    events: ['USER', 'ADMIN', 'DEVELOPER'],
    hostels: ['USER', 'ADMIN', 'DEVELOPER'],
    profile: ['USER', 'ADMIN', 'DEVELOPER'],
    settings: ['USER', 'ADMIN', 'DEVELOPER'],
    admin: ['ADMIN', 'DEVELOPER'],
    developer: ['DEVELOPER']
  };

  return Boolean(allowed[section] && allowed[section].includes(normalizedRole));
};

export const canCreateContent = (role, contentType) => {
  const normalizedRole = normalizeRole(role);
  if (!['market', 'updates', 'events'].includes(contentType)) {
    return false;
  }

  return isAdminLike(normalizedRole);
};

export const canManageUsers = (role) => ['ADMIN', 'DEVELOPER'].includes(normalizeRole(role));
