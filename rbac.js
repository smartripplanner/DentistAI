/**
 * rbac.js - Role-Based Access Control configuration & guards
 */
export const ROLES = {
  PATIENT: 'patient',
  STAFF: 'staff',
  DEVELOPER: 'developer'
};

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  MANAGE_APPOINTMENTS: 'manage_appointments',
  MANAGE_TREATMENTS: 'manage_treatments',
  MANAGE_SETTINGS: 'manage_settings',
  VIEW_DIAGNOSTICS: 'view_diagnostics',
  MANAGE_CONFIG: 'manage_config'
};

const ROLE_PERMISSIONS = {
  [ROLES.PATIENT]: [],
  [ROLES.STAFF]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_APPOINTMENTS,
    PERMISSIONS.MANAGE_TREATMENTS
  ],
  [ROLES.DEVELOPER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_APPOINTMENTS,
    PERMISSIONS.MANAGE_TREATMENTS,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.VIEW_DIAGNOSTICS,
    PERMISSIONS.MANAGE_CONFIG
  ]
};

export function hasPermission(role, permission) {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function getPermittedTabs(role) {
  if (role === ROLES.DEVELOPER) {
    return ['appointments', 'leads', 'whatsapp', 'handoffs', 'telephony', 'gateway', 'settings', 'clinic-settings', 'treatments', 'specialists', 'logs', 'analytics'];
  } else if (role === ROLES.STAFF) {
    return ['appointments', 'leads', 'handoffs', 'telephony', 'treatments', 'specialists', 'analytics'];
  }
  return [];
}
