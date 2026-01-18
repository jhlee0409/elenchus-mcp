/**
 * Dynamic Roles Store
 *
 * Separated storage for dynamic roles to avoid circular dependencies.
 * This module stores generated roles and provides lookup functions.
 */

import { RoleDefinition, RolePrompt, VerifierRole } from './types.js';
import {
  type GeneratedVerifierRole,
  type GeneratedCriticRole,
  type DomainDetectionResult,
} from './meta-prompt.js';

// =============================================================================
// Types
// =============================================================================

export interface DynamicRoleState {
  domain: DomainDetectionResult;
  verifierRole: GeneratedVerifierRole;
  criticRole: GeneratedCriticRole;
  verifierDefinition: RoleDefinition;
  criticDefinition: RoleDefinition;
  verifierPrompt: RolePrompt;
  criticPrompt: RolePrompt;
  generatedAt: string;
}

// =============================================================================
// In-Memory Storage
// =============================================================================

const dynamicRoleStates = new Map<string, DynamicRoleState>();

// =============================================================================
// Store Functions
// =============================================================================

/**
 * Store dynamic role state for a session
 */
export function setDynamicRoleState(sessionId: string, state: DynamicRoleState): void {
  dynamicRoleStates.set(sessionId, state);
}

/**
 * Get dynamic role state for a session
 */
export function getDynamicRoleState(sessionId: string): DynamicRoleState | null {
  return dynamicRoleStates.get(sessionId) || null;
}

/**
 * Get dynamic role prompt for a session
 */
export function getDynamicRolePrompt(
  sessionId: string,
  role: VerifierRole
): RolePrompt | null {
  const state = dynamicRoleStates.get(sessionId);
  if (!state) return null;
  return role === 'verifier' ? state.verifierPrompt : state.criticPrompt;
}

/**
 * Get dynamic role definition for a session
 */
export function getDynamicRoleDefinition(
  sessionId: string,
  role: VerifierRole
): RoleDefinition | null {
  const state = dynamicRoleStates.get(sessionId);
  if (!state) return null;
  return role === 'verifier' ? state.verifierDefinition : state.criticDefinition;
}

/**
 * Check if session has dynamic roles
 */
export function hasDynamicRoles(sessionId: string): boolean {
  return dynamicRoleStates.has(sessionId);
}

/**
 * Clear dynamic roles for a session
 */
export function clearDynamicRoles(sessionId: string): boolean {
  return dynamicRoleStates.delete(sessionId);
}

/**
 * Get all session IDs with dynamic roles
 */
export function getDynamicRoleSessionIds(): string[] {
  return Array.from(dynamicRoleStates.keys());
}
