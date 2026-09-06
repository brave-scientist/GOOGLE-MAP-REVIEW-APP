'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Network,
  Building2,
  Users,
  Shield,
  Plus,
  Trash2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderPlus,
  UserPlus,
  X,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'

interface LocationItem {
  id: string
  name: string
  address?: string | null
  industry?: string | null
}

interface GroupItem {
  id: string
  name: string
  description?: string | null
  createdAt: string
  locationCount: number
  locations: LocationItem[]
  operatorCount: number
  operators: { id: string; name: string | null; email: string }[]
}

interface OperatorItem {
  userId: string
  name: string | null
  email: string
  role: string
  isOrgAdmin: boolean
  assignedLocations: LocationItem[]
  assignedGroups: { id: string; name: string; locationCount: number }[]
  effectiveLocationCount: number
  effectiveLocationIds: string[]
}

interface ScopeData {
  userId: string
  email: string
  role: string
  isOrgAdmin: boolean
  totalOrgLocations: number
  permittedLocationCount: number
  permittedBusinesses: LocationItem[]
  accessibleGroups: { id: string; name: string; locationCount: number }[]
}

export default function GovernancePage() {
  const [activeTab, setActiveTab] = useState<'groups' | 'operators' | 'overview'>('groups')
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [operators, setOperators] = useState<OperatorItem[]>([])
  const [scope, setScope] = useState<ScopeData | null>(null)
  const [allLocations, setAllLocations] = useState<LocationItem[]>([])

  // Modal states
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [selectedBizIdsForGroup, setSelectedBizIdsForGroup] = useState<string[]>([])
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false)

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [assignmentType, setAssignmentType] = useState<'location' | 'group'>('location')
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false)

  const [addLocModalGroupId, setAddLocModalGroupId] = useState<string | null>(null)
  const [selectedBizToAdd, setSelectedBizToAdd] = useState<string[]>([])

  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/governance/groups').then(r => r.json()),
      fetch('/api/governance/operators').then(r => r.json()),
      fetch('/api/governance/effective-scope').then(r => r.json()),
      fetch('/api/dashboard').then(r => r.json()),
    ])
      .then(([gData, oData, sData, dData]) => {
        if (!active) return
        setGroups(gData.groups || [])
        setOperators(oData.operators || [])
        setScope(sData.scope || null)
        setAllLocations(dData.businesses || [])
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        console.error('Failed to load governance data:', err)
        toast.error('Failed to load regional governance data')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshTrigger])

  // Handle Create Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) {
      toast.error('Group name is required')
      return
    }

    setIsSubmittingGroup(true)
    try {
      const res = await fetch('/api/governance/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim() || undefined,
          businessIds: selectedBizIdsForGroup,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Group "${newGroupName}" created successfully`)
        setShowCreateGroupModal(false)
        setNewGroupName('')
        setNewGroupDesc('')
        setSelectedBizIdsForGroup([])
        setRefreshTrigger(t => t + 1)
      } else {
        toast.error(data.error || 'Failed to create group')
      }
    } catch {
      toast.error('Error creating group')
    } finally {
      setIsSubmittingGroup(false)
    }
  }

  // Handle Delete Group
  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to delete group "${groupName}"?`)) return
    try {
      const res = await fetch(`/api/governance/groups/${groupId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`Group "${groupName}" deleted`)
        setRefreshTrigger(t => t + 1)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete group')
      }
    } catch {
      toast.error('Error deleting group')
    }
  }

  // Handle Assign Operator
  const handleAssignOperator = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId || !selectedTargetId) {
      toast.error('Please select both a user and a target')
      return
    }

    setIsSubmittingAssignment(true)
    try {
      const res = await fetch('/api/governance/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          type: assignmentType,
          targetId: selectedTargetId,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Operator assigned successfully')
        setShowAssignModal(false)
        setSelectedUserId('')
        setSelectedTargetId('')
        setRefreshTrigger(t => t + 1)
      } else {
        toast.error(data.error || 'Failed to assign operator')
      }
    } catch {
      toast.error('Error assigning operator')
    } finally {
      setIsSubmittingAssignment(false)
    }
  }

  // Handle Remove Operator Assignment
  const handleRemoveAssignment = async (userId: string, type: 'location' | 'group', targetId: string) => {
    try {
      const res = await fetch('/api/governance/operators', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type, targetId }),
      })
      if (res.ok) {
        toast.success('Assignment removed')
        setRefreshTrigger(t => t + 1)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove assignment')
      }
    } catch {
      toast.error('Error removing assignment')
    }
  }

  // Handle Add Locations to existing group
  const handleAddLocationsToGroup = async (groupId: string) => {
    if (selectedBizToAdd.length === 0) {
      toast.error('Select at least one location to add')
      return
    }

    try {
      const res = await fetch(`/api/governance/groups/${groupId}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: selectedBizToAdd }),
      })
      if (res.ok) {
        toast.success('Locations added to group')
        setAddLocModalGroupId(null)
        setSelectedBizToAdd([])
        setRefreshTrigger(t => t + 1)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to add locations')
      }
    } catch {
      toast.error('Error adding locations')
    }
  }

  // Handle Remove Location from group
  const handleRemoveLocationFromGroup = async (groupId: string, businessId: string) => {
    try {
      const res = await fetch(`/api/governance/groups/${groupId}/locations?businessId=${businessId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Location removed from group')
        setRefreshTrigger(t => t + 1)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove location')
      }
    } catch {
      toast.error('Error removing location')
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppTopbar
          title="Regional Governance"
          description="Multi-location groups, operator access, and server-enforced boundaries"
        />
        <MobileNav />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Network className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    Regional Operator Governance
                    <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                      ORG-02
                    </Badge>
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Multi-location regional grouping, operator role assignments, and server-enforced access boundaries.
                  </p>
                </div>
              </div>
            </div>

            {scope?.isOrgAdmin && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowCreateGroupModal(true)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  New Location Group
                </Button>
                <Button
                  onClick={() => setShowAssignModal(true)}
                  variant="outline"
                  className="border-primary/20 hover:bg-primary/10 text-foreground flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Assign Operator
                </Button>
              </div>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-card">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {scope?.totalOrgLocations ?? allLocations.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Org Locations</div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
                  <Network className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{groups.length}</div>
                  <div className="text-xs text-muted-foreground">Regional Groups</div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{operators.length}</div>
                  <div className="text-xs text-muted-foreground">Active Org Members</div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {scope?.isOrgAdmin ? 'Org Admin' : scope?.role || 'Staff'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Your Scope: {scope?.permittedLocationCount ?? 0} Locs
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <button
              onClick={() => setActiveTab('groups')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'groups'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Network className="w-4 h-4" />
              Location Groups ({groups.length})
            </button>
            <button
              onClick={() => setActiveTab('operators')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'operators'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Users className="w-4 h-4" />
              Regional Operators ({operators.length})
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Shield className="w-4 h-4" />
              Authorization & Boundaries
            </button>
          </div>

          {/* Loading Indicator */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading governance data...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: LOCATION GROUPS */}
              {activeTab === 'groups' && (
                <div className="space-y-4">
                  {groups.length === 0 ? (
                    <Card className="glass-card text-center p-12 border-dashed">
                      <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                        <FolderPlus className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">No Location Groups Created</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1 mb-6">
                        Organize your multiple locations into regional clusters, franchises, or district groups for centralized management and scoped operator dispatch.
                      </p>
                      {scope?.isOrgAdmin && (
                        <Button onClick={() => setShowCreateGroupModal(true)} className="bg-primary text-primary-foreground">
                          Create Your First Group
                        </Button>
                      )}
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {groups.map((group) => (
                        <Card key={group.id} className="glass-card flex flex-col justify-between">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                                  {group.name}
                                </CardTitle>
                                {group.description && (
                                  <CardDescription className="text-xs mt-1">{group.description}</CardDescription>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                                  {group.locationCount} {group.locationCount === 1 ? 'Location' : 'Locations'}
                                </Badge>
                                {scope?.isOrgAdmin && (
                                  <button
                                    onClick={() => handleDeleteGroup(group.id, group.name)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Delete Group"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-4 pt-0">
                            {/* Locations list */}
                            <div>
                              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center justify-between">
                                <span>Assigned Locations</span>
                                {scope?.isOrgAdmin && (
                                  <button
                                    onClick={() => {
                                      setAddLocModalGroupId(group.id)
                                      setSelectedBizToAdd([])
                                    }}
                                    className="text-primary hover:underline flex items-center gap-1 normal-case font-normal"
                                  >
                                    <Plus className="w-3 h-3" /> Add Location
                                  </button>
                                )}
                              </div>

                              {group.locations.length === 0 ? (
                                <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground text-center">
                                  No locations assigned to this group yet.
                                </div>
                              ) : (
                                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                  {group.locations.map((loc) => (
                                    <div
                                      key={loc.id}
                                      className="p-2 rounded-lg bg-muted/30 border border-border/40 flex items-center justify-between text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                        <span className="font-medium text-foreground truncate">{loc.name}</span>
                                        {loc.address && (
                                          <span className="text-muted-foreground truncate text-[11px] hidden sm:inline">
                                            ({loc.address})
                                          </span>
                                        )}
                                      </div>
                                      {scope?.isOrgAdmin && (
                                        <button
                                          onClick={() => handleRemoveLocationFromGroup(group.id, loc.id)}
                                          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors flex-shrink-0"
                                          title="Remove from group"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Operators assigned to this group */}
                            <div className="pt-2 border-t border-border/30">
                              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                <Users className="w-3 h-3" />
                                <span>Assigned Regional Operators ({group.operatorCount})</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.operators.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">None directly assigned to group</span>
                                ) : (
                                  group.operators.map((op) => (
                                    <Badge key={op.id} variant="outline" className="text-xs font-normal">
                                      {op.name || op.email}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: REGIONAL OPERATORS */}
              {activeTab === 'operators' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {operators.map((op) => (
                      <Card key={op.userId} className="glass-card flex flex-col justify-between">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-base font-bold text-foreground truncate">
                                {op.name || op.email.split('@')[0]}
                              </CardTitle>
                              <CardDescription className="text-xs truncate">{op.email}</CardDescription>
                            </div>
                            <Badge
                              className={
                                op.isOrgAdmin
                                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                  : op.role === 'STAFF'
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : 'bg-muted text-muted-foreground'
                              }
                            >
                              {op.role}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 pt-0">
                          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Effective Scope:</span>
                            <span className="font-bold text-foreground">
                              {op.isOrgAdmin
                                ? 'All Organization Locations (Org Admin)'
                                : `${op.effectiveLocationCount} Permitted Locations`}
                            </span>
                          </div>

                          {/* Direct Location Assignments */}
                          {!op.isOrgAdmin && (
                            <>
                              <div>
                                <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">
                                  Direct Location Grants ({op.assignedLocations.length})
                                </div>
                                {op.assignedLocations.length === 0 ? (
                                  <div className="text-xs text-muted-foreground italic">No direct location grants</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {op.assignedLocations.map((loc) => (
                                      <span
                                        key={loc.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-primary/10 text-primary border border-primary/20"
                                      >
                                        <MapPin className="w-2.5 h-2.5" />
                                        {loc.name}
                                        {scope?.isOrgAdmin && (
                                          <button
                                            onClick={() => handleRemoveAssignment(op.userId, 'location', loc.id)}
                                            className="hover:text-destructive"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Group Grants */}
                              <div>
                                <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">
                                  Group Grants ({op.assignedGroups.length})
                                </div>
                                {op.assignedGroups.length === 0 ? (
                                  <div className="text-xs text-muted-foreground italic">No group grants</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {op.assignedGroups.map((g) => (
                                      <span
                                        key={g.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                      >
                                        <Network className="w-2.5 h-2.5" />
                                        {g.name} ({g.locationCount})
                                        {scope?.isOrgAdmin && (
                                          <button
                                            onClick={() => handleRemoveAssignment(op.userId, 'group', g.id)}
                                            className="hover:text-destructive"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: OVERVIEW & BOUNDARIES */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Multi-Location Architecture & Truthful Security Invariants
                      </CardTitle>
                      <CardDescription>
                        ReviewReply strictly enforces server-side tenant isolation and regional operator boundaries on all requests.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2">
                          <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            Zero Client Trust
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Client-provided IDs are never trusted. All organization, location, and role boundaries are resolved from the authenticated JWT session and database state.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2">
                          <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            Scoped Review Boundaries
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Operators assigned only to Location A cannot read, approve, or bulk-dispatch reviews for Location B. Cross-location requests fail closed with 403 FORBIDDEN.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2">
                          <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            Atomic Bulk Dispatch
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Bulk reviews are atomically claimed in POSTING status to prevent concurrent double-publishing, with truthful per-review status reconciliation.
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Milestone: JOB-14 (`ORG-02`)</span>
                        <span className="font-mono">Security Gate: Active & Enforced</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}

          {/* CREATE GROUP MODAL */}
          {showCreateGroupModal && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <FolderPlus className="w-5 h-5 text-primary" />
                    Create Location Group
                  </h3>
                  <button
                    onClick={() => setShowCreateGroupModal(false)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">Group Name *</label>
                    <Input
                      placeholder="e.g. Northeast Region, Downtown Cluster"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">Description (Optional)</label>
                    <Input
                      placeholder="e.g. Metro stores operating in regional district 4"
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">
                      Select Locations to Include ({selectedBizIdsForGroup.length} selected)
                    </label>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-border/40 rounded-xl p-2 bg-muted/20">
                      {allLocations.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-2 text-center">No locations available</div>
                      ) : (
                        allLocations.map((loc) => {
                          const isSelected = selectedBizIdsForGroup.includes(loc.id)
                          return (
                            <label
                              key={loc.id}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                                isSelected ? 'bg-primary/15 border border-primary/30' : 'hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedBizIdsForGroup([...selectedBizIdsForGroup, loc.id])
                                    } else {
                                      setSelectedBizIdsForGroup(selectedBizIdsForGroup.filter((id) => id !== loc.id))
                                    }
                                  }}
                                  className="rounded border-border"
                                />
                                <span className="font-medium text-foreground">{loc.name}</span>
                              </div>
                              {loc.address && <span className="text-muted-foreground text-[11px]">{loc.address}</span>}
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateGroupModal(false)}
                      disabled={isSubmittingGroup}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-primary text-primary-foreground" disabled={isSubmittingGroup}>
                      {isSubmittingGroup ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create Group
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ASSIGN OPERATOR MODAL */}
          {showAssignModal && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-primary" />
                    Assign Regional Operator
                  </h3>
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAssignOperator} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">Select User / Staff *</label>
                    <select
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose User --</option>
                      {operators.map((op) => (
                        <option key={op.userId} value={op.userId}>
                          {op.name ? `${op.name} (${op.email})` : op.email} — Role: {op.role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">Assignment Scope *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAssignmentType('location')
                          setSelectedTargetId('')
                        }}
                        className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                          assignmentType === 'location'
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                        Specific Location
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignmentType('group')
                          setSelectedTargetId('')
                        }}
                        className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                          assignmentType === 'group'
                            ? 'bg-purple-500/10 border-purple-500 text-purple-400 font-bold'
                            : 'border-border hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <Network className="w-4 h-4" />
                        Regional Group
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">
                      {assignmentType === 'location' ? 'Choose Location *' : 'Choose Regional Group *'}
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      value={selectedTargetId}
                      onChange={(e) => setSelectedTargetId(e.target.value)}
                      required
                    >
                      <option value="">
                        {assignmentType === 'location' ? '-- Select Location --' : '-- Select Group --'}
                      </option>
                      {assignmentType === 'location'
                        ? allLocations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name} {loc.address ? `(${loc.address})` : ''}
                            </option>
                          ))
                        : groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.locationCount} locations)
                            </option>
                          ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAssignModal(false)}
                      disabled={isSubmittingAssignment}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-primary text-primary-foreground"
                      disabled={isSubmittingAssignment}
                    >
                      {isSubmittingAssignment ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Confirm Assignment
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ADD LOCATION TO GROUP MODAL */}
          {addLocModalGroupId && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-foreground">Add Locations to Group</h3>
                  <button
                    onClick={() => setAddLocModalGroupId(null)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-border/40 rounded-xl p-2 bg-muted/20">
                  {allLocations.map((loc) => {
                    const isSelected = selectedBizToAdd.includes(loc.id)
                    return (
                      <label
                        key={loc.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                          isSelected ? 'bg-primary/15 border border-primary/30' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBizToAdd([...selectedBizToAdd, loc.id])
                              } else {
                                setSelectedBizToAdd(selectedBizToAdd.filter((id) => id !== loc.id))
                              }
                            }}
                            className="rounded border-border"
                          />
                          <span className="font-medium text-foreground">{loc.name}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                  <Button variant="outline" onClick={() => setAddLocModalGroupId(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleAddLocationsToGroup(addLocModalGroupId)}
                    className="bg-primary text-primary-foreground"
                  >
                    Add Selected
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
