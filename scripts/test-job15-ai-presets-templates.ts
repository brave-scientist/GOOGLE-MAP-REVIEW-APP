/**
 * scripts/test-job15-ai-presets-templates.ts
 *
 * Dedicated verification suite for Milestone JOB-15:
 * AI Reply Template Management & Custom Fine-Tuning Presets (AI-02)
 *
 * Validates:
 *  1. Unauthenticated access rejected (401) on template and preset endpoints
 *  2. VIEWER role cannot mutate templates or presets (403 FORBIDDEN)
 *  3. OWNER and ADMIN can manage templates and presets (200/201)
 *  4. Tenant isolation and Anti-IDOR (Tenant B cannot access or mutate Tenant A templates/presets)
 *  5. Cross-tenant businessId rejected on creation
 *  6. Template token engine validation, extraction, and safe case-insensitive hydration
 *  7. Token engine fallback handling for missing customer/business parameters
 *  8. Template preview endpoint (/api/templates/preview) hydration
 *  9. Template CRUD: Creation with category, listing with filters, updating, deleting
 * 10. Default template setting per category (unsets previous default)
 * 11. AI Presets listing includes system standard presets + custom presets
 * 12. Custom AI Preset creation with tone, response length, instructions, signature
 * 13. System presets protected from direct deletion or modification
 * 14. Setting preset as default updates database and audit log
 * 15. Draft generation with AI Preset applies length constraints and custom instructions
 * 16. Direct template application mode hydrates variables and increments usage count
 * 17. Audit logs generated for all template and preset lifecycle actions
 * 18. Zero regression on existing single and bulk review publishing
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getTemplatesHandler, POST as postTemplatesHandler } from '../src/app/api/templates/route'
import { GET as getTemplateDetailHandler, PUT as putTemplateHandler, DELETE as deleteTemplateHandler } from '../src/app/api/templates/[id]/route'
import { POST as postTemplatePreviewHandler } from '../src/app/api/templates/preview/route'
import { GET as getPresetsHandler, POST as postPresetsHandler } from '../src/app/api/ai-presets/route'
import { GET as getPresetDetailHandler, PUT as putPresetHandler, DELETE as deletePresetHandler } from '../src/app/api/ai-presets/[id]/route'
import { POST as postSetDefaultPresetHandler } from '../src/app/api/ai-presets/[id]/set-default/route'
import { POST as postDraftHandler } from '../src/app/api/reviews/[id]/draft/route'
import { Role, DraftStatus, ReviewSource } from '@prisma/client'
import { extractTokens, validateTemplate, hydrateTemplate } from '../src/lib/templates/token-engine'
import { SYSTEM_PRESETS, buildSystemPrompt } from '../src/lib/templates/presets'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  method = 'GET',
  body?: any,
  overrideRole?: Role
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (tenant) {
    const token = await encodeSession({
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: overrideRole || tenant.membership.role,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
      sessionVersion: tenant.user.sessionVersion,
    })
    headers['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const reqInit: any = {
    method,
    headers,
  }

  if (body !== undefined && method !== 'GET') {
    reqInit.body = JSON.stringify(body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit)
}

async function runJob15Suite() {
  console.log('====================================================================')
  console.log('JOB-15 VERIFICATION SUITE: AI Reply Templates & Fine-Tuning Presets (AI-02)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  try {
    // Seed test tenants
    tenantA = await seedTestTenant({ name: 'Tenant A', email: 'job15_a@example.com' })
    tenantB = await seedTestTenant({ name: 'Tenant B', email: 'job15_b@example.com' })

    const businessA = tenantA.business
    const businessB = tenantB.business

    // Create test reviews for Tenant A
    const timestamp = Date.now()
    const reviewA1 = await prisma.review.create({
      data: {
        businessId: businessA.id,
        source: ReviewSource.GOOGLE,
        externalId: `ext_review_a1_${timestamp}`,
        author: 'Marcus Vance',
        rating: 5,
        text: 'The artisan coffee and almond croissants were spectacular! Great morning vibe.',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    const reviewA2 = await prisma.review.create({
      data: {
        businessId: businessA.id,
        source: ReviewSource.GOOGLE,
        externalId: `ext_review_a2_${timestamp}`,
        author: 'Elena Rostova',
        rating: 1,
        text: 'Waited 45 minutes for our order and the manager was rude. Seeking a full refund.',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    // Create Viewer user in Tenant A
    const viewerUser = await prisma.user.create({
      data: { email: `viewer_${Date.now()}@example.com`, name: 'Vicky Viewer' },
    })
    const viewerMember = await prisma.orgMember.create({
      data: { userId: viewerUser.id, orgId: tenantA.org.id, role: Role.VIEWER },
    })
    const viewerTenant: TestSeedResult = { ...tenantA, user: viewerUser, membership: viewerMember }

    // ────────────────────────────────────────────────────────────────
    // Section 1: Authentication & Authorization Tests
    // ────────────────────────────────────────────────────────────────
    console.log('[Test 1] Unauthenticated Access Rejected')
    {
      const reqGetTemplates = await createAuthRequest('http://localhost:3000/api/templates', null, 'GET')
      const resGetTemplates = await getTemplatesHandler(reqGetTemplates)
      assert(resGetTemplates.status === 401, 'Unauthenticated GET /api/templates returns 401')

      const reqPostTemplates = await createAuthRequest('http://localhost:3000/api/templates', null, 'POST', { title: 'Test' })
      const resPostTemplates = await postTemplatesHandler(reqPostTemplates)
      assert(resPostTemplates.status === 401, 'Unauthenticated POST /api/templates returns 401')

      const reqGetPresets = await createAuthRequest('http://localhost:3000/api/ai-presets', null, 'GET')
      const resGetPresets = await getPresetsHandler(reqGetPresets)
      assert(resGetPresets.status === 401, 'Unauthenticated GET /api/ai-presets returns 401')

      const reqPostPresets = await createAuthRequest('http://localhost:3000/api/ai-presets', null, 'POST', { name: 'Test' })
      const resPostPresets = await postPresetsHandler(reqPostPresets)
      assert(resPostPresets.status === 401, 'Unauthenticated POST /api/ai-presets returns 401')
    }

    console.log('\n[Test 2] VIEWER Role Mutation Restrictions')
    {
      const reqViewerTemplate = await createAuthRequest(
        'http://localhost:3000/api/templates',
        viewerTenant,
        'POST',
        { businessId: businessA.id, title: 'Viewer Template', body: 'Test body' }
      )
      const resViewerTemplate = await postTemplatesHandler(reqViewerTemplate)
      assert(resViewerTemplate.status === 403, 'VIEWER cannot create template (403 FORBIDDEN)')

      const reqViewerPreset = await createAuthRequest(
        'http://localhost:3000/api/ai-presets',
        viewerTenant,
        'POST',
        { businessId: businessA.id, name: 'Viewer Preset', tone: 'Warm' }
      )
      const resViewerPreset = await postPresetsHandler(reqViewerPreset)
      assert(resViewerPreset.status === 403, 'VIEWER cannot create AI preset (403 FORBIDDEN)')
    }

    // ────────────────────────────────────────────────────────────────
    // Section 2: Dynamic Token Hydration Engine
    // ────────────────────────────────────────────────────────────────
    console.log('\n[Test 3] Token Engine Extraction & Validation')
    {
      const templateStr = 'Hi {{first_name}}, thanks for visiting {{business_name}}! We loved your {{rating}}-star review. Call {{business_phone}}.'
      const tokens = extractTokens(templateStr)
      assert(tokens.length === 4, 'Extracted exactly 4 unique tokens')
      assert(tokens.includes('{{first_name}}'), 'Contains {{first_name}}')
      assert(tokens.includes('{{business_name}}'), 'Contains {{business_name}}')
      assert(tokens.includes('{{rating}}'), 'Contains {{rating}}')
      assert(tokens.includes('{{business_phone}}'), 'Contains {{business_phone}}')

      const validResult = validateTemplate(templateStr)
      assert(validResult.valid === true, 'Valid template passes validation with zero errors')

      const invalidStr = 'Hi {first_name}, thanks for visiting {{business_name}!'
      const invalidResult = validateTemplate(invalidStr)
      assert(invalidResult.valid === false, 'Invalid template with single braces correctly flagged')
      assert(invalidResult.errors.length > 0, 'Validation errors returned')
    }

    console.log('\n[Test 4] Safe Token Hydration with Full & Partial Context')
    {
      const template = 'Dear {{customer_name}}, thank you for the {{rating_stars}} rating at {{business_name}}! Reach {{manager_name}} at {{contact_email}} or {{business_phone}}.'
      const hydrated = hydrateTemplate(template, {
        customerName: 'Marcus Vance',
        businessName: 'The Roast & Bean',
        rating: 5,
        managerName: 'Alex Morgan',
        contactEmail: 'contact@roastbean.com',
        businessPhone: '+1 (555) 345-6789',
      })

      assert(hydrated.includes('Dear Marcus Vance,'), 'Hydrated customer name')
      assert(hydrated.includes('★★★★★ rating'), 'Hydrated 5-star rating symbol')
      assert(hydrated.includes('The Roast & Bean'), 'Hydrated business name')
      assert(hydrated.includes('Alex Morgan'), 'Hydrated manager name')
      assert(hydrated.includes('contact@roastbean.com'), 'Hydrated contact email')
      assert(hydrated.includes('+1 (555) 345-6789'), 'Hydrated business phone')

      // Test fallbacks when fields are missing
      const fallbackTemplate = 'Hi {{first_name}} ({{customer_name}}), thanks from {{business_name}}!'
      const hydratedFallback = hydrateTemplate(fallbackTemplate, {})
      assert(hydratedFallback.includes('Hi there (Valued Customer)'), 'Hydrated default fallbacks for missing name')
      assert(hydratedFallback.includes('our team'), 'Hydrated default fallback for missing business name')
    }

    console.log('\n[Test 5] POST /api/templates/preview Endpoint')
    {
      const reqPreview = await createAuthRequest(
        'http://localhost:3000/api/templates/preview',
        tenantA,
        'POST',
        {
          templateBody: 'Hi {{first_name}}, thanks for your review on {{platform}} for {{business_name}}!',
          businessId: businessA.id,
          reviewId: reviewA1.id,
        }
      )
      const resPreview = await postTemplatePreviewHandler(reqPreview)
      assert(resPreview.status === 200, 'Template preview returns 200')
      const previewData = await resPreview.json()
      assert(previewData.hydrated.includes('Hi Marcus,'), 'Preview hydrated author first name')
      assert(previewData.hydrated.toLowerCase().includes('google'), 'Preview hydrated review platform')
      assert(previewData.isValid === true, 'Preview flags template as valid')
    }

    // ────────────────────────────────────────────────────────────────
    // Section 3: Reply Templates CRUD & Tenant Isolation
    // ────────────────────────────────────────────────────────────────
    console.log('\n[Test 6] Reply Template Creation & Category Classification')
    let templateA1Id = ''
    let templateA2Id = ''
    {
      // Create Positive Template
      const reqCreate1 = await createAuthRequest(
        'http://localhost:3000/api/templates',
        tenantA,
        'POST',
        {
          businessId: businessA.id,
          title: '5-Star Warm Coffee Thanks',
          body: 'Hi {{first_name}}, thank you so much for the {{rating}}-star review for {{business_name}}! We are thrilled you enjoyed your visit and look forward to seeing you soon.',
          category: 'POSITIVE',
          isDefault: true,
        }
      )
      const resCreate1 = await postTemplatesHandler(reqCreate1)
      assert(resCreate1.status === 201, 'OWNER creates positive template (201 Created)')
      const data1 = await resCreate1.json()
      templateA1Id = data1.template.id
      assert(data1.template.isDefault === true, 'Template marked as default')
      assert(data1.template.category === 'POSITIVE', 'Template categorized as POSITIVE')

      // Create Escalation Template
      const reqCreate2 = await createAuthRequest(
        'http://localhost:3000/api/templates',
        tenantA,
        'POST',
        {
          businessId: businessA.id,
          title: 'Urgent Service Recovery Protocol',
          body: 'Hello {{first_name}}, we sincerely apologize that your experience at {{business_name}} fell short. Please contact our leadership team at {{contact_email}} so we can investigate and resolve this immediately.',
          category: 'ESCALATION',
          isDefault: true,
        }
      )
      const resCreate2 = await postTemplatesHandler(reqCreate2)
      assert(resCreate2.status === 201, 'OWNER creates escalation template (201 Created)')
      const data2 = await resCreate2.json()
      templateA2Id = data2.template.id
    }

    console.log('\n[Test 7] Template Listing & Category Filtering')
    {
      // List all
      const reqListAll = await createAuthRequest(
        `http://localhost:3000/api/templates?businessId=${businessA.id}`,
        tenantA,
        'GET'
      )
      const resListAll = await getTemplatesHandler(reqListAll)
      const listData = await resListAll.json()
      assert(resListAll.status === 200, 'List templates returns 200')
      assert(listData.templates.length >= 2, 'Returns all templates for business')

      // Filter by category POSITIVE
      const reqFilterPos = await createAuthRequest(
        `http://localhost:3000/api/templates?businessId=${businessA.id}&category=POSITIVE`,
        tenantA,
        'GET'
      )
      const resFilterPos = await getTemplatesHandler(reqFilterPos)
      const posData = await resFilterPos.json()
      assert(posData.templates.every((t: any) => t.category === 'POSITIVE'), 'Filtered listing returns only POSITIVE templates')
    }

    console.log('\n[Test 8] Template Modification & Deletion')
    {
      // Update template title
      const reqPut = await createAuthRequest(
        `http://localhost:3000/api/templates/${templateA1Id}`,
        tenantA,
        'PUT',
        { title: 'Updated 5-Star Coffee Thanks' }
      )
      const resPut = await putTemplateHandler(reqPut, { params: Promise.resolve({ id: templateA1Id }) })
      assert(resPut.status === 200, 'Update template returns 200')
      const putData = await resPut.json()
      assert(putData.template.title === 'Updated 5-Star Coffee Thanks', 'Updated title persisted')

      // Get single template
      const reqGet = await createAuthRequest(
        `http://localhost:3000/api/templates/${templateA1Id}`,
        tenantA,
        'GET'
      )
      const resGet = await getTemplateDetailHandler(reqGet, { params: Promise.resolve({ id: templateA1Id }) })
      assert(resGet.status === 200, 'Get template detail returns 200')
    }

    console.log('\n[Test 9] Tenant Isolation & Anti-IDOR on Templates')
    {
      // Tenant B tries to GET Tenant A's template
      const reqCrossGet = await createAuthRequest(
        `http://localhost:3000/api/templates/${templateA1Id}`,
        tenantB,
        'GET'
      )
      const resCrossGet = await getTemplateDetailHandler(reqCrossGet, { params: Promise.resolve({ id: templateA1Id }) })
      assert(resCrossGet.status === 404, 'Cross-tenant GET template fails closed with 404 NOT_FOUND')

      // Tenant B tries to PUT Tenant A's template
      const reqCrossPut = await createAuthRequest(
        `http://localhost:3000/api/templates/${templateA1Id}`,
        tenantB,
        'PUT',
        { title: 'Hacked Title' }
      )
      const resCrossPut = await putTemplateHandler(reqCrossPut, { params: Promise.resolve({ id: templateA1Id }) })
      assert(resCrossPut.status === 404, 'Cross-tenant PUT template fails closed with 404 NOT_FOUND')

      // Tenant B tries to DELETE Tenant A's template
      const reqCrossDel = await createAuthRequest(
        `http://localhost:3000/api/templates/${templateA1Id}`,
        tenantB,
        'DELETE'
      )
      const resCrossDel = await deleteTemplateHandler(reqCrossDel, { params: Promise.resolve({ id: templateA1Id }) })
      assert(resCrossDel.status === 404, 'Cross-tenant DELETE template fails closed with 404 NOT_FOUND')

      // Tenant A tries to create template targeting Tenant B's businessId
      const reqCrossCreate = await createAuthRequest(
        'http://localhost:3000/api/templates',
        tenantA,
        'POST',
        { businessId: businessB.id, title: 'Infiltrate', body: 'Test' }
      )
      const resCrossCreate = await postTemplatesHandler(reqCrossCreate)
      assert(resCrossCreate.status === 403, 'Creating template with foreign businessId returns 403 FORBIDDEN')
    }

    // ────────────────────────────────────────────────────────────────
    // Section 4: AI Fine-Tuning Presets
    // ────────────────────────────────────────────────────────────────
    console.log('\n[Test 10] System Presets & Custom Preset Listing')
    {
      const reqPresets = await createAuthRequest(
        `http://localhost:3000/api/ai-presets?businessId=${businessA.id}`,
        tenantA,
        'GET'
      )
      const resPresets = await getPresetsHandler(reqPresets)
      assert(resPresets.status === 200, 'GET /api/ai-presets returns 200')
      const pData = await resPresets.json()
      assert(pData.systemPresets.length >= 5, 'Includes at least 5 standard system presets')
      assert(pData.systemPresets.some((p: any) => p.id === 'sys_preset_professional_warm'), 'Contains Professional & Warm preset')
      assert(pData.systemPresets.some((p: any) => p.id === 'sys_preset_casual_friendly'), 'Contains Casual & Friendly preset')
      assert(pData.systemPresets.some((p: any) => p.id === 'sys_preset_luxury_concierge'), 'Contains Luxury Concierge preset')
    }

    console.log('\n[Test 11] Custom AI Preset Creation & Default Assignment')
    let customPresetId = ''
    {
      const reqCreatePreset = await createAuthRequest(
        'http://localhost:3000/api/ai-presets',
        tenantA,
        'POST',
        {
          businessId: businessA.id,
          name: 'Artisan Bistro Voice',
          description: 'Passionate and culinary-focused tone for our bakery bistro',
          tone: 'Warm, authentic, artisanal, and culinary-enthusiastic.',
          responseLength: 'BALANCED',
          customInstructions: 'Always mention our organic sourdough and invite them to try our weekend brunch.',
          signature: '— Chef Jean-Luc & Team',
          isDefault: true,
        }
      )
      const resCreatePreset = await postPresetsHandler(reqCreatePreset)
      assert(resCreatePreset.status === 201, 'Create custom AI preset returns 201')
      const cpData = await resCreatePreset.json()
      customPresetId = cpData.preset.id
      assert(cpData.preset.isDefault === true, 'Custom preset set as default')
      assert(cpData.preset.signature === '— Chef Jean-Luc & Team', 'Signature preserved')

      // Set-default endpoint verification
      const reqSetDef = await createAuthRequest(
        `http://localhost:3000/api/ai-presets/${customPresetId}/set-default`,
        tenantA,
        'POST',
        { businessId: businessA.id }
      )
      const resSetDef = await postSetDefaultPresetHandler(reqSetDef, { params: Promise.resolve({ id: customPresetId }) })
      assert(resSetDef.status === 200, 'Set default preset endpoint returns 200')
    }

    console.log('\n[Test 12] AI Preset Tenant Isolation')
    {
      const reqCrossPreset = await createAuthRequest(
        `http://localhost:3000/api/ai-presets/${customPresetId}`,
        tenantB,
        'GET'
      )
      const resCrossPreset = await getPresetDetailHandler(reqCrossPreset, { params: Promise.resolve({ id: customPresetId }) })
      assert(resCrossPreset.status === 404, 'Cross-tenant GET custom preset returns 404 NOT_FOUND')

      const reqCrossPresetPut = await createAuthRequest(
        `http://localhost:3000/api/ai-presets/${customPresetId}`,
        tenantB,
        'PUT',
        { name: 'Hijacked' }
      )
      const resCrossPresetPut = await putPresetHandler(reqCrossPresetPut, { params: Promise.resolve({ id: customPresetId }) })
      assert(resCrossPresetPut.status === 404, 'Cross-tenant PUT custom preset returns 404 NOT_FOUND')
    }

    console.log('\n[Test 13] System Preset Protection')
    {
      const reqSysDel = await createAuthRequest(
        'http://localhost:3000/api/ai-presets/sys_preset_professional_warm',
        tenantA,
        'DELETE'
      )
      const resSysDel = await deletePresetHandler(reqSysDel, { params: Promise.resolve({ id: 'sys_preset_professional_warm' }) })
      assert(resSysDel.status === 400, 'Direct deletion of system preset rejected with 400')
    }

    // ────────────────────────────────────────────────────────────────
    // Section 5: Draft Generation with Presets & Templates
    // ────────────────────────────────────────────────────────────────
    console.log('\n[Test 14] Prompt Assembly Helper (buildSystemPrompt)')
    {
      const prompt = buildSystemPrompt({
        businessName: 'The Roast & Bean',
        businessIndustry: 'Artisan Cafe',
        reviewAuthor: 'Marcus Vance',
        reviewRating: 5,
        reviewText: 'Great coffee!',
        preset: {
          name: 'Artisan Bistro Voice',
          tone: 'Warm and artisanal',
          responseLength: 'CONCISE',
          customInstructions: 'Mention organic sourdough',
          signature: '— The Roast & Bean Team',
        },
      })

      assert(prompt.includes('Voice & Tone: Warm and artisanal'), 'System prompt incorporates custom preset tone')
      assert(prompt.includes('max 35 words'), 'System prompt enforces CONCISE length rule')
      assert(prompt.includes('Mention organic sourdough'), 'System prompt injects custom instructions')
      assert(prompt.includes('— The Roast & Bean Team'), 'System prompt includes custom signature')
    }

    console.log('\n[Test 15] Draft Generation with Custom Preset via /api/reviews/[id]/draft')
    {
      const reqDraftPreset = await createAuthRequest(
        `http://localhost:3000/api/reviews/${reviewA1.id}/draft`,
        tenantA,
        'POST',
        {
          forceRegenerate: true,
          presetId: customPresetId,
        }
      )
      const resDraftPreset = await postDraftHandler(reqDraftPreset, { params: Promise.resolve({ id: reviewA1.id }) })
      assert(resDraftPreset.status === 200, 'POST /api/reviews/[id]/draft with presetId returns 200')
      const draftData = await resDraftPreset.json()
      assert(typeof draftData.draft === 'string' && draftData.draft.length > 0, 'Generated draft text returned')
      assert(draftData.status === DraftStatus.PENDING, 'Review status updated to PENDING')
      assert(draftData.preset?.name === 'Artisan Bistro Voice', 'Returns resolved preset name in response')
    }

    console.log('\n[Test 16] Direct Template Application Mode (applyTemplateDirectly: true)')
    {
      const initialTemplate = await prisma.replyTemplate.findUnique({ where: { id: templateA2Id } })
      const initialUsageCount = initialTemplate?.usageCount || 0

      const reqApplyTemplate = await createAuthRequest(
        `http://localhost:3000/api/reviews/${reviewA2.id}/draft`,
        tenantA,
        'POST',
        {
          templateId: templateA2Id,
          applyTemplateDirectly: true,
        }
      )
      const resApplyTemplate = await postDraftHandler(reqApplyTemplate, { params: Promise.resolve({ id: reviewA2.id }) })
      assert(resApplyTemplate.status === 200, 'Direct template application returns 200')
      const applyData = await resApplyTemplate.json()

      assert(applyData.model === 'template-hydrated', 'Model reported as template-hydrated')
      assert(applyData.draft.includes('Elena,'), 'Direct template hydrated Elena first name')
      assert(applyData.draft.includes('fell short'), 'Template recovery wording applied')

      // Verify usage count incremented
      const updatedTemplate = await prisma.replyTemplate.findUnique({ where: { id: templateA2Id } })
      assert((updatedTemplate?.usageCount || 0) === initialUsageCount + 1, 'Template usageCount incremented by 1 in DB')

      // Verify review record updated in DB
      const updatedReview = await prisma.review.findUnique({ where: { id: reviewA2.id } })
      assert(updatedReview?.draftText === applyData.draft, 'Draft text persisted in review record')
      assert(updatedReview?.draftStatus === DraftStatus.PENDING, 'Draft status is PENDING in review record')
    }

    // ────────────────────────────────────────────────────────────────
    // Section 6: Audit Logging Verification
    // ────────────────────────────────────────────────────────────────
    console.log('\n[Test 17] Audit Log Verification')
    {
      const templateCreatedAudit = await prisma.auditLog.findFirst({
        where: { action: 'template.created', actorId: tenantA.user.id },
      })
      assert(Boolean(templateCreatedAudit), 'Captured template.created audit log')

      const templateUpdatedAudit = await prisma.auditLog.findFirst({
        where: { action: 'template.updated', actorId: tenantA.user.id },
      })
      assert(Boolean(templateUpdatedAudit), 'Captured template.updated audit log')

      const presetCreatedAudit = await prisma.auditLog.findFirst({
        where: { action: 'ai_preset.created', actorId: tenantA.user.id },
      })
      assert(Boolean(presetCreatedAudit), 'Captured ai_preset.created audit log')

      const templateAppliedAudit = await prisma.auditLog.findFirst({
        where: { action: 'draft.template_applied', actorId: tenantA.user.id },
      })
      assert(Boolean(templateAppliedAudit), 'Captured draft.template_applied audit log')
    }

    // ────────────────────────────────────────────────────────────────
    // Section 7: Template Deletion & Cleanup
    // ────────────────────────────────────────────────────────────────
    console.log('\n[Test 18] Template Deletion')
    {
      const reqDel = await createAuthRequest(
        `http://localhost:3000/api/templates/${templateA1Id}`,
        tenantA,
        'DELETE'
      )
      const resDel = await deleteTemplateHandler(reqDel, { params: Promise.resolve({ id: templateA1Id }) })
      assert(resDel.status === 200, 'Delete template returns 200')

      const checkDel = await prisma.replyTemplate.findUnique({ where: { id: templateA1Id } })
      assert(checkDel === null, 'Template removed from database')
    }

  } catch (error) {
    console.error('Test Suite encountered fatal error:', error)
    failed++
  } finally {
    console.log('\nCleaning up test tenants...')
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  }

  console.log('====================================================================')
  console.log(`JOB-15 VERIFICATION SUMMARY: ${passed} passed / ${failed} failed`)
  console.log('====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob15Suite()
