import { db } from '@/lib/db'
import { Role } from '@prisma/client'

export const ORG_ADMIN_ROLES: Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.AGENCY_ADMIN,
]

export const OPERATOR_ROLES: Role[] = [
  Role.STAFF,
  Role.AGENCY_STAFF,
  Role.CLIENT_STAFF,
  Role.CLIENT_ADMIN,
]

export function isOrgAdminRole(role: string | null | undefined): boolean {
  return ORG_ADMIN_ROLES.includes((role || '') as Role)
}

export function isOperatorRole(role: string | null | undefined): boolean {
  return OPERATOR_ROLES.includes((role || '') as Role)
}

export function isClientAdminRole(role: string | null | undefined): boolean {
  return role === Role.CLIENT_ADMIN
}

export interface EffectiveOperatorScope {
  isOrgAdmin: boolean
  permittedBusinessIds: string[]
  assignedLocationIds: string[]
  assignedGroupIds: string[]
  allOrgBusinessIds: string[]
}

/**
 * Authoritatively resolves the set of business IDs a user is permitted to view,
 * manage, or dispatch reviews for within an organization.
 *
 * Rules:
 * 1. OWNER, ADMIN, AGENCY_ADMIN have org-wide scope (all business IDs).
 * 2. CLIENT_ADMIN, STAFF, AGENCY_STAFF, CLIENT_STAFF only have access to businesses explicitly assigned
 *    to them directly (OperatorLocationAssignment) or via groups (OperatorGroupAssignment).
 * 3. If a CLIENT_ADMIN or operator has no explicit assignments, fail closed with empty permittedBusinessIds.
 * 4. VIEWER has read-only access (unassigned operator/client admin has empty set).
 */
export async function resolveEffectiveScope(
  userId: string,
  orgId: string,
  role: string | null | undefined
): Promise<EffectiveOperatorScope> {
  // Always query all businesses belonging to the org
  const orgBusinesses = await db.business.findMany({
    where: { orgId },
    select: { id: true },
  })
  const allOrgBusinessIds = orgBusinesses.map((b) => b.id)

  const isOrgAdmin = isOrgAdminRole(role)

  if (isOrgAdmin) {
    return {
      isOrgAdmin: true,
      permittedBusinessIds: allOrgBusinessIds,
      assignedLocationIds: allOrgBusinessIds,
      assignedGroupIds: [],
      allOrgBusinessIds,
    }
  }

  // Non-admin (STAFF, VIEWER, etc.): Resolve explicit location and group assignments
  const [locationAssignments, groupAssignments] = await Promise.all([
    db.operatorLocationAssignment.findMany({
      where: { orgId, userId },
      select: { businessId: true },
    }),
    db.operatorGroupAssignment.findMany({
      where: { orgId, userId },
      select: {
        groupId: true,
        group: {
          select: {
            locations: {
              select: { businessId: true },
            },
          },
        },
      },
    }),
  ])

  const assignedLocationIds = locationAssignments.map((a) => a.businessId)
  const assignedGroupIds = groupAssignments.map((a) => a.groupId)

  const businessIdSet = new Set<string>()

  // Add direct location assignments (must strictly belong to this org)
  for (const bId of assignedLocationIds) {
    if (allOrgBusinessIds.includes(bId)) {
      businessIdSet.add(bId)
    }
  }

  // Add locations from assigned groups (must strictly belong to this org)
  for (const ga of groupAssignments) {
    if (ga.group?.locations) {
      for (const loc of ga.group.locations) {
        if (allOrgBusinessIds.includes(loc.businessId)) {
          businessIdSet.add(loc.businessId)
        }
      }
    }
  }

  return {
    isOrgAdmin: false,
    permittedBusinessIds: Array.from(businessIdSet),
    assignedLocationIds,
    assignedGroupIds,
    allOrgBusinessIds,
  }
}
