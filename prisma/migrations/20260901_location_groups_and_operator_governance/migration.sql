-- CreateTable
CREATE TABLE "LocationGroup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationGroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorLocationAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLocationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorGroupAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorGroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationGroup_orgId_idx" ON "LocationGroup"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationGroup_orgId_name_key" ON "LocationGroup"("orgId", "name");

-- CreateIndex
CREATE INDEX "LocationGroupMembership_businessId_idx" ON "LocationGroupMembership"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationGroupMembership_groupId_businessId_key" ON "LocationGroupMembership"("groupId", "businessId");

-- CreateIndex
CREATE INDEX "OperatorLocationAssignment_orgId_userId_idx" ON "OperatorLocationAssignment"("orgId", "userId");

-- CreateIndex
CREATE INDEX "OperatorLocationAssignment_businessId_idx" ON "OperatorLocationAssignment"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorLocationAssignment_userId_businessId_key" ON "OperatorLocationAssignment"("userId", "businessId");

-- CreateIndex
CREATE INDEX "OperatorGroupAssignment_orgId_userId_idx" ON "OperatorGroupAssignment"("orgId", "userId");

-- CreateIndex
CREATE INDEX "OperatorGroupAssignment_groupId_idx" ON "OperatorGroupAssignment"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorGroupAssignment_userId_groupId_key" ON "OperatorGroupAssignment"("userId", "groupId");

-- AddForeignKey
ALTER TABLE "LocationGroup" ADD CONSTRAINT "LocationGroup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationGroupMembership" ADD CONSTRAINT "LocationGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LocationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationGroupMembership" ADD CONSTRAINT "LocationGroupMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLocationAssignment" ADD CONSTRAINT "OperatorLocationAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLocationAssignment" ADD CONSTRAINT "OperatorLocationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLocationAssignment" ADD CONSTRAINT "OperatorLocationAssignment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorGroupAssignment" ADD CONSTRAINT "OperatorGroupAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorGroupAssignment" ADD CONSTRAINT "OperatorGroupAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorGroupAssignment" ADD CONSTRAINT "OperatorGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LocationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
